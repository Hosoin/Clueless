// 옷 등록: 사진을 여러 장 올리면 AI가 사진마다 종류·세부 종류·색·재질을 미리 골라 두고, 사용자는 한 벌씩 확인한다 (담당: B)
// 흐름 (Figma 3. 옷 등록): 사진 올리기 → 확인 중 → 한 벌씩 확인 창(1/N … N/N) → 옷장
// - 예전에는 사진마다 후보 3개를 고르게 했는데, 고르는 일이 사진 수만큼 늘어서 바꿨다.
//   지금은 AI가 고른 값이 선택된 채로 창이 열리고, 사용자는 틀린 것만 눌러 바꾼 뒤 '다음 옷'을 누른다.
// - 첫 사진의 분석이 끝나면 확인 창이 저절로 열린다. 다음 사진이 아직 분석 중이면 창 안에서 기다린다.
// - 마지막 옷에서는 버튼이 '옷장에 N벌 넣기'로 바뀌고, 누르면 한꺼번에 옷장에 넣는다.
// - 무늬는 이 프로젝트에서 다루지 않는다. 고르는 칸이 없고 옷에도 저장하지 않는다.
// 지금은 분석 결과가 가짜(DEMO_PREDS)다. 분류 모델 API가 생기면 scheduleAnalysis 안의 setTimeout 부분을 API 호출로 바꾸고,
// 응답의 1순위 값을 fill()에 넘기면 된다. 서버에는 원본이 아니라 Tile.file(1024×1024px로 줄인 JPEG)을 보낸다.
// 올린 사진은 먼저 줄이고(resizeImage, src/image.ts) 다 줄인 뒤에 분석을 시작한다. 실제 API도 줄인 사진을 보내야 해서 순서를 맞췄다.
// 분석 타이머는 이 화면이 열려 있을 때만 돈다: 화면을 나가면 멈추고(pauseAnalysis), 돌아오면 남은 사진만 이어서 분석한다.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Back } from '../components/Icons'
import { CATS, COLORS, MATERIALS, SUBS, photo } from '../data/seed'
import type { Category } from '../data/types'
import { resizeImage } from '../image'
import { go } from '../nav'
import { S, emit, keepSel, present, useApp } from '../store'
import { askPermission, closeAll, openSheet, toast } from '../ui'

/**
 * AI가 사진 한 장을 보고 고른 값 (1순위). 확인 창이 이 값이 선택된 채로 열린다.
 * name은 옷장에 보일 이름("카멜 롱 코트"), 나머지는 옷장에 저장될 값. material은 모르면 null
 */
type Pred = { name: string; cat: Category; sub: string; color: string; material: string | null }
/**
 * 올린 사진 한 장의 정리 상태.
 * - done: 분석이 끝났는지 (끝나기 전엔 타일에 '확인 중' 표시, 확인 창에서도 기다림)
 * - name·cat·sub·color·material: 옷장에 넣을 값. 분석이 끝나면 AI 값으로 채워지고, 확인 창에서 바꿀 수 있다.
 *   종류·세부 종류·색을 바꾸면 name은 비워서, 옷장에 넣을 때 "색 세부 종류"로 새로 만든다 (AI 이름과 실제 값이 어긋나지 않게).
 *   재질은 이름에 들어가지 않아서 바꿔도 name을 비우지 않는다
 * - hex: "사진에서 색 뽑기"를 했을 때만 있는 실제 색
 * - file: 서버로 보낼 사진 (1024×1024px JPEG, 남는 곳은 흰 여백). 예시 사진은 앱 안 이미지라 보낼 파일이 없어서 null
 * - resizing: 사진을 줄이는 중인지. 줄이는 동안은 분석을 시작하지 않는다 (보낼 사진이 아직 없어서)
 */
type Tile = {
  id: number; img: string | null; file: Blob | null; resizing: boolean; done: boolean
  name: string | null; cat: Category | null; sub: string | null; color: string | null; material: string | null; hex: string | null
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
/** 지금 올려 둔 사진들. 화면을 나갔다 와도 이어서 정리할 수 있게 모듈 변수로 둔다 */
let batch: Tile[] = []
/** 확인 창에서 보고 있는 사진의 순서 (0부터). 창을 닫았다가 '이어서 확인하기'를 누르면 여기서 다시 연다 */
let cur = 0
/** 이 묶음에서 확인 창을 저절로 연 적이 있는지. 사용자가 창을 닫은 뒤에 다른 사진 분석이 끝나도 다시 열지 않으려고 둔다 */
let autoOpened = false
/** 돌고 있는 분석 타이머 id. 화면을 나갈 때 한꺼번에 멈추려고 모아 둔다 */
let timers: number[] = []
/** 지금 이 화면이 열려 있는지. 사진 줄이기는 화면을 나간 뒤에 끝날 수 있어서, 그때 분석 타이머를 걸지 않으려고 둔다 */
let onScreen = false
/** 몇 번째 사진 묶음인지. 줄이는 중에 새 묶음을 받으면, 늦게 끝난 이전 묶음의 결과를 버리려고 비교한다 */
let batchSeq = 0

/** 분석 타이머를 모두 멈춘다. 화면을 나갈 때(Upload의 useEffect 정리)와 새 사진 묶음을 받을 때 부른다 */
function pauseAnalysis() {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}

/** 분석이 끝난 사진에 AI 값을 채운다. 실제 API로 바꿀 때도 응답의 1순위 값을 여기에 넘기면 된다 */
function fill(b: Tile, p: Pred) {
  b.name = p.name; b.cat = p.cat; b.sub = p.sub; b.color = p.color; b.material = p.material; b.hex = null; b.done = true
}

/**
 * 아직 분석이 안 끝난 사진만 분석 타이머를 건다. 새 묶음을 받았을 때와, 화면에 다시 들어왔을 때 부른다.
 * 남은 사진마다 0.7초 간격으로 분석이 끝나는 것처럼 보이게 하고(묶음의 마지막 두 장은 일부러 더 늦게),
 * 끝나면 AI 값을 채운다. 첫 결과가 나오면 확인 창을 저절로 연다 (묶음마다 한 번만).
 * 결과는 묶음 안의 순서(i)로 고르므로, 멈췄다 이어서 분석해도 같은 사진에는 같은 결과가 나온다.
 */
function scheduleAnalysis() {
  pauseAnalysis() // 같은 사진에 타이머가 두 번 걸리지 않게 먼저 비움
  let wait = 0 // 남은 사진 중 몇 번째인지 (이미 끝난 사진은 건너뛰고 간격을 셈)
  batch.forEach((b, i) => {
    if (b.done || b.resizing) return // 아직 줄이는 중인 사진은 줄이기가 끝난 뒤 startBatch가 다시 부른다
    timers.push(window.setTimeout(() => {
      fill(b, DEMO_PREDS[i % DEMO_PREDS.length])
      if (!autoOpened && onScreen) { autoOpened = true; openConfirm(batch.indexOf(b)) } else emit()
    }, 700 + wait++ * 650 + (i >= batch.length - 2 ? 1800 : 0)))
  })
}

/**
 * 사진 여러 장(최대 9장)을 받아 1024×1024px로 줄인 뒤 분석을 시작한다. files가 없으면 예시 사진 6장으로 해 본다.
 * - 줄이는 동안 타일은 '확인 중'으로 보이고, 다 줄이면 줄인 사진으로 미리보기(img)와 보낼 파일(file)을 채운다.
 *   미리보기도 줄인 사진을 쓰는 이유: 서버로 가는 사진과 화면에 보이는 사진이 같아야 하고, 큰 원본을 9장 들고 있으면 폰 메모리를 많이 쓴다
 * - 새 묶음이 이전 묶음을 바꾸므로, 이전 묶음에 남아 있던(옷장에 넣지 않은) 사진의 주소는 해제한다.
 *   옷장에 넣은 사진은 넣을 때 batch에서 빠지므로 여기서 해제되지 않는다 (옷장 사진으로 계속 쓰임).
 */
async function startBatch(files: FileList | Blob[] | null) {
  pauseAnalysis()
  batch.forEach((b) => { if (b.img?.startsWith('blob:')) URL.revokeObjectURL(b.img) }) // 예시 사진(앱 안 이미지)은 blob이 아니라 해제하지 않음
  const list: (Blob | undefined)[] = files && files.length ? [...files].slice(0, 9) : Array.from({ length: 6 })
  const seq = ++batchSeq
  const tiles: Tile[] = list.map((f, i) => ({
    id: ++S.uid, img: f ? null : photo(DEMO_IDS[i % DEMO_IDS.length]) || null, file: null, resizing: !!f, done: false,
    name: null, cat: null, sub: null, color: null, material: null, hex: null,
  }))
  batch = tiles; cur = 0; autoOpened = false
  emit()
  // 여러 장을 한꺼번에 줄인다. resizeImage는 실패해도 원본을 돌려주므로 여기서 멈추지 않는다
  const resized = await Promise.all(list.map((f) => (f ? resizeImage(f) : Promise.resolve(null))))
  if (seq !== batchSeq) return // 줄이는 사이에 새 묶음을 받았으면 이 결과는 버린다 (아직 주소를 만들지 않아 해제할 것도 없음)
  tiles.forEach((b, i) => {
    const f = resized[i]; if (!f) return
    b.file = f; b.img = URL.createObjectURL(f); b.resizing = false
  })
  emit()
  if (onScreen) scheduleAnalysis() // 화면을 나간 뒤에 끝났으면 돌아올 때 Upload의 useEffect가 분석을 이어서 한다
}

/** 옷장에 넣을 수 있는지: 분석이 끝났고 종류와 색이 있어야 한다 (세부 종류·재질은 몰라도 넣을 수 있음) */
const isSet = (b: Tile) => b.done && !!b.cat && !!b.color

/**
 * 정리한 사진을 모두 옷장에 넣는다. 확인 창의 마지막 옷에서 '옷장에 N벌 넣기'를 누르면 부른다.
 * 이름이 비어 있으면(값을 바꾼 경우) "색 세부 종류"로 새로 만든다. 넣은 사진은 batch에서 빼서, 다음 묶음을 받을 때 주소가 해제되지 않게 한다
 */
function putInCloset() {
  const take = batch.filter(isSet)
  // 옷장 맨 앞에 끼워 넣으면 홈의 줄 순서가 밀리므로 keepSel로 감싸 홈에서 고른 옷이 바뀌지 않게 한다
  keepSel(() => take.forEach((b) => S.items.unshift({
    id: b.id, name: b.name || `${b.color} ${b.sub || b.cat}`, cat: b.cat!, sub: b.sub, color: b.color!, hex: b.hex, material: b.material,
    rec: 0, tags: [], lastWorn: null, img: b.img || undefined, isNew: true, added: Date.now(),
  })))
  batch = batch.filter((b) => !isSet(b))
  cur = 0 // 남은 사진이 있으면 처음부터 이어서 확인. 그대로 두면 남은 장수보다 큰 번호가 남아 '이어서 확인하기 (6 / 1)'처럼 보였다
  closeAll()
  toast(`${take.length}벌을 옷장에 넣었어요`)
  // 옷장에서 '내 옷'을 최근 넣은 순으로, 종류 탭은 '전체', 색 필터는 '모든 색'으로 보여 줘야 새 옷이 맨 앞에 다 보인다.
  // 탭·필터를 그대로 두면 '하의' 탭이나 '블랙' 필터가 켜진 채 열려 방금 넣은 옷이 안 보였다
  S.cView = 'items'; S.cSort = 0; S.cTab = '전체'; S.cColor = null
  go('/closet')
}

export default function Upload() {
  useApp()
  const nav = useNavigate()
  const album = useRef<HTMLInputElement>(null), shot = useRef<HTMLInputElement>(null)
  const [cam, setCam] = useState(false)
  // 화면에 들어오면 남은 사진 분석을 이어서 하고, 나가면 멈춘다 (나간 뒤에도 타이머가 돌며 다시 그리지 않게)
  // onScreen: 사진 줄이기가 화면을 나간 뒤에 끝나면 분석을 걸지 않게 하려고 함께 켜고 끈다
  useEffect(() => { onScreen = true; scheduleAnalysis(); return () => { onScreen = false; pauseAnalysis() } }, [])
  const done = batch.filter((b) => b.done).length, left = batch.length - done
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
            <div className="prog"><b>{batch.length}장 중 {done}장 정리했어요</b><span>{left ? left + '장 확인 중' : ''}</span></div>
            <div className="track"><i style={{ width: `${(done / batch.length) * 100}%` }} /></div>
            {/* 사진 칸: 후보 목록 없이 사진만 보인다. 분석이 끝난 사진을 누르면 그 사진부터 확인 창이 열린다 */}
            <div className="grid3 mt16">
              {batch.map((b, i) => (
                <div key={b.id} className="tile">
                  <button className={`ph ${b.done ? '' : 'wait'}`} disabled={!b.done} aria-label={b.done ? `${i + 1}번째 옷 확인하기` : '확인 중'} onClick={() => openConfirm(i)}>
                    {b.img && <img src={b.img} alt="" />}
                    {!b.done && <span className="spin" />}
                  </button>
                </div>
              ))}
            </div>
            <p className="hint">{done ? '사진을 누르면 그 옷부터 다시 확인할 수 있어요' : '사진을 확인하고 있어요. 첫 옷이 확인되면 한 벌씩 보여 드릴게요'}</p>
            {/* 확인 창을 닫았을 때 돌아가는 길. 창이 저절로 열리기 전(첫 분석 전)에는 누를 것이 없어 숨긴다 */}
            {done > 0 && <button className="btn solid full mt16" onClick={() => openConfirm(cur)}>이어서 확인하기 ({cur + 1} / {batch.length})</button>}
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
/** 확인 창을 i번째 사진에서 연다. 창 안의 이전·다음 옷 버튼은 cur만 바꾸고 같은 창을 다시 그린다 */
function openConfirm(i: number) {
  cur = Math.max(0, Math.min(i, batch.length - 1))
  openSheet(() => <Confirm />, true)
}
/**
 * 한 벌씩 확인 창 (Figma 3. 옷 등록 ④~⑥). AI가 고른 종류·세부 종류·색·재질이 선택된 채로 열리고, 틀린 것만 눌러 바꾼다.
 * - 위: 몇 번째 옷인지(cur+1 / 전체), 남은 옷 수, 진행 막대
 * - 아래: '이전'(첫 옷에서는 막힘)과 '다음 옷'. 마지막 옷에서는 '옷장에 N벌 넣기'
 * - 이 사진이 아직 분석 중이면 고르는 칸 대신 기다림 표시를 보여 주고, 분석이 끝나면 emit으로 다시 그려져 칸이 나타난다
 * - 종류·색이 비어 있으면(색을 지운 경우 등은 없지만 API 결과가 비어 올 수 있어서) 다음으로 넘어가지 못하게 막는다
 */
function Confirm() {
  const b = batch[cur]
  if (!b) return null // 창이 열린 채 새 묶음을 받거나 옷장에 넣어 batch가 바뀐 경우
  const n = batch.length, last = cur === n - 1, rest = n - cur - 1
  return (
    <>
      <div className="one-top"><b>{cur + 1} / {n}</b><span>{last ? '마지막 옷이에요' : `남은 옷 ${rest}벌`}</span></div>
      <div className="track"><i style={{ width: `${((cur + 1) / n) * 100}%` }} /></div>
      <div className="one-head">
        <div className="one-ph">{b.img && <img src={b.img} alt="" />}</div>
        <div><h3>이 옷이 맞나요?</h3><p>사진을 보고 골라 뒀어요.<br />다른 곳만 눌러서 바꿔 주세요</p></div>
      </div>
      {!b.done ? (
        <div className="one-wait"><span className="spin" /><p>이 사진은 아직 확인 중이에요</p></div>
      ) : (
        <>
          <h4>종류</h4>
          {/* 종류를 바꾸면 세부 종류는 그 종류에 맞지 않으므로 비운다 (예: 상의 → 하의면 '셔츠'가 남으면 안 됨) */}
          <div className="opts">{CATS.map((c) => <button key={c} className={`opt ${b.cat === c ? 'on' : ''}`} onClick={() => { if (b.cat !== c) { b.sub = null; b.name = null } b.cat = c; emit() }}>{c}</button>)}</div>
          {/* 세부 종류: 고른 종류에 맞는 것만 보여 줌 (SUBS). 같은 상의라도 셔츠·니트·티셔츠는 코디가 달라서 따로 고른다 */}
          {b.cat && (
            <>
              <h4>세부 종류</h4>
              <div className="opts">{SUBS[b.cat].map((x) => <button key={x} className={`opt ${b.sub === x ? 'on' : ''}`} onClick={() => { if (b.sub !== x) b.name = null; b.sub = x; emit() }}>{x}</button>)}</div>
            </>
          )}
          <h4>색</h4>
          <div className="scan"><span className="sw" style={{ background: b.hex || (b.color ? COLORS[b.color] : 'transparent') }} />
            <p>{b.hex ? <>사진에서 뽑은 색이에요. 가장 가까운 이름은 <b>{b.color}</b></> : '같은 아이보리도 옷마다 달라요. 사진에서 색을 그대로 뽑을 수 있어요'}</p>
            <button className="btn" disabled={scanning} onClick={() => { scanning = true; emit(); scanColor(b, () => { scanning = false; b.name = null; emit() }) }}>{scanning ? '뽑는 중' : '사진에서 색 뽑기'}</button></div>
          <div className="opts">{Object.keys(COLORS).map((c) => <button key={c} className={`opt ${b.color === c && !b.hex ? 'on' : ''}`} onClick={() => { if (b.color !== c || b.hex) b.name = null; b.color = c; b.hex = null; emit() }}><i style={{ background: COLORS[c] }} />{c}</button>)}</div>
          {/* 재질: 노션 테이블 명세서 closet_items.material(선택 칸). 이름에 들어가지 않아서 바꿔도 이름은 그대로 둔다 */}
          <h4>재질</h4>
          <div className="opts">{MATERIALS.map((m) => <button key={m} className={`opt ${b.material === m ? 'on' : ''}`} onClick={() => { b.material = m; emit() }}>{m}</button>)}</div>
        </>
      )}
      <div className="row2 one-btns">
        <button className="btn" disabled={cur === 0} onClick={() => { cur--; emit() }}>이전</button>
        <button className="btn solid" disabled={!isSet(b)} onClick={() => { if (last) putInCloset(); else { cur++; emit() } }}>
          {last ? `옷장에 ${batch.filter(isSet).length}벌 넣기` : '다음 옷'}
        </button>
      </div>
    </>
  )
}
