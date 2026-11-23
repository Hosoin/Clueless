// 커뮤니티: 피드 (담당: C)
import { Cmt, Heart } from '../components/Icons'
import { writeSheet } from '../components/WriteSheet'
import { openPost } from '../nav'
import { S, emit, ini, owned, useApp } from '../store'

export default function Community() {
  useApp()
  let list = S.posts.filter((p) => !S.chOnly || p.ch)
  if (S.cmTab === '인기') list = [...list].sort((a, b) => b.likes - a.likes)
  if (S.cmTab === '최신') list = [...list].sort((a, b) => a.min - b.min)
  if (S.cmTab === '팔로잉') list = list.filter((p) => S.followingSet.has(p.user))
  return (
    <section className="screen on" id="s-com">
      <div className="head">
        <div className="h1row"><h1>Commu<i>nity</i></h1><button className="btn sm" id="cm-write" onClick={() => writeSheet()}>코디 올리기</button></div>
        <div className="tabs">{['인기', '최신', '팔로잉'].map((t) => <button key={t} className={t === S.cmTab ? 'on' : ''} onClick={() => { S.cmTab = t; emit() }}>{t}</button>)}</div>
      </div>
      <div className="pad">
        <button className={`challenge ${S.chOnly ? 'on' : ''}`} onClick={() => { S.chOnly = !S.chOnly; emit() }}>
          <div><p className="e">이번 주 챌린지</p><p className="t">1년 안 입은 옷 꺼내 입기</p></div>
          <p className="c">{S.chOnly ? '참여한 글만 보는 중' : '312명 참여'}</p>
        </button>
        {/* 칸을 맞춘 2열 격자 (사진 비율과 제목 두 줄을 고정해 줄이 가지런하게) */}
        <div className="feed">
          {list.length ? list.map((p) => {
            const n = S.cmpOn && !p.mine ? owned(p) : 0, who = p.mine ? S.me.nick : p.user
            return (
              <button className="post" key={p.id} onClick={() => openPost(p.id, '/community')}>
                <div className="img"><img src={p.img} alt="" style={{ objectPosition: p.pos }} /></div>
                <p className="who"><span className="uav">{ini(who)}</span>{who}</p>
                <p className="t">{p.t}</p>
                {n > 0 && <p className="m">내 옷장에 비슷한 옷 {n}벌</p>}
                <span className="acts"><span><Heart on={S.liked.has(p.id)} />{p.likes}</span><span><Cmt />{p.cmts}</span></span>
              </button>
            )
          }) : <div className="empty" style={{ gridColumn: '1/-1' }}>{S.cmTab === '팔로잉' ? '팔로우한 사람의 글이 아직 없어요' : '아직 글이 없어요'}</div>}
        </div>
      </div>
    </section>
  )
}
