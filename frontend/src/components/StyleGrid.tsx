// 좋아하는 스타일 고르기 격자. 첫 설정(Onboard.tsx)과 설정의 '좋아하는 스타일' 창(Settings.tsx)에서 같이 쓴다.
// 두 화면에 같은 그리기와 "3개까지" 규칙이 따로 적혀 있던 것을 한곳으로 모았다 (코드 리뷰 27번).
import { STYLES } from '../data/seed'

/** 고를 수 있는 스타일 수. 이만큼 고르면 고르지 않은 칸은 막힌다 */
const MAX = 3

/**
 * 스타일 목록(STYLES)을 칸으로 보여 주고, 누르면 고르거나 푼다.
 * - picked: 지금 고른 스타일 이름들 (칸의 눌림·막힘 표시에 씀)
 * - onChange: '이전 목록 → 다음 목록' 함수를 받아 저장한다 (상태는 부르는 쪽이 가진다).
 *   그린 때의 picked가 아니라 저장할 때의 최신 목록으로 계산해야, 화면이 다시 그려지기 전에 여러 번 눌러도 앞의 선택이 사라지지 않는다
 * - className: 격자에 더할 클래스 (예: 창 안에서 위 여백을 없애는 mt0)
 */
export function StyleGrid({ picked, onChange, className = '' }: { picked: string[]; onChange: (update: (prev: string[]) => string[]) => void; className?: string }) {
  return (
    <div className={`ob-styles ${className}`}>
      {STYLES.map(([k, d]) => {
        const on = picked.includes(k)
        return (
          <button key={k} className={`ob-sty ${on ? 'on' : ''}`} aria-pressed={on} disabled={!on && picked.length >= MAX}
            onClick={() => onChange((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : prev.length >= MAX ? prev : [...prev, k])}><b>{k}</b><span>{d}</span></button>
        )
      })}
    </div>
  )
}
