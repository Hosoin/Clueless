# 클루리스 인증 API 명세

대상: React 모바일 웹 · 서비스: `closet-service` · 로컬 기준 URL: `http://localhost:8081`. [백엔드 실행 가이드](LOCAL_SETUP.md)

| 기능 | 메서드 · 경로 | 성공 | 호출 주체 |
|---|---|---|---|
| Google 로그인·최초 가입 시작 | `GET /oauth2/authorization/google` | `302` → Google | 브라우저 페이지 이동 |
| Google 인증 콜백 | `GET /login/oauth2/code/google` | `302` → FE 복귀 주소(기본 `http://localhost:5173/home`) | Google이 브라우저를 돌려보냄 |
| 내 정보 | `GET /api/auth/me` | `200` JSON + CSRF 응답 헤더 | 세션 쿠키가 있는 브라우저 |
| 내 정보 부분수정 | `PATCH /api/auth/me` | `204` 본문 없음 | 같은 세션 쿠키 + CSRF 요청 헤더 |
| 로그아웃 | `POST /api/auth/logout` | `204` 본문 없음 | 같은 세션 쿠키 + CSRF 요청 헤더 |

내 정보 부분수정과 아래 FE 인증 복귀 흐름은 **로컬 연동 계약**이다. 이 문서 갱신은 실제 배포나 FE 연동 검증 완료를 뜻하지 않는다. 이번 복귀 계약에는 DB 변경이나 새 ENV 추가가 없으며, 기존 `FRONTEND_LOGIN_SUCCESS_URL`을 사용한다.

## 1. 로그인·가입

Google 버튼에서 JSON을 `fetch`하지 말고 로그인 시작 URL로 **페이지를 이동**한다. 요청 본문과 사용자 ID는 없다. 현재 로컬에서는 `window.location.assign('http://localhost:8081/oauth2/authorization/google')`로 시작할 수 있다. 콜백의 `code`, `state`를 FE가 작성하거나 교환하지 않는다.

백엔드는 검증한 ID 토큰의 `sub`와 제공자 `google`로 사용자를 식별한다. 첫 로그인이면 `user_info`에 가입 처리하고 표시용 닉네임을 생성한다. 재로그인이면 같은 내부 ID를 사용한다. 이메일로 계정을 합치지 않는다. 동의 거부·인증 검증 실패 등 OAuth 콜백 실패는 `401`이며 성공 화면으로 이동하지 않는다.

**FE 인증 복귀 계약:** 성공하면 백엔드는 기존 `FRONTEND_LOGIN_SUCCESS_URL`(미설정 시 `http://localhost:5173/home`)의 fragment만 교체해 `302` 리디렉션한다. 이번 Google 로그인에서 실제로 계정을 신규 생성한 경우는 `#/onboard`, 기존 계정은 `#/`로 복귀한다. 예를 들어 설정값이 `http://localhost:5173/home#/closet`이면 각각 `http://localhost:5173/home#/onboard`, `http://localhost:5173/home#/`가 된다. fragment 앞의 주소와 기존 쿼리는 유지한다. 요청 파라미터로 복귀 주소를 바꿀 수 없다. 리디렉션 응답은 프로필 JSON이 아니다. 인증 수단은 클루리스 세션 쿠키이며 FE가 Google 토큰을 저장하거나 Bearer 헤더를 만들지 않는다.

**신규 계정 판정과 취소:** 온보딩 완료 여부가 아니라 이번 로그인에서 실제 계정을 생성했는지로 분기한다. 온보딩을 취소해도 계정은 이미 생성되어 있으므로, 다음 로그인은 기존 계정으로 홈(`#/`)에 복귀한다. `?newUser=1`을 추가하고 FE가 이를 읽어 history replace로 제거하는 방식은 폐기했으며, 해당 FE 쿼리 처리 작업은 필요하지 않다. 로그인 여부는 세션 기반 `/api/auth/me`로 확인한다.

**FE 연동 시 남은 확인:** FE의 `#/onboard`·`#/` 라우팅과 `/api/auth/me` 호출, 프록시 또는 CORS 설정은 별도 연동·확인이 필요하며 이 계약으로 자동 완료되지 않는다. 기존 `FRONTEND_LOGIN_SUCCESS_URL` 외에 새 ENV나 DB 항목을 추가하지 않는다. Google 콘솔에 등록하는 주소는 여전히 **백엔드 콜백** `http://localhost:8081/login/oauth2/code/google`이며, Google 콜백 경로·등록 주소를 FE 복귀 주소로 변경하지 않는다.

## 2. 내 정보 — `GET /api/auth/me`

요청 본문·쿼리 없음. 서버가 세션의 내부 사용자 ID로 본인만 조회한다. 성공하면 `200 application/json`, `Cache-Control`에 `no-store`, 응답 헤더 `X-CSRF-TOKEN`이 내려온다. 아래 값은 예시다.

```json
{
  "id": "42",
  "userName": "김클루",
  "nickName": "포근한수달482",
  "email": "clue@example.com",
  "preferredStyles": []
}
```

| 키 | JSON 타입 | 의미 |
|---|---|---|
| `id` | string | 내부 회원 ID. Google ID가 아니며 숫자로 변환할 필요가 없다. |
| `userName` | string 또는 null | 저장된 Google 표시 이름 |
| `nickName` | string 또는 null | 서비스 닉네임. 자동 생성 적용 전 가입한 회원은 null일 수 있다. |
| `email` | string 또는 null | 저장된 검증 이메일 |
| `preferredStyles` | string 배열 | 선택한 스타일. 선택하지 않았거나 비운 경우 빈 배열 |

기존 네 필드를 유지하고 `preferredStyles`를 추가한다. 값이 없으면 키를 생략하지 않는다. `nickname`이 아니라 `nickName`을 사용한다. 세션 없음·만료 또는 해당 회원 행 없음은 `401`. FE는 에러 본문의 형식에 의존하지 말고 상태 코드로 로그인 상태를 판단한다.

## 3. 내 정보 부분수정 — `PATCH /api/auth/me`

최초 설정과 이후 수정 모두 같은 API를 사용한다. 같은 세션 쿠키와 `/api/auth/me` 응답 헤더에서 받은 `X-CSRF-TOKEN`을 같은 이름의 요청 헤더로 보낸다. `Content-Type: application/json`이며 아래 두 필드 중 하나 이상을 전달한다.

```json
{
  "nickName": "클루",
  "preferredStyles": ["미니멀", "캐주얼"]
}
```

- `nickName`: 닉네임 요청 키는 `nickname`이 아니라 `nickName`이다. 앞뒤 공백을 제거한 값이 FE 기준 2~12자여야 한다. 닉네임은 표시 이름으로 중복을 허용하며 별도 중복 확인은 필요 없다. 사용자는 닉네임이 아니라 `id`로 구분한다.
- `preferredStyles`: `미니멀`, `캐주얼`, `클래식`, `페미닌`, `스트리트`, `스포티` 중 중복 없는 0~3개의 문자열 배열이다. `[]`는 기존 스타일 선택을 비운다(clear).
- 생략한 필드는 기존 값을 보존한다. 빈 객체, 필드 값 null, 모르는 키는 `400`이다.
- 성공: `204`, 본문 없음. 최초·이후 수정 및 같은 값의 반복 요청도 동일하게 성공한다. 저장 결과는 `GET /api/auth/me`로 확인할 수 있다.
- 인증 세션 없음·만료: `401`. CSRF 누락·불일치: `403`.

### FE 화면 흐름

이번 Google 로그인에서 실제 신규 계정 생성 → `#/onboard` 복귀 → `/api/auth/me` 조회 및 CSRF 토큰 확보 → 닉네임·스타일 설정 → **시작하기**에서 부분수정 요청 → `204` 저장 성공 후 서비스 화면으로 이동한다. 기존 계정 로그인은 `#/`로 복귀한다. 온보딩 취소 후 재로그인도 기존 계정이므로 홈으로 복귀하며 온보딩을 다시 강제하지 않는다. 이후 프로필 수정도 같은 PATCH를 사용한다. FE에서 신규 가입 쿼리를 읽거나 제거하는 처리는 없다. 이 흐름은 연동 계약이며 실제 배포나 FE 구현·검증 완료를 뜻하지 않는다.

## 4. 로그아웃 — `POST /api/auth/logout`

본문 없음. 같은 세션에서 `/me`로 받은 **응답 헤더** `X-CSRF-TOKEN` 값을 같은 이름의 **요청 헤더**로 보낸다. 성공은 `204`(빈 본문), 이후 같은 브라우저의 `/me`는 `401`. CSRF 토큰 누락·불일치는 `403`이며 유효했던 세션은 유지된다. 주소창에서 GET으로 여는 것은 로그아웃이 아니다. Google 계정 자체에서 로그아웃하거나 Google 동의를 철회하지 않는다.

### 브라우저 확인 예시

로그인 후 같은 브라우저에서 **백엔드의 `http://localhost:8081/api/auth/me`를 연 뒤 그 페이지의 개발자 도구 콘솔**에서 실행한다. 리디렉션된 FE `http://localhost:5173/home`의 콘솔에서 실행하는 예시가 아니다. 아래 상대 경로 요청은 백엔드와 같은 오리진에서 실행해야 한다. 이미 로그인된 세션을 종료하는 예시이며 쿠키·헤더 값을 복사하거나 로그로 남길 필요는 없다.

```js
const me = await fetch('/api/auth/me', { credentials: 'same-origin' });
if (!me.ok) throw new Error(`내 정보 조회 실패: ${me.status}`);
const csrf = me.headers.get('X-CSRF-TOKEN');
if (!csrf) throw new Error('CSRF 응답 헤더를 확인하세요.');
const logout = await fetch('/api/auth/logout', {
  method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-TOKEN': csrf }
});
console.log(logout.status);                        // 204
console.log((await fetch('/api/auth/me')).status); // 401
```

FE와 BE의 포트가 다르면 서로 다른 출처다. 동일 출처 프록시를 쓰는 구성이 간단하다. FE에서 BE를 직접 호출하려면 `credentials: 'include'`와 BE의 명시적인 FE 출처·credentials 허용, CSRF 요청 헤더 허용 및 `X-CSRF-TOKEN` 응답 헤더 노출이 필요하다. 이 교차 출처 설정과 실제 FE 연동이 이미 완료됐다는 뜻은 아니다.
