# 백엔드 로컬 실행 가이드

**Google 로그인·회원가입·내 정보·로그아웃을 테스트할 때는 `closet-service`(8081)만 실행한다.** 추천 서비스(8082)나 Azure ML은 필요 없다. API 요청·응답 예시는 [인증 API 명세](AUTH_API.md)를 참고한다.

## 1. 코드와 실행 환경 준비

- 인증 코드와 `backend/.env.example`의 Google 항목이 포함된 작업본을 사용한다. DB 연결만 반영된 이전 버전에는 인증 API가 없다.
- Java 21 **JDK**를 준비하고 `java -version`으로 확인한다. 저장소의 Gradle Wrapper를 쓰므로 Gradle을 따로 설치하지 않는다. 최초 실행에는 의존성 다운로드를 위한 인터넷 연결이 필요하다.
- 아래 명령은 모두 저장소 루트에서 `cd backend` 한 뒤 실행한다. Windows 기준 셸은 PowerShell이다.
- 공용 개발 백엔드를 사용하면 서버 실행 담당자만 아래 비밀값을 설정한다. FE만 실행하는 팀원은 백엔드 주소만 받으면 된다. 로컬 백엔드를 직접 실행하는 팀원은 본인의 `backend/.env`가 필요하다.

## 2. `backend/.env` 준비

기존 `.env`는 덮어쓰지 않는다. 없을 때만 템플릿을 복사한다.

```sh
# macOS / Linux
[ -e .env ] || (umask 077; cp .env.example .env)
```

```powershell
# Windows PowerShell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

텍스트 편집기로 `.env`를 열어 `KEY=value`로 입력한다. `export`, 따옴표는 넣지 않는다.

| 항목 | 설정 |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | 팀 개발 DB는 템플릿 기본값 사용(`clueless_dev`, `clueless_app`). |
| `DB_PASSWORD` | 별도로 전달받은 DB 비밀번호 입력. |
| `DB_CA_CERT` | 템플릿의 `certs/ca.crt` 유지. 공개 CA가 저장소에 있으므로 별도 설치하지 않는다. 기본 `verify-full`이 인증서와 호스트를 확인한다. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 팀의 Google 웹 애플리케이션 자격증명. **둘 다** 있어야 `closet-service`의 Google 로그인이 활성화된다. |
| `FRONTEND_LOGIN_SUCCESS_URL` | 로그인 성공 후 이동할 FE 주소(선택). 항목을 생략하면 `http://localhost:5173/home`을 사용한다. |

`bootRun`과 `livePostgresTest`는 `backend/` 기준으로 `.env`와 상대 CA 경로를 읽는다. 기존 OS 환경변수가 `.env`보다 우선하며, 외부 Spring 설정 경로를 명시한 경우 `.env` 자동 로딩이 생략될 수 있다. 값을 바꾸면 앱을 재시작한다. `java -jar`는 이 Gradle 설정을 사용하지 않는다. 실제 `.env`·비밀번호·Client Secret은 Git, 채팅, FE의 `VITE_*`에 넣지 않는다.

**Google 콘솔 확인:** 승인된 리디렉션 URI는 `http://localhost:8081/login/oauth2/code/google`이다. FE 주소나 `/login/success`를 등록하지 않는다. 앱이 테스트 모드라면 허용된 테스트 계정을 쓴다. 배포 시에는 실제 공개 HTTPS 콜백을 별도로 등록한다.

## 3. 빌드하고 실행하기

| 목적 | macOS / Linux | Windows PowerShell |
|---|---|---|
| 일반 빌드·테스트 | `./gradlew :closet-service:build :recommendation-service:build` | `.\gradlew.bat :closet-service:build :recommendation-service:build` |
| **인증 백엔드 실행** | `./gradlew :closet-service:bootRun` | `.\gradlew.bat :closet-service:bootRun` |
| 추천 서비스도 필요한 경우 | `./gradlew :recommendation-service:bootRun` | `.\gradlew.bat :recommendation-service:bootRun` |

추천 서비스는 별도 터미널에서 실행한다. 종료는 각 터미널에서 `Ctrl+C`. 일반 빌드 성공은 원격 DB 접속이나 Google 로그인 성공을 의미하지 않는다.

## 4. 실행 확인 — 어디까지 성공했는지 구분하기

1. **앱 기동:** 브라우저로 `http://localhost:8081/test`를 열어 `200`과 `closet-service 테스트 요청`을 확인한다. 추천 서비스를 실행했다면 `http://localhost:8082/test`도 확인할 수 있다.
2. **DB 연결(선택):** `backend/`에서 아래 전용 테스트를 실행한다. 서버를 미리 띄울 필요는 없다. 기본 프로필은 TLS·DB 계정·두 테이블의 조회 권한을 확인하며 회원을 생성하지 않는다.

   ```sh
   ./gradlew --continue :closet-service:livePostgresTest :recommendation-service:livePostgresTest
   ```
   Windows PowerShell에서는 `./gradlew` 대신 `.\gradlew.bat`을 쓴다.

3. **실제 Google 로그인:** `closet-service`를 실행하고 `http://localhost:8081/oauth2/authorization/google`을 브라우저로 연다. 승인 후 백엔드가 설정된 FE 주소(기본 `http://localhost:5173/home`)로 `302` 리디렉션하는지 확인한다. Google 콜백은 `http://localhost:8081/login/oauth2/code/google`로 유지한다. FE 서버 실행과 복귀 경로 라우팅은 별도이며, FE 화면이 열리지 않는 것만으로 로그인 실패를 단정하지 않는다. **처음 사용하는 계정이면 연결된 DB에 실제 회원 행이 생성된다.** 같은 계정으로 재로그인하면 내부 ID를 재사용한다.
4. **세션 확인:** 같은 브라우저에서 `http://localhost:8081/api/auth/me`를 열어 `200`과 본인 정보를 확인한다. [API 명세의 로그아웃 예시](AUTH_API.md#브라우저-확인-예시)로 `POST /api/auth/logout` → `204`, 다시 `/me` → `401`까지 확인한다. 브라우저로 로그인한 뒤 별도의 `curl`이나 Postman을 열면 세션 쿠키가 공유되지 않는다.

## 자주 막히는 지점

| 증상 | 먼저 확인할 것 |
|---|---|
| `/test`는 되지만 로그인 시작이 안 됨 | 인증 코드가 포함된 버전인지, Google 변수 두 개가 **백엔드**에 들어 있고 앱을 재시작했는지 확인. |
| Google `redirect_uri_mismatch` | Google 콘솔에 등록한 콜백 URI와 실제 요청의 스킴·호스트·포트·경로가 정확히 일치하는지 확인. |
| DB 테스트 실패 | `DB_PASSWORD`, `backend/certs/ca.crt` 존재 여부와 DB까지의 네트워크 접근을 확인. CA 검증을 끄는 방식으로 해결하지 않는다. |
| 로그인 후 `/me`가 `401` 또는 로그아웃이 `403` | 로그인한 브라우저·호스트를 유지하고, `/me`가 내려준 CSRF 헤더를 같은 세션의 POST로 보냈는지 확인. |
| 성공 후 FE 홈이 열리지 않거나 `/me` 호출이 실패함 | `302`의 `Location`이 기존 `FRONTEND_LOGIN_SUCCESS_URL`(기본 `http://localhost:5173/home`)의 fragment만 교체한 주소인지 확인한다. 이번 Google 로그인에서 실제 신규 계정 생성 시 `#/onboard`, 기존 계정(온보딩 취소 후 재로그인 포함)은 `#/`가 기대값이다. 새 ENV·DB 변경이나 Google 콜백 변경은 없으며 신규 가입 쿼리·FE 쿼리 제거 작업은 사용하지 않는다. FE 서버·복귀 경로 라우팅과 `/api/auth/me` 호출용 프록시 또는 CORS 구성은 별도 연동 작업이다. 백엔드 세션은 같은 브라우저에서 `http://localhost:8081/api/auth/me`로 확인한다. |
