package com.clueless.closet.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Optional;
import java.util.regex.Pattern;

import com.azure.core.http.HttpClient;
import com.azure.core.http.policy.HttpLogDetailLevel;
import com.azure.core.http.policy.HttpLogOptions;
import com.azure.core.util.Context;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClientBuilder;
import com.azure.storage.blob.models.BlobErrorCode;
import com.azure.storage.blob.models.BlobRange;
import com.azure.storage.blob.models.BlobStorageException;
import com.azure.storage.blob.options.BlobDownloadStreamOptions;
import com.azure.storage.blob.sas.BlobSasPermission;
import com.azure.storage.blob.sas.BlobServiceSasSignatureValues;
import com.azure.storage.common.sas.SasProtocol;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.util.StringUtils.hasText;

@Component
public class ClosetPreviewBlobClient {

    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    private static final Duration DOWNLOAD_TIMEOUT = Duration.ofSeconds(10);
    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*");
    private static final String DRAFT_CONTAINER = "closet-drafts";
    // Deployed ML uses uuid4().hex; also accept the canonical hyphenated form without changing the key.
    private static final Pattern DRAFT_KEY = Pattern.compile(DRAFT_CONTAINER
            + "/([0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\\.webp");
    private final BlobContainerClient items;
    private final BlobContainerClient drafts;

    @Autowired
    public ClosetPreviewBlobClient(@Value("${AZURE_STORAGE_CONNECTION_STRING:}") String connectionString,
            @Value("${BLOB_CONTAINER_NAME:}") String itemContainer, @Value("${BLOB_DRAFTS_CONTAINER:}") String draftContainer) {
        this(connectionString, itemContainer, draftContainer, null);
    }

    ClosetPreviewBlobClient(String connectionString, String itemContainer, String draftContainer, HttpClient httpClient) {
        try {
            var client = hasText(connectionString) && (hasText(itemContainer) || hasText(draftContainer))
                    ? new BlobServiceClientBuilder().connectionString(connectionString).httpClient(httpClient)
                            .httpLogOptions(new HttpLogOptions().setLogLevel(HttpLogDetailLevel.NONE)).buildClient()
                    : null;
            items = client != null && hasText(itemContainer) ? client.getBlobContainerClient(itemContainer) : null;
            drafts = client != null && hasText(draftContainer) ? client.getBlobContainerClient(draftContainer) : null;
        } catch (RuntimeException ex) {
            throw new IllegalStateException("Invalid closet preview storage configuration");
        }
    }

    String draftPreviewUrl(String key) {
        var match = DRAFT_KEY.matcher(key);
        if (!match.matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY);
        }
        if (drafts == null || !DRAFT_CONTAINER.equals(drafts.getBlobContainerName())) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
        try {
            var blob = drafts.getBlobClient(match.group(1) + ".webp");
            var url = URI.create(blob.getBlobUrl());
            if (!"https".equalsIgnoreCase(url.getScheme()) || url.getHost() == null || url.getRawQuery() != null
                    || url.getRawUserInfo() != null || url.getRawFragment() != null) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
            }
            var permissions = new BlobSasPermission().setReadPermission(true);
            var sas = new BlobServiceSasSignatureValues(OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5), permissions)
                    .setProtocol(SasProtocol.HTTPS_ONLY).setContentType("image/webp").setCacheControl("no-store");
            String token;
            try {
                token = blob.generateSas(sas);
            } catch (RuntimeException ex) {
                // A container SAS cannot mint narrower service SAS URLs.
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
            }
            var properties = blob.getPropertiesWithResponse(null, DOWNLOAD_TIMEOUT, Context.NONE).getValue();
            if (properties.getBlobSize() <= 0 || properties.getBlobSize() > MAX_IMAGE_BYTES
                    || !"image/webp".equalsIgnoreCase(properties.getContentType())) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY);
            }
            return url.toASCIIString() + "?" + token;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY);
        }
    }

    public Optional<PreviewImage> readPreview(long userId, String key) {
        if (key.length() > 1024 || !KEY.matcher(key).matches()) {
            return Optional.empty();
        }
        BlobContainerClient container;
        var mlKey = DRAFT_KEY.matcher(key);
        boolean mlCrop = mlKey.matches();
        if (mlCrop) {
            // This ownerless key comes only from the DB lookup for the caller's confirmed item.
            container = drafts;
            key = mlKey.group(1) + ".webp";
        } else if (key.startsWith("items/" + userId + "/") || key.startsWith(userId + "/items/")) {
            container = items;
        } else if (key.startsWith(userId + "/drafts/")) {
            container = drafts;
        } else {
            return Optional.empty();
        }
        if (container == null || mlCrop && !DRAFT_CONTAINER.equals(container.getBlobContainerName())) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }

        var buffer = new ByteArrayOutputStream();
        var limited = new OutputStream() {
            @Override
            public void write(int value) throws IOException {
                checkLimit(1);
                buffer.write(value);
            }

            @Override
            public void write(byte[] bytes, int offset, int length) throws IOException {
                checkLimit(length);
                buffer.write(bytes, offset, length);
            }

            private void checkLimit(int length) throws IOException {
                if (length > MAX_IMAGE_BYTES + 1 - buffer.size()) {
                    throw new ImageTooLargeException();
                }
            }
        };
        try {
            var options = new BlobDownloadStreamOptions().setRange(new BlobRange(0, (long) MAX_IMAGE_BYTES + 1));
            container.getBlobClient(key).downloadStreamWithResponse(limited, options, DOWNLOAD_TIMEOUT, Context.NONE);
        } catch (BlobStorageException ex) {
            if (ex.getStatusCode() == 404 && BlobErrorCode.BLOB_NOT_FOUND.equals(ex.getErrorCode())) {
                return Optional.empty();
            }
            if (ex.getStatusCode() == 416 && BlobErrorCode.INVALID_RANGE.equals(ex.getErrorCode())) {
                throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY);
        } catch (UncheckedIOException ex) {
            throw new ResponseStatusException(ex.getCause() instanceof ImageTooLargeException
                    ? HttpStatus.CONTENT_TOO_LARGE : HttpStatus.BAD_GATEWAY);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY);
        }
        if (buffer.size() > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE);
        }
        byte[] bytes = buffer.toByteArray();
        return Optional.of(new PreviewImage(imageType(bytes), bytes));
    }

    // shortcut: signatures identify raster MIME only, decode/re-encode if full file sanitization is required.
    private static MediaType imageType(byte[] bytes) {
        String signature = HexFormat.of().formatHex(bytes, 0, Math.min(bytes.length, 16));
        if (signature.startsWith("89504e470d0a1a0a0000000d49484452")) {
            return MediaType.IMAGE_PNG;
        }
        if (signature.startsWith("ffd8ff")) {
            return MediaType.IMAGE_JPEG;
        }
        if (signature.startsWith("52494646") && signature.length() == 32
                && signature.startsWith("57454250565038", 16)
                && (signature.endsWith("20") || signature.endsWith("4c") || signature.endsWith("58"))) {
            return MediaType.valueOf("image/webp");
        }
        throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }

    private static final class ImageTooLargeException extends IOException {
    }

    public record PreviewImage(MediaType mediaType, byte[] bytes) {
    }
}
