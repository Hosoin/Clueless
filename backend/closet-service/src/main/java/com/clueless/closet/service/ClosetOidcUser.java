package com.clueless.closet.service;

import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

public final class ClosetOidcUser extends DefaultOidcUser {

    private final long userId;

    ClosetOidcUser(OidcUser oidcUser, long userId) {
        super(oidcUser.getAuthorities(), oidcUser.getIdToken(), oidcUser.getUserInfo());
        this.userId = userId;
    }

    public long userId() {
        return userId;
    }

    @Override
    public String toString() {
        return "ClosetOidcUser";
    }
}
