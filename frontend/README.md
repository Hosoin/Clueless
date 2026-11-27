# Frontend

사용자 화면을 구현할 공간입니다. Vite + React + TypeScript로 구성했습니다.

## 요구 사항

- Node.js 22.22 이상 (`react-router` 8.5.2가 Node 22.22 이상, `@capacitor/cli` 8.6.2가 22 이상을 요구합니다. CI와 `Dockerfile`도 Node 22를 씁니다)
- npm

## 실행 방법

```bash
cd frontend
npm install      # 의존성 설치
npm run dev      # 개발 서버 실행 (http://localhost:5173)
npm run build    # 타입 검사 후 프로덕션 빌드 (dist/)
npm run preview  # 빌드 결과 미리보기
npm run lint     # oxlint로 코드 검사
```

## 구조

| 경로 | 역할 |
| --- | --- |
| `src/main.tsx` | 앱 진입점 (글꼴·스타일 불러오기, HashRouter) |
| `src/App.tsx` | 화면 주소 연결 |
| `src/pages/` | 화면 하나 = 파일 하나 (홈, 옷장, 옷 등록, 캘린더, 커뮤니티, 글 보기, MY, 설정, 회원 탈퇴, 로그인, 첫 설정) |
| `src/components/` | 공통 부품 (폰 틀·하단 탭, 옷 사진 칸, 아이콘, 코디 올리기) |
| `src/store.ts` | 앱 상태와 추천 규칙. 화면은 `useApp()`으로 읽고, 값을 바꾼 뒤 `emit()`을 부른다 |
| `src/ui.tsx` | 알림·아래 창·가운데 창 (`toast`, `openSheet`, `openModal`) |
| `src/nav.ts` | 창 안의 버튼에서 화면 옮기기 |
| `src/api/` | 백엔드 요청 함수. 지금은 로그인(`/api/auth/me`, 로그아웃, Google 로그인 시작)만 있다 |
| `src/data/` | 가짜 데이터(`seed.ts`)와 타입. 백엔드 API가 생기면 이 폴더와 `store.ts`를 바꾼다 |
| `src/styles/` | `proto.css`(프로토타입 스타일) 위에 `luxe.css`(지금 디자인)를 덮어씀 |
| `src/assets/` | 옷 사진, 커뮤니티 사진 |
| `public/avatar.js` | 아바타 그리기 (`window.renderAvatar`) |
| `capacitor.config.ts` | Capacitor 앱 설정 |
| `vite.config.ts` | Vite 설정 (Capacitor용으로 `base: './'`, 개발 서버의 `/api` → 백엔드 프록시) |

### 폴더 트리와 파일별 역할

```
frontend/
├─ src/
│  ├─ main.tsx            진입점: 글꼴·CSS 불러오기, HashRouter로 App 감싸기
│  ├─ App.tsx             주소(Route) ↔ 화면 연결표
│  ├─ store.ts            앱 상태 S, 구독(useApp, emit), 상태를 바꾸는 함수, 추천·기록·삭제 규칙
│  ├─ ui.tsx              toast, 아래 창(sheet), 가운데 창(modal)을 여닫는 함수, 권한 묻기, showIn (그리는 건 components/Overlays.tsx)
│  ├─ nav.ts              컴포넌트 밖에서 화면 이동 (go, toLogin, openPost)
│  ├─ sheets.tsx          여러 화면에서 여는 창을 여는 함수 (writeSheet)
│  ├─ api/                백엔드(closet-service) 요청 함수
│  │  ├─ client.ts        공통 요청(closetFetch): 세션 쿠키 같이 보내기, CSRF 토큰 붙이기
│  │  ├─ auth.ts          로그인 확인(fetchMe), 로그아웃(logout), Google 로그인 주소(GOOGLE_LOGIN_URL)
│  │  └─ error.ts         요청 실패 에러(ApiError)
│  ├─ data/
│  │  ├─ types.ts         앱 전체 데이터 모양 (Item, Look, Outfit, Post …)
│  │  ├─ dates.ts         날짜 계산 (YYYY-MM-DD 날짜 키 만들기, 두 날짜의 차이, 화면 문구)
│  │  └─ seed.ts          가짜 데이터와 목록 상수 (COLORS, MATERIALS, CATS, SUBS, TRENDS, STYLES)
│  ├─ pages/              화면 하나 = 파일 하나, `export default`
│  │  ├─ Home.tsx         홈: 오늘의 코디 맞추기, 아바타 보기, 트렌드
│  │  ├─ Closet.tsx       옷장: 내 옷 / 추천에서 뺀 옷
│  │  ├─ Upload.tsx       옷 등록: AI가 고른 값을 한 벌씩 확인하고 고치기
│  │  ├─ Calendar.tsx     캘린더: 입은 기록, 입을 계획, 저장한 코디
│  │  ├─ Community.tsx    커뮤니티 피드
│  │  ├─ Post.tsx         글 보기: 댓글, 내 옷장과 비교, 따라 입기
│  │  ├─ My.tsx           MY: 프로필과 내 글
│  │  ├─ Settings.tsx     설정
│  │  ├─ Withdraw.tsx     회원 탈퇴 안내 (탈퇴 API 전까지 '준비 중' 알림만)
│  │  ├─ Login.tsx        로그인 (Google은 백엔드 로그인, 카카오·Apple은 가짜)
│  │  └─ Onboard.tsx      첫 설정: 추천 방식, 스타일, 닉네임
│  ├─ components/         여러 화면이 같이 쓰는 부품
│  │  ├─ Layout.tsx       폰 틀, 위쪽 로고, 하단 탭, 스크롤 시 탭 숨김, 창 띄우는 자리(Overlays), 앱 시작 시 로그인 확인
│  │  ├─ Overlays.tsx     알림·창을 그리는 자리 (상태와 여닫는 함수는 ui.tsx)
│  │  ├─ Ph.tsx           옷 사진 칸(`Ph`), 코디 썸네일(`PhPair`, `Thumbs`)
│  │  ├─ lightbox.tsx     옷 크게 보기 창(`lightbox`)과 그 안의 별명·삭제 창
│  │  ├─ Face.tsx         프로필 동그라미
│  │  ├─ StyleGrid.tsx    좋아하는 스타일 고르기 격자 (첫 설정·설정에서 같이 씀)
│  │  ├─ Icons.tsx        선 아이콘
│  │  └─ WriteSheet.tsx   코디 올리기·글 수정 창의 내용(`Write`). 여는 함수는 sheets.tsx의 `writeSheet`
│  ├─ styles/             proto.css(기본) 위에 luxe.css(확정 디자인)를 덮어씀
│  └─ assets/             옷 사진(clothes), 커뮤니티 사진(community), 탭 무늬 이미지
├─ public/                빌드에 그대로 복사되는 파일 (avatar.js, 아이콘, 아바타 원본 이미지)
├─ docs/                  LIBRARIES.md(사용 라이브러리), API_CONVENTION.md(백엔드 통신 규칙 초안), STATE_MANAGEMENT.md(상태관리 구조와 단계)
├─ nginx/                 Docker 이미지의 nginx 설정 템플릿 (정적 파일 서빙, /api 전달)
├─ Dockerfile             웹 배포용 이미지 (아래 Docker로 띄우기)
├─ CLAUDE.md              작업 규칙, 용어 사전, 재사용 목록
└─ GIT_CONVENTION.md      브랜치, 커밋, PR 규칙
```

- 의존 방향은 한쪽으로만 흐릅니다: `pages` → `components` → `store.ts`·`ui.tsx`·`nav.ts` → `data`.
  `api/`는 `pages`·`components`가 불러 쓰고, `api/` 안에서는 화면이나 `store.ts`를 불러오지 않습니다.
  `data/`는 다른 코드를 불러오지 않고, 화면끼리 서로 불러오지 않는 것을 기본으로 합니다.
  여러 화면이 같이 쓰는 것은 `components/`로 옮깁니다.
- 아바타는 React가 아니라 `public/avatar.js`가 `window.renderAvatar`로 그립니다. `Home.tsx`가 불러 씁니다.

### 데이터 흐름

```
data/seed.ts ──(앱이 켜질 때 한 번 복사)──▶ store.ts 의 S ──useApp()──▶ 각 화면
 가짜 데이터                                  메모리에 있는 앱 상태        읽어서 그림
                                                ▲                            │
                                                └── store.ts의 함수 ◀────────┘
                                                    (S를 고치고 emit() → 구독 중인 화면이 모두 다시 그려짐)
```

1. `store.ts`가 불러와질 때 `seedItems()` 같은 함수로 가짜 데이터를 복사해 `S`를 만듭니다.
2. 화면은 `const s = useApp()`으로 `S`를 읽습니다. `useApp()`은 `emit()`이 불릴 때마다 화면을 다시 그리게 합니다.
3. 화면은 `S`를 직접 고치지 않습니다. 값을 바꿀 때는 `store.ts`의 함수(예: `deleteSaved`, `toggleLike`, `selectItem`, `setClosetTab`)를 부르고, 함수가 `S`를 고친 뒤 `emit()`을 부릅니다. 필요한 함수가 없으면 `store.ts`에 추가합니다.
4. 옷 삭제, 오늘 입기, 코디 저장처럼 여러 곳이 같이 바뀌는 일도 `store.ts`의 함수(`deleteItem`, `wearToday`, `saveLook`)를 씁니다. `wearToday`·`saveLook`은 `emit()`을 부르지 않으니 부른 쪽에서 `emit()`을 부릅니다.
5. 알림·창은 `ui.tsx`의 `toast`, `openSheet`, `openModal`을 어디서든 부릅니다. 내부에서 `emit()`을 불러 다시 그립니다.
6. 화면 이동은 컴포넌트 안에서는 `useNavigate()`, 창 안의 버튼처럼 컴포넌트 밖에서는 `nav.ts`의 `go`를 씁니다.

- 저장은 메모리뿐입니다. 새로고침하면 `seed.ts`의 처음 상태로 돌아갑니다. (`localStorage`도 쓰지 않습니다. 예외로 Google 로그인 직후인지 표시하는 값 하나만 `sessionStorage`에 잠깐 남깁니다)
- **로그인을 뺀 모든 데이터는 아직 `seed.ts`의 가짜 데이터입니다.** 백엔드는 `closet-service`(8081)와 `recommendation-service`(8082) 두 서비스입니다. `closet-service`에는 옷 사진 분석·확정·수정·사진 보기 API가 배포되어 있고, 옷 목록·상세 조회·삭제 API는 코드에 있지만 아직 배포 전입니다(API 명세: [`backend/docs/FE_API_HANDOFF.md`](../backend/docs/FE_API_HANDOFF.md)). 프론트는 아직 연결하지 않았고, 추천 API는 아직 없습니다. 로그인만 `closet-service`와 연결되어 있습니다. (아래 [로그인](#로그인-백엔드-연결))
- API가 열리면 서비스별로 `seed.ts`가 하던 일을 `src/api/`의 요청 함수가 대신합니다. 그때까지는 같은 함수가 가짜 데이터를 돌려주는 방식으로 넘어갑니다. 자세한 방법은 [`docs/API_CONVENTION.md`](docs/API_CONVENTION.md)를 참고하세요.
- 화면 구성에만 쓰는 보기 상태(`kView`, `cTab` 등)도 `S`에 있어서, 탭을 옮겨 다녀도 유지됩니다.
- 날짜는 `YYYY-MM-DD` 문자열로 저장하고 "며칠 전" 같은 문구는 그릴 때 계산합니다 (`data/dates.ts`). 홈에서 고른 옷은 옷 id(`S.pick`)로 기억합니다.
- 로그아웃하면 `clearMe`가 `S` 전체와 화면 모듈 변수(`registerModuleReset`으로 등록한 것)를 처음 상태로 되돌립니다.
- 상태관리 구조와 앞으로의 단계(서버 데이터·화면 상태 나누기)는 [`docs/STATE_MANAGEMENT.md`](docs/STATE_MANAGEMENT.md)에 있습니다.

### 새 화면 추가하기

1. `src/pages/`에 `PascalCase.tsx` 파일을 만들고 `export default function 화면이름()`으로 내보냅니다.
   파일 맨 위에 `// 화면 이름: 설명 (담당: 이름)` 한 줄을 답니다.
2. `src/App.tsx`에 `import`와 `<Route path="주소" element={<화면이름 />} />`를 추가합니다. `<Layout />` 안쪽에 넣어야 폰 틀과 하단 탭이 붙습니다.
3. 하단 탭에 불이 들어오는 규칙은 `src/components/Layout.tsx`에 있습니다.
   - 탭을 새로 늘리면 `TABS`에 추가합니다. (탭은 5개 기준 디자인이라 먼저 팀과 상의합니다)
   - 탭이 아닌 화면이 어느 탭에 속하는지는 `tabOf()`에 적습니다. (예: 설정 → MY, 옷 등록 → 옷장) 적지 않으면 어떤 탭에도 불이 들어오지 않습니다.
   - 로그인·첫 설정처럼 탭과 로고를 숨겨야 하는 화면은 `Layout.tsx`의 `loginOn` 조건에 추가합니다.
4. 이미 있는 부품을 먼저 씁니다: `CLAUDE.md`의 "재사용할 것" 표. 상태는 `useApp()`, 알림은 `toast`, 창은 `openSheet`/`openModal`입니다.
   화면 전용 보기 상태를 `S`에 추가해야 하면 `store.ts` 변경이므로 먼저 팀에 확인합니다.
5. 스타일은 `src/styles/luxe.css`에 추가하고, 색은 CSS 변수만 씁니다. (`CLAUDE.md`의 스타일링)
6. `GIT_CONVENTION.md`의 scope 표에 새 화면 이름을 추가하고, 새 용어가 생기면 `CLAUDE.md` 용어 사전에도 추가합니다.
7. `npm run lint`와 `npm run build`가 통과하는지 확인하고, 폭 390px과 넓은 화면에서 모두 봅니다.

## 로그인 (백엔드 연결)

로그인은 백엔드 `closet-service`의 Google 로그인과 서버 세션(쿠키)을 씁니다. 프론트는 토큰을 저장하지 않습니다. 규칙은 [`docs/API_CONVENTION.md`](docs/API_CONVENTION.md) 4장에 있습니다.

```
앱 시작 → [로딩 화면] GET /api/auth/me
  ├─ 401: 로그인 화면 → [Google로 계속하기] → 백엔드 → Google 로그인 → 앱이 다시 열림 → 맨 위부터 다시
  ├─ 시간 초과(10초)·연결 실패·서버 오류(5xx): 로그인 화면 + 안내 알림 ("서버에 연결할 수 없어요" 등)
  └─ 200: 로그인 상태(S.loggedIn), 서버 닉네임 반영 (닉네임이 없으면 Google 이름, 그것도 없으면 빈칸)
       ├─ 방금 Google 로그인을 하고 돌아왔다 → 첫 설정(onboard)
       └─ 이미 로그인된 상태로 앱을 열었다 → 홈 (로그인·첫 설정 화면이었으면 홈으로, 다른 화면은 그대로)
```

- **실행 순서**: 백엔드 `closet-service`를 먼저 켜고(8081) `npm run dev`를 실행합니다. 백엔드를 켤 때 `FRONTEND_LOGIN_SUCCESS_URL=http://localhost:5173/#`을 주면 로그인 뒤 앱으로 돌아옵니다(BE 기본값을 `#`으로 바꾸는 작업은 BE에서 진행 중).
- **백엔드가 꺼져 있거나 응답이 없으면**: 로그인 확인은 10초까지만 기다리고 로그인 화면으로 넘어가며, 왜 그런지 알림을 띄웁니다. 가짜 데이터로 둘러볼 수는 있습니다.
- **프록시**: 개발 서버가 `/api` 요청을 백엔드로 대신 전달합니다(`vite.config.ts`). 그래서 백엔드에 CORS 설정이 없어도 로그인 쿠키가 같이 갑니다. 다른 PC의 백엔드를 쓰려면 `frontend/.env.local`에 `API_PROXY_TARGET=http://<IP>:8081`을 적습니다.
- **Google 로그인 조건**: 백엔드를 켠 PC에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 환경 변수가 있어야 합니다. 없으면 Google 로그인이 꺼져 있어, 버튼을 누르면 Google 화면 대신 백엔드의 401 빈 화면이 뜹니다.
- **Google 로그인 시작 주소**: 로그인은 fetch가 아니라 백엔드 주소로 화면을 옮겨 시작하므로, API 주소(같은 출처의 `/api`)와 따로 정합니다. 기본은 로컬 백엔드 `http://localhost:8081`이고, 배포 빌드에서는 `VITE_CLOSET_LOGIN_URL=https://api-closet-service.p-e.kr`을 줍니다(Docker는 `--build-arg`). 로컬에서 다른 주소를 시험할 때는 `frontend/.env.local`에 적습니다.
- **로그아웃**: 설정 화면의 로그아웃이 서버 세션도 끝냅니다(`POST /api/auth/logout`, CSRF 토큰 필요). 토큰이 없으면 `/me`로 먼저 받고, 403이면 토큰을 새로 받아 한 번만 다시 시도합니다. 그래도 실패하면 로그인 상태를 그대로 두고 알립니다. 카카오·Apple 가짜 로그인은 서버에 요청하지 않습니다.
- **방금 로그인했는지 구분하는 방법**: Google 버튼을 누를 때 `sessionStorage`에 표시를 남기고(`markGoogleLoginStart`), 앱이 다시 열리면 읽고 바로 지웁니다(`takeGoogleLoginReturn`). 표시가 있으면 첫 설정, 없으면 홈입니다.
- **지금의 한계**: 가입 여부를 서버가 알려 주지 않아서, Google 로그인을 할 때마다(이미 가입한 사람도) 첫 설정이 뜹니다. 카카오·Apple 버튼은 백엔드에 없어서 가짜 로그인입니다.
- **배포 BE와 연결할 때**: 로그인 세션 쿠키는 BE 도메인(`api-closet-service.p-e.kr`)에만 생겨서, 화면이 다른 주소(`http://20.41.112.42`, `localhost:5173`)에서 열리면 쿠키가 붙지 않아 `/me`가 계속 401입니다. 그래서 **화면도 BE와 같은 주소(`https://api-closet-service.p-e.kr/`)에서 엽니다.** BE의 Caddy가 API 경로는 백엔드로, 나머지는 프론트 컨테이너로 보냅니다. 구성과 BE가 할 일은 아래 [Google 로그인까지 되는 구성](#google-로그인까지-되는-구성)에 있습니다. 로컬 개발 서버(`localhost:5173`)에서 배포 BE로 로그인하는 것은 같은 이유로 되지 않습니다.
- 폰 앱(Capacitor)에서는 프록시가 없으므로 `VITE_CLOSET_API_URL`에 백엔드 전체 주소를 적고, 백엔드가 CORS와 쿠키를 허용해야 합니다. 웹 배포(Docker)는 nginx가 개발 서버 프록시와 같은 일을 합니다. (아래 [Docker로 띄우기](#docker로-띄우기))

## 배포하기 (VM에 올리기, 따라 하기)

개발을 몰라도 그대로 따라 하면 배포할 수 있게 쓴 안내입니다. **회색 상자 안의 명령을 한 줄씩 복사해 붙여 넣고 Enter**를 누르면 됩니다. `#`으로 시작하는 줄은 설명이라 붙여 넣지 않아도 됩니다.

### 먼저 알아 둘 말

| 말 | 쉽게 말하면 |
| --- | --- |
| VM | 우리 앱이 돌아가는 Azure의 컴퓨터(서버)입니다. 주소는 `20.41.112.42`입니다. |
| ssh | 내 PC에서 VM에 원격으로 접속하는 명령입니다. 접속하면 VM에서 명령을 칠 수 있습니다. |
| clone / pull | GitHub에 있는 코드를 VM으로 받아 오기(clone, 처음 한 번) / 최신으로 맞추기(pull, 매번)입니다. |
| 패키징(이미지) | 앱을 실행할 수 있게 하나로 묶은 "설치 파일"입니다. `docker build`로 만듭니다. |
| 컨테이너 | 이미지를 실제로 켜 둔 것입니다. 켜져 있어야 사람들이 사이트에 들어올 수 있습니다. |

전체 흐름은 이렇습니다.

```
① VM 접속 → ② 코드 받기 → ③ 패키징 → ④ 패키징 확인 → ⑤ 컨테이너 실행 → ⑥ 실행 확인 → ⑦ 브라우저로 확인
```

### 준비물

- **VM 접속 키 파일**과 **VM 사용자 이름**: 팀장에게 받습니다. 키 파일은 이 저장소 폴더 안에 두지 마세요. (저장소가 공개라서 실수로 올라가면 누구나 VM에 들어올 수 있습니다)
- **터미널**: Windows는 시작 메뉴에서 `PowerShell`을 엽니다. Mac은 `터미널` 앱을 엽니다.
- 배포하는 코드는 GitHub의 **`frontend` 브랜치**입니다. 새 기능이 `frontend` 브랜치에 머지된 뒤에 배포해야 화면에 반영됩니다.

### ① VM에 접속하기

내 PC의 터미널에서 실행합니다. `<키 파일 경로>`와 `<사용자 이름>`은 받은 값으로 바꿉니다. (꺾쇠 `< >`는 지웁니다)

```bash
ssh -i <키 파일 경로> <사용자 이름>@20.41.112.42
```

- 처음 접속하면 `Are you sure you want to continue connecting?`이 나옵니다. `yes`를 입력하고 Enter를 누릅니다.
- 화면 왼쪽에 `<사용자 이름>@...:~$`처럼 바뀌면 접속된 것입니다. **이제부터 ②~⑥은 모두 VM에서 칩니다.**

### ② 코드 받기

프론트는 VM의 홈 폴더에 받아 둔 저장소 폴더 ~/clueless-frontend/Clueless(저장소 루트)에서 배포합니다.

**처음 배포하는 경우** (VM에 `~/clueless-frontend/Clueless` 폴더가 없을 때만):

```bash
git clone -b frontend https://github.com/Hosoin/Clueless.git ~/clueless-frontend/Clueless
```

**두 번째부터** (폴더가 이미 있을 때):

```bash
cd ~/clueless-frontend/Clueless
git branch
git pull
```

- `git pull`이 끝나고 `Already up to date.`가 나오면 이미 최신입니다. 새 변경이 있으면 바뀐 파일 목록이 나옵니다.
- 이 폴더는 **배포 전용**입니다. 여기서 파일을 고치지 마세요. 고치면 다음 `git pull`이 실패합니다.
- 다른 팀(백엔드·ML)도 같은 VM을 쓰므로, 프론트 배포는 꼭 이 폴더(~/clueless-frontend/Clueless)에서 합니다. 다른 팀의 폴더에서는 명령을 치지 않습니다.

### ③ 패키징하기 (이미지 만들기)

```bash
cd ~/clueless-frontend/Clueless
docker build --build-arg VITE_CLOSET_LOGIN_URL=https://api-closet-service.p-e.kr -t clueless-frontend:latest ./frontend
```

- `https://api-closet-service.p-e.kr`은 VM에 배포된 백엔드 주소입니다. Google 로그인 버튼이 이 주소로 갑니다. 빼먹으면 로그인 버튼이 방문자 PC의 `localhost`로 가 버립니다.
- 1~3분쯤 걸립니다. 글자가 계속 올라가다가 멈추면 끝난 것입니다.
- 마지막 부분에 `ERROR`가 보이면 실패한 것입니다. 아래 [문제가 생기면](#문제가-생기면)을 보세요.

### ④ 패키징이 잘 됐는지 확인하기

```bash
docker images clueless-frontend
```

아래처럼 **`clueless-frontend` / `latest` 줄이 있고, `CREATED`가 방금 전**(예: `About a minute ago`)이면 성공입니다.

```
REPOSITORY          TAG       IMAGE ID       CREATED              SIZE
clueless-frontend   latest    1a2b3c4d5e6f   About a minute ago   110MB
```

### ⑤ 컨테이너 실행하기 (배포)

예전에 켜 둔 프론트를 끄고, 방금 만든 이미지로 새로 켭니다. **두 명령을 차례로** 실행합니다.

```bash
docker rm -f clueless-frontend
```

```bash
docker run -d --name clueless-frontend --restart unless-stopped --network clueless-closet-dev_default -p 80:80 clueless-frontend:latest
```

- 첫 명령에서 `No such container`가 나와도 괜찮습니다. (켜져 있던 게 없다는 뜻)
- 두 번째 명령은 **한 줄 전체를 그대로** 복사합니다. 성공하면 긴 영문·숫자 한 줄(컨테이너 번호)이 나옵니다.
- 이 설정 덕분에 VM이 재부팅돼도 프론트가 자동으로 다시 켜집니다.
- `--network clueless-closet-dev_default`는 **백엔드가 떠 있는 Docker 네트워크**입니다. 여기에 넣어야 BE의 Caddy가 화면을, 프론트 nginx가 백엔드(`closet-service`)를 찾습니다. 이름이 다르면 BE 담당자에게 확인합니다. ([VM 구성](#vm-구성-백엔드-네트워크에-붙이기))

### ⑥ 실행이 잘 됐는지 확인하기

```bash
docker ps --filter name=clueless-frontend
```

`STATUS` 칸이 **`Up ...`** 이면 켜져 있는 것입니다.

```bash
curl -I http://localhost
```

첫 줄이 **`HTTP/1.1 200 OK`** 이면 VM 안에서는 사이트가 잘 열립니다.

### ⑦ 브라우저에서 확인하기

1. 내 PC의 브라우저(크롬 등)에서 **http://20.41.112.42/#** 을 엽니다. (`https`가 아니라 `http`입니다)
2. Clueless 로고 뒤에 **로그인 화면**이 나오면 배포 성공입니다.
3. **로그인 없이 둘러보기**를 눌러 홈·옷장·캘린더 화면이 열리는지 봅니다.
4. 방금 배포한 변경이 안 보이면 **Ctrl + F5**(Mac은 Cmd + Shift + R)로 새로고침합니다. 브라우저가 예전 화면을 기억하고 있을 수 있습니다.
5. **로그인 확인은 `https://api-closet-service.p-e.kr/#` 에서** 합니다. Google로 계속하기 → 첫 설정 화면이 나오고, 새로고침해도 로그인이 유지되고, 설정 → 로그아웃이 되면 성공입니다. (BE의 [Caddy·환경 변수 작업](#google-로그인까지-되는-구성)이 끝나야 됩니다)

> `http://20.41.112.42/#`에서는 Google 로그인이 되지 않습니다(로그인 쿠키가 BE 주소에만 생김). 이 주소는 "로그인 없이 둘러보기"용입니다.

끝나면 `exit`를 입력해 VM 접속을 끝냅니다.

### 한 번에 보기 (두 번째 배포부터)

익숙해지면 VM에 접속한 뒤 아래만 차례로 실행하면 됩니다.

```bash
cd ~/clueless-frontend/Clueless
git pull
docker build --build-arg VITE_CLOSET_LOGIN_URL=https://api-closet-service.p-e.kr -t clueless-frontend:latest ./frontend
docker images clueless-frontend
docker rm -f clueless-frontend
docker run -d --name clueless-frontend --restart unless-stopped --network clueless-closet-dev_default -p 80:80 clueless-frontend:latest
docker ps --filter name=clueless-frontend
curl -I http://localhost
```

그다음 브라우저에서 http://20.41.112.42/# (둘러보기)과 https://api-closet-service.p-e.kr/# (로그인)을 엽니다.

### 문제가 생기면

| 이런 메시지가 나오면 | 이유 | 이렇게 하세요 |
| --- | --- | --- |
| `Permission denied (publickey)` | 키 파일이나 사용자 이름이 틀림 | 키 파일 경로와 사용자 이름을 다시 확인 |
| `UNPROTECTED PRIVATE KEY FILE` | 키 파일을 다른 사람도 읽을 수 있게 되어 있음 | Mac: `chmod 600 <키 파일 경로>` / Windows: 팀장에게 문의 |
| `permission denied while trying to connect to the docker API` | 이 계정에 Docker 권한이 없음 | `sudo usermod -aG docker $USER` 실행 후 `exit`, 다시 접속 |
| `git pull`에서 `Your local changes ... would be overwritten` | 배포 폴더의 파일이 고쳐져 있음 | `git checkout -- .` 후 다시 `git pull` (배포 폴더에서는 파일을 고치지 않기) |
| `docker build`가 `ERROR`로 끝남 | 코드나 빌드 문제 | 마지막 몇 줄을 캡처해서 프론트 담당자에게 공유 |
| `network clueless-closet-dev_default not found` | 백엔드가 안 떠 있거나 네트워크 이름이 다름 | 직접 만들지 말고 BE 담당자에게 네트워크 이름 확인 후 ⑤ 다시 |
| `port is already allocated` | 80 포트를 다른 것이 쓰는 중 | `docker ps`로 무엇이 80을 쓰는지 확인 후 담당자에게 공유 |
| 브라우저에서 안 열림, VM의 `curl`은 200 | Azure 방화벽(NSG)에서 80이 막힘 | Azure 포털 → VM → 네트워킹에서 인바운드 80(TCP) 허용 규칙 확인 |
| 화면은 열리는데 예전 화면 | 브라우저가 예전 파일을 기억 | Ctrl + F5 로 새로고침 |
| Google 로그인 버튼이 `localhost`로 감 | ③에서 `--build-arg VITE_CLOSET_LOGIN_URL=...`을 빼먹음 | ③부터 다시 |
| Google 로그인 뒤 다시 로그인 화면으로 돌아옴 | `http://20.41.112.42`에서 로그인했거나, BE 작업(Caddy·`FRONTEND_LOGIN_SUCCESS_URL`)이 아직 안 됨 | `https://api-closet-service.p-e.kr/#`에서 다시 해 보고, 그래도 안 되면 BE 담당자에게 공유 |
| `https://api-closet-service.p-e.kr/`에서 화면 대신 오류(502 등) | Caddy가 프론트 컨테이너를 못 찾음 | ⑤의 `--network` 이름이 BE 네트워크와 같은지 확인 (`docker inspect clueless-frontend`의 `Networks`) |

컨테이너 실행 기록(오류 메시지)은 `docker logs clueless-frontend`로 볼 수 있습니다. 담당자에게 물어볼 때 함께 보내 주세요.

## Docker로 띄우기

웹 배포용 이미지입니다. Node로 빌드하고 nginx로 띄웁니다. 폰 앱은 이 이미지를 쓰지 않고 `npm run build`로 만든 `dist/`를 앱 안에 넣습니다.

| 파일 | 역할 |
| --- | --- |
| `Dockerfile` | 1단계 `node:22-alpine`에서 `npm ci`·`npm run build`, 2단계 `nginx:1.27-alpine`이 `dist/`를 서빙 |
| `nginx/default.conf.template` | 정적 파일 서빙과 캐시 헤더, `/api` → `closet-service` 전달. 컨테이너가 시작할 때 환경 변수가 채워짐 |
| `.dockerignore` | `node_modules`, `dist`, `.env*`를 이미지에서 뺌 (`.env.local`이 이미지에 들어가지 않게) |

```bash
# 저장소 루트에서
docker build -t clueless-frontend ./frontend
docker run --rm -p 5173:80 -e API_UPSTREAM=http://host.docker.internal:8081 clueless-frontend
# http://localhost:5173
```

- **`/api`는 nginx가 백엔드로 전달합니다.** 개발 서버의 프록시(`vite.config.ts`)와 같은 방식이라, 브라우저에게는 같은 출처로 보여서 CORS 설정 없이도 로그인 쿠키가 같이 갑니다. 그래서 `VITE_CLOSET_API_URL`은 비워 둔 채로 빌드합니다.
- **`API_UPSTREAM`**: `/api`를 넘길 `closet-service` 주소입니다. 실행할 때 `-e`로 바꿀 수 있습니다. 기본값 `http://closet-service:8081`은 VM에서 프론트를 백엔드 네트워크에 넣었을 때 쓰는 백엔드 서비스 이름입니다([VM 구성](#vm-구성-백엔드-네트워크에-붙이기)). 내 PC에서 켠 백엔드는 `http://host.docker.internal:8081`입니다. **끝에 `/`나 경로를 붙이지 않습니다.** 붙이면 모든 `/api` 요청이 백엔드의 `/`로 가서 로그인이 안 된 것처럼 보입니다. 백엔드가 꺼져 있어도 nginx는 뜨고, 그동안 `/api` 요청만 502가 됩니다.
- **포트를 5173으로 여는 이유**: 백엔드가 Google 로그인에 성공하면 돌려보내는 주소의 기본값이 `http://localhost:5173/#`입니다. 다른 포트로 열면 로그인 뒤 개발 서버 주소로 돌아갑니다. 이 주소는 백엔드 환경 변수 `FRONTEND_LOGIN_SUCCESS_URL`로 바꿀 수 있습니다(`application.yml`의 `closet.security.google.success-url`, [`backend/README.md`](../backend/README.md)). 같은 포트를 쓰므로 `npm run dev`와 동시에 켤 수 없습니다.
- **백엔드가 돌려보내는 주소에는 `#`이 있어야 합니다.** 앱은 `HashRouter`라서 화면 주소가 `/#/...`이고, nginx는 늘 `/`만 받습니다. `#` 없이 `/home` 같은 주소로 오면 nginx에 그런 파일이 없어 404가 됩니다. (개발 서버는 없는 경로에도 `index.html`을 줘서 이 문제가 보이지 않습니다) 백엔드의 기본값(`http://localhost:5173/#`)은 `#`이 들어 있어 그대로 쓰면 됩니다. `FRONTEND_LOGIN_SUCCESS_URL`로 다른 주소를 넣을 때도 `#`을 꼭 넣습니다. 첫 설정으로 보낼지 홈으로 보낼지는 앱이 정하므로(위 [로그인](#로그인-백엔드-연결)) 돌려보내는 주소는 `#`까지만 있으면 됩니다.
- **`VITE_` 값은 빌드할 때 고정됩니다.** 실행할 때 `-e`로 넘겨도 바뀌지 않고, 바꾸려면 `--build-arg`로 다시 빌드합니다. 빌드 결과를 열면 누구나 볼 수 있으므로 비밀값을 넣지 않습니다.
- 백엔드·ML 이미지와 전체를 함께 띄우는 `docker-compose.yml`은 BE·ML 팀과 정한 뒤 추가합니다.

### VM 구성 (백엔드 네트워크에 붙이기)

프론트와 백엔드는 같은 Azure VM(Ubuntu)에 컨테이너로 떠 있습니다. 백엔드는 BE가 따로 띄운 compose 프로젝트(`clueless-closet-dev`)이고, 그 안의 Caddy가 도메인(`https://api-closet-service.p-e.kr`, 443)을 받습니다. 백엔드 8081은 VM 밖으로 열려 있지 않습니다.

- 컨테이너는 같은 Docker 네트워크에 있을 때만 서로를 이름으로 찾습니다. 그래서 프론트 컨테이너를 **백엔드 compose 네트워크(`clueless-closet-dev_default`)에 넣어** 띄웁니다.
- 그러면 BE의 Caddy가 화면을 `clueless-frontend:80`으로, 프론트 nginx가 `/api`를 `closet-service:8081`로 찾을 수 있습니다.
- 예전에 계획한 공용 네트워크 `clueless`에는 백엔드가 들어오지 않아 쓰지 않습니다.

```
인터넷 ──▶ https://api-closet-service.p-e.kr (Caddy 443, BE 담당)
              ├─ /api/*, /oauth2/*, /login/oauth2/*, /test ──▶ closet-service:8081 (백엔드)
              └─ 그 밖의 주소 ──────────────────────────────▶ clueless-frontend:80 (화면)
인터넷 ──▶ http://20.41.112.42 (VM:80) ──▶ clueless-frontend ── /api ──▶ closet-service:8081
                                            (로그인 없이 둘러보기용)
              [Docker 네트워크 clueless-closet-dev_default]
```

**프론트 배포 순서**

명령과 확인 방법은 위의 [배포하기 (VM에 올리기, 따라 하기)](#배포하기-vm에-올리기-따라-하기)에 있습니다. 요약하면 VM의 배포 전용 폴더(`~/clueless-frontend/Clueless`, 저장소 루트)에서 `frontend` 브랜치를 `git pull` → `docker build --build-arg VITE_CLOSET_LOGIN_URL=...` → `docker run --network clueless-closet-dev_default -p 80:80` 순서입니다.

- VM에는 Docker가 설치되어 있고 접속 계정이 `docker` 그룹에 들어 있어야 합니다. VM은 x86_64, 메모리 15GB라 VM 안에서 빌드해도 충분합니다.
- 백엔드 네트워크는 BE가 백엔드를 띄울 때 만들어집니다. 프론트가 직접 만들지 않습니다. BE가 compose를 내렸다 올려 네트워크가 새로 생기면 프론트도 ⑤를 다시 합니다.
- 다른 팀도 같은 VM과 계정을 쓰므로 프론트는 `~/clueless-frontend/Clueless`에서만 배포합니다. 이 폴더에서 누가 다른 브랜치로 `git switch`를 하면 배포되는 프론트 소스가 바뀌므로, `frontend` 브랜치에 그대로 둡니다.
- VM에는 **`frontend` 브랜치**(스테이징)를 배포합니다. `frontend-dev`에 머지된 변경은 `frontend-dev → frontend` PR이 머지된 뒤에 VM에 반영됩니다.
- 빌드를 여러 번 하면 이전 이미지가 쌓입니다. 가끔 `docker image prune -f`로 정리합니다.
- Azure NSG 인바운드에서 **80(TCP)만** 허용합니다. 8081(백엔드), 8000(ML), 5432(DB)는 외부에 열지 않습니다.
- VM에서는 80 포트로 엽니다. 위의 "포트를 5173으로 여는 이유"는 내 PC에서 띄울 때의 이야기입니다.

### Google 로그인까지 되는 구성

Google 로그인 세션 쿠키는 `https://api-closet-service.p-e.kr`에만 생깁니다. 그래서 **화면도 같은 주소에서 엽니다**(위 구성도의 Caddy 경로). 같은 주소라 쿠키·CORS·CSRF 문제가 없고, Google 콘솔의 콜백 주소도 바꾸지 않습니다. `http://20.41.112.42`에서는 `/api`가 백엔드에 닿아도 쿠키가 없어 로그인되지 않습니다.

| 누가 | 할 일 |
| --- | --- |
| 프론트 | ③ 빌드 때 `--build-arg VITE_CLOSET_LOGIN_URL=https://api-closet-service.p-e.kr`, ⑤에서 `--network <BE 네트워크>`로 실행. 코드 변경은 없음 (API 주소 `VITE_CLOSET_API_URL`은 비워 두어 같은 주소의 `/api`로 부름) |
| BE | Caddy가 위 경로대로 나눠 보내게 설정, 백엔드 Docker 네트워크 이름 알려 주기, `FRONTEND_LOGIN_SUCCESS_URL=https://api-closet-service.p-e.kr/#`로 바꾸고 재시작 |

- 로그인 쿠키가 BE 주소에만 생기므로, 다른 주소의 화면에서 BE를 직접 부르는 방식(CORS·쿠키 설정 변경)은 쓰지 않습니다. 브라우저가 다른 사이트 쿠키를 막는 경우가 많아 믿기 어렵습니다.

## 폰에서 보기

```bash
npm run dev:phone
```

터미널에 나온 `Network: https://192.168.x.x:5173` 주소를 같은 와이파이에 있는 폰 브라우저에서 엽니다.
카메라 권한 요청은 https에서만 뜨기 때문에 폰용은 https로 켭니다. 처음 열 때 "안전하지 않은 연결" 경고가 뜨면
"자세히 보기 → 이 웹사이트 방문"을 누르면 됩니다 (개발용 임시 인증서라서 뜨는 경고).
화면 이동은 주소에 `#`을 쓰는 `HashRouter`라서 Capacitor 앱 안에서도 그대로 동작합니다.
