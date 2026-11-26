# Frontend 개발 지침

`frontend/` 작업에만 적용되는 지침입니다. 규칙을 바꿀 때는 PR로 수정합니다.

- 앱: Clueless. 내 옷장의 옷으로 오늘의 코디를 추천하고, 입은 기록을 남기고, 커뮤니티에서 코디를 공유하는 모바일 앱입니다.
- 스택: Vite + React + TypeScript, Capacitor (웹과 폰 앱을 같은 코드로 만듭니다)
- 단계: 프로토타입. 백엔드 없이 `src/data/seed.ts`의 가짜 데이터로 동작합니다.
- 폴더 구조와 실행 명령어는 @README.md 를, 저장소 전체 구조는 루트 `README.md`를 참고합니다.

## 브랜치와 작업 흐름

| 브랜치 | 역할 |
| --- | --- |
| `FE/feat/*`, `FE/fix/*` 등 | 작업 브랜치. 이름 앞에 `FE/`를 붙입니다. `frontend-dev`에서 따서 작업하고 `frontend-dev`로 PR을 올립니다 |
| `frontend-dev` | 개발 통합 브랜치. 작업 브랜치 PR을 팀장이 승인해 머지합니다 |
| `frontend` | 스테이징 브랜치. 개발 서버에 배포되며 여기서 테스트합니다 |
| `main` | 스테이징에서 테스트가 통과한 변경만 PR로 반영합니다 |

흐름: `frontend-dev`에서 작업 브랜치 생성 → 작업 → `frontend-dev`로 PR(팀장 승인) → PR이 쌓이면 `frontend`로 PR → 개발 서버에서 테스트 → `main`으로 PR

- `frontend-dev`, `frontend`, `main`에는 직접 커밋하지 않고 항상 PR로 반영합니다.
- 브랜치 이름, 커밋, PR, 머지 방식은 @GIT_CONVENTION.md 를 따릅니다.
- 푸시, PR 생성, 머지는 사용자가 요청했을 때만 합니다.

## 작업 원칙

- 요청받은 범위만 수정합니다. 관련 없는 파일을 정리하거나 포맷만 바꾸지 않습니다.
- 비밀값(`.env`, 키, 토큰)과 개인정보는 커밋하지 않습니다. 저장소가 공개되어 있습니다.
- 의존성을 추가하거나 제거하면 `docs/LIBRARIES.md`도 함께 수정합니다.
- 코드 주석과 문서는 한국어로 작성합니다. 주석은 "무엇"보다 "왜"를 적습니다.
- 바이브 코딩(AI가 작성한 코드를 팀원이 이어서 읽고 고치는 상황)을 전제로, 기능 설명 주석을 최대한 자세히 답니다.
  - 파일 맨 위에 이 파일의 역할과 주요 동작을 적습니다.
  - 컴포넌트, 함수, 상태, 타입마다 어떤 기능인지, 입력과 결과가 무엇인지 적습니다.
  - 조건 분기, 예외 처리, 특이한 계산에는 그렇게 한 이유를 적습니다.
  - 코드를 수정할 때는 바뀐 동작에 맞게 기존 주석도 함께 고칩니다.
- 커밋 전에 `npm run lint`와 `npm run build`가 통과해야 합니다.

### AI 작업 방식

- 새로 만들기 전에 아래 [재사용할 것](#재사용할-것)과 기존 화면에서 같은 기능이 있는지 먼저 찾습니다.
- 파일 3개 이상을 고치거나 화면 구조를 바꾸는 작업은 수정 계획을 먼저 보여 주고 확인받은 뒤 진행합니다.
- 다음은 먼저 묻고 진행합니다: 의존성 추가·제거, 파일 삭제, `src/data/types.ts`의 타입 변경, `store.ts`의 상태 구조 변경, 가짜 데이터(`seed.ts`) 수정.
- 작업이 끝나면 `npm run lint`와 `npm run build`를 실행하고, 사람이 화면에서 무엇을 확인하면 되는지 알려 줍니다.

## 용어 사전

화면 문구와 코드 이름의 대응입니다. 새 코드도 같은 이름을 씁니다.

| 화면 문구 | 코드 | 설명 |
| --- | --- | --- |
| 옷 | `Item` | 옷 한 벌. `cat`(종류), `sub`(세부 종류), `color`, `pattern`을 가짐 |
| 종류 | `Category`, `CATS` | 상의·덧입기·하의·아우터·원피스 |
| 세부 종류 | `Item.sub`, `SUBS` | 티셔츠·셔츠·니트·코트 등 |
| 덧입기 | `cat: '덧입기'`, 줄 키 `m` | 상의 위에 겹쳐 입는 옷 |
| 아우터 | 줄 키 `j`(재킷), `o`(코트·패딩) | 화면에서는 둘 다 '아우터'로 보임 |
| 코디 | `Look` | 상의·덧입기·재킷·코트·하의 칸에 옷 id를 넣은 조합 |
| 추천 코디 | `Outfit` | `Look` + 추천 이유 |
| 저장한 코디 | `Saved` | `Look` + 저장한 날 |
| 입은 기록 | `Hist` | 며칠 전(`ago`)에 입은 옷 id 목록 |
| 입을 계획 | `Plan` | 날짜(`date`)에 입을 옷 id 목록 |
| 최근 입은 옷 | `isPast`, `S.RECENT` | 어제부터 3일 안에 입은 옷. 추천에서 뺌 |
| 오래 안 입은 옷 | `forgotten` | 90일 넘게 안 입었거나 한 번도 안 입은 옷 |
| 추천에서 뺀 옷 | `Item.ex` | 사용자가 추천 제외를 켠 옷 |
| 유행 | `Trend`, `TRENDS`, `trendOf` | 트렌드 키워드와 옷의 `tags`를 비교 |
| 글 | `Post` | 커뮤니티에 올린 코디 글 |
| 따라 입기 | `setCombo` | 커뮤니티 글의 옷 조합을 홈 화면 줄에 맞춤 |
| 첫 설정 | `Onboard`, `S.ob` | 추천 방식(유행·취향), 스타일, 닉네임 고르기 |

## 재사용할 것

같은 일을 하는 코드를 새로 만들지 말고 아래를 씁니다.

| 위치 | 이름 | 용도 |
| --- | --- | --- |
| `src/store.ts` | `useApp`, `emit`, `S` | 상태 읽기, 바꾼 뒤 다시 그리기 |
| | `byId`, `hexOf`, `swatchBg` | 옷 찾기, 옷 색, 무늬 배경 |
| | `worn`, `wornNote`, `dayLabel`, `wornDate` | "어제 입음" 같은 날짜 문구 |
| | `eun`, `iga` | 받침에 맞는 조사(은/는, 이/가). `을(를)` 같은 표기를 쓰지 않습니다 |
| | `matchText`, `fit` | 코디가 어울리는지 판단 |
| | `wearToday`, `saveLook`, `deleteItem` | 입기, 코디 저장, 옷 삭제 (연결된 기록까지 정리) |
| `src/ui.tsx` | `toast`, `openSheet`, `openModal`, `closeModal`, `closeAll` | 알림, 아래 창, 가운데 창 |
| | `askPermission` | 사진·카메라 접근 권한 묻기 |
| | `showIn` | 화면 안에서만 스크롤해 요소를 가운데로 |
| `src/nav.ts` | `go`, `toLogin`, `openPost` | 창 안의 버튼 등 컴포넌트 밖에서 화면 이동 |
| `src/components/` | `Ph`, `lightbox` | 옷 사진 칸, 사진 크게 보기 |
| | `Face` | 프로필 동그라미 |
| | `Icons.tsx` | 선 아이콘 (`Arrow`, `Heart`, `Back`, `Plus` 등) |
| | `writeSheet` | 코디 올리기·글 수정 창 |
| `src/data/seed.ts` | `COLORS`, `PATTERNS`, `CATS`, `SUBS`, `TRENDS`, `STYLES` | 색·무늬·종류·스타일 목록 |

## 스타일링

- 스타일은 `src/styles/`의 CSS 파일에 둡니다. `proto.css`(기본) 위에 `luxe.css`(확정 디자인)를 덮어씁니다.
- 새 스타일은 `luxe.css`에 추가합니다. `proto.css`는 기존 화면이 깨질 수 있어 꼭 필요할 때만 고칩니다.
- 색은 CSS 변수만 씁니다: `--ink`(글자), `--ivory`(배경), `--paper`(카드), `--muted`, `--soft`(보조 글자), `--line`(선), `--ph`, `--ph2`(사진 자리). 색 코드를 직접 쓰지 않습니다.
- `--pink`, `--yellow`는 프로토타입 때 이름만 남은 것이고 지금 값은 검정입니다. 새 코드에서는 쓰지 않습니다.
- 글꼴은 본문 `--sans`(Noto Sans KR), 제목·장식 `--serif`(Bodoni Moda)입니다.
- 먼저 있는 클래스를 씁니다: 버튼 `btn`, `btn solid`, 버튼 두 개 나란히 `row2`, 탭 `tabs`, 선택 버튼 묶음 `seg`, 필터 `pill`, 구역 `sec`, 작은 제목 `eyebrow`, 보조 문구 `sub`, 빈 화면 `empty`.
- 인라인 `style={{}}`은 여백·크기 같은 한 곳짜리 미세 조정에만 씁니다. 두 곳 이상에서 쓰면 클래스로 뺍니다.
- 화면 기준 폭은 390px입니다. 500px 이하에서는 폰 틀 없이 화면 전체를 씁니다.

## 바꾸면 안 되는 것

- `HashRouter`(`src/main.tsx`)와 `base: './'`(`vite.config.ts`)는 Capacitor 앱과 배포에서 화면 이동·파일 경로를 맞추려고 쓴 것이라 바꾸지 않습니다.
- 이미지는 `/`로 시작하는 절대 경로 대신 `import`(또는 `seed.ts`의 `photo`, `cpic`)로 불러옵니다.
- 카메라는 https(또는 localhost)에서만 동작합니다. 폰에서 확인할 때는 `npm run dev:phone`을 씁니다.
- API 연동 방식은 백엔드 팀과 정하는 중입니다. 정해지기 전에는 `fetch` 코드나 API 주소를 추가하지 않습니다.

## 확인 방법

- `npm run dev`로 띄운 뒤, 브라우저 개발자 도구에서 폭 390px(폰)과 넓은 화면을 둘 다 봅니다.
- 카메라, 사진 올리기, 권한 창은 `npm run dev:phone`으로 실제 폰에서 확인합니다.
- 큰 변경 뒤에는 `npm run build && npm run preview`로 배포 형태에서도 확인합니다.
- 상태를 바꾼 기능은 탭을 옮겼다가 돌아와도 값이 유지되는지 확인합니다.

## 네이밍

언어는 TypeScript입니다. 아래 규칙은 현재 코드의 관례를 정리한 것이며, 새 코드도 같은 방식으로 작성합니다.

| 대상 | 규칙 | 예시 |
| --- | --- | --- |
| 화면(페이지) 파일 | `PascalCase.tsx`, 화면 하나 = 파일 하나, `export default` | `pages/Closet.tsx`, `pages/Onboard.tsx` |
| 공통 컴포넌트 파일 | `PascalCase.tsx`, 이름 있는 export | `components/Layout.tsx`, `components/WriteSheet.tsx` |
| 컴포넌트 이름 | 파일명과 같은 `PascalCase` | `Layout`, `TabIcon` |
| 컴포넌트가 아닌 모듈 | 소문자 `camelCase.ts(x)` | `store.ts`, `nav.ts`, `ui.tsx`, `data/seed.ts` |
| 타입 | `PascalCase`, `type` 사용 | `Item`, `Outfit`, `Category` |
| 함수·변수 | `camelCase`, 함수는 동사로 시작 | `openPost`, `toLogin`, `setNav` |
| 불리언 | `is`·`has`·`on` 등으로 시작하는 이름 | `isNew`, `loggedIn`, `toastOn` |
| 상수 | `UPPER_SNAKE_CASE` (모듈 전체에서 쓰는 고정값) | `COLORS`, `CATS`, `TABS`, `LONG` |
| React 훅 | `use` + `PascalCase` | `useApp` |
| 이미지 에셋 | 소문자 `snake_case`, 순번은 0으로 채움 | `item_01.jpg`, `tartan_nav.png` |
| 에셋 폴더 | 소문자 단어 | `assets/clothes/`, `assets/community/` |
| CSS 클래스 | 소문자, 단어 구분은 `-` | `lg-logo`, `hdock2` |
| CSS 변수 | `--` + 소문자 | `--sans`, `--serif` |
| 문서 파일 | `UPPER_SNAKE_CASE.md` (폴더 소개는 `README.md`) | `GIT_CONVENTION.md`, `docs/LIBRARIES.md` |
| 설정 파일 | 도구 기본 이름 | `vite.config.ts`, `tsconfig.json` |

- 한 글자 약어(`S`, `kView`, `cTab` 등)는 초기 프로토타입에서 옮겨 온 것입니다. 기존 코드는 그대로 두되, 새로 만드는 이름은 의미가 드러나게 씁니다.
- 새 화면을 만들면 `src/pages/`에 파일을 추가하고 `src/App.tsx`에 주소를 연결합니다. 파일 맨 위에 `// 화면 이름: 설명 (담당: 이름)` 형식의 한 줄 주석을 답니다.

## 코드 스타일

- 들여쓰기는 공백 2칸, 문자열은 작은따옴표(`'`), 문장 끝 세미콜론은 쓰지 않습니다.
- 타입만 가져올 때는 `import type`을 씁니다.
- `any`는 쓰지 않습니다. 타입 단언(`as`)은 꼭 필요한 곳에서만 씁니다.
- `tsconfig`의 `noUnusedLocals`, `noUnusedParameters`가 켜져 있으므로 쓰지 않는 변수는 남기지 않습니다.
- 앱 전체 데이터의 모양은 `src/data/types.ts`에 둡니다. API로 바꿔도 이 모양은 유지합니다.
- 상태는 `src/store.ts`의 `useApp()`으로 읽고, 값을 바꾼 뒤 `emit()`을 호출합니다. 화면 위 알림과 창은 `src/ui.tsx`의 `toast`, `openSheet`, `openModal`을 씁니다.
- 린트는 `oxlint`(`npm run lint`)를 사용합니다. 경고와 오류를 남기지 않습니다.
