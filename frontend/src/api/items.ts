// 옷(Item) 관련 요청 (closet-service). 규칙은 docs/API_CONVENTION.md 2장·5장 참고.
// 지금은 옷 사진 분석 요청(POST /api/closet/analyze)만 있다.
//  - 요청: multipart/form-data, 'image' 칸에 사진 파일 1개. JPEG·PNG·WebP, 최대 10 MiB. 세션 쿠키와 CSRF 헤더가 필요하다
//  - 응답: 200 { retake: true } (다시 찍기, 서버에 저장 안 함)
//          또는 200 { id, previewImg, category, sub_category, color, hex, styles, name, retake: false } (DRAFT로 저장됨)
//  - 실패: 본문 없이 상태 코드만 온다. 400 잘못된 multipart, 413 크기 초과, 415 형식 불일치, 422 ML이 사진을 읽지 못함,
//          502·503·504 ML 연동 오류. 401 로그인 안 됨, 403 CSRF 토큰 없음·틀림
// 서버 응답은 이 파일 안에서 프론트 이름(cat·sub 등)으로 바꿔 돌려준다. 화면은 서버 필드 이름을 모른다 (API_CONVENTION 2장).
// 화면 연결: Upload.tsx가 올린 사진마다 한 장씩 차례로 부른다. 예시 사진(앱 안 이미지)은 보낼 파일이 없어 Upload의 DEMO_PREDS를 쓴다.
// 가짜 데이터 상태(VITE_MOCK_CLOSET=true)면 서버 대신 아래 MOCK_ANALYSES를 돌려준다.
// 명세: 백엔드 FE 연동 요약(backend/docs/FE_API_HANDOFF.md) 5장 "사진 분석"
import { CATS, COLORS, STYLES, SUBS } from '../data/seed'
import type { Category } from '../data/types'
import { fetchMe } from './auth'
import { MOCK, closetFetch, mock } from './client'
import { ApiError } from './error'

/** 가짜 데이터 상태(VITE_MOCK_CLOSET=true)에서 돌려줄 분석 결과. 부를 때마다 다음 것을 돌려준다.
 *  서버에서 올 수 있는 경우를 모두 볼 수 있게 섞었다: 보통 결과, 세부 종류·색을 못 고른 결과(null), 다시 찍기.
 *  실패(4xx·5xx·연결 안 됨)는 가짜로 만들지 않았다. 확인하려면 가짜 데이터를 끄고 서버를 끈 채 올려 본다 */
const MOCK_ANALYSES: ItemPhotoAnalysis[] = [
  { retake: false, draftId: 'mock-1', previewImg: '', name: '화이트 반팔 티셔츠', cat: '상의', sub: '티셔츠', color: '화이트', hex: null, styles: ['미니멀'] },
  { retake: false, draftId: 'mock-2', previewImg: '', name: '하의', cat: '하의', sub: null, color: null, hex: null, styles: [] },
  { retake: false, draftId: 'mock-3', previewImg: '', name: '카멜 롱 코트', cat: '아우터', sub: '코트', color: '카멜', hex: null, styles: ['클래식'] },
  { retake: true },
  { retake: false, draftId: 'mock-5', previewImg: '', name: '네이비 셔츠', cat: '상의', sub: '셔츠', color: '네이비', hex: null, styles: [] },
]
/** 다음에 돌려줄 가짜 결과의 순서 */
let mockTurn = 0
/** 가짜 분석이 걸리는 시간(밀리초). 실제 분석처럼 '확인 중'이 잠깐 보이게 */
const MOCK_ANALYZE_MS = 700

/** 서버가 받는 사진 형식. 이 밖의 형식(HEIC 등)은 서버가 415로 거절하므로 보내기 전에 막는다 */
const ANALYZE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** 서버가 받는 사진 크기 한도(10 MiB). 넘으면 서버가 413으로 거절하므로 보내기 전에 막는다 */
const ANALYZE_MAX_BYTES = 10 * 1024 * 1024

/** 분석 요청의 시간 제한(밀리초). 백엔드는 ML 응답을 최대 10초 기다리고 넘으면 504를 주므로,
 *  그 504를 받을 수 있게 프론트는 더 길게(업로드 시간 포함 20초) 기다린다 (API_CONVENTION 5장) */
const ANALYZE_TIMEOUT_MS = 20_000

/** 형식별 파일 이름 끝. 줄인 사진(Blob)에는 이름이 없어서 보낼 때 붙여 준다 */
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** 실패 상태 코드별로 화면에 보여 줄 문구. 서버가 본문 없이 상태 코드만 주므로 문구는 프론트가 정한다.
 *  5xx는 errorText(api/error.ts)가 '잠시 후 다시 시도해 주세요'로 바꿔 보여 주지만, 직접 message를 읽는 곳을 위해 같이 적는다 */
const ANALYZE_ERRORS: Record<number, [code: string, message: string]> = {
  400: ['BAD_REQUEST', '사진을 보내지 못했어요. 다시 시도해 주세요'],
  401: ['UNAUTHORIZED', '로그인하면 옷을 등록할 수 있어요'],
  403: ['CSRF', '사진을 보내지 못했어요. 새로고침한 뒤 다시 해 주세요'],
  413: ['TOO_LARGE', '10MB 이하의 사진만 올릴 수 있어요'],
  415: ['UNSUPPORTED_TYPE', 'JPEG, PNG, WebP 사진만 올릴 수 있어요'],
  422: ['UNREADABLE', '옷을 알아보지 못했어요. 다른 사진으로 해 주세요'],
  502: ['ANALYSIS_FAILED', '사진을 확인하지 못했어요. 잠시 후 다시 시도해 주세요'],
  503: ['ANALYSIS_UNAVAILABLE', '사진을 확인하지 못했어요. 잠시 후 다시 시도해 주세요'],
  504: ['ANALYSIS_TIMEOUT', '사진 확인이 오래 걸려요. 잠시 후 다시 시도해 주세요'],
}

/** 상태 코드로 ApiError를 만든다. 표에 없는 코드는 일반 문구 */
const analyzeError = (status: number) => {
  const [code, message] = ANALYZE_ERRORS[status] ?? [`HTTP_${status}`, '사진을 확인하지 못했어요']
  return new ApiError(status, code, message)
}

/**
 * 분석 실패를 사용자가 할 수 있는 일로 나눈 것. 화면은 이 값으로 버튼을 고른다 (상태 코드를 화면에서 직접 보지 않게)
 * - retry: 다시 보내면 될 수도 있음 (400, 403, 502·503·504, 잘못된 응답, 그 밖의 오류) → '다시 시도'
 * - offline: 서버에 닿지 못했거나 시간 초과 (status 0). 남은 사진도 같은 결과일 가능성이 커서 화면이 분석을 멈춘다 → '모두 다시 시도'
 * - replace: 같은 사진으로는 다시 보내도 안 됨 (413 너무 큼, 415 형식, 422 옷을 알아보지 못함) → '다시 찍기'·'목록에서 빼기'
 * - login: 로그인 세션이 없음 (401). 남은 사진도 모두 실패하므로 화면이 분석을 멈춘다 → '로그인하기'
 */
export type AnalyzeFailKind = 'retry' | 'offline' | 'replace' | 'login'

/** analyzeItemPhoto가 던진 오류를 AnalyzeFailKind로 나눈다. ApiError가 아닌 예외(코드 실수 등)는 다시 시도로 본다 */
export function analyzeFailKind(e: unknown): AnalyzeFailKind {
  if (!(e instanceof ApiError)) return 'retry'
  if (e.status === 0) return 'offline'
  if (e.status === 401) return 'login'
  if (e.status === 413 || e.status === 415 || e.status === 422) return 'replace'
  return 'retry'
}

/**
 * 사진 분석 결과. retake로 두 경우를 나눈다.
 * - { retake: true }: 옷이 잘 보이지 않아 다시 찍어야 한다. 서버에 저장되지 않았고 id도 없다
 * - { retake: false, ... }: 서버에 DRAFT(확정 전 임시 저장)로 저장된 옷과 AI가 고른 값
 *   - draftId: 서버가 정한 옷 id(문자열). 확정 저장(POST /api/closet/items/{id}/confirm)에 그대로 쓴다.
 *     서버 id는 큰 숫자(bigint)라 Number로 바꾸면 값이 틀어질 수 있고, Item.id(숫자)와 맞출지는 팀 확인 전이라 문자열로 둔다
 *   - previewImg: 잘라 낸 옷 사진 주소(WebP). 5분만 열리는 임시 주소라 옷장에 저장해 두면 안 된다
 *   - name: AI가 만든 옷 이름 (50자 이내)
 *   - cat: 종류. 서버도 CATS의 다섯 가지만 준다
 *   - sub·color·hex: AI가 고르지 못하면 null. 색이 null이면 확정할 때 사용자가 꼭 골라야 한다
 *   - styles: 어울리는 스타일 (미니멀·클래식 등, 겹치지 않음). 없으면 빈 배열
 */
export type ItemPhotoAnalysis =
  | { retake: true }
  | {
    retake: false; draftId: string; previewImg: string; name: string
    cat: Category; sub: string | null; color: string | null; hex: string | null; styles: string[]
  }

/** 서버가 주는 분석 응답 모양 (필드 이름은 서버 그대로). 이 파일 밖으로 내보내지 않는다 */
type AnalyzeResponse = {
  retake?: unknown; id?: unknown; previewImg?: unknown; category?: unknown; sub_category?: unknown
  color?: unknown; hex?: unknown; styles?: unknown; name?: unknown
}

const isText = (v: unknown): v is string => typeof v === 'string' && v !== ''
const isCategory = (v: unknown): v is Category => (CATS as readonly unknown[]).includes(v)
const STYLE_NAMES = STYLES.map(([name]) => name)

/**
 * 서버 응답을 ItemPhotoAnalysis로 바꾼다.
 * - 꼭 있어야 하는 값(retake, 그리고 다시 찍기가 아니면 id·previewImg·category)이 없거나 틀리면 502 ApiError를 던진다.
 *   서버가 잘못된 ML 결과를 502로 거절하는 것과 같은 뜻이라, 화면도 같은 '잠시 후 다시' 안내를 보여 준다
 * - 비어도 되는 값은 프론트 목록에 없는 값이면 null(또는 빼기)로 둔다. 확인 창은 SUBS·COLORS 목록의 버튼만 그리므로
 *   목록에 없는 값이 들어오면 아무 버튼도 켜지지 않은 채 그 값으로 저장되어 버리기 때문이다.
 *   색은 BE가 FE의 COLORS 18색으로 맞춰 주기로 했지만(FE_API_HANDOFF 5장 색상 계약), 아직 배포 전이라 한 번 더 거른다
 */
function toAnalysis(raw: AnalyzeResponse): ItemPhotoAnalysis {
  if (raw.retake === true) return { retake: true }
  if (raw.retake !== false || !isText(raw.id) || !isText(raw.previewImg) || !isCategory(raw.category)) {
    throw new ApiError(502, 'BAD_RESPONSE', '사진을 확인하지 못했어요. 잠시 후 다시 시도해 주세요')
  }
  const cat = raw.category
  const sub = isText(raw.sub_category) && SUBS[cat].includes(raw.sub_category) ? raw.sub_category : null
  const color = isText(raw.color) && raw.color in COLORS ? raw.color : null
  // hex는 색 이름이 있을 때만 의미가 있다 (서버도 색과 맞는 RGB가 있을 때만 준다). 모양이 #RRGGBB가 아니면 버린다
  const hex = color && isText(raw.hex) && /^#[0-9A-F]{6}$/i.test(raw.hex) ? raw.hex.toUpperCase() : null
  const styles = Array.isArray(raw.styles) ? raw.styles.filter((s): s is string => STYLE_NAMES.includes(s as string)) : []
  // 이름이 비어 오면 확인 창과 같은 규칙("색 세부 종류", 없으면 종류)으로 만든다
  const name = isText(raw.name) ? raw.name : [color, sub || cat].filter(Boolean).join(' ')
  return { retake: false, draftId: raw.id, previewImg: raw.previewImg, name, cat, sub, color, hex, styles }
}

/**
 * 옷 사진 한 장을 서버에 보내 분석 결과를 받는다. 화면에서는 줄인 사진(Upload.tsx의 Tile.file, 1024px JPEG)을 넘긴다.
 * - 입력: 사진 파일(File 또는 Blob) 한 장. 여러 장이면 한 장씩 따로 부른다 (서버가 한 번에 한 장만 받음)
 * - 결과: ItemPhotoAnalysis (다시 찍기 또는 AI가 고른 값)
 * - 실패하면 ApiError를 던진다. 문구는 ANALYZE_ERRORS 표, 화면에 보여 줄 때는 errorText(api/error.ts)를 쓴다.
 *   - 형식이 맞지 않거나(415) 너무 크면(413) 서버에 보내지 않고 바로 던진다.
 *     서버가 줄 상태 코드와 같은 값을 넣어서, errorText가 '서버에 연결할 수 없어요'(status 0) 대신 표의 문구를 보여 준다
 *   - 403(CSRF 토큰 없음·틀림)이면 /api/auth/me로 토큰을 새로 받아 한 번만 다시 보낸다 (logout과 같은 방식).
 *     /me가 로그인 안 됨이면 401로 알린다
 *   - 서버에 닿지 못하거나 20초 안에 응답이 없으면 closetFetch가 ApiError(status 0)를 던진다
 */
export async function analyzeItemPhoto(file: Blob): Promise<ItemPhotoAnalysis> {
  if (!ANALYZE_TYPES.includes(file.type)) throw analyzeError(415)
  if (file.size > ANALYZE_MAX_BYTES) throw analyzeError(413)
  // 가짜 데이터 상태: 형식·크기 검사까지는 실제와 같이 하고, 서버 대신 가짜 결과를 돌려준다
  if (MOCK.closet) return mock(MOCK_ANALYSES[mockTurn++ % MOCK_ANALYSES.length], MOCK_ANALYZE_MS)

  // 파일 이름이 없으면 서버(Spring)가 파일이 아닌 일반 값으로 받아 400이 나서, 형식에 맞는 이름을 붙인다
  const name = file instanceof File && file.name ? file.name : `garment.${EXT[file.type]}`
  // Content-Type은 적지 않는다. FormData를 보내면 브라우저가 경계값(boundary)까지 넣어 정한다.
  // closetFetch는 본문이 문자열일 때만 JSON Content-Type을 붙이므로 FormData는 그대로 간다. CSRF 헤더는 closetFetch가 붙인다.
  // 다시 보낼 때 같은 FormData를 쓰지 않고 새로 만든다 (보내는 중에 읽힌 본문을 다시 쓰지 않으려고)
  const send = () => {
    const body = new FormData()
    body.append('image', file, name)
    return closetFetch('/api/closet/analyze', { method: 'POST', body, timeoutMs: ANALYZE_TIMEOUT_MS })
  }

  let res = await send()
  if (res.status === 403) {
    if (!(await fetchMe())) throw analyzeError(401) // 토큰을 받으러 갔더니 로그인이 풀려 있음
    res = await send()
  }
  if (!res.ok) throw analyzeError(res.status)

  let raw: unknown
  try { raw = await res.json() } catch { raw = null } // 본문이 JSON이 아니면 아래에서 502로 처리
  if (!raw || typeof raw !== 'object') throw new ApiError(502, 'BAD_RESPONSE', '사진을 확인하지 못했어요. 잠시 후 다시 시도해 주세요')
  return toAnalysis(raw as AnalyzeResponse)
}
