/// <reference types="vite/client" />
// 이 앱이 읽는 Vite 환경 변수(import.meta.env)의 타입. 값과 설명의 견본은 frontend/.env.example에 있다.
// 환경 변수를 추가하면 여기, .env.example, docs/API_CONVENTION.md의 표를 같이 고친다.

interface ImportMetaEnv {
  /** closet-service 주소. 비우면 같은 출처의 /api로 요청한다 (src/api/client.ts) */
  readonly VITE_CLOSET_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
