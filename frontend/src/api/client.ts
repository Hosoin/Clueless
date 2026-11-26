// 백엔드(closet-service) 공통 요청 함수.
// 로그인은 서버 세션 쿠키 방식이라 모든 요청에 쿠키를 같이 보내고(credentials), 값을 바꾸는 요청에는 CSRF 토큰을 헤더로 붙인다.
// 자세한 규칙은 docs/API_CONVENTION.md 4장 참고.
import { ApiError } from './error'

/** closet-service 주소. 비워 두면 같은 출처(/api/...)로 부르고, 개발 서버(vite.config.ts의 proxy)가 8081 포트로 대신 전달한다.
 *  이렇게 하면 백엔드에 CORS 설정이 없어도 쿠키가 같이 가고, https로 연 폰 화면에서도 막히지 않는다.
 *  Capacitor 앱이나 배포에서는 .env에 전체 주소(http://...)를 적는다. 끝에 /를 붙이지 않는다. */
export const CLOSET_URL: string = import.meta.env.VITE_CLOSET_API_URL ?? ''

/** CSRF 토큰: 로그인 확인(/api/auth/me) 응답 헤더로 받아 메모리에만 둔다. 새로고침하면 /me에서 다시 받는다.
 *  헤더 이름은 백엔드가 응답으로 알려 주므로 코드에 적지 않는다. */
let csrf: { header: string; token: string } | null = null
export const setCsrf = (header: string, token: string) => { csrf = { header, token } }
export const clearCsrf = () => { csrf = null }
export const hasCsrf = () => csrf !== null

/** closet-service에 요청을 보내고 응답(Response)을 그대로 돌려준다.
 *  상태 코드(401 등)를 어떻게 다룰지는 부르는 쪽이 정한다. 서버에 닿지 못하면 ApiError(status 0)를 던진다. */
export async function closetFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const isRead = (init.method ?? 'GET').toUpperCase() === 'GET'
  try {
    return await fetch(`${CLOSET_URL}${path}`, {
      ...init,
      credentials: 'include', // 로그인 세션 쿠키를 같이 보낸다
      headers: {
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf && !isRead ? { [csrf.header]: csrf.token } : {}), // 값을 바꾸는 요청(POST 등)에만 CSRF 토큰
        ...init.headers,
      },
    })
  } catch {
    // 서버가 꺼져 있거나 네트워크가 끊김. 서버가 준 에러가 아니라서 status 0으로 따로 알린다
    throw new ApiError(0, 'NETWORK', '서버에 연결할 수 없어요')
  }
}
