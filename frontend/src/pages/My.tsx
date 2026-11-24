// MY: 커뮤니티 프로필과 내 글 (담당: C)
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Gear, Heart } from '../components/Icons'
import { Face } from '../components/Face'
import { writeSheet } from '../components/WriteSheet'
import { openPost, toLogin } from '../nav'
import { S, emit, useApp } from '../store'
import { askPermission, closeAll, openSheet, toast } from '../ui'

export default function My() {
  useApp()
  const nav = useNavigate()
  const mine = S.posts.filter((p) => p.mine), sv = S.posts.filter((p) => S.savedPosts.has(p.id))
  const list = S.myTab === 'posts' ? mine : sv
  return (
    <section className="screen on" id="s-my">
      <div className="head"><div className="h1row"><h1>My <i>Page</i></h1><button className="gear" onClick={() => nav('/settings')}><Gear />설정</button></div></div>
      <div className="pad">
        {!S.loggedIn ? (
          <>
            <div className="prof"><div className="avatar off">?</div><div><p className="nm">로그인이 필요해요</p><p className="em">로그인하면 닉네임을 정하고 커뮤니티에 코디를 올릴 수 있어요</p></div></div>
            <div className="login"><button className="btn solid" onClick={() => toLogin('/my')}>로그인하기</button></div>
          </>
        ) : (
          <>
            <div className="prof"><Face mine name={S.me.nick} className="avatar" />
              <div style={{ flex: 1, minWidth: 0 }}><p className="nm">{S.me.nick}</p><p className="em">@{S.me.handle}</p>{S.me.bio && <p className="bio">{S.me.bio}</p>}</div>
              <button className="btn" style={{ minHeight: 34, padding: '0 12px', fontSize: 12, flexShrink: 0 }} onClick={() => openSheet(() => <Profile />)}>프로필 편집</button></div>
            <div className="stats"><div><b>{mine.length}</b><span>게시물</span></div><div><b>{S.me.followers}</b><span>팔로워</span></div><div><b>{S.followingSet.size}</b><span>팔로잉</span></div></div>
            <div className="tabs">
              {([['posts', `내 게시물 ${mine.length}`], ['saved', `저장한 글 ${sv.length}`]] as const).map(([k, l]) => <button key={k} className={k === S.myTab ? 'on' : ''} onClick={() => { S.myTab = k; emit() }}>{l}</button>)}
            </div>
            {list.length ? (
              <div className="pgrid">{list.map((p) => (
                  <button key={p.id} aria-label={p.t} onClick={() => openPost(p.id, '/my')}>
                    <img src={p.img} alt="" style={{ objectPosition: p.pos }} /><span><Heart on={false} />{p.likes}</span>{p.mine && p.scope === '팔로워만' && <i>팔로워만</i>}
                  </button>
                ))}</div>
            ) : S.myTab === 'posts'
              ? <div className="empty">아직 올린 코디가 없어요<br /><button className="btn" style={{ marginTop: 16, padding: '0 18px' }} onClick={() => writeSheet()}>코디 올리기</button></div>
              : <div className="empty">커뮤니티에서 마음에 드는 글을 저장해 보세요<br /><button className="btn" style={{ marginTop: 16, padding: '0 18px' }} onClick={() => nav('/community')}>커뮤니티 보기</button></div>}
          </>
        )}
      </div>
    </section>
  )
}

function Profile() {
  const [photo, setPhoto] = useState(S.me.photo)
  const file = useRef<HTMLInputElement>(null)
  const [nick, setNick] = useState(S.me.nick), [handle, setHandle] = useState(S.me.handle), [bio, setBio] = useState(S.me.bio)
  const [e1, setE1] = useState(''), [e2, setE2] = useState('')
  const okH = (h: string) => /^[a-z0-9._]{3,20}$/.test(h)
  return (
    <>
      <h3>프로필 편집</h3><p>커뮤니티에서 다른 사람에게 보이는 정보예요</p>
      <div className="pfphoto">
        <span className={`avatar ${photo ? 'has-photo' : ''}`}>{photo ? <img src={photo} alt="" /> : nick.slice(0, 1)}</span>
        <div>
          <button className="btn" onClick={() => askPermission('photos', () => file.current?.click(), '프로필 사진을 고르려면 사진 보관함과 파일에 접근해야 해요. 고른 사진만 올라가요.')}>사진 바꾸기</button>
          {photo && <button className="link" onClick={() => setPhoto(null)}>사진 지우기</button>}
        </div>
        <input type="file" ref={file} accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = ''; if (!f) return
          const r = new FileReader(); r.onload = () => setPhoto(String(r.result)); r.readAsDataURL(f)
        }} />
      </div>
      <label className="field2"><span>닉네임</span><input maxLength={12} value={nick} onChange={(e) => setNick(e.target.value)} /><em>{e1}</em></label>
      <label className="field2"><span>아이디</span><input maxLength={20} value={handle} onChange={(e) => setHandle(e.target.value)} /><em>{e2}</em></label>
      <label className="field2"><span>소개</span><textarea maxLength={60} value={bio} onChange={(e) => setBio(e.target.value)} /></label>
      <button className="btn solid full" onClick={() => {
        const n = nick.trim(), h = handle.trim()
        setE1(n.length < 2 ? '닉네임은 2자 이상이에요' : '')
        setE2(okH(h) ? '' : '영문 소문자, 숫자, 점(.), 밑줄(_)로 3자 이상 적어 주세요')
        if (n.length < 2 || !okH(h)) return
        S.me.nick = n; S.me.handle = h; S.me.bio = bio.trim(); S.me.photo = photo
        S.posts.filter((p) => p.mine).forEach((p) => (p.user = h))
        closeAll(); toast('프로필을 바꿨어요')
      }}>저장</button>
    </>
  )
}
