// 첫 로그인 설정: 추천 방식 → (취향이면) 좋아하는 스타일 → 닉네임 (담당: C)
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Back } from '../components/Icons'
import { MODES, STYLES } from '../data/seed'
import { S, emit, useApp } from '../store'

export default function Onboard() {
  useApp()
  const nav = useNavigate()
  const [err, setErr] = useState('')
  const ob = S.ob
  // 첫 설정 진행 정보가 없으면: 로그인 전이면 로그인 화면, 첫 설정을 이미 마쳤으면(끝낼 때 비움) 홈으로
  if (!ob) return <Navigate to={S.loggedIn ? '/' : '/login'} replace />
  const steps = ob.mode === 'taste' ? (['mode', 'taste', 'nick'] as const) : (['mode', 'nick'] as const)
  const i = (steps as readonly string[]).indexOf(ob.step), n = steps.length
  const set = (f: () => void) => { f(); emit() }
  const ok = ob.step !== 'taste' || ob.styles.length > 0
  const next = () => {
    if (ob.step !== 'nick') return set(() => (ob.step = steps[i + 1]))
    const v = ob.nick.trim()
    if (v.length < 2) return setErr('닉네임은 2자 이상이에요')
    S.me.nick = v; S.pref.mode = ob.mode; if (ob.mode === 'taste') S.pref.styles = [...ob.styles]; S.onboarded = true
    S.ob = null // 진행 정보를 비워, 첫 설정 주소로 다시 와도 끝난 단계가 그대로 다시 그려지지 않게 한다 (위 Navigate가 홈으로 보냄)
    // 첫 설정이 끝나면 홈으로만 보냄. "오늘의 코디를 골랐어요" 알림은 홈 화면에 바로 코디가 보여서 군더더기라 띄우지 않는다.
    // replace로 이동해 방문 기록에서 첫 설정을 지운다. 쌓아 두면 홈에서 뒤로가기했을 때 끝낸 첫 설정 화면이 다시 나왔다
    nav('/', { replace: true }); emit()
  }
  return (
    <section className="screen on" id="s-onboard" style={{ display: 'flex' }}>
      <div className="ob-top">{i ? <button className="backrow" onClick={() => set(() => (ob.step = steps[i - 1]))}><Back />이전</button> : <span />}<p className="ob-step">{i + 1} / {n}</p></div>
      <div className="ob-bar"><i style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
      <div className="ob-main">
        {ob.step === 'mode' && (
          <>
            <h2>어떤 코디를<br />추천받을까요?</h2>
            <div className="ob-opts" role="radiogroup" aria-label="추천 방식">
              {(['trend', 'taste'] as const).map((k) => (
                <button key={k} className={`ob-opt ${ob.mode === k ? 'on' : ''}`} role="radio" aria-checked={ob.mode === k} onClick={() => set(() => (ob.mode = k))}>
                  <i className="ck" /><div><b>{MODES[k][0]}</b><span>{MODES[k][1]}</span>{k === 'taste' && <em>다음 단계에서 좋아하는 스타일을 골라요</em>}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {ob.step === 'taste' && (
          <>
            <h2>좋아하는 스타일을<br />골라 주세요</h2><p className="sub">3개까지 고를 수 있어요</p>
            <div className="ob-styles">
              {STYLES.map(([k, d]) => { const on = ob.styles.includes(k); return (
                <button key={k} className={`ob-sty ${on ? 'on' : ''}`} aria-pressed={on} disabled={!on && ob.styles.length >= 3}
                  onClick={() => set(() => (ob.styles = on ? ob.styles.filter((x) => x !== k) : [...ob.styles, k]))}><b>{k}</b><span>{d}</span></button>
              ) })}
            </div>
          </>
        )}
        {ob.step === 'nick' && (
          <>
            <h2>닉네임을<br />정해 주세요</h2><p className="sub">커뮤니티에 올린 코디에 이 이름이 보여요</p>
            <label className="ob-field"><input maxLength={12} value={ob.nick} aria-label="닉네임" onChange={(e) => set(() => (ob.nick = e.target.value))} /><em>{err}</em></label>
          </>
        )}
      </div>
      <div className="ob-acts">
        <button className="btn solid full" disabled={!ok} onClick={next}>{ob.step === 'nick' ? '시작하기' : '다음'}</button>
        {ob.step === 'mode' && <p className="note">나중에 설정에서 바꿀 수 있어요</p>}
      </div>
    </section>
  )
}
