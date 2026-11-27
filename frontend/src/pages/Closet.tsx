// 옷장: 내 옷 / 추천 제외 (담당: B)
// - Figma v4 3-1: 종류·정렬은 칩, 색은 18색 전부를 한 줄로 좌우로 넘겨 고른다. 옷은 3칸 격자
// - 정렬은 '최근 넣은 순'만 쓴다. 나머지 기준은 아직 준비 중이라 누르면 알림만 띄운다 (11/27 팀 결정)
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from '../components/Icons'
import { Ph } from '../components/Ph'
import { CATS, COLORS } from '../data/seed'
import type { Item } from '../data/types'
import { S, displayName, setClosetColor, setClosetSort, setClosetTab, setClosetView, setExcluded, useApp, worn, wornKey } from '../store'
import { toast } from '../ui'

/** 정렬 버튼 (S.cSort는 이 순서의 번호) */
const SORTS = ['최근 넣은 순', '오래 안 입은 옷', '최근 입은 옷', 'AI 추천 많은 순']
/** 지금 쓰는 정렬 번호. 0(최근 넣은 순)만 열어 두고, 나머지는 누르면 '준비 중' 알림만 띄운다.
 *  다른 기준의 정렬 코드는 아래에 그대로 두었으니, 열 때는 이 목록에 번호만 더하면 된다 */
const READY_SORTS = [0]
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
  // 색 칩: 앱이 아는 18색(COLORS)을 전부 보여 준다. 내가 가진 색만이 아니라 18색을 모두 넘겨 볼 수 있게 (11/27).
  // 서버·사진 분석에서 18색에 없는 새 색 이름이 오면 그 색도 뒤에 붙인다
  const have = [...new Set([...Object.keys(COLORS), ...items.map((i) => i.color)])]
  // 종류 칩 옆 개수 (덧입기는 상의에 포함)
  const nOf = (t: string) => items.filter((i) => inTab(i, t)).length
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
      <div className="head"><div className="h1row"><h1>My <i>Wardrobe</i></h1><button className="addbtn" onClick={() => nav('/upload')}><Plus />옷 추가</button></div></div>
      <div className="pad">
        <div className="seg" id="c-seg">
          <button className={S.cView === 'items' ? 'on' : ''} onClick={() => setClosetView('items')}>내 옷</button>
          <button className={S.cView === 'ex' ? 'on' : ''} onClick={() => setClosetView('ex')}>추천 제외 {ex.length}</button>
        </div>
        {S.cView === 'items' ? (
          <div>
            {/* 종류 칩: 줄이 길면 좌우로 넘긴다 */}
            <div className="scroller ccat" aria-label="종류">
              {['전체', ...cats].map((t) => <button key={t} className={`pill ${t === tab ? 'on' : ''}`} aria-pressed={t === tab} onClick={() => setClosetTab(t)}>{t}{t !== '전체' && ` ${nOf(t)}`}</button>)}
            </div>
            <div className="scroller csort" aria-label="정렬">
              {SORTS.map((s, i) => <button key={s} className={`pill ${i === S.cSort ? 'on' : ''}`} aria-pressed={i === S.cSort}
                onClick={() => READY_SORTS.includes(i) ? setClosetSort(i) : toast(`'${s}' 정렬은 준비 중이에요`)}>{s}</button>)}
            </div>
            {S.cSort === 3 && <p className="note">AI가 오늘의 코디에 많이 넣어 준 옷부터 보여 줘요. 커뮤니티 좋아요와는 관계없어요</p>}
            <div className="scroller" aria-label="색으로 거르기">
              <button className={`pill ${S.cColor ? '' : 'on'}`} onClick={() => setClosetColor(null)}>모든 색</button>
              {have.map((c) => <button key={c} className={`pill ${S.cColor === c ? 'on' : ''}`} onClick={() => setClosetColor(c)}><i style={{ background: pillColor(c) }} />{c}</button>)}
            </div>
            {/* 개수 안내는 제목 밑이 아니라 지금 보는 목록 바로 위에 둠 */}
            <p className="ccount" id="c-count">{count}</p>
            <div className="grid3 cgrid">
              {list.length ? list.map((i) => (
                <div className="card" key={i.id}>
                  <Ph item={i} style={{ height: 136 }} />
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
