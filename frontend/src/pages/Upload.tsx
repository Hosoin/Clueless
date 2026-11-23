// 옷 등록: 여러 장을 한 번에 올리면 종류·색·무늬를 자동으로 정리 (담당: B)
// 지금은 분류 결과가 가짜(guess)다. 분류 모델 API가 생기면 startBatch 안의 setTimeout 부분을 API 호출로 바꾼다.
// 종류는 모델이 가장 가깝다고 본 후보 3개를 확률과 함께 보여 주고, 사용자가 직접 고른다 (ML API의 category_candidates와 같은 형태)
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Back } from '../components/Icons'
import { CATS, COLORS, PATTERNS, photo } from '../data/seed'
import type { Category } from '../data/types'
import { S, emit, swatchBg, useApp } from '../store'
import { askPermission, closeAll, openSheet, toast } from '../ui'

/** 종류 후보 하나: 모델이 이 사진을 cat이라고 본 확률(0~1). ML API의 category_candidates 한 칸과 같은 모양 */
type Cand = { cat: Category; prob: number }
/**
 * 올린 사진 한 장의 정리 상태.
 * - cat: 사용자가 후보에서 고른 종류. 고르기 전에는 null이고, null이면 옷장에 넣을 수 없다
 * - cands: 분석이 끝나면 채워지는 종류 후보 3개 (확률 높은 순)
 * - color·pattern·hex: 분석 결과(사용자가 고칠 수 있음). hex는 "사진에서 색 뽑기"를 했을 때만 있음
 * - guess: 가짜 분석 결과 [종류, 색, 무늬]. 진짜 API가 생기면 없어짐
 * - done: 분석이 끝났는지 (끝나기 전엔 타일에 '확인 중' 표시)
 */
type Tile = { id: number; img: string | null; cat: Category | null; cands: Cand[]; color: string | null; pattern: string; hex: string | null; guess: [Category, string | null, string]; done: boolean }

// 가짜 후보 만들기. 모델이 고른 종류 + 그 종류와 헷갈리기 쉬운 종류 두 개를 확률 높은 순으로 돌려준다.
// NEAR: 종류별로 모델이 자주 헷갈릴 만한 종류 (예: 긴 상의는 원피스로, 셔츠는 아우터로 보일 수 있음)
// candsOf(top, i): top이 1순위, i는 사진 순번으로 확률을 조금씩 다르게 만들어 화면이 단조롭지 않게 함.
// 2·3순위 확률은 남은 값을 나눠 정하므로 세 확률의 합은 1보다 작을 수 있다 (나머지 종류에 남는 확률).
// 진짜 API가 생기면 이 함수 대신 응답의 category_candidates 앞 3개를 그대로 쓴다.
const NEAR: Record<Category, Category[]> = { 상의: ['아우터', '원피스'], 덧입기: ['상의', '아우터'], 하의: ['원피스', '상의'], 아우터: ['상의', '덧입기'], 원피스: ['상의', '하의'] }
const candsOf = (top: Category, i: number): Cand[] => {
  const p1 = [0.82, 0.64, 0.71, 0.55, 0.77, 0.9][i % 6], p2 = Math.round((1 - p1) * 0.65 * 100) / 100
  return [{ cat: top, prob: p1 }, { cat: NEAR[top][0], prob: p2 }, { cat: NEAR[top][1], prob: Math.round((1 - p1 - p2) * 0.8 * 100) / 100 }]
}
let batch: Tile[] = []

function startBatch(files: FileList | Blob[] | null) {
  const list: (Blob | undefined)[] = files && files.length ? [...files].slice(0, 9) : Array.from({ length: 6 })
  const guesses: [Category, string | null, string][] = [['상의', '화이트', '무지'], ['하의', '블랙', '무지'], ['아우터', '카멜', '무지'], ['원피스', null, '플라워'], ['상의', '네이비', '스트라이프'], ['하의', '데님', '무지'], ['상의', '블랙', '무지'], ['아우터', '카키', '무지'], ['하의', '베이지', '체크']]
  const demoIds = [4, 7, 10, 12, 5, 6]
  batch = list.map((f, i) => ({ id: ++S.uid, img: f ? URL.createObjectURL(f) : photo(demoIds[i % demoIds.length]) || null, cat: null, cands: [], color: null, pattern: '무지', hex: null, guess: guesses[i % guesses.length], done: false }))
  emit()
  batch.forEach((b, i) => setTimeout(() => {
    b.cands = candsOf(b.guess[0], i); b.color = b.guess[1]; b.pattern = b.guess[2]; b.done = true; emit() // 종류는 자동으로 정하지 않고 사용자가 후보 3개 중에서 고름 (모델이 틀려도 사용자가 바로 잡게)
  }, 700 + i * 650 + (i >= batch.length - 2 ? 1800 : 0)))
}

export default function Upload() {
  useApp()
  const nav = useNavigate()
  const album = useRef<HTMLInputElement>(null), shot = useRef<HTMLInputElement>(null)
  const [cam, setCam] = useState(false)
  const done = batch.filter((b) => b.done).length, ready = batch.filter((b) => b.done && b.cat && b.color).length, needCat = batch.filter((b) => b.done && !b.cat).length, left = batch.length - done
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
                  <button className={`ph ${b.done ? '' : 'wait'} ${b.done && (!b.color || !b.cat) ? 'warn' : ''}`} disabled={!b.done} aria-label={b.done ? '종류·색·무늬 고치기' : '확인 중'} onClick={() => editTile(b)}>
                    {b.img && <img src={b.img} alt="" />}
                    {b.done ? (b.color && <span className="chip" style={{ background: swatchBg(b.hex || COLORS[b.color], b.pattern) }} />) : <span className="spin" />}
                  </button>
                  {b.done ? (
                    <>
                      {/* 종류 후보 3개: 누르면 그 종류로 정해짐. 하나만 고를 수 있어서 radio 역할 */}
                      <div className="cands" role="radiogroup" aria-label="가장 가까운 종류">
                        {b.cands.map((c) => (
                          <button key={c.cat} role="radio" aria-checked={b.cat === c.cat} className={`cand ${b.cat === c.cat ? 'on' : ''}`} onClick={() => { b.cat = c.cat; emit() }}>
                            {c.cat}<span>{Math.round(c.prob * 100)}%</span>
                          </button>
                        ))}
                      </div>
                      <p className={`k ${b.color ? '' : 'pink'}`}>{b.color ? b.color + (b.pattern !== '무지' ? ' · ' + b.pattern : '') : '색을 골라 주세요'}</p>
                    </>
                  ) : (<><p className="k" style={{ fontSize: 13 }}>확인 중</p><p className="k">&nbsp;</p></>)}
                </div>
              ))}
            </div>
            <p className="hint">{needCat ? `가장 가까운 종류를 골라 주세요 (${needCat}장 남음)` : '사진을 누르면 색과 무늬를 고칠 수 있어요'}</p>
            <button className="btn solid full" style={{ marginTop: 16 }} disabled={!ready} onClick={() => {
              const take = batch.filter((b) => b.done && b.cat && b.color)
              take.forEach((b) => S.items.unshift({ id: b.id, name: `${b.color} ${b.pattern !== '무지' ? b.pattern + ' ' : ''}${b.cat}`, cat: b.cat!, color: b.color!, hex: b.hex, pattern: b.pattern, rec: 0, tags: [], lastWorn: null, img: b.img || undefined, isNew: true, added: Date.now() }))
              batch = batch.filter((b) => !(b.done && b.cat && b.color))
              toast(`${take.length}벌을 옷장에 넣었어요`)
              setTimeout(() => { S.cView = 'items'; S.cSort = 0; nav('/closet') }, 500)
            }}>{ready ? ready + '벌 옷장에 넣기' : needCat ? '종류를 고르면 넣을 수 있어요' : '정리가 끝나면 넣을 수 있어요'}</button>
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
function Camera({ onClose, onFail }: { onClose: (shots: Blob[]) => void; onFail: (denied: boolean) => void }) {
  const v = useRef<HTMLVideoElement>(null), flash = useRef<HTMLDivElement>(null), stream = useRef<MediaStream | null>(null)
  const [shots, setShots] = useState<Blob[]>([])
  const start = (el: HTMLVideoElement | null) => {
    v.current = el
    if (!el || stream.current) return
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => { stream.current = s; el.srcObject = s })
      .catch((e: DOMException) => onFail(e?.name === 'NotAllowedError')) // 권한 요청에서 '허용 안 함'을 누른 경우
  }
  const close = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; onClose(shots) }
  return (
    <div className="cam on">
      <video ref={start} playsInline muted autoPlay />
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
        <span style={{ minWidth: 56, textAlign: 'right', color: '#FAF7EF', fontSize: 13 }}>{shots.length ? shots.length + '장' : ''}</span>
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
  if (!b.img) return setTimeout(() => fin(COLORS[b.color || b.guess[1] || '아이보리'] || '#E5DCC8'), 500)
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
      <h3>이 옷이 맞나요?</h3><p>틀린 부분만 골라 주세요</p>
      <h4>종류</h4>
      {/* 고치기 창의 종류: 후보 3개를 먼저(확률 표시), 나머지 종류는 뒤에. 후보에 없는 종류도 고를 수 있게 */}
      <div className="opts">{[...b.cands.map((x) => x.cat), ...CATS.filter((c) => !b.cands.some((x) => x.cat === c))].map((c) => { const p = b.cands.find((x) => x.cat === c); return <button key={c} className={`opt ${b.cat === c ? 'on' : ''}`} onClick={() => { b.cat = c; emit() }}>{c}{p && <span style={{ color: 'var(--soft)', fontSize: 11 }}>{Math.round(p.prob * 100)}%</span>}</button> })}</div>
      <h4>색</h4>
      <div className="scan"><span className="sw" style={{ background: b.hex || (b.color ? COLORS[b.color] : 'transparent') }} />
        <p>{b.hex ? <>사진에서 뽑은 색이에요. 가장 가까운 이름은 <b>{b.color}</b></> : '같은 아이보리도 옷마다 달라요. 사진에서 색을 그대로 뽑을 수 있어요'}</p>
        <button className="btn" disabled={scanning} onClick={() => { scanning = true; emit(); scanColor(b, () => { scanning = false; emit() }) }}>{scanning ? '뽑는 중' : '사진에서 색 뽑기'}</button></div>
      <div className="opts">{Object.keys(COLORS).map((c) => <button key={c} className={`opt ${b.color === c && !b.hex ? 'on' : ''}`} onClick={() => { b.color = c; b.hex = null; emit() }}><i style={{ background: COLORS[c] }} />{c}</button>)}</div>
      <h4>무늬</h4>
      <div className="opts">{PATTERNS.map((pn) => <button key={pn} className={`opt ${b.pattern === pn ? 'on' : ''}`} onClick={() => { b.pattern = pn; emit() }}><i style={{ background: swatchBg('#E8E2D4', pn) }} />{pn}</button>)}</div>
      <button className="btn solid full" disabled={!b.color || !b.cat} onClick={closeAll}>확인</button>
    </>
  ))
}
