// 옷장 아이템의 업무 기능을 정의하는 서비스 인터페이스입니다.
package com.clueless.closet.service;

import java.util.Set;

import tools.jackson.databind.JsonNode;

public interface ClosetItemService {
    Set<String> CATEGORIES = Set.of("상의", "덧입기", "하의", "아우터", "원피스");

    void confirm(long userId, long itemId, JsonNode input);

    void update(long userId, long itemId, JsonNode input);
}
