// 백엔드(closet-service) 공통 요청 함수.
// 로그인은 서버 세션 쿠키 방식이라 모든 요청에 쿠키를 같이 보내고(credentials), 값을 바꾸는 요청에는 CSRF 토큰을 헤더로 붙인다.
// 자세한 규칙은 docs/API_CONVENTION.md 4장 참고.
import { ApiError } from './error'

/** closet-service API 주소. 비워 두면 같은 출처(/api/...)로 부르고, 개발 서버(vite.config.ts의 proxy)나 배포 이미지의 nginx가 백엔드로 대신 전달한다.
 *  이렇게 하면 백엔드에 CORS 설정이 없어도 쿠키가 같이 가고, https로 연 폰 화면에서도 막히지 않는다.
 *  Capacitor 앱처럼 프록시가 없는 곳에서만 .env에 전체 주소(http://...)를 적는다. 끝에 /를 붙이지 않는다.
 *  Google 로그인을 시작하는 주소는 이 값과 따로 정한다 (api/auth.ts의 GOOGLE_LOGIN_URL) */
export const CLOSET_URL: string = import.meta.env.VITE_CLOSET_API_URL ?? ''

/** CSRF 토큰: 로그인 확인(/api/auth/me) 응답 헤더로 받아 메모리에만 둔다. 새로고침하면 /me에서 다시 받는다.
 *  헤더 이름은 백엔드가 응답으로 알려 주므로 코드에 적지 않는다. */
let csrf: { header: string; token: string } | null = null
export const setCsrf = (header: string, token: string) => { csrf = { header, token } }
export const clearCsrf = () => { csrf = null }
export const hasCsrf = () => csrf !== null

/** closetFetch의 추가 옵션. timeoutMs: 이 시간(밀리초) 안에 응답이 없으면 요청을 끊는다 */
type FetchOptions = RequestInit & { timeoutMs?: number }

/** closet-service에 요청을 보내고 응답(Response)을 그대로 돌려준다.
 *  상태 코드(401 등)를 어떻게 다룰지는 부르는 쪽이 정한다.
 *  서버에 닿지 못하거나 timeoutMs 안에 응답이 없으면 ApiError(status 0)를 던진다.
 *  시간 제한이 없으면 백엔드가 응답하지 않을 때 앱이 첫 로딩 화면에서 끝없이 기다렸다 */
export async function closetFetch(path: string, { timeoutMs, ...init }: FetchOptions = {}): Promise<Response> {
  const isRead = (init.method ?? 'GET').toUpperCase() === 'GET'
  // 시간 제한: 정해진 시간이 지나면 AbortController로 요청을 끊는다. 끊긴 것인지 알려고 timedOut을 따로 둔다
  const ctrl = timeoutMs ? new AbortController() : null
  let timedOut = false
  const timer = ctrl ? setTimeout(() => { timedOut = true; ctrl.abort() }, timeoutMs) : 0
  try {
    return await fetch(`${CLOSET_URL}${path}`, {
      ...init,
      ...(ctrl ? { signal: ctrl.signal } : {}),
      credentials: 'include', // 로그인 세션 쿠키를 같이 보낸다
      headers: {
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf && !isRead ? { [csrf.header]: csrf.token } : {}), // 값을 바꾸는 요청(POST 등)에만 CSRF 토큰
        ...init.headers,
      },
    })
  } catch {
    // 서버가 꺼져 있거나, 네트워크가 끊겼거나, 시간 안에 응답이 없음. 서버가 준 에러가 아니라서 status 0으로 따로 알린다
    throw new ApiError(0, timedOut ? 'TIMEOUT' : 'NETWORK', '서버에 연결할 수 없어요')
  } finally {
    if (timer) clearTimeout(timer)
  }
}
