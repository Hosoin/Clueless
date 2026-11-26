// 추천 서비스의 업무 흐름을 검증하기 위한 테스트 양식입니다.
package com.clueless.recommendation.service;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.fail;

class RecommendationServiceTest {

    @Test
    @Disabled("추천 규칙과 서비스 계약 확정 및 구현 후 활성화")
    void handlesNoEligibleRecommendations() {
        // given: 유효한 추천 입력과 추천할 후보가 하나도 없는 상황을 테스트 데이터로 준비한다.
        // when: 서비스의 추천 기능을 한 번 호출한다.
        // then: 임의의 추천 항목을 생성하지 않고, 후보가 없을 때의 합의된 결과를 반환하는지 확인한다.
        fail("추천 후보 없음 시나리오의 검증을 작성해야 합니다.");
    }
}
