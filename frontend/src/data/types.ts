// 앱 전체에서 쓰는 데이터 모양. 진짜 API로 바꿔도 이 모양은 유지한다.
/** 옷 종류. 화면의 탭·홈의 줄과 짝지어진다 (덧입기는 상의 위에 겹쳐 입는 옷) */
export type Category = '상의' | '덧입기' | '하의' | '아우터' | '원피스'

/** 옷 한 벌 */
export type Item = {
  id: number
  name: string // 원래 이름 (예: 아이보리 오버핏 니트)
  alias?: string | null // 별명: 사용자가 붙인 이름 (예: 최애 코트). 옷장에서 name 대신 보여 줌. 없으면 name
  cat: Category
  sub?: string | null // 세부 종류 (티셔츠·셔츠·니트·코트 등). SUBS의 값. 모르면 없음
  color: string // COLORS의 키
  hex?: string | null // 사진에서 뽑은 색
  material?: string | null // 재질 (면·니트·데님 등). MATERIALS의 값. 모르면 없음. 노션 테이블 명세서 closet_items.material(선택)과 같은 칸
  rec: number // AI가 오늘의 코디에 넣어 준 횟수
  tags: string[] // 트렌드 키워드
  lastWorn: number | null // 며칠 전에 입었는지, null = 아직 안 입음
  prevWorn?: number | null // 오늘 입기 전 기록 (입은 기록을 고칠 때 되돌림)
  added: number // 옷장에 넣은 순서. 클수록 최근 (예시 옷은 작은 수, 새로 등록한 옷은 Date.now()). '최근 넣은 순' 정렬에 씀
  img?: string // 옷 사진 주소. 없으면 사진 자리만 보임
  credit?: string // 예시 사진의 Unsplash 작가 이름 (크게 보기에 출처로 보여 줌)
  ex?: boolean // 추천에서 뺀 옷
  isNew?: boolean // 이번에 새로 등록한 옷 (옷장에 '새로 넣은 옷'으로 표시)
}

/** 코디: top 상의(속) → mid 덧입기 → jacket 재킷 → outer 코트·패딩, bottom 하의 */
export type Look = { top?: number | null; mid?: number | null; jacket?: number | null; outer?: number | null; bottom?: number | null }
/** 추천 코디: 코디 + ref(이 코디가 따르는 트렌드 키워드, Trend.k) + reason(홈에 보여 줄 추천 이유) */
export type Outfit = Look & { ref: string; reason: string }
/** 저장한 코디: 코디 + id + at(저장한 날 글자, 예: '11월 26일') */
export type Saved = Look & { id: number; at: string }
/** 입은 기록: ago(오늘로부터 며칠 전, 0 = 오늘)에 입은 옷 id 목록. 날짜가 바뀌면 store.ts의 rollDay가 ago를 늘린다 */
export type Hist = { ago: number; ids: number[] }
/** 입을 계획: date(YYYY-MM-DD, store.ts의 dkey)에 입을 옷 id 목록 */
export type Plan = { date: string; ids: number[] }
/** 이번 달 유행: k(키워드, 옷의 tags와 비교), up(인기가 오르는지), why(이유 문구) */
export type Trend = { k: string; up: boolean; why: string }

/** 댓글: u(쓴 사람), t(내용), ago(언제, 글자), likes·liked(좋아요 수·내가 눌렀는지), me(내가 쓴 댓글), replies(답글) */
export type Comment = { u: string; t: string; ago: string; likes: number; liked: boolean; me?: boolean; replies: Comment[] }
/** 커뮤니티 글 */
export type Post = {
  id: number
  user: string // 쓴 사람 아이디 (내 글은 S.me.handle)
  img: string // 코디 사진 주소
  pos: string // 사진에서 보여 줄 위치 (CSS object-position, 예: '50% 35%')
  min: number // 올린 지 몇 분 됐는지. 커뮤니티 '최신' 정렬에 씀 (화면에는 ago 글자를 보여 줌)
  ago: string // 올린 때 글자 (예: '2시간 전', '방금')
  ch: boolean // '1년 안 입은 옷 꺼내 입기' 챌린지 참여 글
  likes: number
  cmts: number // 댓글 수
  t: string // 피드에 보이는 제목 (26자까지)
  body: string // 본문 (설명)
  wear: [string, string, number | null, ('same' | 'like')?][] // 입은 옷마다 [이름, 색 코드, 내 옷장의 옷 id(없으면 null), 같은 옷 'same' / 비슷한 옷 'like']
  mine?: boolean // 내가 올린 글
  scope?: string // 공개 범위 ('전체 공개' / '팔로워만')
  cmList?: Comment[] // 댓글 목록. 가짜 데이터 글은 store.ts의 withComments가 예시 댓글로 채우고, 새로 올린 글은 빈 목록으로 시작한다
  replyTo?: number | null // 지금 답글을 다는 댓글의 순서 (없으면 null)
}
