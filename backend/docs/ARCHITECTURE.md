# 백엔드 구조

PR #7의 로컬 실행 기반과 PR에 반영된 `/test` API·응답 검증 테스트, 현재 추가된 계층별 골격과 테스트 양식을 정리한 문서입니다. **PR #7의 기존 검증 범위는 두 서비스의 단독 기동과 동시 기동**입니다. 업무 API·서비스 간 통신·DB 연동까지 검증했다는 뜻은 아닙니다. 빌드와 실행 명령, 테스트 API의 curl 확인 방법은 [Backend README](../README.md)를 참고합니다.

## 디렉터리·파일 구조와 역할

```text
backend/
├── README.md                                                               # 준비 사항·빌드·실행 안내
├── build.gradle                                                            # 공통 Java 21·Spring Boot 4.2.0·MVC 설정
├── closet-service/
│   └── src/
│       ├── main/
│       │   ├── java/
│       │   │   └── com/
│       │   │       └── clueless/
│       │   │           └── closet/
│       │   │               ├── ClosetServiceApplication.java               # 서비스 진입점
│       │   │               ├── controller/
│       │   │               │   └── TestController.java                     # GET /test UTF-8 plain text 응답 (PR 반영됨)
│       │   │               ├── mapper/
│       │   │               │   └── ClosetItemMapper.java                   # 계층 간 변환 클래스, 변환 로직 미구현
│       │   │               ├── repository/
│       │   │               │   └── ClosetItemRepository.java               # 빈 저장소 인터페이스
│       │   │               └── service/
│       │   │                   ├── ClosetItemService.java                  # 빈 서비스 인터페이스
│       │   │                   └── impl/
│       │   │                       └── ClosetItemServiceImpl.java          # 서비스 구현체 (@Service), 업무 로직 미구현
│       │   └── resources/
│       │       └── application.yml                                         # 서비스 이름·포트 8081
│       └── test/
│           └── java/
│               └── com/
│                   └── clueless/
│                       └── closet/
│                           ├── ClosetServiceApplicationTests.java          # 기동·/test 응답 검증 (서비스별 1개)
│                           ├── mapper/
│                           │   └── ClosetItemMapperTest.java               # JUnit 테스트 양식 (@Disabled·미구현)
│                           ├── repository/
│                           │   └── ClosetItemRepositoryTest.java           # JUnit 테스트 양식 (@Disabled·미구현)
│                           └── service/
│                               └── ClosetItemServiceTest.java              # JUnit 테스트 양식 (@Disabled·미구현)
├── docs/
│   └── ARCHITECTURE.md                                                     # 구조·현재 범위·후속 방향
├── gradle/
│   └── wrapper/
│       ├── gradle-wrapper.jar                                              # Gradle Wrapper 실행 코드
│       └── gradle-wrapper.properties                                       # Gradle 배포 설정
├── gradlew                                                                 # Unix용 Gradle 실행 스크립트
├── gradlew.bat                                                             # Windows용 Gradle 실행 스크립트
├── recommendation-service/
│   └── src/
│       ├── main/
│       │   ├── java/
│       │   │   └── com/
│       │   │       └── clueless/
│       │   │           └── recommendation/
│       │   │               ├── RecommendationServiceApplication.java       # 서비스 진입점
│       │   │               ├── controller/
│       │   │               │   └── TestController.java                     # GET /test UTF-8 plain text 응답 (PR 반영됨)
│       │   │               ├── mapper/
│       │   │               │   └── RecommendationMapper.java               # 계층 간 변환 클래스, 변환 로직 미구현
│       │   │               ├── repository/
│       │   │               │   └── RecommendationRepository.java           # 빈 저장소 인터페이스 (추천 이력 영속화 채택 시)
│       │   │               └── service/
│       │   │                   ├── RecommendationService.java              # 빈 서비스 인터페이스
│       │   │                   └── impl/
│       │   │                       └── RecommendationServiceImpl.java      # 서비스 구현체 (@Service), 업무 로직 미구현
│       │   └── resources/
│       │       └── application.yml                                         # 서비스 이름·포트 8082
│       └── test/
│           └── java/
│               └── com/
│                   └── clueless/
│                       └── recommendation/
│                           ├── RecommendationServiceApplicationTests.java  # 기동·/test 응답 검증 (서비스별 1개)
│                           ├── mapper/
│                           │   └── RecommendationMapperTest.java           # JUnit 테스트 양식 (@Disabled·미구현)
│                           ├── repository/
│                           │   └── RecommendationRepositoryTest.java       # JUnit 테스트 양식 (@Disabled·미구현)
│                           └── service/
│                               └── RecommendationServiceTest.java          # JUnit 테스트 양식 (@Disabled·미구현)
└── settings.gradle                                                         # 두 서비스 등록
```

## 현재 범위와 확정된 후속 방향

- `closet-service`는 옷장·의류 관련 API와 서비스 로직을, `recommendation-service`는 추천 관련 API와 서비스 로직을 담당
- 현재는 업무 API가 없는 실행 기반 단계입니다. 상대 서비스나 DB 없이도 각각 기동할 수 있으며, 루트 경로의 404 응답만으로 기동 실패라고 판단하지 않습니다.
- PR 반영 완료: 각 서비스의 기존 main Java 패키지 하위 `controller/TestController.java`가 `GET /test`에 HTTP `200`과 plain text 응답을 반환합니다. 옷장 서비스(`8081`)의 본문은 `closet-service 테스트 요청`, 추천 서비스(`8082`)의 본문은 `recommendation-service 테스트 요청`입니다. 애플리케이션 테스트 2개(서비스별 1개)는 기동·HTTP 상태·UTF-8 Content-Type·응답 본문을 검증하며 통과한 테스트입니다. 계층별 JUnit 테스트 양식 6개(서비스·저장소·매퍼 각 2개)는 `@Disabled`로 제외되어 있으므로 통과한 테스트에 포함하지 않습니다. 각 양식은 given/when/then과 미구현 시 실패하는 `fail(...)`을 포함합니다.
- 두 서비스 모두 빈 서비스 인터페이스와 이를 구현하는 `@Service` 구현체, 빈 저장소 인터페이스, 빈 매퍼 클래스를 갖추고 있습니다. 업무 메서드·저장·조회·변환 로직은 아직 없으며 `/test` 컨트롤러와 연결된 업무 흐름도 아닙니다.
- 추천 저장소는 **추천 이력 영속화를 채택하는 경우에만** 계약과 구현을 정의하는 조건부 골격이며, 추천 서비스의 DB 사용이 확정됐다는 뜻은 아닙니다.
- **JPA·PostgreSQL·HikariCP 사용은 확정된 후속 방향**입니다. 현재도 JPA 의존성·엔티티·저장소 구현과 DB 연결·설정은 없으며, 현재 실행에 DB 설치나 접속 정보는 필요하지 않습니다.
- 서비스 간 보유 의류 조회, ML 연동, 배포 환경은 현재 도식의 구현·검증 범위에 포함하지 않습니다.

## /todo

- [ ] 프론트엔드의 분석·확정 저장 API 요청·응답 계약 확정
- [ ] 사용자·의류 테이블의 키와 NULL 허용 정책 확정
- [ ] 서비스 간 보유 옷 조회 계약 확정
- [ ] ML 입출력과 오류 처리 계약 확정
- [ ] 배포 상세 구성 확정(Compose/AKS 등)
