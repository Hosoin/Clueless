package com.clueless.closet.controller;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import com.clueless.closet.repository.UserRepository;
import com.clueless.closet.service.ClosetOidcUser;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.json.JsonMapper;

@RestController
public class AuthController {

    private static final Set<String> STYLES = Set.of("미니멀", "캐주얼", "클래식", "페미닌", "스트리트", "스포티");
    private static final int MAX_JSON_BYTES = 64 * 1024;
    // Match JavaScript String.trim(), including NBSP and BOM.
    private static final String JS_SPACE = "[\\p{Zs}\\t-\\r\\u2028\\u2029\\uFEFF]";
    private static final Pattern JS_TRIM = Pattern.compile("\\A" + JS_SPACE + "+|" + JS_SPACE + "+\\z");

    private final UserRepository users;
    private final ObjectReader json;

    public AuthController(UserRepository users, JsonMapper mapper) {
        this.users = users;
        this.json = mapper.reader().with(DeserializationFeature.FAIL_ON_READING_DUP_TREE_KEY,
                DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    // 로그인한 유저 정보 조회
    @GetMapping("/api/auth/me")
    public ResponseEntity<MeResponse> me(@AuthenticationPrincipal ClosetOidcUser principal, CsrfToken csrfToken) {
        if (principal == null || principal.userId() <= 0) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            return users.findProfileById(principal.userId())
                    .map(user -> ResponseEntity.ok()
                            .header(csrfToken.getHeaderName(), csrfToken.getToken())
                            .body(new MeResponse(Long.toString(user.id()), user.userName(), user.nickName(), user.email(),
                                    user.preferredStyles())))
                    .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
        } catch (DataAccessException ex) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    @PatchMapping(path = "/api/auth/me", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> updateProfile(@AuthenticationPrincipal ClosetOidcUser principal,
            HttpServletRequest request) {
        if (principal == null || principal.userId() <= 0) {
            return result(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            var body = request.getInputStream().readNBytes(MAX_JSON_BYTES + 1);
            if (body.length > MAX_JSON_BYTES) {
                return result(HttpStatus.CONTENT_TOO_LARGE).build();
            }
            var input = json.readTree(body);
            if (!input.isObject() || input.isEmpty() || input.propertyNames().stream()
                    .anyMatch(field -> !field.equals("nickName") && !field.equals("preferredStyles"))) {
                return result(HttpStatus.BAD_REQUEST).build();
            }
            String nickName = null;
            var nick = input.get("nickName");
            if (nick != null) {
                if (!nick.isString()) {
                    return result(HttpStatus.BAD_REQUEST).build();
                }
                nickName = JS_TRIM.matcher(nick.stringValue()).replaceAll("");
                if (nickName.length() < 2 || nickName.length() > 12
                        || nickName.codePoints().anyMatch(cp -> cp == 0 || cp >= 0xD800 && cp <= 0xDFFF)) {
                    return result(HttpStatus.BAD_REQUEST).build();
                }
            }
            List<String> preferredStyles = null;
            var styles = input.get("preferredStyles");
            if (styles != null) {
                if (!styles.isArray() || styles.size() > 3) {
                    return result(HttpStatus.BAD_REQUEST).build();
                }
                preferredStyles = new ArrayList<>();
                for (var style : styles) {
                    if (!style.isString() || !STYLES.contains(style.stringValue())
                            || preferredStyles.contains(style.stringValue())) {
                        return result(HttpStatus.BAD_REQUEST).build();
                    }
                    preferredStyles.add(style.stringValue());
                }
            }
            return result(users.updateProfile(principal.userId(), nickName, preferredStyles)
                    ? HttpStatus.NO_CONTENT : HttpStatus.UNAUTHORIZED).build();
        } catch (JacksonException | IOException ex) {
            return result(HttpStatus.BAD_REQUEST).build();
        } catch (DataAccessException ex) {
            return result(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    private static ResponseEntity.BodyBuilder result(HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore());
    }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    @JsonPropertyOrder({"id", "userName", "nickName", "email", "preferredStyles"})
    public record MeResponse(String id, String userName, String nickName, String email,
                             List<String> preferredStyles) {
    }
}
