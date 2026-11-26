// 화면 위에 뜨는 것들: 알림(toast), 아래에서 올라오는 창(sheet), 가운데 창(modal)
// 프로토타입처럼 어디서든 toast('...'), openSheet(() => <내용/>), openModal(() => <내용/>)로 부른다.
import type { ReactNode } from 'react'
import { emit, useApp } from './store'

type Render = () => ReactNode
const O = {
  toast: '', toastOn: false, toastH: 0 as ReturnType<typeof setTimeout> | 0,
  sheet: null as Render | null, sheetTall: false,
  modal: null as Render | null, modalCls: '',
}

export function toast(msg: string) {
  O.toast = msg; O.toastOn = true; emit()
  if (O.toastH) clearTimeout(O.toastH)
  O.toastH = setTimeout(() => { O.toastOn = false; emit() }, 2400)
}
export function openSheet(r: Render, tall = false) { O.sheet = r; O.sheetTall = tall; pushOverlay(); emit() }
export function openModal(r: Render, cls = '') { O.modal = r; O.modalCls = cls; pushOverlay(); emit() }
export function closeModal() { O.modal = null; if (!anyOpen()) popOverlay(); emit() }
export function closeAll() { O.sheet = null; O.modal = null; popOverlay(); emit() }
export const anyOpen = () => !!(O.sheet || O.modal)

/* ---------- 뒤로가기로 창 닫기 ----------
   폰에서 창(아래 창·가운데 창)을 연 채로 뒤로가기를 하면, 창만 닫히지 않고 보던 화면까지 이전 화면으로 넘어갔다.
   그래서 창을 열 때 방문 기록에 "같은 주소 + overlay 표시"로 한 칸을 쌓아 두고,
   - 뒤로가기를 누르면 그 한 칸만 빠지면서(주소는 그대로) popstate가 오므로 창만 닫는다.
   - 버튼·바깥 누르기·Esc로 창을 닫으면, 쌓아 둔 칸을 history.back()으로 빼서 다음 뒤로가기가 헛돌지 않게 한다.
   웹(브라우저·폰 사파리)용이다. Capacitor 안드로이드의 하드웨어 뒤로가기 버튼은 @capacitor/app이 필요해서 따로 다룬다 */
let inHist = false // 지금 열린 창 때문에 방문 기록에 한 칸을 쌓아 두었는지
let pending: ReturnType<typeof setTimeout> | 0 = 0 // 창을 닫고 그 칸을 빼려고 기다리는 중인지

/** 창을 열 때: 아직 쌓아 둔 칸이 없으면 같은 주소로 한 칸 쌓는다. 창 위에 창을 열 때는 다시 쌓지 않는다 */
function pushOverlay() {
  // 창을 닫자마자 다시 연 경우(예: 삭제 확인 → 취소 → 크게 보기 다시 열기)는 빼려던 칸을 그대로 다시 쓴다
  if (pending) { clearTimeout(pending); pending = 0; return }
  if (inHist) return
  // 라우터가 쓰는 state(idx 등)는 그대로 두고 overlay 표시만 더해서, 라우터가 화면을 옮긴 걸로 착각하지 않게 한다
  window.history.pushState({ ...window.history.state, overlay: true }, '', window.location.href)
  inHist = true
}

/** 버튼 등으로 창을 닫을 때: 쌓아 둔 칸을 뺀다.
 *  창 안의 버튼이 닫자마자 다른 화면으로 옮기는 경우(closeAll() 뒤 go('/my') 등)가 있어서 바로 빼지 않고 한 박자 기다린다.
 *  그 사이 주소가 바뀌었으면(화면 이동이 일어났으면) 빼지 않는다. 빼면 방금 옮긴 화면이 취소되기 때문 */
function popOverlay() {
  if (!inHist || pending) return
  const href = window.location.href
  pending = setTimeout(() => {
    pending = 0; inHist = false
    if (window.location.href === href && window.history.state?.overlay) window.history.back()
  }, 0)
}

/** 사용자가 뒤로가기를 눌렀을 때: 창이 열려 있으면 창만 닫는다 (주소는 쌓아 둔 칸이 빠진 것이라 그대로) */
window.addEventListener('popstate', () => {
  if (!inHist || pending) return // 창이 없거나, popOverlay가 스스로 칸을 뺀 경우는 무시
  inHist = false
  O.sheet = null; O.modal = null; emit()
})

export function Overlays() {
  useApp()
  const open = !!(O.sheet || O.modal)
  return (
    <>
      <div className={`toast ${O.toastOn ? 'on' : ''}`} role="status">{O.toast}</div>
      <div className={`scrim ${open ? 'on' : ''}`} onClick={closeAll} />
      <div className={`sheet ${O.sheet ? 'on' : ''} ${O.sheetTall ? 'tall' : ''}`}>{O.sheet?.()}</div>
      <div className={`modal ${O.modal ? 'on' : ''} ${O.modalCls}`} role="dialog" aria-modal="true">{O.modal?.()}</div>
    </>
  )
}

/** 화면 안에서만 스크롤해서 el을 가운데로 (폰 틀 자체는 움직이지 않게) */
export function showIn(el: HTMLElement | null) {
  const scr = el?.closest('.screen'); if (!el || !scr) return
  const r = el.getBoundingClientRect(), b = scr.getBoundingClientRect()
  scr.scrollTop += (r.top - b.top) - (scr.clientHeight - r.height) / 2
}

/* 권한 요청: 웹은 앨범·파일을 열 때 브라우저가 권한을 묻지 않으므로 앱이 먼저 묻고, 허용하면 연다.
   한 번 허용하면 다시 묻지 않음. (카메라는 https에서 브라우저가 직접 묻는다)
   Capacitor 앱으로 만들 때는 @capacitor/camera의 requestPermissions()로 바꾸면 폰 자체 권한 창이 뜬다 */
const granted = new Set<string>()
const PERM = {
  photos: { title: '사진과 파일에 접근하려고 해요', why: '옷 사진을 올리려면 사진 보관함과 파일에 접근해야 해요. 고른 사진만 올라가요.' },
  camera: { title: '카메라에 접근하려고 해요', why: '옷을 바로 찍어 올리려면 카메라에 접근해야 해요.' },
} as const
export function askPermission(kind: keyof typeof PERM, go: () => void, why?: string) {
  if (granted.has(kind)) return go()
  const p = PERM[kind]
  openModal(() => (
    <>
      <h3>‘Clueless’에서 {p.title}</h3>
      <p className="sub">{why || p.why}</p>
      <div className="row2 mt18">
        <button className="btn" onClick={() => { closeModal(); toast('접근을 허용해야 사진을 올릴 수 있어요') }}>허용 안 함</button>
        <button className="btn solid" onClick={() => { granted.add(kind); closeModal(); go() }}>허용</button>
      </div>
    </>
  ))
}
