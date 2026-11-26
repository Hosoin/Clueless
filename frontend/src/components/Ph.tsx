import type { CSSProperties } from 'react'
import type { Item } from '../data/types'
import { byId, hexOf } from '../store'
import { lightbox } from './lightbox'

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

/** 코디 썸네일 줄(.pair): 옷마다 사진 칸과 그 아래 한 줄. caption으로 아래 글을 고른다(예: 종류, 이름).
 *  홈 트렌드 결과, 캘린더 그날 코디, 저장한 코디에서 같이 쓴다 (코드 리뷰 27번) */
export function PhPair({ items, caption }: { items: Item[]; caption: (it: Item) => string }) {
  return <div className="pair">{items.map((it) => <div className="slot" key={it.id}><Ph item={it} label={it.cat} /><p className="cap">{caption(it)}</p></div>)}</div>
}

/** 작은 썸네일 묶음(.thumbs): 코디의 옷 사진을 작게 나란히. 사진이 없거나 지워져서 찾을 수 없는 옷은 빈 칸.
 *  코디 올리기 창, 캘린더의 입을 코디 고르기 창에서 같이 쓴다 (코드 리뷰 27번) */
export function Thumbs({ ids }: { ids: number[] }) {
  return <span className="thumbs">{ids.map((id) => { const img = byId(id)?.img; return <span className="ph" key={id}>{img && <img src={img} alt="" />}</span> })}</span>
}
