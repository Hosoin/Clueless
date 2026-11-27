// 로그인 확인·Google 로그인·로그아웃 (closet-service의 AuthController 기준, BE의 FE 연동 요약 1~4장).
//  - GET  /api/auth/me          로그인했으면 200 + 사용자 정보 + CSRF 토큰 헤더(X-CSRF-TOKEN), 아니면 401
//  - POST /api/auth/logout      로그아웃. 같은 세션의 CSRF 토큰이 필요하고, 없거나 틀리면 403. 성공하면 204(본문 없음)
//  - GET  /oauth2/authorization/google   Google 로그인 시작 (fetch가 아니라 브라우저 화면 이동으로 부른다)
import { ApiError } from './error'
import { CLOSET_URL, clearCsrf, closetFetch, hasCsrf, setCsrf } from './client'

/** 로그인 API의 시간 제한(밀리초). 백엔드가 응답하지 않아도 10초 안에 로그인 화면으로 넘어간다 (API_CONVENTION "BE 확인 필요" 20번) */
const AUTH_TIMEOUT_MS = 10_000

/** /api/auth/me가 주는 사용자 정보. id는 문자열이고, 나머지 셋은 비어 있으면 null이다 (Google이 이름·이메일을 안 줄 수 있음) */
export type Me = { id: string; userName: string | null; nickName: string | null; email: string | null }

/**
 * Google 로그인 시작 주소. fetch가 아니라 화면 이동으로 부르므로 브라우저가 직접 갈 수 있는 백엔드 전체 주소여야 한다.
 * API 호출 주소(CLOSET_URL)는 같은 출처의 /api 프록시를 쓰려고 비워 둘 수 있어서, 로그인 시작 주소는 따로 정한다.
 * 정하는 순서: VITE_CLOSET_LOGIN_URL → VITE_CLOSET_API_URL → 로컬 백엔드(http://localhost:8081).
 * 배포에서는 VITE_CLOSET_LOGIN_URL에 백엔드 주소를 넣고 빌드한다. 안 넣으면 방문자 PC의 localhost로 가 버린다.
 * Google이 돌려주는 콜백(/login/oauth2/code/google)은 백엔드가 처리하고, 프론트는 code·state를 다루지 않는다.
 */
export const GOOGLE_LOGIN_URL = `${import.meta.env.VITE_CLOSET_LOGIN_URL || CLOSET_URL || 'http://localhost:8081'}/oauth2/authorization/google`

/* Google 로그인을 막 하고 돌아온 것인지 표시.
   Google 로그인은 화면이 백엔드·Google로 넘어갔다 앱이 새로 열리는 방식이라 메모리(S)가 모두 사라진다.
   백엔드는 로그인이 끝나면 앱의 첫 주소(기본값 http://localhost:5173/#)로 돌려보낼 뿐, 첫 설정으로 보낼지는 정하지 않는다.
   그래서 "방금 로그인 버튼을 눌렀다"는 표시만 sessionStorage(이 탭이 닫히면 지워짐)에 잠깐 남겼다가, 앱이 다시 열리면 읽고 바로 지운다.
   이 표시가 있으면 첫 설정(onboard)으로, 없으면(이미 로그인된 상태로 앱을 연 것) 홈으로 보낸다.
   저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 표시 없이 동작해 홈으로 간다. */
const GOOGLE_RETURN_KEY = 'clueless.googleLoginPending'

/** Google 로그인 화면으로 보내기 직전에 부른다 */
export function markGoogleLoginStart() {
  try { sessionStorage.setItem(GOOGLE_RETURN_KEY, '1') } catch { /* 저장소를 못 쓰면 표시 없이 진행 */ }
}

/** 방금 Google 로그인을 하고 돌아왔는지 읽고, 읽은 즉시 표시를 지운다 (한 번만 true) */
export function takeGoogleLoginReturn(): boolean {
  try {
    const pending = sessionStorage.getItem(GOOGLE_RETURN_KEY) === '1'
    sessionStorage.removeItem(GOOGLE_RETURN_KEY)
    return pending
  } catch { return false }
}

/** 서버(Google) 로그인 세션이 있는지. /me가 200이면 true, 401이거나 로그아웃하면 false.
 *  카카오·Apple 가짜 로그인은 S.loggedIn만 true이고 이 값은 false라서, 로그아웃할 때 서버에 요청하지 않는다.
 *  S의 구조를 바꾸지 않으려고 이 파일 안에만 둔다 */
let serverSession = false

/** 로그인했는지 서버에 물어본다. 로그인했으면 사용자 정보, 아니면(401) null.
 *  서버에 닿지 못하거나 10초 안에 응답이 없으면 ApiError(status 0)를, 그 밖의 실패(5xx 등)는 ApiError를 던진다.
 *  성공하면 응답 헤더의 CSRF 토큰을 보관한다. 세션이 바뀐 뒤(로그인·403)에도 이 함수로 토큰을 새로 받는다. */
export async function fetchMe(): Promise<Me | null> {
  const res = await closetFetch('/api/auth/me', { timeoutMs: AUTH_TIMEOUT_MS })
  if (res.status === 401) { serverSession = false; clearCsrf(); return null } // 로그인 안 됨. 오류가 아니다
  if (!res.ok) throw new ApiError(res.status, `HTTP_${res.status}`, '로그인 상태를 확인하지 못했어요')
  // 헤더 이름은 서버가 정하므로(지금은 X-CSRF-TOKEN) 이름에 csrf가 들어간 헤더를 찾아 이름과 값을 함께 보관한다
  res.headers.forEach((value, name) => { if (/csrf/i.test(name)) setCsrf(name, value) })
  serverSession = true
  return (await res.json()) as Me
}

/** 로그아웃 요청을 한 번 보낸다. 상태 코드만 돌려주고 판단은 logout()이 한다 (204는 본문이 없어 json()을 부르지 않는다) */
const postLogout = async () => (await closetFetch('/api/auth/logout', { method: 'POST', timeoutMs: AUTH_TIMEOUT_MS })).status

/**
 * 로그아웃. 서버 로그인이면 서버 세션을 끝내고, 실패하면 ApiError를 던진다.
 * - 카카오·Apple 가짜 로그인(serverSession false)은 서버에 알릴 것이 없어 바로 끝난다.
 * - CSRF 토큰이 없으면 /me로 먼저 받는다. 토큰 없이 끝내면 서버 세션이 남은 채 "로그아웃했어요"가 떴다.
 *   /me가 401이면 서버 세션이 이미 없으므로 로그아웃된 것으로 본다.
 * - 403(토큰이 없거나 틀림)이면 /me로 토큰을 새로 받아 한 번만 다시 보낸다. 그래도 403이면 실패로 알린다.
 * - 401은 이미 세션이 끝난 상태라 성공으로 본다.
 */
export async function logout(): Promise<void> {
  if (!serverSession) return
  if (!hasCsrf() && !(await fetchMe())) return // 토큰을 받으러 갔더니 이미 로그아웃 상태
  let status = await postLogout()
  if (status === 403) {
    if (!(await fetchMe())) return // 토큰을 새로 받으러 갔더니 이미 로그아웃 상태
    status = await postLogout()
  }
  if (status === 204 || status === 200 || status === 401) { serverSession = false; clearCsrf(); return }
  if (status === 403) throw new ApiError(403, 'CSRF', '로그아웃하지 못했어요. 새로고침한 뒤 다시 해 주세요')
  throw new ApiError(status, `HTTP_${status}`, '로그아웃하지 못했어요')
}
