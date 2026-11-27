package com.clueless.closet.service;

import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.clueless.closet.repository.ClosetItemRepository;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import static com.clueless.closet.service.ClosetItemService.CATEGORIES;

@Service
public class ClosetDraftService {

    private static final Set<String> STYLES = Set.of("미니멀", "클래식", "스트리트", "캐주얼", "페미닌", "스포티");
    private static final Set<String> TRANSPORT_FIELDS = Set.of("cropblob", "imageblob", "previewimg", "previewurl",
            "imageurl", "cropurl", "image", "cropimage", "imagebytes", "cropbytes", "signature", "sig", "apikey", "accountkey",
            "connectionstring", "authorization");
    private static final int MAX_NAME_CHARS = 50;
    private final GarmentAnalysisClient ml;
    private final ClosetPreviewBlobClient blobs;
    private final ClosetItemRepository items;

    public ClosetDraftService(GarmentAnalysisClient ml, ClosetPreviewBlobClient blobs, ClosetItemRepository items) {
        this.ml = ml;
        this.blobs = blobs;
        this.items = items;
    }

    public Object analyze(long userId, byte[] bytes, String subtype) {
        var result = ml.analyze(bytes, subtype);
        if (result.analysis() == null) {
            throw new ResponseStatusException(result.status());
        }
        var analysis = result.analysis();
        if (analysis.path("retake").booleanValue()) {
            return new Retake(true);
        }

        String crop = text(analysis.path("crop_blob"));
        String category = prediction(analysis.path("category"));
        if (crop == null || category == null || !CATEGORIES.contains(category)) {
            throw badAnalysis();
        }
        String subcategory = prediction(analysis.path("subcategory"));
        String rawColor = prediction(analysis.path("color_name"));
        String hex = swatch(analysis.path("colors"), rawColor);
        var standardColor = ClosetColor.fromLabel(rawColor);
        String color = standardColor == null ? null : standardColor.label();
        List<String> styles = styles(analysis.path("style"));
        String print = prediction(analysis.path("print"));
        String sleeve = prediction(analysis.path("sleeve"));
        String name = Stream.of(color, "무지".equals(print) ? null : print, sleeve,
                        subcategory == null ? category : subcategory)
                .filter(value -> value != null).collect(Collectors.joining(" "));
        // PostgreSQL varchar counts Unicode characters, not UTF-16 code units.
        int end = name.offsetByCodePoints(0, Math.min(MAX_NAME_CHARS, name.codePointCount(0, name.length())));
        name = name.substring(0, end).stripTrailing();

        String previewImg = blobs.draftPreviewUrl(crop);
        stripTransport(analysis);
        // Missing color is not a prediction; only the legacy NOT NULL column needs a placeholder.
        long id = items.insertDraft(userId, name, category, subcategory, color == null ? "" : color, hex,
                styles, analysis.toString(), crop);
        return new Draft(Long.toString(id), previewImg, category, subcategory, color, hex, styles, name, false);
    }

    private static String prediction(JsonNode node) {
        return node.isMissingNode() || node.isNull() ? null : requiredText(node.path("name"));
    }

    private static String text(JsonNode node) {
        return node.isString() && !node.stringValue().isBlank()
                && !isTransportValue(node)
                && node.stringValue().codePoints().noneMatch(cp -> Character.isISOControl(cp) || cp >= 0xD800 && cp <= 0xDFFF)
                ? node.stringValue() : null;
    }

    private static String requiredText(JsonNode node) {
        String value = text(node);
        if (value == null) {
            throw badAnalysis();
        }
        return value.strip();
    }

    private static List<String> styles(JsonNode style) {
        if (style.isMissingNode() || style.isNull()) {
            return List.of();
        }
        var tags = style.path("tags");
        if (!tags.isArray()) {
            throw badAnalysis();
        }
        var styles = new ArrayList<String>();
        for (var tag : tags) {
            String value = requiredText(tag);
            if (!STYLES.contains(value) || styles.contains(value)) {
                throw badAnalysis();
            }
            styles.add(value);
        }
        return styles;
    }

    private static String swatch(JsonNode colors, String color) {
        if (colors.isMissingNode() || colors.isNull()) {
            return null;
        }
        if (!colors.isArray()) {
            throw badAnalysis();
        }
        String swatch = null;
        for (var entry : colors) {
            String label = requiredText(entry.path("name"));
            var rgb = entry.path("rgb");
            if (!rgb.isArray() || rgb.size() != 3) {
                throw badAnalysis();
            }
            var channels = new byte[3];
            for (int i = 0; i < channels.length; i++) {
                var value = rgb.get(i);
                if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() < 0 || value.intValue() > 255) {
                    throw badAnalysis();
                }
                channels[i] = (byte) value.intValue();
            }
            if (label.equals(color) && swatch == null) {
                swatch = HexFormat.of().withUpperCase().formatHex(channels);
            }
        }
        return swatch == null ? null : "#" + swatch;
    }

    private static void stripTransport(JsonNode node) {
        if (node instanceof ObjectNode object) {
            for (String key : List.copyOf(object.propertyNames())) {
                String normalized = key.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
                var value = object.get(key);
                if (TRANSPORT_FIELDS.contains(normalized) || normalized.contains("base64") || normalized.endsWith("sas")
                        || normalized.startsWith("sas") || isTransportValue(value)) {
                    object.remove(key);
                } else {
                    stripTransport(value);
                }
            }
        } else if (node instanceof ArrayNode array) {
            for (int i = array.size() - 1; i >= 0; i--) {
                var value = array.get(i);
                if (isTransportValue(value)) {
                    array.remove(i);
                } else {
                    stripTransport(value);
                }
            }
        }
    }

    private static boolean isTransportValue(JsonNode node) {
        if (!node.isString()) {
            return false;
        }
        String value = node.stringValue().stripLeading().toLowerCase(Locale.ROOT);
        return value.startsWith("data:image/") || value.startsWith("data:application/octet-stream")
                || value.startsWith("sig=") || value.contains("?sig=") || value.contains("&sig=");
    }

    private static ResponseStatusException badAnalysis() {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY);
    }

    public record Retake(boolean retake) { }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Draft(String id, String previewImg, String category, @JsonProperty("sub_category") String subcategory,
            String color, String hex, List<String> styles, String name, boolean retake) { }
}
