package com.clueless.testsupport;

import java.sql.SQLException;
import javax.sql.DataSource;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PostgresTlsProfileTests {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(context -> {
                var sources = context.getEnvironment().getPropertySources();
                sources.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
                sources.remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
                new ConfigDataApplicationContextInitializer().initialize(context);
            })
            .withConfiguration(AutoConfigurations.of(DataSourceAutoConfiguration.class))
            .withPropertyValues("spring.config.location=classpath:/application.yml",
                    "spring.datasource.url=jdbc:postgresql://localhost:1/binding_test",
                    "spring.datasource.username=binding_test", "spring.datasource.password=synthetic");

    @Test
    void devNoCaReachesConnectionCheckWithoutACaFile() {
        runner.withPropertyValues("spring.profiles.active=dev-no-ca").run(context -> {
            var pool = context.getBean(HikariDataSource.class);
            assertThat(pool.getDataSourceProperties())
                    .containsEntry("sslmode", "require")
                    .containsEntry("sslrootcert", "");

            var dataSource = mock(DataSource.class);
            when(dataSource.unwrap(HikariDataSource.class)).thenReturn(pool);
            var noConnection = new SQLException("No PostgreSQL connection in a configuration test");
            when(dataSource.getConnection()).thenThrow(noConnection);
            assertThatThrownBy(() -> LivePostgresChecks.verify(dataSource, context.getEnvironment()))
                    .isSameAs(noConnection);
            assertThat(pool.isRunning()).isFalse();
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"dev-no-ca,prod", "dev-no-ca,production"})
    void productionProfilesRetainCertificateVerification(String profiles) {
        runner.withPropertyValues("spring.profiles.active=" + profiles, "DB_CA_CERT=synthetic CA.pem")
                .run(context -> {
                    var pool = context.getBean(HikariDataSource.class);
                    assertThat(pool.getDataSourceProperties())
                            .containsEntry("sslmode", "verify-full")
                            .containsEntry("sslrootcert", "synthetic CA.pem");
                    assertThat(pool.isRunning()).isFalse();
                });
    }
}
