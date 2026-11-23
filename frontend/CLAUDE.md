# Frontend 개발 지침

`frontend/` 작업에만 적용되는 지침입니다. 규칙을 바꿀 때는 PR로 수정합니다.

- 스택: Vite + React + TypeScript, Capacitor
- 저장소 전체 구조는 루트 `README.md`를 참고합니다.

## 브랜치와 작업 흐름

| 브랜치 | 역할 |
| --- | --- |
| `feat/*`, `fix/*` 등 | 작업 브랜치. `frontend`에서 따서 작업하고 PR로 합칩니다 |
| `frontend` | 스테이징 브랜치. 개발 서버에 배포되며 여기서 테스트합니다 |
| `main` | 스테이징에서 테스트가 통과한 변경만 PR로 반영합니다 |

흐름: `frontend`에서 작업 브랜치 생성 → 작업 → `frontend`로 PR → 개발 서버에서 테스트 → `main`으로 PR

- `frontend`와 `main`에는 직접 커밋하지 않고 항상 PR로 반영합니다.
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
