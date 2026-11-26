package com.clueless.closet.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.IntUnaryOperator;
import java.util.stream.IntStream;

import com.clueless.closet.repository.ClosetItemRepository;
import com.clueless.closet.service.impl.ClosetItemServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.Mockito.*;

// Opt in only with two empty databases in a fresh loopback cluster, never a development database.
@EnabledIfEnvironmentVariable(named = "CLOSET_DRAFT_TEMP_POSTGRES_PORT", matches = "[0-9]+")
class ClosetDraftPostgresTest {

    private static final Path SQL = Path.of("../db/closet");
    private static final String BLOB = "closet-drafts/12345678abcd40128000567890abcdef.webp";
    private static final String LEGACY_KEY = "items/1/legacy.webp";

    @Test
    void freshSchemaAndDraftStoreUseOneUnicodeLimitedNameAndProtectVisibility() throws Exception {
        var db = sql("closet_draft_fresh_test");
        db.execute(Files.readString(SQL.resolve("schema.sql")));
        long owner = createUser(db, "owner");
        long other = createUser(db, "other");
        db.execute("ALTER TABLE public.closet_items ALTER COLUMN id RESTART WITH 9007199254740993");
        var items = new ClosetItemRepository(JdbcClient.create(db));
        try (var ml = mock(GarmentAnalysisClient.class)) {
            var json = new JsonMapper();
            var blobs = mock(ClosetPreviewBlobClient.class);
            when(blobs.draftPreviewUrl(BLOB)).thenReturn("https://blob.invalid/" + BLOB + "?sig=synthetic");
            var service = new ClosetDraftService(ml, blobs, items);
            for (int length : List.of(49, 50, 51)) {
                String unicode = "옷" + "🧥".repeat(length - 1);
                var metadata = (ObjectNode) json.readTree("""
                        {"retake":false,"category":{"name":"아우터"},"style":{"tags":["캐주얼"]},
                         "color_name":null,"embedding":[0.25],"crop_blob":"%s"}
                        """.formatted(BLOB));
                metadata.putObject("subcategory").put("name", unicode);
                when(ml.analyze(any(), eq("png"))).thenReturn(new GarmentAnalysisClient.Result(HttpStatus.OK, metadata, null));
                var response = (ClosetDraftService.Draft) service.analyze(owner, new byte[] {1}, "png");
                long id = Long.parseLong(response.id());
                assertThat(id).isGreaterThanOrEqualTo(9_007_199_254_740_993L);
                String expected = "옷" + "🧥".repeat(Math.min(50, length) - 1);
                assertThat(response.name()).isEqualTo(expected);
                assertThat(response.hex()).isNull();
                var row = db.queryForMap("""
                        SELECT user_id, name, char_length(name) AS chars, color, color_hex, status, disp_yn, image_blob,
                               styles[1] AS first_style, meta_json->'embedding' AS embedding,
                               meta_json->'crop_blob' AS crop, meta_json->'subcategory'->>'name' AS model_name
                        FROM public.closet_items WHERE id = ?
                        """, id);
                assertThat(row).containsEntry("name", response.name()).containsEntry("chars", Math.min(length, 50))
                        .containsEntry("status", "DRAFT").containsEntry("disp_yn", "Y").containsEntry("user_id", owner)
                        .containsEntry("color", "").containsEntry("color_hex", null)
                        .containsEntry("image_blob", BLOB).containsEntry("first_style", "캐주얼")
                        .containsEntry("crop", null).containsEntry("model_name", unicode);
                assertThat(row.get("embedding").toString()).isEqualTo("[0.25]");
                assertThat(items.findImageBlob(owner, id)).isEmpty();
            }

            var metadata = (ObjectNode) json.readTree("""
                    {"retake":false,"category":{"name":"상의"},"color_name":{"name":"네이비"},
                     "colors":[{"name":"검정","rgb":[0,0,0]},{"name":"네이비","rgb":[38,50,79]}],"crop_blob":"%s"}
                    """.formatted(BLOB));
            when(ml.analyze(any(), eq("png"))).thenReturn(new GarmentAnalysisClient.Result(HttpStatus.OK, metadata, null));
            var response = (ClosetDraftService.Draft) service.analyze(owner, new byte[] {1}, "png");
            assertThat(response.hex()).isEqualTo("#26324F");
            assertThat(db.queryForMap("SELECT status, color_hex FROM public.closet_items WHERE id = ?",
                    Long.parseLong(response.id()))).containsEntry("status", "DRAFT").containsEntry("color_hex", response.hex());
        }
        long visible = db.queryForObject("""
                INSERT INTO public.closet_items (user_id, category, color, image_blob, status)
                VALUES (?, '상의', '네이비', ?, 'CONFIRMED') RETURNING id
                """, Long.class, owner, LEGACY_KEY);
        assertStatusRequired(db, owner);
        assertThat(items.findImageBlob(owner, visible)).contains(LEGACY_KEY);
        assertThat(items.findImageBlob(other, visible)).isEmpty();
        db.update("UPDATE public.closet_items SET disp_yn = 'N' WHERE id = ?", visible);
        assertThat(items.findImageBlob(owner, visible)).isEmpty();
        assertThat(db.queryForObject("SELECT status FROM public.closet_items WHERE id = ?", String.class, visible))
                .isEqualTo("CONFIRMED");
        assertConstraints(db, visible);
        checkItemWrites(db, items, owner, other);
    }

    private static void checkItemWrites(JdbcTemplate db, ClosetItemRepository items, long owner, long other) throws Exception {
        var service = new ClosetItemServiceImpl(items);
        var tx = new TransactionTemplate(new DataSourceTransactionManager(db.getDataSource()));
        var json = new JsonMapper();
        String ml = "{\"colors\":[{\"name\":\"검정\",\"rgb\":[0,0,0]}],\"embedding\":[0.25,-0.5]}";
        long clean = items.insertDraft(owner, "기본 이름", "상의", null, "검정", "#000000", List.of("캐주얼"), ml, BLOB);
        long missingColor = items.insertDraft(owner, "기본 이름", "상의", "셔츠", "", null, List.of("캐주얼"), ml, BLOB);
        long hidden = items.insertDraft(owner, "숨긴 의류", "상의", null, "검정", "#000000", List.of(), ml, BLOB);
        db.update("UPDATE public.closet_items SET disp_yn = 'N' WHERE id = ?", hidden);
        db.update("UPDATE public.closet_items SET tags = ARRAY['old'], memo = 'old', updated_at = '2000-01-01 UTC' WHERE id = ?",
                missingColor);
        var before = db.queryForMap("SELECT * FROM public.closet_items WHERE id = ?", missingColor);
        String rowJson = "SELECT to_jsonb(i)::text FROM public.closet_items i WHERE id = ?";
        String beforeJson = db.queryForObject(rowJson, String.class, missingColor);

        assertThat(items.findImageBlob(owner, clean)).isEmpty();
        assertThat(status(() -> tx.executeWithoutResult(s -> service.confirm(other, clean, json.readTree("{}"))))).isEqualTo(404);
        assertThat(status(() -> tx.executeWithoutResult(s -> service.confirm(owner, hidden, json.readTree("{}"))))).isEqualTo(404);
        assertThat(status(() -> service.update(owner, clean, json.readTree("{}")))).isEqualTo(404);
        assertThat(status(() -> tx.executeWithoutResult(s -> service.confirm(owner, missingColor, json.readTree("{\"name\":\"미저장\"}")))))
                .isEqualTo(400);
        assertThat(db.queryForObject(rowJson, String.class, missingColor)).isEqualTo(beforeJson);
        tx.executeWithoutResult(s -> service.confirm(owner, clean, json.readTree("{}")));
        assertThat(db.queryForObject("SELECT color_hex FROM public.closet_items WHERE id = ?", String.class, clean))
                .isEqualTo("#000000");
        assertThat(items.findImageBlob(owner, clean)).contains(BLOB);
        assertThat(items.findImageBlob(other, clean)).isEmpty();

        String name = "옷" + "🧥".repeat(49);
        tx.executeWithoutResult(s -> service.confirm(owner, missingColor, json.readTree("""
                {"name":"%s","category":"아우터","sub_category":null,"color":"블루","styles":[],"tags":[],"memo":"","hex":"#00bbff"}
                """.formatted(name))));
        var confirmed = db.queryForMap("SELECT * FROM public.closet_items WHERE id = ?", missingColor);
        assertThat(confirmed).containsEntry("status", "CONFIRMED").containsEntry("name", name).containsEntry("category", "아우터")
                .containsEntry("subcategory", null).containsEntry("color", "블루").containsEntry("memo", "")
                .containsEntry("color_hex", "#00bbff").containsEntry("image_blob", BLOB)
                .containsEntry("meta_json", before.get("meta_json")).containsEntry("created_at", before.get("created_at"));
        assertThat(confirmed.get("updated_at")).isNotEqualTo(before.get("updated_at"));
        assertThat(db.queryForMap("SELECT cardinality(styles) AS styles, cardinality(tags) AS tags FROM public.closet_items WHERE id = ?",
                missingColor)).containsEntry("styles", 0).containsEntry("tags", 0);
        assertThat(status(() -> tx.executeWithoutResult(s -> service.confirm(owner, missingColor, json.readTree("{\"name\":\"retry\"}")))))
                .isEqualTo(404);
        assertThat(status(() -> service.update(other, missingColor, json.readTree("{\"name\":\"foreign\"}")))).isEqualTo(404);
        assertThat(status(() -> service.update(owner, Long.MAX_VALUE, json.readTree("{}")))).isEqualTo(404);
        String confirmedJson = db.queryForObject(rowJson, String.class, missingColor);
        service.update(owner, missingColor, json.readTree("{}"));
        assertThat(db.queryForObject(rowJson, String.class, missingColor)).isEqualTo(confirmedJson);

        assertThat(race(i -> status(() -> service.update(owner, missingColor, json.readTree(i == 0
                ? "{\"memo\":\"edited\",\"hex\":null}" : "{\"tags\":[\"봄\",\"쉼,표\"]}")))))
                .containsExactly(204, 204);
        var updated = db.queryForMap("SELECT *, tags[2] AS second_tag FROM public.closet_items WHERE id = ?", missingColor);
        assertThat(updated).containsEntry("name", name).containsEntry("color", "블루").containsEntry("memo", "edited")
                .containsEntry("second_tag", "쉼,표").containsEntry("color_hex", null).containsEntry("meta_json", before.get("meta_json"));
        assertThat(updated.get("updated_at")).isNotEqualTo(confirmed.get("updated_at"));
        db.update("UPDATE public.closet_items SET disp_yn = 'N' WHERE id = ?", missingColor);
        assertThat(status(() -> service.update(owner, missingColor, json.readTree("{\"memo\":\"hidden\"}")))).isEqualTo(404);
        assertThat(items.findImageBlob(owner, missingColor)).isEmpty();

        long contested = items.insertDraft(owner, "경쟁 확정", "하의", null, "검정", "#000000", List.of(), ml, BLOB);
        var confirmedOnce = race(i -> status(() -> tx.executeWithoutResult(s -> service.confirm(owner, contested,
                json.readTree("{\"memo\":\"confirm-" + i + "\"}")))));
        assertThat(confirmedOnce).containsExactlyInAnyOrder(204, 404);
        assertThat(db.queryForObject("SELECT memo FROM public.closet_items WHERE id = ?", String.class, contested))
                .isEqualTo("confirm-" + confirmedOnce.indexOf(204));
    }

    private static int status(Runnable action) {
        try {
            action.run();
            return 204;
        } catch (ResponseStatusException ex) {
            return ex.getStatusCode().value();
        }
    }

    private static List<Integer> race(IntUnaryOperator action) throws Exception {
        try (var workers = Executors.newFixedThreadPool(2)) {
            var start = new CyclicBarrier(2);
            var both = IntStream.range(0, 2).mapToObj(i -> workers.submit(() -> {
                start.await(5, TimeUnit.SECONDS);
                return action.applyAsInt(i);
            })).toList();
            return List.of(both.get(0).get(10, TimeUnit.SECONDS), both.get(1).get(10, TimeUnit.SECONDS));
        }
    }

    @Test
    void migrationsKeepLegacyDataAndRequireExplicitStatus() throws Exception {
        var db = sql("closet_draft_migration_test");
        db.execute("""
                CREATE TABLE public.user_info (
                    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, auth_provider text, provider_user_id text
                );
                CREATE TABLE public.closet_items (
                    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    user_id bigint NOT NULL REFERENCES public.user_info(id), category text NOT NULL, subcategory text,
                    color text NOT NULL, styles text[] NOT NULL DEFAULT '{}', memo text, meta_json jsonb, image_blob text
                );
                """);
        long owner = createUser(db, "migration-owner");
        long id = db.queryForObject("""
                INSERT INTO public.closet_items (user_id, category, color, memo, image_blob, meta_json)
                VALUES (?, '상의', '네이비', 'keep this', ?, '{"legacy": true}') RETURNING id
                """, Long.class, owner, LEGACY_KEY);
        db.execute(Files.readString(SQL.resolve("migrations/001_closet_drafts.sql")));
        db.execute(Files.readString(SQL.resolve("migrations/002_drop_closet_items_status_default.sql")));
        db.execute(Files.readString(SQL.resolve("migrations/003_closet_item_color_hex.sql")));
        assertStatusRequired(db, owner);
        assertThat(db.queryForMap("""
                SELECT status, disp_yn, name, memo, meta_json->>'legacy' AS legacy, user_id, color_hex
                FROM public.closet_items WHERE id = ?
                """, id)).containsEntry("status", "CONFIRMED").containsEntry("disp_yn", "Y").containsEntry("name", null)
                .containsEntry("memo", "keep this").containsEntry("legacy", "true").containsEntry("user_id", owner)
                .containsEntry("color_hex", null);
        assertThat(new ClosetItemRepository(JdbcClient.create(db)).findImageBlob(owner, id)).contains(LEGACY_KEY);
        assertConstraints(db, id);
    }

    private static void assertStatusRequired(JdbcTemplate db, long owner) {
        assertThatExceptionOfType(DataIntegrityViolationException.class)
                .isThrownBy(() -> db.update("""
                        INSERT INTO public.closet_items (user_id, category, color) VALUES (?, '상의', '네이비')
                        """, owner))
                .withMessageContaining("\"status\"");
    }

    private static void assertConstraints(JdbcTemplate db, long id) {
        for (String update : List.of("disp_yn = 'X'", "disp_yn = NULL", "status = 'HIDDEN'", "name = repeat('🧥', 51)")) {
            assertThatExceptionOfType(DataIntegrityViolationException.class)
                    .isThrownBy(() -> db.update("UPDATE public.closet_items SET " + update + " WHERE id = ?", id));
        }
    }

    private static long createUser(JdbcTemplate db, String sub) {
        return db.queryForObject("INSERT INTO public.user_info (auth_provider, provider_user_id) VALUES ('google', ?) RETURNING id",
                Long.class, sub);
    }

    private static JdbcTemplate sql(String database) {
        int port = Integer.parseInt(System.getenv("CLOSET_DRAFT_TEMP_POSTGRES_PORT"));
        return new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:postgresql://127.0.0.1:" + port + "/" + database + "?sslmode=disable", "closet_test", ""));
    }
}
