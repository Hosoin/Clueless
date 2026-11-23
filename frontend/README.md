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
| `src/main.tsx` | 앱 진입점 |
| `src/App.tsx` | 최상위 컴포넌트 |
| `src/assets/` | 컴포넌트에서 import하는 이미지 등 |
| `public/` | 그대로 배포되는 정적 파일 |
| `vite.config.ts` | Vite 설정 |
