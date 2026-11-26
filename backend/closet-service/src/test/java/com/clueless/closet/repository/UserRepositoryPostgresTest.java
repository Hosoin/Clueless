package com.clueless.closet.repository;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

// Only opt in with a fresh, disposable loopback cluster and an empty closet_user_repo_test database.
@EnabledIfEnvironmentVariable(named = "CLOSET_TEMP_POSTGRES_PORT", matches = "[0-9]+")
class UserRepositoryPostgresTest {

    private static JdbcTemplate sql;
    private static UserRepository users;
    private static TransactionTemplate transaction;

    @BeforeAll
    static void createFixture() {
        var port = Integer.parseInt(System.getenv("CLOSET_TEMP_POSTGRES_PORT"));
        var dataSource = new DriverManagerDataSource(
                "jdbc:postgresql://127.0.0.1:" + port + "/closet_user_repo_test?sslmode=disable",
                "closet_test", "");
        sql = new JdbcTemplate(dataSource);
        users = new UserRepository(JdbcClient.create(sql));
        transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        sql.execute("""
                CREATE TABLE public.user_info (
                    id bigint GENERATED ALWAYS AS IDENTITY (START WITH 5000000000) PRIMARY KEY,
                    user_name text, nick_name text, email text,
                    auth_provider text NOT NULL, provider_user_id text NOT NULL,
                    preferred_styles text[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'ACTIVE',
                    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
                    UNIQUE (auth_provider, provider_user_id)
                )
                """);
    }

    @Test
    void createsUserWithProfileAndKeepsTheExistingRowUnchanged() {
        var subject = "opaque-sub'1";
        long id = users.findOrCreateId("google", subject, "O'Name", "claim@example.invalid");
        assertThat(id).isGreaterThan(Integer.MAX_VALUE);
        var before = userRow(id);
        assertThat(before)
                .containsEntry("auth_provider", "google").containsEntry("provider_user_id", subject)
                .containsEntry("status", "ACTIVE")
                .containsEntry("user_name", "O'Name").containsEntry("email", "claim@example.invalid");
        assertThat((String) before.get("nick_name")).matches("[가-힣]{1,8}[0-9]{4}");

        assertThat(users.findOrCreateId("google", subject, "Other Name", "other@example.invalid")).isEqualTo(id);
        assertThat(userRow(id)).isEqualTo(before);
        assertThat(users.findOrCreateId("other-provider", subject, null, null)).isNotEqualTo(id);
        assertThat(users.findOrCreateId("google", "another-sub", null, "claim@example.invalid")).isNotEqualTo(id);
    }

    @Test
    void backfillsOnlyMissingFieldsWithAvailableValues() {
        var subject = "legacy-sub";
        long id = users.findOrCreateId("google", subject, null, null);
        sql.update("UPDATE public.user_info SET nick_name = 'kept' WHERE id = ?", id);
        var before = userRow(id);
        assertThat(before).containsEntry("user_name", null).containsEntry("email", null);

        assertThat(users.findOrCreateId("google", subject, null, null)).isEqualTo(id);
        assertThat(userRow(id)).isEqualTo(before);

        assertThat(users.findOrCreateId("google", subject, null, "kept@example.invalid")).isEqualTo(id);
        assertThat(userRow(id)).containsEntry("user_name", null).containsEntry("email", "kept@example.invalid");

        assertThat(users.findOrCreateId("google", subject, "Backfilled Name", "other@example.invalid")).isEqualTo(id);
        assertThat(userRow(id)).containsEntry("user_name", "Backfilled Name")
                .containsEntry("email", "kept@example.invalid").containsEntry("nick_name", "kept");

        sql.update("UPDATE public.user_info SET nick_name = NULL, email = NULL WHERE id = ?", id);
        assertThat(users.findOrCreateId("google", subject, null, "backfilled@example.invalid")).isEqualTo(id);
        assertThat(userRow(id)).containsEntry("email", "backfilled@example.invalid").containsEntry("nick_name", null);
    }

    @Test
    void readsOnlyTheMatchingProfileAndDistinguishesNullFieldsFromMissingUser() {
        long first = users.findOrCreateId("google", "profile-first", "First Name", "first@example.invalid");
        long second = users.findOrCreateId("google", "profile-second", null, null);
        sql.update("UPDATE public.user_info SET nick_name = ? WHERE id = ?", "first-nickname", first);
        sql.update("UPDATE public.user_info SET nick_name = NULL WHERE id = ?", second);

        assertThat(users.findProfileById(first)).contains(
                new UserRepository.UserProfile(first, "First Name", "first-nickname", "first@example.invalid"));
        assertThat(users.findProfileById(second)).contains(new UserRepository.UserProfile(second, null, null, null));
        assertThat(users.findProfileById(-1)).isEmpty();
    }

    @Test
    void concurrentFirstLoginsReturnTheIdOfTheSingleRow() throws Exception {
        var subject = "concurrent-sub";
        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = transaction.execute(status -> {
                long firstId = users.findOrCreateId("google", subject, "First Name", null);
                var firstNickname = (String) userRow(firstId).get("nick_name");
                assertThat(firstNickname).matches("[가-힣]{1,8}[0-9]{4}");
                var concurrent = executor.submit(() ->
                        users.findOrCreateId("google", subject, "Other Name", "second@example.invalid"));
                awaitBlockedQuery("INSERT INTO public.user_info%");
                return new PendingLogin(firstId, firstNickname, concurrent);
            });

            assertThat(pending.concurrent().get(5, TimeUnit.SECONDS)).isEqualTo(pending.firstId());
            assertThat(userRow(pending.firstId())).containsEntry("user_name", "First Name")
                    .containsEntry("email", "second@example.invalid")
                    .containsEntry("nick_name", pending.nickname());
        }
        assertThat(sql.queryForObject("""
                SELECT count(*) FROM public.user_info WHERE auth_provider = ? AND provider_user_id = ?
                """, Long.class, "google", subject)).isEqualTo(1);
    }

    @Test
    void concurrentBackfillsKeepTheFirstValuesAndDoNotUpdateAgain() throws Exception {
        var subject = "concurrent-existing-sub";
        long id = users.findOrCreateId("google", subject, null, null);
        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = transaction.execute(status -> {
                assertThat(users.findOrCreateId("google", subject, "First Name", "first@example.invalid"))
                        .isEqualTo(id);
                var firstRow = userRow(id);
                var concurrent = executor.submit(() ->
                        users.findOrCreateId("google", subject, "Other Name", "other@example.invalid"));
                awaitBlockedQuery("UPDATE public.user_info%");
                return Map.entry(firstRow, concurrent);
            });

            assertThat(pending.getValue().get(5, TimeUnit.SECONDS)).isEqualTo(id);
            assertThat(userRow(id)).isEqualTo(pending.getKey());
        }
    }

    private static Map<String, Object> userRow(long id) {
        return sql.queryForMap("""
                SELECT auth_provider, provider_user_id, status, user_name, email, nick_name,
                    u::text AS row_contents, xmin::text AS row_version
                FROM public.user_info AS u WHERE id = ?
                """, id);
    }

    private static void awaitBlockedQuery(String query) {
        await().atMost(Duration.ofSeconds(5)).until(() -> Boolean.TRUE.equals(sql.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
                    AND wait_event_type = 'Lock' AND query LIKE ?)
                """, Boolean.class, query)));
    }

    private record PendingLogin(long firstId, String nickname, Future<Long> concurrent) {
    }
}
