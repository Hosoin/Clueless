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
/** 처음 상태의 내 정보와 추천 취향. 앱을 켤 때와 로그아웃할 때(clearMe) 같은 값으로 시작하려고 함수로 둔다 */
const newMe = () => ({ ...ME, photo: null as string | null }) // photo: 프로필 사진 (없으면 닉네임 첫 글자)
const newPref = () => ({ mode: 'trend' as 'trend' | 'taste', styles: [] as string[] })

/** 앱 전체 상태 (메모리에만 있어서 새로고침하면 seed.ts의 처음 상태로 돌아간다). 바꾼 뒤에는 emit()을 부른다 */
export const S = {
  items: seedItems(), // 내 옷장
  outfits: seedOutfits(), // 추천 코디 목록 (홈에서 차례로 돌림)
  saved: seedSaved(), // 저장한 코디
  history: seedHistory(), // 입은 기록
  plans: [] as Plan[], // 입을 계획 (캘린더)
  posts: seedPosts().map(withComments), // 커뮤니티 글
  me: newMe(), // 내 정보. photo: 프로필 사진 (없으면 닉네임 첫 글자)
  pref: newPref(), // 추천 방식(유행·취향)과 좋아하는 스타일
  loggedIn: false, // 로그인했는지 (Google은 서버 세션, 카카오·Apple은 가짜)
  onboarded: false, // 첫 설정을 마쳤는지
  RECENT: 3, // 이 날수 안에 입은 옷은 추천에서 뺌
  defScope: '전체 공개', // 새 글의 기본 공개 범위 (설정)
  cmpOn: true, // 커뮤니티 글에 내 옷장 비교 표시
  followingSet: new Set(['mina.closet', 'hyun.wear']), // 팔로우하는 사람 아이디
  liked: new Set<number>(), // 좋아요를 누른 글 id
  savedPosts: new Set([4]), // 저장한 글 id
  // 홈
  oi: 0, // 지금 보여 주는 추천 코디 번호 (S.outfits의 순서)
  pos: { t: 0, m: 0, j: 0, o: 0, b: 0 } as Record<RowKey, number>, // 줄마다 고른 옷의 순서 (lists()의 각 줄 기준)
  on: { m: false, j: false, o: true } as Record<ExtraKey, boolean>, // 겹옷 줄(덧입기·재킷·코트)을 켰는지
  fresh: true, // '최근 입은 옷 빼고 추천'을 켰는지
  view: 'rows' as 'rows' | 'avatar', // 룩북(줄) 보기 / 아바타 보기
  chosenKey: null as string | null, // '오늘 코디로 정했어요'로 고른 코디의 comboKey
  spinning: false, // 추천 코디로 돌리는 중인지
  spinKeys: new Set<RowKey>(), // 아직 돌고 있는 줄
  // 화면별 보기 상태 (탭을 옮겨 다녀도 유지)
  kView: 'cal' as 'cal' | 'saved', // 캘린더: 달력 / 저장한 코디
  cView: 'items' as 'items' | 'ex', // 옷장: 내 옷 / 추천 제외
  cTab: '전체', // 옷장 종류 탭
  cColor: null as string | null, // 옷장 색 거르기 (null = 모든 색)
  cSort: 0, // 옷장 정렬 (Closet.tsx의 SORTS 순서)
  cmTab: '인기', // 커뮤니티 탭: 인기 / 최신 / 팔로잉
  chOnly: false, // 커뮤니티: 챌린지 참여 글만 보기
  myTab: 'posts' as 'posts' | 'saved', // MY: 내 게시물 / 저장한 글
  postFrom: 'community' as string, // 글 보기에서 돌아갈 화면
  loginBack: '/' as string, // 로그인 뒤 돌아갈 화면
  ob: null as null | { step: 'mode' | 'taste' | 'nick'; mode: 'trend' | 'taste'; styles: string[]; nick: string }, // 첫 설정 진행 상태 (단계, 고른 값)
  // 새로 만드는 것의 id를 정할 때 1씩 늘리는 수 (예시 데이터의 id와 겹치지 않게 큰 수에서 시작)
  uid: 100, // 옷 등록 화면의 사진 칸
  sid: 9, // 저장한 코디
  pid: 200, // 커뮤니티 글
}

let version = 0 // emit()마다 1씩 늘어나는 값. useApp이 이 값으로 다시 그릴지 정한다
const subs = new Set<() => void>() // 다시 그려야 할 화면들 (useApp이 등록)
/** 상태를 바꾼 뒤 부른다. 다시 그리기 전에 홈 줄의 위치(S.pos)를 줄 길이에 맞춘다.
 *  옷을 지우거나 추천에서 빼거나 최근 입은 옷 거르기가 바뀌면 줄이 짧아질 수 있어서다.
 *  전에는 홈을 그리는 도중에 맞췄다 (코드 리뷰 23번) */
export const emit = () => { clampPos(); version++; subs.forEach((f) => f()) }
/** 화면을 subs에 등록하고, 화면이 사라질 때 빼는 함수를 돌려준다 (useSyncExternalStore 규칙) */
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
/** 상태가 바뀌면 다시 그려지게 함 */
export const useApp = () => { useSyncExternalStore(subscribe, () => version); return S }

/* ---------- 공통 ---------- */
/** id로 옷 찾기. 없거나(지운 옷) id가 비어 있으면 undefined */
export const byId = (id?: number | null) => (id ? S.items.find((i) => i.id === id) : undefined)
/** 빈 값(null·undefined)을 걸러 내면서 타입도 좁힌다. `.filter(present)`로 쓰면 `as Item[]` 단언 없이 Item[]이 된다 (코드 리뷰 32번) */
export const present = <T>(x: T | null | undefined): x is T => x != null
/**
 * 옷장에서 보여 줄 옷 이름: 별명이 있으면 별명, 없으면 원래 이름.
 * 별명은 내 옷장에서 알아보기 쉽게 붙이는 이름이라 옷장 화면(카드·크게 보기)에서만 쓰고,
 * 홈·캘린더·커뮤니티는 다른 사람도 알아볼 수 있게 원래 이름(name)을 그대로 쓴다.
 */
export const displayName = (it: Item) => it.alias || it.name
/** 옷 색 코드: 사진에서 뽑은 색 → 색 이름의 기본 색 → 회색 순서 */
export const hexOf = (it: Item) => it.hex || COLORS[it.color] || '#CCCCCC'
/** 오늘을 포함해 S.RECENT일 안에 입은 옷인지 (안내 문구용. 추천에서 빼는 기준은 오늘을 뺀 isPast) */
export const isRecent = (it?: Item | null) => !!it && it.lastWorn !== null && it.lastWorn <= S.RECENT
/** n일 전 날짜 글자 (예: '11월 20일'). 올해가 아니면 연도를 붙인다 */
const wornDate = (n: number) => {
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
/** '은/는' */
export const eun = (w: string) => (jongOf(w) ? '은' : '는')
/** '이/가' */
export const iga = (w: string) => (jongOf(w) ? '이' : '가')
/** '을/를' */
export const eulreul = (w: string) => (jongOf(w) ? '을' : '를')
/** '으로/로'. ㄹ 받침도 '로'다 (예: 니트로, 데님으로, 팔로워만으로, 원피스 한 벌로) */
export const euro = (w: string) => { const j = jongOf(w); return j === 0 || j === 8 ? '로' : '으로' }
/** 마지막으로 입은 때 글자 (오늘 / 어제 / 11월 20일에) */
const when = (it: Item) => (it.lastWorn === 0 ? '오늘' : it.lastWorn === 1 ? '어제' : `${wornDate(it.lastWorn!)}에`)
/** 최근 입은 옷 안내 문구 (예: '블랙 니트는 어제 입었어요') */
export const wornNote = (it: Item) => `${it.name}${eun(it.name)} ${when(it)} 입었어요`
/** 옷 카드에 보이는 마지막으로 입은 날 (아직 안 입음 / 오늘 입음 / 어제 입음 / 11월 20일 입음) */
export const worn = (it: Item) => (it.lastWorn === null ? '아직 안 입음' : it.lastWorn === 0 ? '오늘 입음' : it.lastWorn === 1 ? '어제 입음' : `${wornDate(it.lastWorn)} 입음`)
/** n일 전을 글자로 (오늘 / 어제 / 11월 20일) */
export const dayLabel = (n: number) => (n === 0 ? '오늘' : n === 1 ? '어제' : wornDate(n))
/** 요즘 인기가 오르는 트렌드 키워드를 가진 옷인지 */
const trendOf = (it?: Item | null) => !!it && it.tags.some((t) => TRENDS.find((x) => x.k === t && x.up))
/** 오래 안 입은 옷: 90일 넘게 안 입었거나 한 번도 안 입음 */
const forgotten = (it?: Item | null) => !!it && (it.lastWorn === null || it.lastWorn >= 90)
/** 정렬용 '며칠 전에 입었는지'. 안 입은 옷은 가장 오래된 것으로 친다 */
export const wornKey = (it: Item) => (it.lastWorn === null ? 99999 : it.lastWorn)

/** 코디가 어울리는지 한 줄 판단. 유행하는 옷이 하나라도 있으면 hit. 결과: { hit, t(문구) } */
export function matchText(list: (Item | null | undefined)[]) {
  const l = list.filter(present)
  const hit = l.some(trendOf)
  return { hit, t: hit ? '요즘 유행과 잘 어울려요' : '무난하게 입기 좋은 조합이에요' }
}

/* ---------- 겹쳐 입기: t 상의(속) → m 덧입기 → j 재킷 → o 코트·패딩, b 하의 ---------- */
/** 홈의 줄 이름 */
export type RowKey = 't' | 'm' | 'j' | 'o' | 'b'
/** 켜고 끌 수 있는 겹옷 줄 (덧입기·재킷·코트) */
export type ExtraKey = 'm' | 'j' | 'o'
export const K: RowKey[] = ['t', 'm', 'j', 'o', 'b'] // 모든 줄 (위에서 아래 순서)
export const EXTRA: ExtraKey[] = ['m', 'j', 'o'] // 겹옷 줄
/** 겹옷 줄인지. true면 k를 ExtraKey로 좁혀 S.on[k]에 바로 쓸 수 있다 (`(EXTRA as RowKey[]).includes(k)`와 `k as ExtraKey` 대신, 코드 리뷰 32번) */
export const isExtra = (k: RowKey): k is ExtraKey => EXTRA.some((x) => x === k)
export const NAME: Record<RowKey, string> = { t: '상의', m: '덧입기', j: '아우터', o: '아우터', b: '하의' } // 재킷·코트는 화면에서 모두 '아우터'
/** 코트 줄(o)에 둘 아우터인지. 세부 종류(sub)가 있으면 그걸로(코트·패딩), 없으면(예시 옷) 이름에 코트·패딩이 있는지로 본다.
 *  이름으로만 보면 '코트 같은 재킷'처럼 이름이 애매한 옷이 잘못 들어갈 수 있어서 sub를 먼저 본다 (코드 리뷰 35번) */
const isCoat = (it: Item) => (it.sub ? it.sub === '코트' || it.sub === '패딩' : /코트|패딩/.test(it.name))
/** 옷이 들어갈 줄. 아우터는 코트·패딩이면 코트 줄(o), 아니면(재킷·점퍼) 재킷 줄(j). 원피스는 상의 줄(t) */
export const rowKey = (it: Item): RowKey => (it.cat === '하의' ? 'b' : it.cat === '덧입기' ? 'm' : it.cat === '아우터' ? (isCoat(it) ? 'o' : 'j') : 't')
/** 오늘 날씨. 날씨 API를 붙이기 전까지 고정값. 위쪽 날씨(Layout.tsx)와 홈 겹쳐 입기 문구가 같이 읽는다 (코드 리뷰 35번).
 *  now: 지금 기온, low·high: 오늘 최저·최고 기온(°C), sky: 하늘 */
export const WEATHER = { now: 9, low: 4, high: 12, sky: '맑음' }
export const TEMP = WEATHER.now // 겹쳐 입기 겹 수를 정하는 기온(°C) = 지금 기온
export const layersFor = (t: number) => (t >= 15 ? 1 : t >= 5 ? 2 : 3) // 기온별로 상의 위에 겹쳐 입기 좋은 겹 수

/** 코디의 옷 id를 줄 순서(상의·덧입기·재킷·코트·하의)로. 빈 칸은 null·undefined 그대로 */
export const lookIds = (o: Look) => [o.top, o.mid, o.jacket, o.outer, o.bottom]
/** 코디의 옷들 (지운 옷은 null) */
const parts = (o: Look) => lookIds(o).map((id) => byId(id) || null)
// 오늘 고른 옷(0일)은 빼지 않고, 어제부터 RECENT일 안에 입은 옷만 뺌
export const isPast = (it?: Item | null) => !!it && it.lastWorn !== null && it.lastWorn >= 1 && it.lastWorn <= S.RECENT
/** 코디 안의 최근 입은 옷 (isPast) */
const recentIn = (o: Look) => parts(o).filter(isPast)
/** from번째부터 차례로 보며 최근 입은 옷이 없는 첫 추천 코디의 번호. 모두 있으면 from 그대로 */
export function firstFresh(from: number) {
  const n = S.outfits.length
  for (let k = 0; k < n; k++) { const i = (from + k) % n; if (!recentIn(S.outfits[i]).length) return i }
  return from % n
}
/** 줄 k에 놓일 옷들: 그 줄의 옷 중 추천에서 뺀 옷과(거르기를 켰으면) 최근 입은 옷을 뺀 것 */
export const pool = (k: RowKey) => S.items.filter((i) => rowKey(i) === k && !i.ex && !(S.fresh && isPast(i)))
/** 모든 줄의 옷 목록 { t, m, j, o, b } */
export const lists = () => Object.fromEntries(K.map((k) => [k, pool(k)])) as Record<RowKey, Item[]>
/** 홈 줄에 지금 놓인 옷들. 꺼진 겹옷 줄은 null. dress면 원피스라 하의(b)가 null */
export type Combo = Record<RowKey, Item | null> & { dress: boolean }
/** 지금 홈 줄에 놓인 코디 (S.pos, S.on 기준) */
export function current(): Combo {
  const L = lists(), t = L.t[S.pos.t] || null, dress = !!t && t.cat === '원피스'
  const c = { t, dress, b: dress ? null : L.b[S.pos.b] || null, m: null, j: null, o: null } as Combo
  EXTRA.forEach((k) => (c[k] = S.on[k] ? L[k][S.pos[k]] || null : null))
  return c
}
/** 코디를 비교하려고 만드는 글자 (줄 순서대로 옷 id, 빈 칸은 0. 예: '1-0-0-10-6') */
export const comboKey = (c: Combo) => K.map((k) => (c[k] ? c[k]!.id : 0)).join('-')
/** 저장한 코디를 비교하려고 만드는 글자 (comboKey와 같은 모양) */
const outfitKey = (o: Look) => lookIds(o).map((x) => x || 0).join('-')
/** 코디에서 실제로 입는 옷만 (빈 칸 뺌) */
export const wearList = (c: Combo) => K.map((k) => c[k]).filter(present)
/** 줄마다 고른 위치가 줄 길이를 넘지 않게 맞춘다 (빈 줄은 0) */
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
    if (isExtra(k)) S.on[k] = true
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
/** 무채색·기본색. 이 색이 아닌 옷끼리 겹치면 덜 어울린다고 본다 */
const NEUTRAL = ['화이트', '아이보리', '베이지', '블랙', '차콜', '그레이', '네이비', '데님', '카멜', '브라운']
/** 줄 k에 옷 it을 놓았을 때 나머지 옷(c)과의 점수와 이유. 결과: { sc(클수록 잘 어울림), why(옷 목록에 보일 짧은 이유) } */
export function fit(it: Item, k: RowKey, c: Combo) {
  const others = K.filter((x) => x !== k).map((x) => c[x]).filter(present)
  let sc = 0, why = ''
  const bright = (x: Item) => !NEUTRAL.includes(x.color)
  if (bright(it) && others.some(bright)) sc -= 2; else if (!bright(it)) sc += 1
  if (trendOf(it)) { sc += 2; why = why || '요즘 유행' }
  if (forgotten(it)) { sc += 1; why = why || '오래 안 입은 옷' }
  if (isPast(it)) { sc -= 3; why = `${dayLabel(it.lastWorn!)} 입었어요` }
  if (!why) why = sc >= 2 ? '잘 어울려요' : ''
  return { sc, why }
}
/** 줄 k의 옷을 잘 어울리는 순서로 (같은 점수면 옷장 순서) */
export function ranked(k: RowKey) {
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
/** 오늘 입은 기록을 이 옷들로 남긴다. 오늘 기록이 이미 있으면 바꾼다 (하루에 하나) */
function logWear(ps: (Item | null | undefined)[]) {
  const ids = ps.filter(present).map((x) => x.id)
  const today = S.history.find((h) => h.ago === 0)
  if (today) today.ids = ids; else S.history.unshift({ ago: 0, ids })
}
/**
 * '이 코디로 입을래요': 옷마다 마지막으로 입은 날을 오늘로 하고 입은 기록에 남긴다.
 * 입기 전 값은 prevWorn에 한 번만 남겨, 오늘 기록을 고치거나 지울 때 되돌린다.
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
/** 코디를 저장한다. 같은 코디가 이미 있으면 저장하지 않는다. 결과: 이미 있었으면 true */
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
/** 날짜를 'YYYY-MM-DD' 글자로 (입을 계획의 날짜, 달력 칸 비교용) */
export const dkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** 오늘 0시 */
const startOfToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }
/** 오늘 0시. 앱을 켜 둔 채 자정이 지나면 rollDay()가 새 날로 바꾼다 (let이라 불러 쓰는 쪽도 바뀐 값을 본다) */
export let TODAY0 = startOfToday()
/** 날짜 d가 오늘로부터 며칠 전인지 (앞날이면 음수) */
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
/** 날짜 d의 입은 기록 (없으면 undefined) */
export const wornOn = (d: Date) => S.history.find((h) => h.ago === agoOf(d))
/** 날짜 d의 입을 계획 (없으면 undefined) */
export const planOn = (d: Date) => S.plans.find((p) => p.date === dkey(d))
;(() => { const d = new Date(TODAY0); d.setDate(d.getDate() + 2); S.plans.push({ date: dkey(d), ids: [2, 7, 10] }) })() // 예시: 모레 입을 코디

/* ---------- 커뮤니티 ---------- */
/** 글의 입은 옷 중 내 옷장에 있는 옷의 수 (따라 입기, 비슷한 옷 안내에 씀) */
export const owned = (p: Post) => p.wear.filter((w) => w[2] && byId(w[2])).length
/** 프로필 동그라미에 쓸 첫 글자 (영어는 대문자).
 *  앞의 기호·숫자를 모두 지우고 첫 글자를 쓴다 (g가 없으면 앞 기호를 하나만 지웠다, 코드 리뷰 24번) */
export const ini = (u: string) => (u || '?').replace(/[^a-z가-힣]/gi, '').slice(0, 1).toUpperCase()

/* 처음엔 돌리지 않고 추천 코디 1번을 바로 보여 줌 */
applyOutfit(firstFresh(0))
