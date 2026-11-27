package com.clueless.closet.controller;

import java.io.IOException;
import java.util.regex.Pattern;

import com.clueless.closet.service.ClosetItemService;
import com.clueless.closet.service.ClosetOidcUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.json.JsonMapper;

@RestController
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true", allowedHeaders = {"Content-Type", "X-CSRF-TOKEN"})
@RequestMapping(path = "/api/closet/items", consumes = MediaType.APPLICATION_JSON_VALUE)
public class ClosetItemController {

    private static final Pattern ID = Pattern.compile("[0-9]{1,19}");
    private static final int MAX_JSON_BYTES = 64 * 1024;
    private final ClosetItemService items;
    private final ObjectReader edits;

    public ClosetItemController(ClosetItemService items, JsonMapper mapper) {
        this.items = items;
        this.edits = mapper.reader().with(DeserializationFeature.FAIL_ON_READING_DUP_TREE_KEY,
                DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    @PostMapping("/{id}/confirm")
    public ResponseEntity<Void> confirm(@AuthenticationPrincipal ClosetOidcUser principal,
            @PathVariable("id") String id, HttpServletRequest request) {
        return edit(principal, id, request, true);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<Void> update(@AuthenticationPrincipal ClosetOidcUser principal,
            @PathVariable("id") String id, HttpServletRequest request) {
        return edit(principal, id, request, false);
    }

    private ResponseEntity<Void> edit(ClosetOidcUser principal, String id, HttpServletRequest request, boolean confirm) {
        if (principal == null || principal.userId() <= 0) {
            return result(HttpStatus.UNAUTHORIZED);
        }
        if (!ID.matcher(id).matches()) {
            return result(HttpStatus.BAD_REQUEST);
        }
        try {
            long itemId = Long.parseLong(id);
            if (itemId == 0) {
                return result(HttpStatus.BAD_REQUEST);
            }
            byte[] body = request.getInputStream().readNBytes(MAX_JSON_BYTES + 1);
            if (body.length > MAX_JSON_BYTES) {
                return result(HttpStatus.CONTENT_TOO_LARGE);
            }
            var input = edits.readTree(body);
            if (confirm) {
                items.confirm(principal.userId(), itemId, input);
            } else {
                items.update(principal.userId(), itemId, input);
            }
            return result(HttpStatus.NO_CONTENT);
        } catch (NumberFormatException | JacksonException | IOException ex) {
            return result(HttpStatus.BAD_REQUEST);
        } catch (DataAccessException | TransactionException ex) {
            return result(HttpStatus.SERVICE_UNAVAILABLE);
        } catch (ResponseStatusException ex) {
            return result(HttpStatus.valueOf(ex.getStatusCode().value()));
        }
    }

    private static ResponseEntity<Void> result(HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).build();
    }
}
