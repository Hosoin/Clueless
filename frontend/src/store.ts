// 앱 상태와 규칙을 한곳에 모음 (프로토타입의 전역 변수·함수를 그대로 옮김).
// 화면은 useApp()으로 상태를 읽고, 바꾼 뒤에는 emit()을 불러 다시 그린다.
import { useSyncExternalStore } from 'react'
import { CMTS, COLORS, ME, MY_CMTS, TRENDS, seedHistory, seedItems, seedOutfits, seedPosts, seedSaved } from './data/seed'
import type { Comment, Hist, Item, Look, Outfit, Plan, Post, Saved } from './data/types'

/** 예시 댓글 한 줄([작성자, 내용, 언제, 좋아요, 답글])을 Comment로 바꾼다 */
const toCmt = (x: (typeof CMTS)[number]): Comment => ({ u: x[0], t: x[1], ago: x[2], likes: x[3] || 0, liked: false, replies: (x[4] || []).map((r) => ({ u: r[0], t: r[1], ago: r[2], likes: r[3] || 0, liked: false, replies: [] })) })
/** 글을 만들 때 댓글 목록을 채운다 (내 글은 MY_CMTS, 남의 글은 CMTS 예시 댓글).
 *  전에는 글 화면을 그리는 도중에 채웠는데, 그리는 중에 상태를 바꾸지 않으려고 글을 만드는 곳으로 옮겼다 (코드 리뷰 23번).
 *  새로 올린 내 글도 예전처럼 예시 댓글로 시작한다. 결과: 같은 글 객체 */
export function withComments<T extends Post>(p: T): T {
  if (!p.cmList) p.cmList = (p.mine ? MY_CMTS : CMTS).map(toCmt)
  return p
}

/* ---------- 상태 ---------- */
export const S = {
  items: seedItems(),
  outfits: seedOutfits(),
  saved: seedSaved(),
  history: seedHistory(),
  plans: [] as Plan[],
  posts: seedPosts().map(withComments),
  me: { ...ME, photo: null as string | null }, // photo: 프로필 사진 (없으면 닉네임 첫 글자)
  pref: { mode: 'trend' as 'trend' | 'taste', styles: [] as string[] },
  loggedIn: false,
  onboarded: false,
  RECENT: 3, // 이 날수 안에 입은 옷은 추천에서 뺌
  defScope: '전체 공개',
  cmpOn: true, // 커뮤니티 글에 내 옷장 비교 표시
  followingSet: new Set(['mina.closet', 'hyun.wear']),
  liked: new Set<number>(),
  savedPosts: new Set([4]),
  // 홈
  oi: 0,
  pos: { t: 0, m: 0, j: 0, o: 0, b: 0 } as Record<RowKey, number>,
  on: { m: false, j: false, o: true } as Record<ExtraKey, boolean>,
  fresh: true,
  view: 'rows' as 'rows' | 'avatar',
  chosenKey: null as string | null,
  spinning: false,
  spinKeys: new Set<RowKey>(),
  // 화면별 보기 상태 (탭을 옮겨 다녀도 유지)
  kView: 'cal' as 'cal' | 'saved' | 'hist',
  cView: 'items' as 'items' | 'ex',
  cTab: '전체',
  cColor: null as string | null,
  cSort: 0,
  cmTab: '인기',
  chOnly: false,
  myTab: 'posts' as 'posts' | 'saved',
  postFrom: 'community' as string, // 글 보기에서 돌아갈 화면
  curPost: 0,
  loginBack: '/' as string, // 로그인 뒤 돌아갈 화면
  ob: null as null | { step: 'mode' | 'taste' | 'nick'; mode: 'trend' | 'taste'; styles: string[]; nick: string },
  uid: 100,
  sid: 9,
  pid: 200,
}

let version = 0
const subs = new Set<() => void>()
/** 상태를 바꾼 뒤 부른다. 다시 그리기 전에 홈 줄의 위치(S.pos)를 줄 길이에 맞춘다.
 *  옷을 지우거나 추천에서 빼거나 최근 입은 옷 거르기가 바뀌면 줄이 짧아질 수 있어서다.
 *  전에는 홈을 그리는 도중에 맞췄다 (코드 리뷰 23번) */
export const emit = () => { clampPos(); version++; subs.forEach((f) => f()) }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
/** 상태가 바뀌면 다시 그려지게 함 */
export const useApp = () => { useSyncExternalStore(subscribe, () => version); return S }

/* ---------- 공통 ---------- */
export const byId = (id?: number | null) => (id ? S.items.find((i) => i.id === id) : undefined)
/**
 * 옷장에서 보여 줄 옷 이름: 별명이 있으면 별명, 없으면 원래 이름.
 * 별명은 내 옷장에서 알아보기 쉽게 붙이는 이름이라 옷장 화면(카드·크게 보기)에서만 쓰고,
 * 홈·캘린더·커뮤니티는 다른 사람도 알아볼 수 있게 원래 이름(name)을 그대로 쓴다.
 */
export const displayName = (it: Item) => it.alias || it.name
export const hexOf = (it: Item) => it.hex || COLORS[it.color] || '#CCCCCC'
export const isRecent = (it?: Item | null) => !!it && it.lastWorn !== null && it.lastWorn <= S.RECENT
export const wornDate = (n: number) => {
  const t = new Date(); t.setDate(t.getDate() - n)
  return (t.getFullYear() !== new Date().getFullYear() ? `${t.getFullYear()}년 ` : '') + `${t.getMonth() + 1}월 ${t.getDate()}일`
}
/* 조사 고르기: 앞 말의 마지막 글자 받침을 보고 고른다. 조사가 필요한 문구는 모두 여기 함수를 쓴다 (코드 리뷰 24번).
   한글이 아닌 글자(영어 아이디, 숫자 등)로 끝나면 받침이 없는 것으로 보고 '는/가/를/로'를 붙인다. */
/** 마지막 글자의 받침 번호. 0 = 받침 없음, 8 = ㄹ. 한글(가~힣)이 아니면 0 */
const jongOf = (w: string) => {
  const code = w.charCodeAt(w.length - 1) - 0xac00
  return code >= 0 && code <= 11171 ? code % 28 : 0
}
export const eun = (w: string) => (jongOf(w) ? '은' : '는')
export const iga = (w: string) => (jongOf(w) ? '이' : '가')
export const eulreul = (w: string) => (jongOf(w) ? '을' : '를')
/** '으로/로'. ㄹ 받침도 '로'다 (예: 니트로, 데님으로, 팔로워만으로, 원피스 한 벌로) */
export const euro = (w: string) => { const j = jongOf(w); return j === 0 || j === 8 ? '로' : '으로' }
const when = (it: Item) => (it.lastWorn === 0 ? '오늘' : it.lastWorn === 1 ? '어제' : `${wornDate(it.lastWorn!)}에`)
export const wornNote = (it: Item) => `${it.name}${eun(it.name)} ${when(it)} 입었어요`
export const worn = (it: Item) => (it.lastWorn === null ? '아직 안 입음' : it.lastWorn === 0 ? '오늘 입음' : it.lastWorn === 1 ? '어제 입음' : `${wornDate(it.lastWorn)} 입음`)
export const dayLabel = (n: number) => (n === 0 ? '오늘' : n === 1 ? '어제' : wornDate(n))
export const trendOf = (it?: Item | null) => !!it && it.tags.some((t) => TRENDS.find((x) => x.k === t && x.up))
export const forgotten = (it?: Item | null) => !!it && (it.lastWorn === null || it.lastWorn >= 90)
export const wornKey = (it: Item) => (it.lastWorn === null ? 99999 : it.lastWorn)

export function matchText(list: (Item | null | undefined)[]) {
  const l = list.filter(Boolean) as Item[]
  const hit = l.some(trendOf)
  return { hit, t: hit ? '요즘 유행과 잘 어울려요' : '무난하게 입기 좋은 조합이에요' }
}

/* ---------- 겹쳐 입기: t 상의(속) → m 덧입기 → j 재킷 → o 코트·패딩, b 하의 ---------- */
export type RowKey = 't' | 'm' | 'j' | 'o' | 'b'
export type ExtraKey = 'm' | 'j' | 'o'
export const K: RowKey[] = ['t', 'm', 'j', 'o', 'b']
export const EXTRA: ExtraKey[] = ['m', 'j', 'o']
export const NAME: Record<RowKey, string> = { t: '상의', m: '덧입기', j: '아우터', o: '아우터', b: '하의' } // 재킷·코트는 화면에서 모두 '아우터'
export const rowKey = (it: Item): RowKey => (it.cat === '하의' ? 'b' : it.cat === '덧입기' ? 'm' : it.cat === '아우터' ? (/코트|패딩/.test(it.name) ? 'o' : 'j') : 't')
export const TEMP = 9
export const layersFor = (t: number) => (t >= 15 ? 1 : t >= 5 ? 2 : 3) // 기온별로 상의 위에 겹쳐 입기 좋은 겹 수

export const lookIds = (o: Look) => [o.top, o.mid, o.jacket, o.outer, o.bottom]
export const parts = (o: Look) => lookIds(o).map((id) => byId(id) || null)
// 오늘 고른 옷(0일)은 빼지 않고, 어제부터 RECENT일 안에 입은 옷만 뺌
export const isPast = (it?: Item | null) => !!it && it.lastWorn !== null && it.lastWorn >= 1 && it.lastWorn <= S.RECENT
const recentIn = (o: Look) => parts(o).filter(isPast)
export function firstFresh(from: number) {
  const n = S.outfits.length
  for (let k = 0; k < n; k++) { const i = (from + k) % n; if (!recentIn(S.outfits[i]).length) return i }
  return from % n
}
export const pool = (k: RowKey) => S.items.filter((i) => rowKey(i) === k && !i.ex && !(S.fresh && isPast(i)))
export const lists = () => Object.fromEntries(K.map((k) => [k, pool(k)])) as Record<RowKey, Item[]>
export type Combo = Record<RowKey, Item | null> & { dress: boolean }
export function current(): Combo {
  const L = lists(), t = L.t[S.pos.t] || null, dress = !!t && t.cat === '원피스'
  const c = { t, dress, b: dress ? null : L.b[S.pos.b] || null, m: null, j: null, o: null } as Combo
  EXTRA.forEach((k) => (c[k] = S.on[k] ? L[k][S.pos[k]] || null : null))
  return c
}
export const comboKey = (c: Combo) => K.map((k) => (c[k] ? c[k]!.id : 0)).join('-')
export const outfitKey = (o: Look) => lookIds(o).map((x) => x || 0).join('-')
export const wearList = (c: Combo) => K.map((k) => c[k]).filter(Boolean) as Item[]
export const comboToLook = (c: Combo): Look => ({ top: c.t?.id ?? null, mid: c.m?.id ?? null, jacket: c.j?.id ?? null, outer: c.o?.id ?? null, bottom: c.b?.id ?? null })
export function clampPos() { const L = lists(); for (const k of K) S.pos[k] = Math.max(0, Math.min(S.pos[k], L[k].length - 1)) }

/**
 * i번째 추천 코디로 홈의 줄(S.pos, S.on)을 맞춘다.
 * 겹옷 줄(덧입기·재킷·코트)은 코디의 옷이 그 줄에 실제로 있을 때만 켠다.
 * 추천에서 뺀 옷은 줄에서 빠지므로, 그 옷을 가리키는 겹을 그대로 켜면 "옷이 없어요"만 뜬 하얀 칸이 생겨서
 * (예: 덧입기가 한 벌뿐인데 그 옷을 뺀 경우). 뺀 옷이 든 코디를 어떻게 다시 짤지는 추천 서버(ML)가 정할 일이라
 * 여기서는 화면에 빈 칸만 생기지 않게 한다.
 */
export function applyOutfit(i: number) {
  S.oi = i; const o: Outfit = S.outfits[i]
  if (S.fresh && recentIn(o).length) S.fresh = false // 추천 코디에 최근 입은 옷이 있으면 그대로 보여 줌
  const L = lists(), at = (arr: Item[], id: number) => Math.max(0, arr.findIndex((x) => x.id === id))
  const inRow = (k: ExtraKey, id?: number | null) => !!id && L[k].some((x) => x.id === id)
  S.on.m = inRow('m', o.mid); S.on.j = inRow('j', o.jacket); S.on.o = inRow('o', o.outer)
  const ids: Record<RowKey, number | null | undefined> = { t: o.top, m: o.mid, j: o.jacket, o: o.outer, b: o.bottom }
  K.forEach((k) => { const id = ids[k]; if (id) S.pos[k] = at(L[k], id) })
  appliedKey = comboKey(current())
}
/**
 * 마지막으로 맞춘 추천 코디가 화면 줄에 실제로 놓인 모양(comboKey).
 * 홈은 "지금 줄이 추천 코디 그대로인지"를 보고 버튼을 '다음 추천 코디'로 바꾸는데,
 * 추천 코디 원본(outfitKey)과 비교하면 뺀 옷이 든 코디는 줄 모양이 원본과 달라 영영 '같지 않음'이 된다.
 * 그러면 버튼이 계속 '추천 코디로 맞추기'로 남아 같은 코디만 반복해서 맞췄다. 그래서 실제로 놓인 모양을 기억해 비교한다.
 * 화면 그리기 상태가 아니라 비교용 값이라 S에 넣지 않고 모듈 안에만 둔다.
 */
let appliedKey = ''
/** 지금 홈 줄(c)이 마지막으로 맞춘 추천 코디 그대로인지 */
export const showsOutfit = (c: Combo) => comboKey(c) === appliedKey
/**
 * 옷을 추천에서 빼거나 되돌린 직후 홈의 줄을 정리한다.
 * 켜져 있던 겹옷 줄에 남은 옷이 없으면 끄고(하얀 '옷이 없어요' 칸 방지), 줄마다 고른 위치가 줄 길이를 넘지 않게 맞춘다.
 * 지금 고른 다른 옷은 그대로 둔다.
 */
export function tidyRows() {
  const L = lists()
  EXTRA.forEach((k) => { if (S.on[k] && !L[k].length) S.on[k] = false })
  clampPos()
}
/** 커뮤니티 따라 입기 등: 지정한 옷으로 줄을 맞춤 */
export function setCombo(ids: number[]) {
  S.fresh = false
  EXTRA.forEach((k) => (S.on[k] = false))
  const L = lists()
  ids.forEach((id) => {
    const it = byId(id); if (!it) return
    const k = rowKey(it), i = L[k].findIndex((x) => x.id === id)
    if (i >= 0) S.pos[k] = i
    if ((EXTRA as RowKey[]).includes(k)) S.on[k as ExtraKey] = true
  })
}
/** 줄 구성(겹 수, 최근 입은 옷 빼기 등)을 바꿔도 지금 고른 옷은 그대로 둠 */
export function keepSel(fn: () => void) {
  const c = current(); fn()
  const L = lists()
  for (const k of K) { const it = c[k]; if (it) { const i = L[k].findIndex((x) => x.id === it.id); if (i >= 0) S.pos[k] = i } }
  emit()
}

/* 지금 고른 다른 옷과 얼마나 어울리는지: 색, 유행, 오래 안 입은 옷, 최근 입은 옷 */
const NEUTRAL = ['화이트', '아이보리', '베이지', '블랙', '차콜', '그레이', '네이비', '데님', '카멜', '브라운']
export function fit(it: Item, k: RowKey, c: Combo) {
  const others = K.filter((x) => x !== k).map((x) => c[x]).filter(Boolean) as Item[]
  let sc = 0, why = ''
  const bright = (x: Item) => !NEUTRAL.includes(x.color)
  if (bright(it) && others.some(bright)) sc -= 2; else if (!bright(it)) sc += 1
  if (trendOf(it)) { sc += 2; why = why || '요즘 유행' }
  if (forgotten(it)) { sc += 1; why = why || '오래 안 입은 옷' }
  if (isPast(it)) { sc -= 3; why = `${dayLabel(it.lastWorn!)} 입었어요` }
  if (!why) why = sc >= 2 ? '잘 어울려요' : ''
  return { sc, why }
}
export function ranked(k: RowKey) { // 같은 점수면 옷장 순서
  const L = lists(), c = current()
  return L[k].map((it, i) => ({ it, i, f: fit(it, k, c) })).sort((a, b) => b.f.sc - a.f.sc || a.i - b.i).map((x) => x.it)
}
/** 화살표·밀기: 잘 어울리는 옷부터, 끝에서 처음으로 돌아감 */
export function stepFit(k: RowKey, d: number) {
  const L = lists(), r = ranked(k), cur = L[k][S.pos[k]], n = r.length; if (n < 2) return
  const i = r.indexOf(cur)
  S.pos[k] = L[k].indexOf(r[(i + d + n) % n])
  emit()
}

/* ---------- 입기·기록 ---------- */
export function logWear(ps: (Item | null | undefined)[]) {
  const ids = (ps.filter(Boolean) as Item[]).map((x) => x.id)
  const today = S.history.find((h) => h.ago === 0)
  if (today) today.ids = ids; else S.history.unshift({ ago: 0, ids })
}
export function wearToday(ps: Item[]) {
  ps.forEach((it) => { if (it.prevWorn === undefined) it.prevWorn = it.lastWorn; it.lastWorn = 0 })
  logWear(ps)
}
/** 입은 기록을 고치면 옷마다 마지막으로 입은 날을 다시 계산 */
export function recalcWorn(id: number) {
  const it = byId(id); if (!it) return
  const hs = S.history.filter((h) => h.ids.includes(id))
  it.lastWorn = hs.length ? Math.min(...hs.map((h) => h.ago)) : it.prevWorn !== undefined ? it.prevWorn : null
  if (!hs.some((h) => h.ago === 0)) delete it.prevWorn
}
export function saveLook(next: Look) {
  const dup = S.saved.some((q) => outfitKey(q) === outfitKey(next))
  if (!dup) { const n = new Date(); S.saved.unshift({ id: ++S.sid, ...next, at: `${n.getMonth() + 1}월 ${n.getDate()}일` } as Saved) }
  return dup
}

/** 옷 삭제: 추천 코디·저장한 코디·입은 기록·입을 계획에서도 함께 빠짐 */
export function deleteItem(it: Item) {
  const id = it.id, i = S.items.indexOf(it); if (i < 0) return
  S.items.splice(i, 1)
  const F = ['top', 'mid', 'jacket', 'outer', 'bottom'] as const
  for (let k = S.outfits.length - 1; k >= 0; k--) { // 상의·하의가 빠진 추천 코디는 없애고, 겹옷만 빠지면 그 겹만 비움
    const o = S.outfits[k]
    if ((o.top === id || o.bottom === id) && S.outfits.length > 1) S.outfits.splice(k, 1)
    else F.forEach((f) => { if (o[f] === id) o[f] = null })
  }
  S.oi = Math.min(S.oi, S.outfits.length - 1)
  for (let k = S.saved.length - 1; k >= 0; k--) { const o = S.saved[k]; F.forEach((f) => { if (o[f] === id) o[f] = null }); if (!F.some((f) => o[f])) S.saved.splice(k, 1) }
  for (let k = S.history.length - 1; k >= 0; k--) { const h: Hist = S.history[k]; h.ids = h.ids.filter((x) => x !== id); if (!h.ids.length) S.history.splice(k, 1) }
  // 입을 계획(캘린더)에서도 뺀다. 남겨 두면 캘린더가 지운 옷을 찾다가 멈춤. 옷이 하나도 안 남은 계획은 지운다
  for (let k = S.plans.length - 1; k >= 0; k--) { const p: Plan = S.plans[k]; p.ids = p.ids.filter((x) => x !== id); if (!p.ids.length) S.plans.splice(k, 1) }
  S.chosenKey = null
  emit()
}

/* ---------- 캘린더 ---------- */
export const dkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const startOfToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }
/** 오늘 0시. 앱을 켜 둔 채 자정이 지나면 rollDay()가 새 날로 바꾼다 (let이라 불러 쓰는 쪽도 바뀐 값을 본다) */
export let TODAY0 = startOfToday()
export const agoOf = (d: Date) => Math.round((TODAY0.getTime() - d.getTime()) / 86400000)

/** 날짜가 바뀌었으면 오늘을 새 날로 옮기고, "며칠 전"으로 저장한 값을 지난 날 수만큼 늘린다.
 *  입은 기록(Hist.ago)과 마지막으로 입은 날(lastWorn, prevWorn)은 오늘 기준 며칠 전이라서,
 *  오늘만 바꾸면 어제 입은 옷이 계속 "오늘 입음"으로 남는다. 계획(Plan)은 날짜로 저장해서 그대로 둔다.
 *  결과: 날짜가 바뀌었으면 true (화면을 다시 그림) (코드 리뷰 19번) */
export function rollDay(): boolean {
  const now = startOfToday()
  const days = Math.round((now.getTime() - TODAY0.getTime()) / 86400000)
  if (days <= 0) return false
  TODAY0 = now
  S.history.forEach((h) => { h.ago += days })
  S.items.forEach((it) => {
    if (it.lastWorn !== null) it.lastWorn += days
    if (typeof it.prevWorn === 'number') it.prevWorn += days
  })
  S.chosenKey = null // "오늘 코디로 정했어요"는 어제 일이 됨
  emit()
  return true
}
// 1분마다, 그리고 앱으로 돌아왔을 때(폰에서 다른 앱을 쓰다 돌아오거나 탭을 다시 볼 때) 날짜가 바뀌었는지 확인한다
setInterval(rollDay, 60_000)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') rollDay() })
export const wornOn = (d: Date) => S.history.find((h) => h.ago === agoOf(d))
export const planOn = (d: Date) => S.plans.find((p) => p.date === dkey(d))
;(() => { const d = new Date(TODAY0); d.setDate(d.getDate() + 2); S.plans.push({ date: dkey(d), ids: [2, 7, 10] }) })() // 예시: 모레 입을 코디

/* ---------- 커뮤니티 ---------- */
export const owned = (p: Post) => p.wear.filter((w) => w[2] && byId(w[2])).length
// 앞의 기호·숫자를 모두 지우고 첫 글자를 쓴다 (g가 없으면 앞 기호를 하나만 지웠다, 코드 리뷰 24번)
export const ini = (u: string) => (u || '?').replace(/[^a-z가-힣]/gi, '').slice(0, 1).toUpperCase()

/* 처음엔 돌리지 않고 추천 코디 1번을 바로 보여 줌 */
applyOutfit(firstFresh(0))
