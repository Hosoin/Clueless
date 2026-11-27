package com.clueless.closet.repository;

import java.sql.Types;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ClosetItemRepository {

    private final JdbcClient jdbc;

    public ClosetItemRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public long insertDraft(long userId, String name, String category, String subcategory, String color, String hex,
            List<String> styles, String metadata, String crop) {
        return jdbc.sql("""
                INSERT INTO public.closet_items (user_id, name, category, subcategory, color, color_hex,
                                                 styles, meta_json, image_blob, status)
                VALUES (:userId, :name, :category, :subcategory, :color, :hex,
                        CAST(:styles AS text[]), CAST(:metadata AS jsonb), :crop, 'DRAFT')
                RETURNING id
                """)
                .param("userId", userId).param("name", name).param("category", category)
                .param("subcategory", subcategory, Types.VARCHAR).param("color", color).param("hex", hex, Types.VARCHAR)
                .param("styles", styles.toArray(String[]::new), Types.ARRAY)
                .param("metadata", metadata).param("crop", crop)
                .query(Long.class).single();
    }

    public Optional<DraftValues> lockDraft(long userId, long itemId) {
        return jdbc.sql("""
                SELECT category, color FROM public.closet_items
                WHERE user_id = ? AND id = ? AND status = 'DRAFT' AND disp_yn = 'Y'
                FOR UPDATE
                """)
                .params(userId, itemId)
                .query((rs, row) -> new DraftValues(rs.getString("category"), rs.getString("color")))
                .optional();
    }

    public boolean edit(long userId, long itemId, boolean confirm, Map<EditField, Object> edits) {
        var params = Map.of("userId", userId, "id", itemId, "status", confirm ? "DRAFT" : "CONFIRMED");
        String where = " WHERE user_id = :userId AND id = :id AND status = :status AND disp_yn = 'Y'";
        if (!confirm && edits.isEmpty()) {
            return jdbc.sql("SELECT id FROM public.closet_items" + where).params(params).query(Long.class).optional().isPresent();
        }

        var assignments = new ArrayList<String>();
        assignments.add("updated_at = clock_timestamp()");
        if (confirm) {
            assignments.add("status = 'CONFIRMED'");
        }
        for (var field : edits.keySet()) {
            String column = field.column();
            assignments.add(column + " = :" + column);
        }
        var statement = jdbc.sql("UPDATE public.closet_items SET " + String.join(", ", assignments) + where).params(params);
        edits.forEach((field, value) -> statement.param(field.column(), value, field.sqlType()));
        return statement.update() == 1;
    }

    public enum EditField {
        NAME, CATEGORY, SUBCATEGORY, COLOR, STYLES, TAGS, MEMO, COLOR_HEX, RECOMMEND_YN;

        private int sqlType() {
            return this == STYLES || this == TAGS ? Types.ARRAY : Types.VARCHAR;
        }

        private String column() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    public record DraftValues(String category, String color) { }

    public List<ListValues> findList(long userId, String category, List<String> colorLabels, String recommendYn) {
        String sql = """
                SELECT id, name, NULLIF(btrim(image_blob), '') IS NOT NULL AS has_image
                FROM public.closet_items
                WHERE user_id = :userId AND status = 'CONFIRMED' AND disp_yn = 'Y'
                """;
        var params = new HashMap<String, Object>();
        params.put("userId", userId);
        if (category != null) {
            sql += " AND category = :category";
            params.put("category", category);
        }
        if (!colorLabels.isEmpty()) {
            // Match legacy aliases without changing stored colors, swatches, or metadata.
            sql += " AND btrim(color) IN (:colorLabels)";
            params.put("colorLabels", colorLabels);
        }
        if (recommendYn != null) {
            sql += " AND recommend_yn = :recommendYn";
            params.put("recommendYn", recommendYn);
        }
        return jdbc.sql(sql + " ORDER BY created_at DESC, id DESC").params(params)
                .query((rs, row) -> new ListValues(rs.getLong("id"), rs.getString("name"), rs.getBoolean("has_image")))
                .list();
    }

    public record ListValues(long id, String name, boolean hasImage) { }

    public Optional<DetailValues> findDetail(long userId, long itemId) {
        return jdbc.sql("""
                SELECT id, name, category, subcategory, color, color_hex, styles, tags, memo, recommend_yn,
                       NULLIF(btrim(image_blob), '') IS NOT NULL AS has_image
                FROM public.closet_items
                WHERE user_id = ? AND id = ? AND status = 'CONFIRMED' AND disp_yn = 'Y'
                """)
                .params(userId, itemId)
                .query((rs, row) -> new DetailValues(rs.getLong("id"), rs.getString("name"), rs.getString("category"),
                        rs.getString("subcategory"), rs.getString("color"), rs.getString("color_hex"),
                        (String[]) rs.getArray("styles").getArray(), (String[]) rs.getArray("tags").getArray(),
                        rs.getString("memo"), rs.getString("recommend_yn"), rs.getBoolean("has_image")))
                .optional();
    }

    public boolean hide(long userId, long itemId) {
        return jdbc.sql("""
                UPDATE public.closet_items SET disp_yn = 'N', updated_at = clock_timestamp()
                WHERE user_id = ? AND id = ? AND status = 'CONFIRMED' AND disp_yn = 'Y'
                """)
                .params(userId, itemId)
                .update() == 1;
    }

    public record DetailValues(long id, String name, String category, String subcategory, String color, String colorHex,
            String[] styles, String[] tags, String memo, String recommendYn, boolean hasImage) { }

    public Optional<String> findImageBlob(long userId, long itemId) {
        return jdbc.sql("""
                SELECT image_blob FROM public.closet_items
                WHERE user_id = ? AND id = ? AND status = 'CONFIRMED' AND disp_yn = 'Y'
                """)
                .params(userId, itemId)
                .query(String.class)
                .optional();
    }
}
