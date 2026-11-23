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
export function openSheet(r: Render, tall = false) { O.sheet = r; O.sheetTall = tall; emit() }
export function openModal(r: Render, cls = '') { O.modal = r; O.modalCls = cls; emit() }
export function closeModal() { O.modal = null; emit() }
export function closeAll() { O.sheet = null; O.modal = null; emit() }
export const anyOpen = () => !!(O.sheet || O.modal)

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
      <div className="row2" style={{ marginTop: 18 }}>
        <button className="btn" onClick={() => { closeModal(); toast('접근을 허용해야 사진을 올릴 수 있어요') }}>허용 안 함</button>
        <button className="btn solid" onClick={() => { granted.add(kind); closeModal(); go() }}>허용</button>
      </div>
    </>
  ))
}
