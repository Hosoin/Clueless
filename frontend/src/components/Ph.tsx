import type { CSSProperties } from 'react'
import type { Item } from '../data/types'
import { byId, deleteItem, emit, hexOf, iga, tidyRows, worn } from '../store'
import { closeAll, openModal, toast } from '../ui'
// 별명이 있으면 별명, 없으면 원래 이름 (옷 크게 보기 제목)
import { displayName } from '../store'

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

/** 사진 크게 보기 */
export function lightbox(it: Item) {
  openModal(() => (
    <>
      <button className="ph big" style={{ cursor: 'default' }}>
        {it.img && <img src={it.img} alt="" />}
        <span className="chip" style={{ background: hexOf(it) }} />
        <p className="lbl">{it.img ? '' : '사진 자리'}</p>
      </button>
      <h3>{displayName(it)}</h3>
      {/* 별명이 있으면 제목은 별명, 그 아래에 원래 이름을 작게 보여 줌 (어떤 옷인지 헷갈리지 않게) */}
      {it.alias && <p className="sub">{it.name}</p>}
      <dl>
        <dt>별명</dt><dd>{it.alias || '없음'}<button className="link alias-edit" onClick={() => editAlias(it)}>{it.alias ? '바꾸기' : '붙이기'}</button></dd>
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

/**
 * 별명 붙이기 창: 옷장에서 이 옷을 별명으로 보여 준다. 12자까지.
 * 비우고 저장하면 별명을 지워 원래 이름으로 돌아간다. 취소·저장 뒤에는 크게 보기로 돌아간다.
 * 입력하는 동안에는 화면을 다시 그릴 필요가 없어서 draft 변수에만 담아 두고, 저장할 때 한 번 반영한다.
 */
function editAlias(it: Item) {
  let draft = it.alias || ''
  openModal(() => (
    <>
      <h3>별명 붙이기</h3>
      <p className="sub">옷장에서 이 이름으로 보여요. 비우면 원래 이름으로 돌아가요</p>
      <label className="field2 alias-field"><span>별명</span>
        <input defaultValue={draft} maxLength={12} placeholder={`예: 최애 ${it.sub || it.cat}`} autoFocus onChange={(e) => { draft = e.target.value }} /></label>
      <div className="row2">
        <button className="btn" onClick={() => lightbox(it)}>취소</button>
        <button className="btn solid" onClick={() => {
          const v = draft.trim()
          it.alias = v || null
          toast(v ? '별명을 저장했어요' : '원래 이름으로 돌아왔어요'); emit(); lightbox(it)
        }}>저장</button>
      </div>
    </>
  ))
}

/** 옷 삭제: 추천 코디·저장한 코디·입은 기록·입을 계획에서도 함께 빠짐 */
function confirmDelete(it: Item) {
  openModal(() => (
    <>
      <h3>이 옷을 삭제할까요?</h3>
      <p className="sub">{it.name}{iga(it.name)} 옷장에서 사라지고, 저장한 코디, 입은 기록, 입을 계획에서도 빠져요. 되돌릴 수 없어요.</p>
      <div className="row2 mt18">
        <button className="btn" onClick={() => lightbox(it)}>취소</button>
        <button className="btn solid danger" onClick={() => { deleteItem(it); closeAll(); toast('옷을 삭제했어요') }}>삭제</button>
      </div>
    </>
  ))
}
