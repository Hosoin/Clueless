import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { S, useApp } from '../store'
import { closeAll, Overlays } from '../ui'
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

const today = (() => { const d = new Date(); return `${d.getMonth() + 1}. ${d.getDate()} ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]}` })()

/** 폰 틀 + 위쪽 워드마크 + 화면 + 하단 탭 */
export function Layout() {
  useApp()
  const { pathname } = useLocation()
  const nav = useNavigate()
  setNav(nav)
  const loginOn = pathname === '/login' || pathname === '/onboard'
  const tab = tabOf(pathname)
  const started = useRef(false)
  const phone = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const [navHide, setNavHide] = useState(false)
  const lastY = useRef(0)
  useEffect(() => { // 처음 열면 로그인 화면부터
    if (started.current) return
    started.current = true
    if (!S.loggedIn && pathname !== '/login') { S.loginBack = '/'; nav('/login', { replace: true }) }
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
  useEffect(() => { // 화면 아래 여백과 홈 높이 계산에 쓰도록 탭 높이를 알려 줌
    const n = navRef.current; if (!n) return
    const set = () => document.documentElement.style.setProperty('--navh', n.offsetHeight + 'px')
    set(); const ro = new ResizeObserver(set); ro.observe(n); return () => ro.disconnect()
  }, [loginOn])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [])
  return (
    <div className={`phone ${loginOn ? 'login-on' : ''}`} id="app" ref={phone}
      onScroll={(e) => { if (e.currentTarget.scrollTop) e.currentTarget.scrollTop = 0 }}
      >{/* 폰 틀(#app)은 절대 움직이지 않게 */}
      {!loginOn && <div className="top"><span className="d">{today}</span><p className="logo">Clueless</p><span className="w">9° 맑음</span></div>}
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
