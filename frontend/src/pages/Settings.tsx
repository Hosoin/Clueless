// 설정 (담당: C)
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { logout } from '../api/auth'
import { errorText } from '../api/error'
import { Back } from '../components/Icons'
import { StyleGrid } from '../components/StyleGrid'
import { toLogin } from '../nav'
import { S, clearMe, euro, setClosetComparison, setDefaultScope, setPreferenceMode, setPreferenceStyles, setRecentDays, useApp } from '../store'
import { closeAll, openSheet, toast } from '../ui'

/** 좋아하는 스타일 창을 연다 (추천 방식을 '취향대로'로 바꿀 때, '좋아하는 스타일'을 누를 때). after: 저장한 뒤 할 일.
 *  이 화면 안에서만 써서 내보내지 않는다 (코드 리뷰 29번) */
function styleSheet(after: () => void) { openSheet(() => <StylePick after={after} />) }
/** 좋아하는 스타일 창의 내용. 고르는 동안은 창 안의 상태(pick)에만 두고, 저장을 눌러야 S.pref.styles에 넣는다 */
function StylePick({ after }: { after: () => void }) {
  const [pick, setPick] = useState([...S.pref.styles])
  return (
    <>
      <h3>좋아하는 스타일</h3><p>3개까지 고를 수 있어요</p>
      <StyleGrid picked={pick} onChange={setPick} className="mt0" />
      <button className="btn solid full mt16" disabled={!pick.length} onClick={() => { setPreferenceStyles(pick); closeAll(); after() }}>저장</button>
    </>
  )
}

/** 켜고 끄는 스위치. 누르면 set(!on)을 부르고 '○○ 켰어요/껐어요' 알림을 띄운다 */
function Switch({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return <button className="sw2" role="switch" aria-checked={on} aria-label={label} onClick={() => { set(!on); toast(`${label} ${!on ? '켰어요' : '껐어요'}`) }} />
}

/** 설정 화면 */
export default function Settings() {
  useApp()
  const nav = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false) // 로그아웃 요청 중인지 (버튼 연타 막기)
  const [noti, setNoti] = useState(true), [cnoti, setCnoti] = useState(true)
  const setMode = (m: 'taste' | 'trend') => { setPreferenceMode(m); toast(m === 'taste' ? '내 취향대로 추천할게요' : '요즘 유행대로 추천할게요') }
  return (
    <section className="screen on" id="s-settings">
      <button className="backrow" onClick={() => nav('/my')}><Back />MY</button>
      <div className="head pt4"><h1>Set<i>tings</i></h1></div>
      <div className="pad">
        <div className="sec"><h3>알림</h3>
          <div className="setrow"><div><p>아침 코디 알림</p><p className="sub2">매일 오전 8시에 오늘의 코디를 알려드려요</p></div><Switch label="아침 코디 알림" on={noti} set={setNoti} /></div>
          <div className="setrow"><div><p>커뮤니티 알림</p><p className="sub2">내 글에 좋아요와 댓글이 달리면 알려드려요</p></div><Switch label="커뮤니티 알림" on={cnoti} set={setCnoti} /></div>
        </div>
        <div className="sec"><h3>추천</h3>
          <div className="setrow"><div><p>최근 입은 옷 빼기 기준</p><p className="sub2">이 기간 안에 입은 옷은 추천에서 빼요</p></div>
            <div className="chips2">{[3, 7, 14].map((n) => <button key={n} className={n === S.RECENT ? 'on' : ''} onClick={() => { setRecentDays(n); toast(`최근 ${n}일 안에 입은 옷은 추천에서 뺄게요`) }}>{n}일</button>)}</div></div>
          <div className="setrow"><div><p>추천 방식</p><p className="sub2">오늘의 코디를 고르는 기준이에요</p></div>
            <div className="chips2">{([['taste', '취향대로'], ['trend', '유행대로']] as const).map(([k, l]) => (
              <button key={k} className={S.pref.mode === k ? 'on' : ''} style={{ whiteSpace: 'nowrap' }} onClick={() => { if (k === 'taste' && !S.pref.styles.length) styleSheet(() => setMode('taste')); else setMode(k) }}>{l}</button>
            ))}</div></div>
          {S.pref.mode === 'taste' && <button className="setrow setlink" onClick={() => styleSheet(() => toast('좋아하는 스타일을 바꿨어요'))}><p>좋아하는 스타일</p><span>{S.pref.styles.join('·')}</span></button>}
        </div>
        <div className="sec"><h3>커뮤니티</h3>
          <div className="setrow"><div><p>내 글 공개 범위</p><p className="sub2">새로 올리는 글에 적용돼요</p></div>
            <div className="chips2">{['전체 공개', '팔로워만'].map((x) => <button key={x} className={x === S.defScope ? 'on' : ''} onClick={() => { setDefaultScope(x); toast(`새 글은 ${x}${euro(x)} 올라가요`) }}>{x}</button>)}</div></div>
          <div className="setrow"><div><p>내 옷장과 비교해 보기</p><p className="sub2">다른 사람 글에 내 옷장의 비슷한 옷을 표시해요</p></div><Switch label="내 옷장과 비교해 보기" on={S.cmpOn} set={setClosetComparison} /></div>
        </div>
        <div className="sec"><h3>계정</h3>
          {S.loggedIn ? (
            <><div className="setrow"><p>로그인 계정</p><p style={{ fontSize: 13, color: 'var(--soft)' }}>Google</p></div>
              <button className="link" style={{ padding: 0 }} disabled={loggingOut} onClick={async () => {
                // 요청 중에는 버튼을 막아 연타로 로그아웃 요청이 여러 번 가지 않게 한다
                setLoggingOut(true)
                // 서버 로그인이면 서버 세션도 끝낸다(api/auth.ts의 logout). 서버가 실패하면 로그인 상태를 그대로 두고,
                // 실패 이유에 맞는 문구를 띄운다(연결 안 됨·서버 오류·CSRF 거절 등, API_CONVENTION 3장)
                try { await logout() } catch (e) { setLoggingOut(false); return toast(errorText(e)) }
                // 성공하면 내 정보를 비우고 로그인 화면으로 보낸다. replace로 이동해 뒤로가기로 설정 화면에 돌아오지 않게 한다
                clearMe(); toast('로그아웃했어요'); nav('/login', { replace: true })
              }}>{loggingOut ? '로그아웃하는 중' : '로그아웃'}</button></>
          ) : <div className="login"><button className="btn solid" onClick={() => toLogin('/settings')}>로그인하기</button></div>}
        </div>
      </div>
    </section>
  )
}
