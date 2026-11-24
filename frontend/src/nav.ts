// 화면 밖의 함수(창 안의 버튼 등)에서도 화면을 옮길 수 있게 navigate를 보관
import type { NavigateFunction } from 'react-router'
import { S } from './store'

let navFn: NavigateFunction | null = null
export const setNav = (f: NavigateFunction) => { navFn = f }
/** 화면 옮기기. 창을 열 때 방문 기록에 쌓아 둔 칸(ui.tsx의 overlay 표시) 위에서 옮기면 그 칸을 새 화면으로 바꿔 끼운다.
 *  그냥 쌓으면 그 칸이 남아서, 새 화면에서 뒤로가기를 두 번 눌러야 이전 화면으로 돌아가는 일이 생긴다 */
export const go = (path: string) => navFn?.(path, window.history.state?.overlay ? { replace: true } : undefined)

/** 로그인이 필요한 일: 로그인 화면으로 보내고, 끝나면 from으로 돌아옴 */
export const toLogin = (from: string) => { S.loginBack = from; go('/login') }

/** 커뮤니티 글 열기 (from = 돌아갈 탭) */
export const openPost = (id: number, from: string) => {
  S.curPost = id; S.postFrom = from
  const q = S.posts.find((x) => x.id === id); if (q) q.replyTo = null
  go(`/post/${id}`)
}
