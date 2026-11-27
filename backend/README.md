# Backend

Java 21 JDK와 Gradle Wrapper를 사용하는 두 개의 Spring Boot 하위 프로젝트입니다. 아래 명령은 모두 `backend/` 디렉터리에서 실행합니다. Gradle을 별도로 설치할 필요는 없습니다.

**팀원용 문서:** [백엔드 로컬 실행 가이드](docs/LOCAL_SETUP.md) · [로그인·내 정보·로그아웃 API 명세](docs/AUTH_API.md)

## 서비스와 책임

| 하위 프로젝트 | 책임 범위 | 로컬 포트 |
| --- | --- | --- |
| `closet-service` | Google 로그인 및 옷장·의류 서비스 로직 | `8081` |
| `recommendation-service` | 추천 관련 API와 서비스 로직 | `8082` |

옷장 서비스는 Google 로그인과 의류 분석·미리보기·최종 저장·부분 편집 API를 제공합니다. 두 서비스는 서로 독립적으로 실행하며, 각각의 기본 애플리케이션 설정에 PostgreSQL 연결 정보가 있습니다.

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

`/test`는 인증 없이 사용할 수 있는 기동 확인용 API입니다. 옷장 서비스의 루트 경로(`/`)는 미인증 시 `401`을 반환할 수 있으므로 기동 확인에는 `/test`를 사용하세요.

## 옷장 서비스 Google 로그인

`GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET`을 모두 설정한 뒤 `/oauth2/authorization/google`로 시작합니다. 로컬 콜백 주소는 `http://localhost:8081/login/oauth2/code/google`입니다. 요청 범위는 `openid profile email`입니다.

검증된 Google ID 토큰의 `sub`로 사용자를 식별합니다. 별도의 UserInfo 요청 없이 토큰의 `name`을 `public.user_info.user_name`에, `email_verified`가 불리언 `true`인 경우에만 `email`을 저장합니다. 이름이나 검증된 이메일이 없어도 로그인할 수 있습니다. 신규 사용자에게만 개인정보를 사용하지 않은 표시용 랜덤 닉네임(한글 조합과 숫자, 최대 12자)을 부여합니다. 닉네임은 고유 식별자가 아니므로 중복될 수 있습니다. 재로그인 시에는 비어 있는 이름과 이메일만 채울 수 있으며, 닉네임이 `NULL`인 기존 행도 그대로 둡니다.

로그인 성공 시 백엔드는 `FRONTEND_LOGIN_SUCCESS_URL`에 지정한 FE 주소로 `302` 리디렉션합니다. 미설정 시 `http://localhost:5173/home`을 사용하고, 운영 설정 예시는 `FRONTEND_LOGIN_SUCCESS_URL=https://dev.example.com/`입니다. 이 값은 Google 콘솔에 등록하는 백엔드 콜백(로컬: `http://localhost:8081/login/oauth2/code/google`)이나 CORS 설정을 바꾸지 않습니다. FE는 아래 API를 같은 오리진(또는 같은 오리진의 프록시)으로 세션 쿠키와 함께 호출하는 것을 권장합니다. 로컬 CORS 범위는 의류 최종 저장 및 부분 편집 절을 참고하세요.

| 요청 | 결과 |
| --- | --- |
| `GET /api/auth/me` | 본인 세션의 사용자 정보로 `200` 및 `{"id":"5000000000","userName":null,"nickName":null,"email":null}` 형태의 JSON을 반환합니다. `id`는 문자열, `userName`·`nickName`·`email`은 각각 문자열 또는 JSON `null`입니다. 세션이 없거나 사용자 행이 없으면 `401`. 응답은 `Cache-Control: no-store`와 `X-CSRF-TOKEN` 헤더를 포함합니다. |
| `POST /api/auth/logout` | 같은 세션 쿠키와 `/api/auth/me`의 `X-CSRF-TOKEN` 응답 헤더 값을 `X-CSRF-TOKEN` 요청 헤더에 그대로 보냅니다. 성공하면 클루리스 세션을 폐기하고 `204`를 반환하며 이후 `/api/auth/me`는 `401`입니다. 토큰이 없거나 틀리면 `403`이고 로그아웃되지 않습니다. `GET` 요청은 로그아웃하지 않으며 Google 세션은 유지됩니다. |

기존 응답의 `nickname` 키는 `nickName`으로 교체되었습니다. FE는 `nickname` 대신 `nickName`을 읽어야 합니다.

## 의류 API 설정 및 스키마

- [의류 전용 빈 설정 템플릿](closet-service/.env.example)의 항목을 환경변수 또는 `bootRun`이 읽는 Git 제외 `backend/.env`에 설정합니다. 배포 JAR은 `.env`를 자동으로 읽지 않습니다. `ML_API_URL`은 `/v1/garments/analyze`를 제외한 기본 주소(HTTPS, 루프백만 HTTP 허용), `ML_API_KEY`는 서버 간 인증 키입니다. Blob 연결 문자열·키·서명 URL은 로그, 이슈, 커밋에 남기지 마세요.
- `AZURE_STORAGE_CONNECTION_STRING`은 Blob 조회와 분석 미리보기용 SAS 발급에 사용합니다. SAS 발급에는 계정 키 인증이 필요합니다. `BLOB_DRAFTS_CONTAINER`는 ML이 쓰는 `closet-drafts` 컨테이너와 일치해야 하고, `BLOB_CONTAINER_NAME`은 기존 등록 의류 이미지의 컨테이너 설정입니다. 분석과 ML 크롭 프리뷰에는 후자 설정이 필요하지 않습니다.
- 새 DB에는 [`db/closet/schema.sql`](db/closet/schema.sql)을 적용합니다. 기존 DB에는 [`001` → `002` → `003` 마이그레이션](db/closet/migrations)을 배포 전에 수동으로 한 번씩 적용합니다. 기존 등록 행은 `CONFIRMED`/`Y`로 보존되고, `002`부터 모든 신규 INSERT는 `status`를 명시해야 합니다. Spring은 SQL을 자동 적용하지 않습니다.
- **배포 전 확인:** 비재촬영 응답에는 ML이 업로드한 `crop_blob` 키가 필요합니다(`closet-drafts/<UUID>.webp`). 현재 `main`의 base64 PNG만 반환하는 ML로는 비재촬영 분석이 `502`로 끝납니다. 또한 confirm은 DB 상태만 변경합니다. Blob 복사·이동은 하지 않으므로 원본 컨테이너의 수명 정책이 Blob을 삭제하면 확정된 의류의 미리보기도 사라집니다. Blob 호환 ML과 확정 Blob 보존 방안을 별도로 확인하세요.

## 의류 분석

`POST /api/closet/analyze` (`POST /api/closet/items/analyze`도 같은 운영 API)는 로그인 세션 쿠키와 같은 세션의 `/api/auth/me`에서 받은 `X-CSRF-TOKEN`을 요구합니다. FE는 같은 오리진 또는 같은 오리진의 프록시로 호출하세요.

`multipart/form-data`의 `image` 파일 항목 하나로 JPEG·PNG·WebP(최대 10 MiB)를 보냅니다. multipart `Content-Type`과 boundary는 클라이언트가 자동 설정하도록 둡니다.

| 분석 결과 | `200 OK` 응답 및 저장 |
| --- | --- |
| 재촬영 필요 | `{"retake":true}`만 반환합니다. DB 저장과 ID 발급은 없습니다. |
| 재촬영 불필요 | 본인의 `DRAFT`를 저장한 뒤 `id`, `previewImg`, `category`, `sub_category`, `color`, `hex`, `styles`, `name`, `retake`를 반환합니다. `id`는 bigint의 **문자열**이며 `retake`는 `false`입니다. 예측값이 없으면 `sub_category`, `color`, `hex`는 JSON `null`, `styles`는 빈 배열일 수 있습니다. |

`previewImg`는 WebP Blob 하나를 읽는 HTTPS 전용 SAS URL(발급 후 5분 유효)입니다. 재사용할 영구 주소가 아니며 로깅·공유하지 마세요. 잘못된 multipart는 `400`, 초과 크기는 `413`, 지원하지 않는 형식은 `415`, ML이 읽지 못한 이미지는 `422`입니다. 연동 오류는 `502`/`503`/`504`로 응답하며 상위 응답 내용이나 접속 정보를 반환하지 않습니다.

## 의류 최종 저장 및 부분 편집

| 요청 | 처리 |
| --- | --- |
| `POST /api/closet/items/{id}/confirm` | 본인의 보이는 `DRAFT`를 `CONFIRMED`로 변경합니다. `{}`를 보내면 분석 값을 그대로 사용합니다. 분석에서 색을 선택하지 못했다면 `color`를 입력해야 합니다. |
| `PATCH /api/closet/items/{id}` | 본인의 보이는 `CONFIRMED` 의류의 지정 필드만 갱신합니다. `{}`는 변경 없이 의류를 확인합니다. |

두 요청은 로그인 세션 쿠키와 같은 세션의 `X-CSRF-TOKEN`을 요구하며, `Content-Type: application/json`의 JSON 객체(최대 64 KiB)를 받습니다. 성공은 `204 No Content`로 본문이 없습니다. 존재하지 않거나 다른 사용자 소유, 숨김, 해당 요청에 맞지 않는 상태의 의류는 모두 `404`입니다(확정 재호출 포함). 잘못된 ID·필드·본문은 `400`, 초과 본문은 `413`, DB 오류는 `503`입니다.

필드: `name`(최대 50자), `category`(상의·덧입기·하의·아우터·원피스), `sub_category`, `color`, `styles`·`tags`(문자열 배열), `memo`(문자열), `hex`(`#RRGGBB`). 생략한 필드는 유지합니다. `sub_category`와 `hex`는 `null`, 목록은 `[]`, 메모는 `""`로 지울 수 있습니다. `status`, 소유자 정보, 이미지 키 및 ML 메타데이터는 편집할 수 없습니다.

같은 오리진이나 프록시를 권장합니다. 직접 호출 시 로컬 FE `http://localhost:5173`에는 `/api/auth/me`의 `X-CSRF-TOKEN` 헤더 조회와 위 confirm/PATCH만 CORS로 허용됩니다. 그 경우에도 `credentials: 'include'`와 CSRF 헤더가 필요합니다.

## 등록 의류 이미지 미리보기

`GET /api/closet/preview?id=<id>`는 세션 쿠키를 요구하고 CSRF 토큰은 필요하지 않습니다. 본인의 보이는 `CONFIRMED` 의류에 이미지가 있으면 `200`과 JPEG·PNG·WebP 바이트를 반환합니다. 대상·이미지가 없으면 `404`이며, `DRAFT`는 이 경로로 조회할 수 없습니다. 응답은 `Cache-Control: no-store`를 사용하고 Blob URL이나 SAS로 리디렉션하지 않습니다.

## 분석 요청만 로컬에서 확인하기 (선택)

`./gradlew :closet-service:runLocalGarmentAnalysis`를 실행하고 Postman에서 `POST http://127.0.0.1:18081/api/closet/items/analyze`에 운영 API와 같은 `image` 파일을 보냅니다. **이 테스트용 실행기만** 세션·CSRF 없이 호출할 수 있습니다. `ML_API_URL`/`ML_API_KEY`를 설정하면 해당 ML을 실제 호출하고 원본 JSON을 반환합니다. DB 삽입·Blob 조회·SAS 발급은 하지 않으며, 키를 Postman에 입력할 필요가 없습니다. 포트를 프록시나 터널로 공개하지 마세요. 실행기는 배포 JAR에 포함되지 않습니다. 외부 연동 없이 확인할 때는 기본 Gradle 테스트를 사용하세요.

## 로컬 종료

실행한 각 터미널에서 `Ctrl+C`를 눌러 종료합니다. 재실행 시 포트 사용 중 오류가 나면 이전 서비스 프로세스가 종료되었는지 먼저 확인합니다.

## 격리 PostgreSQL에서 의류 스키마 테스트 (선택)

새로 만든 루프백 PostgreSQL 클러스터에 빈 `closet_draft_fresh_test`, `closet_draft_migration_test` DB를 준비하고 해당 클러스터의 `closet_test` 사용자로 접속할 수 있게 합니다. 새 스키마와 기존 스키마의 업그레이드 경로를 각각 테스트합니다. 개발·운영 DB에서는 실행하지 마세요.

```sh
# 55432는 예시입니다. 격리 클러스터의 실제 포트로 바꾸세요.
CLOSET_DRAFT_TEMP_POSTGRES_PORT=55432 ./gradlew :closet-service:test --rerun --tests '*ClosetDraftPostgresTest'
```

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
