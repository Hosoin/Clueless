package com.clueless.closet.service;

import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

public final class ClosetOidcUser extends DefaultOidcUser {

    private final long userId;
    private final boolean newUser;

    ClosetOidcUser(OidcUser oidcUser, long userId, boolean newUser) {
        super(oidcUser.getAuthorities(), oidcUser.getIdToken(), oidcUser.getUserInfo());
        this.userId = userId;
        this.newUser = newUser;
    }

    public long userId() {
        return userId;
    }

    public boolean newUser() {
        return newUser;
    }

    @Override
    public String toString() {
        return "ClosetOidcUser";
    }
}
