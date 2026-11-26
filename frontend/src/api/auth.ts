// 로그인 확인·Google 로그인·로그아웃 (closet-service의 AuthController 기준).
//  - GET  /api/auth/me          로그인했으면 200 + 사용자 정보 + CSRF 토큰 헤더, 아니면 401
//  - POST /api/auth/logout      로그아웃, 204
//  - GET  /oauth2/authorization/google   Google 로그인 시작 (fetch가 아니라 브라우저 화면 이동으로 부른다)
import { ApiError } from './error'
import { CLOSET_URL, clearCsrf, closetFetch, hasCsrf, setCsrf } from './client'

/** /api/auth/me가 주는 사용자 정보. id는 문자열이다. */
export type Me = { id: string; userName: string; nickName: string; email: string }

/** Google 로그인 시작 주소. 화면 이동으로 불러야 하므로 브라우저가 직접 갈 수 있는 전체 주소여야 한다.
 *  (fetch용 CLOSET_URL이 비어 있으면 개발용 기본값 localhost:8081을 쓴다) */
export const GOOGLE_LOGIN_URL = `${CLOSET_URL || 'http://localhost:8081'}/oauth2/authorization/google`

/* Google 로그인을 막 하고 돌아온 것인지 표시.
   Google 로그인은 화면이 백엔드·Google로 넘어갔다 앱이 새로 열리는 방식이라 메모리(S)가 모두 사라진다.
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

/** 로그인했는지 서버에 물어본다. 로그인했으면 사용자 정보, 아니면(401) null.
 *  서버에 닿지 못하면 ApiError(status 0)를 던진다. 성공하면 응답 헤더의 CSRF 토큰을 보관한다. */
export async function fetchMe(): Promise<Me | null> {
  const res = await closetFetch('/api/auth/me')
  if (res.status === 401) return null // 로그인 안 됨. 오류가 아니다
  if (!res.ok) throw new ApiError(res.status, `HTTP_${res.status}`, '로그인 상태를 확인하지 못했어요')
  // 헤더 이름은 서버가 정하므로 이름에 csrf가 들어간 헤더를 찾아 이름과 값을 함께 보관한다
  res.headers.forEach((value, name) => { if (/csrf/i.test(name)) setCsrf(name, value) })
  return (await res.json()) as Me
}

/** 로그아웃. 서버 로그인(CSRF 토큰이 있는 경우)일 때만 서버에 요청하고, 실패하면 ApiError를 던진다.
 *  카카오·Apple처럼 서버 없이 가짜로 로그인한 경우에는 서버에 알릴 것이 없어 바로 끝난다. */
export async function logout(): Promise<void> {
  if (!hasCsrf()) return
  const res = await closetFetch('/api/auth/logout', { method: 'POST' })
  // 401은 이미 로그아웃된 상태(세션 만료)라 성공으로 본다
  if (!res.ok && res.status !== 401) throw new ApiError(res.status, `HTTP_${res.status}`, '로그아웃하지 못했어요')
  clearCsrf()
}
