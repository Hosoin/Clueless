# Backend

Java 21 JDK와 Gradle Wrapper를 사용하는 두 개의 Spring Boot 하위 프로젝트입니다. 아래 명령은 모두 `backend/` 디렉터리에서 실행합니다. Gradle을 별도로 설치할 필요는 없습니다.

## 서비스와 책임

| 하위 프로젝트 | 책임 범위 | 로컬 포트 |
| --- | --- | --- |
| `closet-service` | 옷장·의류 관련 API와 서비스 로직 | `8081` |
| `recommendation-service` | 추천 관련 API와 서비스 로직 | `8082` |

현재는 로컬 실행 기반을 마련하는 단계이며 업무 API는 아직 없습니다. 두 서비스는 서로 독립적으로 실행하며, 각각의 기본 애플리케이션 설정에 PostgreSQL 연결 정보가 있습니다.

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

## 개발 PostgreSQL 설정

`backend/.env`가 없다면 `.env.example`을 복사하고, 이미 있다면 기존 파일을 사용합니다. 템플릿에는 개발 DB의 `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`와 기본 CA 경로가 채워져 있습니다. `closet-service`와 `recommendation-service`의 `bootRun`과 `livePostgresTest`는 `backend/`를 작업 디렉터리로 사용하며 이 파일 한 개를 읽습니다. 실행 JAR과 일반 `build`·`test`는 이를 자동으로 읽지 않습니다. 일반 `build`·`test`에는 원격 DB와 자격증명이 필요 없습니다.

- `DB_PASSWORD`: 발급받은 개발 DB 비밀번호를 입력합니다. 템플릿의 빈 값으로는 원격 연결을 확인할 수 없습니다.
- `DB_CA_CERT`: 저장소에 포함된 개발 DB의 공개 CA 인증서(`backend/certs/ca.crt`)를 사용하므로 별도 복사 없이 템플릿의 `DB_CA_CERT=certs/ca.crt`를 그대로 사용하면 됩니다. 다른 경로를 사용한다면 `backend/` 기준 상대 경로 또는 절대 경로를 지정하세요.

`.env`는 셸 스크립트가 아닌 Spring의 `.properties` 형식입니다. `KEY=value`로 작성하고 `export`나 값을 감싸는 따옴표를 사용하지 마세요. `.env`와 `backend/certs/ca.crt` 이외의 `backend/certs/` 항목은 Git에서 제외됩니다. 실제 비밀번호나 개인 키는 커밋하거나 공유하지 마세요.

파일 없이도 기존 OS 환경변수와 외부 Spring 설정을 사용할 수 있습니다. OS 환경변수는 `.env`보다 우선합니다. `SPRING_CONFIG_IMPORT`, `SPRING_CONFIG_LOCATION`, `SPRING_CONFIG_ADDITIONAL_LOCATION` 중 하나를 지정하면 `.env`를 자동으로 읽지 않습니다.

| OS 환경변수 | 값 |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | `.env`의 접속 주소, 포트, DB 이름, 계정을 각각 덮어쓸 때 사용 |
| `SPRING_DATASOURCE_URL` | JDBC URL 전체를 지정할 때 사용 (`verify-full`에서는 서버 인증서와 일치하는 호스트명 또는 IP 사용) |
| `SPRING_DATASOURCE_USERNAME` | `DB_USER` 대신 계정을 직접 지정할 때 사용 |
| `SPRING_DATASOURCE_PASSWORD` / `DB_PASSWORD` | 계정 비밀번호 |
| `DB_CA_CERT` | CA 인증서(PEM) 경로 (`dev-no-ca`에서는 불필요) |

`bootRun`과 `livePostgresTest`에서는 OS 환경변수로 지정한 상대 경로도 `backend/` 기준입니다. `java -jar`로 직접 실행하면 상대 경로는 실행 프로세스의 작업 디렉터리 기준입니다. 배포에서는 마운트된 인증서의 절대 경로(예: `/etc/ssl/clueless/ca.crt`)를 사용하세요.

기본 연결은 `verify-full`로 CA 체인과 호스트 이름을 검증합니다. `prod` 또는 `production` 프로필에서도 이 기본값을 유지합니다. 두 모드 모두 클라이언트 인증서·개인 키를 사용하지 않으며 `spring.sql.init.mode=never`로 SQL 스크립트 자동 실행을 끕니다.

CA 파일 없이 연결만 확인하려면 **격리된 개발 환경에서만** `SPRING_PROFILES_ACTIVE=dev-no-ca`를 실행 환경에 설정하세요. `sslmode=require`는 TLS를 강제하지만 서버 인증서와 호스트 이름을 검증하지 않아 중간자 공격을 막지 못합니다. 운영/공용 네트워크에서는 사용하지 말고 검증 후 프로필을 해제하세요.

## 로컬 시작

위 개발 DB 설정을 준비한 뒤 `backend/`에서 실행합니다. 두 서비스를 함께 사용하려면 **별도 터미널**에서 각각 실행합니다.

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

시작 로그에서 오류 없이 기동되었는지, 포트가 각각 `8081`과 `8082`인지 확인한 뒤, 별도 터미널에서 테스트 API를 호출합니다.

```sh
curl -i http://localhost:8081/test
curl -i http://localhost:8082/test
```

두 요청 모두 HTTP `200`과 plain text 응답(`Content-Type: text/plain`, 문자셋 포함 가능)을 반환해야 합니다.

| 요청 | 응답 본문 |
| --- | --- |
| `GET http://localhost:8081/test` | `closet-service 테스트 요청` |
| `GET http://localhost:8082/test` | `recommendation-service 테스트 요청` |

`/test`는 서비스 실행 확인용 API이며 업무 API가 아닙니다. 루트 경로(`/`)는 **404가 나올 수 있으므로**, 루트 경로의 404만으로 기동 실패라고 판단하지 않습니다.

## 로컬 종료

실행한 각 터미널에서 `Ctrl+C`를 눌러 종료합니다. 재실행 시 포트 사용 중 오류가 나면 이전 서비스 프로세스가 종료되었는지 먼저 확인합니다.

## 개발 PostgreSQL 연결 확인 (선택)

위 연결 설정을 적용한 뒤 `backend/`에서 실행합니다.

```sh
./gradlew :closet-service:livePostgresTest :recommendation-service:livePostgresTest
```

격리된 개발 환경에서 CA 없이 확인할 때는 아래 명령을 사용합니다.

```sh
SPRING_PROFILES_ACTIVE=dev-no-ca ./gradlew :closet-service:livePostgresTest :recommendation-service:livePostgresTest
```

테스트는 각 서비스가 자동 구성한 Hikari `DataSource`의 연결 설정을 사용하므로 테스트용 `DB_*` 변수를 별도로 중복 설정할 필요가 없습니다. JDBC URL은 단일 PostgreSQL 호스트를 사용하고 URL 파라미터는 넣지 마세요. 테스트는 PostgreSQL 16, 현재 사용자·DB, 실제 세션의 TLS 및 `public.user_info`/`public.closet_items`의 `SELECT` 권한을 읽기 전용 트랜잭션에서 확인합니다. `/test` 응답은 HTTP 기동만 확인하며 DB 연결 성공을 의미하지 않습니다.
