// 로그인: Google은 백엔드 로그인 주소로 이동, 카카오·Apple은 아직 가짜(바로 로그인됨) (담당: C)
import { useNavigate } from 'react-router'
import { GOOGLE_LOGIN_URL, markGoogleLoginStart } from '../api/auth'
import { S, emit } from '../store'
import { toast } from '../ui'

/** 로그인 화면 */
export default function Login() {
  const nav = useNavigate()

  // Google로 계속하기: fetch가 아니라 브라우저 화면 자체를 백엔드 로그인 주소로 옮긴다.
  // 백엔드가 Google 로그인 화면으로 보냈다가, 로그인이 끝나면 앱(#/onboard)으로 다시 돌려보낸다.
  // 돌아올 때 앱이 새로 열리므로 로그인 상태는 Layout.tsx가 시작할 때 /api/auth/me로 되찾는다.
  // (카카오·Apple은 아직 가짜 로그인이다)
  // 이동하기 전에 "방금 로그인 버튼을 눌렀다"는 표시를 남겨, 돌아왔을 때 첫 설정으로 보낼지 정한다 (api/auth.ts)
  const loginWithGoogle = () => { markGoogleLoginStart(); window.location.href = GOOGLE_LOGIN_URL }

  const login = (via: string) => {
    S.loggedIn = true
    // 로그인 화면은 replace로 떠나 방문 기록에서 지운다. 쌓아 두면 로그인한 뒤 뒤로가기로 로그인 화면이 다시 나왔다
    if (!S.onboarded) { S.ob = { step: 'mode', mode: S.pref.mode, styles: [...S.pref.styles], nick: S.me.nick }; emit(); return nav('/onboard', { replace: true }) } // 처음이면 추천 방식부터
    toast(`${via}로 로그인했어요`); nav(S.loginBack, { replace: true })
  }
  return (
    <section className="screen on" id="s-login">
      <div className="lg-main">
        <p className="eyebrow">내 옷장 속 오늘의 코디</p>
        <p className="lg-logo">Clueless</p>
        <p className="lg-lead">있는지도 몰랐던 내 옷이<br />요즘 유행 코디가 돼요</p>
        <div className="lg-rule" />
      </div>
      <div className="lg-acts">
        <button className="btn lg-kakao" onClick={() => login('카카오')}>카카오로 계속하기</button>
        <button className="btn lg-google" onClick={loginWithGoogle}>Google로 계속하기</button>
        <button className="btn lg-apple" onClick={() => login('Apple')}>Apple로 계속하기</button>
        <button className="link" onClick={() => nav('/')}>로그인 없이 둘러보기</button>
        {/* 약관 페이지가 아직 없어서 누르면 '준비 중' 알림만 띄운다. 페이지가 생기면 여기서 연결한다 (코드 리뷰 33번) */}
        <p className="lg-terms">계속하면 <button type="button" onClick={() => toast('이용약관은 준비 중이에요')}>이용약관</button>과 <button type="button" onClick={() => toast('개인정보 처리방침은 준비 중이에요')}>개인정보 처리방침</button>에 동의하게 돼요</p>
      </div>
    </section>
  )
}
