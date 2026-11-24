// 로그인 (지금은 가짜: 어느 버튼이든 바로 로그인됨) (담당: C)
import { useNavigate } from 'react-router'
import { S } from '../store'
import { toast } from '../ui'

export default function Login() {
  const nav = useNavigate()
  const login = (via: string) => {
    S.loggedIn = true
    if (!S.onboarded) { S.ob = { step: 'mode', mode: S.pref.mode, styles: [...S.pref.styles], nick: S.me.nick }; return nav('/onboard') } // 처음이면 추천 방식부터
    toast(`${via}로 로그인했어요`); nav(S.loginBack)
  }
  return (
    <section className="screen on" id="s-login" style={{ display: 'flex' }}>
      <div className="lg-main">
        <p className="eyebrow">내 옷장 속 오늘의 코디</p>
        <p className="lg-logo">Clueless</p>
        <p className="lg-lead">있는지도 몰랐던 내 옷이<br />요즘 유행 코디가 돼요</p>
        <div className="lg-rule" />
      </div>
      <div className="lg-acts">
        <button className="btn lg-kakao" onClick={() => login('카카오')}>카카오로 계속하기</button>
        <button className="btn lg-google" onClick={() => login('Google')}>Google로 계속하기</button>
        <button className="btn lg-apple" onClick={() => login('Apple')}>Apple로 계속하기</button>
        <button className="link" onClick={() => nav('/')}>로그인 없이 둘러보기</button>
        <p className="lg-terms">계속하면 <u>이용약관</u>과 <u>개인정보 처리방침</u>에 동의하게 돼요</p>
      </div>
    </section>
  )
}
