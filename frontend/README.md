# Frontend

사용자 화면을 구현할 공간입니다. Vite + React + TypeScript로 구성했습니다.

## 요구 사항

- Node.js 20.19 이상 (또는 22.12 이상)
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
| `src/pages/` | 화면 하나 = 파일 하나 (홈, 옷장, 옷 등록, 캘린더, 커뮤니티, 글 보기, MY, 설정, 로그인, 첫 설정) |
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
│  ├─ store.ts            앱 상태 S, 구독(useApp, emit), 추천·기록·삭제 규칙
│  ├─ ui.tsx              toast, 아래 창(sheet), 가운데 창(modal), 권한 묻기, showIn
│  ├─ nav.ts              컴포넌트 밖에서 화면 이동 (go, toLogin, openPost)
│  ├─ api/                백엔드(closet-service) 요청 함수
│  │  ├─ client.ts        공통 요청(closetFetch): 세션 쿠키 같이 보내기, CSRF 토큰 붙이기
│  │  ├─ auth.ts          로그인 확인(fetchMe), 로그아웃(logout), Google 로그인 주소(GOOGLE_LOGIN_URL)
│  │  └─ error.ts         요청 실패 에러(ApiError)
│  ├─ data/
│  │  ├─ types.ts         앱 전체 데이터 모양 (Item, Look, Outfit, Post …)
│  │  └─ seed.ts          가짜 데이터와 목록 상수 (COLORS, CATS, SUBS, TRENDS, STYLES)
│  ├─ pages/              화면 하나 = 파일 하나, `export default`
│  │  ├─ Home.tsx         홈: 오늘의 코디 맞추기, 아바타 보기, 트렌드
│  │  ├─ Closet.tsx       옷장: 내 옷 / 추천에서 뺀 옷
│  │  ├─ Upload.tsx       옷 등록: AI가 고른 값을 한 벌씩 확인하고 고치기
│  │  ├─ Calendar.tsx     캘린더: 입은 기록, 입을 계획, 저장한 코디
│  │  ├─ Community.tsx    커뮤니티 피드
│  │  ├─ Post.tsx         글 보기: 댓글, 내 옷장과 비교, 따라 입기
│  │  ├─ My.tsx           MY: 프로필과 내 글
│  │  ├─ Settings.tsx     설정
│  │  ├─ Login.tsx        로그인 (Google은 백엔드 로그인, 카카오·Apple은 가짜)
│  │  └─ Onboard.tsx      첫 설정: 추천 방식, 스타일, 닉네임
│  ├─ components/         여러 화면이 같이 쓰는 부품
│  │  ├─ Layout.tsx       폰 틀, 위쪽 로고, 하단 탭, 스크롤 시 탭 숨김, 창 띄우는 자리(Overlays), 앱 시작 시 로그인 확인
│  │  ├─ Ph.tsx           옷 사진 칸(`Ph`)과 사진 크게 보기(`lightbox`)
│  │  ├─ Face.tsx         프로필 동그라미
│  │  ├─ Icons.tsx        선 아이콘
│  │  └─ WriteSheet.tsx   코디 올리기·글 수정 창(`writeSheet`)
│  ├─ styles/             proto.css(기본) 위에 luxe.css(확정 디자인)를 덮어씀
│  └─ assets/             옷 사진(clothes), 커뮤니티 사진(community), 탭 무늬 이미지
├─ public/                빌드에 그대로 복사되는 파일 (avatar.js, 아이콘, 아바타 원본 이미지)
├─ docs/                  LIBRARIES.md(사용 라이브러리), API_CONVENTION.md(백엔드 통신 규칙 초안)
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
                                                └── 값을 바꾼 뒤 emit() ◀────┘
                                                    (구독 중인 화면이 모두 다시 그려짐)
```

1. `store.ts`가 불러와질 때 `seedItems()` 같은 함수로 가짜 데이터를 복사해 `S`를 만듭니다.
2. 화면은 `const s = useApp()`으로 `S`를 읽습니다. `useApp()`은 `emit()`이 불릴 때마다 화면을 다시 그리게 합니다.
3. 값을 바꾸는 코드(버튼 클릭 등)는 `S`를 직접 고친 뒤 **반드시 `emit()`을 부릅니다.** 빼먹으면 값은 바뀌었는데 화면이 그대로입니다.
4. 옷 삭제, 오늘 입기, 코디 저장처럼 여러 곳이 같이 바뀌는 일은 `store.ts`의 함수(`deleteItem`, `wearToday`, `saveLook`)를 씁니다. 화면에서 `S`를 하나씩 고치지 않습니다.
5. 알림·창은 `ui.tsx`의 `toast`, `openSheet`, `openModal`을 어디서든 부릅니다. 내부에서 `emit()`을 불러 다시 그립니다.
6. 화면 이동은 컴포넌트 안에서는 `useNavigate()`, 창 안의 버튼처럼 컴포넌트 밖에서는 `nav.ts`의 `go`를 씁니다.

- 저장은 메모리뿐입니다. 새로고침하면 `seed.ts`의 처음 상태로 돌아갑니다. (`localStorage`도 쓰지 않습니다)
- **로그인을 뺀 모든 데이터는 아직 `seed.ts`의 가짜 데이터입니다.** 백엔드는 `closet-service`(8081)와 `recommendation-service`(8082) 두 서비스이고, 옷·추천 같은 업무 API는 아직 없습니다. 로그인만 `closet-service`와 연결되어 있습니다. (아래 [로그인](#로그인-백엔드-연결))
- API가 열리면 서비스별로 `seed.ts`가 하던 일을 `src/api/`의 요청 함수가 대신합니다. 그때까지는 같은 함수가 가짜 데이터를 돌려주는 방식으로 넘어갑니다. 자세한 방법은 [`docs/API_CONVENTION.md`](docs/API_CONVENTION.md)를 참고하세요.
- 화면 구성에만 쓰는 보기 상태(`kView`, `cTab` 등)도 `S`에 있어서, 탭을 옮겨 다녀도 유지됩니다.

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
  ├─ 401: 로그인 화면 → [Google로 계속하기] → 백엔드 → Google 로그인 → 앱이 #/onboard로 다시 열림 → 맨 위부터 다시
  └─ 200: 로그인 상태(S.loggedIn), 서버 닉네임 반영. #/onboard로 열렸으면 첫 설정, 로그인 화면이면 홈으로
```

- **실행 순서**: 백엔드 `closet-service`를 먼저 켜고(8081) `npm run dev`를 실행합니다. 백엔드가 꺼져 있으면 로그인 확인에 실패해 로그인 화면이 뜨고, 가짜 데이터로 둘러볼 수는 있습니다.
- **프록시**: 개발 서버가 `/api` 요청을 백엔드로 대신 전달합니다(`vite.config.ts`). 그래서 백엔드에 CORS 설정이 없어도 로그인 쿠키가 같이 갑니다. 다른 PC의 백엔드를 쓰려면 `frontend/.env.local`에 `API_PROXY_TARGET=http://<IP>:8081`을 적습니다.
- **Google 로그인 조건**: 백엔드를 켠 PC에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 환경 변수가 있어야 합니다. 없으면 Google 로그인이 꺼져 있어, 버튼을 누르면 Google 화면 대신 백엔드의 401 빈 화면이 뜹니다.
- **로그아웃**: 설정 화면의 로그아웃이 서버 세션도 끝냅니다(`POST /api/auth/logout`).
- **지금의 한계**: 백엔드가 로그인 후 항상 `#/onboard`로 보내서, 이미 가입한 사람도 첫 설정이 뜹니다. 카카오·Apple 버튼은 백엔드에 없어서 가짜 로그인입니다.
- 폰 앱(Capacitor)이나 배포에서는 프록시가 없으므로 `VITE_CLOSET_API_URL`에 백엔드 전체 주소를 적고, 백엔드가 CORS와 쿠키를 허용해야 합니다.

## 폰에서 보기

```bash
npm run dev:phone
```

터미널에 나온 `Network: https://192.168.x.x:5173` 주소를 같은 와이파이에 있는 폰 브라우저에서 엽니다.
카메라 권한 요청은 https에서만 뜨기 때문에 폰용은 https로 켭니다. 처음 열 때 "안전하지 않은 연결" 경고가 뜨면
"자세히 보기 → 이 웹사이트 방문"을 누르면 됩니다 (개발용 임시 인증서라서 뜨는 경고).
화면 이동은 주소에 `#`을 쓰는 `HashRouter`라서 Capacitor 앱 안에서도 그대로 동작합니다.
