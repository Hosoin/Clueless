// 캘린더: 지난날은 입은 기록, 오늘·앞날은 입을 코디 계획 + 저장한 코디 + 입은 기록 (담당: B)
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Arrow } from '../components/Icons'
import { Ph } from '../components/Ph'
import { writeSheet } from '../components/WriteSheet'
import { CATS } from '../data/seed'
import type { Hist, Item } from '../data/types'
import {
  S, TODAY0, agoOf, byId, dayLabel, dkey, emit, hexOf, isRecent, lookIds, matchText, planOn, recalcWorn, useApp, wearToday, wornNote, wornOn,
} from '../store'
import { closeAll, closeModal, openModal, openSheet, toast } from '../ui'

const WD = ['일', '월', '화', '수', '목', '금', '토']
let calMonth = new Date(TODAY0.getFullYear(), TODAY0.getMonth(), 1), calSel = new Date(TODAY0)
const thumbOf = (ids: number[]) => { const it = ids.map(byId).find((x) => x?.img) || byId(ids[0]); return it?.img ? <img src={it.img} alt="" /> : null }

export default function Calendar() {
  useApp()
  const set = (f: () => void) => { f(); emit() }
  return (
    <section className="screen on" id="s-cal">
      <div className="head"><h1>My <i>Calendar</i></h1></div>
      <div className="pad">
        <div className="seg" id="k-seg">
          {([['cal', '달력'], ['saved', '저장한 코디'], ['hist', '입은 기록']] as const).map(([v, l]) => (
            <button key={v} className={S.kView === v ? 'on' : ''} onClick={() => set(() => (S.kView = v))}>{l}</button>
          ))}
        </div>
        {S.kView !== 'cal' && <p className="ccount">{S.kView === 'hist' ? `입은 코디 ${S.history.length}개` : `저장한 코디 ${S.saved.length}개`}</p>}
        {S.kView === 'cal' && <Month />}
        {S.kView === 'saved' && <SavedList />}
        {S.kView === 'hist' && <HistList />}
      </div>
    </section>
  )
}

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

function Day() {
  const d = calSel, ago = agoOf(d), w = wornOn(d), pl = ago <= 0 ? planOn(d) : null
  const pair = (ids: number[]) => (
    // 지운 옷 등으로 id에 맞는 옷이 없으면 그 칸은 건너뛴다 (없는 옷을 그리려다 화면 전체가 멈추지 않게)
    <div className="pair">{ids.map((id) => { const it = byId(id); return it && <div className="slot" key={id}><Ph item={it} label={it.cat} /><p className="cap">{it.name}</p></div> })}</div>
  )
  return (
    <div className="calday">
      {w ? <><p className="k">입은 코디</p>{pair(w.ids)}</>
        : pl ? <><p className="k pink">입을 코디</p>{pair(pl.ids)}
            <div className="row2"><button className="btn" onClick={() => planSheet(d)}>다른 코디로 바꾸기</button>
              <button className="btn" onClick={() => { S.plans.splice(S.plans.indexOf(pl), 1); toast('계획을 지웠어요'); emit() }}>계획 지우기</button></div></>
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
                <span className="thumbs">{x.ids.map((id) => <span className="ph" key={id}>{byId(id)!.img && <img src={byId(id)!.img} alt="" />}</span>)}</span>
                <p>{x.ids.map((id) => byId(id)!.name).join(' + ')}</p>
              </button>
            ))}
          </div>
        ) : <p className="note" style={{ padding: '8px 0 16px' }}>아직 저장한 코디가 없어요. 홈에서 코디를 맞추고 "저장"을 눌러 보세요</p>}
      </>
    )
  }, true)
}

function SavedList() {
  const nav = useNavigate()
  const [wornIds, setWorn] = useState<number[]>([])
  if (!S.saved.length) return <div className="saved"><div className="empty">아직 저장한 코디가 없어요<br /><button className="btn" style={{ marginTop: 16, padding: '0 18px' }} onClick={() => nav('/')}>코디 맞춰 보기</button></div></div>
  return (
    <div className="saved">
      {S.saved.map((o, i) => {
        const ps = lookIds(o).map((x) => byId(x)).filter(Boolean) as Item[], m = matchText(ps), rec = ps.filter(isRecent)
        const done = wornIds.includes(o.id)
        return (
          <div className="so" key={o.id}>
            <div className="meta"><p className="nm">{ps.map((p) => p.name).join(' + ')}</p><p className="dt">{o.at}</p></div>
            <div className="pair">{ps.map((p) => <div className="slot" key={p.id}><Ph item={p} label={p.cat} /><p className="cap">{p.cat}</p></div>)}</div>
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

function HistList() {
  if (!S.history.length) return <div className="hist" style={{ marginTop: 8 }}><div className="empty">아직 입은 코디가 없어요</div></div>
  return (
    <div className="hist" style={{ marginTop: 8 }}>
      {S.history.map((h, i) => (
        <div className="hrow2" key={i}>
          <div className="thumbs">{h.ids.map((id) => <Ph key={id} item={byId(id)} />)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><p className="d">{dayLabel(h.ago)}</p><p className="n">{h.ids.map((id) => byId(id)!.name).join(' + ')}</p></div>
          <div className="hacts"><button className="link" onClick={() => editHist(h)}>고치기</button><button className="link" onClick={() => writeSheet(h)}>올리기</button></div>
        </div>
      ))}
    </div>
  )
}

/* 입은 기록 고치기: 안 입은 옷은 빼고, 그날 통째로 안 입었으면 기록을 지움 */
function editHist(h: Hist) {
  let ids = [...h.ids]
  const finish = (msg: string) => {
    const before = [...h.ids]
    if (ids.length) h.ids = ids; else S.history.splice(S.history.indexOf(h), 1)
    ;[...new Set([...before, ...ids])].forEach(recalcWorn)
    if (h.ago === 0) S.chosenKey = null
    closeAll(); toast(msg)
  }
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
          <button className="btn" onClick={() => openModal(() => (
            <>
              <h3>{dayLabel(h.ago)} 기록을 지울까요?</h3><p className="sub">옷마다 마지막으로 입은 날도 이 기록 전으로 돌아가요</p>
              <div className="col" style={{ marginTop: 18 }}><button className="btn solid" onClick={() => { ids = []; finish('입은 기록을 지웠어요') }}>지우기</button><button className="btn" onClick={closeModal}>취소</button></div>
            </>
          ))}>이날 안 입었어요</button>
          <button className="btn solid" onClick={() => finish(ids.length ? '입은 기록을 고쳤어요' : '입은 기록을 지웠어요')}>저장</button>
        </div>
      </>
    )
  })
}
