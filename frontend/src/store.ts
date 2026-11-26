// 앱 상태와 규칙을 한곳에 모음 (프로토타입의 전역 변수·함수를 그대로 옮김).
// 화면은 useApp()으로 상태를 읽고, 바꾼 뒤에는 emit()을 불러 다시 그린다.
import { useSyncExternalStore } from 'react'
import { COLORS, ME, TRENDS, seedHistory, seedItems, seedOutfits, seedPosts, seedSaved } from './data/seed'
import type { Hist, Item, Look, Outfit, Plan, Post, Saved } from './data/types'

/* ---------- 상태 ---------- */
/** 처음 상태의 내 정보와 추천 취향. 앱을 켤 때와 로그아웃할 때(clearMe) 같은 값으로 시작하려고 함수로 둔다 */
const newMe = () => ({ ...ME, photo: null as string | null }) // photo: 프로필 사진 (없으면 닉네임 첫 글자)
const newPref = () => ({ mode: 'trend' as 'trend' | 'taste', styles: [] as string[] })

export const S = {
  items: seedItems(),
  outfits: seedOutfits(),
  saved: seedSaved(),
  history: seedHistory(),
  plans: [] as Plan[],
  posts: seedPosts(),
  me: newMe(),
  pref: newPref(),
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
export const emit = () => { version++; subs.forEach((f) => f()) }
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
const jong = (w: string) => (w.charCodeAt(w.length - 1) - 0xac00) % 28 > 0
export const eun = (w: string) => (jong(w) ? '은' : '는')
export const iga = (w: string) => (jong(w) ? '이' : '가')
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
 * 상의·하의도 추천에서 빠져 줄에 없을 수 있다. 예전에는 이때 줄의 0번째 옷을 골라 코디와 상관없는 옷이 들어갔다
 * (Math.max(0, -1)). 지금은 나머지 옷을 먼저 맞춘 뒤, 그 줄에서 나머지 옷과 가장 잘 어울리는 옷(ranked)으로 대신한다.
 */
export function applyOutfit(i: number) {
  S.oi = i; const o: Outfit = S.outfits[i]
  if (S.fresh && recentIn(o).length) S.fresh = false // 추천 코디에 최근 입은 옷이 있으면 그대로 보여 줌
  const L = lists()
  const inRow = (k: ExtraKey, id?: number | null) => !!id && L[k].some((x) => x.id === id)
  S.on.m = inRow('m', o.mid); S.on.j = inRow('j', o.jacket); S.on.o = inRow('o', o.outer)
  const ids: Record<RowKey, number | null | undefined> = { t: o.top, m: o.mid, j: o.jacket, o: o.outer, b: o.bottom }
  const missing: RowKey[] = [] // 코디에 있지만 줄에서 못 찾은 상의·하의
  K.forEach((k) => {
    const id = ids[k]; if (!id) return
    const at = L[k].findIndex((x) => x.id === id)
    if (at >= 0) S.pos[k] = at
    else if ((k === 't' || k === 'b') && L[k].length) missing.push(k) // 겹옷은 위에서 줄을 껐으니 따로 고를 필요 없음
  })
  // 못 찾은 칸은 나머지 옷과 가장 잘 어울리는 옷으로. 하의가 있는 코디의 상의 자리에 원피스가 오면 하의가 사라지므로 원피스는 건너뜀
  missing.forEach((k) => {
    const best = ranked(k).find((x) => k !== 't' || x.cat !== '원피스' || !o.bottom)
    if (best) S.pos[k] = L[k].indexOf(best)
  })
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
/**
 * 로그아웃한 뒤 앱에 남은 내 정보를 처음 상태로 비운다 (docs/API_CONVENTION.md 4장).
 * 비우지 않으면 다음 사람이 로그인 화면을 거쳐 들어와도 앞 사람의 닉네임·프로필 사진·첫 설정 결과가 그대로 보인다.
 * 첫 설정 여부(onboarded)도 풀어서, 다시 로그인하면 첫 설정부터 한다. 서버 세션과 CSRF 토큰은 api/auth.ts의 logout이 정리한다
 */
export function clearMe() {
  S.me = newMe(); S.pref = newPref()
  S.loggedIn = false; S.onboarded = false; S.ob = null; S.loginBack = '/'
}
/** 커뮤니티 따라 입기 등: 지정한 옷으로 줄을 맞춤. 줄에 없는 옷(추천에서 뺀 옷)은 건너뜀 */
export function setCombo(ids: number[]) {
  S.fresh = false
  EXTRA.forEach((k) => (S.on[k] = false))
  const L = lists()
  ids.forEach((id) => {
    const it = byId(id); if (!it) return
    const k = rowKey(it), i = L[k].findIndex((x) => x.id === id)
    if (i < 0) return // 추천에서 뺀 옷은 줄에 없다. 그 겹옷 줄을 켜면 하얀 '옷이 없어요' 칸만 생기므로 건너뜀
    S.pos[k] = i
    if ((EXTRA as RowKey[]).includes(k)) S.on[k as ExtraKey] = true
  })
}
/**
 * 홈의 줄 목록이 바뀌는 일(fn)을 해도 지금 고른 옷은 그대로 둔다.
 * 홈은 고른 옷을 옷 id가 아니라 줄 안의 순서(S.pos)로 기억한다. 그래서 옷 등록(맨 앞에 끼워 넣음), 삭제, 추천에서 빼기,
 * 최근 입은 옷 빼기 기준 변경처럼 줄 목록이 바뀌면 같은 번호가 다른 옷을 가리켜, 고른 옷이 저절로 바뀌었다.
 * fn 전에 고른 옷을 기억해 두고, fn 뒤에 그 옷을 줄에서 다시 찾아 번호를 맞춘다.
 * 고른 옷이 줄에서 빠졌으면(지웠거나 추천에서 뺀 옷) 찾을 수 없어 번호를 그대로 두고, 그 번호가 줄 길이를 넘거나
 * 겹옷 줄에 남은 옷이 없으면 tidyRows가 정리한다 (하얀 '옷이 없어요' 칸 방지).
 */
export function keepSel(fn: () => void) {
  const c = current(); fn()
  const L = lists()
  for (const k of K) { const it = c[k]; if (it) { const i = L[k].findIndex((x) => x.id === it.id); if (i >= 0) S.pos[k] = i } }
  tidyRows()
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
/**
 * 오늘 입기: ps(입을 옷들)를 오늘 입은 것으로 표시하고, 오늘 기록을 이 코디로 바꾼다.
 * 오늘 이미 다른 코디를 입었다면 그 기록은 덮어쓰인다. 그래서 새 코디에서 빠진 옷은
 * '마지막으로 입은 날'을 다시 계산해 원래대로 돌린다 (안 하면 계속 '오늘 입음'으로 남음).
 * 홈의 '오늘 코디로 정했어요' 표시(S.chosenKey)도 푼다. 오늘 코디가 바뀌었으니 예전 표시는 맞지 않다.
 * 홈에서 부를 때는 이 함수 뒤에 chosenKey를 새 코디로 다시 정한다 (Home.tsx chooseToday)
 */
export function wearToday(ps: Item[]) {
  const before = S.history.find((h) => h.ago === 0)?.ids ?? [] // 덮어쓰기 전 오늘 입은 옷
  ps.forEach((it) => { if (it.prevWorn === undefined) it.prevWorn = it.lastWorn; it.lastWorn = 0 })
  logWear(ps)
  before.filter((id) => !ps.some((it) => it.id === id)).forEach(recalcWorn) // 오늘 기록에서 빠진 옷만
  S.chosenKey = null
}
/** 입은 기록을 고치면 옷마다 마지막으로 입은 날을 다시 계산 */
export function recalcWorn(id: number) {
  const it = byId(id); if (!it) return
  const hs = S.history.filter((h) => h.ids.includes(id))
  it.lastWorn = hs.length ? Math.min(...hs.map((h) => h.ago)) : it.prevWorn !== undefined ? it.prevWorn : null
  if (!hs.some((h) => h.ago === 0)) delete it.prevWorn
}
/**
 * 이 옷들(ps)이 오늘 입은 코디와 같은지. 오늘 입은 기록(S.history의 ago 0)과 옷이 똑같으면 true.
 * '오늘 코디로 정했어요' 표시를 화면 안 상태(useState)에 두면 탭을 옮길 때 풀리고, 다른 코디로 바꿔도 남아서
 * 기록을 보고 그때그때 판단한다 (캘린더 저장한 코디, 홈 트렌드 코디)
 */
export function isWornToday(ps: Item[]) {
  const today = S.history.find((h) => h.ago === 0)
  return !!today && ps.length > 0 && today.ids.length === ps.length && ps.every((it) => today.ids.includes(it.id))
}
/** 이미 저장한 코디인지. '저장했어요' 표시와 saveLook의 중복 확인이 같이 쓴다 */
export const isSavedLook = (look: Look) => S.saved.some((q) => outfitKey(q) === outfitKey(look))
export function saveLook(next: Look) {
  const dup = isSavedLook(next)
  if (!dup) { const n = new Date(); S.saved.unshift({ id: ++S.sid, ...next, at: `${n.getMonth() + 1}월 ${n.getDate()}일` } as Saved) }
  return dup
}

/**
 * 옷 삭제: 추천 코디·저장한 코디·입은 기록·입을 계획에서도 함께 빠짐.
 * 홈 줄에서도 옷이 빠지므로 keepSel로 감싸 홈에서 고른 다른 옷이 바뀌지 않게 한다 (keepSel이 끝에 emit)
 */
export function deleteItem(it: Item) {
  keepSel(() => removeItem(it))
}
function removeItem(it: Item) {
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
}

/* ---------- 캘린더 ---------- */
export const dkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const TODAY0 = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t })()
export const agoOf = (d: Date) => Math.round((TODAY0.getTime() - d.getTime()) / 86400000)
export const wornOn = (d: Date) => S.history.find((h) => h.ago === agoOf(d))
export const planOn = (d: Date) => S.plans.find((p) => p.date === dkey(d))
;(() => { const d = new Date(TODAY0); d.setDate(d.getDate() + 2); S.plans.push({ date: dkey(d), ids: [2, 7, 10] }) })() // 예시: 모레 입을 코디

/* ---------- 커뮤니티 ---------- */
export const owned = (p: Post) => p.wear.filter((w) => w[2] && byId(w[2])).length
export const ini = (u: string) => (u || '?').replace(/[^a-z가-힣]/i, '').slice(0, 1).toUpperCase()

/* 처음엔 돌리지 않고 추천 코디 1번을 바로 보여 줌 */
applyOutfit(firstFresh(0))
