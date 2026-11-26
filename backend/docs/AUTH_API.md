# 클루리스 인증 API 명세

대상: React 모바일 웹 · 서비스: `closet-service` · 로컬 기준 URL: `http://localhost:8081`. [백엔드 실행 가이드](LOCAL_SETUP.md)

| 기능 | 메서드 · 경로 | 성공 | 호출 주체 |
|---|---|---|---|
| Google 로그인·최초 가입 시작 | `GET /oauth2/authorization/google` | `302` → Google | 브라우저 페이지 이동 |
| Google 인증 콜백 | `GET /login/oauth2/code/google` | `302` → FE 복귀 주소(기본 `http://localhost:5173/home`) | Google이 브라우저를 돌려보냄 |
| 내 정보 | `GET /api/auth/me` | `200` JSON + CSRF 응답 헤더 | 세션 쿠키가 있는 브라우저 |
| 로그아웃 | `POST /api/auth/logout` | `204` 본문 없음 | 같은 세션 쿠키 + CSRF 요청 헤더 |

## 1. 로그인·가입

Google 버튼에서 JSON을 `fetch`하지 말고 로그인 시작 URL로 **페이지를 이동**한다. 요청 본문과 사용자 ID는 없다. 현재 로컬에서는 `window.location.assign('http://localhost:8081/oauth2/authorization/google')`로 시작할 수 있다. 콜백의 `code`, `state`를 FE가 작성하거나 교환하지 않는다.

백엔드는 검증한 ID 토큰의 `sub`와 제공자 `google`로 사용자를 식별한다. 첫 로그인이면 `user_info`에 가입 처리하고 표시용 닉네임을 생성한다. 재로그인이면 같은 내부 ID를 사용한다. 이메일로 계정을 합치지 않는다. 동의 거부·인증 검증 실패 등 OAuth 콜백 실패는 `401`이며 성공 화면으로 이동하지 않는다.

**현재 구현:** 성공하면 백엔드는 `FRONTEND_LOGIN_SUCCESS_URL`에 지정한 FE 주소(미설정 시 `http://localhost:5173/home`)로 `302` 리디렉션한다. 요청 파라미터로 이 주소를 바꿀 수 없다. 리디렉션 응답은 프로필 JSON이 아니다. 인증 수단은 클루리스 세션 쿠키이며 FE가 Google 토큰을 저장하거나 Bearer 헤더를 만들지 않는다.

**FE 연동 시 남은 작업:** FE의 복귀 경로(로컬 기본 `/home`) 라우팅과 해당 화면에서의 `/api/auth/me` 호출, 프록시 또는 CORS 설정은 별도 연동·확인이 필요하며 이 리디렉션 변경으로 자동 완료되지 않는다. Google 콘솔에 등록하는 주소는 여전히 **백엔드 콜백** `http://localhost:8081/login/oauth2/code/google`이며 FE 복귀 주소로 바꾸지 않는다.

## 2. 내 정보 — `GET /api/auth/me`

요청 본문·쿼리 없음. 서버가 세션의 내부 사용자 ID로 본인만 조회한다. 성공하면 `200 application/json`, `Cache-Control`에 `no-store`, 응답 헤더 `X-CSRF-TOKEN`이 내려온다. 아래 값은 예시다.

```json
{
  "id": "42",
  "userName": "김클루",
  "nickName": "포근한수달482",
  "email": "clue@example.com"
}
```

| 키 | JSON 타입 | 의미 |
|---|---|---|
| `id` | string | 내부 회원 ID. Google ID가 아니며 숫자로 변환할 필요가 없다. |
| `userName` | string 또는 null | 저장된 Google 표시 이름 |
| `nickName` | string 또는 null | 서비스 닉네임. 자동 생성 적용 전 가입한 회원은 null일 수 있다. |
| `email` | string 또는 null | 저장된 검증 이메일 |

정확히 위 네 키만 전달한다. 값이 없으면 키를 생략하지 않는다. 기존 `nickname`과 `preferredStyles`는 반환하지 않는다. 세션 없음·만료 또는 해당 회원 행 없음은 `401`. FE는 에러 본문의 형식에 의존하지 말고 상태 코드로 로그인 상태를 판단한다.

## 3. 로그아웃 — `POST /api/auth/logout`

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
