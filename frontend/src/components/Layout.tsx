// 모든 화면을 감싸는 틀: 폰 틀, 위쪽 날짜·로고·날씨, 하단 탭, 알림·창 자리(Overlays).
// 앱이 켜질 때 서버에 로그인 상태를 물어보고(/api/auth/me), 답이 올 때까지는 로고만 보여 준다.
// 화면을 아래로 스크롤하면 하단 탭을 숨기고, 위로 올리면 다시 보여 준다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { fetchMe, takeGoogleLoginReturn } from '../api/auth'
import { S, WEATHER, emit, useApp } from '../store'
import { closeAll } from '../ui'
import { Overlays } from './Overlays'
import { setNav } from '../nav'
import { TabIcon } from './Icons'

// 하단 탭 순서: [캘린더][옷장][홈(가운데)][커뮤니티][MY]
const TABS = [
  { to: '/calendar', label: '캘린더', icon: 'cal' },
  { to: '/closet', label: '옷장', icon: 'closet' },
  { to: '/', label: '홈', icon: 'home' },
  { to: '/community', label: '커뮤니티', icon: 'com' },
  { to: '/my', label: 'MY', icon: 'my' },
] as const

/** 어떤 탭에 불이 들어올지: 글 보기는 들어온 탭, 설정은 MY, 옷 등록은 옷장 */
function tabOf(path: string) {
  if (path.startsWith('/post')) return S.postFrom
  if (path === '/settings') return '/my'
  if (path === '/upload') return '/closet'
  return path
}

/** 위쪽 날짜 (예: 11. 26 THU). 앱을 켜 둔 채 자정이 지나도 바뀌게, 앱이 켜질 때 한 번이 아니라 그릴 때마다 계산한다.
 *  날짜가 바뀌면 store.ts의 rollDay()가 emit()을 불러 다시 그려진다 */
const todayLabel = () => { const d = new Date(); return `${d.getMonth() + 1}. ${d.getDate()} ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]}` }

/** 폰 틀 + 위쪽 워드마크 + 화면 + 하단 탭 */
export function Layout() {
  useApp()
  const { pathname } = useLocation()
  const nav = useNavigate()
  // 창 안의 버튼처럼 컴포넌트 밖에서 쓰는 go()에 화면 이동 함수를 넘긴다. 그리는 중이 아니라 그린 뒤에 넘긴다 (코드 리뷰 23번).
  // useLayoutEffect라서 화면들의 useEffect보다 먼저 실행돼, 화면이 처음 뜰 때 부르는 go()도 이미 동작한다
  useLayoutEffect(() => { setNav(nav) }, [nav])
  const loginOn = pathname === '/login' || pathname === '/onboard'
  const tab = tabOf(pathname)
  const started = useRef(false)
  const phone = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const [navHide, setNavHide] = useState(false)
  const lastY = useRef(0)
  const [ready, setReady] = useState(false) // 로그인 확인이 끝났는지 (끝나기 전에는 로딩 화면)
  useEffect(() => { // 앱을 처음 열면 서버에 로그인했는지 물어보고(GET /api/auth/me) 그 결과로 어디로 갈지 정한다
    if (started.current) return
    started.current = true
    const goLogin = () => { if (pathname !== '/login') { S.loginBack = '/'; nav('/login', { replace: true }) } }
    // 방금 Google 로그인 버튼을 누르고 돌아온 것인지 (표시는 읽자마자 지워지므로 /me 결과와 상관없이 먼저 읽는다)
    const justLoggedIn = takeGoogleLoginReturn()
    fetchMe().then((me) => {
      if (!me) return goLogin() // 401: 로그인 안 됨 → 로그인 화면
      S.loggedIn = true
      S.me.nick = me.nickName || S.me.nick // 서버의 닉네임을 쓰고, 비어 있으면 기존 값 유지
      if (justLoggedIn) {
        // Google 로그인에 막 성공함 → 첫 설정. 새로 열린 앱에는 첫 설정 진행 정보가 없어서 여기서 만든다
        if (!S.ob) S.ob = { step: 'mode', mode: S.pref.mode, styles: [...S.pref.styles], nick: S.me.nick }
        if (pathname !== '/onboard') nav('/onboard', { replace: true })
      } else if (pathname === '/login' || pathname === '/onboard') {
        // 이미 로그인된 상태로 앱을 열었음 → 홈. (백엔드가 #/onboard로 보낸 주소를 새로고침한 경우도 여기)
        nav('/', { replace: true })
      }
      // 그 밖의 화면(옷장 등)에서 새로고침한 경우는 그 화면을 그대로 둔다
    }).catch(goLogin) // 서버에 닿지 못해도 앱은 열리도록 로그인 화면으로 (가짜 데이터로 둘러볼 수 있다)
      .finally(() => { setReady(true); emit() })
  }, [nav, pathname])
  useEffect(() => { closeAll(); setNavHide(false); lastY.current = 0; if (phone.current) phone.current.scrollTop = 0 }, [pathname])
  useEffect(() => { // 아래로 내리면 탭을 숨기고, 위로 올리거나 맨 위에 오면 다시 보여 줌 (scroll은 버블링이 안 돼서 캡처로 받음)
    const p = phone.current; if (!p) return
    const on = (e: Event) => {
      const el = e.target as HTMLElement; if (!el.classList?.contains('screen')) return
      const y = el.scrollTop, d = y - lastY.current
      const atEnd = y + el.clientHeight >= el.scrollHeight - 4 // 맨 아래에선 탭을 다시 보여 줌 (탭 자리로 비워 둔 여백이 빈칸으로 남지 않게)
      if (y < 24 || d < -6 || atEnd) setNavHide(false); else if (d > 6) setNavHide(true)
      lastY.current = y
    }
    p.addEventListener('scroll', on, true); return () => p.removeEventListener('scroll', on, true)
  }, [])
  // 화면 아래 여백과 홈 높이 계산에 쓰도록 탭 높이를 CSS 변수 --navh로 알려 주고, 바뀌면 'navh' 이벤트를 보낸다 (홈이 높이를 다시 맞춤).
  // 실행 조건에 ready가 있어야 한다: 이미 로그인된 상태로 앱을 열면 첫 화면은 로딩 화면이라 탭(<nav>)이 없고,
  // 로딩이 끝나 탭이 생겨도 loginOn은 그대로(false)라 다시 재지 않아서 --navh가 css 기본값 66px에 머물렀다.
  // 아이폰 홈바 여백처럼 탭이 66px보다 크면 홈 아래가 탭에 가렸다
  useEffect(() => {
    const n = navRef.current; if (!n) return
    const set = () => { document.documentElement.style.setProperty('--navh', n.offsetHeight + 'px'); window.dispatchEvent(new Event('navh')) }
    // border-box로 관찰해야 아래 여백(padding)만 바뀌어도 다시 잰다. 홈바 여백(safe-area)은 padding이라 기본값(content-box)으로는 못 잡는다
    set(); const ro = new ResizeObserver(set); ro.observe(n, { box: 'border-box' }); return () => ro.disconnect()
  }, [loginOn, ready])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [])
  if (!ready) { // 서버 응답을 기다리는 동안 로그인 화면이나 홈이 잠깐 보였다 사라지지 않게 로고만 보여 준다
    return (
      <div className="phone login-on" id="app" ref={phone}>
        <section className="screen on boot">
          <div className="lg-main"><p className="lg-logo">Clueless</p></div>
        </section>
      </div>
    )
  }
  return (
    <div className={`phone ${loginOn ? 'login-on' : ''}`} id="app" ref={phone}
      onScroll={(e) => { if (e.currentTarget.scrollTop) e.currentTarget.scrollTop = 0 }}
      >{/* 폰 틀(#app)은 절대 움직이지 않게 */}
      {!loginOn && <div className="top"><span className="d">{todayLabel()}</span><p className="logo">Clueless</p><span className="w">{WEATHER.low}°/{WEATHER.high}°, {WEATHER.sky}</span></div>}
      <Outlet />
      {!loginOn && (
        <nav id="nav" ref={navRef} className={navHide ? 'hide' : ''}>
          {TABS.map((t) => (
            <button key={t.to} className={tab === t.to ? 'on' : ''} onClick={() => nav(t.to)}>
              <TabIcon name={t.icon} />{t.label}
            </button>
          ))}
        </nav>
      )}
      <Overlays />
    </div>
  )
}
