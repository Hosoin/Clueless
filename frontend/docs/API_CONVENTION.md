# 백엔드 통신 규칙 (초안)

프론트엔드가 백엔드(BE)와 통신할 때 지킬 규칙입니다. **초안입니다.** 아직 BE와 합의하지 않았으므로 코드를 이 문서대로 바꾸기 전에 아래 [BE 확인 필요](#be-확인-필요) 표를 먼저 정리합니다.

- 이 문서의 `제안`은 프론트엔드가 정한 방향이고, `BE 확인 필요`가 붙은 것은 BE와 정해야 하는 것입니다. 확인하지 않은 내용을 정해진 것처럼 쓰지 않습니다.
- 규칙이 확정되면 이 문서의 초안 표시를 지우고, `CLAUDE.md`의 "API 연동 방식은 백엔드 팀과 정하는 중입니다" 문구도 함께 고칩니다.
- 그전에는 `fetch` 코드나 API 주소를 `src/`에 추가하지 않습니다. (`CLAUDE.md`의 "바꾸면 안 되는 것")
- 사용할 라이브러리는 [`LIBRARIES.md`](LIBRARIES.md)의 "도입 예정"을 참고하세요. 이 문서는 별도 라이브러리 없이 `fetch` 래퍼를 쓰는 것을 전제로 합니다.

## 1. API 기본 주소

API 주소는 코드에 직접 적지 않고 Vite 환경 변수로 받습니다.

### 환경 변수 키 (제안)

| 키 | 예시 | 설명 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://dev-api.example.com` | API 기본 주소. 끝에 `/`를 붙이지 않습니다 |
| `VITE_USE_MOCK` | `true` | `true`면 서버 대신 `seed.ts`의 가짜 데이터를 씁니다. [6장](#6-seedts-가짜-데이터에서-실제-api로-넘어가기) 참고 |

### 파일

| 파일 | 커밋 | 용도 |
| --- | --- | --- |
| `frontend/.env.example` | O | 키 이름과 설명만 적은 견본. **실제 값(개발 서버 주소 등)은 BE 확인 후** 채웁니다 |
| `frontend/.env.development` | 팀 합의 후 결정 | `npm run dev`에서 쓰는 값 |
| `frontend/.env.phone` | 팀 합의 후 결정 | `npm run dev:phone`에서 쓰는 값. Vite가 `--mode phone`에 맞춰 읽습니다 |
| `frontend/.env.production` | 팀 합의 후 결정 | `npm run build`에서 쓰는 값 |
| `frontend/.env.local` | X | 개인 설정. 비밀값은 여기에만 둡니다 |

- 루트 `.gitignore`가 `.env`와 `.env.*`를 제외하고 `.env.example`만 허용합니다. `.env.development` 같은 파일을 커밋하려면 `.gitignore`를 고쳐야 하므로, 주소를 공개해도 되는지 확인한 뒤 결정합니다. (저장소가 공개되어 있습니다)
- **`VITE_`로 시작하는 값은 빌드 결과물에 그대로 들어가 누구나 볼 수 있습니다.** 키·비밀번호·토큰을 넣지 않습니다.
- 코드에서는 `import.meta.env.VITE_API_BASE_URL`로 읽고, 읽는 곳은 `src/api/client.ts` 한 곳으로 제한합니다.
- 환경 변수를 추가하면 `.env.example`과 이 표를 같이 고칩니다. 타입은 `src/vite-env.d.ts`에 선언합니다.

### 주의: 주소는 반드시 전체 주소로

- Capacitor 앱은 서버가 아니라 폰 안의 파일에서 열리므로(`base: './'`) `/api/items` 같은 상대 주소는 앱에서 동작하지 않습니다. 항상 `https://...`로 시작하는 전체 주소를 씁니다.
- `npm run dev:phone`은 https로 열립니다. https 화면에서 `http://` API를 부르면 브라우저가 막습니다(혼합 콘텐츠). 개발 서버가 http라면 BE 쪽에서 https를 열어 주거나 터널(예: Cloudflare)을 써야 합니다. `BE 확인 필요`
- 폰에서는 `localhost`가 폰 자신을 가리킵니다. 같은 와이파이의 PC를 쓸 때는 PC의 주소(`192.168.x.x`)를 씁니다.
- 브라우저는 다른 주소로 요청할 때 CORS를 검사합니다. 허용할 출처는 BE가 설정합니다. `BE 확인 필요` ([표](#be-확인-필요) 참고)

## 2. 요청 함수 위치와 이름

### 위치 (제안)

```
src/api/
├─ client.ts     공통 요청 함수 request(): 주소 붙이기, 토큰 헤더, JSON 변환, 에러 통일
├─ error.ts      ApiError 타입 (status, code, message)
├─ token.ts      토큰 읽기·저장·지우기 (웹/앱 차이를 이 파일 안에서만 처리)
├─ items.ts      옷 관련 요청 (getItems, createItem, deleteItem …)
├─ outfits.ts    추천 코디 요청
├─ posts.ts      커뮤니티 글·댓글 요청
├─ history.ts    입은 기록·입을 계획 요청
└─ auth.ts       로그인·내 정보 요청
```

- 파일은 화면이 아니라 **데이터 종류**로 나눕니다. 용어 사전의 `Item`, `Outfit`, `Post`, `Hist`/`Plan`과 맞춥니다.
- 화면(`pages/`)과 컴포넌트에서 `fetch`를 직접 부르지 않습니다. 항상 `src/api/`의 함수를 부릅니다.
- `src/api/`는 `data/types.ts`와 `client.ts`만 불러옵니다. `store.ts`나 화면을 불러오지 않습니다. (의존 방향: `pages` → `store.ts` → `api` → `data`)

### 이름 규칙

| 동작 | 이름 | 예시 |
| --- | --- | --- |
| 목록 | `get` + 복수형 | `getItems()`, `getPosts()` |
| 하나 | `get` + 단수형 | `getItem(id)`, `getPost(id)` |
| 만들기 | `create` + 단수형 | `createItem(input)` |
| 고치기 | `update` + 단수형 | `updateItem(id, input)` |
| 지우기 | `delete` + 단수형 | `deleteItem(id)` — `store.ts`의 `deleteItem`(화면 상태 정리)과 이름이 겹치니 가져올 때 `import * as itemsApi from '../api/items'`로 불러 `itemsApi.deleteItem`처럼 씁니다 |
| 그 밖의 동작 | 동사 + 대상 | `likePost(id)`, `wearItems(ids)` |

- 함수는 `data/types.ts`의 타입을 받고 돌려줍니다: `getItems(): Promise<Item[]>`. 화면은 서버가 어떤 모양으로 주는지 모르게 합니다.
- 서버의 필드 이름이나 날짜 형식이 `types.ts`와 다르면 `src/api/` 안에서 변환하고, `types.ts`는 바꾸지 않습니다. (예: 서버가 `lastWornAt` 날짜를 주면 `lastWorn`(며칠 전)으로 계산해 돌려줌)
- 요청 함수는 성공하면 값을 돌려주고, 실패하면 `ApiError`를 던집니다. 함수 안에서 `toast`를 부르지 않습니다. 에러를 어떻게 보여 줄지는 부르는 쪽이 정합니다.

### 요청 함수 하나 만들기 (예시)

옷 목록을 불러오는 `getItems`를 만드는 순서입니다.

```ts
// src/api/client.ts — 공통 요청 함수 (제안)
import { ApiError } from './error'
import { getToken } from './token'

const BASE_URL = import.meta.env.VITE_API_BASE_URL

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    // 서버에 닿지 못함(인터넷 끊김, CORS 차단 등). 서버가 준 에러가 아니라서 따로 처리
    throw new ApiError(0, 'NETWORK', '인터넷 연결을 확인해 주세요')
  }
  if (!res.ok) { /* 에러 응답 처리: 3장 참고 */ }
  return (await res.json()) as T // 응답 형식은 BE 확인 필요. 성공 응답이 본문만 올 때의 예
}
```

```ts
// src/api/items.ts
import type { Item } from '../data/types'
import { request } from './client'

/** 내 옷장의 옷 전체를 불러온다 */
export const getItems = () => request<Item[]>('/items')
```

```ts
// 화면이나 store.ts에서 쓸 때
try {
  S.items = await getItems()
  emit()
} catch (e) {
  toast(e instanceof ApiError ? e.message : '알 수 없는 오류가 났어요')
}
```

경로(`/items`), 필드 이름, 응답 모양은 예시입니다. 실제 값은 BE 명세를 받은 뒤 정합니다.

## 3. 응답과 에러 처리

### 성공 응답 (BE 확인 필요)

아래 두 가지 중 BE와 하나를 정합니다. 프론트엔드의 의견은 **A**입니다. 요청 함수가 단순해지고 `types.ts`와 바로 맞기 때문입니다.

| 안 | 모양 | 비고 |
| --- | --- | --- |
| A | 본문이 곧 데이터: `[{ "id": 1, ... }]` | 목록의 전체 개수·다음 쪽 정보는 헤더나 별도 필드로 |
| B | 감싸서 줌: `{ "data": [...], "meta": {...} }` | `request()`에서 `data`만 꺼내서 돌려줌 |

### 에러 응답 (BE 확인 필요)

프론트엔드는 아래 모양을 받는다고 가정하고 `ApiError`를 만듭니다. BE와 다르게 정해지면 `request()`의 변환 한 곳만 고칩니다.

```json
{ "code": "ITEM_NOT_FOUND", "message": "옷을 찾을 수 없어요" }
```

| `ApiError` 필드 | 뜻 |
| --- | --- |
| `status` | HTTP 상태 코드. 서버에 닿지 못했으면 `0` |
| `code` | 에러 종류를 구분하는 영문 코드. 화면이 분기할 때 씁니다 |
| `message` | 사용자에게 보여 줄 한국어 문구 |

### 화면에 보여 주기

| 상황 | 처리 |
| --- | --- |
| 일반 요청 실패 | `toast(e.message)` (`src/ui.tsx`). 새 알림 컴포넌트를 만들지 않습니다 |
| 서버에 닿지 못함 (`status` 0) | `request()`가 만든 `'인터넷 연결을 확인해 주세요'` 문구를 `toast`로 |
| 401 (로그인 필요·토큰 만료) | `toLogin(현재 주소)` (`src/nav.ts`). 로그인하면 원래 화면으로 돌아옵니다 |
| 서버 오류 (5xx) | 서버가 준 문구 대신 `'잠시 후 다시 시도해 주세요'`를 보여 줍니다. 서버 내부 메시지를 그대로 노출하지 않습니다 |
| 입력값 오류 (400 등) | `message`를 `toast`로 보여 주거나, 화면에서 입력칸 옆에 보여 줍니다. 필드별 에러 형식은 BE 확인 필요 |
| 목록을 못 불러옴 | 화면은 빈 화면(`empty` 클래스)에 "다시 불러오기" 버튼을 두고, `toast`는 쓰지 않습니다 |

- `toast`는 2.4초 만에 사라지므로 사용자가 꼭 알아야 하고 되돌릴 수 없는 에러는 `openModal`로 띄웁니다.
- 에러 문구는 `CLAUDE.md`의 규칙(조사 `eun`/`iga` 사용, `을(를)` 표기 금지)을 따릅니다.
- 로딩 중에는 버튼을 비활성화해서 같은 요청이 두 번 가지 않게 합니다.

## 4. 인증 토큰

로그인 방식 자체가 정해지지 않았습니다. (지금 `Login.tsx`는 어느 버튼이든 바로 로그인되는 가짜입니다) 아래는 JWT 같은 토큰 방식을 가정한 초안입니다.

### 보내는 방법 (제안, BE 확인 필요)

- `Authorization: Bearer <토큰>` 헤더에 담아 보냅니다. 붙이는 곳은 `src/api/client.ts`의 `request()` 한 곳입니다.
- 토큰을 읽고 쓰는 코드는 `src/api/token.ts`에만 둡니다. 화면과 `store.ts`는 토큰을 직접 만지지 않습니다.
  (`S.loggedIn`은 "토큰이 있는지"를 반영하는 값으로 유지)

### 저장하는 곳

| 환경 | 후보 | 장단점 |
| --- | --- | --- |
| 웹 | `localStorage` | 구현이 쉽지만 XSS 공격으로 토큰이 읽힐 수 있음 |
| 웹 | BE가 내려 주는 `HttpOnly` 쿠키 | 스크립트로 읽을 수 없어 안전. 대신 CORS에서 쿠키 허용 설정이 필요하고 BE가 지원해야 함 |
| Capacitor 앱 | 보안 저장소 플러그인 (iOS Keychain, Android Keystore를 쓰는 것) | 일반 저장소보다 안전. 어떤 플러그인을 쓸지는 인증 방식이 정해진 뒤 고름 |
| Capacitor 앱 | `@capacitor/preferences` | 쉽지만 암호화되지 않아 토큰 저장에는 권장하지 않음 |

- 웹과 앱의 차이는 `token.ts` 안에서만 분기합니다. (`Capacitor.isNativePlatform()`으로 구분: `@capacitor/core`에 이미 있음)
  나머지 코드는 `getToken()`, `setToken()`, `clearToken()`만 부릅니다. 세 함수는 앱의 저장소가 비동기라서 모두 `Promise`를 돌려줍니다.
- 쿠키 방식이면 웹은 `token.ts`에서 저장할 것이 없고 `fetch`에 `credentials: 'include'`만 붙이면 되지만, **Capacitor 앱은 출처가 달라 쿠키가 잘 붙지 않을 수 있습니다.** 그래서 앱까지 한 방식으로 가려면 BE와 먼저 정해야 합니다.
- 로그아웃하면 `clearToken()`을 부르고 `S`의 내 정보도 비웁니다.
- 토큰 만료 시 처리(재발급 토큰을 쓸지, 바로 로그인 화면으로 보낼지)는 BE 확인 필요입니다.
- 토큰을 `console.log`로 찍거나 커밋하지 않습니다.

## 5. 이미지와 파일

- 옷 사진 올리기(`Upload.tsx`)는 JSON이 아니라 파일 업로드입니다. 보내는 방식(`multipart/form-data` 또는 미리 서명한 주소로 직접 올리기)은 BE 확인 필요입니다. 업로드는 `Content-Type`을 직접 적지 않고 브라우저가 정하게 둡니다. (`request()`의 `'Content-Type': 'application/json'`을 이 경우에만 빼야 함)
- 서버가 돌려주는 사진 주소는 `Item.img`, `Post.img`에 그대로 들어갑니다. 이 주소는 `https://...` 전체 주소여야 합니다.
- `CLAUDE.md`는 "이미지는 `import` 또는 `seed.ts`의 `photo`, `cpic`로 불러온다"고 하는데, 서버 이미지는 이 규칙의 예외가 됩니다. 규칙 문구를 고치자는 제안은 작업 보고에 있습니다.

## 6. `seed.ts` 가짜 데이터에서 실제 API로 넘어가기

원칙: **화면 코드는 바꾸지 않고 데이터가 오는 곳만 바꿉니다.** `data/types.ts`의 모양은 유지합니다.

지금은 `store.ts`가 시작할 때 `seedItems()` 등으로 `S`를 채웁니다. 한 번에 모든 것을 바꾸지 않고 데이터 종류별로 하나씩 넘깁니다.

| 단계 | 할 일 | 바뀌는 곳 |
| --- | --- | --- |
| 0 | BE와 [확인 표](#be-확인-필요)의 항목을 정하고, API 명세를 받는다 | 문서만 |
| 1 | `.env.example`, `src/vite-env.d.ts`를 만들고 `src/api/client.ts`, `error.ts`, `token.ts`를 추가한다 | `src/api/` 신규 |
| 2 | 데이터 종류 하나(예: `Item`)의 요청 함수를 `src/api/items.ts`에 만든다. 서버 모양이 `types.ts`와 다르면 이 안에서 변환한다 | `src/api/` |
| 3 | `VITE_USE_MOCK=true`일 때는 같은 함수가 `seedItems()`를 돌려주게 한다. 서버가 없어도, 서버가 늦어도 화면 개발이 막히지 않는다 | `src/api/` |
| 4 | `store.ts`에 "처음 불러오기" 함수를 만들어 `S.items = await getItems(); emit()`로 채운다. 화면은 계속 `useApp()`으로 읽는다 | `store.ts` (**상태 구조가 바뀌면 먼저 팀에 확인**) |
| 5 | 값을 바꾸는 코드(`deleteItem`, `wearToday`, `saveLook` 등)에서 먼저 서버에 요청하고, 성공하면 지금처럼 `S`를 고치고 `emit()` | `store.ts`의 해당 함수 |
| 6 | 한 종류가 끝나면 `seed.ts`에서 그 종류의 함수를 지우지 않고 mock용으로 남긴다. 목록 상수(`COLORS`, `CATS`, `SUBS`, `STYLES`)는 서버가 주지 않는 한 `seed.ts`에 그대로 둔다 | |

넘기는 순서는 이렇게 하는 것을 제안합니다: 로그인(`auth`) → 옷(`items`) → 입은 기록·계획(`history`) → 추천 코디(`outfits`) → 커뮤니티(`posts`). 뒤로 갈수록 앞의 데이터(옷 id)에 기대고 있기 때문입니다.

### 넘길 때 미리 알아 둘 것

- **날짜가 "며칠 전"으로 되어 있습니다.** `Item.lastWorn`, `Hist.ago`는 오늘을 기준으로 한 일수이고 `Post.ago`는 `'2시간 전'` 같은 문구입니다. 서버는 보통 날짜(ISO 8601)를 주므로 `src/api/` 안에서 변환해야 합니다. 날짜를 받으면 `store.ts`의 `wornDate`·`dayLabel`에 쓸 일수를 어떻게 계산할지 정합니다.
- **`Plan.date`는 `'2026-11-24'` 형식 문자열**(`dkey`)입니다. 서버가 같은 형식을 주는지 확인합니다.
- **`store.ts`의 추천 규칙(`fit`, `ranked`, `pool`)은 지금 프론트엔드에서 계산합니다.** 서버나 ML이 추천을 대신하면 `Outfit`(`Look` + `reason`)을 받아 `S.outfits`에 넣는 방식으로 연결하되, 홈의 겹쳐 입기 계산(`current`, `applyOutfit`)이 그대로 동작하는지 확인합니다.
- **`Item.id`와 `Post.id`는 숫자입니다.** 서버가 다른 형식(문자열, UUID)을 주면 `types.ts` 변경이 되므로 먼저 확인합니다.
- **`S.uid`, `S.sid`, `S.pid`는 새 id를 만들기 위한 임시 번호입니다.** 서버가 id를 정해 주면 쓰지 않게 됩니다.
- **로딩 상태가 새로 생깁니다.** 지금은 데이터가 처음부터 있어서 로딩 화면이 없습니다. 불러오는 중, 실패, 빈 목록 세 경우를 화면마다 어떻게 보여 줄지 디자인과 정합니다.

## BE 확인 필요

BE와 정해야 하는 항목입니다. 정해지면 "정해진 내용" 칸을 채우고, 위 본문의 `제안`과 `BE 확인 필요` 표시를 고칩니다.

| # | 항목 | 프론트엔드 제안 | 정해진 내용 |
| --- | --- | --- | --- |
| 1 | API 명세 공유 방식 (OpenAPI/Swagger 문서 주소, 노션 등) | OpenAPI 명세 주소를 받아 타입을 맞춰 봄 | |
| 2 | 개발 서버 API 주소와 https 지원 여부 | https 전체 주소 (폰에서 `dev:phone`으로 확인하려면 필요) | |
| 3 | CORS 허용 출처 (웹 개발·배포 주소, Capacitor 앱의 출처) | 웹 주소와 앱 출처를 BE가 허용. 앱 출처는 플랫폼·Capacitor 버전에 따라 달라서(`http://localhost`, `capacitor://localhost` 등) 실제 앱에서 확인한 값을 전달 | |
| 4 | 성공 응답 형식 | A: 본문이 곧 데이터 | |
| 5 | 에러 응답 형식과 에러 코드 목록 | `{ code, message }`, 한국어 `message` | |
| 6 | 인증 방식 (JWT 토큰, 세션 쿠키 등)과 소셜 로그인 여부 | `Authorization: Bearer` 헤더 | |
| 7 | 토큰 만료 시 처리 (재발급 토큰 유무) | 재발급이 없으면 401에서 로그인 화면으로 | |
| 8 | 웹과 앱의 토큰 저장 방식 (쿠키가 앱에서 동작하는지 포함) | 웹·앱 모두 헤더 방식 | |
| 9 | 날짜 형식과 시간대 | ISO 8601 (`2026-11-24T09:00:00+09:00`) | |
| 10 | id 형식 (숫자/문자열) | 숫자 (`types.ts`와 같음) | |
| 11 | 목록 쪽 나누기(페이지네이션) 방식과 쪽 크기 | 커뮤니티 피드만 필요. 방식은 BE 의견에 맞춤 | |
| 12 | 이미지 업로드 방식 (`multipart` / 미리 서명한 주소)과 크기·형식 제한 | 방식은 BE 의견에 맞춤 | |
| 13 | 서버가 주는 이미지 주소 형식 (전체 https 주소 여부) | 전체 https 주소 | |
| 14 | 옷 사진 분석(옷 후보 3개와 확률)을 누가 하는가: 프론트엔드가 ML을 직접 부르는지, BE를 거치는지 | BE를 거침. 프론트엔드는 BE 한 곳만 알도록 | |
| 15 | **ML의 코디 추천 결과를 BE를 거쳐 받을지, 프론트엔드가 ML에서 직접 받을지** | BE를 거침 (인증·주소를 한 곳으로 모으기 위해). 지금 `store.ts`의 추천 규칙은 서버 응답이 오기 전의 임시 규칙으로 둠 | |
| 16 | 추천 응답의 모양 (`Outfit`: 옷 id 5칸 + 이유 문구 형태 그대로 줄 수 있는지) | `types.ts`의 `Outfit` | |
| 17 | 트렌드(`Trend`) 데이터는 서버가 주는지, 프론트 상수로 둘지 | 서버 | |
| 18 | 요청 제한, 요청 타임아웃, 재시도 정책 | 정해진 값이 없으면 프론트엔드 기본값(10초)으로 시작 | |
| 19 | 사용자가 올린 글과 사진의 공개 범위·삭제 정책 (`Post.scope`) | `types.ts`의 `scope` 문구 그대로 주고받기 | |
