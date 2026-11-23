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
| `src/data/` | 가짜 데이터(`seed.ts`)와 타입. 백엔드 API가 생기면 이 폴더와 `store.ts`를 바꾼다 |
| `src/styles/` | `proto.css`(프로토타입 스타일) 위에 `luxe.css`(지금 디자인)를 덮어씀 |
| `src/assets/` | 옷 사진, 커뮤니티 사진 |
| `public/avatar.js` | 아바타 그리기 (`window.renderAvatar`) |
| `capacitor.config.ts` | Capacitor 앱 설정 |
| `vite.config.ts` | Vite 설정 (Capacitor용으로 `base: './'`) |

## 폰에서 보기

```bash
npm run dev:phone
```

터미널에 나온 `Network: https://192.168.x.x:5173` 주소를 같은 와이파이에 있는 폰 브라우저에서 엽니다.
카메라 권한 요청은 https에서만 뜨기 때문에 폰용은 https로 켭니다. 처음 열 때 "안전하지 않은 연결" 경고가 뜨면
"자세히 보기 → 이 웹사이트 방문"을 누르면 됩니다 (개발용 임시 인증서라서 뜨는 경고).
화면 이동은 주소에 `#`을 쓰는 `HashRouter`라서 Capacitor 앱 안에서도 그대로 동작합니다.
