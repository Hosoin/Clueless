# FE API 연동 요약

**Base URL: `https://api-closet-service.p-e.kr`**

- 상태(공유 기준): main API 구현·배포 공유 완료, `/test` 및 Google OAuth 사용자 로그인 성공 확인. 전체 FE 흐름·실제 ML 연동은 미검증.
- **추가 계약(미배포 로컬 변경):** 아래 표준 18색 정규화·목록 GET·`recommend_yn` PATCH 확장과 의류 상세 GET·DELETE는 기존 배포 공유 범위와 별개이며, 로컬 계약이다. 원격 DB 적용·배포는 확인되지 않았다. DB 기본값은 `"Y"`이고 기존 DB에는 마이그레이션 `004_closet_item_recommend_yn.sql`이 필요하다.
- API 목록·스키마 근거: 기존 공유 본문은 `71902ca`의 `backend/README.md`, `closet-service`의 controllers, `SecurityConfig`, `ClosetDraftService`, `GarmentAnalysisClient`, `ClosetItemService` 및 구현체.
- `204 No Content` 응답에는 본문이 없으므로 `response.json()`을 호출하지 않는다.
- 인증: 세션 쿠키 사용 → 로그인 후 `GET /api/auth/me` → 응답 `X-CSRF-TOKEN` 값을 모든 POST/PATCH/DELETE(로그아웃 포함)의 요청 헤더로 전달. 로그인·재로그인 등 세션 변경 후 `/me`를 다시 호출해 토큰을 갱신한다.
- 예시의 `Cookie` 헤더는 HTTP 프로토콜 설명용이다. 브라우저 JS에서 직접 설정하지 않고 쿠키 자동 전송(`credentials: 'include'` 등) 또는 프록시로 동일 세션을 유지한다.
- FE 세션 전달·동일 오리진 프록시 구성은 미확정. 직접 cross-origin 호출이 모두 허용된 것은 아니다(현재 로컬 CORS는 `/me`와 confirm/PATCH 중심).
- 아래 전문은 필수 항목 위주 예시이며 ID·세션·토큰·URL·바이너리는 예시/placeholder다. 실제 쿠키, CSRF 토큰, OAuth code/state, SAS URL, 사진, 서버 비밀키를 로그·메신저·커밋에 공유하지 않는다.

## 1. 기동 확인

### 요청
`GET /test` — 인증 불필요.

### 요청 전문
```http
GET /test HTTP/1.1
Host: api-closet-service.p-e.kr

```

### 응답
`200`, plain text. DB·ML 연결 성공을 의미하지 않는다.

### 응답 전문
```http
HTTP/1.1 200 OK
Content-Type: text/plain;charset=UTF-8

closet-service 테스트 요청
```

## 2. Google 로그인 시작

### 요청
브라우저를 `GET /oauth2/authorization/google`로 이동한다(fetch 로그인 대신 페이지 이동).

### 요청 전문
```http
GET /oauth2/authorization/google HTTP/1.1
Host: api-closet-service.p-e.kr

```

### 응답
`302`, Google 인증 화면으로 이동. 성공 후 설정된 FE 성공 URL로 리디렉션한다.

### 응답 전문
```http
HTTP/1.1 302 Found
Location: <Google 인증 URL>
Set-Cookie: JSESSIONID=<session>; <cookie attributes>

```

> 콜백은 Google → 백엔드 `https://api-closet-service.p-e.kr/login/oauth2/code/google`로 처리된다. FE가 직접 호출하거나 실제 code/state를 복사·공유하지 않는다. 실패 시 `401`; 성공 목적지는 기존 `FRONTEND_LOGIN_SUCCESS_URL`의 fragment만 교체한다. 이번 Google 로그인에서 실제 신규 계정 생성 시 `#/onboard`, 기존 계정은 `#/`이며 온보딩 취소 후 재로그인도 홈으로 복귀한다. 신규 가입 쿼리 추가·FE 쿼리 제거 방식은 폐기했다. DB·새 ENV 추가나 Google 콜백 변경은 없으며, 실제 배포·FE 검증 완료를 뜻하지 않는다. 상세는 [인증 API 명세](AUTH_API.md)를 따른다.

## 3. 내 정보·CSRF 토큰

### 요청
`GET /api/auth/me` — 로그인 세션 쿠키.

### 요청 전문
```http
GET /api/auth/me HTTP/1.1
Host: api-closet-service.p-e.kr
Cookie: JSESSIONID=<session>

```

### 응답
`200`. `id`는 문자열, 나머지 세 필드는 문자열 또는 `null`. 키는 `nickName`이다. 세션/사용자 없음은 `401`.

### 응답 전문
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-CSRF-TOKEN: <csrf-token>

{"id":"5000000000","userName":null,"nickName":null,"email":null}
```

## 4. 로그아웃

### 요청
`POST /api/auth/logout` — 같은 세션의 쿠키·CSRF 토큰. 본문 없음.

### 요청 전문
```http
POST /api/auth/logout HTTP/1.1
Host: api-closet-service.p-e.kr
Cookie: JSESSIONID=<session>
X-CSRF-TOKEN: <csrf-token>

```

### 응답
`204`, **본문 없음**. 클루리스 세션만 폐기하며 Google 세션은 유지. 이후 `/me`는 `401`. CSRF 누락/불일치 시 `403`; GET은 로그아웃하지 않는다.

### 응답 전문
```http
HTTP/1.1 204 No Content

```

## 5. 사진 분석

### 요청
`POST /api/closet/analyze` — multipart `image` 파일 **1개**, JPEG/PNG/WebP, 최대 **10 MiB**. 별칭 `/api/closet/items/analyze`도 동일 처리한다.

### 요청 전문
아래는 raw 구조 예시(줄바꿈 CRLF). 실제 FE에서는 `FormData`를 사용하고 `Content-Type`/boundary를 직접 지정하지 않는다.

```http
POST /api/closet/analyze HTTP/1.1
Host: api-closet-service.p-e.kr
Cookie: JSESSIONID=<session>
X-CSRF-TOKEN: <csrf-token>
Content-Type: multipart/form-data; boundary=FEImageBoundary

--FEImageBoundary
Content-Disposition: form-data; name="image"; filename="garment.jpg"
Content-Type: image/jpeg

<사진 바이너리>
--FEImageBoundary--
```

### 응답
`200`의 두 형태:
- `retake: true`: 재촬영 안내. ID 발급·DB 저장 없음.
- `retake: false`: DRAFT 저장. `id`는 문자열. `previewImg`는 WebP 한 장의 HTTPS SAS URL(5분 유효)이며 영구 주소가 아니다.

실제 검증 규칙: `category`는 **상의 / 덧입기 / 하의 / 아우터 / 원피스** 중 하나. `sub_category`, `color`, `hex`는 `null` 가능, `styles`는 `[]` 가능. 분석 스타일은 미니멀/클래식/스트리트/캐주얼/페미닌/스포티의 중복 없는 배열. `hex`는 선택된 색과 일치하는 RGB가 있을 때 `#RRGGBB`(대문자), 없으면 `null`. `name`은 생성 문자열(최대 50자). ML의 `retake`는 boolean이어야 하며 비재촬영에는 유효 category·crop Blob 키가 필요하다. 잘못된 ML 스키마는 `502`다.

### 응답 전문
재촬영:
```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{"retake":true}
```
비재촬영(예시):
```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{"id":"5000000001","previewImg":"<HTTPS SAS URL: 공유 금지>","category":"상의","sub_category":null,"color":null,"hex":null,"styles":[],"name":"상의","retake":false}
```
색이 예측된 경우 `color: "블랙"`, `hex: "#000000"`처럼 반환할 수 있다. `400` 잘못된 multipart, `413` 크기 초과, `415` 형식 불일치, `422` ML 이미지 판독 불가, `502/503/504` 연동 오류.

**색상 계약(미배포 로컬 변경):** FE의 `COLORS` 18색(화이트·아이보리·베이지·카멜·브라운·블랙·차콜·그레이·네이비·데님·스카이·카키·그린·버건디·레드·핑크·옐로·퍼플)을 표준으로 사용합니다. 분석·confirm·PATCH에서 색상명은 이 표준으로 정규화하며 `검정`은 `블랙`으로 처리합니다. 개별 의류의 HEX는 표준 팔레트 HEX로 덮어쓰지 않고 유지합니다. 알 수 없는 ML 색상은 미선택(`color: null`)으로 처리하고 confirm에서 유효한 색으로 보완해야 합니다. 임의의 사용자 색상은 `400`입니다. FE는 18색 상수로 선택지를 표시하므로 목록 응답에 `color_options`는 없습니다.

## 6. 최종 저장

### 요청
`POST /api/closet/items/{id}/confirm` — 본인의 보이는 DRAFT를 확정. `{}`는 분석값 유지(단, 위처럼 `color: null`이면 `{"color":"블랙"}` 등 유효 색 입력 필요). **허용 필드는 기존과 동일하며 `recommend_yn`은 허용하지 않는다(전송 시 `400`).**

### 요청 전문
```http
POST /api/closet/items/5000000001/confirm HTTP/1.1
Host: api-closet-service.p-e.kr
Cookie: JSESSIONID=<session>
X-CSRF-TOKEN: <csrf-token>
Content-Type: application/json

{"color":"블랙"}
```

### 응답
유효한 색이 있는 DRAFT라면 `204`, **본문 없음**. 재확정은 `404`.

### 응답 전문
```http
HTTP/1.1 204 No Content
Cache-Control: no-store

```

## 7. 부분 편집

### 요청
`PATCH /api/closet/items/{id}` — 본인의 보이는 CONFIRMED 의류. 아래처럼 변경할 필드만 전송하며 생략 필드는 유지한다.

### 요청 전문
```http
PATCH /api/closet/items/5000000001 HTTP/1.1
Host: api-closet-service.p-e.kr
Cookie: JSESSIONID=<session>
X-CSRF-TOKEN: <csrf-token>
Content-Type: application/json

{"name":"블랙 티셔츠","color":"블랙","hex":"#000000","tags":["데일리"],"memo":""}
```

### 응답
`204`, **본문 없음**. confirm/PATCH 공통: JSON 객체 최대 64 KiB. 편집 가능 필드는 `name`(최대 50자), `category`(위 5종), `sub_category`, `color`, `hex`, `styles`, `tags`, `memo`뿐이다. `styles`/`tags`는 문자열 배열로 전달한다. `sub_category`/`hex`는 `null`, 배열은 `[]`, 메모는 `""`로 지운다. `hex`는 `#RRGGBB`(대소문자 허용), 이름·색·배열 원소는 공백뿐인 값 불가. PATCH `{}`는 변경 없이 대상 확인.

**PATCH 전용 추가 필드(미배포 로컬 변경):** `recommend_yn`은 정확한 문자열 `"Y"` 또는 `"N"`만 허용한다. 예: `{"recommend_yn":"N"}`. 생략하면 기존 값을 유지하며, DB 기본값은 `"Y"`다. `null`, 소문자(`"y"`/`"n"`), 공백이 포함된 값(예: `" Y"`, `"N "`)은 `400`이다. 위 공통 필드 목록은 기존 계약이며 이 추가 필드는 PATCH에만 적용한다. confirm에는 전송하지 않는다.

### 응답 전문
```http
HTTP/1.1 204 No Content
Cache-Control: no-store

```

confirm/PATCH 오류: `400` 잘못된 ID/필드/JSON, `413` 본문 초과, `404` 없는 대상·타인 소유·숨김·상태 불일치, `503` DB 오류. 보호 API는 로그인/CSRF 조건도 충족해야 한다.

## 8. 확정 의류 이미지

### 요청
`GET /api/closet/preview?id={id}` — 세션 쿠키 필요, CSRF 불필요. 본인의 보이는 CONFIRMED 대상만 가능(DRAFT는 분석 응답의 임시 `previewImg` 사용).

### 요청 전문
```http
GET /api/closet/preview?id=5000000001 HTTP/1.1
Host: api-closet-service.p-e.kr
Cookie: JSESSIONID=<session>

```

### 응답
`200`, JPEG/PNG/WebP 바이너리. SAS/Blob URL로 리디렉션하지 않는다. 잘못된 ID는 `400`, 대상/이미지 없음은 `404`.

### 응답 전문
```http
HTTP/1.1 200 OK
Content-Type: image/webp
Cache-Control: no-store
X-Content-Type-Options: nosniff

<이미지 바이너리>
```

## 9. 의류 상세 조회 (미배포 로컬 계약)

`GET /api/closet/items/{id}` — 로그인 세션 쿠키 필요, CSRF 불필요. 본인의 `CONFIRMED`, `disp_yn = 'Y'` 의류만 조회한다. 아래 예시는 배포 Base URL에서 사용 가능함을 보장하지 않으며 로컬 서버/동일 오리진 프록시 기준이다.

### 요청 전문
```http
GET /api/closet/items/5000000001 HTTP/1.1
Host: localhost:8081
Cookie: JSESSIONID=<session>

```

### 응답
`200` JSON. 반환 필드는 아래와 같고 `id`는 반드시 문자열이다. 색상 코드 키는 `color_hex`이며 분석 응답·편집 요청의 `hex`와 다르다.

```json
{
  "id": "5000000001",
  "name": "블랙 티셔츠",
  "category": "상의",
  "sub_category": null,
  "color": "블랙",
  "color_hex": "#000000",
  "styles": [],
  "tags": ["데일리"],
  "memo": "",
  "recommend_yn": "Y",
  "preview_url": "/api/closet/preview?id=5000000001"
}
```

`preview_url`은 이미지 참조가 없으면 JSON `null`, 있으면 `/api/closet/preview?id={id}` 형태의 상대 경로다. 직접 SAS URL이 아니다. FE는 같은 세션 쿠키가 전달되는 오리진/프록시에서 `<img src="...">`로 사용한다. 상세 JSON GET은 이미지 바이트를 포함하지 않으며 `img`가 별도의 GET을 발생시킨다. 이미지 참조가 있어도 실제 Blob이 없으면 이미지 GET은 `404`일 수 있다. 직접 cross-origin CORS 허용은 별도 확인 대상이다.

없는 대상·타인 소유·숨김(`disp_yn = 'N'`)·DRAFT 등 상태 불일치는 `404`다.

## 10. 의류 삭제 (미배포 로컬 계약)

`DELETE /api/closet/items/{id}` — 같은 로그인 세션 쿠키와 `/api/auth/me`에서 받은 `X-CSRF-TOKEN`을 전달한다. 본인의 `CONFIRMED`, `disp_yn = 'Y'` 의류만 `disp_yn = 'N'`으로 논리 삭제한다. DB 행이나 이미지의 물리 삭제 계약이 아니다.

### 요청 전문
```http
DELETE /api/closet/items/5000000001 HTTP/1.1
Host: localhost:8081
Cookie: JSESSIONID=<session>
X-CSRF-TOKEN: <csrf-token>

```

### 응답
`204 No Content`, **본문 없음**(`response.json()` 호출 금지). 없는 대상·타인 소유·숨김·DRAFT 등 상태 불일치와 재삭제는 `404`다. CSRF 누락/불일치는 `403`이다. 직접 cross-origin DELETE 허용은 확인되지 않았으므로 동일 오리진/프록시를 사용한다.

## 11. 옷장 목록 조회

**검증 상태:** 로컬 Postman에서 목록 조회 성공. 같은 사용자의 옷 2벌 중 `DRAFT` 1벌이 제외된 것을 확인했다. 개발 서버에는 아직 배포하지 않았다.

### 요청

`GET /api/closet/items` · 본문 없음. 로그인 세션에서 사용자를 식별하므로 `user_id`를 보내지 않는다. GET에는 `X-CSRF-TOKEN`이 필요하지 않다.

| 쿼리 파라미터 | 허용값 | 생략하면 |
|---|---|---|
| `category` | 상의, 덧입기, 하의, 아우터, 원피스 | 모든 카테고리 |
| `color` | FE 18색의 표준 색상명(예: `블랙`). HEX가 아님 | 모든 색 |
| `recommend_yn` | `Y` 추천 포함, `N` 추천 제외 | 둘 다 포함(내 옷 탭) |

필터는 모두 선택 사항이며 함께 보내면 **AND**로 적용한다. 추천 제외 탭은 `?recommend_yn=N`만 추가한다. ‘전체’는 빈 값을 보내는 것이 아니라 키 자체를 생략한다. 한글 값은 URL 인코딩한다. Postman에서는 Params에 입력하면 된다.

### 요청 전문

```http
GET /api/closet/items?recommend_yn=N HTTP/1.1
Host: localhost:8081
Cookie: JSESSIONID=<session>
```

### 응답

본인 옷 중 `status='CONFIRMED'`이고 `disp_yn='Y'`인 항목만 `created_at DESC, id DESC` 순서로 반환한다. `DRAFT`와 논리 삭제된 옷은 제외한다. `total_count`는 필터 적용 후 개수다. 카드에는 이미지와 이름만 표시하며, 문자열 `id`는 상세 화면 진입에 사용한다. `preview_url` 키는 항상 포함되며 값은 이미지 참조가 있으면 상대 경로, 없으면 `null`이다. 색상 버튼은 FE 상수로 표시하므로 `color_options`는 반환하지 않는다.

### 응답 전문

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{"total_count":1,"items":[{"id":"42","name":"블랙 티셔츠","preview_url":"/api/closet/preview?id=42"}]}
```

- 일치하는 옷이 없으면 `200`과 `{"total_count":0,"items":[]}`. 위 응답은 형식 예시다.
- `400`: 빈 값(`?category=`), 허용하지 않는 값 또는 같은 필터를 여러 번 전달한 경우.
- `401`: 유효한 로그인 세션 없음. `GET /api/auth/me`로 세션 상태를 확인한다.
- `503`: DB 조회 또는 트랜잭션 오류. 조회 결과가 비어 있는 `200` 응답과 구분한다.

## 남은 범위

- 목록 GET의 기본 조회와 DRAFT 제외는 사용자가 로컬 Postman에서 확인했다. 이는 배포 FE에서 목록·색상 필터·상세·삭제까지 연결해 검증한 결과는 아니다. 요청·응답 전문은 형식 예시다.
- 실제 ML의 crop Blob 응답 호환과 확정 이미지 보존 정책은 별도 확인 필요. confirm은 DB 상태만 바꾸며 Blob을 이동/복사하지 않는다.
