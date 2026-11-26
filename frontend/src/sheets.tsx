// 여러 화면에서 여는 창을 여는 함수 모음. 창 내용 컴포넌트는 components/에 두고, 여기에는 여는 함수만 둔다.
// 컴포넌트와 함수를 한 파일에서 같이 내보내면 개발 중 화면 자동 갱신이 잘 안 돼서 나눴다 (코드 리뷰 29번)
import { Write } from './components/WriteSheet'
import type { Hist, Post } from './data/types'
import { toLogin } from './nav'
import { S } from './store'
import { openSheet, toast } from './ui'

/** 코디 올리기(h: 처음 골라 둘 입은 기록) 또는 글 수정(edit) 창을 연다. 로그인하지 않았거나 입은 기록이 없으면 알림만 */
export function writeSheet(h?: Hist | null, edit?: Post) {
  if (!S.loggedIn) { toast('로그인하면 코디를 올릴 수 있어요'); return toLogin('/community') }
  if (!edit && !S.history.length) return toast('먼저 입은 코디가 있어야 올릴 수 있어요')
  openSheet(() => <Write h={h} edit={edit} />)
}
