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
