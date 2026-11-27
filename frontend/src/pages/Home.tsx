// 홈: 오늘의 코디를 돌려 맞추고, 아래로 내리면 트렌드 (담당: A)
// - 제목 아래 스타일 칩(추천·미니멀·캐주얼…)으로 원하는 스타일을 고르면 추천 이유 문구가 그 스타일로 바뀐다
// - 아래 버튼: [다음 추천 코디] / [이 코디로 입을래요][아바타로 보기]
// - [아바타로 보기]를 누르면 같은 화면이 'My Avatar' 보기로 바뀐다 (S.view = 'avatar'). 닫기로 룩북으로 돌아옴
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Arrow, SpinIc, TabIcon } from '../components/Icons'
import { Ph, PhPair } from '../components/Ph'
import { COLORS, STYLES, TRENDS } from '../data/seed'
import type { Item, Look } from '../data/types'
import {
  EXTRA, K, NAME, S, TEMP, applyOutfit, byId, comboKey, current, emit, firstFresh, fit, hexOf,
  isExtra, isPast, isSavedLook, isWornToday, keepSel, layersFor, lists, matchText, present, rowKey, saveLook, showsOutfit, stepFit, useApp,
  wearList, wearToday, worn, wornKey, wornNote, iga, eun, euro, type Combo, type RowKey,
} from '../store'
import { closeAll, openSheet, showIn, toast } from '../ui'

declare global {
  interface Window { renderAvatar?: (el: HTMLElement, outfit: unknown) => void }
}

const rowsOf = (c: Combo): [RowKey, string][] => [
  ['t', c.t ? c.t.cat : '상의'],
  ...EXTRA.filter((k) => S.on[k]).map((k): [RowKey, string] => [k, NAME[k]]),
  ...(c.dress ? [] : [['b', '하의'] as [RowKey, string]]),
]

/** 홈에서 고른 스타일 (null = '추천', 스타일 없이 기본 추천).
 *  탭을 옮겨 다녀도 유지되도록 컴포넌트 밖에 둔다 (트렌드의 tSel과 같은 방식).
 *  지금은 프로토타입이라 추천 이유 문구만 바뀌고, 스타일에 맞춘 실제 추천은 백엔드 연동 때 붙인다 */
let pickedStyle: string | null = null

/** 스타일을 골랐을 때 추천 이유 문구. 예: '미니멀 · 무채색과 깔끔한 선으로 맞춰 봤어요' */
const styleReason = (name: string) => {
  const desc = STYLES.find(([n]) => n === name)?.[1] ?? name
  return `${name} · ${desc}${euro(desc)} 맞춰 봤어요`
}

/** 지금 맞춘 코디를 오늘 입은 옷으로 남기고, 같은 코디면 버튼을 '정했어요'로 바꿔 둔다 */
function chooseToday(c: Combo) {
  wearToday(wearList(c)); S.chosenKey = comboKey(c); toast('오늘 코디로 정했어요. 캘린더에 남겨요'); emit()
}

export default function Home() {
  useApp()
  const scrRef = useRef<HTMLElement>(null)
  const foldRef = useRef<HTMLDivElement>(null)
  // 돌리는 중에 다른 탭으로 가면 타이머를 멈추고 바로 추천 코디에 맞춰 둔다 (나간 뒤에도 emit()이 계속 불리지 않게)
  useEffect(() => () => finishSpin(), []) // finishSpin은 돌릴 때마다 바뀌므로 나가는 시점의 것을 부름
  // 줄 위치(S.pos)는 그리기 전에 store.ts의 emit()이 줄 길이에 맞춰 둔다 (그리는 중에 상태를 바꾸지 않음)
  const L = lists()
  // same: 지금 줄이 마지막으로 맞춘 추천 코디 그대로인지. 뺀 옷이 든 코디도 맞춘 그대로면 같은 코디로 본다 (store.ts showsOutfit)
  const c = current(), o = S.outfits[S.oi], same = showsOutfit(c), rows = rowsOf(c)
  const ps = wearList(c), m = matchText(ps)
  const tr = same ? TRENDS.find((t) => t.k === o.ref) : TRENDS.find((t) => t.up && ps.some((it) => it.tags.includes(t.k)))
  const rec = ps.filter(isPast), hidden = S.fresh ? S.items.filter(isPast).length : 0
  const layers = EXTRA.filter((k) => c[k]).length, okN = layersFor(TEMP)
  const wx = `지금 ${TEMP}°라 상의 위로 ${okN}겹까지 겹쳐 입기 좋아요${layers > okN ? ` (지금 ${layers}겹)` : ''}`
  const note = [rec.length ? wornNote(rec[0]) : hidden ? `최근 ${S.RECENT}일 안에 입은 옷 ${hidden}벌은 빼고 보여드려요` : '', wx].filter(Boolean).join(' · ')
  const isChosen = S.chosenKey === comboKey(c)
  const next = EXTRA.find((k) => !S.on[k] && L[k].length)
  const isAvatar = S.view === 'avatar'
  // 추천 이유: 돌리는 중 → 안내, 추천 코디 그대로 → (스타일을 골랐으면 스타일 문구, 아니면 추천 이유), 직접 바꿨으면 → 어울림 판단
  const why = S.spinning ? '옷장을 돌려 오늘의 코디를 찾는 중이에요' : same ? (pickedStyle ? styleReason(pickedStyle) : o.reason) : m.t
  const setView = (v: typeof S.view) => { S.view = v; scrRef.current?.scrollTo(0, 0); emit() }
  // 룩북과 아바타 보기에서 같이 쓰는 '이 코디로 입을래요' 버튼.
  // 돌아가는 중(S.spinning)에도 막는다. 안 막으면 지나가던 아무 코디나 오늘 입은 기록과 chosenKey에 남고,
  // 돌기가 끝나 줄이 추천 코디로 바뀐 뒤에도 캘린더에는 틀린 코디가 그대로 남는다 (코드 리뷰 11/27 1번)
  const wearBtn = (
    <button className="btn" disabled={isChosen || S.spinning} onClick={() => chooseToday(c)}>{isChosen ? '오늘 코디로 정했어요' : '이 코디로 입을래요'}</button>
  )

  /* 첫 화면 한 장(아래 탭을 뺀 높이)에 코디 사진과 버튼이 모두 들어오게.
     높이는 창 크기와 하단 탭 높이에 달려 있어서, 홈에 들어올 때 한 번 맞추고 그 뒤로는 창 크기나 탭 높이가 바뀔 때만 다시 맞춘다.
     의존성 배열([])이 없으면 코디를 돌리는 동안(약 45ms마다 다시 그림) 매번 resize 감지를 뗐다 다시 걸고 높이를 다시 계산했다 */
  useLayoutEffect(() => {
    const fit = () => {
      const scr = scrRef.current, fold = foldRef.current; if (!scr || !fold) return
      const navh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--navh')) || 66
      fold.style.height = Math.max(520, scr.clientHeight - navh) + 'px'
    }
    fit()
    window.addEventListener('resize', fit)
    window.visualViewport?.addEventListener('resize', fit)
    // 하단 탭 높이(--navh)가 바뀌어도 다시 맞춘다. 홈이 처음 그려질 때는 Layout이 아직 탭 높이를 재기 전이라 (자식의 이 effect가
    // 부모의 effect보다 먼저 돎) 기본값 66px로 계산되므로, Layout이 탭 높이를 잰 뒤 보내는 'navh' 이벤트로 한 번 더 맞춘다
    window.addEventListener('navh', fit)
    return () => { window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit); window.removeEventListener('navh', fit) }
  }, [])

  // 화보 배치: 가장 바깥 아우터를 왼쪽에 크게, 나머지는 오른쪽에 위에서부터 (아우터가 없으면 상의가 크게)
  const order = rows.map(([k]) => k)
  const bigK: RowKey = order.includes('o') ? 'o' : order.includes('j') ? 'j' : 't'
  const rest = order.filter((k) => k !== bigK)
  // 돌아가는 중에는 화살표·밀기·빼기를 막는다. 돌기는 시작할 때 잡아 둔 줄 위치·목록으로 멈출 자리를 정하므로,
  // 중간에 줄을 바꾸면 멈춘 자리가 추천 코디가 아닐 수 있다 (코드 리뷰 11/27 1번)
  const piece = (k: RowKey, big = false) => (
    <Piece key={k} k={k} item={c[k]} big={big} canStep={L[k].length > 1 && !S.spinning} rolling={S.spinKeys.has(k)}
      off={isExtra(k) ? () => keepSel(() => { S.on[k] = false }) : undefined} />
  )

  return (
    <section className="screen on" id="s-home" ref={scrRef}>
      <div id="h-fold" ref={foldRef} className="pad">
        {isAvatar ? (
          <div className="hhead">
            <div className="h1row avhead">
              <h1>My <i>Avatar</i></h1>
              <button className="link" onClick={() => setView('rows')}>닫기</button>
            </div>
            <p className="avsub">홈에서 고른 코디를 입혀 봤어요. 여기서 바꾸면 홈 코디도 같이 바뀌어요</p>
          </div>
        ) : (
          <div className="hhead">
            <div className="h1row">
              <h1>Today’s <i>Look</i></h1>
              <span className="hcount2">{S.spinning ? '맞추는 중' : same ? <><b>{String(S.oi + 1).padStart(2, '0')}</b> / {String(S.outfits.length).padStart(2, '0')}</> : null}</span>
            </div>
            <p className="hstyle-k">STYLE · 원하는 스타일로 추천받기</p>
            {/* 스타일 칩: 첫 칸 '추천'은 스타일을 고르지 않은 기본 추천 */}
            <div className="scroller hstyle">
              {[null, ...STYLES.map(([n]) => n)].map((st) => (
                <button key={st ?? '추천'} className={`pill ${pickedStyle === st ? 'on' : ''}`} aria-pressed={pickedStyle === st}
                  onClick={() => { pickedStyle = st; emit() }}>{st ?? '추천'}</button>
              ))}
            </div>
          </div>
        )}
        {!isAvatar ? (
          <div className={`look ${rest.length ? '' : 'one'} ${S.spinning ? 'spinning' : ''}`} style={{ gridTemplateRows: `repeat(${Math.max(1, rest.length)}, minmax(0, 1fr))` }}>
            {piece(bigK, true)}
            {rest.map((k) => piece(k))}
          </div>
        ) : (
          <>
            <Avatar c={c} />
            <div className="arows">
              {rows.map(([k, label]) => (
                <div className="arow" key={k}>
                  <p className="k">{label}{isExtra(k) && <button className="link xs" onClick={() => keepSel(() => { S.on[k] = false })}>빼기</button>}</p>
                  <button className="n pickname" onClick={() => openPicker(k)}>{c[k] ? c[k]!.name : '없음'} <span>고르기</span></button>
                  <button className="arrow" aria-label={`이전 ${label}`} disabled={L[k].length <= 1} onClick={() => stepFit(k, -1)}><Arrow dir={-1} /></button>
                  <button className="arrow" aria-label={`다음 ${label}`} disabled={L[k].length <= 1} onClick={() => stepFit(k, 1)}><Arrow dir={1} /></button>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="why">
          <p>{why}</p>
          {/* 겹쳐 입기·아래 토글도 줄 구성을 바꾸므로 돌아가는 중에는 막는다 (코드 리뷰 11/27 1번) */}
          {next && <button className="link" disabled={S.spinning} onClick={() => keepSel(() => { S.on[next] = true; S.pos[next] = 0 })}>+ 겹쳐 입기</button>}
        </div>
        {isAvatar ? (
          // 아바타 보기에서는 입기 버튼 하나만 (디자인 2-3)
          <div className="hdock2">{wearBtn}</div>
        ) : (
          <div className="hdock2">
            <button className="btn full spinbtn" id="h-spin" disabled={S.spinning} onClick={() => spinTo(same ? firstFresh(S.oi + 1) : S.oi)}>
              <SpinIc /><span>{S.spinning ? '맞추는 중' : same ? '다음 추천 코디' : '추천 코디로 맞추기'}</span>
            </button>
            <div className="row2">
              {wearBtn}
              <button className="btn avbtn" disabled={S.spinning} onClick={() => setView('avatar')}><TabIcon name="my" />아바타로 보기</button>
            </div>
          </div>
        )}
      </div>
      {/* 아바타 보기는 한 화면짜리라 아래 설명과 트렌드는 룩북에서만 보여 준다 */}
      {!isAvatar && <>
      <div className="pad hmore">
        <div className="match hm mt0">
          <span className={`dot ${m.hit || S.spinning ? '' : 'grey'}`} />
          <p>{same ? `${o.reason} · ${m.t}` : m.t}</p>
        </div>
        <div className="ref">
          {S.pref.mode === 'taste'
            ? <>내 취향 <b>{S.pref.styles.join('·')}</b>에 맞춰 골랐어요</>
            : tr ? <>참고한 유행 <b>{tr.k}</b> · Google 트렌드 {tr.why}</> : '참고한 유행 없음 · 오래 안 입은 옷 위주로 골랐어요'}
        </div>
        <p className="note">{note}</p>
        <div className="toggles"><button className="tg" aria-pressed={S.fresh} disabled={S.spinning} onClick={() => keepSel(() => { S.fresh = !S.fresh })}>최근 입은 옷 빼고 추천</button></div>
      </div>
      <Trend />
      </>}
    </section>
  )
}

const CAP: Record<RowKey, string> = { t: 'Top', m: 'Layer', j: 'Outer', o: 'Outer', b: 'Bottom' }

/** 화보 한 칸: 누르면 고르기, 좌우로 밀거나 화살표로 바꾸기, 아래에 종류와 이름.
 *  canStep이 false면(옷이 한 벌뿐이거나 코디가 돌아가는 중) 화살표·밀기를 막고, 돌아가는 중에는 '빼기'도 막는다 */
function Piece({ k, item, big, canStep, rolling, off }: { k: RowKey; item: Item | null; big: boolean; canStep: boolean; rolling: boolean; off?: () => void }) {
  const x0 = useRef<number | null>(null), swiped = useRef(false)
  const cap = item?.cat === '원피스' ? 'Dress' : CAP[k]
  return (
    <div className={`pc ${big ? 'big' : ''} ${rolling ? 'rolling' : ''}`}
      onPointerDown={(e) => { x0.current = e.clientX }}
      onPointerUp={(e) => {
        if (x0.current === null) return
        const dx = e.clientX - x0.current; x0.current = null
        if (Math.abs(dx) < 30 || !canStep) return
        swiped.current = true; setTimeout(() => (swiped.current = false), 50)
        stepFit(k, dx < 0 ? 1 : -1)
      }}
      // 누른 채 세로로 스크롤하는 등 브라우저가 누르기를 취소하면 시작 위치를 지운다.
      // 남겨 두면 다음에 살짝 탭할 때 예전 위치와의 차이로 계산돼 옆 옷으로 넘어간다 (코드 리뷰 22번)
      onPointerCancel={() => { x0.current = null }}
      onClickCapture={(e) => { if (swiped.current) e.stopPropagation() }}>
      <button className="ph" aria-label={`${NAME[k]} 고르기`} onClick={() => openPicker(k)}>
        {item?.img && <SpinImg src={item.img} rolling={rolling} />}
        {!item?.img && <p className="lbl">{item ? item.name : '옷이 없어요'}</p>}
      </button>
      <div className="pnav">
        <button aria-label={`이전 ${NAME[k]}`} disabled={!canStep} onClick={() => stepFit(k, -1)}><Arrow dir={-1} /></button>
        <button aria-label={`다음 ${NAME[k]}`} disabled={!canStep} onClick={() => stepFit(k, 1)}><Arrow dir={1} /></button>
      </div>
      <div className="cap"><span>{cap}{off && <button disabled={S.spinning} onClick={off}>빼기</button>}</span><p>{item ? item.name : ''}</p></div>
    </div>
  )
}

/** 돌아가는 줄의 사진은 바뀔 때마다 옆에서 밀려 들어오게 */
function SpinImg({ src, rolling }: { src: string; rolling: boolean }) {
  const ref = useRef<HTMLImageElement>(null), prev = useRef(src)
  useEffect(() => {
    if (prev.current !== src && rolling && ref.current?.animate)
      ref.current.animate([{ transform: 'translateX(38%)', opacity: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 110, easing: 'linear' })
    prev.current = src
  }, [src, rolling])
  return <img ref={ref} src={src} alt="" />
}

/** 아바타: 그리는 일은 public/avatar.js의 window.renderAvatar가 맡음. 줄이 멈출 때만 갈아입힘 */
function Avatar({ c }: { c: Combo }) {
  const ref = useRef<HTMLDivElement>(null)
  const key = S.spinning ? `spin-${S.spinKeys.size}` : comboKey(c)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const f = (it: Item | null) => it ? { id: it.id, name: it.name, category: it.cat, color: it.color, colorHex: hexOf(it), image: it.img || null } : null
    const data = { top: f(c.t), layer: f(c.m), jacket: f(c.j), coat: f(c.o), bottom: f(c.b), isDress: c.dress }
    if (typeof window.renderAvatar === 'function') {
      // 오류 메시지는 HTML로 넣지 않고 글자(textContent)로만 넣는다. 메시지에 데이터가 섞여 있어도 태그로 해석되지 않게 (코드 리뷰 20번)
      try { window.renderAvatar(el, data) } catch (e) {
        const p = document.createElement('p'); p.className = 'avph'; p.textContent = `avatar.js 오류: ${e instanceof Error ? e.message : String(e)}`; el.replaceChildren(p)
      }
    } else el.innerHTML = '<p class="avph">아바타 자리 (avatar.js의 renderAvatar가 아직 없어요)</p>'
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="astage" ref={ref} />
}

/** 돌리기 타이머 id. 화면을 나갈 때 멈추려고 둔다 (돌고 있지 않으면 0) */
let spinTimer = 0
/** 돌리기를 바로 끝낸다: 타이머를 멈추고 줄을 멈출 자리(추천 코디)에 둔다. 돌고 있지 않으면 아무것도 안 함 */
let finishSpin = () => {}

/* 추천 코디로 맞추기: 줄마다 옷이 빠르게 돌다가 위에서부터 차례로 추천 코디에 멈춤 */
function spinTo(i: number) {
  if (S.spinning) return
  const start = { ...S.pos }, onStart = { ...S.on }
  applyOutfit(i)
  const target = { ...S.pos }, onTarget = { ...S.on }
  Object.assign(S.pos, start)
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { Object.assign(S.pos, target); return emit() }
  Object.assign(S.on, onStart) // 도는 동안에는 줄 구성(겹 수)을 그대로 두고, 멈춘 뒤 한 번만 바꿈
  const L = lists()
  const stop: Record<RowKey, number> = { t: 6, m: 7, j: 8, o: 9, b: 10 } // 줄마다 멈추는 차례 (전체 약 1초)
  S.spinning = true
  // 화면을 나갈 때 Home의 useEffect 정리에서 불림. 다시 그리기는 하지 않는다 (홈이 이미 사라지는 중이고, 돌아오면 이 상태로 그려짐)
  finishSpin = () => {
    clearTimeout(spinTimer); spinTimer = 0
    Object.assign(S.pos, target); Object.assign(S.on, onTarget); S.spinning = false; S.spinKeys.clear()
    finishSpin = () => {}
  }
  let tick = 0
  const run = () => {
    tick++
    let done = true
    for (const k of K) {
      const n = L[k].length; if (!n) continue
      if (tick < stop[k] && n > 1) {
        done = false; S.spinKeys.add(k)
        S.pos[k] = (S.pos[k] + 1) % n
        // 도는 동안 줄 수가 바뀌지 않게 원피스는 건너뛴다. 원피스가 연달아 있어도 모두 건너뛰고,
        // 전부 원피스여도 끝없이 돌지 않게 한 바퀴(n칸)까지만 본다 (코드 리뷰 22번)
        if (k === 't') for (let s = 0; s < n && L.t[S.pos.t].cat === '원피스'; s++) S.pos.t = (S.pos.t + 1) % n
      } else { S.pos[k] = target[k]; S.spinKeys.delete(k) }
    }
    if (done) { Object.assign(S.on, onTarget); S.spinning = false; S.spinKeys.clear(); spinTimer = 0; finishSpin = () => {}; emit(); return }
    emit()
    spinTimer = window.setTimeout(run, 45 + tick * 8)
  }
  run()
}

/* 옷장 판에서 바로 고르기 */
let pkColor: string | null = null, pkSort: 'fit' | 'old' = 'fit'
function openPicker(k: RowKey) {
  if (S.spinning) return
  pkColor = null
  openSheet(() => <Picker k={k} />)
}
function Picker({ k }: { k: RowKey }) {
  const L = lists(), c = current(), label = k === 't' ? '상의·원피스' : NAME[k]
  const colors = [...new Set(L[k].map((i) => i.color))]
  let list = L[k].filter((i) => !pkColor || i.color === pkColor).map((it) => ({ it, f: fit(it, k, c) }))
  list = pkSort === 'fit' ? list.sort((a, b) => b.f.sc - a.f.sc) : list.sort((a, b) => wornKey(b.it) - wornKey(a.it))
  const re = () => emit()
  return (
    <>
      <div className="pkhead"><h3>{label} 고르기</h3><button className="link" onClick={closeAll}>닫기</button></div>
      <p>{L[k].length}벌 중에서 골라요{S.fresh && S.items.some((i) => rowKey(i) === k && isPast(i)) ? ` · 최근 ${S.RECENT}일 안에 입은 옷은 빠져 있어요` : ''}</p>
      <div className="scroller pkc">
        <button className={`pill ${pkColor ? '' : 'on'}`} onClick={() => { pkColor = null; re() }}>모든 색</button>
        {colors.map((cl) => <button key={cl} className={`pill ${pkColor === cl ? 'on' : ''}`} onClick={() => { pkColor = cl; re() }}><i style={{ background: COLORS[cl] || '#ccc' }} />{cl}</button>)}
      </div>
      <div className="sorts">
        <button className={pkSort === 'fit' ? 'on' : ''} onClick={() => { pkSort = 'fit'; re() }}>잘 어울리는 순</button><span />
        <button className={pkSort === 'old' ? 'on' : ''} onClick={() => { pkSort = 'old'; re() }}>오래 안 입은 순</button>
      </div>
      {isExtra(k) && <button className="btn full" style={{ margin: '10px 0 0' }} onClick={() => { closeAll(); keepSel(() => { S.on[k] = false }) }}>{label} 빼기</button>}
      <div className="grid3 pkg">
        {list.length ? list.map(({ it, f }) => (
          <button key={it.id} className={`pki ${c[k]?.id === it.id ? 'on' : ''}`} onClick={() => {
            S.pos[k] = lists()[k].findIndex((x) => x.id === it.id)
            if (isExtra(k)) S.on[k] = true
            closeAll()
          }}>
            <Ph item={it} as="span" />
            <span className="n">{it.name}</span><span className={`w ${f.sc >= 2 ? 'pink' : ''}`}>{f.why || worn(it)}</span>
          </button>
        )) : <p className="note">이 색의 옷이 없어요</p>}
      </div>
    </>
  )
}

/* ---------- 홈 아래 트렌드 ---------- */
let tSel = 0, tUp = true, tResult = false

/** 트렌드 코디("이 ○○로 코디 받기")에 함께 붙일 옷 하나를 고른다.
 *  입력: prefer = 원래 짝지어 둔 옷 id, cat = 필요한 종류(상의·하의·아우터)
 *  결과: 붙일 옷 id. 고를 옷이 없으면 null(그 칸은 비운 채로 코디를 만든다)
 *  - 짝지어 둔 옷이 옷장에 그대로 있으면 그 옷을 쓴다. 기본 옷장에서는 화면이 전과 같게 보이도록
 *  - 그 옷이 지워졌거나 추천에서 뺀 옷(ex)이면, 지금 옷장에 남은 같은 종류의 옷으로 바꾼다.
 *    전에는 id를 고정으로 적어서, 지운 옷이 코디에 들어가 저장되고 캘린더에서 byId(id)!가 터질 수 있었다
 *  - 최근 입은 옷은 되도록 피하고, 그런 옷밖에 없으면 그거라도 쓴다.
 *    오늘 입은 옷은 최근 입은 옷으로 치지 않는다(isPast). isRecent(오늘 포함)를 쓰면 트렌드 코디를 입자마자
 *    방금 입은 옷이 '최근 입은 옷'이 되어 코디가 다른 옷으로 바뀌었다. 홈 추천 줄(pool)과 같은 기준이다 */
function pairFor(prefer: number, cat: Item['cat']) {
  const usable = (i?: Item | null): i is Item => !!i && !i.ex && i.cat === cat
  const p = byId(prefer)
  if (usable(p)) return p.id
  const pool = S.items.filter(usable)
  return (pool.find((i) => !isPast(i)) || pool[0])?.id ?? null
}
function Trend() {
  useApp()
  const resultRef = useRef<HTMLDivElement>(null)
  const t = TRENDS[tSel], mine = S.items.filter((i) => i.tags.includes(t.k))
  const short = t.k.split(' ').pop() ?? t.k // 마지막 낱말 (예: 와이드 데님 → 데님)
  const title = mine.length ? (mine.length > 1 ? `내 옷장에 ${t.k}${iga(t.k)} ${mine.length}벌이나 있어요` : `내 옷장에 ${t.k}${iga(t.k)} 1벌 있어요`) : `내 옷장에 아직 ${t.k}${eun(t.k)} 없어요`
  const it = mine.find((x) => !isPast(x)) || mine[0] // 오늘 입은 옷은 빼지 않음 (위 pairFor 설명과 같은 이유)
  // 고른 옷의 종류에 따라 나머지 칸을 채운다. 숫자는 원래 짝지어 둔 옷(6 인디고 와이드 데님, 10 카멜 롱 코트,
  // 1 아이보리 오버핏 니트, 3 블랙 오버핏 니트, 7 블랙 플리츠 스커트, 15 화이트 하이넥 셔링 티, 16 차콜 와이드 슬랙스)이고,
  // 없으면 pairFor가 남은 옷으로 바꾼다. 15·16은 홈 추천 코디(seed.ts)의 뷔스티에 조합과 같은 짝이다
  const look: Look | null = !it ? null
    : it.cat === '상의' ? { top: it.id, bottom: pairFor(6, '하의'), outer: pairFor(10, '아우터') }
    : it.cat === '하의' ? { top: pairFor(1, '상의'), bottom: it.id, outer: pairFor(10, '아우터') }
    : it.cat === '아우터' ? { top: pairFor(3, '상의'), bottom: pairFor(7, '하의'), outer: it.id }
    // 덧입기(뷔스티에·조끼 등)는 상의 위에 겹쳐 입는 옷이라 덧입기 칸(mid)에 두고, 속에 입을 상의와 하의를 채운다.
    // 전에는 원피스와 같은 분기로 가서 상의 칸에 들어가고 하의가 비어, 입기·저장하면 덧입기가 상의로 남았다 (코드 리뷰 11/27 2번)
    : it.cat === '덧입기' ? { top: pairFor(15, '상의'), mid: it.id, bottom: pairFor(16, '하의'), outer: pairFor(10, '아우터') }
    : { top: it.id, bottom: null, outer: pairFor(10, '아우터') } // 원피스는 위아래가 한 벌이라 상의 칸에 두고 하의는 비움
  // 썸네일·입기에 쓰는 옷 목록. 입는 순서(상의 → 덧입기 → 아우터 → 하의)로 둔다. mid를 빼면 덧입기가 화면에 안 보인다
  const ps = look ? ([byId(look.top), byId(look.mid), byId(look.outer), byId(look.bottom)].filter(present)) : []
  const mm = matchText(ps)
  const pick = (i: number) => { tSel = i; tResult = false; emit() }
  // 트렌드 코디를 이미 보여 준 상태인지. 코디 받기를 막 눌렀을 때(false → true)만 그 위치로 스크롤하려고 둔다.
  // tResult는 탭을 옮겨도 남는 모듈 변수라, 처음 값을 false로 두면 홈에 돌아올 때마다 '막 열린 것'으로 보고
  // 트렌드 코디 위치로 스크롤해 버렸다. 그래서 돌아왔을 때 이미 열려 있던 결과는 '보여 준 것'으로 시작한다
  const shown = useRef(tResult)
  // 결과를 열고 닫을 때만 실행한다. 의존성이 없으면 홈이 다시 그려질 때마다(돌리는 중 약 45ms마다) 불렸다 (코드 리뷰 22번)
  useEffect(() => { if (tResult && !shown.current) showIn(resultRef.current); shown.current = tResult }, [tResult]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="tdiv" id="h-trend"><p className="eyebrow">이번 달 유행</p><h2>Trend <i>Forecast</i></h2><p className="lead">한 달 동안 인기가 오를 옷과 내릴 옷이에요</p></div>
      <div className="pad">
        <div className="seg" id="t-seg">
          {[true, false].map((up) => (
            <button key={String(up)} className={tUp === up ? 'on' : ''} onClick={() => { tUp = up; pick(TRENDS.findIndex((x) => x.up === up)) }}>{up ? '상승 랭킹' : '하락 랭킹'}</button>
          ))}
        </div>
        <div className="list mt16">
          {TRENDS.map((x, i) => [x, i] as const).filter(([x]) => x.up === tUp).map(([x, i], rank) => (
            <button key={x.k} className={`li trow ${i === tSel ? 'sel' : ''}`} onClick={() => pick(i)}>
              <p className="num">0{rank + 1}</p><p className="name">{x.k}</p><p className={x.up ? 'up' : 'down'}>{x.up ? '상승' : '하락'}</p>
            </button>
          ))}
        </div>
        <p className="note">Google 트렌드 검색 관심도로 예측했어요</p>
        <div style={{ marginTop: 22 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</p>
          <div className="grid3" style={{ marginTop: 12 }}>
            {mine.length ? mine.slice(0, 3).map((x) => <div key={x.id}><Ph item={x} label={x.name} style={{ height: 104 }} /><p className="cap">{x.name}</p></div>)
              : <div className="empty span-all" style={{ padding: '20px 0' }}>{t.up ? '비슷한 옷으로 코디를 찾아볼게요' : '지금은 다른 옷에 집중해도 좋아요'}</div>}
          </div>
          {mine.length > 0 && t.up && !tResult && <button className="btn solid full mt16" onClick={() => { tResult = true; emit() }}>이 {short}{euro(short)} 코디 받기</button>}
          {tResult && look && (
            <div className="so mt16" ref={resultRef}>
              <div className="meta"><p className="nm">{t.k}{euro(t.k)} 맞춘 코디</p><button className="link" style={{ minHeight: 32 }} onClick={() => { tResult = false; emit() }}>닫기</button></div>
              <PhPair items={ps} caption={(p) => p.cat} />
              <p style={{ margin: 0, fontSize: 13 }}>{ps.map((p) => p.name).join(' + ')}</p>
              <div className="match mt8"><span className={`dot ${mm.hit ? '' : 'grey'}`} /><p>{mm.t}</p></div>
              <TrendActs ps={ps} look={look} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
/** 트렌드 코디 아래 버튼: 오늘 입기, 저장하기. look은 칸이 비어 있을 수 있어서(고를 옷이 없을 때) Look 타입으로 받는다 */
function TrendActs({ ps, look }: { ps: Item[]; look: Look }) {
  // 화면 안 상태로 두면 탭을 옮길 때 풀려서, 오늘 입은 기록·저장한 코디를 보고 그때그때 판단한다
  const wornNow = isWornToday(ps), savedNow = isSavedLook(look)
  return (
    <div className="acts">
      <button className="btn solid" disabled={wornNow} onClick={() => { wearToday(ps); toast('오늘 코디로 정했어요'); emit() }}>{wornNow ? '오늘 코디로 정했어요' : '이 코디로 입을래요'}</button>
      <button className="btn" disabled={savedNow} onClick={() => {
        if (saveLook(look)) return toast('이미 저장한 코디예요')
        toast('저장했어요. 캘린더의 저장한 코디에서 볼 수 있어요'); emit()
      }}>{savedNow ? '저장했어요' : '저장하기'}</button>
    </div>
  )
}

