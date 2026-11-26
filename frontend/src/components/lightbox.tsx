// 옷 크게 보기 창과 그 안에서 여는 창(별명 붙이기, 옷 삭제 확인).
// 창을 여는 함수만 있는 파일이다. 옷 사진 칸 컴포넌트(Ph.tsx)와 한 파일에 있으면 개발 중 화면 자동 갱신이 잘 안 돼서 나눴다 (코드 리뷰 29번)
import type { Item } from '../data/types'
import { deleteItem, displayName, emit, hexOf, iga, tidyRows, worn } from '../store'
import { closeAll, openModal, toast } from '../ui'

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
