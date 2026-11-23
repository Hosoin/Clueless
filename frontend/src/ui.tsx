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
