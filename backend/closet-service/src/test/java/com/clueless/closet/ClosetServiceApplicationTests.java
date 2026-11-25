package com.clueless.closet;

import java.nio.charset.StandardCharsets;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:postgresql://localhost:1/binding_test",
        "spring.datasource.username=binding_test", "spring.datasource.password=synthetic",
        "DB_CA_CERT=synthetic CA.pem"
})
class ClosetServiceApplicationTests {

    @LocalServerPort
    private int port;

    @Test
    void bindsPostgresSettingsWithoutConnecting(@Autowired HikariDataSource pool, @Autowired Environment environment) {
        assertThat(environment.getProperty("spring.sql.init.mode")).isEqualTo("never");
        assertThat(pool.getJdbcUrl()).isEqualTo("jdbc:postgresql://localhost:1/binding_test");
        assertThat(pool.getDriverClassName()).isEqualTo("org.postgresql.Driver");
        assertThat(pool.getUsername()).isEqualTo("binding_test");
        assertThat("synthetic".equals(pool.getPassword())).as("password was bound").isTrue();
        assertThat(pool.getDataSourceProperties())
                .containsEntry("sslmode", "verify-full")
                .containsEntry("sslrootcert", "synthetic CA.pem")
                .containsEntry("sslcert", "")
                .containsEntry("sslkey", "")
                .containsEntry("gssEncMode", "disable");
        assertThat(pool.isRunning()).isFalse();
    }

    @Test
    void testEndpointReturnsApplicationNameAsUtf8Text() {
        ResponseEntity<String> response = RestClient.create("http://localhost:" + port)
                .get().uri("/test").retrieve().toEntity(String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType())
                .isEqualTo(new MediaType("text", "plain", StandardCharsets.UTF_8));
        assertThat(response.getBody()).isEqualTo("closet-service 테스트 요청");
    }
}
