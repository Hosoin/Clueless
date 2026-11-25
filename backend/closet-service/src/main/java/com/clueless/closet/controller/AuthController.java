package com.clueless.closet.controller;

import com.clueless.closet.repository.UserRepository;
import com.clueless.closet.service.ClosetOidcUser;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {

    private final UserRepository users;

    public AuthController(UserRepository users) {
        this.users = users;
    }

    // 로그인한 유저 정보 조회
    @GetMapping("/api/auth/me")
    public ResponseEntity<MeResponse> me(@AuthenticationPrincipal ClosetOidcUser principal, CsrfToken csrfToken) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return users.findProfileById(principal.userId())
                .map(user -> ResponseEntity.ok()
                        .header(csrfToken.getHeaderName(), csrfToken.getToken())
                        .body(new MeResponse(Long.toString(user.id()), user.userName(), user.nickName(), user.email())))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    @JsonPropertyOrder({"id", "userName", "nickName", "email"})
    public record MeResponse(String id, String userName, String nickName, String email) {
    }
}
