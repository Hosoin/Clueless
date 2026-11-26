// 캘린더: 달력 + 저장한 코디 (담당: B)
// - 달력에서 지난날을 누르면 그날 입은 코디를 보고 수정하기·삭제하기, 이 코디 저장하기를 할 수 있다
// - 오늘·앞날을 누르면 입을 코디를 계획하고, 다른 코디로 바꾸기·삭제하기를 할 수 있다
// - 예전 '입은 기록' 탭은 없앴다. 입은 기록은 날짜를 눌러 달력에서 바로 고치고 지운다 (11/25 Figma 수정안)
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Arrow } from '../components/Icons'
import { PhPair, Thumbs } from '../components/Ph'
import { CATS } from '../data/seed'
import type { Hist, Look } from '../data/types'
import {
  S, TODAY0, agoOf, byId, dayLabel, dkey, emit, hexOf, isRecent, lookIds, matchText, planOn, present, recalcWorn, rowKey, saveLook, useApp, wearToday, wornNote, wornOn,
} from '../store'
import { closeAll, closeModal, openModal, openSheet, toast } from '../ui'

/** 요일 머리글 (일요일부터) */
const WD = ['일', '월', '화', '수', '목', '금', '토']
/** 달력에 보이는 달(1일)과 고른 날. 화면 밖에 두어 탭을 옮겨 다녀도 유지된다 */
let calMonth = new Date(TODAY0.getFullYear(), TODAY0.getMonth(), 1), calSel = new Date(TODAY0)
/** calSel·calMonth를 정할 때의 오늘. 자정이 지나 TODAY0가 바뀌었는지 알아보려고 둔다 */
let calDay = dkey(TODAY0)
/** 앱을 켜 둔 채 날짜가 바뀌었으면(store.ts의 rollDay) 오늘을 고르고 있던 경우에만 새 오늘과 그 달로 옮긴다.
 *  다른 날을 골라 두었으면 그대로 둔다. 같은 날에 다시 불러도 아무것도 바꾸지 않는다 (코드 리뷰 19번) */
function followToday() {
  const now = dkey(TODAY0)
  if (now === calDay) return
  if (dkey(calSel) === calDay) { calSel = new Date(TODAY0); calMonth = new Date(TODAY0.getFullYear(), TODAY0.getMonth(), 1) }
  calDay = now
}
/** 달력 칸의 작은 사진: 코디에서 사진이 있는 첫 옷. 없으면 비움 */
const thumbOf = (ids: number[]) => { const it = ids.map(byId).find((x) => x?.img) || byId(ids[0]); return it?.img ? <img src={it.img} alt="" /> : null }

/** 캘린더 화면: 달력 / 저장한 코디 */
export default function Calendar() {
  useApp()
  followToday()
  const set = (f: () => void) => { f(); emit() }
  return (
    <section className="screen on" id="s-cal">
      <div className="head"><h1>My <i>Calendar</i></h1></div>
      <div className="pad">
        <div className="seg" id="k-seg">
          {([['cal', '달력'], ['saved', '저장한 코디']] as const).map(([v, l]) => (
            <button key={v} className={S.kView === v ? 'on' : ''} onClick={() => set(() => (S.kView = v))}>{l}</button>
          ))}
        </div>
        {S.kView === 'saved' && <>
          <p className="ccount">저장한 코디 {S.saved.length}개</p>
          <p className="note">달력에서 입은 날을 누르면 그 코디를 저장할 수 있어요</p>
        </>}
        {S.kView === 'saved' ? <SavedList /> : <Month />}
      </div>
    </section>
  )
}

/** 한 달 달력. 입은 날은 그날 코디 사진, 앞날의 계획은 점선 사진. 날을 누르면 아래(Day)에 그날을 보여 준다 */
function Month() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth()
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate()
  const move = (d: number) => { calMonth = new Date(y, m + d, 1); emit() }
  return (
    <div>
      <div className="calhead">
        <button className="arrow" aria-label="이전 달" onClick={() => move(-1)}><Arrow dir={-1} /></button>
        <p>{y}년 {m + 1}월</p>
        <button className="arrow" aria-label="다음 달" onClick={() => move(1)}><Arrow dir={1} /></button>
      </div>
      <div className="calgrid">
        {WD.map((w, i) => <span key={w} className={`wd ${i ? '' : 'sun'}`}>{w}</span>)}
        {Array.from({ length: first.getDay() }, (_, i) => <span key={'o' + i} className="cday out" />)}
        {Array.from({ length: days }, (_, i) => {
          const n = i + 1, d = new Date(y, m, n), w = wornOn(d), pl = !w && agoOf(d) <= 0 ? planOn(d) : null
          return (
            <button key={n} className={`cday ${agoOf(d) === 0 ? 'today' : ''} ${dkey(d) === dkey(calSel) ? 'sel' : ''}`}
              aria-label={`${m + 1}월 ${n}일${w ? ', 입은 코디 있음' : pl ? ', 입을 코디 있음' : ''}`}
              onClick={() => { calSel = new Date(y, m, n); emit() }}>
              <span className="n">{n}</span>
              {w ? <span className="th">{thumbOf(w.ids)}</span> : pl ? <span className="th plan">{thumbOf(pl.ids)}</span> : null}
            </button>
          )
        })}
      </div>
      <div className="callegend"><span><i className="lw" />입은 코디</span><span><i className="lp" />입을 코디</span></div>
      <Day />
    </div>
  )
}

/** 고른 날: 입은 날이면 입은 코디(수정·삭제·저장), 오늘·앞날이면 입을 코디(계획·바꾸기·삭제) */
function Day() {
  const d = calSel, ago = agoOf(d), w = wornOn(d), pl = ago <= 0 ? planOn(d) : null
  const pair = (ids: number[]) => (
    // 지운 옷 등으로 id에 맞는 옷이 없으면 그 칸은 건너뛴다 (없는 옷을 그리려다 화면 전체가 멈추지 않게)
    <PhPair items={ids.map(byId).filter(present)} caption={(it) => it.name} />
  )
  return (
    <div className="calday">
      {w ? <><p className="k">입은 코디</p>{pair(w.ids)}
            {/* 수정하기: 빠진 옷 더하기·안 입은 옷 빼기 창, 삭제하기: 그날 기록을 통째로 지움 */}
            <div className="row2"><button className="btn" onClick={() => editHist(w)}>수정하기</button>
              <button className="btn" onClick={() => askDeleteHist(w, () => applyHist(w, [], '입은 기록을 지웠어요'))}>삭제하기</button></div>
            <button className="btn solid full mt8" onClick={() => saveWorn(w)}>이 코디 저장하기</button></>
        : pl ? <><p className="k pink">입을 코디</p>{pair(pl.ids)}
            <div className="row2"><button className="btn" onClick={() => planSheet(d)}>다른 코디로 바꾸기</button>
              <button className="btn" onClick={() => { S.plans.splice(S.plans.indexOf(pl), 1); toast('계획을 지웠어요'); emit() }}>삭제하기</button></div></>
        : ago > 0 ? <p className="k">이날 입은 기록이 없어요</p>
        : <><p className="k">아직 입을 코디를 정하지 않았어요</p><button className="btn solid full" onClick={() => planSheet(d)}>저장한 코디로 계획하기</button></>}
    </div>
  )
}

// 중요한 날을 미리 계획: 저장한 코디를 최근 저장한 순서로 전부 펼쳐 보여 줌
function planSheet(d: Date) {
  const k = dkey(d)
  openSheet(() => {
    const list = S.saved.map((o) => ({ o, ids: lookIds(o).filter((id): id is number => !!id && !!byId(id)) })).filter((x) => x.ids.length)
    return (
      <>
        <div className="pkhead"><h3>{d.getMonth() + 1}월 {d.getDate()}일에 입을 코디</h3><button className="link" onClick={closeAll}>닫기</button></div>
        <p>저장한 코디 {list.length}개 중에서 골라요</p>
        {list.length ? (
          <div className="pick pickall">
            {list.map((x) => (
              <button key={x.o.id} onClick={() => {
                const old = S.plans.find((p) => p.date === k)
                if (old) old.ids = x.ids; else S.plans.push({ date: k, ids: x.ids })
                closeAll(); toast(`${d.getMonth() + 1}월 ${d.getDate()}일에 입을 코디로 정했어요`)
              }}>
                <Thumbs ids={x.ids} />
                <p>{x.ids.map((id) => byId(id)!.name).join(' + ')}</p>
              </button>
            ))}
          </div>
        ) : <p className="note" style={{ padding: '8px 0 16px' }}>아직 저장한 코디가 없어요. 홈에서 코디를 맞추고 "저장"을 눌러 보세요</p>}
      </>
    )
  }, true)
}

/** 저장한 코디 목록: 코디마다 썸네일, 어울림, 최근 입은 옷 안내 */
function SavedList() {
  const nav = useNavigate()
  const [wornIds, setWorn] = useState<number[]>([])
  if (!S.saved.length) return <div className="saved"><div className="empty">아직 저장한 코디가 없어요<br /><button className="btn cta" onClick={() => nav('/')}>코디 맞춰 보기</button></div></div>
  return (
    <div className="saved">
      {S.saved.map((o, i) => {
        const ps = lookIds(o).map((x) => byId(x)).filter(present), m = matchText(ps), rec = ps.filter(isRecent)
        const done = wornIds.includes(o.id)
        return (
          <div className="so" key={o.id}>
            <div className="meta"><p className="nm">{ps.map((p) => p.name).join(' + ')}</p><p className="dt">{o.at}</p></div>
            <PhPair items={ps} caption={(p) => p.cat} />
            <div className="match" style={{ margin: 0 }}><span className={`dot ${m.hit ? '' : 'grey'}`} /><p>{m.t}</p></div>
            {rec.length > 0 && <p className="note">{wornNote(rec[0])}</p>}
            <div className="acts">
              <button className="btn solid" disabled={done} onClick={() => { wearToday(ps); setWorn([...wornIds, o.id]); toast('오늘 코디로 정했어요'); emit() }}>{done ? '오늘 코디로 정했어요' : '이 코디로 입기'}</button>
              <button className="link" onClick={() => { S.saved.splice(i, 1); toast('코디를 삭제했어요'); emit() }}>삭제</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * 입은 기록 h의 옷을 ids로 바꾼다. ids가 비면 그날 기록을 지운다.
 * 바뀐 옷마다 '마지막으로 입은 날'을 다시 계산하고(recalcWorn), 오늘 기록이면 홈의 '오늘 코디로 정함' 표시도 푼다.
 * 끝나면 열린 창을 닫고 msg를 알림으로 띄운다.
 */
function applyHist(h: Hist, ids: number[], msg: string) {
  const before = [...h.ids]
  if (ids.length) h.ids = ids; else S.history.splice(S.history.indexOf(h), 1)
  ;[...new Set([...before, ...ids])].forEach(recalcWorn)
  if (h.ago === 0) S.chosenKey = null
  closeAll(); toast(msg)
}
/** 입은 기록을 지울지 묻는 창. 지우기를 누르면 onYes. 달력의 삭제하기와 수정하기 창의 '이날 안 입었어요'가 같이 쓴다 */
function askDeleteHist(h: Hist, onYes: () => void) {
  openModal(() => (
    <>
      <h3>{dayLabel(h.ago)} 기록을 지울까요?</h3><p className="sub">옷마다 마지막으로 입은 날도 이 기록 전으로 돌아가요</p>
      <div className="col mt18"><button className="btn solid" onClick={onYes}>지우기</button><button className="btn" onClick={closeModal}>취소</button></div>
    </>
  ))
}
// 옷 id 목록을 코디(Look) 칸에 나눠 넣을 때 쓰는 줄 키 → 칸 이름
const SLOT_OF = { t: 'top', m: 'mid', j: 'jacket', o: 'outer', b: 'bottom' } as const
/**
 * 입은 코디를 저장한 코디에 넣는다 (홈의 '저장' 버튼이 하던 일을 캘린더에서).
 * 입은 기록은 옷 id 목록이라, 옷마다 종류로 칸(상의·덧입기·재킷·코트·하의)을 정해 코디 모양으로 바꾼 뒤 saveLook에 넘긴다.
 * 같은 칸에 옷이 둘이면 먼저 나온 옷을 쓴다. 이미 저장한 코디면 다시 넣지 않는다.
 */
function saveWorn(h: Hist) {
  const look: Look = {}
  h.ids.forEach((id) => { const it = byId(id); if (it && !look[SLOT_OF[rowKey(it)]]) look[SLOT_OF[rowKey(it)]] = id })
  const dup = saveLook(look)
  toast(dup ? '이미 저장한 코디예요' : '코디를 저장했어요. 저장한 코디에서 볼 수 있어요'); emit()
}

/* 입은 기록 고치기(달력의 수정하기): 안 입은 옷은 빼고, 빠뜨린 옷은 더하고, 그날 통째로 안 입었으면 기록을 지움 */
function editHist(h: Hist) {
  let ids = [...h.ids]
  const finish = (msg: string) => applyHist(h, ids, msg)
  openSheet(() => {
    const rest = S.items.filter((i) => !ids.includes(i.id))
    return (
      <>
        <h3>입은 기록 고치기</h3><p>{dayLabel(h.ago)} 입은 옷이에요. 안 입은 옷은 빼 주세요</p>
        <div className="list" style={{ marginBottom: 14 }}>
          {ids.length ? ids.map((id) => { const it = byId(id)!; return (
            <div className="erow" key={id}><span className="ph">{it.img && <img src={it.img} alt="" />}</span><p>{it.name}<span>{it.cat}</span></p>
              <button className="btn" onClick={() => { ids = ids.filter((x) => x !== id); emit() }}>빼기</button></div>
          ) }) : <p className="note" style={{ padding: '12px 0' }}>남은 옷이 없어요. 저장하면 이 기록이 지워져요</p>}
        </div>
        <h4>빠뜨린 옷 더하기</h4>
        {CATS.filter((c) => rest.some((i) => i.cat === c)).map((c) => (
          <div key={c}><p className="optcat">{c}</p>
            <div className="opts">{rest.filter((i) => i.cat === c).map((i) => <button key={i.id} className="opt" onClick={() => { ids.push(i.id); emit() }}><i style={{ background: hexOf(i) }} />{i.name}</button>)}</div></div>
        ))}
        <div className="row2">
          <button className="btn" onClick={() => askDeleteHist(h, () => { ids = []; finish('입은 기록을 지웠어요') })}>이날 안 입었어요</button>
          <button className="btn solid" onClick={() => finish(ids.length ? '입은 기록을 고쳤어요' : '입은 기록을 지웠어요')}>저장</button>
        </div>
      </>
    )
  })
}
