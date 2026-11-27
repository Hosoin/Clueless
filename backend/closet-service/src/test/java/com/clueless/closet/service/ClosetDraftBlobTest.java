package com.clueless.closet.service;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;

import com.azure.core.http.HttpClient;
import com.azure.core.http.HttpHeaderName;
import com.azure.core.http.HttpHeaders;
import com.azure.core.http.HttpMethod;
import com.azure.core.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.Mockito.*;

class ClosetDraftBlobTest {

    private static final String DRAFTS = "closet-drafts";
    private static final String KEY = DRAFTS + "/12345678abcd40128000567890abcdef.webp";
    private static final String ACCOUNT_KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String HTTPS = "https://drafttest.invalid";

    @ParameterizedTest
    @ValueSource(strings = {KEY, DRAFTS + "/12345678-abcd-4012-8000-567890abcdef.webp"})
    void validatesOnlyTheExactBlobAndSignsItForReadOverHttps(String key) {
        var http = mock(HttpClient.class, CALLS_REAL_METHODS);
        fakeProperties(http, key, 32, "image/webp");
        var start = Instant.now();
        var url = URI.create(service(HTTPS, DRAFTS, http).draftPreviewUrl(key));
        assertThat(url.getScheme()).isEqualTo("https");
        assertThat(url.getHost()).isEqualTo("drafttest.invalid");
        assertThat(url.getRawPath()).isEqualTo("/" + key);
        assertThat(url.getRawFragment()).isNull();
        var query = new HashMap<String, String>();
        for (String field : url.getRawQuery().split("&")) {
            var parts = field.split("=", 2);
            assertThat(query.put(parts[0], URLDecoder.decode(parts[1], StandardCharsets.UTF_8))).isNull();
        }
        assertThat(query).containsOnlyKeys("sp", "se", "spr", "sv", "sr", "sig", "rscc", "rsct")
                .containsEntry("sp", "r").containsEntry("spr", "https").containsEntry("sr", "b")
                .containsEntry("rscc", "no-store").containsEntry("rsct", "image/webp");
        assertThat(Instant.parse(query.get("se"))).isBetween(start.plusSeconds(295), start.plusSeconds(305));
        assertThat(query.get("sig")).isNotBlank().isNotEqualTo(ACCOUNT_KEY);
        verify(http).send(any());
    }

    @Test
    void rejectsNonDraftKeysUrlsQueryTraversalAndUnsafeConfigurationWithoutRequests() {
        var http = mock(HttpClient.class, CALLS_REAL_METHODS);
        var service = service(HTTPS, DRAFTS, http);
        for (String key : List.of("closet-drafts/uuid.webp", "another-container/12345678abcd40128000567890abcdef.webp",
                "https://drafttest.invalid/" + KEY, "closet-drafts/../" + KEY, KEY + "?sig=external",
                KEY + "#fragment", KEY.replace(".webp", "%2ewebp"))) {
            fails(service, key, HttpStatus.BAD_GATEWAY);
        }
        fails(service(HTTPS, "other-drafts", http), KEY, HttpStatus.SERVICE_UNAVAILABLE);
        fails(service("http://drafttest.invalid", DRAFTS, http), KEY, HttpStatus.SERVICE_UNAVAILABLE);
        var sasOnly = new ClosetPreviewBlobClient("BlobEndpoint=" + HTTPS + ";SharedAccessSignature="
                + "sr=c&sp=r&sig=synthetic-container-signature", "", DRAFTS, http);
        fails(sasOnly, KEY, HttpStatus.SERVICE_UNAVAILABLE);
        verifyNoInteractions(http);
    }

    @Test
    void doesNotGiveOutUrlsForMissingInvalidOrOversizedBlobs() {
        for (long size : new long[] {0, 10 * 1024 * 1024 + 1}) {
            var http = mock(HttpClient.class, CALLS_REAL_METHODS);
            fakeProperties(http, KEY, size, "image/webp");
            fails(service(HTTPS, DRAFTS, http), KEY, HttpStatus.BAD_GATEWAY);
        }
        var http = mock(HttpClient.class, CALLS_REAL_METHODS);
        fakeProperties(http, KEY, 32, "text/html");
        fails(service(HTTPS, DRAFTS, http), KEY, HttpStatus.BAD_GATEWAY);
        doReturn(Mono.error(new IllegalStateException("synthetic private upstream details"))).when(http).send(any());
        fails(service(HTTPS, DRAFTS, http), KEY, HttpStatus.BAD_GATEWAY);
    }

    private static ClosetPreviewBlobClient service(String endpoint, String drafts, HttpClient http) {
        return new ClosetPreviewBlobClient("BlobEndpoint=" + endpoint + ";AccountName=drafttest;AccountKey=" + ACCOUNT_KEY,
                "test-items", drafts, http);
    }

    private static void fakeProperties(HttpClient http, String path, long size, String type) {
        when(http.send(any())).thenAnswer(call -> {
            var request = call.<com.azure.core.http.HttpRequest>getArgument(0);
            assertThat(request.getHttpMethod()).isEqualTo(HttpMethod.HEAD);
            assertThat(request.getUrl().toString()).isEqualTo(HTTPS + "/" + path);
            var headers = new HttpHeaders().set("Content-Type", type).set("Content-Length", Long.toString(size));
            var response = mock(HttpResponse.class);
            when(response.getRequest()).thenReturn(request);
            when(response.getStatusCode()).thenReturn(200);
            when(response.getHeaders()).thenReturn(headers);
            when(response.getHeaderValue(anyString())).thenAnswer(header -> headers.getValue(header.<String>getArgument(0)));
            when(response.getHeaderValue(any(HttpHeaderName.class)))
                    .thenAnswer(header -> headers.getValue(header.<HttpHeaderName>getArgument(0)));
            return Mono.just(response);
        });
    }

    private static void fails(ClosetPreviewBlobClient blobs, String key, HttpStatus status) {
        assertThatExceptionOfType(ResponseStatusException.class).isThrownBy(() -> blobs.draftPreviewUrl(key))
                .satisfies(ex -> assertThat(ex.getStatusCode()).isEqualTo(status));
    }
}
