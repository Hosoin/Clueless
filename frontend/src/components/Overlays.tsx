// 화면 위에 뜨는 것들을 그리는 자리: 알림(toast), 바깥 어둡게(scrim), 아래 창(sheet), 가운데 창(modal).
// 상태와 여닫는 함수(toast, openSheet, openModal, closeAll …)는 ui.tsx에 있고, 이 컴포넌트는 그 상태(O)를 읽어서 그리기만 한다.
// Layout.tsx가 폰 틀 안에 한 번 둔다.
// 창이 열려 있는 동안에는 키보드 포커스를 창 안에 두고, 뒤 화면은 누르거나 Tab으로 갈 수 없게 한다 (접근성, 코드 리뷰 34번).
import { useEffect, useRef } from 'react'
import { useApp } from '../store'
import { O, closeAll } from '../ui'

/** 창이 아닌 것(알림·바깥 어둡게·창)을 고르는 선택자. 폰 틀(#app)의 나머지 자식은 뒤 화면이다 */
const OVERLAY = '.toast, .scrim, .sheet, .modal'
/** 키보드로 갈 수 있는 것 (창 안에서 Tab을 돌릴 때 첫 칸·마지막 칸을 찾는다) */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** 알림·창 자리. 창이 열려 있으면 바깥을 어둡게 하고, 바깥을 누르면 모두 닫는다 */
export function Overlays() {
  useApp()
  const open = !!(O.sheet || O.modal)
  const sheetRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const before = useRef<HTMLElement | null>(null) // 창을 열기 전에 포커스가 있던 곳 (닫으면 돌려준다)
  const top = O.modal ? 'modal' : O.sheet ? 'sheet' : null // 맨 위에 보이는 창

  // 뒤 화면(위쪽 줄·화면·하단 탭)을 inert로: 창이 열려 있는 동안 누를 수도, Tab으로 갈 수도, 화면 읽기 프로그램이 읽을 수도 없다.
  // 뒤 화면 요소들은 Layout이 그려서 여기서 속성만 붙였다 뗀다. 화면이 바뀌어도 맞게 그릴 때마다 다시 맞춘다
  useEffect(() => {
    const app = sheetRef.current?.parentElement
    if (!app) return
    for (const el of Array.from(app.children)) if (!el.matches(OVERLAY)) el.toggleAttribute('inert', open)
  })

  // 포커스 옮기기: 창이 열리거나(또는 아래 창 위에 가운데 창이 열리면) 맨 위 창으로, 모두 닫히면 열기 전 자리로
  useEffect(() => {
    if (top) {
      if (!before.current) before.current = document.activeElement as HTMLElement | null
      const box = top === 'modal' ? modalRef.current : sheetRef.current
      // 창 안의 입력칸이 스스로 포커스를 가져갔으면(autoFocus) 그대로 두고, 아니면 창 자체에 포커스를 둔다
      if (box && !box.contains(document.activeElement)) box.focus({ preventScroll: true })
    } else if (before.current) {
      const back = before.current; before.current = null
      if (back.isConnected) back.focus({ preventScroll: true }) // 창 안에서 화면을 옮겼으면(버튼이 사라짐) 돌려주지 않는다
    }
  }, [top])

  // Tab을 창 안에서 돌린다: 마지막 칸에서 Tab → 첫 칸, 첫 칸(또는 창 자체)에서 Shift+Tab → 마지막 칸.
  // 뒤 화면은 inert라 닿지 않지만, 그냥 두면 페이지 끝을 지나 브라우저 주소창 쪽으로 빠졌다가 돌아온다
  useEffect(() => {
    if (!top) return
    const box = top === 'modal' ? modalRef.current : sheetRef.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !box) return
      const list = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => !x.hasAttribute('disabled') && x.offsetParent !== null)
      if (!list.length) { e.preventDefault(); return }
      const first = list[0], last = list[list.length - 1], at = document.activeElement
      if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && (at === first || at === box)) { e.preventDefault(); last.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [top])

  return (
    <>
      <div className={`toast ${O.toastOn ? 'on' : ''}`} role="status">{O.toast}</div>
      <div className={`scrim ${open ? 'on' : ''}`} onClick={closeAll} />
      {/* tabIndex -1: 창 자체에 포커스를 둘 수 있게 (Tab 순서에는 넣지 않음). aria-modal은 열려 있을 때만 */}
      <div ref={sheetRef} className={`sheet ${O.sheet ? 'on' : ''} ${O.sheetTall ? 'tall' : ''}`} role="dialog" aria-modal={O.sheet ? true : undefined} tabIndex={-1}>{O.sheet?.()}</div>
      <div ref={modalRef} className={`modal ${O.modal ? 'on' : ''} ${O.modalCls}`} role="dialog" aria-modal={O.modal ? true : undefined} tabIndex={-1}>{O.modal?.()}</div>
    </>
  )
}
