// 옷장 아이템 서비스의 업무 흐름을 검증하기 위한 테스트 양식입니다.
package com.clueless.closet.service;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.fail;

class ClosetItemServiceTest {

    @Test
    @Disabled("등록 규칙과 서비스 계약 확정 및 구현 후 활성화")
    void registersClosetItemWithValidInput() {
        // given: 등록 규칙을 만족하는 입력 하나와 저장 성공을 반환하는 저장소 대역을 준비한다.
        // when: 서비스의 아이템 등록 기능을 한 번 호출한다.
        // then: 입력 내용이 저장소에 한 번 전달되고, 서비스가 계약대로 등록 결과를 반환하는지 확인한다.
        fail("등록 시나리오의 검증을 작성해야 합니다.");
    }
}
