// 옷장 아이템 저장소의 저장과 조회를 검증하기 위한 테스트 양식입니다.
package com.clueless.closet.repository;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.fail;

class ClosetItemRepositoryTest {

    @Test
    @Disabled("저장소 계약과 구현 확정 후 활성화")
    void retrievesPersistedClosetItem() {
        // given: 격리된 테스트 저장소와 유효한 옷장 아이템 한 건을 준비한다.
        // when: 아이템을 저장한 뒤 확정된 조회 조건으로 다시 읽는다.
        // then: 조회한 아이템의 저장 대상 필드가 원본과 일치하는지 확인한다.
        fail("저장과 조회 시나리오의 검증을 작성해야 합니다.");
    }
}
