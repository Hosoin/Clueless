// 옷장: 내 옷 / 추천 제외 (담당: B)
import { Fragment, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from '../components/Icons'
import { Ph } from '../components/Ph'
import { CATS, COLORS } from '../data/seed'
import type { Item } from '../data/types'
import { S, displayName, setClosetColor, setClosetSort, setClosetTab, setClosetView, setExcluded, useApp, worn, wornKey } from '../store'
import { toast } from '../ui'

/** 정렬 버튼 (S.cSort는 이 순서의 번호) */
const SORTS = ['최근 넣은 순', '오래 안 입은 옷', '최근 입은 옷', 'AI 추천 많은 순']
const LONG = 30 // 이 날수 넘게 안 입었으면 '오래 안 입은 옷'
/** 색 필터 칩의 동그라미 색. 색 목록(COLORS)에 없는 색 이름이면(서버나 사진 분석에서 새 이름이 올 때)
 *  그 색인 옷의 색 코드를, 그것도 없으면 회색을 쓴다. store.ts의 hexOf와 같은 기준 (코드 리뷰 22번) */
const pillColor = (c: string) => COLORS[c] || S.items.find((i) => i.color === c && i.hex)?.hex || '#CCCCCC'

/** 옷 i가 종류 탭 t에 들어가는지. 덧입기는 따로 탭 없이 상의에 포함 */
const inTab = (i: Item, t: string) => t === '전체' || i.cat === t || (t === '상의' && i.cat === '덧입기')

/** 옷장 화면: 내 옷(종류 탭·정렬·색 거르기) / 추천 제외 */
export default function Closet() {
  useApp()
  const nav = useNavigate()
  const items = S.items
  const cats = CATS.filter((c) => c !== '덧입기' && items.some((i) => inTab(i, c))) // 옷이 한 벌도 없는 종류는 탭을 숨김
  // 고른 종류의 옷이 다 없어져 탭이 사라졌으면 '전체'를 보여 준다. 그리는 중에는 S를 바꾸지 않고 보여 줄 탭만 따로 계산하고,
  // S.cTab은 그린 뒤 effect에서 맞춘다 (코드 리뷰 23번)
  const tab = S.cTab !== '전체' && !(cats as string[]).includes(S.cTab) ? '전체' : S.cTab
  useEffect(() => { if (S.cTab !== tab) setClosetTab(tab) }, [tab])
  const have = [...new Set(items.map((i) => i.color))]
  let list = items.filter((i) => inTab(i, tab) && (!S.cColor || i.color === S.cColor))
  if (S.cSort === 0) list = [...list].sort((a, b) => b.added - a.added)
  if (S.cSort === 1) list = list.filter((i) => wornKey(i) > LONG).sort((a, b) => wornKey(b) - wornKey(a) || a.name.localeCompare(b.name, 'ko'))
  if (S.cSort === 2) list = list.filter((i) => wornKey(i) <= LONG).sort((a, b) => wornKey(a) - wornKey(b) || a.name.localeCompare(b.name, 'ko'))
  if (S.cSort === 3) list = [...list].sort((a, b) => b.rec - a.rec)
  // 목록 바로 위에 보여 주는 개수. 종류 탭·색·정렬로 걸러 낸 목록(list)의 수로 센다.
  // 전에는 옷장 전체(items)로 세서, '하의' 탭이나 '블랙' 필터를 켜도 '총 16벌'처럼 전체 수가 보였다 (코드 리뷰 11/27 4번)
  const count = S.cView === 'ex' ? `추천에서 뺀 옷 ${items.filter((i) => i.ex).length}벌`
    : S.cSort === 1 ? `${LONG}일 넘게 안 입은 옷 ${list.length}벌`
    : S.cSort === 2 ? `최근 ${LONG}일 안에 입은 옷 ${list.length}벌`
    : `총 ${list.length}벌`
  const ex = items.filter((i) => i.ex)

  return (
    <section className="screen on" id="s-closet">
      <div className="head"><div className="h1row"><h1>My <i>Wardrobe</i></h1><button className="addplus" aria-label="옷 등록" onClick={() => nav('/upload')}><Plus /></button></div></div>
      <div className="pad">
        <div className="seg" id="c-seg">
          <button className={S.cView === 'items' ? 'on' : ''} onClick={() => setClosetView('items')}>내 옷</button>
          <button className={S.cView === 'ex' ? 'on' : ''} onClick={() => setClosetView('ex')}>추천 제외</button>
        </div>
        {S.cView === 'items' ? (
          <div>
            <div className="tabs">{['전체', ...cats].map((t) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setClosetTab(t)}>{t}</button>)}</div>
            <div className="sorts" aria-label="정렬">
              {SORTS.map((s, i) => <Fragment key={s}>{i > 0 && <span />}<button className={i === S.cSort ? 'on' : ''} aria-pressed={i === S.cSort} onClick={() => setClosetSort(i)}>{s}</button></Fragment>)}
            </div>
            {S.cSort === 3 && <p className="note">AI가 오늘의 코디에 많이 넣어 준 옷부터 보여 줘요. 커뮤니티 좋아요와는 관계없어요</p>}
            <div className="scroller" aria-label="색으로 거르기">
              <button className={`pill ${S.cColor ? '' : 'on'}`} onClick={() => setClosetColor(null)}>모든 색</button>
              {have.map((c) => <button key={c} className={`pill ${S.cColor === c ? 'on' : ''}`} onClick={() => setClosetColor(c)}><i style={{ background: pillColor(c) }} />{c}</button>)}
            </div>
            {/* 개수 안내는 제목 밑이 아니라 지금 보는 목록 바로 위에 둠 */}
            <p className="ccount" id="c-count">{count}</p>
            <div className="grid2">
              {list.length ? list.map((i) => (
                <div className="card" key={i.id}>
                  <Ph item={i} style={{ height: 160 }} />
                  <p className="t">{displayName(i)}</p>
                  <p className="s">{i.cat} · {worn(i)}</p>
                  {i.ex ? <p className="s">추천에서 뺀 옷</p> : i.isNew ? <p className="s pink">새로 넣은 옷</p> : i.rec ? <p className="s">AI 추천 {i.rec}번</p> : <p className="s pink">곧 추천 예정</p>}
                </div>
              )) : <div className="empty span-all">조건에 맞는 옷이 없어요</div>}
            </div>
          </div>
        ) : (
          <div>
            <p className="note mt16">여기 있는 옷은 오늘의 코디 추천에 넣지 않아요</p>
            <p className="ccount" id="c-count">{count}</p>
            <div className="mt8">
              {ex.length ? ex.map((i) => (
                <div className="erow" key={i.id}>
                  <Ph item={i} as="span" />
                  <p>{displayName(i)}<span>{i.cat} · {worn(i)}</span></p>
                  <button className="btn" onClick={() => { setExcluded(i, false); toast('다시 추천에 넣을게요') }}>다시 추천받기</button>
                </div>
              )) : <div className="empty">추천에서 뺀 옷이 없어요<br />옷 사진을 누르고 "추천에서 빼기"를 고르면 여기에 모여요</div>}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
