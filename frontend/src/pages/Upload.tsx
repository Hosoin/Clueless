// 옷 등록: 여러 장을 한 번에 올리면 사진마다 "어떤 옷인지" 후보를 보여 주고 사용자가 고른다 (담당: B)
// 사진을 분석하면 "카멜 롱 코트", "아이보리 오버핏 니트"처럼 색·옷 이름까지 들어간 상세 후보 3개를
// 정확도(확률) 높은 순으로 보여 준다. 사용자가 하나를 고르면 이름·종류·색·무늬가 한꺼번에 정해진다.
// 모델이 틀려도 사용자가 한 번 눌러서 바로잡게 하려고, 1순위를 자동으로 고르지 않는다.
// 지금은 후보가 가짜(DEMO_CANDS)다. 분류 모델 API가 생기면 startBatch 안의 setTimeout 부분을 API 호출로 바꾸고,
// 응답에서 상세 후보 3개를 꺼내 cands에 넣으면 된다.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Back } from '../components/Icons'
import { CATS, COLORS, PATTERNS, SUBS, photo } from '../data/seed'
import type { Category } from '../data/types'
import { S, emit, swatchBg, useApp } from '../store'
import { askPermission, closeAll, openSheet, toast } from '../ui'

/**
 * 옷 후보 하나: 모델이 이 사진을 이 옷이라고 본 확률(prob, 0~1)과, 고르면 채워질 정보.
 * name은 화면에 보이는 이름("카멜 롱 코트"), cat·color·pattern은 옷장에 저장될 값.
 */
type Cand = { name: string; cat: Category; sub: string; color: string; pattern: string; prob: number }
/**
 * 올린 사진 한 장의 정리 상태.
 * - picked: 사용자가 고른 후보. 고르기 전에는 null이고, null이면 옷장에 넣을 수 없다
 * - manual: 후보 중에 맞는 옷이 없어 '직접 선택'을 고른 경우 true. 이때는 종류·색을 직접 골라야 옷장에 넣을 수 있다
 * - cands: 분석이 끝나면 채워지는 상세 후보 3개 (확률 높은 순)
 * - name·cat·sub·color·pattern: 고른 후보의 값 (sub = 세부 종류: 티셔츠·셔츠·니트 등). 고치기 창에서 바꿀 수 있고, 바꾸면 name은 비워서
 *   옷장에 넣을 때 "색 무늬 종류"로 새로 만든다 (고른 이름과 실제 값이 어긋나지 않게)
 * - hex: "사진에서 색 뽑기"를 했을 때만 있는 실제 색
 * - done: 분석이 끝났는지 (끝나기 전엔 타일에 '확인 중' 표시)
 */
type Tile = {
  id: number; img: string | null; cands: Cand[]; picked: Cand | null; manual: boolean; done: boolean
  name: string | null; cat: Category | null; sub: string | null; color: string | null; pattern: string; hex: string | null
}

// 가짜 상세 후보. 예시 사진(아래 DEMO_IDS)과 같은 순서로, 사진마다 1순위는 실제 옷, 2·3순위는 비슷해서
// 헷갈릴 만한 옷으로 만들었다. 세 확률의 합이 1보다 작은 건 나머지 후보에 남은 확률이 있어서다.
const DEMO_CANDS: Cand[][] = [
  [{ name: '화이트 반팔 티셔츠', cat: '상의', sub: '티셔츠', color: '화이트', pattern: '무지', prob: 0.82 }, { name: '아이보리 크루넥 티셔츠', cat: '상의', sub: '티셔츠', color: '아이보리', pattern: '무지', prob: 0.11 }, { name: '화이트 오버핏 셔츠', cat: '상의', sub: '셔츠', color: '화이트', pattern: '무지', prob: 0.04 }],
  [{ name: '블랙 플리츠 스커트', cat: '하의', sub: '스커트', color: '블랙', pattern: '무지', prob: 0.74 }, { name: '블랙 미니 원피스', cat: '원피스', sub: '원피스', color: '블랙', pattern: '무지', prob: 0.15 }, { name: '차콜 A라인 스커트', cat: '하의', sub: '스커트', color: '차콜', pattern: '무지', prob: 0.06 }],
  [{ name: '카멜 롱 코트', cat: '아우터', sub: '코트', color: '카멜', pattern: '무지', prob: 0.79 }, { name: '베이지 트렌치 코트', cat: '아우터', sub: '코트', color: '베이지', pattern: '무지', prob: 0.13 }, { name: '브라운 울 재킷', cat: '아우터', sub: '재킷', color: '브라운', pattern: '무지', prob: 0.05 }],
  [{ name: '아이보리 크로셰 원피스', cat: '원피스', sub: '원피스', color: '아이보리', pattern: '무지', prob: 0.68 }, { name: '아이보리 니트 원피스', cat: '원피스', sub: '니트 원피스', color: '아이보리', pattern: '무지', prob: 0.2 }, { name: '베이지 슬립 원피스', cat: '원피스', sub: '원피스', color: '베이지', pattern: '무지', prob: 0.07 }],
  [{ name: '네이비 스트라이프 셔츠', cat: '상의', sub: '셔츠', color: '네이비', pattern: '스트라이프', prob: 0.77 }, { name: '버건디 스트라이프 셔츠', cat: '상의', sub: '셔츠', color: '버건디', pattern: '스트라이프', prob: 0.14 }, { name: '네이비 체크 셔츠', cat: '상의', sub: '셔츠', color: '네이비', pattern: '체크', prob: 0.04 }],
  [{ name: '인디고 와이드 데님', cat: '하의', sub: '데님', color: '데님', pattern: '무지', prob: 0.9 }, { name: '블루 스트레이트 진', cat: '하의', sub: '데님', color: '데님', pattern: '무지', prob: 0.06 }, { name: '스카이 와이드 팬츠', cat: '하의', sub: '슬랙스', color: '스카이', pattern: '무지', prob: 0.02 }],
]
// 예시 사진으로 쓸 옷장 옷 id (DEMO_CANDS와 순서가 같음)
const DEMO_IDS = [4, 7, 10, 12, 5, 6]
let batch: Tile[] = []

/**
 * 사진 여러 장(최대 9장)을 받아 분석을 시작한다. files가 없으면 예시 사진 6장으로 해 본다.
 * 사진마다 0.7초 간격으로 분석이 끝나는 것처럼 보이게 하고(마지막 두 장은 일부러 더 늦게),
 * 끝나면 상세 후보 3개를 채운다. 어떤 후보도 자동으로 고르지 않는다.
 */
function startBatch(files: FileList | Blob[] | null) {
  const list: (Blob | undefined)[] = files && files.length ? [...files].slice(0, 9) : Array.from({ length: 6 })
  batch = list.map((f, i) => ({
    id: ++S.uid, img: f ? URL.createObjectURL(f) : photo(DEMO_IDS[i % DEMO_IDS.length]) || null,
    cands: [], picked: null, manual: false, done: false, name: null, cat: null, sub: null, color: null, pattern: '무지', hex: null,
  }))
  emit()
  batch.forEach((b, i) => setTimeout(() => {
    b.cands = DEMO_CANDS[i % DEMO_CANDS.length]; b.done = true; emit()
  }, 700 + i * 650 + (i >= batch.length - 2 ? 1800 : 0)))
}

/**
 * '직접 선택': 후보 3개 중에 맞는 옷이 없을 때. 후보 값을 모두 비우고 고치기 창을 바로 열어
 * 종류·세부 종류·색·무늬를 처음부터 고르게 한다 (후보 값이 남아 있으면 틀린 값이 그대로 저장될 수 있어서)
 */
function pickManual(b: Tile) {
  b.picked = null; b.manual = true; b.name = null; b.cat = null; b.sub = null; b.color = null; b.pattern = '무지'; b.hex = null
  emit()
  editTile(b)
}
/** 정해졌는지: 후보를 골랐거나, 직접 선택에서 종류와 색까지 골랐으면 옷장에 넣을 수 있다 */
const isSet = (b: Tile) => b.done && (!!b.picked || b.manual) && !!b.cat && !!b.color

/** 후보를 고르면 그 후보의 이름·종류·색·무늬로 채운다 (사진에서 뽑은 색은 지움: 고른 색과 어긋나지 않게) */
function pickCand(b: Tile, c: Cand) {
  b.picked = c; b.manual = false; b.name = c.name; b.cat = c.cat; b.sub = c.sub; b.color = c.color; b.pattern = c.pattern; b.hex = null
  emit()
}

export default function Upload() {
  useApp()
  const nav = useNavigate()
  const album = useRef<HTMLInputElement>(null), shot = useRef<HTMLInputElement>(null)
  const [cam, setCam] = useState(false)
  const done = batch.filter((b) => b.done).length, ready = batch.filter(isSet).length, needPick = batch.filter((b) => b.done && !isSet(b)).length, left = batch.length - done
  return (
    <section className="screen on" id="s-upload">
      <button className="backrow" onClick={() => nav('/closet')}><Back />옷장</button>
      <div className="head" style={{ paddingTop: 4 }}><h1>Add <i>Items</i></h1></div>
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
            <button className="btn" style={{ marginTop: 16, padding: '0 18px' }} onClick={() => startBatch(null)}>예시 사진으로 해 보기</button></div>
        ) : (
          <>
            <div className="prog"><b>{batch.length}장 중 {done}장 정리했어요</b><span>{left ? left + '장 확인 중' : ''}</span></div>
            <div className="track"><i style={{ width: `${(done / batch.length) * 100}%` }} /></div>
            <div className="grid3" style={{ marginTop: 16 }}>
              {batch.map((b) => (
                <div key={b.id} className="tile">
                  <button className={`ph ${b.done ? '' : 'wait'} ${b.done && !isSet(b) ? 'warn' : ''}`} disabled={!b.done} aria-label={b.done ? '종류·색·무늬 고치기' : '확인 중'} onClick={() => (b.picked || b.manual ? editTile(b) : toast('먼저 아래 후보에서 고르거나 직접 선택해 주세요'))}>
                    {b.img && <img src={b.img} alt="" />}
                    {b.done ? (b.color && <span className="chip" style={{ background: swatchBg(b.hex || COLORS[b.color], b.pattern) }} />) : <span className="spin" />}
                  </button>
                  {b.done ? (
                    <>
                      {/* 상세 후보 3개 (정확도 높은 순): 누르면 그 옷으로 정해짐. 하나만 고를 수 있어서 radio 역할 */}
                      <div className="cands" role="radiogroup" aria-label="이 옷과 가장 가까운 후보">
                        {b.cands.map((c) => (
                          <button key={c.name} role="radio" aria-checked={b.picked === c} className={`cand ${b.picked === c ? 'on' : ''}`} onClick={() => pickCand(b, c)}>
                            <b>{c.name}</b><span>{Math.round(c.prob * 100)}%</span>
                          </button>
                        ))}
                        {/* 후보 중에 맞는 옷이 없을 때: 맨 아래 '직접 선택'을 누르면 고르는 창이 바로 열림 */}
                        <button role="radio" aria-checked={b.manual} className={`cand manual ${b.manual ? 'on' : ''}`} onClick={() => pickManual(b)}>
                          <b>직접 선택</b>
                        </button>
                      </div>
                      {/* 직접 고른 값, 또는 후보를 고른 뒤 고치기 창에서 바꾼 값을 보여 줌 */}
                      {(b.manual || b.picked) && !b.name && (
                        b.cat && b.color
                          ? <p className="k">{b.sub || b.cat} · {b.color}{b.pattern !== '무지' ? ' · ' + b.pattern : ''}</p>
                          : <p className="k pink">종류와 색을 골라 주세요</p>
                      )}
                    </>
                  ) : (<><p className="k" style={{ fontSize: 13 }}>확인 중</p><p className="k">&nbsp;</p></>)}
                </div>
              ))}
            </div>
            <p className="hint">{needPick ? `사진마다 가장 비슷한 옷을 고르거나 직접 선택해 주세요 (${needPick}장 남음)` : '사진을 누르면 종류·세부 종류·색·무늬를 고칠 수 있어요'}</p>
            <button className="btn solid full" style={{ marginTop: 16 }} disabled={!ready} onClick={() => {
              const take = batch.filter(isSet)
              take.forEach((b) => S.items.unshift({ id: b.id, name: b.name || `${b.color} ${b.pattern !== '무지' ? b.pattern + ' ' : ''}${b.sub || b.cat}`, cat: b.cat!, sub: b.sub, color: b.color!, hex: b.hex, pattern: b.pattern, rec: 0, tags: [], lastWorn: null, img: b.img || undefined, isNew: true, added: Date.now() }))
              batch = batch.filter((b) => !isSet(b))
              toast(`${take.length}벌을 옷장에 넣었어요`)
              setTimeout(() => { S.cView = 'items'; S.cSort = 0; nav('/closet') }, 500)
            }}>{ready ? ready + '벌 옷장에 넣기' : needPick ? '옷을 고르면 넣을 수 있어요' : '정리가 끝나면 넣을 수 있어요'}</button>
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
  const [shots, setShots] = useState<Blob[]>([])
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
  const close = () => onClose(shots) // 화면이 닫히면 위의 정리 함수가 카메라를 끈다
  return (
    <div className="cam on">
      <video ref={v} playsInline muted autoPlay />
      <p className="msg">옷이 화면에 꽉 차게 찍어 주세요</p>
      <div className="flash" ref={flash} />
      <div className="bar2">
        <button className="x" onClick={close}>{shots.length ? '완료' : '닫기'}</button>
        <button className="shutter" aria-label="사진 찍기" onClick={() => {
          const el = v.current; if (!el?.videoWidth) return
          const c = document.createElement('canvas'); c.width = el.videoWidth; c.height = el.videoHeight
          c.getContext('2d')!.drawImage(el, 0, 0)
          c.toBlob((b) => { if (b) setShots((s) => [...s, b]) }, 'image/jpeg', 0.85)
          if (flash.current) { flash.current.style.opacity = '.8'; setTimeout(() => { if (flash.current) flash.current.style.opacity = '0' }, 80) }
        }} />
        <span style={{ minWidth: 56, textAlign: 'right', color: 'var(--ivory)', fontSize: 13 }}>{shots.length ? shots.length + '장' : ''}</span>
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
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 24
    const s = Math.min(im.width, im.height) * 0.4
    c.getContext('2d')!.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 24, 24)
    const px = c.getContext('2d')!.getImageData(0, 0, 24, 24).data
    let r = 0, g = 0, bl = 0; for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; bl += px[i + 2] }
    const n = px.length / 4, h = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
    fin(('#' + h(r) + h(g) + h(bl)).toUpperCase())
  }
  im.onerror = () => fin('#E5DCC8')
  im.src = b.img
}
let scanning = false
function editTile(b: Tile) {
  openSheet(() => (
    <>
      {b.manual && !b.cat ? <><h3>직접 골라 주세요</h3><p>종류와 색은 꼭 골라 주세요</p></> : <><h3>이 옷이 맞나요?</h3><p>틀린 부분만 골라 주세요</p></>}
      <h4>종류</h4>
      {/* 고치기 창: 고른 후보가 조금 틀렸을 때 종류·색·무늬를 직접 바꿈. 바꾸면 이름(b.name)을 비워서
          옷장에 넣을 때 바뀐 값으로 이름을 새로 만든다 */}
      {/* 종류를 바꾸면 세부 종류는 그 종류에 맞지 않으므로 비운다 (예: 상의 → 하의면 '셔츠'가 남으면 안 됨) */}
      <div className="opts">{CATS.map((c) => <button key={c} className={`opt ${b.cat === c ? 'on' : ''}`} onClick={() => { if (b.cat !== c) b.sub = null; b.cat = c; b.name = null; emit() }}>{c}</button>)}</div>
      {/* 세부 종류: 고른 종류에 맞는 것만 보여 줌 (SUBS). 같은 상의라도 셔츠·니트·티셔츠는 코디가 달라서 따로 고른다 */}
      {b.cat && (
        <>
          <h4>세부 종류</h4>
          <div className="opts">{SUBS[b.cat].map((x) => <button key={x} className={`opt ${b.sub === x ? 'on' : ''}`} onClick={() => { b.sub = x; b.name = null; emit() }}>{x}</button>)}</div>
        </>
      )}
      <h4>색</h4>
      <div className="scan"><span className="sw" style={{ background: b.hex || (b.color ? COLORS[b.color] : 'transparent') }} />
        <p>{b.hex ? <>사진에서 뽑은 색이에요. 가장 가까운 이름은 <b>{b.color}</b></> : '같은 아이보리도 옷마다 달라요. 사진에서 색을 그대로 뽑을 수 있어요'}</p>
        <button className="btn" disabled={scanning} onClick={() => { scanning = true; emit(); scanColor(b, () => { scanning = false; b.name = null; emit() }) }}>{scanning ? '뽑는 중' : '사진에서 색 뽑기'}</button></div>
      <div className="opts">{Object.keys(COLORS).map((c) => <button key={c} className={`opt ${b.color === c && !b.hex ? 'on' : ''}`} onClick={() => { b.color = c; b.hex = null; b.name = null; emit() }}><i style={{ background: COLORS[c] }} />{c}</button>)}</div>
      <h4>무늬</h4>
      <div className="opts">{PATTERNS.map((pn) => <button key={pn} className={`opt ${b.pattern === pn ? 'on' : ''}`} onClick={() => { b.pattern = pn; b.name = null; emit() }}><i style={{ background: swatchBg('#E8E2D4', pn) }} />{pn}</button>)}</div>
      <button className="btn solid full" disabled={!b.color || !b.cat} onClick={closeAll}>확인</button>
    </>
  ))
}
