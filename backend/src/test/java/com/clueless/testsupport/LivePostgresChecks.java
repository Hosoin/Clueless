package com.clueless.testsupport;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.regex.Pattern;
import javax.sql.DataSource;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

import static org.assertj.core.api.Assertions.assertThat;

public final class LivePostgresChecks {

    // pgJDBC URL parameters override the TLS properties checked below.
    private static final Pattern POSTGRES_URL = Pattern.compile(
            "jdbc:postgresql://(?:[a-zA-Z0-9.-]+|\\[[a-fA-F0-9:.]+\\])(?::([0-9]{1,5}))?/([a-zA-Z0-9_.-]+)");

    private LivePostgresChecks() {
    }

    public static void verify(DataSource dataSource, Environment environment) throws SQLException {
        var pool = dataSource.unwrap(HikariDataSource.class);
        assertThat(pool.getDataSource() == null && pool.getDataSourceClassName() == null)
                .as("Hikari connects using its JDBC URL and driver properties").isTrue();
        var url = pool.getJdbcUrl();
        var endpoint = POSTGRES_URL.matcher(url == null ? "" : url);
        assertThat(endpoint.matches()).as("Hikari uses a single PostgreSQL endpoint without URL parameters").isTrue();
        var port = endpoint.group(1);
        assertThat(port == null || (Integer.parseInt(port) > 0 && Integer.parseInt(port) <= 65535))
                .as("Hikari JDBC URL has a valid TCP port").isTrue();
        var database = endpoint.group(2);
        var user = pool.getUsername();
        assertThat(user != null && !user.isBlank() && !user.contains("${"))
                .as("Hikari uses a resolved database username").isTrue();

        var properties = pool.getDataSourceProperties();
        var noCa = environment.acceptsProfiles(Profiles.of("dev-no-ca & !prod & !production"));
        assertThat(properties.getProperty("sslmode")).isEqualTo(noCa ? "require" : "verify-full");
        var caCert = properties.getProperty("sslrootcert");
        if (noCa) {
            assertThat(caCert == null || caCert.isEmpty()).as("dev-no-ca does not use a CA file").isTrue();
        } else {
            requireCaCertificate(caCert);
        }
        assertThat(properties.getProperty("sslcert")).isEmpty();
        assertThat(properties.getProperty("sslkey")).isEmpty();
        assertThat(properties.getProperty("sslfactory")).isNull();
        assertThat(properties.getProperty("sslhostnameverifier")).isNull();
        assertThat(properties.getProperty("gssEncMode")).isEqualTo("disable");
        assertThat(environment.getProperty("spring.sql.init.mode")).isEqualTo("never");

        try (var connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            connection.setReadOnly(true);
            try (var statement = connection.createStatement()) {
                statement.setQueryTimeout(5);
                try (var result = statement.executeQuery("""
                        SELECT current_database(), current_user, session_user = current_user,
                               current_setting('server_version_num')::int / 10000, ssl, version,
                               current_setting('transaction_read_only') = 'on'
                        FROM pg_catalog.pg_stat_ssl WHERE pid = pg_backend_pid()
                        """)) {
                    assertThat(result.next()).as("this connection's pg_stat_ssl row").isTrue();
                    assertThat(database.equals(result.getString(1)))
                            .as("current_database() matches the configured database").isTrue();
                    assertThat(user.equals(result.getString(2)))
                            .as("current_user matches the configured user").isTrue();
                    assertThat(result.getBoolean(3)).as("session_user equals current_user").isTrue();
                    assertThat(result.getInt(4)).as("PostgreSQL major version").isEqualTo(16);
                    assertThat(result.getBoolean(5)).as("server reports TLS for this session").isTrue();
                    assertThat(result.getString(6)).as("negotiated TLS protocol").startsWith("TLSv");
                    assertThat(result.getBoolean(7)).as("transaction is read-only").isTrue();
                }
                try (var result = statement.executeQuery("SELECT 1")) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getInt(1)).isEqualTo(1);
                }
                checkTable(statement, "user_info");
                checkTable(statement, "closet_items");
            }
            // Closing the pooled connection rolls back the read-only transaction.
        }
    }

    private static void checkTable(Statement statement, String table) throws SQLException {
        try (ResultSet result = statement.executeQuery("SELECT * FROM public." + table + " LIMIT 0")) {
            assertThat(result.next()).isFalse();
        } catch (SQLException e) {
            throw new SQLException("SELECT LIMIT 0 on public." + table + " (SQLSTATE " + e.getSQLState() + ")", e.getSQLState());
        }
    }

    private static void requireCaCertificate(String path) {
        if (path != null && !path.isBlank() && !path.contains("${")) {
            try (var input = Files.newInputStream(Path.of(path))) {
                var certificates = CertificateFactory.getInstance("X.509").generateCertificates(input);
                if (!certificates.isEmpty() && certificates.stream().allMatch(
                        certificate -> certificate instanceof X509Certificate x509 && x509.getBasicConstraints() >= 0)) {
                    return;
                }
            } catch (InvalidPathException | IOException | CertificateException ignored) {
                // Report the setting name instead of the local path or file contents.
            }
        }
        throw new IllegalArgumentException("Configured sslrootcert (DB_CA_CERT by default) must point to a readable X.509 CA certificate or bundle");
    }
}
