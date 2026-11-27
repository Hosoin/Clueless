// 옷 등록: 사진을 여러 장 올리면 AI가 사진마다 종류·세부 종류·색·재질을 미리 골라 두고, 사용자는 한 벌씩 확인한다 (담당: B)
// 흐름 (Figma 3. 옷 등록): 사진 올리기 → 확인 중 → 한 벌씩 확인 창(1/N … N/N) → 옷장
// - 예전에는 사진마다 후보 3개를 고르게 했는데, 고르는 일이 사진 수만큼 늘어서 바꿨다.
//   지금은 AI가 고른 값이 선택된 채로 창이 열리고, 사용자는 틀린 것만 눌러 바꾼 뒤 '다음 옷'을 누른다.
// - 첫 사진의 분석이 끝나면 확인 창이 저절로 열린다. 다음 사진이 아직 분석 중이면 창 안에서 기다린다.
// - 마지막 옷에서는 버튼이 '옷장에 N벌 넣기'로 바뀌고, 누르면 한꺼번에 옷장에 넣는다.
// - 무늬는 이 프로젝트에서 다루지 않는다. 고르는 칸이 없고 옷에도 저장하지 않는다.
// 분석: 올린 사진은 서버의 옷 사진 분석 API(api/items.ts의 analyzeItemPhoto)로 한 장씩 차례로 보낸다 (runAnalysis).
//   서버에는 원본이 아니라 Tile.file(1024×1024px로 줄인 JPEG)을 보낸다. 그래서 먼저 줄이고(resizeImage, src/image.ts) 줄인 뒤에 분석한다.
//   예시 사진(앱 안 이미지)은 보낼 파일이 없어서 화면 안의 가짜 결과(DEMO_PREDS)를 쓴다.
//   가짜 데이터 상태(VITE_MOCK_CLOSET=true)면 올린 사진도 api/items.ts 안의 가짜 결과를 받는다.
// - 결과는 사진마다 다르다: 정리됨(AI 값이 채워짐), 다시 찍기(서버가 retake를 줌), 실패(서버 오류·연결 안 됨 등).
//   다시 찍기·실패한 사진은 확인 창에서 빼거나 다시 찍고/다시 시도할 수 있고, 옷장에 넣을 때는 넣지 않는다.
// - 분석은 이 화면이 열려 있을 때만 다음 사진으로 넘어간다: 화면을 나가면 보내던 한 장만 끝내고 멈추고,
//   돌아오면 남은 사진을 이어서 분석한다.
// - 아직 확정 저장(confirm API)은 연결하지 않았다. 옷장에 넣기는 지금처럼 앱 안에서만 넣고,
//   서버에 DRAFT로 저장된 옷(Tile.draftId)은 확정 저장을 연결할 때 쓴다.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { analyzeFailKind, analyzeItemPhoto } from '../api/items'
import type { AnalyzeFailKind } from '../api/items'
import { errorText } from '../api/error'
import { Back, CameraIc, RetryIc } from '../components/Icons'
// MATERIALS(재질 목록)는 재질 칸을 숨기는 동안 쓰지 않아 빼 두었다. 재질 칸을 다시 보이게 할 때 아래 주석과 함께 되살린다
import { CATS, COLORS, /* MATERIALS, */ SUBS, photo } from '../data/seed'
import type { Category } from '../data/types'
import { resizeImage } from '../image'
import { go, toLogin } from '../nav'
import { S, addItems, emit, euro, present, registerModuleReset, resetClosetFilters, useApp } from '../store'
import { askPermission, closeAll, closeModal, openModal, openSheet, toast } from '../ui'

/**
 * AI가 사진 한 장을 보고 고른 값 (1순위). 확인 창이 이 값이 선택된 채로 열린다.
 * name은 옷장에 보일 이름("카멜 롱 코트"), 나머지는 옷장에 저장될 값. material은 모르면 null
 */
type Pred = { name: string; cat: Category; sub: string | null; color: string | null; material: string | null }
/**
 * 사진 한 장의 분석 단계.
 * - resizing: 사진을 줄이는 중. 보낼 사진이 아직 없어서 분석을 시작하지 않는다
 * - waiting: 분석 차례를 기다리는 중 / analyzing: 서버에 보내 결과를 기다리는 중 (둘 다 타일에 '확인 중' 표시)
 * - done: 분석이 끝나 AI 값이 채워짐. 확인 창에서 고칠 수 있다
 * - retake: 서버가 다시 찍어야 한다고 함 (옷이 잘 안 보임). 서버에 저장되지 않았다
 * - failed: 분석 요청이 실패함. error에 화면에 보여 줄 문구가 있다. 다시 시도할 수 있다
 */
type Status = 'resizing' | 'waiting' | 'analyzing' | 'done' | 'retake' | 'failed'
/**
 * 올린 사진 한 장의 정리 상태.
 * - status: 분석 단계 (위 Status). error: 실패했을 때 보여 줄 문구 (실패가 아니면 null)
 * - failKind: 실패했을 때 사용자가 할 수 있는 일 (api/items.ts의 AnalyzeFailKind). 확인 창과 사진 칸이 이 값으로 버튼을 고른다
 * - name·cat·sub·color·material: 옷장에 넣을 값. 분석이 끝나면 AI 값으로 채워지고, 확인 창에서 바꿀 수 있다.
 *   종류·세부 종류·색을 바꾸면 name은 비워서, 옷장에 넣을 때 "색 세부 종류"로 새로 만든다 (AI 이름과 실제 값이 어긋나지 않게).
 *   재질은 이름에 들어가지 않아서 바꿔도 name을 비우지 않는다. 서버 분석은 재질을 주지 않아서 올린 사진은 재질이 null이다
 * - hex: "사진에서 색 뽑기"를 했을 때만 있는 실제 색. 서버가 주는 hex는 지금 쓰지 않는다 (확정 저장을 연결할 때 정함)
 * - file: 서버로 보낼 사진 (1024×1024px JPEG, 남는 곳은 흰 여백). 예시 사진은 앱 안 이미지라 보낼 파일이 없어서 null
 * - draftId: 서버가 DRAFT로 저장한 옷의 id. 확정 저장(confirm)에 쓸 값이라 받아만 둔다. 예시 사진과 가짜 데이터는 서버 id가 아니다
 * - alias: 확인 창에서 붙인 별명 (선택, 12자까지). 비어 있으면 별명 없이 원래 이름으로 넣는다.
 *   옷장에 넣을 때 Item.alias가 된다. 서버 옷 API에는 아직 별명 칸이 없어서 앱 안에만 남는다 (11/27)
 */
type Tile = {
  id: number; img: string | null; file: Blob | null; status: Status; error: string | null; failKind: AnalyzeFailKind | null; draftId: string | null
  name: string | null; cat: Category | null; sub: string | null; color: string | null; material: string | null; hex: string | null
  alias: string
}

// 가짜 분석 결과. 예시 사진(아래 DEMO_IDS)과 같은 순서. Figma 3. 옷 등록의 예시(1/6 면, 3/6 울, 6/6 데님)와 값을 맞췄다
const DEMO_PREDS: Pred[] = [
  { name: '화이트 반팔 티셔츠', cat: '상의', sub: '티셔츠', color: '화이트', material: '면' },
  { name: '블랙 플리츠 스커트', cat: '하의', sub: '스커트', color: '블랙', material: '폴리' },
  { name: '카멜 롱 코트', cat: '아우터', sub: '코트', color: '카멜', material: '울' },
  { name: '아이보리 크로셰 원피스', cat: '원피스', sub: '원피스', color: '아이보리', material: '면' },
  { name: '네이비 오버핏 셔츠', cat: '상의', sub: '셔츠', color: '네이비', material: '면' },
  { name: '인디고 와이드 데님', cat: '하의', sub: '데님', color: '데님', material: '데님' },
]
// 예시 사진으로 쓸 옷장 옷 id (DEMO_PREDS와 순서가 같음)
const DEMO_IDS = [4, 7, 10, 12, 5, 6]
/**
 * 화면에서 잠시 숨긴 종류. 덧입기는 당분간 옷 등록에서 고르지 않는다 (2026-11-26).
 * 다시 보이게 하려면 이 목록에서 빼면 된다. 데이터(CATS)와 다른 화면은 그대로 둔다
 */
const HIDDEN_CATS: readonly string[] = ['덧입기']
/** 지금 올려 둔 사진들. 화면을 나갔다 와도 이어서 정리할 수 있게 모듈 변수로 둔다 */
let batch: Tile[] = []
/** 확인 창에서 보고 있는 사진의 순서 (0부터). 창을 닫았다가 '이어서 확인하기'를 누르면 여기서 다시 연다 */
let cur = 0
/** 이 묶음에서 확인 창을 저절로 연 적이 있는지. 사용자가 창을 닫은 뒤에 다른 사진 분석이 끝나도 다시 열지 않으려고 둔다 */
let autoOpened = false
/** 분석 차례 돌리기(runAnalysis)가 돌고 있는지. 두 번 돌면 같은 사진을 두 번 보내게 되어 하나만 돌게 막는다 */
let analyzing = false
/** 지금 이 화면이 열려 있는지. 화면을 나가면 다음 사진을 보내지 않고, 사진 줄이기가 나간 뒤에 끝나도 분석을 시작하지 않는다 */
let onScreen = false
/** 몇 번째 사진 묶음인지. 새 묶음을 받거나 로그아웃한 뒤에 늦게 끝난 이전 묶음의 결과(줄이기·분석)를 버리려고 비교한다 */
let batchSeq = 0
/** 예시 사진의 가짜 분석이 걸리는 시간(밀리초). 실제 분석처럼 '확인 중'이 잠깐 보이게 */
const DEMO_ANALYZE_MS = 650

/** 분석이 끝난 사진에 AI 값을 채운다. 예시 사진의 가짜 결과와 서버 결과 모두 여기로 넣는다 */
function fill(b: Tile, p: Pred) {
  b.name = p.name; b.cat = p.cat; b.sub = p.sub; b.color = p.color; b.material = p.material; b.hex = null
  b.status = 'done'; b.error = null; b.failKind = null
}

/** 다 찍었거나 실패해서 다시 해야 하는 사진인지. 확인 창에서 고를 칸 없이 건너뛸 수 있다 */
const needsRedo = (b: Tile) => b.status === 'retake' || b.status === 'failed'
/** 아직 분석 결과를 기다리는 사진인지 (줄이는 중·차례 기다림·서버 응답 기다림). 타일과 확인 창에 '확인 중'을 보여 준다 */
const isPending = (b: Tile) => b.status === 'resizing' || b.status === 'waiting' || b.status === 'analyzing'

/**
 * 사진 한 장을 분석해 결과를 채운다. i는 묶음 안의 순서로, 예시 사진의 가짜 결과를 고를 때 쓴다.
 * - 예시 사진(file 없음): 잠깐 기다렸다 DEMO_PREDS에서 같은 순서의 결과를 넣는다
 * - 올린 사진: 서버에 보내고, 다시 찍기면 retake, 실패하면 failed와 보여 줄 문구를 넣는다.
 *   서버가 준 previewImg(잘라 낸 사진)는 5분만 열리는 주소라 쓰지 않고, 미리보기는 내 기기의 사진(img)을 그대로 쓴다
 */
async function analyzeTile(b: Tile, i: number) {
  if (!b.file) {
    await new Promise((done) => setTimeout(done, DEMO_ANALYZE_MS))
    fill(b, DEMO_PREDS[i % DEMO_PREDS.length])
    return
  }
  try {
    const r = await analyzeItemPhoto(b.file)
    if (r.retake) { b.status = 'retake'; b.error = null; return }
    fill(b, { name: r.name, cat: r.cat, sub: r.sub, color: r.color, material: null })
    b.draftId = r.draftId
  } catch (e) {
    b.status = 'failed'; b.error = errorText(e) // 서버 오류(5xx)는 '잠시 후 다시 시도해 주세요'처럼 일반 문구로 바뀐다
    b.failKind = analyzeFailKind(e)
  }
}

/**
 * 차례를 기다리는 사진(waiting)을 앞에서부터 한 장씩 분석한다. 새 묶음을 받았을 때, 화면에 다시 들어왔을 때,
 * 다시 시도·다시 찍기를 했을 때 부른다. 이미 돌고 있으면 그 차례 돌리기가 새 사진까지 이어서 맡는다.
 * - 한 장씩 보내는 이유: 9장을 한꺼번에 보내면 서버와 ML이 몰리고, 첫 결과도 늦게 나온다
 * - 화면을 나가면(onScreen false) 보내던 한 장은 끝까지 받아 채우고, 다음 사진은 보내지 않는다
 * - 보내는 사이 새 묶음을 받았거나 로그아웃했으면(batchSeq가 바뀜) 그 결과로 창을 열지 않는다 (이전 묶음의 타일이라 화면에 없음)
 * - 처음으로 정리된 사진이 나오면 확인 창을 저절로 연다 (묶음마다 한 번만). 다시 찍기·실패로는 열지 않는다
 * - 서버에 닿지 못했거나(offline) 로그인이 풀렸으면(login) 남은 사진도 모두 같은 결과라서 더 보내지 않고 멈춘다 (stopRest).
 *   연결이 안 될 때 사진마다 시간 초과(20초)를 기다리게 하지 않으려는 것이다
 */
async function runAnalysis() {
  if (analyzing) return
  analyzing = true
  try {
    while (onScreen) {
      const b = batch.find((t) => t.status === 'waiting')
      if (!b) break
      const seq = batchSeq
      b.status = 'analyzing'; emit()
      await analyzeTile(b, batch.indexOf(b))
      if (seq !== batchSeq) continue
      // analyzeTile이 status를 바꾸지만 TypeScript는 위에서 넣은 'analyzing'으로 알고 있어서(함수 안의 변경을 따라가지 않음),
      // 바뀐 값을 Status로 다시 읽는다
      const result = b.status as Status
      if (result === 'failed' && (b.failKind === 'offline' || b.failKind === 'login')) { stopRest(b); emit(); break }
      if (result === 'done' && !autoOpened && onScreen) { autoOpened = true; openConfirm(batch.indexOf(b)) } else emit()
    }
  } finally { analyzing = false }
}

/** 차례를 기다리던 사진을 모두 cause와 같은 실패로 바꾼다. 보내지 않은 사진이지만 보내도 같은 결과라서,
 *  '확인 중'으로 멈춰 있게 두지 않고 같은 안내와 버튼('모두 다시 시도'·'로그인하기')을 보여 준다 */
function stopRest(cause: Tile) {
  batch.forEach((t) => {
    if (t.status !== 'waiting') return
    t.status = 'failed'; t.error = cause.error; t.failKind = cause.failKind
  })
}

/** 확인 창에서 실패한 사진의 제목. 아래 문구(b.error)는 api/items.ts가 상태 코드별로 정한 것이다 */
const FAIL_TITLE: Record<AnalyzeFailKind, string> = {
  retry: '이 사진을 확인하지 못했어요',
  offline: '이 사진을 확인하지 못했어요', // 아래 문구가 '서버에 연결할 수 없어요'라서 제목은 겹치지 않게 둔다
  replace: '이 사진은 쓸 수 없어요',
  login: '로그인이 필요해요',
}

/** 다시 보내면 될 수도 있는 실패인지 (다시 시도·연결 안 됨). 같은 사진으로는 안 되는 실패(replace)와 로그인 필요(login)는 아니다 */
const canRetry = (b: Tile) => b.status === 'failed' && (b.failKind === 'retry' || b.failKind === 'offline')

/** 실패한 사진을 다시 분석한다. 차례 맨 뒤가 아니라 앞에서부터 찾으므로 남은 사진보다 먼저 보낼 수도 있다 */
function retryTile(b: Tile) {
  b.status = 'waiting'; b.error = null; b.failKind = null
  emit()
  runAnalysis()
}

/** 사진 칸 버튼의 이름 (화면 읽기 프로그램용). 눌렀을 때 무슨 일이 일어나는지 말한다. i는 0부터 */
function tileLabel(b: Tile, i: number) {
  const nth = `${i + 1}번째 사진`
  if (isPending(b)) return '확인 중'
  if (b.status === 'retake') return `${nth} 다시 찍기`
  if (canRetry(b)) return `${nth} 다시 시도`
  if (b.failKind === 'replace') return `${nth} 다른 사진으로 바꾸기`
  if (b.failKind === 'login') return `${nth} 로그인 필요`
  return `${i + 1}번째 옷 확인하기`
}

/** 다시 보내면 될 수도 있는 실패 사진을 모두 다시 분석한다 (연결이 끊겼다가 돌아왔을 때 한 번에 다시 하려고) */
function retryAll() {
  batch.filter(canRetry).forEach((t) => { t.status = 'waiting'; t.error = null; t.failKind = null })
  emit()
  runAnalysis()
}

/** 로그인 화면으로 보낸다. 끝나면 옷 등록으로 돌아온다. 창이 열려 있으면 닫고 간다.
 *  Google 로그인은 앱이 새로 열려 올려 둔 사진이 사라지므로, 사진은 로그인한 뒤 다시 골라야 한다 */
function loginForUpload() {
  closeAll()
  toLogin('/upload')
}

/** 사진을 목록에서 뺀다 (다시 찍기·실패한 사진). 확인 창에서 보던 순서가 끝을 넘으면 마지막 사진으로, 다 빠지면 창을 닫는다 */
function removeTile(b: Tile) {
  if (b.img?.startsWith('blob:')) URL.revokeObjectURL(b.img)
  batch = batch.filter((t) => t !== b)
  if (!batch.length) { cur = 0; closeAll(); return }
  cur = Math.min(cur, batch.length - 1)
  emit()
}

/**
 * 다시 찍어야 하는 사진을 새로 찍은 사진으로 바꾼다. 카메라 권한을 묻고 폰 기본 카메라(또는 파일 고르기)를 연다.
 * 새 사진도 줄인 뒤 같은 자리에서 다시 분석한다. 줄이는 사이 이 사진이 목록에서 빠졌으면(새 묶음 등) 새 사진은 버린다
 */
function retakeTile(b: Tile) {
  askPermission('camera', () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment'
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return
      b.status = 'resizing'; emit()
      const small = await resizeImage(f)
      if (!batch.includes(b)) return
      if (b.img?.startsWith('blob:')) URL.revokeObjectURL(b.img)
      b.file = small; b.img = URL.createObjectURL(small); b.status = 'waiting'; b.error = null; b.failKind = null; b.draftId = null
      emit()
      runAnalysis()
    }
    input.click()
  })
}

/**
 * 사진 여러 장(최대 9장)을 받아 1024×1024px로 줄인 뒤 분석을 시작한다. files가 없으면 예시 사진 6장으로 해 본다.
 * - 줄이는 동안 타일은 '확인 중'으로 보이고, 다 줄이면 줄인 사진으로 미리보기(img)와 보낼 파일(file)을 채운다.
 *   미리보기도 줄인 사진을 쓰는 이유: 서버로 가는 사진과 화면에 보이는 사진이 같아야 하고, 큰 원본을 9장 들고 있으면 폰 메모리를 많이 쓴다
 * - 새 묶음이 이전 묶음을 바꾸므로, 이전 묶음에 남아 있던(옷장에 넣지 않은) 사진의 주소는 해제한다.
 *   옷장에 넣은 사진은 넣을 때 batch에서 빠지므로 여기서 해제되지 않는다 (옷장 사진으로 계속 쓰임).
 *   그 옷을 나중에 지우면 store.ts의 deleteItem이 주소를 해제한다 (그 사진을 쓰는 글이 남아 있으면 두고).
 */
async function startBatch(files: FileList | Blob[] | null) {
  batch.forEach((b) => { if (b.img?.startsWith('blob:')) URL.revokeObjectURL(b.img) }) // 예시 사진(앱 안 이미지)은 blob이 아니라 해제하지 않음
  const list: (Blob | undefined)[] = files && files.length ? [...files].slice(0, 9) : Array.from({ length: 6 })
  const seq = ++batchSeq
  const tiles: Tile[] = list.map((f, i) => ({
    id: ++S.uid, img: f ? null : photo(DEMO_IDS[i % DEMO_IDS.length]) || null, file: null,
    status: f ? 'resizing' : 'waiting', error: null, failKind: null, draftId: null, // 예시 사진은 줄일 것이 없어서 바로 차례를 기다린다
    name: null, cat: null, sub: null, color: null, material: null, hex: null, alias: '',
  }))
  batch = tiles; cur = 0; autoOpened = false
  emit()
  // 여러 장을 한꺼번에 줄인다. resizeImage는 실패해도 원본을 돌려주므로 여기서 멈추지 않는다
  const resized = await Promise.all(list.map((f) => (f ? resizeImage(f) : Promise.resolve(null))))
  if (seq !== batchSeq) return // 줄이는 사이에 새 묶음을 받았으면 이 결과는 버린다 (아직 주소를 만들지 않아 해제할 것도 없음)
  tiles.forEach((b, i) => {
    const f = resized[i]; if (!f) return
    b.file = f; b.img = URL.createObjectURL(f); b.status = 'waiting'
  })
  emit()
  runAnalysis() // 화면을 나간 뒤에 끝났으면 runAnalysis가 바로 멈추고, 돌아올 때 Upload의 useEffect가 이어서 한다
}

/** 옷장에 넣을 수 있는지: 분석이 끝났고 종류와 색이 있어야 한다 (세부 종류·재질은 몰라도 넣을 수 있음).
 *  서버가 색을 못 고르면(color null) 사용자가 색을 골라야 넣을 수 있다 */
const isSet = (b: Tile) => b.status === 'done' && !!b.cat && !!b.color

/**
 * 정리한 사진을 모두 옷장에 넣는다. 확인 창의 마지막 옷에서 '옷장에 N벌 넣기'를 누르면 부른다.
 * 이름이 비어 있으면(값을 바꾼 경우) "색 세부 종류"로 새로 만든다. 넣은 사진은 batch에서 빼서, 다음 묶음을 받을 때 주소가 해제되지 않게 한다
 */
function putInCloset() {
  const take = batch.filter(isSet)
  // 홈의 선택은 ID 기반이므로 새 옷을 맨 앞에 넣어도 기존 선택이 유지된다
  addItems(take.map((b) => ({
    id: b.id, name: b.name || `${b.color} ${b.sub || b.cat}`, alias: b.alias.trim() || null, cat: b.cat!, sub: b.sub, color: b.color!, hex: b.hex, material: b.material,
    rec: 0, tags: [], lastWorn: null, img: b.img || undefined, isNew: true, added: Date.now(),
  })))
  batch = batch.filter((b) => !isSet(b))
  cur = 0 // 남은 사진이 있으면 처음부터 이어서 확인. 그대로 두면 남은 장수보다 큰 번호가 남아 '이어서 확인하기 (6 / 1)'처럼 보였다
  closeAll()
  toast(`${take.length}벌을 옷장에 넣었어요`)
  // 옷장에서 '내 옷'을 최근 넣은 순으로, 종류 탭은 '전체', 색 필터는 '모든 색'으로 보여 줘야 새 옷이 맨 앞에 다 보인다.
  // 탭·필터를 그대로 두면 '하의' 탭이나 '블랙' 필터가 켜진 채 열려 방금 넣은 옷이 안 보였다
  resetClosetFilters()
  go('/closet')
}

export default function Upload() {
  useApp()
  const nav = useNavigate()
  const album = useRef<HTMLInputElement>(null), shot = useRef<HTMLInputElement>(null)
  const [cam, setCam] = useState(false)
  // 화면에 들어오면 남은 사진 분석을 이어서 하고, 나가면 다음 사진을 보내지 않는다 (보내던 한 장은 끝까지 받는다)
  useEffect(() => { onScreen = true; runAnalysis(); return () => { onScreen = false } }, [])
  // 진행 줄의 숫자: 정리됨, 확인 중(줄이기·차례·응답 기다림), 다시 필요(다시 찍기·실패)
  const done = batch.filter((b) => b.status === 'done').length
  const checking = batch.filter(isPending).length
  const redo = batch.filter(needsRedo).length
  const progressNote = [checking && `${checking}장 확인 중`, redo && `${redo}장 다시 필요`].filter(Boolean).join(' · ')
  // 사진 칸 위 알림: 로그인이 풀렸거나 서버에 닿지 못해 분석을 멈췄을 때, 또는 다시 시도할 사진이 여러 장일 때 한 번에 처리하게 한다
  const needLogin = batch.some((b) => b.status === 'failed' && b.failKind === 'login')
  const offline = batch.some((b) => b.status === 'failed' && b.failKind === 'offline')
  const retryCount = batch.filter(canRetry).length
  return (
    <section className="screen on" id="s-upload">
      <button className="backrow" onClick={() => nav('/closet')}><Back />옷장</button>
      <div className="head pt4"><h1>Add <i>Items</i></h1></div>
      <div className="pad">
        <div className="row2" style={{ marginTop: 20 }}>
          <button className="btn solid" onClick={() => askPermission('photos', () => album.current?.click())}>앨범에서 고르기</button>
          <button className="btn" onClick={async () => {
            if (!navigator.mediaDevices?.getUserMedia) return askPermission('camera', () => shot.current?.click()) // https가 아니면 브라우저가 묻지 않으므로 앱이 먼저 물음
            setCam(true)
          }}>바로 찍기</button>
        </div>
        <input type="file" ref={album} accept="image/*" multiple hidden onChange={(e) => { startBatch(e.target.files); e.target.value = '' }} />
        <input type="file" ref={shot} accept="image/*" capture="environment" hidden onChange={(e) => { startBatch(e.target.files); e.target.value = '' }} />
        {!batch.length ? (
          <div className="empty" style={{ paddingTop: 56 }}>아직 고른 사진이 없어요<br />
            <button className="btn cta" onClick={() => startBatch(null)}>예시 사진으로 해 보기</button></div>
        ) : (
          <>
            <div className="prog"><b>{batch.length}장 중 {done}장 정리했어요</b><span>{progressNote}</span></div>
            <div className="track"><i style={{ width: `${(done / batch.length) * 100}%` }} /></div>
            {/* 분석을 멈췄거나 다시 할 사진이 여러 장이면 한 번에 처리하는 알림. 로그인이 먼저다 (로그인 없이는 다시 시도해도 실패) */}
            {needLogin ? (
              <div className="upnote"><p>로그인하면 사진을 확인할 수 있어요</p><button className="btn solid" onClick={loginForUpload}>로그인하기</button></div>
            ) : (offline || retryCount > 1) && retryCount > 0 ? (
              <div className="upnote"><p>{offline ? '서버에 연결할 수 없어 확인을 멈췄어요' : `${retryCount}장을 확인하지 못했어요`}</p>
                <button className="btn solid" onClick={retryAll}><RetryIc />모두 다시 시도</button></div>
            ) : null}
            {/* 사진 칸: 후보 목록 없이 사진만 보인다.
                정리된 사진·다시 찍을 사진을 누르면 그 사진부터 확인 창이 열린다.
                실패한 사진은 다시 보내면 될 수 있으면(canRetry) 눌러서 그 사진만 다시 분석하고,
                같은 사진으로는 안 되거나(replace) 로그인이 필요하면(login) 확인 창을 열어 할 수 있는 일을 보여 준다 */}
            <div className="grid3 mt16">
              {batch.map((b, i) => (
                <div key={b.id} className="tile">
                  <button className={`ph ${isPending(b) ? 'wait' : ''} ${b.status === 'retake' ? 'dim' : ''}`} disabled={isPending(b)}
                    aria-label={tileLabel(b, i)}
                    onClick={() => (canRetry(b) ? retryTile(b) : openConfirm(i))}>
                    {b.img && <img src={b.img} alt="" />}
                    {isPending(b) && <span className="spin" />}
                    {b.status === 'retake' && <span className="band"><CameraIc />다시 찍기</span>}
                    {canRetry(b) && <span className="band bad"><RetryIc />실패 · 다시 시도</span>}
                    {b.failKind === 'replace' && b.status === 'failed' && <span className="band bad"><CameraIc />다른 사진 필요</span>}
                    {b.failKind === 'login' && b.status === 'failed' && <span className="band bad">로그인 필요</span>}
                  </button>
                </div>
              ))}
            </div>
            <p className="hint">
              {done || redo ? '사진을 누르면 그 옷부터 다시 확인할 수 있어요' : '사진을 확인하고 있어요. 첫 옷이 확인되면 한 벌씩 보여 드릴게요'}
              {retryCount > 0 && <><br />‘실패’한 사진은 누르면 다시 확인해요</>}
            </p>
            {/* 확인 창을 닫았을 때 돌아가는 길. 확인할 사진(정리됨·다시 필요)이 하나도 없으면 누를 것이 없어 숨긴다 */}
            {(done > 0 || redo > 0) && <button className="btn solid full mt16" onClick={() => openConfirm(cur)}>이어서 확인하기 ({cur + 1} / {batch.length})</button>}
          </>
        )}
      </div>
      {cam && <Camera onClose={(shots) => { setCam(false); if (shots.length) startBatch(shots) }} onFail={(denied) => {
        setCam(false)
        if (denied) toast('카메라 접근을 허용해야 바로 찍을 수 있어요. 브라우저 설정에서 바꿀 수 있어요')
        else askPermission('camera', () => shot.current?.click()) // 카메라를 못 쓰는 환경이면 폰 기본 카메라로
      }} />}
    </section>
  )
}

/** 바로 찍기: 여러 장 찍고 완료 */
/**
 * 바로 찍기 화면. 이 화면이 떠 있는 동안에만 카메라를 켜고, 닫거나 다른 화면으로 가면 바로 끈다.
 * - 켜기: 화면이 나타날 때(useEffect) 한 번 카메라를 요청한다. 브라우저가 이때 권한을 묻는다
 * - 끄기: 화면이 사라질 때(useEffect의 정리 함수) 모든 카메라 트랙을 멈춘다. '닫기·완료' 버튼, 다른 탭으로 이동,
 *   뒤로 가기 모두 화면이 사라지므로 같은 곳에서 끈다
 * - 카메라 응답이 오기 전에 화면이 먼저 닫히면(cancelled), 늦게 온 카메라를 받자마자 끈다.
 *   개발 모드(StrictMode)는 화면을 한 번 붙였다 떼었다 다시 붙이는데, 이걸 안 하면 첫 번째 카메라가 꺼지지 않고 남아
 *   주소창에 카메라 사용 표시가 계속 떠 있었다
 * onClose(shots): 찍은 사진들을 넘기며 닫기, onFail(denied): 카메라를 못 켰을 때 (denied = 사용자가 권한을 거절함)
 */
function Camera({ onClose, onFail }: { onClose: (shots: Blob[]) => void; onFail: (denied: boolean) => void }) {
  const v = useRef<HTMLVideoElement>(null), flash = useRef<HTMLDivElement>(null)
  // 찍은 사진. 셔터를 누르면 JPEG로 만드는 일(toBlob)이 끝나기 전에 바로 자리를 잡아 두고(약속 Promise),
  // 완료를 누르면 만들던 사진이 모두 끝날 때까지 기다렸다 넘긴다. 전에는 끝난 사진만 목록에 넣어서,
  // 셔터 직후 바로 완료를 누르면 마지막 사진이 빠졌다 (코드 리뷰 35번)
  const pending = useRef<Promise<Blob | null>[]>([])
  const [count, setCount] = useState(0) // 찍은 장 수 (버튼 글자와 'n장' 표시용)
  const closing = useRef(false) // 완료를 두 번 눌러도 한 번만 넘기게
  const failRef = useRef(onFail)
  useEffect(() => {
    let cancelled = false, stream: MediaStream | null = null
    const video = v.current // 정리할 때 같은 video를 가리키도록 미리 잡아 둠
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return } // 이미 닫혔으면 바로 끔
        stream = s
        if (video) video.srcObject = s
      })
      .catch((e: DOMException) => { if (!cancelled) failRef.current(e?.name === 'NotAllowedError') }) // '허용 안 함'을 누른 경우
    return () => { // 화면이 사라질 때 카메라 끄기
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      if (video) video.srcObject = null
    }
  }, [])
  // 만들던 사진까지 모두 기다렸다 넘긴다. 만들기에 실패한 사진(null)은 뺀다. 화면이 닫히면 위의 정리 함수가 카메라를 끈다
  const close = () => {
    if (closing.current) return
    closing.current = true
    Promise.all(pending.current).then((bs) => onClose(bs.filter(present)))
  }
  return (
    <div className="cam on">
      <video ref={v} playsInline muted autoPlay />
      <p className="msg">옷이 화면에 꽉 차게 찍어 주세요</p>
      <div className="flash" ref={flash} />
      <div className="bar2">
        <button className="x" onClick={close}>{count ? '완료' : '닫기'}</button>
        <button className="shutter" aria-label="사진 찍기" onClick={() => {
          const el = v.current; if (!el?.videoWidth) return
          const c = document.createElement('canvas'); c.width = el.videoWidth; c.height = el.videoHeight
          c.getContext('2d')!.drawImage(el, 0, 0)
          pending.current.push(new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85)))
          setCount((n) => n + 1)
          if (flash.current) { flash.current.style.opacity = '.8'; setTimeout(() => { if (flash.current) flash.current.style.opacity = '0' }, 80) }
        }} />
        <span style={{ minWidth: 56, textAlign: 'right', color: 'var(--ivory)', fontSize: 13 }}>{count ? count + '장' : ''}</span>
      </div>
    </div>
  )
}

/* 색 스캔: 사진 가운데를 평균 내서 색을 뽑고, 가장 가까운 이름을 붙임 */
function nearestName(hex: string) {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [r, g, b] = rgb(hex)
  let best = '', bd = 1e9
  for (const [n, h] of Object.entries(COLORS)) { const [R, G, B] = rgb(h); const dd = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (dd < bd) { bd = dd; best = n } }
  return best
}
function scanColor(b: Tile, done: () => void) {
  const fin = (hex: string) => { b.hex = hex; b.color = nearestName(hex); done() }
  if (!b.img) return setTimeout(() => fin(COLORS[b.color || '아이보리'] || '#E5DCC8'), 500)
  const im = new Image()
  // 다른 서버(예: Blob Storage)의 사진도 픽셀을 읽을 수 있게 CORS로 불러온다. 서버가 허용하지 않으면 onerror로 간다
  im.crossOrigin = 'anonymous'
  im.onload = () => {
    // 픽셀 읽기가 실패해도(다른 서버 사진이라 막힘, 캔버스를 못 만듦 등) 기본 색으로 끝낸다.
    // done()이 불리지 않으면 'scanning'이 true로 남아 모든 사진의 '사진에서 색 뽑기'가 '뽑는 중'에서 멈췄다
    try {
      const c = document.createElement('canvas'); c.width = c.height = 24
      const ctx = c.getContext('2d'); if (!ctx) return fin('#E5DCC8')
      const s = Math.min(im.width, im.height) * 0.4
      ctx.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 24, 24)
      const px = ctx.getImageData(0, 0, 24, 24).data
      let r = 0, g = 0, bl = 0; for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; bl += px[i + 2] }
      const n = px.length / 4, h = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
      fin(('#' + h(r) + h(g) + h(bl)).toUpperCase())
    } catch { fin('#E5DCC8') }
  }
  im.onerror = () => fin('#E5DCC8')
  im.src = b.img
}
let scanning = false
/** 색 고르기 창에서 지금 눌러 둔 색 이름 ('이 색으로 할게요'를 누르기 전까지는 옷에 넣지 않는다) */
let colorPick: string | null = null
registerModuleReset(() => {
  batchSeq++ // 보내던 분석의 결과가 늦게 와도 창을 열지 않게. 차례 돌리기는 batch가 비어 바로 끝난다
  batch.forEach((tile) => { if (tile.img?.startsWith('blob:')) URL.revokeObjectURL(tile.img) })
  batch = []; cur = 0; autoOpened = false; onScreen = false; scanning = false; colorPick = null
})
/** 확인 창을 i번째 사진에서 연다. 창 안의 이전·다음 옷 버튼은 cur만 바꾸고 같은 창을 다시 그린다 */
function openConfirm(i: number) {
  cur = Math.max(0, Math.min(i, batch.length - 1))
  openSheet(() => <Confirm />, true)
}
/**
 * 색 고르기 창 (Figma v4 3-18). 앱의 18색(COLORS)을 3칸 표로 보여 주고, 하나를 눌러 둔 뒤 '이 색으로 할게요'로 바꾼다.
 * - 지금 옷의 색이 처음에 눌려 있다. '취소'나 창 밖을 누르면 아무것도 바꾸지 않는다
 * - 색을 바꾸면 사진에서 뽑은 색(hex)은 지우고, 이름(name)도 비워서 옷장에 넣을 때 "색 세부 종류"로 새로 만든다 (종류를 바꿀 때와 같은 규칙)
 */
function openColorTable(b: Tile) {
  colorPick = b.color
  openModal(() => (
    <>
      <h3>색 고르기</h3>
      <p className="sub">이 옷의 색과 가장 가까운 이름을 골라 주세요</p>
      <div className="ctable">
        {Object.keys(COLORS).map((c) => (
          <button key={c} className={`ccell ${colorPick === c ? 'on' : ''}`} aria-pressed={colorPick === c} onClick={() => { colorPick = c; emit() }}>
            <i style={{ background: COLORS[c] }} />{c}
          </button>
        ))}
      </div>
      <div className="row2 mt18">
        <button className="btn" onClick={closeModal}>취소</button>
        <button className="btn solid" onClick={() => {
          if (colorPick && (colorPick !== b.color || b.hex)) { b.color = colorPick; b.hex = null; b.name = null; toast(`색을 ${colorPick}${euro(colorPick)} 바꿨어요`) }
          closeModal(); emit()
        }}>이 색으로 할게요</button>
      </div>
    </>
  ))
}
/**
 * 한 벌씩 확인 창 (Figma 3. 옷 등록 ④~⑥). AI가 고른 종류·세부 종류·색·재질이 선택된 채로 열리고, 틀린 것만 눌러 바꾼다.
 * - 위: 몇 번째 옷인지(cur+1 / 전체), 남은 옷 수, 진행 막대
 * - 아래: '이전'(첫 옷에서는 막힘)과 '다음 옷'. 마지막 옷에서는 '옷장에 N벌 넣기'
 * - 이 사진이 아직 분석 중이면 고르는 칸 대신 기다림 표시를 보여 주고, 분석이 끝나면 emit으로 다시 그려져 칸이 나타난다
 * - 다시 찍기: 찍는 방법 안내와 '목록에서 빼기'·'다시 찍기'. 실패: 실패 문구와 '다시 시도'·'목록에서 빼기'.
 *   두 경우 모두 옷장에 넣지 않으므로, 고칠 것 없이 '다음 옷'으로 건너뛸 수 있다
 * - 종류·색이 비어 있으면(서버가 색을 고르지 못해 color가 null로 온 경우) 다음으로 넘어가지 못하게 막고, 색을 고르라고 알린다
 */
function Confirm() {
  const b = batch[cur]
  if (!b) return null // 창이 열린 채 새 묶음을 받거나 옷장에 넣어 batch가 바뀐 경우
  const n = batch.length, last = cur === n - 1, rest = n - cur - 1
  const setCount = batch.filter(isSet).length
  // 다음으로 갈 수 있는지: 정리가 끝났거나(종류·색 있음) 다시 해야 하는 사진(건너뜀). 마지막 옷에서는 넣을 옷이 한 벌은 있어야 한다
  const canNext = isSet(b) || needsRedo(b)
  return (
    <>
      <div className="one-top"><b>{cur + 1} / {n}</b><span>{last ? '마지막 옷이에요' : `남은 옷 ${rest}벌`}</span></div>
      <div className="track"><i style={{ width: `${((cur + 1) / n) * 100}%` }} /></div>
      <div className="one-head">
        <div className={`one-ph ${b.status === 'retake' ? 'dim' : ''}`}>
          {b.img && <img src={b.img} alt="" />}
          {b.status === 'retake' && <span className="band">다시 찍기</span>}
          {b.status === 'failed' && <span className="band bad">{b.failKind === 'login' ? '로그인' : '실패'}</span>}
        </div>
        {b.status === 'retake' ? <div><h3>이 사진은 다시 찍어야 해요</h3><p>옷이 잘 보이지 않았어요.<br />옷이 화면에 꽉 차게 찍어 주세요</p></div>
          : b.status === 'failed' ? <div><h3>{FAIL_TITLE[b.failKind ?? 'retry']}</h3><p>{b.error}</p></div>
          : <div><h3>이 옷이 맞나요?</h3><p>사진을 보고 골라 뒀어요.<br />다른 곳만 눌러서 바꿔 주세요</p></div>}
      </div>
      {isPending(b) ? (
        <div className="one-wait"><span className="spin" /><p>이 사진은 아직 확인 중이에요</p></div>
      ) : b.status === 'retake' ? (
        <div className="one-redo">
          <div className="one-tip"><b>이렇게 찍으면 잘 알아봐요</b><p>· 옷 한 벌만 보이게 펼쳐서<br />· 밝은 곳에서, 그림자 없이<br />· 옷 전체가 화면 안에 들어오게</p></div>
          <div className="row2">
            <button className="btn" onClick={() => removeTile(b)}>목록에서 빼기</button>
            <button className="btn solid" onClick={() => retakeTile(b)}>다시 찍기</button>
          </div>
          <p className="sub">이 사진은 옷장에 넣지 않아요. 그냥 두고 다음 옷으로 넘어가도 돼요</p>
        </div>
      ) : b.status === 'failed' ? (
        // 실패 종류(failKind)마다 할 수 있는 일만 보여 준다: 다시 시도 / 다시 찍기 / 로그인하기. 빼기는 모두 같다
        <div className="one-redo">
          {b.failKind === 'replace' ? <button className="btn solid full" onClick={() => retakeTile(b)}><CameraIc />다시 찍기</button>
            : b.failKind === 'login' ? <button className="btn solid full" onClick={loginForUpload}>로그인하기</button>
              : <button className="btn solid full" onClick={() => retryTile(b)}><RetryIc />다시 시도</button>}
          <button className="btn full" onClick={() => removeTile(b)}>목록에서 빼기</button>
          <p className="sub">{b.failKind === 'login' ? 'Google로 로그인하면 올려 둔 사진이 사라져요. 로그인한 뒤 사진을 다시 골라 주세요'
            : '이 사진은 옷장에 넣지 않아요. 그냥 두고 다음 옷으로 넘어가도 돼요'}</p>
        </div>
      ) : (
        <>
          <h4>종류</h4>
          {/* 종류를 바꾸면 세부 종류는 그 종류에 맞지 않으므로 비운다 (예: 상의 → 하의면 '셔츠'가 남으면 안 됨) */}
          <div className="opts">{CATS.filter((c) => !HIDDEN_CATS.includes(c)).map((c) => <button key={c} className={`opt ${b.cat === c ? 'on' : ''}`} onClick={() => { if (b.cat !== c) { b.sub = null; b.name = null } b.cat = c; emit() }}>{c}</button>)}</div>
          {/* 세부 종류: 고른 종류에 맞는 것만 보여 줌 (SUBS). 같은 상의라도 셔츠·니트·티셔츠는 코디가 달라서 따로 고른다 */}
          {b.cat && (
            <>
              <h4>세부 종류</h4>
              <div className="opts">{SUBS[b.cat].map((x) => <button key={x} className={`opt ${b.sub === x ? 'on' : ''}`} onClick={() => { if (b.sub !== x) b.name = null; b.sub = x; emit() }}>{x}</button>)}</div>
            </>
          )}
          {/* Figma v4 3-9: 뽑은(또는 고른) 색과 이름만 보여 주고, 다른 색은 '색 바꾸기'로 18색 표 창을 열어 고른다 (11/27).
              18색 동그라미를 늘어놓던 줄은 이 창으로 옮겼다.
              서버가 색을 고르지 못하면(color null) 색을 골라야 넣을 수 있어서, 제목 옆에 알리고 빈 동그라미와 안내 문구를 보여 준다 */}
          <div className="one-h4"><h4>색</h4>{!b.color && <span className="need">색을 골라 주세요</span>}</div>
          <div className="scan">
            <span className={`sw ${b.color ? '' : 'none'}`} style={{ background: b.hex || (b.color ? COLORS[b.color] : 'transparent') }} />
            <p>{b.hex ? <>사진에서 뽑은 색이에요<br />가장 가까운 이름은 <b>{b.color}</b></> : b.color ? <>고른 색이에요<br /><b>{b.color}</b></> : <>사진에서 색을 알아보지 못했어요<br />'색 바꾸기'로 골라 주세요</>}</p>
          </div>
          <button className="btn full mt8" onClick={() => openColorTable(b)}>색 바꾸기</button>
          <button className="link scanlink" disabled={scanning} onClick={() => { scanning = true; emit(); scanColor(b, () => { scanning = false; b.name = null; emit() }) }}>{scanning ? '색을 뽑는 중이에요' : '사진에서 색 다시 뽑기'}</button>
          {/* 별명 (11/27): 옷 등록 때부터 붙일 수 있게. 옷 크게 보기의 '별명 붙이기'와 같은 규칙(12자까지, 비우면 원래 이름).
              입력할 때마다 다시 그리지 않도록 tile에 바로 넣기만 한다 (옷장에 넣을 때 읽음) */}
          <label className="field2 alias-field"><span>별명 (선택)</span>
            <input key={b.id} defaultValue={b.alias} maxLength={12} placeholder={`예: 최애 ${b.sub || b.cat || '옷'}`} onChange={(e) => { b.alias = e.target.value }} /></label>
          {/* 재질 칸: 화면에서 잠시 숨김 (2026-11-26). 다시 보이게 하려면 아래 주석을 풀고, 위 import의 MATERIALS도 되살린다.
              AI가 고른 재질 값(b.material)은 그대로 옷에 저장된다
          <h4>재질</h4>
          <div className="opts">{MATERIALS.map((m) => <button key={m} className={`opt ${b.material === m ? 'on' : ''}`} onClick={() => { b.material = m; emit() }}>{m}</button>)}</div>
          */}
        </>
      )}
      <div className="row2 one-btns">
        <button className="btn" disabled={cur === 0} onClick={() => { cur--; emit() }}>이전</button>
        <button className="btn solid" disabled={!canNext || (last && !setCount)} onClick={() => { if (last) putInCloset(); else { cur++; emit() } }}>
          {last ? `옷장에 ${setCount}벌 넣기` : '다음 옷'}
        </button>
      </div>
    </>
  )
}
