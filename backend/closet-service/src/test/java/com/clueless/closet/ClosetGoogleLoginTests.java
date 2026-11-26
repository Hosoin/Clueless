package com.clueless.closet;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:postgresql://localhost:1/binding_test",
        "spring.datasource.username=binding_test", "spring.datasource.password=synthetic",
        "DB_CA_CERT=synthetic CA.pem",
        "GOOGLE_CLIENT_ID=synthetic-client-id", "GOOGLE_CLIENT_SECRET=synthetic-client-secret"
})
class ClosetGoogleLoginTests {

    @LocalServerPort
    private int port;

    @Test
    void loginStartRedirectsToGoogleWithStateAndNonce() throws Exception {
        var response = get("/oauth2/authorization/google");
        assertThat(response.statusCode()).isEqualTo(302);
        var location = URI.create(response.headers().firstValue("Location").orElseThrow());
        assertThat(location.getScheme()).isEqualTo("https");
        assertThat(location.getHost()).isEqualTo("accounts.google.com");
        assertThat(location.getPath()).isEqualTo("/o/oauth2/v2/auth");

        var params = UriComponentsBuilder.fromUriString(location.toString()).build().getQueryParams();
        assertThat(params.getFirst("response_type")).isEqualTo("code");
        assertThat(params.getFirst("client_id")).isEqualTo("synthetic-client-id");
        assertThat(UriUtils.decode(params.getFirst("scope"), StandardCharsets.UTF_8).split(" "))
                .containsExactlyInAnyOrder("openid", "profile", "email");
        assertThat(params.getFirst("state")).isNotBlank();
        assertThat(params.getFirst("nonce")).isNotBlank();
        assertThat(params.getFirst("redirect_uri"))
                .isEqualTo("http://localhost:" + port + "/login/oauth2/code/google");
        assertThat(params).doesNotContainKey("client_secret");
    }

    @Test
    void rejectsAnonymousAccessAndCallbackWithoutLoginSession(@Autowired FilterChainProxy security) throws Exception {
        assertThat(get("/login/success").statusCode()).isEqualTo(401);
        assertThat(get("/").statusCode()).isEqualTo(401);
        assertThat(get("/test/private").statusCode()).isEqualTo(401);
        assertThat(get("/login/oauth2/code/google?error=access_denied&state=synthetic").statusCode())
                .isEqualTo(401);
        assertThat(security.getFilters("/test")).anyMatch(CsrfFilter.class::isInstance);
    }

    private HttpResponse<Void> get(String path) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(url(path)).GET().build(), HttpResponse.BodyHandlers.discarding());
        }
    }

    private URI url(String path) {
        return URI.create("http://localhost:" + port + path);
    }
}
