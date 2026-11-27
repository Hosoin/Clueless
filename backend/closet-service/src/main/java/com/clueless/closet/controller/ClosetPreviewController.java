package com.clueless.closet.controller;

import java.util.regex.Pattern;

import com.clueless.closet.repository.ClosetItemRepository;
import com.clueless.closet.service.ClosetOidcUser;
import com.clueless.closet.service.ClosetPreviewBlobClient;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ClosetPreviewController {

    private static final Pattern ID = Pattern.compile("[0-9]{1,19}");
    private final ClosetItemRepository items;
    private final ClosetPreviewBlobClient blobs;

    public ClosetPreviewController(ClosetItemRepository items, ClosetPreviewBlobClient blobs) {
        this.items = items;
        this.blobs = blobs;
    }

    @GetMapping("/api/closet/preview")
    public ResponseEntity<byte[]> preview(@AuthenticationPrincipal ClosetOidcUser principal, HttpServletRequest request) {
        if (principal == null || principal.userId() <= 0) {
            return result(HttpStatus.UNAUTHORIZED).build();
        }
        String[] values = request.getParameterValues("id");
        if (values == null || values.length != 1 || !ID.matcher(values[0]).matches()) {
            return result(HttpStatus.BAD_REQUEST).build();
        }
        long itemId;
        try {
            itemId = Long.parseLong(values[0]);
        } catch (NumberFormatException ex) {
            return result(HttpStatus.BAD_REQUEST).build();
        }
        if (itemId == 0) {
            return result(HttpStatus.BAD_REQUEST).build();
        }

        long userId = principal.userId();
        try {
            return items.findImageBlob(userId, itemId)
                    .flatMap(key -> blobs.readPreview(userId, key))
                    .map(image -> result(HttpStatus.OK).contentType(image.mediaType()).body(image.bytes()))
                    .orElseGet(() -> result(HttpStatus.NOT_FOUND).build());
        } catch (DataAccessException ex) {
            return result(HttpStatus.SERVICE_UNAVAILABLE).build();
        } catch (ResponseStatusException ex) {
            return result(HttpStatus.valueOf(ex.getStatusCode().value())).build();
        }
    }

    private static ResponseEntity.BodyBuilder result(HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff");
    }
}
