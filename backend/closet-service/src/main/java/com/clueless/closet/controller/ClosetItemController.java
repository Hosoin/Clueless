package com.clueless.closet.controller;

import java.io.IOException;
import java.util.regex.Pattern;

import com.clueless.closet.service.ClosetItemService;
import com.clueless.closet.service.ClosetItemService.ItemDetail;
import com.clueless.closet.service.ClosetItemService.ItemList;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
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
@RequestMapping("/api/closet/items")
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

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ItemList> list(@AuthenticationPrincipal ClosetOidcUser principal, HttpServletRequest request) {
        if (principal == null || principal.userId() <= 0) {
            return result(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            return result(HttpStatus.OK).body(items.list(principal.userId(), filter(request, "category"),
                    filter(request, "color"), filter(request, "recommend_yn")));
        } catch (DataAccessException | TransactionException ex) {
            return result(HttpStatus.SERVICE_UNAVAILABLE).build();
        } catch (ResponseStatusException ex) {
            return result(HttpStatus.valueOf(ex.getStatusCode().value())).build();
        }
    }

    private static String filter(HttpServletRequest request, String name) {
        String[] values = request.getParameterValues(name);
        if (values == null) {
            return null;
        }
        if (values.length != 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return values[0];
    }

    @GetMapping(path = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ItemDetail> detail(@AuthenticationPrincipal ClosetOidcUser principal,
            @PathVariable("id") String id) {
        return handle(principal, id, (userId, itemId) -> result(HttpStatus.OK).body(items.detail(userId, itemId)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal ClosetOidcUser principal,
            @PathVariable("id") String id) {
        return handle(principal, id, (userId, itemId) -> {
            items.delete(userId, itemId);
            return result(HttpStatus.NO_CONTENT).build();
        });
    }

    @PostMapping(path = "/{id}/confirm", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> confirm(@AuthenticationPrincipal ClosetOidcUser principal,
            @PathVariable("id") String id, HttpServletRequest request) {
        return edit(principal, id, request, true);
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> update(@AuthenticationPrincipal ClosetOidcUser principal,
            @PathVariable("id") String id, HttpServletRequest request) {
        return edit(principal, id, request, false);
    }

    private ResponseEntity<Void> edit(ClosetOidcUser principal, String id, HttpServletRequest request, boolean confirm) {
        return handle(principal, id, (userId, itemId) -> {
            byte[] body = request.getInputStream().readNBytes(MAX_JSON_BYTES + 1);
            if (body.length > MAX_JSON_BYTES) {
                return result(HttpStatus.CONTENT_TOO_LARGE).build();
            }
            var input = edits.readTree(body);
            if (confirm) {
                items.confirm(userId, itemId, input);
            } else {
                items.update(userId, itemId, input);
            }
            return result(HttpStatus.NO_CONTENT).build();
        });
    }

    private static <T> ResponseEntity<T> handle(ClosetOidcUser principal, String id, ItemAction<T> action) {
        if (principal == null || principal.userId() <= 0) {
            return result(HttpStatus.UNAUTHORIZED).build();
        }
        if (!ID.matcher(id).matches()) {
            return result(HttpStatus.BAD_REQUEST).build();
        }
        try {
            long itemId = Long.parseLong(id);
            return itemId == 0 ? result(HttpStatus.BAD_REQUEST).build() : action.run(principal.userId(), itemId);
        } catch (NumberFormatException | JacksonException | IOException ex) {
            return result(HttpStatus.BAD_REQUEST).build();
        } catch (DataAccessException | TransactionException ex) {
            return result(HttpStatus.SERVICE_UNAVAILABLE).build();
        } catch (ResponseStatusException ex) {
            return result(HttpStatus.valueOf(ex.getStatusCode().value())).build();
        }
    }

    private interface ItemAction<T> {
        ResponseEntity<T> run(long userId, long itemId) throws IOException;
    }

    private static ResponseEntity.BodyBuilder result(HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore());
    }
}
