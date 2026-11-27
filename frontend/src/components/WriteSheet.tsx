// 코디 올리기 / 글 수정 창의 내용 (입은 기록과 커뮤니티에서 같이 씀). 여는 함수는 src/sheets.tsx의 writeSheet
import { useState } from 'react'
import type { Hist, Item, Post } from '../data/types'
import { Thumbs } from './Ph'
import { S, byId, createPost, dayLabel, hexOf, setMyTab, updatePost } from '../store'
import { go } from '../nav'
import { closeAll, toast } from '../ui'

/** 기록의 옷 중 옷장에 있는 옷만. 서버(API) 데이터가 어긋나 기록에만 남은 옷 id가 있어도 화면이 멈추지 않게 건너뛴다 */
const wornItems = (x: Hist) => x.ids.map((id) => byId(id)).filter((it): it is Item => !!it)
/** 입은 기록의 옷 이름을 ' + '로 이은 글자 (글 제목·본문을 비워 두면 이것을 씀) */
const names = (x: Hist) => wornItems(x).map((it) => it.name).join(' + ')

/** 코디 올리기·글 수정 창의 내용. 창을 여는 함수 writeSheet는 src/sheets.tsx에 있다 (코드 리뷰 29번) */
export function Write({ h, edit }: { h?: Hist | null; edit?: Post }) {
  const [pick, setPick] = useState<Hist | null>(edit ? null : h || S.history[0])
  const [cap, setCap] = useState(edit ? edit.body : '')
  const [ch, setCh] = useState(edit ? edit.ch : false)
  const [scope, setScope] = useState(edit ? edit.scope || S.defScope : S.defScope)
  const ok = () => {
    const text = cap.trim()
    if (edit) { const body = text || edit.body; updatePost(edit.id, { body, t: body.slice(0, 26), scope, ch }); closeAll(); toast('글을 수정했어요'); return }
    const ps = pick ? wornItems(pick) : []
    if (!ps.length) return toast('올릴 옷을 찾지 못했어요. 다른 코디를 골라 주세요')
    // 사진 없는 글은 올리지 않는다: 코디의 옷이 모두 사진이 있어야 한다.
    // 글 사진은 첫 번째 옷의 사진이라, 비어 있으면 커뮤니티·MY·글 보기에서 그림이 깨진다 (코드 리뷰 16번).
    // 지워져서 찾을 수 없는 옷도 사진이 없는 것으로 본다.
    if (!pick!.ids.every((id) => byId(id)?.img)) return toast('사진이 없는 옷이 있는 코디는 올릴 수 없어요')
    const first = ps[0]
    // 새 글은 댓글 없이(cmList: []) 시작한다. 전에는 withComments가 내 글이라고 예시 댓글(MY_CMTS)을 채워서,
    // '방금' 올린 글에 남이 '2일 전'에 쓴 댓글이 달려 있고 댓글 수(cmts)는 0으로 보였다 (코드 리뷰 11/27 7번)
    createPost({ mine: true, user: S.me.handle, img: first.img || '', pos: '50% 50%', min: 0, ago: '방금', ch, scope, likes: 0, cmts: 0,
      t: (text || names(pick!)).slice(0, 26), body: text || names(pick!),
      wear: ps.map((it) => [it.name, hexOf(it), it.id, 'same']), cmList: [] })
    closeAll(); setMyTab('posts'); go('/my'); toast('올렸어요. MY에서 고치거나 지울 수 있어요')
  }
  return (
    <>
      <h3>{edit ? '글 수정' : '코디 올리기'}</h3><p>{edit ? '설명과 공개 범위를 바꿀 수 있어요' : '입은 기록에서 올릴 코디를 골라 주세요'}</p>
      {!edit && (
        <div className="pick">
          {S.history.filter((x) => x.visible !== false).map((x, i) => (
            <button key={i} className={x === pick ? 'on' : ''} onClick={() => setPick(x)}>
              <Thumbs ids={x.ids} />
              <span><p>{names(x)}</p><p className="d">{dayLabel(x.date)}</p></span>
            </button>
          ))}
        </div>
      )}
      <label className="field2"><span>설명</span><textarea maxLength={120} placeholder="이 코디 이야기를 적어 주세요" value={cap} onChange={(e) => setCap(e.target.value)} /></label>
      <h4>공개 범위</h4>
      <div className="opts">{['전체 공개', '팔로워만'].map((x) => <button key={x} className={`opt ${scope === x ? 'on' : ''}`} onClick={() => setScope(x)}>{x}</button>)}</div>
      <button className="tg" aria-pressed={ch} style={{ marginBottom: 16 }} onClick={() => setCh(!ch)}>1년 안 입은 옷 꺼내 입기 챌린지에 참여</button>
      <button className="btn solid full" onClick={ok}>{edit ? '저장' : '올리기'}</button>
    </>
  )
}
