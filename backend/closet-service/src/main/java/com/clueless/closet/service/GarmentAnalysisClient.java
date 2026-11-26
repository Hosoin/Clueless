package com.clueless.closet.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse.BodySubscriber;
import java.net.http.HttpTimeoutException;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow.Subscription;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.node.ObjectNode;

import static java.net.http.HttpRequest.BodyPublishers.*;
import static java.net.http.HttpResponse.BodySubscribers.*;

@Service
public class GarmentAnalysisClient implements AutoCloseable {

    private static final int MAX_JSON_BYTES = 5 * 1024 * 1024;
    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1", "[::1]");
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .proxy(HttpClient.Builder.NO_PROXY).followRedirects(HttpClient.Redirect.NEVER).build();
    private final ObjectReader json;
    private final URI endpoint;
    private final String key;
    private final Duration timeout;

    @Autowired
    public GarmentAnalysisClient(@Value("${ML_API_URL:}") String base, @Value("${ML_API_KEY:}") String key,
            ObjectMapper mapper) {
        this(base, key, mapper, Duration.ofSeconds(10));
    }

    GarmentAnalysisClient(String base, String key, ObjectMapper mapper, Duration timeout) {
        this.endpoint = endpoint(base);
        this.key = key;
        this.timeout = timeout;
        this.json = mapper.reader(DeserializationFeature.FAIL_ON_TRAILING_TOKENS,
                DeserializationFeature.FAIL_ON_READING_DUP_TREE_KEY);
    }

    public Result analyze(byte[] image, String subtype) {
        if (endpoint == null || key.isBlank() || !key.chars().allMatch(c -> c >= 33 && c <= 126)) {
            return failure(HttpStatus.SERVICE_UNAVAILABLE);
        }
        var boundary = UUID.randomUUID().toString();
        var body = concat(ofString("--" + boundary + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"image."
                        + subtype + "\"\r\nContent-Type: image/" + subtype + "\r\n\r\n"),
                ofByteArray(image), ofString("\r\n--" + boundary + "--\r\n"));
        var request = HttpRequest.newBuilder(endpoint)
                .header("x-api-key", key)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(body).build();
        var pending = client.sendAsync(request, info -> {
            var type = info.headers().firstValue("Content-Type").orElse("");
            return info.statusCode() == 200 && MediaType.APPLICATION_JSON.equalsTypeAndSubtype(MediaType.parseMediaType(type))
                    ? boundedBody() : replacing((byte[]) null);
        });
        try {
            var response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (response.statusCode() == 400 || response.statusCode() == 422) {
                return failure(HttpStatus.UNPROCESSABLE_CONTENT);
            }
            if (response.statusCode() == 413) {
                return failure(HttpStatus.CONTENT_TOO_LARGE);
            }
            if (response.statusCode() == 429 || response.statusCode() == 503) {
                return failure(HttpStatus.SERVICE_UNAVAILABLE);
            }
            if (response.body() != null) {
                var analysis = json.readTree(response.body());
                if (analysis instanceof ObjectNode object && object.path("retake").isBoolean()) {
                    return new Result(HttpStatus.OK, object, response.body());
                }
            }
        } catch (TimeoutException ex) {
            pending.cancel(true);
            return failure(HttpStatus.GATEWAY_TIMEOUT);
        } catch (InterruptedException ex) {
            pending.cancel(true);
            Thread.currentThread().interrupt();
        } catch (ExecutionException ex) {
            if (ex.getCause() instanceof HttpTimeoutException) {
                return failure(HttpStatus.GATEWAY_TIMEOUT);
            }
        } catch (tools.jackson.core.JacksonException ignored) {
            // Do not expose parser diagnostics or response data.
        }
        return failure(HttpStatus.BAD_GATEWAY);
    }

    private static URI endpoint(String base) {
        try {
            var uri = URI.create(base.strip());
            String host = uri.getHost();
            if (host == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null
                    || uri.getRawFragment() != null || uri.getPort() > 65535) {
                return null;
            }
            host = host.toLowerCase(Locale.ROOT);
            boolean https = "https".equalsIgnoreCase(uri.getScheme());
            if (!https && !("http".equalsIgnoreCase(uri.getScheme()) && LOOPBACK.contains(host))) {
                return null;
            }
            String safeBase = uri.toASCIIString();
            if (!https && host.equals("localhost")) {
                // Do not resolve a plaintext destination through DNS.
                safeBase = "http://127.0.0.1" + (uri.getPort() == -1 ? "" : ":" + uri.getPort()) + uri.getRawPath();
            }
            return URI.create(safeBase.replaceFirst("/+$", "") + "/v1/garments/analyze");
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static BodySubscriber<byte[]> boundedBody() {
        var delegate = ofByteArray();
        return new BodySubscriber<>() {
            private int remaining = MAX_JSON_BYTES;
            private Subscription subscription;

            @Override
            public void onSubscribe(Subscription value) {
                subscription = value;
                delegate.onSubscribe(value);
            }

            @Override
            public void onNext(List<ByteBuffer> buffers) {
                for (var buffer : buffers) {
                    remaining -= buffer.remaining();
                    if (remaining < 0) {
                        subscription.cancel();
                        delegate.onError(new IOException("Analysis response exceeds limit"));
                        return;
                    }
                }
                delegate.onNext(buffers);
            }

            @Override
            public void onError(Throwable error) {
                delegate.onError(error);
            }

            @Override
            public void onComplete() {
                delegate.onComplete();
            }

            @Override
            public CompletionStage<byte[]> getBody() {
                return delegate.getBody();
            }
        };
    }

    private static Result failure(HttpStatus status) {
        return new Result(status, null, null);
    }

    public record Result(HttpStatus status, ObjectNode analysis, byte[] body) { }

    @Override
    public void close() {
        client.shutdownNow();
    }
}
