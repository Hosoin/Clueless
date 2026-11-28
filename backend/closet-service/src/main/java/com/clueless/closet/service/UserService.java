package com.clueless.closet.service;

import com.clueless.closet.repository.UserRepository;
import org.springframework.dao.DataAccessException;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.StandardClaimNames;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;

@Service
public class UserService implements OAuth2UserService<OidcUserRequest, OidcUser> {

    private static final String GOOGLE = "google";
    private final OidcUserService delegate = new OidcUserService();
    private final UserRepository users;

    public UserService(UserRepository users) {
        this.users = users;
        // The optional profile claims come only from the validated ID token.
        delegate.setRetrieveUserInfo(request -> false);
    }

    @Override
    public OidcUser loadUser(OidcUserRequest request) {
        // Spring calls this after validating the ID token and nonce.
        var claims = request.getIdToken().getClaims();
        if (!GOOGLE.equals(request.getClientRegistration().getRegistrationId())
                || !(claims.get("sub") instanceof String subject) || subject.isBlank()) {
            throw new OAuth2AuthenticationException("invalid_oidc_identity");
        }
        String name = textClaim(claims.get(StandardClaimNames.NAME));
        String email = Boolean.TRUE.equals(claims.get(StandardClaimNames.EMAIL_VERIFIED))
                ? textClaim(claims.get(StandardClaimNames.EMAIL)) : null;
        OidcUser oidcUser = delegate.loadUser(request);
        try {
            var user = users.findOrCreate(GOOGLE, subject, name, email);
            return new ClosetOidcUser(oidcUser, user.id(), user.newUser());
        } catch (DataAccessException failure) {
            // Do not propagate SQL or provider identity into the authentication failure.
            throw new OAuth2AuthenticationException("user_binding_failed");
        }
    }

    private static String textClaim(Object value) {
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
