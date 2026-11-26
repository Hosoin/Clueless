import type { CSSProperties } from 'react'
import type { Item } from '../data/types'
import { deleteItem, emit, hexOf, iga, tidyRows, worn } from '../store'
import { closeAll, openModal, toast } from '../ui'

/** 옷 사진 칸: 사진 + 오른쪽 위 색 동그라미. 누르면 크게 보기 (onClick을 주면 그걸 대신 함) */
export function Ph({ item, label = '', onClick, style, className = '', as = 'button', id }: {
  item?: Item | null; label?: string; onClick?: (() => void) | null; style?: CSSProperties; className?: string; as?: 'button' | 'span'; id?: string
}) {
  const inner = (
    <>
      {item?.img && <img src={item.img} alt="" />}
      {item && <span className="chip" style={{ background: hexOf(item) }} />}
      {!item?.img && label && <p className="lbl">{label}</p>}
    </>
  )
  if (as === 'span') return <span className={`ph ${className}`} style={style}>{inner}</span>
  const click = onClick === null ? undefined : onClick || (item ? () => lightbox(item) : undefined)
  return (
    <button id={id} className={`ph ${className}`} style={style} onClick={click} aria-label={item ? `${item.name} 크게 보기` : label}>
      {inner}
    </button>
  )
}

/** 사진 크게 보기 */
export function lightbox(it: Item) {
  openModal(() => (
    <>
      <button className="ph big" style={{ cursor: 'default' }}>
        {it.img && <img src={it.img} alt="" />}
        <span className="chip" style={{ background: hexOf(it) }} />
        <p className="lbl">{it.img ? '' : '사진 자리'}</p>
      </button>
      <h3>{it.name}</h3>
      <dl>
        <dt>종류</dt><dd>{it.cat}</dd>
        <dt>색</dt><dd>{it.color}{it.hex ? ' (사진에서 뽑은 색)' : ''}</dd>
        <dt>마지막</dt><dd>{worn(it)}</dd>
        <dt>AI 추천</dt><dd>{it.ex ? '추천에서 뺀 옷' : it.rec ? `오늘의 코디에 ${it.rec}번 추천됨` : '곧 추천 예정'}</dd>
      </dl>
      {it.credit && <p className="credit">사진 {it.credit} · Unsplash</p>}
      <div className="row2">
        <button className="btn" onClick={() => {
          it.ex = !it.ex; closeAll()
          tidyRows() // 뺀 옷이 홈 줄에 남아 하얀 '옷이 없어요' 칸이 생기지 않게 줄을 정리
          toast(it.ex ? '이 옷은 추천에 넣지 않을게요. 옷장의 추천 제외에서 되돌릴 수 있어요' : '다시 추천에 넣을게요'); emit()
        }}>{it.ex ? '다시 추천받기' : '추천에서 빼기'}</button>
        <button className="btn solid" onClick={closeAll}>닫기</button>
      </div>
      <button className="link danger" style={{ display: 'block', margin: '6px auto 0' }} onClick={() => confirmDelete(it)}>옷장에서 삭제</button>
    </>
  ), 'lb')
}

/** 옷 삭제: 추천 코디·저장한 코디·입은 기록·입을 계획에서도 함께 빠짐 */
function confirmDelete(it: Item) {
  openModal(() => (
    <>
      <h3>이 옷을 삭제할까요?</h3>
      <p className="sub">{it.name}{iga(it.name)} 옷장에서 사라지고, 저장한 코디, 입은 기록, 입을 계획에서도 빠져요. 되돌릴 수 없어요.</p>
      <div className="row2" style={{ marginTop: 18 }}>
        <button className="btn" onClick={() => lightbox(it)}>취소</button>
        <button className="btn solid danger" onClick={() => { deleteItem(it); closeAll(); toast('옷을 삭제했어요') }}>삭제</button>
      </div>
    </>
  ))
}
