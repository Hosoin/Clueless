# 백엔드 통신 규칙

프론트엔드가 백엔드(BE)의 API를 호출하는 방법과 규칙입니다. **실제 API를 호출하는 것을 기준으로 쓰고, 아직 API가 연결되지 않은 부분은 가짜 데이터(`seed.ts`)로 대신하는 방법을 함께 적습니다.**

- 기준 문서: `백엔드 구조 초안.md` (BE가 공유한 구조 초안). 그 문서의 내용만 BE 사실로 적고, 거기에 없는 것은 `계약 미확정`으로 표시합니다. 확정되지 않은 내용을 정해진 것처럼 쓰지 않습니다.
- 인증(로그인)은 BE가 이미 구현한 `closet-service` 코드(`AuthController`, `SecurityConfig`)를 확인한 내용을 BE 사실로 적습니다. 인증은 이 문서의 [4장](#4-로그인과-인증-세션-쿠키)이 기준입니다.
- 아직 합의하지 않은 항목은 맨 아래 [BE 확인 필요](#be-확인-필요) 표에 모았습니다. 정해지면 본문의 `미확정` 표시를 고칩니다.
- 이 문서는 규칙입니다. 지금 `src/api/`에는 로그인 부분(`client.ts`, `error.ts`, `auth.ts`)만 구현되어 있고, 옷·추천 등 나머지는 아직 없습니다. 코드를 만들 때 이 문서를 따릅니다.
- `CLAUDE.md`의 "API 연동 방식은 정하는 중" 문구는 이 문서가 확정된 뒤에 고칩니다. 그전에는 로그인 외의 `fetch` 코드나 API 주소를 `src/`에 추가하지 않습니다.
- 사용할 라이브러리는 [`LIBRARIES.md`](LIBRARIES.md)의 "도입 예정"을 참고하세요. 별도 라이브러리 없이 `fetch` 래퍼를 쓰는 것을 전제로 합니다.

## 0. 현재 상태: 가짜 데이터로 동작 중

로그인을 뺀 화면의 데이터는 모두 `src/data/seed.ts`의 가짜 데이터입니다. 서버를 부르는 코드는 로그인(`src/api/auth.ts`)뿐입니다.

| 항목 | 상태 |
| --- | --- |
| 화면 데이터 | `seed.ts` → `store.ts`의 `S` (메모리). 새로고침하면 처음 상태로 돌아감 |
| BE | 두 서비스(`closet-service`, `recommendation-service`)가 `GET /test`를 응답. `closet-service`에는 Google 로그인과 세션 인증(`/api/auth/me`, `/api/auth/logout`)이 구현되어 있음. 옷 사진 분석·확정·수정·사진 보기 API도 있음(아래 표, [`backend/README.md`](../../backend/README.md)). 옷 상세·목록 조회·삭제와 추천 API는 아직 없음 |
| 프론트 `src/api/` | 로그인과 옷 사진 분석만 있음: `client.ts`(공통 요청, 가짜 데이터 스위치 `MOCK`·`mock`), `auth.ts`(로그인 확인·로그아웃·Google 로그인 주소), `items.ts`(옷 사진 분석 `analyzeItemPhoto`), `error.ts`. 옷 확정·수정과 추천 등은 아직 없음 |

그래서 이 문서의 방식은 두 가지를 동시에 만족해야 합니다.

1. **실제 API를 호출하는 코드**를 `src/api/`에 규칙대로 만든다.
2. **API가 연결되기 전까지는** 같은 함수가 `seed.ts`의 가짜 데이터를 돌려준다. (화면은 어느 쪽인지 모른다)

API가 하나씩 열리면 해당 부분만 가짜 데이터에서 실제 호출로 바꿉니다. 방법은 [6장](#6-가짜-데이터에서-실제-api로-넘어가기)에 있습니다.

### BE 구조 (프론트엔드 관점 요약)

| 서비스 | 포트 | 담당 (BE 문서 기준) | 지금 있는 API | 다음 |
| --- | --- | --- | --- | --- |
| `closet-service` | 8081 | 옷장·의류 관련 API, 로그인·사용자 | `GET /test` (UTF-8 일반 텍스트), `GET /oauth2/authorization/google`, `GET /api/auth/me`, `POST /api/auth/logout` ([4장](#4-로그인과-인증-세션-쿠키)). 옷: `POST /api/closet/analyze`(multipart `image` 파일 1개), `POST /api/closet/items/{id}/confirm`, `PATCH /api/closet/items/{id}`, `GET /api/closet/preview?id=` ([`backend/README.md`](../../backend/README.md), [5장](#5-이미지와-파일)). 프론트는 분석만 연결함 | 옷 상세·목록 조회·삭제 API 없음 (BE 미구현) |
| `recommendation-service` | 8082 | 추천 관련 API | `GET /test` (UTF-8 일반 텍스트) | 업무 API 계약 미확정 |

- 서비스가 **둘로 나뉘어 있고 포트가 다릅니다.** 게이트웨이(하나의 주소로 합쳐 주는 곳)가 BE 문서에 없으므로, 프론트는 서비스마다 주소를 따로 가진다고 가정합니다. 게이트웨이가 생기면 주소 환경 변수 하나로 합칩니다.
- BE는 Spring Boot(MVC)이고, 두 서비스 모두 Spring JDBC와 HikariCP로 개발 PostgreSQL에 연결하도록 설정되어 있습니다. JPA는 후속 범위입니다. (`backend/build.gradle`, `application.yml`, `backend/docs/ARCHITECTURE.md`. 프론트가 신경 쓸 부분은 아님)
- 서비스 간 보유 옷 조회와 배포 환경은 BE도 아직 확정하지 않았습니다. ML 연동은 옷 사진 분석만 구현되어 있고, 크롭 사진을 주고받는 형식은 ML과 맞추는 중입니다([5장](#5-이미지와-파일)).

### 프론트 데이터와 담당 서비스

화면의 데이터를 어느 서비스가 맡는지입니다. BE 문서에 담당이 적혀 있지 않은 것은 `미정`으로 두고, 그동안 계속 가짜 데이터를 씁니다.

| 프론트 데이터 (용어 사전) | 타입 | 담당 서비스 | API 연결 | 지금 데이터 |
| --- | --- | --- | --- | --- |
| 옷 (`Item`): 조회, 등록, 삭제, 추천 제외 | `Item` | `closet-service` | 등록(분석·확정)과 수정(`PATCH`)만 API 있음. 조회·삭제 API는 없고, 추천 제외를 저장할 칸도 없음 | 가짜 데이터 |
| 옷 사진 분석(AI가 고른 값)과 확정 저장 (`Upload`) | `Item`, `Category` | `closet-service` (BE가 ML을 부름) | API 있음([5장](#5-이미지와-파일)). 프론트는 분석만 연결(`Upload` → `analyzeItemPhoto`), 확정 저장은 미연결 | `VITE_MOCK_CLOSET=true`면 `items.ts`의 가짜 분석 결과, 예시 사진은 화면 안의 가짜 결과 |
| 추천 코디 (`Outfit`) | `Outfit` | `recommendation-service` | 계약 미확정 | `store.ts`의 규칙 + 가짜 데이터 |
| 저장한 코디 (`Saved`) | `Saved` | 미정 | 담당 미정 | 가짜 데이터 |
| 입은 기록 (`Hist`), 입을 계획 (`Plan`) | `Hist`, `Plan` | 미정 | 담당 미정 | 가짜 데이터 |
| 커뮤니티 글 (`Post`), 댓글 (`Comment`) | `Post`, `Comment` | 서비스 없음 | 담당 미정 | 가짜 데이터 |
| 로그인, 내 정보 | (`S.me`, `S.loggedIn`) | `closet-service` | Google 로그인·내 정보·로그아웃은 구현됨 ([4장](#4-로그인과-인증-세션-쿠키)). 카카오·Apple은 BE에 없음 | Google 버튼만 실제 로그인, 그 밖은 가짜 로그인 |
| 유행 (`Trend`) | `Trend` | 미정 | 담당 미정 | 가짜 데이터 |

이 표는 API가 연결될 때마다 `API 연결`과 `지금 데이터` 칸을 고칩니다.

## 1. API 기본 주소

API 주소는 코드에 직접 적지 않고 Vite 환경 변수로 받습니다. 서비스가 둘이므로 주소도 둘입니다.

### 환경 변수 키

| 키 | 예시 (로컬) | 설명 |
| --- | --- | --- |
| `VITE_CLOSET_API_URL` | 비움 | `closet-service` 주소. 비우면 같은 출처의 `/api`로 요청하고 개발 서버 프록시나 배포 nginx가 백엔드로 넘깁니다. Capacitor 앱으로 빌드할 때만 전체 주소(예: `http://localhost:8081`)를 적습니다. 끝에 `/`를 붙이지 않습니다 (`src/api/client.ts`) |
| `VITE_CLOSET_LOGIN_URL` | 비움 | Google 로그인을 시작할 백엔드 주소(화면 이동용 전체 주소). 로그인은 화면 이동이라 프록시를 쓸 수 없어서 API 주소와 따로 정합니다. 비우면 `VITE_CLOSET_API_URL`, 그것도 비면 `http://localhost:8081`. 배포 빌드에서는 `<BE 배포 주소>`를 넣습니다 (`src/api/auth.ts`, Dockerfile의 `--build-arg`) |
| `API_PROXY_TARGET` | `http://localhost:8081` | 개발 서버(`npm run dev`)가 `/api`를 넘길 백엔드 주소. `VITE_`로 시작하지 않아 빌드 결과에는 들어가지 않습니다 (`vite.config.ts`) |
| `VITE_RECOMMENDATION_API_URL` | `http://localhost:8082` | (예정, 아직 코드가 읽지 않음) `recommendation-service` 주소. 끝에 `/`를 붙이지 않습니다 |
| `VITE_MOCK_CLOSET` | `true` | `true`면 `closet-service` 대신 가짜 데이터를 씁니다. 지금은 옷 사진 분석(`src/api/items.ts`)만 읽습니다. 비우면 실제 서버를 부릅니다 (`src/api/client.ts`의 `MOCK`) |
| `VITE_MOCK_RECOMMENDATION` | `true` | (예정, 아직 코드가 읽지 않음) `true`면 `recommendation-service` 대신 가짜 데이터를 씁니다 |

- 포트(8081, 8082)는 BE 문서의 `application.yml` 값입니다. 개발·배포 서버 주소는 BE 확인 필요입니다.
- **지금 `.env.example`에는 `VITE_RECOMMENDATION_API_URL`과 `VITE_MOCK_*`가 주석으로만 들어 있습니다.** 코드가 아직 읽지 않는 값이라서, API를 연결할 때 주석을 풀고 `src/vite-env.d.ts`에도 타입을 추가합니다. 서비스 API가 열리면 그 서비스의 `MOCK` 값만 `false`로 바꿉니다. 서비스가 하나씩 열리는 일정에 맞추려고 서비스별로 나눴습니다.
- 서비스가 정해지지 않은 데이터(커뮤니티, 입은 기록 등)는 환경 변수 없이 항상 가짜 데이터입니다. 담당 서비스가 정해지면 같은 방식의 키를 추가합니다.

### 파일

| 파일 | 커밋 | 용도 |
| --- | --- | --- |
| `frontend/.env.example` | O | 키 이름과 설명, 안전한 기본값만 적은 견본 (`VITE_CLOSET_API_URL`은 비움, `API_PROXY_TARGET=http://localhost:8081`, 아직 쓰지 않는 키는 주석) |
| `frontend/.env.development` | 팀 합의 후 결정 | `npm run dev`에서 쓰는 값 |
| `frontend/.env.phone` | 팀 합의 후 결정 | `npm run dev:phone`에서 쓰는 값 (`--mode phone`) |
| `frontend/.env.production` | 팀 합의 후 결정 | `npm run build`에서 쓰는 값 |
| `frontend/.env.local` | X | 개인 설정. 내 PC에서 `MOCK`을 바꿀 때 여기에 씁니다 |

- 루트 `.gitignore`가 `.env`와 `.env.*`를 제외하고 `.env.example`만 허용합니다. `.env.development` 같은 파일을 커밋하려면 `.gitignore`를 고쳐야 하므로, 주소를 공개해도 되는지 확인한 뒤 결정합니다. (저장소가 공개되어 있습니다)
- **`VITE_`로 시작하는 값은 빌드 결과물에 그대로 들어가 누구나 볼 수 있습니다.** 키·비밀번호·토큰을 넣지 않습니다.
- 환경 변수는 `src/api/client.ts` 한 곳에서만 읽습니다. 타입은 `src/vite-env.d.ts`에 선언합니다.
- 환경 변수를 추가하면 `.env.example`과 이 표를 같이 고칩니다.

### 주의: 웹과 Capacitor 앱의 주소

- 웹(개발 서버·Docker 배포)은 `VITE_CLOSET_API_URL`을 비워 두고 같은 출처의 `/api`로 부릅니다. 개발 서버는 `vite.config.ts`의 `server.proxy`가, 배포 이미지는 `nginx/default.conf.template`이 `/api`를 `closet-service`로 넘깁니다.
- Capacitor 앱은 서버가 아니라 폰 안의 파일에서 열리므로(`base: './'`) `/api/...` 같은 상대 주소가 동작하지 않습니다. 앱으로 빌드할 때만 `https://...` 또는 `http://...`로 시작하는 전체 주소를 씁니다.
- `npm run dev:phone`은 https로 열립니다. 프록시를 쓰면(같은 출처의 `/api`) 브라우저는 https로만 부르고 http 백엔드는 개발 서버가 대신 부르므로 막히지 않습니다. `VITE_CLOSET_API_URL`에 `http://` 전체 주소를 넣으면 https 화면에서 http API를 부르게 되어 브라우저가 막습니다(혼합 콘텐츠).
- 폰에서는 `localhost`가 폰 자신을 가리킵니다. 같은 와이파이의 PC를 쓸 때는 PC의 주소(`192.168.x.x`)를 씁니다.
- **CORS**: 같은 출처의 `/api`로 부르면 CORS가 필요 없습니다. 출처가 다르게 직접 부르려면(Capacitor 앱 등) BE가 프론트 출처를 정확한 주소로 허용하고 쿠키 허용(`allowCredentials`)도 켜야 합니다. `*`로는 쿠키가 동작하지 않습니다. `closet-service`는 `http://localhost:5173`에 대해서만 `GET /api/auth/me`(`X-CSRF-TOKEN` 응답 헤더 노출)와 옷 확정·수정(`confirm`, `PATCH`)을 CORS로 허용합니다 ([`backend/README.md`](../../backend/README.md)). 앱 출처 허용은 `BE 확인 필요`

## 2. 요청 함수 위치와 이름

### 위치

```
src/api/
├─ client.ts          공통 요청 함수: 서비스별 request 만들기, 주소·세션 쿠키·CSRF·에러 처리, 가짜 데이터 스위치
├─ error.ts           ApiError (status, code, message)
├─ items.ts           옷 관련 요청 (closet-service)
├─ outfits.ts         추천 코디 요청 (recommendation-service)
├─ history.ts         입은 기록·계획·저장한 코디 (담당 서비스 미정, 지금은 가짜 데이터만)
├─ posts.ts           커뮤니티 글·댓글 (담당 서비스 미정, 지금은 가짜 데이터만)
└─ auth.ts            로그인 확인(`/api/auth/me`), Google 로그인 시작, 로그아웃 (세션 쿠키 방식, [4장](#4-로그인과-인증-세션-쿠키))
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

> 아래는 앞으로 만들 모양입니다. 지금 `src/api/client.ts`에는 로그인용 `closetFetch()`(세션 쿠키·CSRF 헤더를 붙이고 `Response`를 그대로 돌려줌)와 `CLOSET_URL`, `setCsrf`·`clearCsrf`·`hasCsrf`, 가짜 데이터 스위치 `MOCK`(지금은 `closet`만)과 `mock`만 있고, `createRequest`, `closetRequest`, `recommendationRequest`, `ApiError.from`(`src/api/error.ts`)은 아직 없습니다.

```ts
// src/api/client.ts
import { ApiError } from './error'

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>

/** CSRF 토큰: 로그인 확인(/api/auth/me) 응답 헤더로 받아 메모리에만 둔다 (4장). 새로고침하면 /me에서 다시 받는다 */
let csrf: { header: string; token: string } | null = null
export const setCsrf = (header: string, token: string) => { csrf = { header, token } }
export const clearCsrf = () => { csrf = null }

/** 서비스 하나의 주소로 요청 함수를 만든다 (서비스마다 주소가 달라서 서비스별로 만듦) */
function createRequest(baseUrl: string): RequestFn {
  return async <T>(path: string, init: RequestInit = {}) => {
    const isRead = (init.method ?? 'GET').toUpperCase() === 'GET'
    let res: Response
    try {
      res = await fetch(`${baseUrl}${path}`, {
        ...init,
        credentials: 'include', // 로그인 세션 쿠키를 같이 보낸다 (4장)
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && !isRead ? { [csrf.header]: csrf.token } : {}), // 값을 바꾸는 요청에만 CSRF 토큰
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

### 성공 응답

지금 BE는 **A**처럼 본문이 곧 데이터인 JSON을 줍니다(`/api/auth/me`, 옷 사진 분석). 로그아웃·옷 확정·옷 수정처럼 성공해도 본문이 없는 요청은 `204`라서 `response.json()`을 부르지 않습니다. 프론트엔드도 **A**를 원했습니다(요청 함수가 단순하고 `types.ts`와 바로 맞기 때문). 목록 API가 생기면 전체 개수·다음 쪽 정보를 어떻게 줄지 다시 정합니다.

| 안 | 모양 | 비고 |
| --- | --- | --- |
| A | 본문이 곧 데이터: `[{ "id": 1, ... }]` | 전체 개수·다음 쪽 정보는 헤더나 별도 필드로 |
| B | 감싸서 줌: `{ "data": [...], "meta": {...} }` | `request()`에서 `data`만 꺼내서 돌려줌 |

### 에러 응답

지금 BE의 로그인·옷 API 컨트롤러는 오류일 때 **본문 없이 상태 코드만** 돌려줍니다. 상태 코드별 뜻은 [`backend/README.md`](../../backend/README.md)에 있습니다(예: 옷 사진 분석 400·413·415·422·502·503·504, 확정·수정 400·404·413·503, CSRF 누락·불일치 403). 그래도 형식이 바뀌어도 깨지지 않도록 `ApiError.from()`은 **어떤 형식이 와도** 아래 순서로 읽습니다. 지금은 3번으로 처리됩니다.

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
| 401 (로그인 필요·세션 만료) | `toLogin(현재 주소)` (`src/nav.ts`). 단, 앱을 켤 때 `/api/auth/me`가 401이면 오류가 아니라 "로그인 안 됨"이라 알림 없이 로그인 화면으로 보냅니다 ([4장](#4-로그인과-인증-세션-쿠키)) |
| 서버 오류 (5xx) | 서버가 준 문구 대신 `'잠시 후 다시 시도해 주세요'`를 보여 줍니다. 서버 내부 메시지를 그대로 노출하지 않습니다 |
| 입력값 오류 (400 등) | `message`를 `toast`로 보여 주거나 입력칸 옆에 보여 줍니다. 필드별 에러 형식은 BE 확인 필요 |
| 목록을 못 불러옴 | 화면은 빈 화면(`empty` 클래스)에 "다시 불러오기" 버튼을 두고, `toast`는 쓰지 않습니다 |

- `toast`는 2.4초 만에 사라지므로 사용자가 꼭 알아야 하고 되돌릴 수 없는 에러는 `openModal`로 띄웁니다.
- 에러 문구는 `CLAUDE.md`의 규칙(조사 `eun`/`iga` 사용, `을(를)` 표기 금지)을 따릅니다.
- 로딩 중에는 버튼을 비활성화해서 같은 요청이 두 번 가지 않게 합니다.

## 4. 로그인과 인증 (세션 쿠키)

BE(`closet-service`)가 이미 구현한 방식이 기준입니다. **Google 소셜 로그인 + 서버 세션**이고, 프론트가 토큰을 저장하거나 `Authorization` 헤더를 붙이지 않습니다. 로그인 상태는 브라우저의 세션 쿠키로 유지됩니다. (코드 기준: `AuthController`, `SecurityConfig`)

### BE가 제공하는 것

| 주소 (`closet-service`) | 메서드 | 하는 일 |
| --- | --- | --- |
| `/oauth2/authorization/google` | GET | Google 로그인 시작. 브라우저가 이 주소로 이동하면 BE가 Google 로그인 화면으로 보냅니다 (302) |
| `/api/auth/me` | GET | 로그인한 사용자 정보. 200이면 `{ id, userName, nickName, email }`(`id`는 문자열), 로그인 안 됐으면 401. 200 응답의 **헤더에 CSRF 토큰**(헤더 이름과 값)이 같이 옵니다 |
| `/api/auth/logout` | POST | 로그아웃. 204 (본문 없음) |
| `/test` | GET | 로그인 없이 부를 수 있는 유일한 경로 |

- 위 외의 모든 경로는 로그인이 필요하고, 로그인하지 않으면 로그인 화면으로 보내지 않고 **401**만 돌려줍니다.
- Google 로그인에 성공하면 BE가 브라우저를 `FRONTEND_LOGIN_SUCCESS_URL`(로컬은 `http://localhost:5173/#`)로 보냅니다. BE 기본값을 `/home`에서 `#`으로 바꾸는 작업은 BE에서 진행 중이라, 지금 로컬 BE를 켤 때는 이 환경 변수를 직접 줍니다. 첫 설정으로 보낼지 홈으로 보낼지는 앱이 정합니다(아래 앱 흐름). BE 환경 변수 `FRONTEND_LOGIN_SUCCESS_URL`로 이 주소를 바꿀 수 있습니다(`application.yml`의 `closet.security.google.success-url`). 실패하면 화면 이동 없이 401입니다.
- BE에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 환경 변수가 없으면 Google 로그인이 꺼져 있어 `/oauth2/authorization/google`이 동작하지 않습니다. 팀원 PC마다 확인합니다.
- 카카오·Apple 로그인은 BE에 없습니다. 로그인 화면의 두 버튼은 계속 가짜 로그인입니다.

### 앱 흐름

```
앱 시작
  └─ [로딩 화면] GET /api/auth/me (credentials: 'include')
       ├─ 401 → 로그인 화면
       │         ├─ [Google로 계속하기] → 브라우저가 /oauth2/authorization/google 로 이동
       │         │     → Google 로그인 → BE가 앱을 다시 엶 → (맨 위로 돌아가 /me부터 다시)
       │         └─ [로그인 없이 둘러보기] → 게스트 (정책 미확정)
       └─ 200 → S에 사용자 정보 저장, S.loggedIn = true, CSRF 토큰 보관
            ├─ 방금 Google 로그인을 하고 돌아왔다 → /onboard (첫 설정)
            └─ 이미 로그인된 상태로 앱을 열었다 → 홈 (로그인·첫 설정 화면이었으면 홈으로, 다른 화면은 그대로)
```

- "로그인했는지"의 기준은 **항상 서버**입니다. `S.loggedIn`은 `/me` 결과를 반영하는 값이고, 새로고침하면 `/me`로 다시 정합니다. `localStorage`에 로그인 정보를 저장하지 않습니다. 예외로 "방금 Google 로그인 버튼을 눌렀다"는 표시만 `sessionStorage`에 남겼다가 앱이 다시 열리면 읽고 바로 지웁니다(`api/auth.ts`의 `markGoogleLoginStart`, `takeGoogleLoginReturn`).
- Google 로그인은 `fetch`가 아니라 **브라우저 화면 이동**(`window.location.href = ...`)으로 시작합니다. Google 화면으로 갔다가 돌아오는 방식이라 `fetch`로는 동작하지 않습니다. 돌아올 때는 페이지가 새로 불러와져 `S`가 초기화되므로, 돌아온 뒤의 로그인 상태는 `/me`로 되찾습니다.
- `/me`의 `userName`·`nickName`·`email`은 비어 있으면 `null`입니다(`api/auth.ts`의 `Me`). 화면의 닉네임은 `nickName` → `userName` → 빈칸 순서로 정합니다. 가짜 데이터의 닉네임('옷장탐험가')을 남기지 않습니다.
- 로그인 API(`/me`, 로그아웃)는 **10초**가 지나도 응답이 없으면 끊습니다(`closetFetch`의 `timeoutMs`). 앱을 켤 때 `/me`가 시간 초과·연결 실패·5xx이면 로그인 화면으로 보내되, 401과 달리 [3장](#화면에-보여-주기)의 문구(`'서버에 연결할 수 없어요'`, `'잠시 후 다시 시도해 주세요'`)를 `toast`로 띄웁니다(`api/error.ts`의 `errorText`).
- Google 로그인 시작 주소는 API 주소와 따로 정합니다(`VITE_CLOSET_LOGIN_URL`, [1장](#환경-변수-키)). API는 같은 출처의 `/api` 프록시로 부르더라도, 로그인은 브라우저가 백엔드 주소로 직접 이동해야 하기 때문입니다. Google이 돌려주는 콜백(`/login/oauth2/code/google`)은 BE가 처리하고, 프론트는 code·state를 다루지 않습니다.
- `/me`의 응답이 오기 전에는 로그인 화면이나 홈을 그리지 않고 로딩 화면을 보여 줍니다. (`Layout.tsx`가 처음에 무조건 `/login`으로 보내던 부분은 이 흐름으로 바뀌었습니다)
- 첫 설정(가입) 여부는 지금 BE 응답에 없습니다. 그래서 Google 로그인을 할 때마다 이미 가입한 사람도 첫 설정이 뜹니다. BE가 알려 주면 "방금 로그인 + 첫 설정 안 함"일 때만 첫 설정으로 보냅니다. `BE 확인 필요`

### 요청에 붙는 것 (`client.ts`)

- 모든 요청에 `credentials: 'include'`를 붙여 세션 쿠키를 같이 보냅니다. 지금 붙이는 곳은 `client.ts`의 `closetFetch()` 한 곳입니다. (`createRequest()`를 만들면 그 안으로 옮깁니다)
- **CSRF**: GET이 아닌 요청(지금 BE에서는 POST와 PATCH)에는 `/me` 응답 헤더로 받은 CSRF 토큰을 **같은 헤더 이름으로** 보내야 합니다(지금 이름은 `X-CSRF-TOKEN`). 로그아웃(`POST /api/auth/logout`)과 옷 사진 분석(`POST /api/closet/analyze`)도 마찬가지입니다. 토큰이 없거나 틀리면 403입니다. 헤더 이름은 BE가 응답으로 알려 주므로 코드에 적지 않습니다. 토큰은 메모리에만 두고(`setCsrf`) 새로고침하면 `/me`에서 다시 받습니다. 로그인처럼 세션이 바뀌면 `/me`를 다시 불러 새 토큰을 받습니다(Google 로그인은 앱이 새로 열리므로 시작할 때 받음).
- **로그아웃**(`api/auth.ts`의 `logout()`)은 서버 로그인일 때만 서버에 요청합니다. 서버 로그인인지는 `/me`가 200이었는지로 `api/auth.ts` 안에서만 기억합니다(`S` 구조는 그대로). 카카오·Apple 가짜 로그인은 서버 요청 없이 끝납니다.
  - CSRF 토큰이 없으면 `/me`로 먼저 받습니다. 토큰 없이 끝내면 서버 세션이 남은 채 "로그아웃했어요"가 뜹니다. `/me`가 401이면 이미 로그아웃된 것으로 봅니다.
  - 403(토큰이 없거나 틀림)이면 `/me`로 토큰을 새로 받아 **한 번만** 다시 보냅니다. 그래도 403이면 `'로그아웃하지 못했어요. 새로고침한 뒤 다시 해 주세요'`를 띄우고 로그인 상태를 그대로 둡니다.
  - 204(또는 이미 끝난 세션의 401)이면 CSRF 토큰을 지우고(`clearCsrf`), 설정 화면(`Settings.tsx`)이 `store.ts`의 `clearMe()`로 `S`의 내 정보를 비운 뒤 로그인 화면으로 보냅니다.

### 401 처리

- 앱을 켤 때 `/me`가 401이면 "로그인 안 됨"입니다. 오류 알림을 띄우지 않습니다.
- 그 밖의 요청이 401이면 세션이 끝난 것으로 보고 `toLogin(현재 주소)`로 보냅니다. ([3장](#화면에-보여-주기))
- 재발급 API는 없습니다. 세션이 얼마나 유지되는지는 BE 확인 필요입니다.

### 개발할 때 주의

- 웹 화면(`localhost:5173`)과 BE(`localhost:8081`)는 출처가 다릅니다. 지금은 개발 서버의 Vite 프록시(`vite.config.ts`)와 배포 이미지의 nginx로 같은 출처의 `/api`처럼 부르므로 CORS 없이도 `/me`를 쿠키와 함께 부를 수 있습니다. ([1장](#주의-웹과-capacitor-앱의-주소))
- **배포 BE와 연결할 때 지금 막히는 점** (BE의 FE 연동 요약: "FE 세션 전달·동일 오리진 프록시 구성은 미확정"). 프론트에서 우회하지 않고 BE에 요청할 사항입니다. `BE 확인 필요`
  - 로그인은 BE 도메인으로 이동해 끝나므로 세션 쿠키가 **BE 도메인**에 생깁니다. 개발 서버나 nginx 프록시로 같은 출처의 `/api`를 부르면 그 쿠키가 실리지 않아 로그인 뒤에도 `/me`가 401입니다.
  - `localhost:5173`에서 BE 주소를 직접 부르면(`VITE_CLOSET_API_URL`) 출처와 사이트가 달라집니다. 세션 쿠키에 `SameSite=None; Secure`가 없어 브라우저가 쿠키를 보내지 않고, 401 응답에 CORS 헤더가 없어 브라우저가 응답을 읽지 못하며, 로그아웃(`POST` + `X-CSRF-TOKEN`) 사전 요청(preflight)에 허용 헤더가 없어 막힙니다.
- 쿠키 방식은 **Capacitor 앱의 웹뷰에서 잘 붙지 않을 수 있습니다.** 폰 앱까지 쓰려면 BE와 인증 방식을 다시 정해야 할 수 있습니다. `BE 확인 필요`
- 세션 쿠키와 CSRF 토큰은 `console.log`로 찍거나 커밋하지 않습니다.

## 5. 이미지와 파일

### 옷 데이터와 이미지는 따로 저장됩니다

| 데이터 | 저장 위치 | 화면이 받는 방법 |
| --- | --- | --- |
| 옷 정보(이름, 종류, 세부 종류, 색, 스타일 등) | DB (`closet_items`) | 옷 사진 분석 응답(JSON)으로 받습니다. 저장한 옷을 다시 받는 상세·목록 API는 아직 없습니다 |
| 옷 사진 파일 | Blob Storage (DB에는 파일 키만) | 분석 직후에는 응답의 `previewImg`(5분 동안만 열리는 SAS 주소), 확정한 뒤에는 `GET /api/closet/preview?id=`(주소가 아니라 이미지 자체, 세션 쿠키 필요) |

- BE는 확정한 옷 사진의 주소를 따로 주지 않습니다. 그래서 `Item.img`는 `GET /api/closet/preview?id=` 경로로 만들면 됩니다. 같은 출처의 `/api`로 부르면 `<img>`도 세션 쿠키를 같이 보냅니다. Capacitor 앱에서는 `VITE_CLOSET_API_URL`을 앞에 붙인 전체 주소가 필요합니다.
- `previewImg`는 5분이 지나면 열리지 않는 주소라서 다시 쓸 수 없습니다. 옷 등록 확인 창은 지금처럼 내 기기의 사진(`URL.createObjectURL`)을 씁니다.
- `CLAUDE.md`는 "이미지는 `import` 또는 `seed.ts`의 `photo`, `cpic`로 불러온다"고 하는데, 서버 이미지는 이 규칙의 예외가 됩니다.

### 옷 사진 올리기: 서버를 거치는 방식

옷 등록(`Upload.tsx`)은 **분석**과 **확정 저장** 두 단계입니다. 사진 파일은 **백엔드로 보내고, 백엔드가 ML에 분석을 맡깁니다.** 화면은 Blob이나 ML에 직접 접근하지 않습니다. 아래는 BE가 구현한 흐름입니다([`backend/README.md`](../../backend/README.md)의 "의류 분석", "의류 최종 저장 및 부분 편집").

```
① 화면 ──(POST /api/closet/analyze: multipart image 파일 1개, CSRF 헤더)──▶ 백엔드
② 백엔드 ──▶ ML 분석 (크롭 사진은 ML이 Blob에 올리고 그 키를 돌려줌)
③ 백엔드 ──▶ DB에 DRAFT로 저장
④ 화면 ◀──({ retake: true } 또는 { id, previewImg, category, sub_category, color, hex, styles, name, retake: false })── 백엔드
⑤ 사용자가 한 벌씩 확인 창(1/N … N/N)에서 틀린 것만 고침
⑥ 화면 ──(POST /api/closet/items/{id}/confirm: 바꾼 값만. {}면 분석 값 그대로)──▶ 백엔드 ──▶ 204 (본문 없음)
⑦ 확정한 옷의 사진은 GET /api/closet/preview?id= 로 받음. 옷 정보를 다시 받는 API는 아직 없음
```

| 단계 | 요청 함수(이름은 프론트가 정함) | 호출 API (`closet-service`) |
| --- | --- | --- |
| ①~④ 분석 | `analyzeItemPhoto(file)` | `POST /api/closet/analyze` |
| ⑥ 확정 저장 | `createItem(input)` (확정에는 DRAFT의 `id`가 필요해서 모양을 다시 정해야 함) | `POST /api/closet/items/{id}/confirm` |
| 저장한 뒤 고치기 | `updateItem(id, input)` | `PATCH /api/closet/items/{id}` |

- 분석 응답에서 `sub_category`, `color`, `hex`는 `null`, `styles`는 빈 배열일 수 있습니다. 색을 고르지 못한 분석(`color: null`)은 확정할 때 `color`를 꼭 보내야 합니다.
- 확정·수정에 보낼 수 있는 칸은 `name`(50자까지), `category`, `sub_category`, `color`, `hex`, `styles`, `tags`, `memo`뿐입니다. `material`(재질), 추천 제외, 별명 칸은 없습니다.
- `id`는 JSON 문자열(bigint)입니다. `types.ts`의 `Item.id`는 숫자라서 변환 방법을 정해야 합니다([6장](#넘길-때-미리-알아-둘-것)).
- **BE 배포 전 확인 사항**: BE는 ML이 크롭 사진을 Blob에 올리고 키(`crop_blob`)를 돌려주기를 기대합니다. 지금 ML은 base64 PNG만 돌려줘서, 재촬영이 아닌 분석은 `502`로 끝납니다(`backend/README.md`의 "배포 전 확인"). ML 쪽 변경이 들어가야 등록 흐름을 끝까지 시험할 수 있습니다.

화면(프론트)이 지킬 것:
- **파일 전송은 JSON이 아닙니다.** `FormData`에 파일을 담아 보내고, `Content-Type`은 적지 않습니다. 브라우저가 경계값까지 넣어 정하기 때문입니다. 지금 `client.ts`의 `closetFetch()`는 본문이 문자열일 때만 JSON `Content-Type`을 붙이므로 `FormData`를 그대로 넘기면 됩니다.
- **올리기 전에 사진을 줄입니다.** 지금은 1024×1024px JPEG(남는 곳은 흰 여백)로 줄여서 보냅니다(`src/image.ts`). BE는 JPEG·PNG·WebP를 최대 10 MiB까지 받습니다.
- **사진 방향을 바로잡습니다.** 폰 사진은 EXIF 정보 때문에 눕거나 뒤집혀 보일 수 있습니다. (`src/image.ts`가 사진의 회전 정보를 반영해 다시 그립니다)
- **미리보기는 내 기기의 사진으로 바로 보여 줍니다.** `URL.createObjectURL`로 만든 주소를 쓰고, 서버 응답을 기다리지 않습니다. 쓰고 나면 `URL.revokeObjectURL`로 정리합니다.
- **여러 장이면 장마다 상태를 가집니다.** BE는 사진을 한 장씩 받습니다. 올리는 중, 분석 중, 완료, 다시 찍기(`retake: true`), 실패(400·413·415·422·502·503·504)를 사진마다 보여 주고, 한 장이 실패해도 나머지는 계속합니다. 실패는 사용자가 할 수 있는 일로 나눠 버튼을 고릅니다(`api/items.ts`의 `analyzeFailKind`).

  | 나눔 | 상태 코드 | 화면 |
  | --- | --- | --- |
  | 다시 시도(`retry`) | 400, 403(토큰을 새로 받아 한 번 더 보낸 뒤에도), 502·503·504, 잘못된 응답 | '다시 시도'. 여러 장이면 '모두 다시 시도' |
  | 연결 안 됨(`offline`) | 0 (서버에 닿지 못함·20초 시간 초과) | 남은 사진도 보내지 않고 멈춤. '모두 다시 시도' |
  | 다른 사진 필요(`replace`) | 413, 415, 422 | 같은 사진으로는 다시 보내도 안 되므로 '다시 찍기'·'목록에서 빼기' |
  | 로그인 필요(`login`) | 401 | 남은 사진도 보내지 않고 멈춤. '로그인하기' |
- **분석은 한 번에 응답합니다.** BE는 ML 응답을 최대 10초 기다리고, 넘으면 `504`를 줍니다(`GarmentAnalysisClient`). 그래서 프론트의 분석 요청 시간 제한은 이보다 길게 두고, 그동안 "분석 중" 상태를 보여 줍니다.
- **카메라 촬영은 환경마다 다릅니다.** 웹은 브라우저 카메라(https 필요)이고, Capacitor 앱은 `@capacitor/camera` 같은 플러그인이 필요합니다. 설치하게 되면 `LIBRARIES.md`도 함께 고칩니다. 권한 안내 창은 지금처럼 `ui.tsx`의 `askPermission`을 씁니다.
- **취소했을 때 남는 데이터가 있습니다.** 분석만 하고 확정하지 않으면 DB의 DRAFT 행과 Blob의 크롭 사진이 남습니다. 정리는 BE가 맡는 것으로 제안하고 BE 확인 필요 표(22번)에 넣었습니다.
- 가짜 데이터 상태(`VITE_MOCK_CLOSET=true`)에서는 `analyzeItemPhoto`가 `items.ts` 안의 가짜 분석 결과(보통·색 못 고름·다시 찍기가 차례로 나옴)를 `mock()`으로 돌려주어 서버 없이도 같은 흐름을 볼 수 있습니다. 실패 화면은 가짜 데이터를 끄고 서버를 끈 채 올려 보면 볼 수 있습니다.

## 6. 가짜 데이터에서 실제 API로 넘어가기

원칙: **화면 코드는 바꾸지 않고 데이터가 오는 곳만 바꿉니다.** `data/types.ts`의 모양은 유지합니다. 상태를 어디에 둘지(서버 데이터·화면 상태)와 그 단계는 [`STATE_MANAGEMENT.md`](STATE_MANAGEMENT.md)를 따릅니다.

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
| 1 | `.env.example`(`MOCK=true`), `src/vite-env.d.ts`, `src/api/client.ts`, `error.ts`를 추가한다. 이때 화면은 그대로 가짜 데이터를 쓴다 | `src/api/` 신규 |
| 2 | **연결 확인**: 서비스가 켜져 있으면 `GET /test`(일반 텍스트)로 주소와 CORS가 맞는지 확인한다. JSON이 아니므로 `request()`가 아니라 `fetch(...).then((r) => r.text())`로 한 번만 시험하고, 확인 코드는 남기지 않는다 | 로컬 확인만 |
| 3 | 데이터 종류 하나(예: `Item`)의 요청 함수를 만들어 가짜 데이터와 실제 호출을 함께 넣는다. 서버 모양이 `types.ts`와 다르면 이 안에서 변환한다 | `src/api/items.ts` |
| 4 | `store.ts`의 `S.items = seedItems()`를 "처음 불러오기" 함수(`getItems()` 호출)로 바꾼다. 화면은 계속 `useApp()`으로 읽는다. 아직은 `MOCK=true`라서 화면이 달라지지 않는다 | `store.ts` (**상태 구조가 바뀌면 먼저 팀에 확인**) |
| 5 | 상태를 바꾸는 `store.ts`의 함수(`deleteItem`, `wearToday`, `saveLook`, `deleteSaved`, `toggleLike` 등. 화면은 이미 이 함수로만 `S`를 바꿈)에서 먼저 서버에 요청하고, 성공하면 지금처럼 `S`를 고치고 `emit()` | `store.ts`의 해당 함수 |
| 6 | 서버 API가 열리면 `.env.local`에서 `VITE_MOCK_CLOSET=false`로 바꿔 시험하고, 문제가 없으면 팀 설정을 바꾼다 | 환경 변수 |
| 7 | 서비스 전체가 연결되면 이 문서 0장의 표를 고친다. `seed.ts`의 가짜 데이터 함수는 개발용으로 남기고, `COLORS`, `CATS`, `SUBS`, `STYLES` 같은 목록 상수는 서버가 주지 않는 한 그대로 둔다 | 문서 |

넘기는 순서는 이렇게 하는 것을 제안합니다: 옷(`items`, closet-service) → 추천 코디(`outfits`, recommendation-service) → 나머지(입은 기록, 커뮤니티는 담당 서비스가 정해진 뒤). 로그인은 `closet-service`에 이미 구현되어 있어 [4장](#4-로그인과-인증-세션-쿠키)의 흐름으로 먼저 연결할 수 있습니다. 추천은 옷 id에 기대고 있기 때문입니다.

### 넘길 때 미리 알아 둘 것

- **추천은 지금 프론트에서 계산합니다.** `store.ts`의 `fit`, `ranked`, `pool`, `current`는 화면에서 고른 옷을 맞추는 규칙(겹쳐 입기)이라 서버로 넘어가도 남습니다. 서버가 주는 것은 `Outfit`(`Look` + `reason`) 목록이고, 이를 `S.outfits`에 넣은 뒤 `applyOutfit`이 지금처럼 동작해야 합니다. 추천에 필요한 "내 옷" 정보를 누가 `recommendation-service`에 넘기는지(프론트가 id를 보내는지, 서비스끼리 조회하는지)는 BE도 미확정입니다.
- **처음 홈 선택이 예시 옷 id에 기대고 있습니다.** 시작할 때의 홈 선택(`S.pick`)과 `appliedKey`가 예시 옷 id(1·10·6)로 정해져 있습니다. 옷을 서버에서 불러오면 불러온 뒤 `applyOutfit(firstFresh(0))`으로 정해야 합니다.
- **날짜 형식이 섞여 있습니다.** `Item.lastWorn`, `Hist.date`, `Plan.date`는 `YYYY-MM-DD` 문자열(`data/dates.ts`)이고, `Saved.at`(예: '11월 26일')과 `Post.ago`·`Comment.ago`(예: '2시간 전')는 아직 화면 문구입니다. 서버가 ISO 8601 날짜를 주면 `src/api/` 안에서 `YYYY-MM-DD`로 바꿔 넣고, 화면 문구는 그릴 때 만듭니다.
- **`Plan.date`는 `'2026-11-24'` 형식 문자열**(`dkey`)입니다. 서버가 같은 형식을 주는지 확인합니다.
- **`Item.id`, `Post.id`는 숫자인데, `closet-service`는 옷 id를 문자열(bigint)로 줍니다.** `types.ts`를 바꿀지(팀 확인 필요), `src/api/` 안에서 숫자로 바꿀지 먼저 정합니다. 또한 `S.uid`, `S.sid`, `S.pid`는 새 id를 만들려고 임시로 쓰는 번호라서 서버가 id를 정해 주면 쓰지 않게 됩니다.
- **옷 상세·목록·삭제 API가 아직 없습니다.** 그래서 4단계(`S.items`를 서버에서 불러오기)와 옷 삭제 연결은 BE API가 생긴 뒤에 할 수 있습니다. 지금 먼저 연결할 수 있는 것은 등록(분석·확정)과 수정입니다.
- **로딩 상태가 새로 생깁니다.** 지금은 데이터가 처음부터 있어서 로딩 화면이 없습니다. "불러오는 중", "실패", "비어 있음" 세 경우를 화면마다 어떻게 보여 줄지 디자인과 정합니다. 가짜 데이터에도 `mock()`으로 300ms 지연을 주므로 서버 없이도 이 화면을 미리 볼 수 있습니다.
- **새로고침하면 서버에서 다시 불러옵니다.** 지금처럼 처음 상태로 돌아가지 않으므로, 세션 쿠키가 남아 있어야 로그인 상태가 유지됩니다. 앱을 켤 때 `/api/auth/me`로 로그인 상태를 되찾습니다.

## BE 확인 필요

BE에 정해 달라고 할 항목입니다. 정해지면 "정해진 내용" 칸을 채우고, 본문의 `미확정`과 `BE 확인 필요` 표시를 고칩니다. 첫 두 항목은 BE 문서의 `/todo`와 같은 내용이고, 나머지는 프론트엔드 입장에서 추가한 것입니다.

| # | 항목 | 프론트엔드 제안 | 정해진 내용 |
| --- | --- | --- | --- |
| 1 | 분석·확정 저장 API의 요청·응답 계약 (BE `/todo`의 첫 항목) | 사진 분석 → AI가 고른 값(`Item`에 가까운 모양) → 사용자가 한 벌씩 확인·수정한 것으로 확정 저장 | 분석 `POST /api/closet/analyze`(DRAFT 저장 후 AI 값 응답), 확정 `POST /api/closet/items/{id}/confirm`(바꾼 값만, 204), 수정 `PATCH /api/closet/items/{id}`(204). [5장](#5-이미지와-파일), `backend/README.md` |
| 2 | 서비스 간 보유 옷 조회 계약 (BE `/todo`). 추천 요청 때 내 옷 정보를 누가 `recommendation-service`에 넘기는가 | 프론트는 추천만 요청하고, 서비스끼리 조회 | |
| 3 | ML 입출력과 오류 처리 계약 (BE `/todo`). **ML 결과를 BE를 거쳐 받는지, 프론트가 직접 받는지** | BE를 거침 (프론트는 BE 주소만 알도록) | |
| 4 | 프론트가 부를 주소를 하나로 합칠 게이트웨이가 있는지, 서비스별 주소를 따로 쓰는지 | 서비스별 주소 (`VITE_CLOSET_API_URL`, `VITE_RECOMMENDATION_API_URL`) | |
| 5 | 서비스별 API 경로 규칙 (예: `/items`인지 `/api/closet/items`인지)와 API 명세 공유 방식 (OpenAPI 등) | OpenAPI 명세 주소를 받음 | `closet-service`는 `/api/auth/...`, `/api/closet/...`. 명세는 `backend/README.md` (OpenAPI 명세는 없음) |
| 6 | 개발 서버 주소와 https 지원 여부 | https 전체 주소 (`dev:phone` 확인용) | |
| 7 | CORS 허용 출처. 두 서비스 모두 웹 개발·배포 주소와 Capacitor 앱 출처를 허용하는지 | BE가 허용. 앱 출처는 플랫폼·Capacitor 버전에 따라 달라서(`http://localhost`, `capacitor://localhost` 등) 실제 앱에서 확인한 값을 전달 | |
| 8 | 성공 응답 형식 | A: 본문이 곧 데이터 | A와 같음. 본문 없는 성공(로그아웃·확정·수정)은 204 |
| 9 | 에러 응답 형식과 에러 코드 목록 (Spring Boot 기본 오류 응답을 쓰는지, `{ code, message }`를 따로 정하는지) | `{ code, message }`, 한국어 `message` | 본문 없이 상태 코드만. 상태 코드별 뜻은 `backend/README.md` ([3장](#에러-응답)) |
| 10 | 인증 방식, 소셜 로그인 여부, 어느 서비스가 맡는지, 두 서비스가 같은 로그인을 받는지 | (BE 코드로 확인됨) Google 로그인 + 서버 세션 쿠키, `closet-service`가 담당. `recommendation-service`가 같은 로그인을 받는지는 미확인 | Google 로그인과 세션 쿠키 ([4장](#4-로그인과-인증-세션-쿠키)). `recommendation-service` 적용은 BE 확인 필요 |
| 11 | 세션 만료 시 처리, 세션 유지 기간 | 재발급이 없으면 401에서 로그인 화면으로 | 재발급 API는 없음 (BE 코드 기준). 유지 기간은 BE 확인 필요 |
| 12 | 쿠키 방식이 Capacitor 앱에서 동작하는지. 안 되면 웹·앱 공통 인증 방식 | 앱에서 실제로 시험한 뒤 BE와 협의 | |
| 13 | 사용자·의류 테이블의 키 형식과 NULL 허용 정책 (BE `/todo`). 특히 `id`가 숫자인지 문자열인지, `Item`의 `sub`, `hex`, `img` 등이 비어 올 수 있는지 | 숫자 id (`types.ts`와 같음) | `id`는 JSON 문자열(bigint)로 옴(제안과 다름). 분석 응답의 `sub_category`·`color`·`hex`는 `null`, `styles`는 `[]`일 수 있음 |
| 14 | 날짜 형식과 시간대 | ISO 8601 (`2026-11-24T09:00:00+09:00`) | |
| 15 | 이미지 업로드 크기·형식 제한(예: 몇 MB, JPEG·PNG), 서버가 주는 이미지 주소가 전체 주소인지, 공개 주소인지 만료되는 주소인지 (업로드 방식은 **서버를 거치는 `multipart`로 결정**) | 사진은 올리기 전에 줄여서 보냄. 주소는 전체 주소 | multipart `image` 파일 1개, JPEG·PNG·WebP, 최대 10 MiB. 분석 직후 `previewImg`는 5분 유효 SAS 주소, 확정한 옷 사진은 `GET /api/closet/preview?id=`(이미지 자체, 세션 쿠키 필요) |
| 21 | 사진 분석 요청이 한 번에 응답하는지, 접수 후 결과를 따로 조회하는지. 응답 시간이 얼마나 걸리는지 | 한 번에 응답. 오래 걸리면 접수 후 조회 | 한 번에 응답(200). BE는 ML을 최대 10초 기다리고, 넘으면 504 |
| 22 | 분석만 하고 저장하지 않은 사진(취소·실패)을 Blob에서 정리하는 방법 | BE가 일정 시간 뒤 정리 | |
| 23 | Google 로그인 성공 후 돌아올 주소 | 주소를 설정값으로 빼고, 중립 주소(`#/`)로 돌려보냄. 첫 설정 여부는 프론트가 판단 | BE 환경 변수 `FRONTEND_LOGIN_SUCCESS_URL`로 설정. 기본값은 중립 주소 `http://localhost:5173/#`이고 첫 설정 여부는 프론트가 판단 (제안과 같음). 배포에 쓸 값은 미정 |
| 24 | `/api/auth/me` 응답에 첫 설정 완료 여부를 넣을 수 있는지 (지금은 `id`, `userName`, `nickName`, `email`만 있음) | `onboarded` 같은 값을 추가 | |
| 25 | CSRF 정책: 토큰 헤더를 어떻게 읽는지(CORS에서 응답 헤더 노출 필요), 값을 바꾸는 모든 요청에 필요한지 | `/me`가 준 토큰을 모든 POST·PUT·DELETE에 보냄 | `/me` 응답 헤더 `X-CSRF-TOKEN` 값을 같은 이름의 요청 헤더로, 모든 POST·PATCH(로그아웃 포함)에 보냄. 없거나 틀리면 403. 로컬 CORS는 `http://localhost:5173`에 이 헤더를 노출 |
| 26 | 로그인하지 않은 사용자(`로그인 없이 둘러보기`)가 부를 수 있는 API 범위. 지금은 `/test` 외 모두 401 | 게스트는 가짜 데이터로 처리 | |
| 16 | 저장한 코디(`Saved`), 입은 기록(`Hist`), 입을 계획(`Plan`)은 어느 서비스가 맡는지 | `closet-service` | |
| 17 | 커뮤니티(글, 댓글, 좋아요, 팔로우), 유행(`Trend`) 데이터를 맡을 서비스가 있는지, 있다면 언제인지 | 일정이 없으면 계속 가짜 데이터 | |
| 18 | 추천 응답의 모양 (`Outfit`: 옷 id 5칸 + 이유 문구 그대로 줄 수 있는지) | `types.ts`의 `Outfit` | |
| 19 | 목록 쪽 나누기(페이지네이션) 방식과 쪽 크기 | 커뮤니티 피드만 필요. 방식은 BE 의견에 맞춤 | |
| 20 | 요청 제한, 요청 타임아웃, 재시도 정책 | 정해진 값이 없으면 프론트엔드 기본값(10초)으로 시작 | |
