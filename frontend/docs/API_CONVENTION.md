# 백엔드 통신 규칙

프론트엔드가 백엔드(BE)의 API를 호출하는 방법과 규칙입니다. **실제 API를 호출하는 것을 기준으로 쓰고, 아직 API가 연결되지 않은 부분은 가짜 데이터(`seed.ts`)로 대신하는 방법을 함께 적습니다.**

- 기준 문서: `백엔드 구조 초안.md` (BE가 공유한 구조 초안). 그 문서의 내용만 BE 사실로 적고, 거기에 없는 것은 `계약 미확정`으로 표시합니다. 확정되지 않은 내용을 정해진 것처럼 쓰지 않습니다.
- 아직 합의하지 않은 항목은 맨 아래 [BE 확인 필요](#be-확인-필요) 표에 모았습니다. 정해지면 본문의 `미확정` 표시를 고칩니다.
- 이 문서는 규칙입니다. 코드는 아직 없고(`src/api/`가 없음), 코드를 만들 때 이 문서를 따릅니다.
- `CLAUDE.md`의 "API 연동 방식은 정하는 중" 문구는 이 문서가 확정된 뒤에 고칩니다. 그전에는 `fetch` 코드나 API 주소를 `src/`에 추가하지 않습니다.
- 사용할 라이브러리는 [`LIBRARIES.md`](LIBRARIES.md)의 "도입 예정"을 참고하세요. 별도 라이브러리 없이 `fetch` 래퍼를 쓰는 것을 전제로 합니다.

## 0. 현재 상태: 가짜 데이터로 동작 중

지금 화면의 데이터는 모두 `src/data/seed.ts`의 가짜 데이터입니다. 서버를 부르는 코드는 없습니다.

| 항목 | 상태 |
| --- | --- |
| 화면 데이터 | `seed.ts` → `store.ts`의 `S` (메모리). 새로고침하면 처음 상태로 돌아감 |
| BE | 두 서비스(`closet-service`, `recommendation-service`)가 `GET /test`만 응답. 업무 API, DB, 인증 모두 없음 |
| 프론트 `src/api/` | 아직 없음 |

그래서 이 문서의 방식은 두 가지를 동시에 만족해야 합니다.

1. **실제 API를 호출하는 코드**를 `src/api/`에 규칙대로 만든다.
2. **API가 연결되기 전까지는** 같은 함수가 `seed.ts`의 가짜 데이터를 돌려준다. (화면은 어느 쪽인지 모른다)

API가 하나씩 열리면 해당 부분만 가짜 데이터에서 실제 호출로 바꿉니다. 방법은 [6장](#6-가짜-데이터에서-실제-api로-넘어가기)에 있습니다.

### BE 구조 (프론트엔드 관점 요약)

| 서비스 | 포트 | 담당 (BE 문서 기준) | 지금 있는 API | 다음 |
| --- | --- | --- | --- | --- |
| `closet-service` | 8081 | 옷장·의류 관련 API | `GET /test` (UTF-8 일반 텍스트) | 업무 API 계약 미확정 |
| `recommendation-service` | 8082 | 추천 관련 API | `GET /test` (UTF-8 일반 텍스트) | 업무 API 계약 미확정 |

- 서비스가 **둘로 나뉘어 있고 포트가 다릅니다.** 게이트웨이(하나의 주소로 합쳐 주는 곳)가 BE 문서에 없으므로, 프론트는 서비스마다 주소를 따로 가진다고 가정합니다. 게이트웨이가 생기면 주소 환경 변수 하나로 합칩니다.
- BE는 Spring Boot(MVC), 저장소는 JPA·PostgreSQL을 쓸 예정입니다. 아직 DB 연결은 없습니다. (프론트가 신경 쓸 부분은 아님)
- 서비스 간 보유 옷 조회, ML 연동, 배포 환경은 BE도 아직 확정하지 않았습니다.

### 프론트 데이터와 담당 서비스

화면의 데이터를 어느 서비스가 맡는지입니다. BE 문서에 담당이 적혀 있지 않은 것은 `미정`으로 두고, 그동안 계속 가짜 데이터를 씁니다.

| 프론트 데이터 (용어 사전) | 타입 | 담당 서비스 | API 연결 | 지금 데이터 |
| --- | --- | --- | --- | --- |
| 옷 (`Item`): 조회, 등록, 삭제, 추천 제외 | `Item` | `closet-service` | 계약 미확정 | 가짜 데이터 |
| 옷 사진 분석(옷 후보)과 확정 저장 (`Upload`) | `Item`, `Category` | `closet-service`로 추정, ML 연동 미확정 | 계약 미확정 | 화면 안의 가짜 후보 |
| 추천 코디 (`Outfit`) | `Outfit` | `recommendation-service` | 계약 미확정 | `store.ts`의 규칙 + 가짜 데이터 |
| 저장한 코디 (`Saved`) | `Saved` | 미정 | 담당 미정 | 가짜 데이터 |
| 입은 기록 (`Hist`), 입을 계획 (`Plan`) | `Hist`, `Plan` | 미정 | 담당 미정 | 가짜 데이터 |
| 커뮤니티 글 (`Post`), 댓글 (`Comment`) | `Post`, `Comment` | 서비스 없음 | 담당 미정 | 가짜 데이터 |
| 로그인, 내 정보 | (`S.me`, `S.loggedIn`) | 서비스 없음 (BE 문서에 사용자 테이블 언급만 있음) | 인증 방식 미확정 | 가짜 로그인 |
| 유행 (`Trend`) | `Trend` | 미정 | 담당 미정 | 가짜 데이터 |

이 표는 API가 연결될 때마다 `API 연결`과 `지금 데이터` 칸을 고칩니다.

## 1. API 기본 주소

API 주소는 코드에 직접 적지 않고 Vite 환경 변수로 받습니다. 서비스가 둘이므로 주소도 둘입니다.

### 환경 변수 키

| 키 | 예시 (로컬) | 설명 |
| --- | --- | --- |
| `VITE_CLOSET_API_URL` | `http://localhost:8081` | `closet-service` 주소. 끝에 `/`를 붙이지 않습니다 |
| `VITE_RECOMMENDATION_API_URL` | `http://localhost:8082` | `recommendation-service` 주소. 끝에 `/`를 붙이지 않습니다 |
| `VITE_MOCK_CLOSET` | `true` | `true`면 `closet-service` 대신 `seed.ts`의 가짜 데이터를 씁니다 |
| `VITE_MOCK_RECOMMENDATION` | `true` | `true`면 `recommendation-service` 대신 가짜 데이터를 씁니다 |

- 포트(8081, 8082)는 BE 문서의 `application.yml` 값입니다. 개발·배포 서버 주소는 BE 확인 필요입니다.
- **지금은 API가 연결되지 않았으므로 `.env.example`의 `VITE_MOCK_*`는 모두 `true`가 기본입니다.** 서비스 API가 열리면 그 서비스의 값만 `false`로 바꿉니다. 서비스가 하나씩 열리는 일정에 맞추려고 서비스별로 나눴습니다.
- 서비스가 정해지지 않은 데이터(커뮤니티, 입은 기록 등)는 환경 변수 없이 항상 가짜 데이터입니다. 담당 서비스가 정해지면 같은 방식의 키를 추가합니다.

### 파일

| 파일 | 커밋 | 용도 |
| --- | --- | --- |
| `frontend/.env.example` | O | 키 이름과 설명, 안전한 기본값(`localhost`, `MOCK=true`)만 적은 견본 |
| `frontend/.env.development` | 팀 합의 후 결정 | `npm run dev`에서 쓰는 값 |
| `frontend/.env.phone` | 팀 합의 후 결정 | `npm run dev:phone`에서 쓰는 값 (`--mode phone`) |
| `frontend/.env.production` | 팀 합의 후 결정 | `npm run build`에서 쓰는 값 |
| `frontend/.env.local` | X | 개인 설정. 내 PC에서 `MOCK`을 바꿀 때 여기에 씁니다 |

- 루트 `.gitignore`가 `.env`와 `.env.*`를 제외하고 `.env.example`만 허용합니다. `.env.development` 같은 파일을 커밋하려면 `.gitignore`를 고쳐야 하므로, 주소를 공개해도 되는지 확인한 뒤 결정합니다. (저장소가 공개되어 있습니다)
- **`VITE_`로 시작하는 값은 빌드 결과물에 그대로 들어가 누구나 볼 수 있습니다.** 키·비밀번호·토큰을 넣지 않습니다.
- 환경 변수는 `src/api/client.ts` 한 곳에서만 읽습니다. 타입은 `src/vite-env.d.ts`에 선언합니다.
- 환경 변수를 추가하면 `.env.example`과 이 표를 같이 고칩니다.

### 주의: 주소는 반드시 전체 주소로

- Capacitor 앱은 서버가 아니라 폰 안의 파일에서 열리므로(`base: './'`) `/api/items` 같은 상대 주소는 앱에서 동작하지 않습니다. 항상 `https://...` 또는 `http://...`로 시작하는 전체 주소를 씁니다.
- `npm run dev:phone`은 https로 열립니다. https 화면에서 `http://` API를 부르면 브라우저가 막습니다(혼합 콘텐츠). BE가 https를 열어 주거나 터널(예: Cloudflare)을 써야 합니다. `BE 확인 필요`
- 폰에서는 `localhost`가 폰 자신을 가리킵니다. 같은 와이파이의 PC를 쓸 때는 PC의 주소(`192.168.x.x`)를 씁니다.
- **CORS**: 웹 화면(`http://localhost:5173` 등)과 API 서버(`localhost:8081`)는 출처가 다르므로, BE가 두 서비스 모두에서 프론트 출처를 허용해야 합니다. BE 문서에는 CORS 설정이 없습니다. `BE 확인 필요`

## 2. 요청 함수 위치와 이름

### 위치

```
src/api/
├─ client.ts          공통 요청 함수: 서비스별 request 만들기, 주소·토큰·에러 처리, 가짜 데이터 스위치
├─ error.ts           ApiError (status, code, message)
├─ token.ts           토큰 읽기·저장·지우기 (웹/앱 차이를 이 파일 안에서만 처리)
├─ items.ts           옷 관련 요청 (closet-service)
├─ outfits.ts         추천 코디 요청 (recommendation-service)
├─ history.ts         입은 기록·계획·저장한 코디 (담당 서비스 미정, 지금은 가짜 데이터만)
├─ posts.ts           커뮤니티 글·댓글 (담당 서비스 미정, 지금은 가짜 데이터만)
└─ auth.ts            로그인·내 정보 (인증 방식 미확정, 지금은 가짜 로그인)
```

- 파일은 화면이 아니라 **데이터 종류**로 나눕니다. 용어 사전의 `Item`, `Outfit`, `Hist`/`Plan`, `Post`와 맞춥니다.
- 화면(`pages/`)과 컴포넌트에서 `fetch`를 직접 부르지 않습니다. 항상 `src/api/`의 함수를 부릅니다.
- `src/api/`는 `data/types.ts`, `data/seed.ts`, `client.ts`만 불러옵니다. `store.ts`나 화면을 불러오지 않습니다. (의존 방향: `pages` → `store.ts` → `api` → `data`)
- 가짜 데이터는 `src/api/` 안에서만 `seed.ts`를 불러 씁니다. 화면과 `store.ts`에서 `seedItems()`를 직접 부르던 부분은 api 호출로 바꿉니다. ([6장](#6-가짜-데이터에서-실제-api로-넘어가기))

### 이름 규칙

| 동작 | 이름 | 예시 |
| --- | --- | --- |
| 목록 | `get` + 복수형 | `getItems()`, `getOutfits()` |
| 하나 | `get` + 단수형 | `getItem(id)` |
| 만들기 | `create` + 단수형 | `createItem(input)` |
| 고치기 | `update` + 단수형 | `updateItem(id, input)` |
| 지우기 | `delete` + 단수형 | `deleteItem(id)` — `store.ts`의 `deleteItem`(연결된 기록까지 정리)과 이름이 겹치니 `import * as itemsApi from '../api/items'`로 불러 `itemsApi.deleteItem`처럼 씁니다 |
| 그 밖의 동작 | 동사 + 대상 | `wearItems(ids)`, `likePost(id)` |

- 함수는 `data/types.ts`의 타입을 받고 돌려줍니다: `getItems(): Promise<Item[]>`. 화면은 서버가 어떤 모양으로 주는지, 가짜 데이터인지 실제 서버인지 모릅니다.
- 서버의 필드 이름이나 날짜 형식이 `types.ts`와 다르면 `src/api/` 안에서 변환하고, `types.ts`는 바꾸지 않습니다. (예: 서버가 `lastWornAt` 날짜를 주면 `lastWorn`(며칠 전)으로 계산해 돌려줌)
- 요청 함수는 성공하면 값을 돌려주고, 실패하면 `ApiError`를 던집니다. 함수 안에서 `toast`를 부르지 않습니다. 에러를 어떻게 보여 줄지는 부르는 쪽이 정합니다.

### 공통 요청 함수 (`client.ts`)

서비스마다 `createRequest(주소)`로 요청 함수를 만들고, 가짜 데이터 스위치도 여기서 읽습니다.

```ts
// src/api/client.ts
import { ApiError } from './error'
import { getToken } from './token'

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>

/** 서비스 하나의 주소로 요청 함수를 만든다 (서비스마다 주소가 달라서 서비스별로 만듦) */
function createRequest(baseUrl: string): RequestFn {
  return async <T>(path: string, init: RequestInit = {}) => {
    const token = await getToken()
    let res: Response
    try {
      res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      })
    } catch {
      // 서버에 닿지 못함(꺼져 있음, 인터넷 끊김, CORS 차단 등). 서버가 준 에러가 아니라서 따로 처리
      throw new ApiError(0, 'NETWORK', '서버에 연결할 수 없어요')
    }
    if (!res.ok) throw await ApiError.from(res) // 3장 참고
    const text = await res.text() // 본문이 비어 있을 수 있어(204 등) json()을 바로 부르지 않음
    return (text ? JSON.parse(text) : undefined) as T
  }
}

export const closetRequest = createRequest(import.meta.env.VITE_CLOSET_API_URL)
export const recommendationRequest = createRequest(import.meta.env.VITE_RECOMMENDATION_API_URL)

/** 서비스별 가짜 데이터 스위치. true면 서버를 부르지 않고 seed.ts의 가짜 데이터를 쓴다 */
export const MOCK = {
  closet: import.meta.env.VITE_MOCK_CLOSET === 'true',
  recommendation: import.meta.env.VITE_MOCK_RECOMMENDATION === 'true',
}

/** 가짜 데이터에도 짧은 지연을 줘서, 서버 없이도 "불러오는 중" 화면을 볼 수 있게 한다 */
export const mock = <T>(value: T, ms = 300) => new Promise<T>((done) => setTimeout(() => done(value), ms))
```

## 3. 응답과 에러 처리

### 성공 응답 (BE 확인 필요)

BE 문서에는 JSON 응답 형식이 없습니다(`/test`만 일반 텍스트). 아래 둘 중 하나를 BE와 정합니다. 프론트엔드의 의견은 **A**입니다. 요청 함수가 단순하고 `types.ts`와 바로 맞기 때문입니다.

| 안 | 모양 | 비고 |
| --- | --- | --- |
| A | 본문이 곧 데이터: `[{ "id": 1, ... }]` | 전체 개수·다음 쪽 정보는 헤더나 별도 필드로 |
| B | 감싸서 줌: `{ "data": [...], "meta": {...} }` | `request()`에서 `data`만 꺼내서 돌려줌 |

### 에러 응답 (BE 확인 필요)

에러 형식이 정해지지 않았으므로 `ApiError.from()`이 **어떤 형식이 와도 깨지지 않게** 읽습니다.

1. 본문이 `{ "code": "...", "message": "..." }` 모양이면 그대로 씁니다. (프론트엔드가 제안하는 형식)
2. 본문이 다른 JSON(Spring Boot 기본 오류 응답 등)이면 `message`가 있으면 쓰고, 없으면 상태 코드로 정한 기본 문구를 씁니다.
3. 본문이 JSON이 아니거나 비어 있으면 상태 코드로 정한 기본 문구를 씁니다.

```json
{ "code": "ITEM_NOT_FOUND", "message": "옷을 찾을 수 없어요" }
```

| `ApiError` 필드 | 뜻 |
| --- | --- |
| `status` | HTTP 상태 코드. 서버에 닿지 못했으면 `0` |
| `code` | 에러 종류를 구분하는 영문 코드. 서버가 안 주면 `HTTP_<상태 코드>` |
| `message` | 사용자에게 보여 줄 한국어 문구 |

### 화면에 보여 주기

| 상황 | 처리 |
| --- | --- |
| 일반 요청 실패 | `toast(e.message)` (`src/ui.tsx`). 새 알림 컴포넌트를 만들지 않습니다 |
| 서버에 닿지 못함 (`status` 0) | `'서버에 연결할 수 없어요'`를 `toast`로 |
| 401 (로그인 필요·토큰 만료) | `toLogin(현재 주소)` (`src/nav.ts`). 로그인하면 원래 화면으로 돌아옵니다 |
| 서버 오류 (5xx) | 서버가 준 문구 대신 `'잠시 후 다시 시도해 주세요'`를 보여 줍니다. 서버 내부 메시지를 그대로 노출하지 않습니다 |
| 입력값 오류 (400 등) | `message`를 `toast`로 보여 주거나 입력칸 옆에 보여 줍니다. 필드별 에러 형식은 BE 확인 필요 |
| 목록을 못 불러옴 | 화면은 빈 화면(`empty` 클래스)에 "다시 불러오기" 버튼을 두고, `toast`는 쓰지 않습니다 |

- `toast`는 2.4초 만에 사라지므로 사용자가 꼭 알아야 하고 되돌릴 수 없는 에러는 `openModal`로 띄웁니다.
- 에러 문구는 `CLAUDE.md`의 규칙(조사 `eun`/`iga` 사용, `을(를)` 표기 금지)을 따릅니다.
- 로딩 중에는 버튼을 비활성화해서 같은 요청이 두 번 가지 않게 합니다.

## 4. 인증 토큰

BE 문서에 인증(로그인, 토큰)이 없습니다. 지금 `Login.tsx`는 어느 버튼이든 바로 로그인되는 가짜입니다. 아래는 JWT 같은 토큰 방식을 가정한 것이고, 인증 방식이 정해지면 고칩니다. **인증이 연결되기 전에는 `getToken()`이 항상 `null`을 돌려주어 요청에 `Authorization` 헤더가 붙지 않습니다.**

### 보내는 방법 (BE 확인 필요)

- `Authorization: Bearer <토큰>` 헤더에 담아 보냅니다. 붙이는 곳은 `client.ts`의 `createRequest()` 한 곳이라, 두 서비스 모두 같은 토큰이 붙습니다. (두 서비스가 같은 토큰을 받아들이는지는 BE 확인 필요)
- 토큰을 읽고 쓰는 코드는 `src/api/token.ts`에만 둡니다. 화면과 `store.ts`는 토큰을 직접 만지지 않습니다. (`S.loggedIn`은 "토큰이 있는지"를 반영하는 값으로 유지)

### 저장하는 곳

| 환경 | 후보 | 장단점 |
| --- | --- | --- |
| 웹 | `localStorage` | 구현이 쉽지만 XSS 공격으로 토큰이 읽힐 수 있음 |
| 웹 | BE가 내려 주는 `HttpOnly` 쿠키 | 스크립트로 읽을 수 없어 안전. CORS에서 쿠키 허용 설정이 필요하고 BE가 지원해야 함 |
| Capacitor 앱 | 보안 저장소 플러그인 (iOS Keychain, Android Keystore를 쓰는 것) | 일반 저장소보다 안전. 플러그인은 인증 방식이 정해진 뒤 고름 |
| Capacitor 앱 | `@capacitor/preferences` | 쉽지만 암호화되지 않아 토큰 저장에는 권장하지 않음 |

- 웹과 앱의 차이는 `token.ts` 안에서만 분기합니다. (`Capacitor.isNativePlatform()`으로 구분: `@capacitor/core`에 이미 있음) 나머지 코드는 `getToken()`, `setToken()`, `clearToken()`만 부릅니다. 앱의 저장소가 비동기라서 세 함수 모두 `Promise`를 돌려줍니다.
- 쿠키 방식이면 웹은 `fetch`에 `credentials: 'include'`만 붙이면 되지만, **Capacitor 앱은 출처가 달라 쿠키가 잘 붙지 않을 수 있습니다.** 앱까지 한 방식으로 가려면 BE와 먼저 정해야 합니다.
- 로그아웃하면 `clearToken()`을 부르고 `S`의 내 정보도 비웁니다.
- 토큰 만료 시 처리(재발급 토큰, 바로 로그인 화면)는 BE 확인 필요입니다.
- 토큰을 `console.log`로 찍거나 커밋하지 않습니다.

## 5. 이미지와 파일

### 옷 데이터와 이미지는 따로 저장됩니다

| 데이터 | 저장 위치 | 화면이 받는 방법 |
| --- | --- | --- |
| 옷 정보(이름, 종류, 색, 무늬 등 메타데이터) | DB | `getItems()` 같은 요청 함수로 JSON을 받습니다 |
| 옷 사진 파일 | Blob Storage | 이미지 id로 조회합니다. 화면은 받은 주소를 `<img>`에 그대로 씁니다 |

- 서버가 돌려주는 사진 주소는 `Item.img`, `Post.img`에 그대로 들어갑니다. 이 주소는 전체 주소여야 합니다. (`types.ts` 모양을 바꾸지 않기 위해 id가 아니라 주소를 받는 것을 기본으로 함)
- Blob이 비공개라서 짧은 시간만 쓸 수 있는 주소가 오면, 시간이 지난 주소는 이미지가 깨집니다. 이때는 목록을 다시 불러와 새 주소를 받습니다. 주소가 공개인지 만료되는지는 BE 확인 필요입니다.
- `CLAUDE.md`는 "이미지는 `import` 또는 `seed.ts`의 `photo`, `cpic`로 불러온다"고 하는데, 서버 이미지는 이 규칙의 예외가 됩니다.

### 옷 사진 올리기: 서버를 거치는 방식으로 결정

옷 등록(`Upload.tsx`)은 **분석**과 **확정 저장** 두 단계입니다. 사진 파일은 **백엔드로 보내고, 백엔드가 Blob Storage에 저장한 뒤 ML 분석을 요청**합니다. 화면은 Blob에 직접 접근하지 않습니다. (결정: 서버를 거치는 방식. Blob에 직접 올리는 방식은 쓰지 않음)

```
① 화면 ──(사진 파일, multipart/form-data)──▶ 백엔드
② 백엔드 ──▶ Blob Storage에 저장 (이미지 id 생성)
③ 백엔드 ──▶ ML에 분석 요청
④ 화면 ◀──(후보 3개와 확률, 이미지 id)── 백엔드
⑤ 사용자가 후보 하나를 고르고 필요하면 이름·종류·색·무늬를 고침
⑥ 화면 ──(고른 후보 + 이미지 id)──▶ 백엔드 ──▶ DB에 옷 정보 저장
⑦ 화면 ◀──(저장된 옷 정보와 이미지 주소)── 백엔드
```

| 단계 | 요청 함수(이름만 정함, 모양은 BE와 확정 후) | 호출 서비스 |
| --- | --- | --- |
| ①~④ 분석 | `analyzeItemPhoto(file)` | `closet-service`로 추정 (BE 확인 필요) |
| ⑥~⑦ 확정 저장 | `createItem(input)` | `closet-service` |

화면(프론트)이 지킬 것:
- **파일 전송은 JSON이 아닙니다.** `FormData`에 파일을 담아 보내고, `Content-Type`은 적지 않습니다. 브라우저가 경계값까지 넣어 정하기 때문입니다. `client.ts`의 `createRequest()`는 본문이 `FormData`일 때 `'Content-Type': 'application/json'`을 붙이지 않아야 합니다.
- **올리기 전에 사진을 줄입니다.** 폰 사진은 수 MB라서, 가로 1,000~1,600px 정도로 줄이고 JPEG으로 압축하면 올리는 시간과 분석 시간이 줄어듭니다. 정확한 기준은 ML·BE와 정합니다.
- **사진 방향을 바로잡습니다.** 폰 사진은 EXIF 정보 때문에 눕거나 뒤집혀 보일 수 있습니다.
- **미리보기는 내 기기의 사진으로 바로 보여 줍니다.** `URL.createObjectURL`로 만든 주소를 쓰고, 서버 응답을 기다리지 않습니다. 쓰고 나면 `URL.revokeObjectURL`로 정리합니다.
- **여러 장이면 장마다 상태를 가집니다.** 올리는 중, 분석 중, 완료, 실패를 사진마다 보여 주고, 한 장이 실패해도 나머지는 계속합니다. 실패한 사진에는 다시 시도 버튼을 둡니다.
- **분석이 오래 걸릴 수 있습니다.** 요청 시간 제한을 길게 두거나 "분석 중" 상태를 보여 줍니다. 처리 방식(한 번에 응답할지, 접수 후 결과를 따로 조회할지)은 BE 확인 필요입니다.
- **카메라 촬영은 환경마다 다릅니다.** 웹은 브라우저 카메라(https 필요)이고, Capacitor 앱은 `@capacitor/camera` 같은 플러그인이 필요합니다. 설치하게 되면 `LIBRARIES.md`도 함께 고칩니다. 권한 안내 창은 지금처럼 `ui.tsx`의 `askPermission`을 씁니다.
- **취소했을 때 남는 사진이 있습니다.** 분석만 하고 저장하지 않으면 Blob에 사진이 남을 수 있습니다. 정리는 BE가 맡는 것으로 제안하고 BE 확인 필요 표에 넣었습니다.
- 가짜 데이터 상태(`VITE_MOCK_CLOSET=true`)에서는 `analyzeItemPhoto`가 화면 안의 가짜 후보를 `mock()`으로 돌려주어 서버 없이도 같은 흐름을 볼 수 있습니다.

## 6. 가짜 데이터에서 실제 API로 넘어가기

원칙: **화면 코드는 바꾸지 않고 데이터가 오는 곳만 바꿉니다.** `data/types.ts`의 모양은 유지합니다.

### 요청 함수에 가짜 데이터를 함께 넣는 방법

요청 함수 하나가 "가짜 데이터일 때"와 "실제 호출일 때"를 모두 가집니다. 스위치(`MOCK`)만 바꾸면 넘어갑니다.

```ts
// src/api/items.ts
import { seedItems } from '../data/seed'
import type { Item } from '../data/types'
import { MOCK, closetRequest, mock } from './client'

/** 내 옷장의 옷 전체를 불러온다. (closet-service) */
export const getItems = (): Promise<Item[]> =>
  MOCK.closet ? mock(seedItems()) : closetRequest<Item[]>('/items') // 경로 '/items'는 예시. 실제 경로는 BE 명세로 확정
```

```ts
// src/api/outfits.ts: recommendation-service
export const getOutfits = (): Promise<Outfit[]> =>
  MOCK.recommendation ? mock(seedOutfits()) : recommendationRequest<Outfit[]>('/outfits') // 경로 예시
```

- 경로(`/items`, `/outfits`), 필드 이름, 응답 모양은 **예시**입니다. 실제 값은 BE의 API 명세를 받은 뒤 정합니다.
- 담당 서비스가 없는 데이터(커뮤니티, 입은 기록 등)는 `MOCK` 스위치 없이 항상 `mock(seedPosts())`처럼 가짜 데이터를 돌려줍니다. 서비스가 생기면 위와 같은 모양으로 바꿉니다.
- 쓰는 쪽은 두 경우가 같습니다.

```ts
// store.ts의 불러오기 함수 (state 구조 변경이면 먼저 팀에 확인)
try {
  S.items = await getItems()
  emit()
} catch (e) {
  toast(e instanceof ApiError ? e.message : '알 수 없는 오류가 났어요')
}
```

### 넘어가는 순서

| 단계 | 할 일 | 바뀌는 곳 |
| --- | --- | --- |
| 0 | BE와 [확인 표](#be-확인-필요)의 항목을 정하고, 서비스별 API 명세를 받는다 | 문서만 |
| 1 | `.env.example`(`MOCK=true`), `src/vite-env.d.ts`, `src/api/client.ts`, `error.ts`, `token.ts`를 추가한다. 이때 화면은 그대로 가짜 데이터를 쓴다 | `src/api/` 신규 |
| 2 | **연결 확인**: 서비스가 켜져 있으면 `GET /test`(일반 텍스트)로 주소와 CORS가 맞는지 확인한다. JSON이 아니므로 `request()`가 아니라 `fetch(...).then((r) => r.text())`로 한 번만 시험하고, 확인 코드는 남기지 않는다 | 로컬 확인만 |
| 3 | 데이터 종류 하나(예: `Item`)의 요청 함수를 만들어 가짜 데이터와 실제 호출을 함께 넣는다. 서버 모양이 `types.ts`와 다르면 이 안에서 변환한다 | `src/api/items.ts` |
| 4 | `store.ts`의 `S.items = seedItems()`를 "처음 불러오기" 함수(`getItems()` 호출)로 바꾼다. 화면은 계속 `useApp()`으로 읽는다. 아직은 `MOCK=true`라서 화면이 달라지지 않는다 | `store.ts` (**상태 구조가 바뀌면 먼저 팀에 확인**) |
| 5 | 값을 바꾸는 코드(`deleteItem`, `wearToday`, `saveLook` 등)에서 먼저 서버에 요청하고, 성공하면 지금처럼 `S`를 고치고 `emit()` | `store.ts`의 해당 함수 |
| 6 | 서버 API가 열리면 `.env.local`에서 `VITE_MOCK_CLOSET=false`로 바꿔 시험하고, 문제가 없으면 팀 설정을 바꾼다 | 환경 변수 |
| 7 | 서비스 전체가 연결되면 이 문서 0장의 표를 고친다. `seed.ts`의 가짜 데이터 함수는 개발용으로 남기고, `COLORS`, `CATS`, `SUBS`, `STYLES` 같은 목록 상수는 서버가 주지 않는 한 그대로 둔다 | 문서 |

넘기는 순서는 이렇게 하는 것을 제안합니다: 옷(`items`, closet-service) → 추천 코디(`outfits`, recommendation-service) → 나머지(입은 기록, 커뮤니티, 로그인은 담당 서비스가 정해진 뒤). 추천은 옷 id에 기대고 있기 때문입니다.

### 넘길 때 미리 알아 둘 것

- **추천은 지금 프론트에서 계산합니다.** `store.ts`의 `fit`, `ranked`, `pool`, `current`는 화면에서 고른 옷을 맞추는 규칙(겹쳐 입기)이라 서버로 넘어가도 남습니다. 서버가 주는 것은 `Outfit`(`Look` + `reason`) 목록이고, 이를 `S.outfits`에 넣은 뒤 `applyOutfit`이 지금처럼 동작해야 합니다. 추천에 필요한 "내 옷" 정보를 누가 `recommendation-service`에 넘기는지(프론트가 id를 보내는지, 서비스끼리 조회하는지)는 BE도 미확정입니다.
- **`store.ts` 마지막 줄의 `applyOutfit(firstFresh(0))`은 시작할 때 옷이 이미 있다고 가정합니다.** 옷을 서버에서 불러오면 불러온 뒤에 실행해야 합니다.
- **날짜가 "며칠 전"으로 되어 있습니다.** `Item.lastWorn`, `Hist.ago`는 오늘 기준 일수이고 `Post.ago`는 `'2시간 전'` 같은 문구입니다. 서버는 보통 날짜(ISO 8601)를 주므로 `src/api/` 안에서 변환합니다.
- **`Plan.date`는 `'2026-11-24'` 형식 문자열**(`dkey`)입니다. 서버가 같은 형식을 주는지 확인합니다.
- **`Item.id`, `Post.id`는 숫자입니다.** 서버가 다른 형식(UUID 등)을 주면 `types.ts` 변경이 되므로 먼저 확인합니다. 또한 `S.uid`, `S.sid`, `S.pid`는 새 id를 만들려고 임시로 쓰는 번호라서 서버가 id를 정해 주면 쓰지 않게 됩니다.
- **로딩 상태가 새로 생깁니다.** 지금은 데이터가 처음부터 있어서 로딩 화면이 없습니다. "불러오는 중", "실패", "비어 있음" 세 경우를 화면마다 어떻게 보여 줄지 디자인과 정합니다. 가짜 데이터에도 `mock()`으로 300ms 지연을 주므로 서버 없이도 이 화면을 미리 볼 수 있습니다.
- **새로고침하면 서버에서 다시 불러옵니다.** 지금처럼 처음 상태로 돌아가지 않으므로 토큰이 저장되어 있어야 로그인 상태가 유지됩니다.

## BE 확인 필요

BE에 정해 달라고 할 항목입니다. 정해지면 "정해진 내용" 칸을 채우고, 본문의 `미확정`과 `BE 확인 필요` 표시를 고칩니다. 첫 두 항목은 BE 문서의 `/todo`와 같은 내용이고, 나머지는 프론트엔드 입장에서 추가한 것입니다.

| # | 항목 | 프론트엔드 제안 | 정해진 내용 |
| --- | --- | --- | --- |
| 1 | 분석·확정 저장 API의 요청·응답 계약 (BE `/todo`의 첫 항목) | 사진 분석 → 후보 목록(`Item`에 가까운 모양 + 확률) → 사용자가 고른 것으로 확정 저장 | |
| 2 | 서비스 간 보유 옷 조회 계약 (BE `/todo`). 추천 요청 때 내 옷 정보를 누가 `recommendation-service`에 넘기는가 | 프론트는 추천만 요청하고, 서비스끼리 조회 | |
| 3 | ML 입출력과 오류 처리 계약 (BE `/todo`). **ML 결과를 BE를 거쳐 받는지, 프론트가 직접 받는지** | BE를 거침 (프론트는 BE 주소만 알도록) | |
| 4 | 프론트가 부를 주소를 하나로 합칠 게이트웨이가 있는지, 서비스별 주소를 따로 쓰는지 | 서비스별 주소 (`VITE_CLOSET_API_URL`, `VITE_RECOMMENDATION_API_URL`) | |
| 5 | 서비스별 API 경로 규칙 (예: `/items`인지 `/api/closet/items`인지)와 API 명세 공유 방식 (OpenAPI 등) | OpenAPI 명세 주소를 받음 | |
| 6 | 개발 서버 주소와 https 지원 여부 | https 전체 주소 (`dev:phone` 확인용) | |
| 7 | CORS 허용 출처. 두 서비스 모두 웹 개발·배포 주소와 Capacitor 앱 출처를 허용하는지 | BE가 허용. 앱 출처는 플랫폼·Capacitor 버전에 따라 달라서(`http://localhost`, `capacitor://localhost` 등) 실제 앱에서 확인한 값을 전달 | |
| 8 | 성공 응답 형식 | A: 본문이 곧 데이터 | |
| 9 | 에러 응답 형식과 에러 코드 목록 (Spring Boot 기본 오류 응답을 쓰는지, `{ code, message }`를 따로 정하는지) | `{ code, message }`, 한국어 `message` | |
| 10 | 인증 방식 (JWT, 세션 쿠키 등), 소셜 로그인 여부, 어느 서비스가 맡는지, 두 서비스가 같은 토큰을 받는지 | `Authorization: Bearer` 헤더, 같은 토큰 | |
| 11 | 토큰 만료 시 처리 (재발급 토큰 유무) | 재발급이 없으면 401에서 로그인 화면으로 | |
| 12 | 웹과 앱의 토큰 저장 방식 (쿠키가 앱에서 동작하는지 포함) | 웹·앱 모두 헤더 방식 | |
| 13 | 사용자·의류 테이블의 키 형식과 NULL 허용 정책 (BE `/todo`). 특히 `id`가 숫자인지 문자열인지, `Item`의 `sub`, `hex`, `img` 등이 비어 올 수 있는지 | 숫자 id (`types.ts`와 같음) | |
| 14 | 날짜 형식과 시간대 | ISO 8601 (`2026-11-24T09:00:00+09:00`) | |
| 15 | 이미지 업로드 크기·형식 제한(예: 몇 MB, JPEG·PNG), 서버가 주는 이미지 주소가 전체 주소인지, 공개 주소인지 만료되는 주소인지 (업로드 방식은 **서버를 거치는 `multipart`로 결정**) | 사진은 올리기 전에 줄여서 보냄. 주소는 전체 주소 | |
| 21 | 사진 분석 요청이 한 번에 응답하는지, 접수 후 결과를 따로 조회하는지. 응답 시간이 얼마나 걸리는지 | 한 번에 응답. 오래 걸리면 접수 후 조회 | |
| 22 | 분석만 하고 저장하지 않은 사진(취소·실패)을 Blob에서 정리하는 방법 | BE가 일정 시간 뒤 정리 | |
| 16 | 저장한 코디(`Saved`), 입은 기록(`Hist`), 입을 계획(`Plan`)은 어느 서비스가 맡는지 | `closet-service` | |
| 17 | 커뮤니티(글, 댓글, 좋아요, 팔로우), 유행(`Trend`) 데이터를 맡을 서비스가 있는지, 있다면 언제인지 | 일정이 없으면 계속 가짜 데이터 | |
| 18 | 추천 응답의 모양 (`Outfit`: 옷 id 5칸 + 이유 문구 그대로 줄 수 있는지) | `types.ts`의 `Outfit` | |
| 19 | 목록 쪽 나누기(페이지네이션) 방식과 쪽 크기 | 커뮤니티 피드만 필요. 방식은 BE 의견에 맞춤 | |
| 20 | 요청 제한, 요청 타임아웃, 재시도 정책 | 정해진 값이 없으면 프론트엔드 기본값(10초)으로 시작 | |
