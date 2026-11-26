// 추천 데이터의 계층 간 값 변환을 검증하기 위한 테스트 양식입니다.
package com.clueless.recommendation.mapper;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.fail;

class RecommendationMapperTest {

    @Test
    @Disabled("입출력 타입과 변환 규칙 확정 및 구현 후 활성화")
    void mapsRecommendationResultToAgreedOutput() {
        // given: 매핑 대상 필드에 서로 구분되는 값을 넣은 추천 결과 한 건을 준비한다.
        // when: 추천 결과를 확정된 출력 타입으로 변환한다.
        // then: 출력 필드에 원래 결과의 값이 변환 규칙대로 반영되었는지 확인한다.
        fail("추천 결과 변환 시나리오의 검증을 작성해야 합니다.");
    }
}
