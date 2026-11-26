// 추천 이력을 영속화하기로 결정한 경우에만 사용하는 저장소 테스트 양식입니다.
package com.clueless.recommendation.repository;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.fail;

class RecommendationRepositoryTest {

    @Test
    @Disabled("추천 이력 영속화와 저장소 계약이 확정되고 구현된 경우에만 활성화")
    void retrievesRecommendationHistoryIfPersistenceIsAdopted() {
        // given: 옷장 DB와 무관한 격리된 테스트 저장소와 유효한 추천 이력 한 건을 준비한다.
        // when: 이력을 저장한 뒤 확정된 조회 조건으로 다시 읽는다.
        // then: 조회한 이력의 값이 합의된 영속화 대상과 일치하는지 확인한다.
        fail("추천 이력 저장과 조회 시나리오의 검증을 작성해야 합니다.");
    }
}
