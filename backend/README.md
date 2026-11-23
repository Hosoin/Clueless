# Backend

Java 21 JDK와 Gradle Wrapper를 사용하는 두 개의 Spring Boot 하위 프로젝트입니다. 아래 명령은 모두 `backend/` 디렉터리에서 실행합니다. Gradle을 별도로 설치할 필요는 없습니다.

## 서비스와 책임

| 하위 프로젝트 | 책임 범위 | 로컬 포트 |
| --- | --- | --- |
| `closet-service` | 옷장·의류 관련 API와 서비스 로직 | `8081` |
| `recommendation-service` | 추천 관련 API와 서비스 로직 | `8082` |

현재는 로컬 실행 기반을 마련하는 단계이며 업무 API는 아직 없습니다. 상대 서비스나 DB가 실행 중이지 않아도 각 서비스를 독립적으로 시작할 수 있습니다.

## 로컬 준비와 빌드

Java 21 **JDK**를 설치하고 `JAVA_HOME`과 `PATH`가 해당 JDK를 가리키도록 설정합니다.

```sh
java -version
./gradlew :closet-service:build :recommendation-service:build
```

최초 빌드에는 Gradle 배포본과 의존성을 다운로드할 인터넷 연결이 필요합니다.

Windows에서는 `./gradlew` 대신 `gradlew.bat`을 사용합니다.

```bat
gradlew.bat :closet-service:build :recommendation-service:build
```

## 로컬 시작

두 서비스를 함께 사용할 때는 **별도 터미널**을 열고 각각 `backend/`에서 실행합니다.

터미널 1 — 옷장 서비스:

```sh
./gradlew :closet-service:bootRun
```

터미널 2 — 추천 서비스:

```sh
./gradlew :recommendation-service:bootRun
```

Windows에서는 각각 다음 명령을 사용합니다.

```bat
gradlew.bat :closet-service:bootRun
```

```bat
gradlew.bat :recommendation-service:bootRun
```

시작 로그에서 오류 없이 기동되었는지, 포트가 각각 `8081`과 `8082`인지 확인합니다. 브라우저에서 `http://localhost:8081/` 또는 `http://localhost:8082/`에 접속하면 업무 API가 없으므로 **404가 나올 수 있습니다**. 루트 경로의 404만으로 기동 실패라고 판단하지 않습니다.

## 로컬 종료

실행한 각 터미널에서 `Ctrl+C`를 눌러 종료합니다. 재실행 시 포트 사용 중 오류가 나면 이전 서비스 프로세스가 종료되었는지 먼저 확인합니다.

## 후속 작업

내일 후속 작업에서 JPA, PostgreSQL, HikariCP 연결과 설정을 다룹니다. 현재 로컬 시작 절차에는 DB 설치·실행이나 DB 접속 정보가 필요하지 않습니다.
