package com.clueless.closet.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "GOOGLE_CLIENT_ID=", "GOOGLE_CLIENT_SECRET=", "ML_API_URL=", "ML_API_KEY=",
        "spring.datasource.url=jdbc:postgresql://127.0.0.1:1/preview_mock",
        "spring.datasource.username=synthetic", "spring.datasource.password=synthetic", "DB_CA_CERT=synthetic.pem",
        "server.error.include-message=always", "server.error.include-stacktrace=always"
})
class ClosetPreviewIntegrationTest {

    private static final String PREVIEW = "/api/closet/preview";
    private static final long OWNER = 5_000_000_000L;
    private static final long OTHER = 77L;
    private static final long ITEM = 9_007_199_254_740_993L;
    private static final String OWNER_KEY = OWNER + "/items/a.webp";
    private static final String SQL = """
            SELECT image_blob FROM public.closet_items
            WHERE user_id = ? AND id = ? AND status = 'CONFIRMED' AND disp_yn = 'Y'
            """;
    private static final byte[] WEBP = Base64.getDecoder().decode("UklGRhwAAABXRUJQVlA4TA8AAAAvAAAAAAcQ/Y/+ByKi/wEA");
    private static final byte[] PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
    private static final byte[] SECRET_ERROR = "synthetic upstream error with private path and credentials"
            .getBytes(StandardCharsets.UTF_8);
    private static final Reply IMAGE = new Reply(206, null, WEBP);
    private static final ConcurrentLinkedQueue<BlobRequest> REQUESTS = new ConcurrentLinkedQueue<>();
    private static final AtomicReference<Reply> REPLY = new AtomicReference<>(IMAGE);
    private static final HttpServer BLOB = fakeBlob();

    @MockitoBean
    private JdbcClient jdbc;

    private MockMvc mvc;

    @DynamicPropertySource
    static void configureBlob(DynamicPropertyRegistry registry) {
        registry.add("AZURE_STORAGE_CONNECTION_STRING", () -> "BlobEndpoint=http://127.0.0.1:"
                + BLOB.getAddress().getPort() + "/previewmock;AccountName=previewmock;AccountKey="
                + Base64.getEncoder().encodeToString(new byte[32]));
        registry.add("BLOB_CONTAINER_NAME", () -> "test-items");
        registry.add("BLOB_DRAFTS_CONTAINER", () -> "closet-drafts");
    }

    @BeforeEach
    void reset(@Autowired WebApplicationContext context, @Autowired FilterChainProxy security) {
        REQUESTS.clear();
        REPLY.set(IMAGE);
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
    }

    @AfterAll
    static void stopBlob() {
        BLOB.stop(0);
    }

    @Test
    void anonymousAndNonMemberSessionsDoNotReachJdbcOrBlob() throws Exception {
        mvc.perform(get(PREVIEW).param("id", Long.toString(ITEM)))
                .andExpect(status().isUnauthorized()).andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
        preview(session("some authenticated principal"), Long.toString(ITEM)).andExpect(status().isUnauthorized());
        verifyNoInteractions(jdbc);
        assertThat(REQUESTS).isEmpty();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"0", "-1", "9223372036854775808", "https://untrusted.invalid/a.webp", "1,2"})
    void invalidIdsDoNotReachJdbcOrBlob(String id) throws Exception {
        var request = get(PREVIEW).session(member(OWNER));
        if (id != null) {
            request.param("id", id);
        }
        mvc.perform(request).andExpect(status().isBadRequest());
        verifyNoInteractions(jdbc);
        assertThat(REQUESTS).isEmpty();
    }

    @Test
    void rejectsDuplicateIds() throws Exception {
        mvc.perform(get(PREVIEW).session(member(OWNER)).param("id", "1", "2"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(jdbc);
        assertThat(REQUESTS).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({
            "5000000000/items/a.webp, test-items",
            "items/5000000000/a.webp, test-items",
            "5000000000/drafts/a.webp, closet-drafts"
    })
    void returnsExactImageFromOnlyTheSelectedContainer(String key, String container) throws Exception {
        dbImage(OWNER, key);
        mvc.perform(get(PREVIEW).session(member(OWNER)).param("id", Long.toString(ITEM))
                        .param("user_id", Long.toString(OTHER)).param("container", "spoofed").param("key", "ignored"))
                .andExpect(status().isOk()).andExpect(content().contentType("image/webp"))
                .andExpect(content().bytes(WEBP)).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().doesNotExist("Location")).andExpect(header().doesNotExist("Content-Disposition"));
        assertThat(REQUESTS).containsExactly(new BlobRequest("GET", "/previewmock/" + container + "/" + key,
                "bytes=0-10485760", null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"12345678abcd40128000567890abcdef.webp", "12345678-abcd-4012-8000-567890abcdef.webp"})
    void confirmedMlCropUsesTheSameContainerAndFilenameWithoutSas(String filename) throws Exception {
        dbImage(OWNER, "closet-drafts/" + filename);
        preview(member(OWNER), Long.toString(ITEM)).andExpect(status().isOk())
                .andExpect(content().contentType("image/webp")).andExpect(content().bytes(WEBP));
        assertThat(REQUESTS).containsExactly(new BlobRequest("GET", "/previewmock/closet-drafts/" + filename,
                "bytes=0-10485760", null));
    }

    @Test
    void nonexistentAndForeignItemsAreIndistinguishableAndNeverQueryBlob() throws Exception {
        var statement = mock(JdbcClient.StatementSpec.class);
        when(jdbc.sql(SQL)).thenReturn(statement);
        dbImage(statement, OWNER, ITEM, "closet-drafts/12345678abcd40128000567890abcdef.webp");
        dbImage(statement, OTHER, ITEM, null);
        dbImage(statement, OWNER, ITEM + 1, null);
        empty(preview(member(OTHER), Long.toString(ITEM)), 404);
        empty(preview(member(OWNER), Long.toString(ITEM + 1)), 404);
        verify(statement).params(OTHER, ITEM);
        verify(statement).params(OWNER, ITEM + 1);
        assertThat(REQUESTS).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "https://untrusted.invalid/file.webp", "77/items/a.webp", "items/77/a.webp",
            "5000000000/items/../77/a.webp", "5000000000/drafts/%2E%2E/a.webp", "5000000000/items/a.webp?sig=synthetic",
            "5000000000/items/", "closet-drafts/uuid.webp", "closet-drafts/12345678abcd40128000567890abcdef.png",
            "closet-drafts/nested/12345678abcd40128000567890abcdef.webp",
            "closet-drafts/12345678abcd40128000567890abcdef.webp?sig=synthetic",
            "other-container/12345678abcd40128000567890abcdef.webp", "other-container/items/5000000000/a.webp"})
    void unsafeStoredKeysDoNotQueryBlob(String key) throws Exception {
        dbImage(OWNER, key);
        empty(preview(member(OWNER), Long.toString(ITEM)), 404);
        assertThat(REQUESTS).isEmpty();
    }

    @Test
    void rasterTypeIsDerivedFromBytesNotUpstreamHeadersOrFileExtension() throws Exception {
        dbImage(OWNER, OWNER_KEY);
        REPLY.set(new Reply(206, null, PNG));
        preview(member(OWNER), Long.toString(ITEM)).andExpect(status().isOk())
                .andExpect(content().contentType("image/png")).andExpect(content().bytes(PNG));
        REPLY.set(new Reply(206, null, "<svg xmlns=\"http://www.w3.org/2000/svg\"/>".getBytes(StandardCharsets.UTF_8)));
        empty(preview(member(OWNER), Long.toString(ITEM)), 415);
        REPLY.set(new Reply(206, null, new byte[10 * 1024 * 1024 + 1]));
        empty(preview(member(OWNER), Long.toString(ITEM)), 413);
        REPLY.set(new Reply(200, null, new byte[10 * 1024 * 1024 + 2]));
        empty(preview(member(OWNER), Long.toString(ITEM)), 413);
    }

    @ParameterizedTest
    @CsvSource({"404, BlobNotFound, 404", "404, ContainerNotFound, 502", "403, AuthenticationFailed, 502",
            "416, InvalidRange, 415", "302, Redirect, 502"})
    void sanitizesAzureErrorsWithoutTryingOtherContainers(int azureStatus, String error, int expected) throws Exception {
        dbImage(OWNER, OWNER_KEY);
        REPLY.set(new Reply(azureStatus, error, SECRET_ERROR));
        empty(preview(member(OWNER), Long.toString(ITEM)), expected);
        assertThat(REQUESTS).hasSize(1);
    }

    @Test
    void sanitizesDatabaseErrorsAndDoesNotQueryBlob() throws Exception {
        when(jdbc.sql(SQL)).thenThrow(new DataAccessResourceFailureException("synthetic db secret"));
        empty(preview(member(OWNER), Long.toString(ITEM)), 503);
        assertThat(REQUESTS).isEmpty();
    }

    private ResultActions preview(MockHttpSession session, String id) throws Exception {
        return mvc.perform(get(PREVIEW).session(session).param("id", id));
    }

    private static void empty(ResultActions result, int code) throws Exception {
        result.andExpect(status().is(code)).andExpect(content().bytes(new byte[0]))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().doesNotExist("Location")).andExpect(header().doesNotExist("x-ms-error-code"));
    }

    private void dbImage(long owner, String key) {
        var statement = mock(JdbcClient.StatementSpec.class);
        when(jdbc.sql(SQL)).thenReturn(statement);
        dbImage(statement, owner, ITEM, key);
    }

    @SuppressWarnings("unchecked")
    private static void dbImage(JdbcClient.StatementSpec statement, long owner, long itemId, String key) {
        var bound = mock(JdbcClient.StatementSpec.class);
        var query = (JdbcClient.MappedQuerySpec<String>) mock(JdbcClient.MappedQuerySpec.class);
        when(statement.params(owner, itemId)).thenReturn(bound);
        when(bound.query(String.class)).thenReturn(query);
        when(query.optional()).thenReturn(Optional.ofNullable(key));
    }

    private static MockHttpSession member(long id) {
        var now = Instant.now();
        var token = new OidcIdToken("synthetic", now, now.plusSeconds(60), Map.of("sub", "preview-test-" + id));
        return session(new ClosetOidcUser(new DefaultOidcUser(AuthorityUtils.NO_AUTHORITIES, token), id, false));
    }

    private static MockHttpSession session(Object principal) {
        var auth = UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of());
        var session = new MockHttpSession();
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, new SecurityContextImpl(auth));
        return session;
    }

    private static HttpServer fakeBlob() {
        try {
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                try (exchange) {
                    var uri = exchange.getRequestURI();
                    REQUESTS.add(new BlobRequest(exchange.getRequestMethod(), uri.getPath(),
                            exchange.getRequestHeaders().getFirst("x-ms-range"), uri.getRawQuery()));
                    var reply = REPLY.get();
                    var headers = exchange.getResponseHeaders();
                    headers.set("Content-Disposition", "attachment; filename=upstream-secret");
                    byte[] body = reply.body();
                    if (reply.error() == null) {
                        headers.set("Content-Type", "text/html");
                        headers.set("Content-Range", "bytes 0-" + (body.length - 1) + "/" + body.length);
                    } else {
                        headers.set("Content-Type", "application/xml");
                        headers.set("x-ms-error-code", reply.error());
                        if (reply.status() == 302) {
                            headers.set("Location", "http://127.0.0.1:" + exchange.getLocalAddress().getPort()
                                    + "/untrusted-redirect");
                        }
                        body = ("<Error><Code>" + reply.error() + "</Code><Message>"
                                + new String(body, StandardCharsets.UTF_8) + "</Message></Error>").getBytes(StandardCharsets.UTF_8);
                    }
                    exchange.sendResponseHeaders(reply.status(), body.length);
                    exchange.getResponseBody().write(body);
                }
            });
            server.start();
            return server;
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    private record BlobRequest(String method, String path, String range, String query) {
    }

    private record Reply(int status, String error, byte[] body) {
    }
}
