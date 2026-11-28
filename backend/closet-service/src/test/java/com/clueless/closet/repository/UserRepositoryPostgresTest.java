package com.clueless.closet.repository;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.clueless.closet.repository.UserRepository.LoginUser;

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
        var firstLogin = users.findOrCreate("google", subject, "O'Name", "claim@example.invalid");
        long id = firstLogin.id();
        assertThat(firstLogin.newUser()).isTrue();
        assertThat(id).isGreaterThan(Integer.MAX_VALUE);
        var before = userRow(id);
        assertThat(before)
                .containsEntry("auth_provider", "google").containsEntry("provider_user_id", subject)
                .containsEntry("status", "ACTIVE")
                .containsEntry("user_name", "O'Name").containsEntry("email", "claim@example.invalid");
        assertThat((String) before.get("nick_name")).matches("[가-힣]{1,8}[0-9]{4}");

        assertThat(users.findOrCreate("google", subject, "Other Name", "other@example.invalid"))
                .isEqualTo(new LoginUser(id, false));
        assertThat(userRow(id)).isEqualTo(before);
        assertThat(users.findOrCreate("other-provider", subject, null, null).id()).isNotEqualTo(id);
        assertThat(users.findOrCreate("google", "another-sub", null, "claim@example.invalid").id()).isNotEqualTo(id);
    }

    @Test
    void backfillsOnlyMissingFieldsWithAvailableValues() {
        var subject = "legacy-sub";
        long id = users.findOrCreate("google", subject, null, null).id();
        sql.update("UPDATE public.user_info SET nick_name = 'kept' WHERE id = ?", id);
        var before = userRow(id);
        assertThat(before).containsEntry("user_name", null).containsEntry("email", null);

        assertThat(users.findOrCreate("google", subject, null, null).id()).isEqualTo(id);
        assertThat(userRow(id)).isEqualTo(before);

        assertThat(users.findOrCreate("google", subject, null, "kept@example.invalid").id()).isEqualTo(id);
        assertThat(userRow(id)).containsEntry("user_name", null).containsEntry("email", "kept@example.invalid");

        assertThat(users.findOrCreate("google", subject, "Backfilled Name", "other@example.invalid").id()).isEqualTo(id);
        assertThat(userRow(id)).containsEntry("user_name", "Backfilled Name")
                .containsEntry("email", "kept@example.invalid").containsEntry("nick_name", "kept");

        sql.update("UPDATE public.user_info SET nick_name = NULL, email = NULL WHERE id = ?", id);
        assertThat(users.findOrCreate("google", subject, null, "backfilled@example.invalid").id()).isEqualTo(id);
        assertThat(userRow(id)).containsEntry("email", "backfilled@example.invalid").containsEntry("nick_name", null);
    }

    @Test
    void readsOnlyTheMatchingProfileAndDistinguishesNullFieldsFromMissingUser() {
        long first = users.findOrCreate("google", "profile-first", "First Name", "first@example.invalid").id();
        long second = users.findOrCreate("google", "profile-second", null, null).id();
        sql.update("UPDATE public.user_info SET nick_name = ? WHERE id = ?", "first-nickname", first);
        sql.update("UPDATE public.user_info SET nick_name = NULL WHERE id = ?", second);

        assertThat(users.findProfileById(first)).contains(
                new UserRepository.UserProfile(first, "First Name", "first-nickname", "first@example.invalid", List.of()));
        assertThat(users.findProfileById(second)).contains(
                new UserRepository.UserProfile(second, null, null, null, List.of()));
        assertThat(users.findProfileById(-1)).isEmpty();
    }

    @Test
    void concurrentPartialUpdatesPreserveBothChangesAndLeaveOtherUsersAlone() throws Exception {
        var subject = "profile-update-first";
        long id = users.findOrCreate("google", subject, "First", null).id();
        long other = users.findOrCreate("google", "profile-update-other", "Other", null).id();
        sql.update("UPDATE public.user_info SET updated_at = '2000-01-01T00:00:00Z' WHERE id = ?", id);
        var before = userRow(id);
        var otherBefore = userRow(other);
        var styles = List.of("클래식", "미니멀");
        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = transaction.execute(status -> {
                assertThat(users.updateProfile(id, "새'닉", null)).isTrue();
                var concurrent = executor.submit(() -> users.updateProfile(id, null, styles));
                awaitBlockedQuery("UPDATE public.user_info%");
                return concurrent;
            });
            assertThat(pending.get(5, TimeUnit.SECONDS)).isTrue();
            assertThat(userRow(id).get("updated_at")).isNotEqualTo(before.get("updated_at"));
        }
        assertThat(users.findOrCreate("google", subject, "Ignored", "backfilled@example.invalid"))
                .isEqualTo(new LoginUser(id, false));
        assertThat(users.findProfileById(id)).contains(new UserRepository.UserProfile(
                id, "First", "새'닉", "backfilled@example.invalid", styles));
        assertThat(userRow(other)).isEqualTo(otherBefore);
        assertThat(users.updateProfile(-1, "없는닉", List.of())).isFalse();
    }

    @Test
    void emptyPreferencesClearStylesWithoutReplacingTheNicknameAndCanBeRepeated() {
        long id = users.findOrCreate("google", "empty-preferences", "Member", null).id();
        assertThat(users.updateProfile(id, "새로운닉", List.of("페미닌"))).isTrue();
        assertThat(users.updateProfile(id, null, List.of())).isTrue();
        assertThat(sql.queryForObject("SELECT cardinality(preferred_styles) FROM public.user_info WHERE id = ?",
                Integer.class, id)).isZero();
        assertThat(users.updateProfile(id, null, List.of())).isTrue();
        assertThat(users.findProfileById(id)).contains(
                new UserRepository.UserProfile(id, "Member", "새로운닉", null, List.of()));
    }

    @Test
    void concurrentFirstLoginsOnlyMarkTheInsertWinnerAsNew() throws Exception {
        var subject = "concurrent-sub";
        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = transaction.execute(status -> {
                var first = users.findOrCreate("google", subject, "First Name", null);
                long firstId = first.id();
                assertThat(first.newUser()).isTrue();
                var firstNickname = (String) userRow(firstId).get("nick_name");
                assertThat(firstNickname).matches("[가-힣]{1,8}[0-9]{4}");
                var concurrent = executor.submit(() ->
                        users.findOrCreate("google", subject, "Other Name", "second@example.invalid"));
                awaitBlockedQuery("INSERT INTO public.user_info%");
                return new PendingLogin(firstId, firstNickname, concurrent);
            });

            assertThat(pending.concurrent().get(5, TimeUnit.SECONDS)).isEqualTo(new LoginUser(pending.firstId(), false));
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
        long id = users.findOrCreate("google", subject, null, null).id();
        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = transaction.execute(status -> {
                assertThat(users.findOrCreate("google", subject, "First Name", "first@example.invalid"))
                        .isEqualTo(new LoginUser(id, false));
                var firstRow = userRow(id);
                var concurrent = executor.submit(() ->
                        users.findOrCreate("google", subject, "Other Name", "other@example.invalid"));
                awaitBlockedQuery("UPDATE public.user_info%");
                return Map.entry(firstRow, concurrent);
            });

            assertThat(pending.getValue().get(5, TimeUnit.SECONDS)).isEqualTo(new LoginUser(id, false));
            assertThat(userRow(id)).isEqualTo(pending.getKey());
        }
    }

    private static Map<String, Object> userRow(long id) {
        return sql.queryForMap("""
                SELECT auth_provider, provider_user_id, status, user_name, email, nick_name, updated_at,
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

    private record PendingLogin(long firstId, String nickname, Future<LoginUser> concurrent) {
    }
}
