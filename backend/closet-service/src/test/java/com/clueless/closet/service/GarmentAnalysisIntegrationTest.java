package com.clueless.closet.service;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import com.clueless.closet.repository.ClosetItemRepository;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

import javax.imageio.ImageIO;

import static java.net.http.HttpRequest.BodyPublishers.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:postgresql://localhost:1/binding_test",
        "spring.datasource.username=binding_test", "spring.datasource.password=synthetic",
        "DB_CA_CERT=synthetic CA.pem", "GOOGLE_CLIENT_ID=", "GOOGLE_CLIENT_SECRET="
})
@Import(GarmentAnalysisIntegrationTest.Sessions.class)
class GarmentAnalysisIntegrationTest {

    private static final String KEY = "synthetic-test-key";
    private static final String PATH = "/api/closet/analyze";
    private static final String CROP = "closet-drafts/12345678abcd40128000567890abcdef.webp";
    private static final String PREVIEW = "https://example.invalid/" + CROP + "?sig=synthetic-preview";
    private static final long USER = 5_000_000_009L;
    private static final long ID = 9_007_199_254_740_993L;
    private static final JsonMapper JSON = new JsonMapper();
    private static final String ANALYSIS = """
            {"category":{"name":"상의","prob":0.92},"subcategory":{"name":"티셔츠"},"sleeve":{"name":"반팔"},
             "print":{"name":"무지"},"color_name":{"name":"네이비"},"colors":[{"name":"네이비","rgb":[38,50,79],"ratio":1}],
             "style":{"tags":["미니멀","캐주얼"],"scores":{"미니멀":0.91}},"retake":false,"crop_blob":"%s",
             "crop_png_base64":"synthetic-image","embedding":[0.1,0.2],"model_versions":{"embedding":"synthetic-version"},
             "extra":{"nested_sas":"synthetic-container-token","score":0.5,"bytes":"data:image/webp;base64,AAAA"}}
            """.formatted(CROP);
    private static final String BOUNDARY = "backend-test-boundary";
    private static final byte[] PNG = png();
    private static final AtomicInteger CALLS = new AtomicInteger();
    private static final AtomicInteger REDIRECTS = new AtomicInteger();
    private static final AtomicReference<Request> RECEIVED = new AtomicReference<>();
    private static final AtomicReference<Reply> REPLY = new AtomicReference<>();
    private static final HttpServer ML = fakeMl();
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    @LocalServerPort
    private int port;

    @MockitoBean
    private ClosetPreviewBlobClient blobs;

    @MockitoBean
    private ClosetItemRepository items;

    @DynamicPropertySource
    static void mlConfig(DynamicPropertyRegistry registry) {
        registry.add("ML_API_URL", GarmentAnalysisIntegrationTest::mlBase);
        registry.add("ML_API_KEY", () -> KEY);
    }

    @BeforeEach
    void reset() {
        CALLS.set(0);
        REDIRECTS.set(0);
        RECEIVED.set(null);
        REPLY.set(new Reply(200, "application/json", ANALYSIS));
    }

    @AfterAll
    static void close() {
        HTTP.shutdownNow();
        ML.stop(0);
    }

    @Test
    void sendsJustTheImageWithServerKeyAndPersistsTheOwnerDraftOnBothRoutes() throws Exception {
        when(blobs.draftPreviewUrl(CROP)).thenReturn(PREVIEW);
        var metadata = JSON.readTree(ANALYSIS);
        ((tools.jackson.databind.node.ObjectNode) metadata).remove(List.of("crop_blob", "crop_png_base64"));
        ((tools.jackson.databind.node.ObjectNode) metadata.get("extra")).remove(List.of("nested_sas", "bytes"));
        String name = "네이비 반팔 티셔츠";
        when(items.insertDraft(USER, name, "상의", "티셔츠", "네이비", "#26324F", List.of("미니멀", "캐주얼"),
                metadata.toString(), CROP))
                .thenReturn(ID);
        var response = post(session("authenticated"), true, image("image", "image/png", PNG));
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Content-Type")).contains("application/json");
        var body = JSON.readTree(response.body());
        assertThat(body).isEqualTo(JSON.readTree("""
                {"id":"%s","previewImg":"%s","category":"상의","sub_category":"티셔츠","color":"네이비",
                 "hex":"#26324F","styles":["미니멀","캐주얼"],"name":"%s","retake":false}
                """.formatted(ID, PREVIEW, name)));
        var legacy = post(LocalGarmentAnalysisRunner.PATH, session("authenticated"), true, image("image", "image/png", PNG));
        assertThat(legacy.statusCode()).isEqualTo(200);
        assertThat(legacy.body()).isEqualTo(response.body());
        verify(items, times(2)).insertDraft(USER, name, "상의", "티셔츠", "네이비", body.get("hex").stringValue(),
                List.of("미니멀", "캐주얼"), metadata.toString(), CROP);
        var sent = RECEIVED.get();
        assertThat(sent.method()).isEqualTo("POST");
        assertThat(sent.path()).isEqualTo("/ml/v1/garments/analyze");
        assertThat(sent.headers().allValues("x-api-key")).containsExactly(KEY);
        assertThat(sent.headers().map()).doesNotContainKeys("authorization", "cookie", "x-csrf-token");
        String type = sent.headers().firstValue("content-type").orElseThrow();
        assertThat(type).startsWith("multipart/form-data; boundary=");
        String boundary = type.substring(type.indexOf('=') + 1);
        var expected = new ByteArrayOutputStream();
        expected.writeBytes(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"image.png\""
                + "\r\nContent-Type: image/png\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        expected.writeBytes(PNG);
        expected.writeBytes(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.US_ASCII));
        assertThat(sent.body()).isEqualTo(expected.toByteArray());
    }

    @Test
    void rejectsAnonymousAndMissingCsrfBeforeContactingMl() throws Exception {
        var file = image("image", "image/png", PNG);
        assertThat(status(fileOnlyPost(analysisUri(port, PATH)))).isEqualTo(401);
        assertThat(status(fileOnlyPost(analysisUri(port, LocalGarmentAnalysisRunner.PATH)))).isEqualTo(401);
        assertThat(post(session("anonymous"), true, file).statusCode()).isEqualTo(401);
        var member = session("authenticated");
        assertThat(post(member, false, file).statusCode()).isEqualTo(403);
        assertThat(post(new Session(member.cookie(), session("authenticated").csrf()), true, file).statusCode())
                .isEqualTo(403);
        assertThat(post(session("wrong-principal"), true, file).statusCode()).isEqualTo(401);
        verifyNoInteractions(items, blobs);
        assertThat(CALLS.get()).isZero();
    }

    @Test
    void retakeNeedsOnlyABooleanAndNeverTouchesBlobOrDb() throws Exception {
        var auth = session("authenticated");
        for (String body : List.of("{\"retake\":true}", "{\"retake\":true,\"crop_blob\":3,\"category\":null}")) {
            REPLY.set(new Reply(200, "application/json", body));
            var response = post(auth, true, image("image", "image/png", PNG));
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.body()).isEqualTo("{\"retake\":true}");
        }
        verifyNoInteractions(items, blobs);
    }

    @Test
    void missingOptionalPredictionsKeepNullInResponseAndUseDbSafeValues() throws Exception {
        REPLY.set(new Reply(200, "application/json", """
                {"category":{"name":"하의"},"color_name":null,"colors":[],"style":null,"subcategory":null,
                 "sleeve":null,"print":null,"crop_blob":"%s","retake":false}
                """.formatted(CROP)));
        when(blobs.draftPreviewUrl(CROP)).thenReturn(PREVIEW);
        when(items.insertDraft(eq(USER), eq("하의"), eq("하의"), isNull(), eq(""), isNull(), eq(List.of()), anyString(), eq(CROP)))
                .thenReturn(ID);
        var response = post(session("authenticated"), true, image("image", "image/png", PNG));
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(JSON.readTree(response.body())).isEqualTo(JSON.readTree("""
                {"id":"%s","previewImg":"%s","category":"하의","sub_category":null,"color":null,"hex":null,
                 "styles":[],"name":"하의","retake":false}
                """.formatted(ID, PREVIEW)));
    }

    @Test
    void invalidDraftDoesNotPersistAndDbFailuresDoNotExposeData() throws Exception {
        var auth = session("authenticated");
        var file = image("image", "image/png", PNG);
        for (String body : List.of("{\"retake\":false}", ANALYSIS.replace("상의", "not-a-category"),
                ANALYSIS.replace("[38,50,79]", "[256,50,79]"), ANALYSIS.replace("\"미니멀\",\"캐주얼\"", "false"))) {
            REPLY.set(new Reply(200, "application/json", body));
            var response = post(auth, true, file);
            assertThat(response.statusCode()).isEqualTo(502);
            assertThat(response.body()).isEmpty();
        }
        verifyNoInteractions(blobs, items);
        REPLY.set(new Reply(200, "application/json", ANALYSIS));
        when(blobs.draftPreviewUrl(CROP)).thenThrow(new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_GATEWAY));
        assertThat(post(auth, true, file).statusCode()).isEqualTo(502);
        verifyNoInteractions(items);
        doReturn(PREVIEW).when(blobs).draftPreviewUrl(CROP);
        when(items.insertDraft(anyLong(), anyString(), anyString(), anyString(), anyString(), anyString(),
                anyList(), anyString(), anyString()))
                .thenThrow(new DataAccessResourceFailureException("synthetic-private-diagnostics"));
        var unavailable = post(auth, true, file);
        assertThat(unavailable.statusCode()).isEqualTo(503);
        assertThat(unavailable.body()).isEmpty();
    }

    @Test
    void localRunnerAcceptsFileOnlyAndRejectsBrowserHeadersOtherRoutesAndOtherHosts() throws Exception {
        try (var ml = new GarmentAnalysisClient(mlBase(), KEY, new JsonMapper())) {
            var server = LocalGarmentAnalysisRunner.start(ml, 0);
            try {
                var uri = analysisUri(server.getPort(), LocalGarmentAnalysisRunner.PATH);
                var response = HTTP.send(fileOnlyPost(uri).build(), HttpResponse.BodyHandlers.ofString());
                assertThat(response.statusCode()).isEqualTo(200);
                assertThat(response.body()).isEqualTo(ANALYSIS);
                assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
                assertThat(RECEIVED.get().headers().allValues("x-api-key")).containsExactly(KEY);
                for (var header : new String[] {"Origin", "sEc-FeTcH-sItE", "Sec-Fetch-Mode", "Sec-Fetch-Dest", "Sec-Fetch-User"}) {
                    assertThat(status(fileOnlyPost(uri).header(header, "null"))).isEqualTo(403);
                }
                assertThat(status(HttpRequest.newBuilder(uri).GET())).isEqualTo(405);
                assertThat(status(HttpRequest.newBuilder(uri).method("OPTIONS", noBody()))).isEqualTo(405);
                assertThat(status(fileOnlyPost(uri.resolve(PATH)))).isEqualTo(404);
                assertThat(status(fileOnlyPost(uri.resolve("/api/auth/logout")))).isEqualTo(404);
                assertThat(status(fileOnlyPost(uri.resolve("/test")))).isEqualTo(404);
                assertThat(status(HttpRequest.newBuilder(uri).POST(ofString("not multipart")))).isEqualTo(415);
                try (var socket = new Socket("127.0.0.1", server.getPort())) {
                    socket.setSoTimeout(5000);
                    socket.getOutputStream().write(("POST " + uri.getPath() + " HTTP/1.1\r\n"
                            + "Host: other.example:" + server.getPort() + "\r\n"
                            + "Content-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                    assertThat(new String(socket.getInputStream().readAllBytes(), StandardCharsets.US_ASCII))
                            .startsWith("HTTP/1.1 403");
                }
                assertThat(CALLS.get()).isEqualTo(1);
            } finally {
                server.destroy();
            }
        }
    }

    @Test
    void rejectsMissingDuplicateEmptyWrongTypeAndOversizedPartsBeforeContactingMl() throws Exception {
        var auth = session("authenticated");
        var valid = image("image", "image/png", PNG);
        assertThat(post(auth, true, image("wrong", "image/png", PNG)).statusCode()).isEqualTo(400);
        assertThat(post(auth, true, valid, valid).statusCode()).isEqualTo(400);
        assertThat(post(auth, true, image("image", "image/png", new byte[0])).statusCode()).isEqualTo(400);
        assertThat(post(auth, true, image("image", "text/plain", PNG)).statusCode()).isEqualTo(415);
        assertThat(post(auth, true, image("image", "image/png", new byte[20])).statusCode()).isEqualTo(415);
        assertThat(post(auth, true, image("image", "image/png", new byte[10 * 1024 * 1024 + 1])).statusCode())
                .isEqualTo(413);
        assertThat(CALLS.get()).isZero();
    }

    @ParameterizedTest
    @CsvSource({"400, 422", "422, 422", "413, 413", "429, 503", "503, 503", "401, 502", "307, 502", "500, 502"})
    void mapsUpstreamErrorsWithoutReturningBodiesOrHeaders(int upstream, int expected) throws Exception {
        REPLY.set(new Reply(upstream, "application/json", "synthetic upstream diagnostics: " + KEY));
        var response = post(session("authenticated"), true, image("image", "image/png", PNG));
        assertThat(response.statusCode()).isEqualTo(expected);
        assertThat(response.body()).isEmpty();
        assertThat(response.headers().firstValue("Location")).isEmpty();
        assertThat(REDIRECTS.get()).isZero();
    }

    @Test
    void rejectsUnusableUpstreamSuccessBodies() throws Exception {
        var auth = session("authenticated");
        var file = image("image", "image/png", PNG);
        for (var reply : new Reply[] {
                new Reply(200, "text/html", ANALYSIS), new Reply(200, "application/json", "{broken"),
                new Reply(200, "application/json", "[]"),
                new Reply(200, "application/json", "{\"retake\":true,\"retake\":false}"),
                new Reply(200, "application/json", "{\"retake\":\"true\"}"), new Reply(200, "application/json", "{\"detail\":\"not an analysis\"}"),
                new Reply(200, "application/json", ANALYSIS + "{}"),
                new Reply(200, "application/json", ANALYSIS + " ".repeat(5 * 1024 * 1024))}) {
            REPLY.set(reply);
            var response = post(auth, true, file);
            assertThat(response.statusCode()).isEqualTo(502);
            assertThat(response.body()).isEmpty();
        }
    }

    @Test
    void unsafePlainHttpAndMissingKeyAreDisabled() {
        try (var unsafe = new GarmentAnalysisClient("http://192.0.2.1:8000", KEY, new JsonMapper());
                var missingKey = new GarmentAnalysisClient(mlBase(), "", new JsonMapper());
                var missingUrl = new GarmentAnalysisClient("", KEY, new JsonMapper())) {
            for (var client : new GarmentAnalysisClient[] {unsafe, missingKey, missingUrl}) {
                assertThat(client.analyze(PNG, "png").status()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            }
            assertThat(CALLS.get()).isZero();
        }
    }

    @Test
    void timesOutWhileReadingResponseBody() throws Exception {
        var bodyStarted = new CountDownLatch(1);
        var finish = new CountDownLatch(1);
        ML.createContext("/slow/v1/garments/analyze", exchange -> {
            try (exchange) {
                exchange.getRequestBody().readAllBytes();
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, 0);
                exchange.getResponseBody().write('{');
                exchange.getResponseBody().flush();
                bodyStarted.countDown();
                finish.await();
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
        });
        try (var client = new GarmentAnalysisClient(mlBase().replace("/ml/", "/slow/"), KEY,
                new JsonMapper(), Duration.ofSeconds(1))) {
            assertThat(client.analyze(PNG, "png").status()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT);
            assertThat(bodyStarted.getCount()).isZero();
        } finally {
            finish.countDown();
        }
    }

    private Session session(String kind) throws Exception {
        var response = HTTP.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/test"))
                .header("X-Test-Session", kind).GET().build(), HttpResponse.BodyHandlers.ofString());
        return new Session(response.headers().firstValue("Set-Cookie").orElseThrow().split(";", 2)[0], response.body());
    }

    private static URI analysisUri(int port, String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private static HttpRequest.Builder fileOnlyPost(URI uri) {
        return HttpRequest.newBuilder(uri)
                .header("Content-Type", "multipart/form-data; boundary=" + BOUNDARY)
                .POST(concat(image("image", "image/png", PNG), ofString("--" + BOUNDARY + "--\r\n")));
    }

    private static int status(HttpRequest.Builder request) throws Exception {
        return HTTP.send(request.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    private HttpResponse<String> post(Session session, boolean csrf, HttpRequest.BodyPublisher... parts) throws Exception {
        return post(PATH, session, csrf, parts);
    }

    private HttpResponse<String> post(String path, Session session, boolean csrf, HttpRequest.BodyPublisher... parts) throws Exception {
        var body = new HttpRequest.BodyPublisher[parts.length + 1];
        System.arraycopy(parts, 0, body, 0, parts.length);
        body[parts.length] = ofString("--" + BOUNDARY + "--\r\n");
        var request = HttpRequest.newBuilder(analysisUri(port, path))
                .header("Content-Type", "multipart/form-data; boundary=" + BOUNDARY)
                .header("Cookie", session.cookie()).header("Authorization", "synthetic-user-authorization")
                .header("x-api-key", "client-must-not-control-upstream-key").POST(concat(body));
        if (csrf) {
            request.header("X-CSRF-TOKEN", session.csrf());
        }
        return HTTP.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static HttpRequest.BodyPublisher image(String name, String contentType, byte[] bytes) {
        return concat(ofString("--" + BOUNDARY + "\r\nContent-Disposition: form-data; name=\"" + name
                + "\"; filename=\"synthetic-private-filename.png\"\r\nContent-Type: " + contentType + "\r\n\r\n"),
                ofByteArray(bytes), ofString("\r\n"));
    }

    private static HttpServer fakeMl() {
        try {
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/ml/v1/garments/analyze", GarmentAnalysisIntegrationTest::respond);
            server.createContext("/redirected", exchange -> {
                REDIRECTS.incrementAndGet();
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static void respond(HttpExchange exchange) throws IOException {
        try (exchange) {
            CALLS.incrementAndGet();
            RECEIVED.set(new Request(exchange.getRequestMethod(), exchange.getRequestURI().toString(),
                    java.net.http.HttpHeaders.of(exchange.getRequestHeaders(), (name, value) -> true),
                    exchange.getRequestBody().readAllBytes()));
            var reply = REPLY.get();
            exchange.getResponseHeaders().set("Content-Type", reply.type());
            if (reply.status() == 307) {
                exchange.getResponseHeaders().set("Location", "/redirected");
            }
            var bytes = reply.body().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(reply.status(), bytes.length);
            exchange.getResponseBody().write(bytes);
        }
    }

    private static String mlBase() {
        return "http://127.0.0.1:" + ML.getAddress().getPort() + "/ml/";
    }

    private static byte[] png() {
        try (var out = new ByteArrayOutputStream()) {
            ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), "png", out);
            return out.toByteArray();
        } catch (IOException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private record Session(String cookie, String csrf) { }
    private record Request(String method, String path, java.net.http.HttpHeaders headers, byte[] body) { }
    private record Reply(int status, String type, String body) { }

    @TestConfiguration(proxyBeanMethods = false)
    static class Sessions {
        @Bean
        TestSessionController testSessionController() {
            return new TestSessionController();
        }
    }

    @RestController
    static class TestSessionController {
        @GetMapping(path = "/test", headers = "X-Test-Session")
        public String create(@RequestHeader("X-Test-Session") String kind, HttpServletRequest request, CsrfToken csrf) {
            if (!kind.equals("anonymous")) {
                var now = Instant.now();
                var token = new OidcIdToken("synthetic", now, now.plusSeconds(60), Map.of("sub", "analysis-test"));
                Object principal = kind.equals("authenticated")
                        ? new ClosetOidcUser(new DefaultOidcUser(AuthorityUtils.NO_AUTHORITIES, token), USER, false) : "synthetic-user";
                var security = SecurityContextHolder.createEmptyContext();
                security.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                        principal, null, AuthorityUtils.NO_AUTHORITIES));
                request.getSession().setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, security);
            }
            return csrf.getToken();
        }
    }
}
