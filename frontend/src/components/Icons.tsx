// 프로토타입과 같은 선 아이콘
export const Arrow = ({ dir }: { dir: number }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
)
export const Heart = ({ on }: { on: boolean }) => (
  <svg className={`ic ${on ? 'fill' : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
)
export const Cmt = () => <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
export const SaveIc = ({ on }: { on: boolean }) => (
  <svg className={`ic ${on ? 'fill' : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4z" /></svg>
)
export const Back = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
export const SpinIc = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></svg>
)
export const Plus = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" /></svg>
export const Gear = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
)

// 하단 탭 아이콘
export const TabIcon = ({ name }: { name: 'cal' | 'closet' | 'home' | 'com' | 'my' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {name === 'cal' && <><rect x="3.5" y="5" width="17" height="15.5" rx="1.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>}
    {name === 'closet' && <><path d="M12 7.5a2 2 0 1 1 2-2c0 1-.8 1.4-1.4 1.8-.4.3-.6.6-.6 1.1v.6" /><path d="M12 9 3.3 15.2c-.8.6-.4 1.8.6 1.8h16.2c1 0 1.4-1.2.6-1.8z" /></>}
    {name === 'home' && <path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" />}
    {name === 'com' && <><circle cx="9" cy="8" r="3.2" /><path d="M3 19.5c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" /><circle cx="16.5" cy="9" r="2.6" /><path d="M16.5 14c2.3 0 4 1.4 4.5 4" /></>}
    {name === 'my' && <><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c1.2-3.8 4.2-5.5 7.5-5.5s6.3 1.7 7.5 5.5" /></>}
  </svg>
)
