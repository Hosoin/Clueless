// 옷장 아이템의 업무 기능을 정의하는 서비스 인터페이스입니다.
package com.clueless.closet.service;

import java.util.List;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import tools.jackson.databind.JsonNode;

public interface ClosetItemService {
    Set<String> CATEGORIES = Set.of("상의", "덧입기", "하의", "아우터", "원피스");

    ItemList list(long userId, String category, String color, String recommendYn);

    ItemDetail detail(long userId, long itemId);

    void delete(long userId, long itemId);

    void confirm(long userId, long itemId, JsonNode input);

    void update(long userId, long itemId, JsonNode input);

    record ItemList(@JsonProperty("total_count") int totalCount, List<ItemSummary> items) { }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    record ItemSummary(String id, String name, @JsonProperty("preview_url") String previewUrl) { }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    record ItemDetail(String id, String name, String category, @JsonProperty("sub_category") String subcategory,
            String color, @JsonProperty("color_hex") String colorHex, String[] styles, String[] tags, String memo,
            @JsonProperty("recommend_yn") String recommendYn, @JsonProperty("preview_url") String previewUrl) { }
}
