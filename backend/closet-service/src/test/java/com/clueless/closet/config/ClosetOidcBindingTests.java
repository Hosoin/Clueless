package com.clueless.closet.config;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.clueless.closet.repository.UserRepository;
import com.clueless.closet.repository.UserRepository.UserProfile;
import com.clueless.closet.service.ClosetOidcUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenValidator;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.endpoint.OAuth2AccessTokenResponse;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoderFactory;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:postgresql://localhost:1/binding_test",
        "spring.datasource.username=binding_test", "spring.datasource.password=synthetic",
        "DB_CA_CERT=synthetic CA.pem",
        "GOOGLE_CLIENT_ID=synthetic-client-id", "GOOGLE_CLIENT_SECRET=synthetic-client-secret"
})
class ClosetOidcBindingTests {

    private static final long USER_ID = 5_000_000_000L;
    private static final long SECOND_USER_ID = 9_007_199_254_740_993L;
    private static final String SUBJECT = "verified-google-sub";
    private static final String SECOND_SUBJECT = "second-google-sub";
    private static final String ME = "/api/auth/me";
    private static final String LOGOUT = "/api/auth/logout";
    private static final String CSRF_HEADER = "X-CSRF-TOKEN";
    private static final String NAME = "Synthetic Name";
    private static final String EMAIL = "claim@example.invalid";
    private static final String SECURITY_CONTEXT = HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY;

    @Autowired
    private FilterChainProxy security;

    @MockitoBean
    private UserRepository users;

    @TestBean(enforceOverride = true)
    private JwtDecoderFactory<ClientRegistration> oidcIdTokenDecoderFactory;

    static JwtDecoderFactory<ClientRegistration> oidcIdTokenDecoderFactory() {
        return registration -> {
            var decoder = NimbusJwtDecoder.withPublicKey((RSAPublicKey) SyntheticOidc.key.getPublic()).build();
            decoder.setClaimSetConverter(SecurityConfig.idTokenClaimConverter());
            decoder.setJwtValidator(new OidcIdTokenValidator(registration));
            return decoder;
        };
    }

    private MockMvc mvc;

    @BeforeEach
    void setupMvc(@Autowired WebApplicationContext context) {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
    }

    @Test
    void meReturnsExactlyTheFourProfileFieldsForTheSessionUser() throws Exception {
        when(users.findOrCreateId("google", SUBJECT, NAME, EMAIL)).thenReturn(USER_ID);
        when(users.findOrCreateId("google", SECOND_SUBJECT, NAME, EMAIL)).thenReturn(SECOND_USER_ID);
        when(users.findProfileById(USER_ID)).thenReturn(Optional.of(
                new UserProfile(USER_ID, "Stored Name", "포근한여우1234", "stored@example.invalid")));
        when(users.findProfileById(SECOND_USER_ID)).thenReturn(Optional.of(new UserProfile(SECOND_USER_ID, null, null, null)));
        var first = login("valid");
        var second = login("second-user");

        mvc.perform(get(ME).session(first).param("userId", Long.toString(SECOND_USER_ID))
                        .param("id", Long.toString(SECOND_USER_ID)).param("sub", SECOND_SUBJECT))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(content().json("""
                        {"id":"5000000000","userName":"Stored Name","nickName":"포근한여우1234","email":"stored@example.invalid"}
                        """, JsonCompareMode.STRICT))
                .andExpect(result -> assertThat(JsonMapper.shared().readTree(result.getResponse().getContentAsByteArray())
                        .propertyNames()).containsExactly("id", "userName", "nickName", "email"));
        mvc.perform(get(ME).session(second).param("userId", Long.toString(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"id":"9007199254740993","userName":null,"nickName":null,"email":null}
                        """, JsonCompareMode.STRICT));
        verify(users).findProfileById(USER_ID);
        verify(users).findProfileById(SECOND_USER_ID);
    }

    @Test
    void meRejectsAnonymousRequestsAndSessionsWhoseUserIsMissing() throws Exception {
        mvc.perform(get(ME)).andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().doesNotExist(CSRF_HEADER));
        verifyNoInteractions(users);

        when(users.findOrCreateId("google", SUBJECT, NAME, EMAIL)).thenReturn(USER_ID);
        when(users.findProfileById(USER_ID)).thenReturn(Optional.empty());
        mvc.perform(get(ME).session(login("valid"))).andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().doesNotExist(CSRF_HEADER))
                .andExpect(content().string(""));
        verify(users).findProfileById(USER_ID);
    }

    @Test
    void onlyPostWithTheSameSessionsCsrfTokenLogsOut() throws Exception {
        when(users.findOrCreateId("google", SUBJECT, NAME, EMAIL)).thenReturn(USER_ID);
        when(users.findProfileById(USER_ID)).thenReturn(Optional.of(new UserProfile(USER_ID, null, null, null)));
        var session = login("valid");
        var otherSession = login("valid");
        String token = readCsrfToken(session);
        String otherToken = readCsrfToken(otherSession);

        mvc.perform(post(LOGOUT).session(session)).andExpect(status().isForbidden());
        mvc.perform(post(LOGOUT).session(session).header(CSRF_HEADER, "invalid"))
                .andExpect(status().isForbidden());
        mvc.perform(post(LOGOUT).session(session).header(CSRF_HEADER, otherToken))
                .andExpect(status().isForbidden());
        mvc.perform(get(LOGOUT).session(session).header(CSRF_HEADER, token)).andExpect(status().isNotFound());
        assertThat(session.isInvalid()).isFalse();
        mvc.perform(get(ME).session(session)).andExpect(status().isOk());

        mvc.perform(post(LOGOUT).session(session).header(CSRF_HEADER, token))
                .andExpect(status().isNoContent())
                .andExpect(header().doesNotExist(HttpHeaders.LOCATION))
                .andExpect(content().string(""));
        assertThat(session.isInvalid()).isTrue();
        mvc.perform(get(ME)).andExpect(status().isUnauthorized());
        mvc.perform(get(ME).session(otherSession)).andExpect(status().isOk());
    }

    private String readCsrfToken(MockHttpSession session) throws Exception {
        var response = mvc.perform(get(ME).session(session)).andExpect(status().isOk()).andReturn().getResponse();
        String token = response.getHeader(CSRF_HEADER);
        assertThat(token).isNotBlank();
        return token;
    }

    private MockHttpSession login(String code) throws Exception {
        var session = new MockHttpSession();
        var response = callback(session, code);
        assertThat(response.getStatus()).isEqualTo(302);
        assertThat(response.getHeader(HttpHeaders.LOCATION)).isEqualTo("http://localhost:5173/home");
        return session;
    }

    @Test
    void bindsTheVerifiedSubjectBeforeCompletingLogin() throws Exception {
        when(users.findOrCreateId("google", SUBJECT, NAME, EMAIL)).thenReturn(USER_ID);

        for (int attempt = 0; attempt < 2; attempt++) {
            var session = new MockHttpSession();
            var response = callback(session, "valid");
            assertThat(response.getStatus()).isEqualTo(302);
            assertThat(response.getHeader(HttpHeaders.LOCATION)).isEqualTo("http://localhost:5173/home");
            var context = (SecurityContext) session.getAttribute(SECURITY_CONTEXT);
            assertThat(context.getAuthentication().isAuthenticated()).isTrue();
            assertThat(context.getAuthentication().getPrincipal()).isInstanceOfSatisfying(ClosetOidcUser.class, user -> {
                assertThat(user.userId()).isEqualTo(USER_ID);
                assertThat(user.getAttributes()).doesNotContainKey("userId");
            });
        }

        verify(users, times(2)).findOrCreateId("google", SUBJECT, NAME, EMAIL);
    }

    @ParameterizedTest
    @CsvSource({
            "unverified-email, Synthetic Name,",
            "missing-verification, Synthetic Name,",
            "string-verification, Synthetic Name,",
            "missing-email, Synthetic Name,",
            "missing-name, , claim@example.invalid",
            "missing-profile, ,",
            "invalid-profile, ,"
    })
    void logsInWithoutOptionalClaims(String code, String expectedName, String expectedEmail) throws Exception {
        when(users.findOrCreateId("google", SUBJECT, expectedName, expectedEmail)).thenReturn(USER_ID);
        var session = new MockHttpSession();

        var response = callback(session, code);

        assertThat(response.getHeader(HttpHeaders.LOCATION)).isEqualTo("http://localhost:5173/home");
        var context = (SecurityContext) session.getAttribute(SECURITY_CONTEXT);
        assertThat(context.getAuthentication().isAuthenticated()).isTrue();
        verify(users).findOrCreateId("google", SUBJECT, expectedName, expectedEmail);
    }

    @ParameterizedTest
    @ValueSource(strings = {"wrong-nonce", "wrong-signature"})
    void rejectsInvalidOidcCallbacksBeforeAccessingTheDatabase(String code) throws Exception {
        var session = new MockHttpSession();
        assertThat(callback(session, code).getStatus()).isEqualTo(401);
        assertThat(session.getAttribute(SECURITY_CONTEXT)).isNull();
        verifyNoInteractions(users);
    }

    @Test
    void databaseFailureDoesNotCompleteLoginOrExposeDetails() throws Exception {
        when(users.findOrCreateId("google", SUBJECT, NAME, EMAIL))
                .thenThrow(new DataAccessResourceFailureException("synthetic DB detail"));
        var session = new MockHttpSession();
        var response = callback(session, "valid");

        verify(users).findOrCreateId("google", SUBJECT, NAME, EMAIL);
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).isEmpty();
        assertThat(response.getRedirectedUrl()).isNull();
        assertThat(session.getAttribute(SECURITY_CONTEXT)).isNull();
    }

    private MockHttpServletResponse callback(MockHttpSession session, String code) throws Exception {
        var start = new MockHttpServletRequest("GET", "/oauth2/authorization/google");
        start.setSession(session);
        var redirect = applySecurity(start);
        assertThat(redirect.getStatus()).isEqualTo(302);
        var params = UriComponentsBuilder.fromUriString(redirect.getRedirectedUrl()).build().getQueryParams();
        var callback = new MockHttpServletRequest("GET", "/login/oauth2/code/google");
        callback.setSession(session);
        callback.addParameter("state", UriUtils.decode(params.getFirst("state"), StandardCharsets.UTF_8));
        callback.addParameter("code", code);
        callback.addParameter("auth_provider", "untrusted-provider");
        callback.addParameter("sub", "untrusted-sub");
        callback.addParameter("name", "untrusted-name");
        callback.addParameter("email", "request@example.invalid");
        callback.addParameter("email_verified", "true");
        callback.addParameter("redirect", "https://untrusted.example.invalid/");
        return applySecurity(callback);
    }

    private MockHttpServletResponse applySecurity(MockHttpServletRequest request) throws Exception {
        var response = new MockHttpServletResponse();
        security.doFilter(request, response, (req, res) -> { throw new AssertionError("Expected security to handle OIDC"); });
        return response;
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class SyntheticOidc {

        private static final KeyPair key = rsaKey();
        private final KeyPair untrustedKey = rsaKey();

        @Bean
        OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenClient() {
            return request -> {
                var registration = request.getClientRegistration();
                var exchange = request.getAuthorizationExchange();
                var code = exchange.getAuthorizationResponse().getCode();
                var nonce = exchange.getAuthorizationRequest().getAdditionalParameters().get("nonce");
                var signingKey = "wrong-signature".equals(code) ? untrustedKey : key;
                var encoder = NimbusJwtEncoder.withKeyPair((RSAPublicKey) signingKey.getPublic(),
                        (RSAPrivateKey) signingKey.getPrivate()).build();
                var now = Instant.now();
                var claims = JwtClaimsSet.builder()
                        .issuer(registration.getProviderDetails().getIssuerUri())
                        .subject("second-user".equals(code) ? SECOND_SUBJECT : SUBJECT)
                        .audience(List.of(registration.getClientId())).issuedAt(now).expiresAt(now.plusSeconds(120))
                        .claim("nonce", "wrong-nonce".equals(code) ? "other-nonce" : nonce);
                if (!Set.of("missing-name", "missing-profile").contains(code)) {
                    claims.claim("name", "invalid-profile".equals(code) ? 123 : NAME);
                }
                if (!Set.of("missing-email", "missing-profile").contains(code)) {
                    claims.claim("email", "invalid-profile".equals(code) ? " " : EMAIL);
                }
                if (!Set.of("missing-verification", "missing-profile").contains(code)) {
                    claims.claim("email_verified", switch (code) {
                        case "unverified-email" -> false;
                        case "string-verification" -> "true";
                        default -> true;
                    });
                }
                var idToken = encoder.encode(JwtEncoderParameters.from(claims.build())).getTokenValue();
                return OAuth2AccessTokenResponse.withToken("synthetic-access-token")
                        .tokenType(OAuth2AccessToken.TokenType.BEARER).scopes(registration.getScopes())
                        .additionalParameters(Map.of("id_token", idToken)).build();
            };
        }

        private static KeyPair rsaKey() {
            try {
                var generator = KeyPairGenerator.getInstance("RSA");
                generator.initialize(2048);
                return generator.generateKeyPair();
            } catch (java.security.NoSuchAlgorithmException failure) {
                throw new IllegalStateException(failure);
            }
        }
    }
}
