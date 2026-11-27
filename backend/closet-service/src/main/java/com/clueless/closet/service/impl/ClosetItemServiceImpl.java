// 옷장 아이템의 업무 규칙을 처리하는 서비스 구현체입니다.
package com.clueless.closet.service.impl;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

import com.clueless.closet.repository.ClosetItemRepository;
import com.clueless.closet.repository.ClosetItemRepository.EditField;
import com.clueless.closet.service.ClosetColor;
import com.clueless.closet.service.ClosetItemService;

@Service
public class ClosetItemServiceImpl implements ClosetItemService {

    private static final Pattern HEX = Pattern.compile("#[0-9A-Fa-f]{6}");
    private final ClosetItemRepository items;

    public ClosetItemServiceImpl(ClosetItemRepository items) {
        this.items = items;
    }

    @Override
    public ItemList list(long userId, String category, String color, String recommendYn) {
        var standardColor = ClosetColor.fromLabel(color);
        if ((category != null && !CATEGORIES.contains(category))
                || (color != null && (standardColor == null || !color.equals(standardColor.label())))
                || (recommendYn != null && !validRecommendYn(recommendYn))) {
            throw badRequest();
        }
        var summaries = items.findList(userId, category, standardColor == null ? List.of() : standardColor.storedLabels(),
                        recommendYn).stream()
                .map(row -> new ItemSummary(Long.toString(row.id()), row.name(), previewUrl(row.id(), row.hasImage())))
                .toList();
        return new ItemList(summaries.size(), summaries);
    }

    @Override
    public ItemDetail detail(long userId, long itemId) {
        var row = items.findDetail(userId, itemId).orElseThrow(ClosetItemServiceImpl::notFound);
        return new ItemDetail(Long.toString(row.id()), row.name(), row.category(), row.subcategory(), row.color(), row.colorHex(),
                row.styles(), row.tags(), row.memo(), row.recommendYn(), previewUrl(row.id(), row.hasImage()));
    }

    private static String previewUrl(long id, boolean hasImage) {
        return hasImage ? "/api/closet/preview?id=" + id : null;
    }

    @Override
    public void delete(long userId, long itemId) {
        if (!items.hide(userId, itemId)) {
            throw notFound();
        }
    }

    @Override
    @Transactional
    public void confirm(long userId, long itemId, JsonNode input) {
        var edits = validatedEdits(input, true);
        var draft = items.lockDraft(userId, itemId).orElseThrow(ClosetItemServiceImpl::notFound);
        String category = (String) edits.getOrDefault(EditField.CATEGORY, draft.category());
        if (category == null || !CATEGORIES.contains(category)) {
            throw badRequest();
        }
        if (!edits.containsKey(EditField.COLOR)) {
            String color = requiredColor(draft.color());
            if (!color.equals(draft.color())) {
                edits.put(EditField.COLOR, color);
            }
        }
        write(userId, itemId, true, edits);
    }

    @Override
    public void update(long userId, long itemId, JsonNode input) {
        write(userId, itemId, false, validatedEdits(input, false));
    }

    private void write(long userId, long itemId, boolean confirm, Map<EditField, Object> edits) {
        if (!items.edit(userId, itemId, confirm, edits)) {
            throw notFound();
        }
    }

    private static Map<EditField, Object> validatedEdits(JsonNode input, boolean confirm) {
        if (input == null || !input.isObject()) {
            throw badRequest();
        }
        var edits = new EnumMap<EditField, Object>(EditField.class);
        for (var entry : input.properties()) {
            JsonNode node = entry.getValue();
            switch (entry.getKey()) {
                case "name" -> {
                    String name = label(node);
                    if (name.codePointCount(0, name.length()) > 50) {
                        throw badRequest();
                    }
                    edits.put(EditField.NAME, name);
                }
                case "category" -> {
                    String category = label(node);
                    if (!CATEGORIES.contains(category)) {
                        throw badRequest();
                    }
                    edits.put(EditField.CATEGORY, category);
                }
                case "sub_category" -> edits.put(EditField.SUBCATEGORY, node.isNull() ? null : label(node));
                case "color" -> edits.put(EditField.COLOR, requiredColor(text(node)));
                case "styles" -> edits.put(EditField.STYLES, labels(node));
                case "tags" -> edits.put(EditField.TAGS, labels(node));
                case "memo" -> edits.put(EditField.MEMO, text(node));
                case "hex" -> {
                    String hex = node.isNull() ? null : text(node);
                    if (hex != null && !HEX.matcher(hex).matches()) {
                        throw badRequest();
                    }
                    edits.put(EditField.COLOR_HEX, hex);
                }
                case "recommend_yn" -> {
                    String value = text(node);
                    if (confirm || !validRecommendYn(value)) {
                        throw badRequest();
                    }
                    edits.put(EditField.RECOMMEND_YN, value);
                }
                default -> throw badRequest();
            }
        }
        return edits;
    }

    private static String requiredColor(String value) {
        var color = ClosetColor.fromLabel(value);
        if (color == null) {
            throw badRequest();
        }
        return color.label();
    }

    private static boolean validRecommendYn(String value) {
        return value.equals("Y") || value.equals("N");
    }

    private static String[] labels(JsonNode node) {
        if (!node.isArray()) {
            throw badRequest();
        }
        return node.valueStream().map(ClosetItemServiceImpl::label).toArray(String[]::new);
    }

    private static String label(JsonNode node) {
        String value = text(node).strip();
        if (!validLabel(value)) {
            throw badRequest();
        }
        return value;
    }

    private static boolean validLabel(String value) {
        return value != null && !value.isBlank() && value.codePoints().noneMatch(Character::isISOControl);
    }

    private static String text(JsonNode node) {
        if (!node.isString() || node.stringValue().codePoints().anyMatch(cp -> cp == 0 || cp >= 0xD800 && cp <= 0xDFFF)) {
            throw badRequest();
        }
        return node.stringValue();
    }

    private static ResponseStatusException badRequest() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST);
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND);
    }
}
