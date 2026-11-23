// 앱 전체에서 쓰는 데이터 모양. 진짜 API로 바꿔도 이 모양은 유지한다.
export type Category = '상의' | '덧입기' | '하의' | '아우터' | '원피스'

export type Item = {
  id: number
  name: string
  cat: Category
  color: string // COLORS의 키
  hex?: string | null // 사진에서 뽑은 색
  pattern: string
  rec: number // AI가 오늘의 코디에 넣어 준 횟수
  tags: string[] // 트렌드 키워드
  lastWorn: number | null // 며칠 전에 입었는지, null = 아직 안 입음
  prevWorn?: number | null // 오늘 입기 전 기록 (입은 기록을 고칠 때 되돌림)
  added: number
  img?: string
  credit?: string
  ex?: boolean // 추천에서 뺀 옷
  isNew?: boolean
}

/** 코디: top 상의(속) → mid 덧입기 → jacket 재킷 → outer 코트·패딩, bottom 하의 */
export type Look = { top?: number | null; mid?: number | null; jacket?: number | null; outer?: number | null; bottom?: number | null }
export type Outfit = Look & { ref: string; reason: string }
export type Saved = Look & { id: number; at: string }
export type Hist = { ago: number; ids: number[] }
export type Plan = { date: string; ids: number[] }
export type Trend = { k: string; up: boolean; why: string }

export type Comment = { u: string; t: string; ago: string; likes: number; liked: boolean; me?: boolean; replies: Comment[] }
export type Post = {
  id: number
  user: string
  img: string
  pos: string
  min: number
  ago: string
  ch: boolean
  likes: number
  cmts: number
  t: string
  body: string
  wear: [string, string, number | null, ('same' | 'like')?][]
  mine?: boolean
  scope?: string
  cmList?: Comment[]
  replyTo?: number | null
}
