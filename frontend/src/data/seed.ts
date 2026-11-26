// 가짜 데이터 (프로토타입과 같음). 나중에 진짜 API로 바꿀 때 이 파일 대신 서버에서 받아 온다.
import type { Item, Outfit, Saved, Hist, Post, Trend } from './types'

const clothes = import.meta.glob('../assets/clothes/*.jpg', { eager: true, import: 'default' }) as Record<string, string>
const pics = import.meta.glob('../assets/community/*.jpg', { eager: true, import: 'default' }) as Record<string, string>
export const photo = (id: number) => clothes[`../assets/clothes/item_${String(id).padStart(2, '0')}.jpg`]
export const cpic = (key: string) => pics[`../assets/community/${key}.jpg`]

export const COLORS: Record<string, string> = {
  화이트: '#FFFDF7', 아이보리: '#F1E9D6', 베이지: '#D9C7A7', 카멜: '#C49A6C', 브라운: '#6E4B32',
  블랙: '#1E2235', 차콜: '#3E4049', 그레이: '#A6A39B', 네이비: '#26324F', 데님: '#33467A',
  스카이: '#9DBBD9', 카키: '#6B6B3E', 그린: '#2F5130', 버건디: '#7A2436', 레드: '#C2353A',
  핑크: '#E7A9C2', 옐로: '#E8C547', 퍼플: '#6C5A8E',
}
// 재질: 옷 등록에서 고르는 값 (Item.material). 자주 입는 옷감 위주로 8개. 백엔드·ML과 값 이름을 맞출 때 이 목록을 기준으로 한다
export const MATERIALS = ['면', '니트', '데님', '울', '가죽', '린넨', '시폰', '폴리'] as const
export const CATS = ['상의', '덧입기', '하의', '아우터', '원피스'] as const
// 종류별 세부 종류. 옷 등록의 고치기 창에서 종류를 고르면 그 종류의 세부 종류만 보여 준다.
// 아우터의 '코트'·'패딩'은 홈에서 맨 겉(코트 칸)으로, 나머지는 재킷 칸으로 겹쳐 입는 순서를 정하는 데도 쓰인다
export const SUBS: Record<(typeof CATS)[number], string[]> = {
  상의: ['티셔츠', '셔츠', '블라우스', '니트', '맨투맨', '후드'],
  덧입기: ['뷔스티에', '조끼', '카디건'],
  하의: ['데님', '슬랙스', '와이드 팬츠', '스커트', '카고 팬츠', '트레이닝 팬츠', '레깅스', '반바지'],
  아우터: ['재킷', '코트', '패딩', '점퍼'],
  원피스: ['원피스', '셔츠 원피스', '니트 원피스'],
}

export const TRENDS: Trend[] = [
  { k: '오버핏 니트', up: true, why: '4주째 검색 관심도 상승' },
  { k: '와이드 데님', up: true, why: '3주째 검색 관심도 상승' },
  { k: '레더 재킷', up: true, why: '가을 들어 검색 관심도 상승' },
  { k: '플리츠 스커트', up: true, why: '2주째 검색 관심도 상승' },
  { k: '트렌치 코트', up: true, why: '날이 추워지며 검색 관심도 상승' },
  { k: '뷔스티에', up: true, why: '겹쳐 입는 코디가 늘며 검색 관심도 상승' },
  { k: '카고 팬츠', up: false, why: '검색 관심도 하락' },
  { k: '린넨 셔츠', up: false, why: '계절이 지나 검색 관심도 하락' },
  { k: '스키니 진', up: false, why: '와이드 핏에 밀려 하락' },
  { k: '크롭 티셔츠', up: false, why: '계절이 지나 검색 관심도 하락' },
]

const CREDITS: Record<number, string> = { 1: 'Yuliia Pakhomova', 2: 'Nynne Schrøder', 3: 'Alex Larrondo', 4: 'Avtar Singh', 5: 'Muhammad Rizwan', 13: 'Clara Dickieson', 6: 'happy face emoji', 7: 'Reza Shahriari', 8: 'Melbin Jacob', 9: 'Matthew Ye', 10: 'Margo Evardson', 11: 'Lea Ochel', 12: 'Engin Akyurt' }

// lastWorn: 며칠 전에 입었는지 (null = 아직 안 입음)
const raw: Omit<Item, 'img' | 'credit'>[] = [
  { id: 1, name: '아이보리 오버핏 니트', cat: '상의', color: '아이보리', rec: 1, tags: ['오버핏 니트'], lastWorn: 120, added: 12 },
  { id: 2, name: '그레이 오버핏 니트', cat: '상의', color: '그레이', rec: 0, tags: ['오버핏 니트'], lastWorn: 200, added: 11 },
  { id: 3, name: '블랙 오버핏 니트', cat: '상의', color: '블랙', rec: 2, tags: ['오버핏 니트'], lastWorn: 14, added: 10 },
  { id: 4, name: '화이트 티셔츠', cat: '상의', color: '화이트', rec: 3, tags: [], lastWorn: 1, added: 9 },
  { id: 5, name: '네이비 셔츠', cat: '상의', color: '네이비', rec: 1, tags: [], lastWorn: 45, added: 8 },
  { id: 13, name: '그린 셔츠', cat: '상의', color: '그린', rec: 0, tags: [], lastWorn: null, added: 13 },
  { id: 6, name: '인디고 와이드 데님', cat: '하의', color: '데님', rec: 2, tags: ['와이드 데님'], lastWorn: 14, added: 7 },
  { id: 7, name: '블랙 플리츠 스커트', cat: '하의', color: '블랙', rec: 0, tags: ['플리츠 스커트'], lastWorn: 300, added: 6 },
  { id: 8, name: '카키 카고 팬츠', cat: '하의', color: '카키', rec: 1, tags: ['카고 팬츠'], lastWorn: 45, added: 5 },
  { id: 9, name: '그레이 슬랙스', cat: '하의', color: '그레이', rec: 4, tags: [], lastWorn: 1, added: 4 },
  { id: 10, name: '카멜 롱 코트', cat: '아우터', color: '카멜', rec: 4, tags: ['트렌치 코트'], lastWorn: 20, added: 3 },
  { id: 11, name: '블랙 레더 재킷', cat: '아우터', color: '블랙', rec: 0, tags: ['레더 재킷'], lastWorn: 400, added: 2 },
  { id: 12, name: '아이보리 크로셰 원피스', cat: '원피스', color: '아이보리', rec: 1, tags: [], lastWorn: 20, added: 1 },
  { id: 15, name: '화이트 하이넥 셔링 티', cat: '상의', color: '화이트', rec: 0, tags: [], lastWorn: 9, added: 15 },
  { id: 14, name: '블랙 벨벳 뷔스티에', cat: '덧입기', color: '블랙', rec: 0, tags: ['뷔스티에'], lastWorn: 60, added: 14 },
  { id: 16, name: '차콜 와이드 슬랙스', cat: '하의', color: '차콜', rec: 0, tags: [], lastWorn: 9, added: 16 },
]
export const seedItems = (): Item[] => raw.map((i) => ({ ...i, tags: [...i.tags], img: photo(i.id), credit: CREDITS[i.id] }))

// 오늘의 추천 코디 (jacket = 재킷, outer = 코트·패딩)
export const seedOutfits = (): Outfit[] => [
  { top: 1, bottom: 6, outer: 10, ref: '오버핏 니트', reason: '요즘 뜨는 오버핏 니트로 맞춰 봤어요' },
  { top: 15, mid: 14, bottom: 16, jacket: 11, ref: '뷔스티에', reason: '하이넥 위에 뷔스티에를 겹치고 레더 재킷까지 걸쳤어요' },
  { top: 13, bottom: 6, ref: '와이드 데님', reason: '요즘 유행하는 와이드 데님을 맞췄어요' },
  { top: 2, bottom: 7, outer: 10, ref: '오버핏 니트', reason: '그레이 니트에 플리츠 스커트로 부드럽게 맞췄어요' },
  { top: 12, jacket: 11, ref: '레더 재킷', reason: '크로셰 원피스에 레더 재킷을 걸쳐 봤어요' },
]

export const seedSaved = (): Saved[] => [
  { id: 1, top: 1, bottom: 6, at: '11월 15일' }, { id: 2, top: 3, bottom: 7, outer: 10, at: '11월 14일' },
  { id: 3, top: 5, bottom: 9, at: '11월 12일' }, { id: 4, top: 15, mid: 14, bottom: 16, jacket: 11, at: '11월 10일' },
  { id: 5, top: 12, outer: 11, at: '11월 8일' }, { id: 6, top: 2, bottom: 8, at: '11월 5일' },
  { id: 7, top: 13, bottom: 6, at: '11월 3일' }, { id: 8, top: 4, bottom: 7, jacket: 11, at: '10월 30일' },
  { id: 9, top: 1, bottom: 16, outer: 10, at: '10월 27일' },
]

export const seedHistory = (): Hist[] => [
  { ago: 1, ids: [4, 9] }, { ago: 14, ids: [3, 6] }, { ago: 20, ids: [12, 10] }, { ago: 45, ids: [5, 8] },
]

export const ME = { nick: '옷장탐험가', handle: 'closet.explorer', bio: '1년 넘게 안 입은 옷 다시 입는 중', followers: 128 }

// wear: [옷 이름, 색, 내 옷장 옷 id(없으면 null), 'same'(같은 옷) | 'like'(비슷한 옷)]
export const seedPosts = (): Post[] => [
  { id: 1, user: 'mina.closet', img: cpic('p1'), pos: '50% 35%', min: 120, ago: '2시간 전', ch: true, likes: 284, cmts: 31,
    t: '3년 묵힌 와이드 데님, 요즘 다시 입어요', body: '3년 묵힌 와이드 데님에 블랙 크롭 니트. 요즘 와이드핏이 다시 올라와서 꺼내 봤어요.',
    wear: [['와이드 데님', '#3F78B5', 6, 'same'], ['블랙 크롭 니트', '#1E1E22', 3, 'like'], ['블랙 벨트', '#2B2B2B', null]] },
  { id: 2, user: 'soyeon', img: cpic('p2'), pos: '50% 40%', min: 300, ago: '5시간 전', ch: true, likes: 201, cmts: 17,
    t: '작년 겨울 이후 처음 꺼낸 카멜 코트', body: '옷장 구석에 있던 카멜 코트. 검정 부츠만 맞추니 금방 끝났어요.',
    wear: [['카멜 트렌치 코트', '#C49A6C', 10, 'like'], ['블랙 롱부츠', '#1E1E22', null]] },
  { id: 3, user: 'yoon_daily', img: cpic('p3'), pos: '50% 25%', min: 1440, ago: '어제', ch: false, likes: 96, cmts: 8,
    t: '크로셰 원피스 하나로 끝', body: '더운 날엔 크로셰 원피스 하나면 충분해요. 가방만 바꿔 들었어요.',
    wear: [['아이보리 크로셰 원피스', '#F1E9D6', 12, 'same']] },
  { id: 4, user: 'jiwoo.fit', img: cpic('p4'), pos: '50% 30%', min: 1500, ago: '어제', ch: false, likes: 143, cmts: 12,
    t: '버건디 셔츠 출근룩', body: '진한 버건디 셔츠에 브라운 롱스커트를 맞춰 봤어요. 색만 맞추면 출근룩도 금방이에요.',
    wear: [['버건디 셔츠', '#7A2436', 5, 'like'], ['브라운 롱스커트', '#6E4B32', null]] },
  { id: 5, user: 'hyun.wear', img: cpic('p5'), pos: '50% 30%', min: 2880, ago: '2일 전', ch: true, likes: 77, cmts: 5,
    t: '블랙 니트에 플리츠 스커트', body: '1년 넘게 안 입은 플리츠 스커트를 꺼냈어요. 위아래 블랙이라 부담 없어요.',
    wear: [['블랙 니트', '#1E2235', 3, 'same'], ['블랙 플리츠 스커트', '#1E2235', 7, 'same'], ['블랙 롱부츠', '#1E1E22', null]] },
  { id: 101, mine: true, user: ME.handle, img: cpic('m1'), pos: '50% 30%', min: 4320, ago: '3일 전', ch: false, likes: 42, cmts: 3, scope: '전체 공개',
    t: '블랙 니트 하나로 깔끔하게', body: '블랙 오버핏 니트에 와이드 데님. 출근할 때 제일 자주 입는 조합이에요.',
    wear: [['블랙 오버핏 니트', '#1E2235', 3, 'same'], ['인디고 와이드 데님', '#33467A', 6, 'same']] },
  { id: 102, mine: true, user: ME.handle, img: cpic('m2'), pos: '50% 50%', min: 7200, ago: '5일 전', ch: true, likes: 65, cmts: 6, scope: '팔로워만',
    t: '1년 넘게 안 입은 레더 재킷 꺼냈어요', body: '옷장 안쪽에 걸어만 두던 레더 재킷. 챌린지 덕분에 다시 꺼냈어요.',
    wear: [['블랙 레더 재킷', '#1E2235', 11, 'same']] },
]

// 댓글 [작성자, 내용, 시간, 좋아요, 답글들]
export const CMTS: [string, string, string, number, [string, string, string, number][]?][] = [
  ['soyeon', '저도 와이드 데님 꺼내 봐야겠어요', '1시간 전', 12],
  ['jiwoo.fit', '니트 핏이 예뻐요. 어디 거예요?', '40분 전', 3, [['mina.closet', '몇 년 전에 산 거라 기억이 안 나요', '30분 전', 2]]],
]
export const MY_CMTS: typeof CMTS = [['mina.closet', '이 조합 따라 입어 봐야겠어요', '2일 전', 4]]

export const STYLES: [string, string][] = [['미니멀', '무채색과 깔끔한 선'], ['캐주얼', '편하게 입는 데님·니트'], ['클래식', '셔츠·코트·슬랙스'], ['페미닌', '스커트·원피스'], ['스트리트', '오버핏·카고'], ['스포티', '트레이닝·운동화']]
export const MODES = {
  taste: ['내 취향대로', '좋아하는 스타일에 맞춰 내 옷으로 코디를 골라요. 단정하게 입어야 하는 날에도 무난해요.'],
  trend: ['요즘 유행대로', '요즘 뜨는 스타일에 맞춰 내 옷으로 코디를 골라요. 잊고 있던 옷이 요즘 코디가 되기도 해요.'],
} as const
