/// <reference types="vite/client" />
// 이 앱이 읽는 Vite 환경 변수(import.meta.env)의 타입. 값과 설명의 견본은 frontend/.env.example에 있다.
// 환경 변수를 추가하면 여기, .env.example, docs/API_CONVENTION.md의 표를 같이 고친다.

interface ImportMetaEnv {
  /** closet-service 주소. 비우면 같은 출처의 /api로 요청한다 (src/api/client.ts) */
  readonly VITE_CLOSET_API_URL?: string
  /** Google 로그인을 시작할 백엔드 주소(화면 이동용 전체 주소). 비우면 VITE_CLOSET_API_URL, 그것도 비면 http://localhost:8081 (src/api/auth.ts) */
  readonly VITE_CLOSET_LOGIN_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
