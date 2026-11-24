package com.clueless.recommendation;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RecommendationServiceApplicationTests {

    @LocalServerPort
    private int port;

    @Test
    void testEndpointReturnsApplicationNameAsUtf8Text() {
        ResponseEntity<String> response = RestClient.create("http://localhost:" + port)
                .get().uri("/test").retrieve().toEntity(String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType())
                .isEqualTo(new MediaType("text", "plain", StandardCharsets.UTF_8));
        assertThat(response.getBody()).isEqualTo("recommendation-service 테스트 요청");
    }
}
