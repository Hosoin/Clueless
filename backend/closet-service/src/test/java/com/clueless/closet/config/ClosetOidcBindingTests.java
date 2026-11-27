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
import com.clueless.closet.repository.UserRepository.LoginUser;
import com.clueless.closet.repository.UserRepository.UserProfile;
import com.clueless.closet.service.ClosetOidcUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
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
import org.springframework.http.MediaType;
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
import org.springframework.test.context.TestPropertySource;
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
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
    private static final String PREFERENCES = """
            {"nickName":"  새별  ","preferredStyles":["스포티","미니멀","캐주얼"]}
            """;
    private static final String OTHER_PREFERENCES = """
            {"nickName":"다른닉","preferredStyles":["페미닌"]}
            """;
    private static final String ORIGIN = "http://localhost:5173";
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
    void meReturnsExactlyTheProfileFieldsForTheSessionUser() throws Exception {
        when(users.findOrCreate("google", SUBJECT, NAME, EMAIL)).thenReturn(new LoginUser(USER_ID, false));
        when(users.findOrCreate("google", SECOND_SUBJECT, NAME, EMAIL)).thenReturn(new LoginUser(SECOND_USER_ID, false));
        when(users.findProfileById(USER_ID)).thenReturn(Optional.of(
                new UserProfile(USER_ID, "Stored Name", "포근한여우1234", "stored@example.invalid", List.of("클래식"))));
        when(users.findProfileById(SECOND_USER_ID)).thenReturn(Optional.of(
                new UserProfile(SECOND_USER_ID, null, null, null, List.of())));
        var first = login("valid");
        var second = login("second-user");

        mvc.perform(get(ME).session(first).param("userId", Long.toString(SECOND_USER_ID))
                        .param("id", Long.toString(SECOND_USER_ID)).param("sub", SECOND_SUBJECT))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(content().json("""
                        {"id":"5000000000","userName":"Stored Name","nickName":"포근한여우1234","email":"stored@example.invalid",
                         "preferredStyles":["클래식"]}
                        """, JsonCompareMode.STRICT))
                .andExpect(result -> assertThat(JsonMapper.shared().readTree(result.getResponse().getContentAsByteArray())
                        .propertyNames()).containsExactly("id", "userName", "nickName", "email", "preferredStyles"));
        mvc.perform(get(ME).session(second).param("userId", Long.toString(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"id":"9007199254740993","userName":null,"nickName":null,"email":null,
                         "preferredStyles":[]}
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

        when(users.findOrCreate("google", SUBJECT, NAME, EMAIL)).thenReturn(new LoginUser(USER_ID, false));
        when(users.findProfileById(USER_ID)).thenReturn(Optional.empty());
        mvc.perform(get(ME).session(login("valid"))).andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().doesNotExist(CSRF_HEADER))
                .andExpect(content().string(""));
        verify(users).findProfileById(USER_ID);
    }

    @Test
    void onlyPostWithTheSameSessionsCsrfTokenLogsOut() throws Exception {
        when(users.findOrCreate("google", SUBJECT, NAME, EMAIL)).thenReturn(new LoginUser(USER_ID, false));
        when(users.findProfileById(USER_ID)).thenReturn(Optional.of(new UserProfile(USER_ID, null, null, null, List.of())));
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

    @Test
    void profilePatchUsesOnlyTheSessionIdAndAllowsPartialAndRepeatedEdits() throws Exception {
        when(users.findOrCreate("google", SUBJECT, NAME, EMAIL)).thenReturn(new LoginUser(USER_ID, false));
        var original = new UserProfile(USER_ID, NAME, "임시닉", EMAIL, List.of("페미닌"));
        var cleared = new UserProfile(USER_ID, NAME, "새별", EMAIL, List.of());
        when(users.findProfileById(USER_ID)).thenReturn(Optional.of(original)).thenReturn(Optional.of(cleared));
        var styles = List.of("스포티", "미니멀", "캐주얼");
        when(users.updateProfile(USER_ID, "새별", styles)).thenReturn(true);
        when(users.updateProfile(USER_ID, "새별", null)).thenReturn(true);
        when(users.updateProfile(USER_ID, null, List.of())).thenReturn(true);
        var session = login("valid");
        String token = readCsrfToken(session);

        mvc.perform(patch(ME).session(session).header(CSRF_HEADER, token).header(HttpHeaders.ORIGIN, ORIGIN)
                        .param("user_id", Long.toString(SECOND_USER_ID)).contentType(MediaType.APPLICATION_JSON).content(PREFERENCES))
                .andExpect(status().isNoContent()).andExpect(content().string(""))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN));
        for (String patchBody : List.of("{\"nickName\":\"새별\"}", "{\"preferredStyles\":[]}", "{\"preferredStyles\":[]}")) {
            mvc.perform(patch(ME).session(session).header(CSRF_HEADER, token)
                            .contentType(MediaType.APPLICATION_JSON).content(patchBody))
                    .andExpect(status().isNoContent()).andExpect(content().string(""));
        }
        mvc.perform(get(ME).session(login("valid")))
                .andExpect(status().isOk()).andExpect(content().json("""
                        {"id":"5000000000","userName":"Synthetic Name","nickName":"새별","email":"claim@example.invalid",
                         "preferredStyles":[]}
                        """, JsonCompareMode.STRICT));
        verify(users).updateProfile(USER_ID, "새별", styles);
        verify(users).updateProfile(USER_ID, "새별", null);
        verify(users, times(2)).updateProfile(USER_ID, null, List.of());
    }

    @Test
    void profilePatchRequiresAuthenticationAndTheSameSessionsCsrfToken() throws Exception {
        mvc.perform(patch(ME).contentType(MediaType.APPLICATION_JSON).content(PREFERENCES))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")));
        verifyNoInteractions(users);
        when(users.findOrCreate("google", SUBJECT, NAME, EMAIL)).thenReturn(new LoginUser(USER_ID, false));
        when(users.findProfileById(USER_ID)).thenReturn(Optional.of(new UserProfile(USER_ID, null, null, null, List.of())));
        var session = login("valid");
        String otherToken = readCsrfToken(login("valid"));
        mvc.perform(patch(ME).session(session).contentType(MediaType.APPLICATION_JSON).content(PREFERENCES))
                .andExpect(status().isForbidden())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")));
        for (String token : List.of("invalid", otherToken)) {
            mvc.perform(patch(ME).session(session).header(CSRF_HEADER, token)
                            .contentType(MediaType.APPLICATION_JSON).content(PREFERENCES))
                    .andExpect(status().isForbidden());
        }
        verify(users, times(2)).findOrCreate("google", SUBJECT, NAME, EMAIL);
        verify(users).findProfileById(USER_ID);
        verifyNoMoreInteractions(users);
    }

    @Test
    void profilePatchRejectsInvalidJsonWithoutWritingAndCountsUtf16UnitsAfterTrimming() throws Exception {
        when(users.findOrCreate("google", SUBJECT, NAME, EMAIL)).thenReturn(new LoginUser(USER_ID, false));
        when(users.findProfileById(USER_ID)).thenReturn(Optional.of(new UserProfile(USER_ID, null, null, null, List.of())));
        var session = login("valid");
        String token = readCsrfToken(session);
        for (String invalid : List.of("", "null", "[]", "{", OTHER_PREFERENCES + "{}",
                "{}",
                OTHER_PREFERENCES.replace("nickName", "nickname"),
                OTHER_PREFERENCES.replace("preferredStyles", "user_id"),
                OTHER_PREFERENCES.replace("\"preferredStyles\":", "\"user_id\":7,\"preferredStyles\":"),
                OTHER_PREFERENCES.replace("\"preferredStyles\":", "\"mode\":\"taste\",\"preferredStyles\":"),
                OTHER_PREFERENCES.replace("\"nickName\":", "\"nickName\":\"첫닉\",\"nickName\":"),
                OTHER_PREFERENCES.replace("\"다른닉\"", "null"), OTHER_PREFERENCES.replace("\"다른닉\"", "32"),
                OTHER_PREFERENCES.replace("다른닉", " 가 "), OTHER_PREFERENCES.replace("다른닉", "😀".repeat(6) + "가"),
                OTHER_PREFERENCES.replace("다른닉", "가\\u0000나"), OTHER_PREFERENCES.replace("다른닉", "가\\ud800"),
                OTHER_PREFERENCES.replace("[\"페미닌\"]", "null"),
                OTHER_PREFERENCES.replace("[\"페미닌\"]", "\"페미닌\""),
                PREFERENCES.replace("\"캐주얼\"", "\"스포티\""), PREFERENCES.replace("\"캐주얼\"", "\"모던\""),
                PREFERENCES.replace("\"캐주얼\"", "null"), PREFERENCES.replace("\"캐주얼\"", "\"캐주얼\",\"페미닌\""))) {
            mvc.perform(patch(ME).session(session).header(CSRF_HEADER, token)
                            .contentType(MediaType.APPLICATION_JSON).content(invalid))
                    .andExpect(status().isBadRequest()).andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
        }
        mvc.perform(patch(ME).session(session).header(CSRF_HEADER, token)
                        .contentType(MediaType.TEXT_PLAIN).content(OTHER_PREFERENCES)).andExpect(status().isUnsupportedMediaType());
        verify(users).findOrCreate("google", SUBJECT, NAME, EMAIL);
        verify(users).findProfileById(USER_ID);
        verifyNoMoreInteractions(users);

        for (String nickName : List.of("😀", "😀".repeat(6))) {
            when(users.updateProfile(USER_ID, nickName, List.of("페미닌"))).thenReturn(true);
            mvc.perform(patch(ME).session(session).header(CSRF_HEADER, token)
                            .contentType(MediaType.APPLICATION_JSON).content(OTHER_PREFERENCES.replace("다른닉", "\uFEFF\u00A0" + nickName + "\u2029")))
                    .andExpect(status().isNoContent());
            verify(users).updateProfile(USER_ID, nickName, List.of("페미닌"));
        }
    }

    @Test
    void profilePatchHandlesAStaleSessionAndDatabaseFailureWithoutExposingDetails() throws Exception {
        when(users.findOrCreate("google", SUBJECT, NAME, EMAIL)).thenReturn(new LoginUser(USER_ID, false));
        var session = login("valid");
        when(users.findProfileById(USER_ID)).thenReturn(Optional.of(new UserProfile(USER_ID, null, null, null, List.of())));
        String token = readCsrfToken(session);
        mvc.perform(patch(ME).session(session).header(CSRF_HEADER, token)
                        .contentType(MediaType.APPLICATION_JSON).content(OTHER_PREFERENCES))
                .andExpect(status().isUnauthorized());
        when(users.updateProfile(USER_ID, "다른닉", List.of("페미닌")))
                .thenThrow(new DataAccessResourceFailureException("synthetic DB detail"));
        mvc.perform(patch(ME).session(session).header(CSRF_HEADER, token)
                        .contentType(MediaType.APPLICATION_JSON).content(OTHER_PREFERENCES))
                .andExpect(status().isServiceUnavailable()).andExpect(content().string(""))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
        when(users.findProfileById(USER_ID)).thenThrow(new DataAccessResourceFailureException("synthetic DB detail"));
        mvc.perform(get(ME).session(session)).andExpect(status().isServiceUnavailable())
                .andExpect(content().string("")).andExpect(header().doesNotExist(CSRF_HEADER));
    }

    @Test
    void profilePatchCorsAllowsOnlyTheLocalFrontendAndExpectedMethodAndHeaders() throws Exception {
        mvc.perform(options(ME).header(HttpHeaders.ORIGIN, ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PATCH")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Content-Type, " + CSRF_HEADER))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, "GET,PATCH"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, " + CSRF_HEADER));
        mvc.perform(options(ME).header(HttpHeaders.ORIGIN, "https://other.invalid")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PATCH"))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
        mvc.perform(options(ME).header(HttpHeaders.ORIGIN, ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isForbidden());
        mvc.perform(options(ME).header(HttpHeaders.ORIGIN, ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PATCH")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "X-User-ID"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(users);
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
        when(users.findOrCreate("google", SUBJECT, NAME, EMAIL)).thenReturn(new LoginUser(USER_ID, true), new LoginUser(USER_ID, false));

        for (int attempt = 0; attempt < 2; attempt++) {
            var session = new MockHttpSession();
            var response = callback(session, "valid");
            assertThat(response.getStatus()).isEqualTo(302);
            assertThat(response.getHeader(HttpHeaders.LOCATION)).isEqualTo(attempt == 0 ? "http://localhost:5173/home?newUser=1" : "http://localhost:5173/home");
            var context = (SecurityContext) session.getAttribute(SECURITY_CONTEXT);
            assertThat(context.getAuthentication().isAuthenticated()).isTrue();
            assertThat(context.getAuthentication().getPrincipal()).isInstanceOfSatisfying(ClosetOidcUser.class, user -> {
                assertThat(user.userId()).isEqualTo(USER_ID);
                assertThat(user.getAttributes()).doesNotContainKeys("userId", "newUser");
            });
        }

        verify(users, times(2)).findOrCreate("google", SUBJECT, NAME, EMAIL);
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
        when(users.findOrCreate("google", SUBJECT, expectedName, expectedEmail)).thenReturn(new LoginUser(USER_ID, false));
        var session = new MockHttpSession();

        var response = callback(session, code);

        assertThat(response.getHeader(HttpHeaders.LOCATION)).isEqualTo("http://localhost:5173/home");
        var context = (SecurityContext) session.getAttribute(SECURITY_CONTEXT);
        assertThat(context.getAuthentication().isAuthenticated()).isTrue();
        verify(users).findOrCreate("google", SUBJECT, expectedName, expectedEmail);
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
        when(users.findOrCreate("google", SUBJECT, NAME, EMAIL))
                .thenThrow(new DataAccessResourceFailureException("synthetic DB detail"));
        var session = new MockHttpSession();
        var response = callback(session, "valid");

        verify(users).findOrCreate("google", SUBJECT, NAME, EMAIL);
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).isEmpty();
        assertThat(response.getRedirectedUrl()).isNull();
        assertThat(session.getAttribute(SECURITY_CONTEXT)).isNull();
    }

    @Nested
    @TestPropertySource(properties = "FRONTEND_LOGIN_SUCCESS_URL=https://dev.example.com/?lang=ko&back=%2Fcloset#/home?tab=all")
    class ConfiguredSuccessUrl {

        @Test
        void onlyNewLoginAppendsAMarkerBeforeTheHashAndPreservesTheConfiguredQuery() throws Exception {
            when(users.findOrCreate("google", SUBJECT, NAME, EMAIL))
                    .thenReturn(new LoginUser(USER_ID, true), new LoginUser(USER_ID, false));

            var first = callback(new MockHttpSession(), "valid");
            var returning = callback(new MockHttpSession(), "valid");

            assertThat(first.getStatus()).isEqualTo(302);
            assertThat(first.getHeader(HttpHeaders.LOCATION))
                    .isEqualTo("https://dev.example.com/?lang=ko&back=%2Fcloset&newUser=1#/home?tab=all");
            assertThat(returning.getStatus()).isEqualTo(302);
            assertThat(returning.getHeader(HttpHeaders.LOCATION))
                    .isEqualTo("https://dev.example.com/?lang=ko&back=%2Fcloset#/home?tab=all");
        }
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
        callback.addParameter("newUser", "1");
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
