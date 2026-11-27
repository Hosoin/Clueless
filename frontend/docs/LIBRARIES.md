# 사용 라이브러리

프런트엔드에서 사용하는 라이브러리 목록입니다. 의존성을 추가하거나 제거하면 이 문서도 함께 수정합니다.

- 기준: `package.json`(지정 범위), `package-lock.json`(설치 버전)
- 최종 수정: 2026-11-23

## 런타임 의존성 (`dependencies`)

앱과 함께 배포됩니다.

| 라이브러리 | 지정 범위 | 설치 버전 | 용도 | 사용처 |
| --- | --- | --- | --- | --- |
| [react](https://react.dev) | `^19.3.1` | 19.3.1 | UI 컴포넌트 라이브러리 | `src/` 전체 |
| [react-dom](https://react.dev/reference/react-dom) | `^19.3.1` | 19.3.1 | React 컴포넌트를 브라우저 DOM에 렌더링 | `src/main.tsx` |
| [react-router](https://reactrouter.com) | `^8.5.2` | 8.5.2 | 화면 이동(라우팅). `HashRouter`를 사용 | `src/main.tsx`, `src/App.tsx`, `src/nav.ts`, `src/components/Layout.tsx`, `src/pages/*` |
| [@capacitor/core](https://capacitorjs.com) | `^8.6.2` | 8.6.2 | 웹 앱을 iOS·Android 네이티브 앱으로 감싸는 런타임 | 아직 `src/`에서 직접 import하지 않음 |
| [@fontsource/noto-sans-kr](https://fontsource.org/fonts/noto-sans-kr) | `^5.3.1` | 5.3.1 | 본문용 한글 웹폰트 (300, 400, 500, 700). `--sans` 변수 | `src/main.tsx`, `src/styles/proto.css` |
| [@fontsource/dm-serif-display](https://fontsource.org/fonts/dm-serif-display) | `^5.3.0` | 5.3.0 | 로고·제목·숫자용 세리프 웹폰트 (400, 400 italic). `proto.css`의 `--serif` 변수 | `src/main.tsx`, `src/styles/proto.css` |
| [@fontsource/bodoni-moda](https://fontsource.org/fonts/bodoni-moda) | `^5.3.0` | 5.3.0 | 로고·제목용 세리프 웹폰트 (400, 500, 400 italic). `luxe.css`의 `--serif` 변수 | `src/main.tsx`, `src/styles/luxe.css` |

폰트는 CDN이 아니라 패키지로 설치해 빌드 결과물에 포함합니다. 오프라인이나 네이티브 앱 안에서도 폰트가 그대로 보입니다.

## 개발 의존성 (`devDependencies`)

개발·빌드 과정에서만 쓰이며 앱 번들에는 포함되지 않습니다.

| 라이브러리 | 지정 범위 | 설치 버전 | 용도 | 사용처 |
| --- | --- | --- | --- | --- |
| [vite](https://vite.dev) | `^8.3.6` | 8.3.8 | 개발 서버, 프로덕션 빌드 | `vite.config.ts` |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | `^6.1.2` | 6.3.0 | Vite에서 React(JSX, Fast Refresh) 지원 | `vite.config.ts` |
| [@vitejs/plugin-basic-ssl](https://github.com/vitejs/vite-plugin-basic-ssl) | `^2.3.0` | 2.3.0 | 개발용 임시 인증서로 개발 서버를 https로 켬. 폰 브라우저는 https에서만 카메라 권한을 물어서 `npm run dev:phone`에서만 사용 | `vite.config.ts` |
| [typescript](https://www.typescriptlang.org) | `~7.0.2` | 7.0.2 | 정적 타입 검사 (`npm run build`에서 `tsc -b` 실행) | `tsconfig*.json` |
| [oxlint](https://oxc.rs/docs/guide/usage/linter) | `^1.90.0` | 1.94.0 | 코드 린트 (`npm run lint`) | `.oxlintrc.json` |
| [@capacitor/cli](https://capacitorjs.com/docs/cli) | `^8.6.2` | 8.6.2 | Capacitor 명령어(`npx cap ...`)와 설정 타입 | `capacitor.config.ts` |
| [@types/react](https://www.npmjs.com/package/@types/react) | `^19.3.0` | 19.3.0 | React 타입 정의 | — |
| [@types/react-dom](https://www.npmjs.com/package/@types/react-dom) | `^19.3.0` | 19.3.0 | React DOM 타입 정의 | — |
| [@types/node](https://www.npmjs.com/package/@types/node) | `^24.19.2` | 24.19.2 | Node.js 타입 정의 | `tsconfig.node.json` (설정 파일용) |

## 버전 범위 표기

- `^`: 메이저 버전이 같은 범위에서 업데이트를 허용합니다. (예: `^19.3.1` → 19.x.x)
- `~`: 마이너 버전까지 같은 범위에서 패치 업데이트만 허용합니다. (예: `~7.0.2` → 7.0.x)

팀원끼리 같은 버전을 쓰려면 `package-lock.json`을 커밋하고, 설치할 때는 `npm ci`를 사용합니다.

## 도입 예정

백엔드(Spring Boot)와 통신하기 위해 도입을 검토하는 라이브러리입니다. **아직 설치하지 않았고 `package.json`에도 없습니다.**
실제로 설치할 때 위의 표로 옮기고, 이 절에서는 지웁니다.

- 비교 기준: 번들 크기, Capacitor(웹 + 폰 앱) 호환, 지금 `store.ts` 구조와 맞는지, 팀원이 배우기 쉬운지
- 번들 크기는 gzip 기준의 **대략적인 값**이며 이 문서를 쓰면서 직접 측정하지 않았습니다. 설치 전에 [bundlephobia](https://bundlephobia.com)나 `npm run build` 결과로 확인합니다.
- 지금 `store.ts`는 `S`를 직접 고치고 `emit()`으로 다시 그리는 구조입니다. 서버 데이터를 다루는 라이브러리는 이 구조와 어떻게 만나는지가 핵심입니다.

### 1. HTTP 클라이언트

| 후보 | 번들 크기 | Capacitor 호환 | 현재 구조와의 궁합 | 배우기 |
| --- | --- | --- | --- | --- |
| **fetch 래퍼 직접 작성 (추천)** | 0 (브라우저 내장, 래퍼 코드 50줄 안팎) | 웹뷰에서 그대로 동작 | `src/api/client.ts` 한 파일에 주소·세션 쿠키·CSRF·에러 처리를 모으면 됨 | 쉬움. 표준 API |
| ky | 약 4KB | fetch 기반이라 동작 | 래퍼를 대신 만들어 주지만 의존성이 하나 늘어남 | 쉬움 |
| axios | 약 13KB | XHR 기반이라 동작 | 기능은 많으나 이 앱에는 과함 | 쉬움 (자료가 가장 많음) |

**추천: fetch 래퍼.** 이 앱에 필요한 기능은 기본 주소 붙이기, 세션 쿠키 보내기와 CSRF 헤더 붙이기, JSON 변환, 에러 통일 정도입니다. 이것은 직접 써도 50줄 안팎이라 의존성을 늘릴 이유가 약합니다.
요청 취소·타임아웃은 `AbortController`로 됩니다. 재시도나 요청 가로채기가 많이 필요해지면 ky 도입을 다시 검토합니다.

### 2. 서버 상태 관리

| 후보 | 번들 크기 | Capacitor 호환 | 현재 구조와의 궁합 | 배우기 |
| --- | --- | --- | --- | --- |
| **직접 구현 (추천)** | 0 | 해당 없음 | `S` + `emit()` 구조를 그대로 두고, 불러온 결과를 `S`에 넣은 뒤 `emit()` | 쉬움. 이미 쓰는 방식 |
| TanStack Query | 약 13KB | 동작 | 캐시를 하나 더 갖게 되어 `S`와 이중으로 관리됨. `S`를 직접 고치는 지금 코드와 부딪힘 | 보통. 쿼리 키·무효화 개념을 배워야 함 |
| SWR | 약 4KB | 동작 | TanStack Query와 같은 문제. 기능은 더 적음 | 쉬움 |

**추천: 직접 구현.** 지금 화면들이 `S`의 객체를 직접 고치는 구조라서, 서버 상태 라이브러리를 넣으면 "진짜 값"이 라이브러리 캐시와 `S` 두 곳에 생깁니다.
먼저 `src/api/*.ts`가 `types.ts` 모양의 데이터를 돌려주게 하고, 불러오는 곳에서 `S.items = await getItems(); emit()`처럼 넣습니다. 로딩·에러 표시도 작은 상태로 직접 관리합니다.
다음 중 하나가 생기면 TanStack Query 도입을 다시 검토합니다: 같은 데이터를 여러 화면에서 따로 불러와 중복 요청이 눈에 띌 때, 자동 재요청(포커스·재접속)이 필요할 때, `store.ts`의 상태 구조를 바꾸기로 결정했을 때.
(`store.ts` 상태 구조 변경은 팀 승인이 필요합니다. `CLAUDE.md` 참고)

### 3. 응답 타입 검증

| 후보 | 번들 크기 | Capacitor 호환 | 현재 구조와의 궁합 | 배우기 |
| --- | --- | --- | --- | --- |
| **검증 안 함 (추천, 지금은)** | 0 | 해당 없음 | `data/types.ts`의 타입을 그대로 쓰고, 응답은 `as`가 아니라 api 함수의 반환 타입으로 선언 | 쉬움 |
| zod | 약 13KB (v4는 더 작음) | 동작 | 스키마에서 타입을 만들 수 있지만 `types.ts`와 같은 모양을 두 번 적게 됨 | 보통. 팀원이 가장 많이 아는 편 |
| valibot | 쓴 만큼만 약 1KB부터 | 동작 | zod와 같은 문제. 더 가볍지만 자료가 적음 | 보통 |

**추천: 지금은 검증하지 않음.** 타입 검사는 컴파일할 때만 되고 서버가 주는 실제 값은 확인하지 않으므로, BE 응답이 약속과 다르면 화면에서 터집니다. 그래도 지금은 다음 이유로 보류합니다.
- 응답 형식과 명세 공유 방식이 아직 정해지지 않았고, 정해지기 전에 스키마를 쓰면 `types.ts`와 이중으로 고쳐야 합니다.
- BE가 OpenAPI 명세를 주면 스키마를 손으로 쓰는 대신 명세에서 타입을 생성하는 방법이 더 나을 수 있습니다.

대신 `api/client.ts`에서 "JSON이 아니거나 비어 있으면 에러"까지만 확인합니다. BE 응답이 자주 어긋나거나 외부(ML) 응답을 직접 받게 되면 zod를 도입합니다. 이 경우 `types.ts`를 스키마에서 만들지 말고, 스키마 쪽이 `types.ts`의 타입을 따르게 씁니다. (`const schema: z.ZodType<Item> = ...`)

### 도입 후 반영할 것

- 설치하면 위 `런타임 의존성` 표에 행을 추가하고 `최종 수정` 날짜를 고칩니다.
- 로그인은 서버 세션 쿠키 방식이라 지금은 토큰을 저장하지 않습니다. Capacitor 네이티브 앱에서 쿠키 방식이 동작하지 않아 인증 방식을 바꾸게 되면 그때 저장용 플러그인을 고릅니다. 자세한 내용은 [`API_CONVENTION.md`](API_CONVENTION.md)의 4장(로그인과 인증)과 "BE 확인 필요" 12번을 참고하세요.
