// 회원 탈퇴: 탈퇴하면 지워지는 내 정보를 보여 주고, 안내를 확인했다고 체크해야 탈퇴하기를 누를 수 있다 (담당: C)
// - Figma v4 5-7. 설정 → 계정 → 회원 탈퇴에서 들어온다
// - 백엔드에 탈퇴 API가 아직 없어서, 지금은 '탈퇴하기'를 눌러도 아무것도 지우지 않고 '준비 중이에요' 알림만 띄운다 (11/27 결정).
//   API가 생기면 여기서 요청을 보내고, 성공하면 clearMe() 뒤 로그인 화면으로 보낸다 (설정의 로그아웃과 같은 흐름)
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Back } from '../components/Icons'
import { S, useApp } from '../store'
import { toast } from '../ui'

/** 회원 탈퇴 화면 */
export default function Withdraw() {
  useApp()
  const nav = useNavigate()
  const [agreed, setAgreed] = useState(false) // '안내를 모두 확인했어요'를 눌렀는지. 눌러야 탈퇴하기 버튼이 열린다
  // 지워지는 정보: 화면에 개수로 보여 줘서 무엇이 사라지는지 알 수 있게 한다
  const lost: [string, string][] = [
    ['옷장의 옷과 사진', `${S.items.length}벌`],
    ['저장한 코디', `${S.saved.length}개`],
    ['입은 기록 · 입을 계획', `${S.history.length + S.plans.length}일`],
    ['커뮤니티에 올린 글', `${S.posts.filter((p) => p.mine).length}개`],
    ['추천 방식 · 좋아하는 스타일', '설정'],
  ]
  return (
    <section className="screen on" id="s-withdraw">
      <button className="backrow" onClick={() => nav('/settings')}><Back />설정</button>
      <div className="pad">
        <p className="eyebrow mt16">Account</p>
        <h2 className="wd-title">정말 탈퇴할까요?</h2>
        <p className="sub">탈퇴하면 아래 정보가 모두 지워지고 되돌릴 수 없어요</p>
        <ul className="wd-list">
          {lost.map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}
        </ul>
        <p className="wd-note">Google 계정은 그대로 남아요. 같은 Google 계정으로 다시 가입하면 새 옷장으로 시작해요</p>
        <button className={`wd-check ${agreed ? 'on' : ''}`} role="checkbox" aria-checked={agreed} onClick={() => setAgreed(!agreed)}>
          <i aria-hidden="true" />안내를 모두 확인했어요
        </button>
      </div>
      <div className="pad wd-acts">
        {/* 탈퇴 API가 생기기 전까지는 누르면 알림만 띄운다 */}
        <button className="btn solid danger full" disabled={!agreed} onClick={() => toast('회원 탈퇴는 준비 중이에요')}>탈퇴하기</button>
        <button className="btn full" onClick={() => nav('/settings')}>취소</button>
      </div>
    </section>
  )
}
