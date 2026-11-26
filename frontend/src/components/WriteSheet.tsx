// 코디 올리기 / 글 수정 (입은 기록과 커뮤니티에서 같이 씀)
import { useState } from 'react'
import type { Hist, Post } from '../data/types'
import { S, byId, dayLabel, emit, hexOf } from '../store'
import { go, toLogin } from '../nav'
import { closeAll, openSheet, toast } from '../ui'

export function writeSheet(h?: Hist | null, edit?: Post) {
  if (!S.loggedIn) { toast('로그인하면 코디를 올릴 수 있어요'); return toLogin('/community') }
  if (!edit && !S.history.length) return toast('먼저 입은 코디가 있어야 올릴 수 있어요')
  openSheet(() => <Write h={h} edit={edit} />)
}

const names = (x: Hist) => x.ids.map((id) => byId(id)!.name).join(' + ')

function Write({ h, edit }: { h?: Hist | null; edit?: Post }) {
  const [pick, setPick] = useState<Hist | null>(edit ? null : h || S.history[0])
  const [cap, setCap] = useState(edit ? edit.body : '')
  const [ch, setCh] = useState(edit ? edit.ch : false)
  const [scope, setScope] = useState(edit ? edit.scope || S.defScope : S.defScope)
  const ok = () => {
    const text = cap.trim()
    if (edit) { edit.body = text || edit.body; edit.t = (text || edit.t).slice(0, 26); edit.scope = scope; edit.ch = ch; closeAll(); toast('글을 고쳤어요'); return emit() }
    // 사진 없는 글은 올리지 않는다: 코디의 옷이 모두 사진이 있어야 한다.
    // 글 사진은 첫 번째 옷의 사진이라, 비어 있으면 커뮤니티·MY·글 보기에서 그림이 깨진다 (코드 리뷰 16번).
    // 지워져서 찾을 수 없는 옷도 사진이 없는 것으로 본다.
    if (!pick!.ids.every((id) => byId(id)?.img)) return toast('사진이 없는 옷이 있는 코디는 올릴 수 없어요')
    const first = byId(pick!.ids[0])!
    S.posts.unshift({ id: ++S.pid, mine: true, user: S.me.handle, img: first.img || '', pos: '50% 50%', min: 0, ago: '방금', ch, scope, likes: 0, cmts: 0,
      t: (text || names(pick!)).slice(0, 26), body: text || names(pick!),
      wear: pick!.ids.map((id) => { const it = byId(id)!; return [it.name, hexOf(it), id, 'same'] }) })
    closeAll(); S.myTab = 'posts'; go('/my'); toast('올렸어요. MY에서 고치거나 지울 수 있어요')
  }
  return (
    <>
      <h3>{edit ? '글 수정' : '코디 올리기'}</h3><p>{edit ? '설명과 공개 범위를 바꿀 수 있어요' : '입은 기록에서 올릴 코디를 골라 주세요'}</p>
      {!edit && (
        <div className="pick">
          {S.history.map((x, i) => (
            <button key={i} className={x === pick ? 'on' : ''} onClick={() => setPick(x)}>
              <span className="thumbs">{x.ids.map((id) => <span className="ph" key={id}>{byId(id)?.img && <img src={byId(id)!.img} alt="" />}</span>)}</span>
              <span><p>{names(x)}</p><p className="d">{dayLabel(x.ago)}</p></span>
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
