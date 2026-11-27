// 로그인: Google은 백엔드 로그인 주소로 이동. 카카오·Apple은 가짜 로그인이라 버튼을 숨겨 둠(주석) (담당: C)
import { useNavigate } from 'react-router'
import { GOOGLE_LOGIN_URL, markGoogleLoginStart } from '../api/auth'
import { S, beginLoginSetup } from '../store'
import { toast } from '../ui'

/** 로그인 화면 */
export default function Login() {
  const nav = useNavigate()

  // Google로 계속하기: fetch가 아니라 브라우저 화면 자체를 백엔드 로그인 주소로 옮긴다.
  // 백엔드가 Google 로그인 화면으로 보냈다가, 로그인이 끝나면 앱의 첫 주소(기본값 http://localhost:5173/#)로 다시 돌려보낸다.
  // 백엔드는 어느 화면으로 갈지 정하지 않는다. 첫 설정으로 보낼지는 앱이 정한다 (아래 표시와 Layout.tsx).
  // 돌아올 때 앱이 새로 열리므로 로그인 상태는 Layout.tsx가 시작할 때 /api/auth/me로 되찾는다.
  // (카카오·Apple은 아직 가짜 로그인이다)
  // 이동하기 전에 "방금 로그인 버튼을 눌렀다"는 표시를 남겨, 돌아왔을 때 첫 설정으로 보낼지 정한다 (api/auth.ts)
  const loginWithGoogle = () => { markGoogleLoginStart(); window.location.href = GOOGLE_LOGIN_URL }

  const login = (via: string) => {
    // 로그인 화면은 replace로 떠나 방문 기록에서 지운다. 쌓아 두면 로그인한 뒤 뒤로가기로 로그인 화면이 다시 나왔다
    if (beginLoginSetup()) return nav('/onboard', { replace: true }) // 처음이면 추천 방식부터
    toast(`${via}로 로그인했어요`); nav(S.loginBack, { replace: true })
  }
  // 카카오·Apple 버튼을 숨긴 동안 login을 부르는 곳이 없어 '쓰지 않는 변수' 빌드 오류가 난다.
  // 버튼을 다시 살릴 때 함수도 그대로 쓰도록 지우지 않고, 여기서 쓰는 것으로 표시만 해 둔다
  void login
  return (
    <section className="screen on" id="s-login">
      {/* Figma v4 1-1: 사진·긴 문구 없이 로고와 한 줄 소개만 가운데에 둔다 (11/27) */}
      <div className="lg-main">
        <p className="eyebrow">Digital Wardrobe</p>
        <p className="lg-logo">Clueless</p>
        <p className="lg-lead">내 옷장 속 오늘의 코디</p>
      </div>
      <div className="lg-acts">
        {/* 로그인은 Google만 쓰기로 했다 (11/26). 카카오·Apple은 지우지 않고 숨겨 둔다. 다시 쓰면 주석만 푼다 */}
        {/* <button className="btn lg-kakao" onClick={() => login('카카오')}>카카오로 계속하기</button> */}
        <button className="btn lg-google" onClick={loginWithGoogle}>
          {/* Google 로고 (Google 로그인 버튼 안내에 맞춰 원래 네 가지 색 그대로) */}
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z" /></svg>
          Google로 계속하기
        </button>
        {/* <button className="btn lg-apple" onClick={() => login('Apple')}>Apple로 계속하기</button> */}
        {/* 로그인 없이 둘러보기: 게스트 기능을 없애기 전까지 남겨 둔다 (백엔드 없이 화면을 확인할 때도 쓴다) */}
        <button className="link" onClick={() => nav('/')}>로그인 없이 둘러보기</button>
        {/* 약관 페이지가 아직 없어서 누르면 '준비 중' 알림만 띄운다. 페이지가 생기면 여기서 연결한다 (코드 리뷰 33번) */}
        <p className="lg-terms">계속하면 <button type="button" onClick={() => toast('이용약관은 준비 중이에요')}>이용약관</button>과 <button type="button" onClick={() => toast('개인정보 처리방침은 준비 중이에요')}>개인정보 처리방침</button>에 동의하게 돼요</p>
      </div>
    </section>
  )
}
