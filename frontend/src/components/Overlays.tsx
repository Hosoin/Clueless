// 화면 위에 뜨는 것들을 그리는 자리: 알림(toast), 바깥 어둡게(scrim), 아래 창(sheet), 가운데 창(modal).
// 상태와 여닫는 함수(toast, openSheet, openModal, closeAll …)는 ui.tsx에 있고, 이 컴포넌트는 그 상태(O)를 읽어서 그리기만 한다.
// Layout.tsx가 폰 틀 안에 한 번 둔다.
import { useApp } from '../store'
import { O, closeAll } from '../ui'

/** 알림·창 자리. 창이 열려 있으면 바깥을 어둡게 하고, 바깥을 누르면 모두 닫는다 */
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
