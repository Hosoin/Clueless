// 커뮤니티 글 보기: 이 코디의 옷 · 내 옷장과 비교, 댓글·답글·댓글 좋아요, 내 옷으로 따라 입기 (담당: C)
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Back, Cmt, Heart, SaveIc } from '../components/Icons'
import { Face } from '../components/Face'
import { writeSheet } from '../components/WriteSheet'
import type { Comment, Post as PostT } from '../data/types'
import { go, toLogin } from '../nav'
import { S, byId, emit, eulreul, owned, setCombo, useApp } from '../store'
import { closeAll, openModal, showIn, toast } from '../ui'


export default function Post() {
  useApp()
  const nav = useNavigate()
  const { id } = useParams()
  const p = S.posts.find((x) => x.id === Number(id))
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [focusIn, setFocusIn] = useState(0)
  useEffect(() => { if (focusIn) { showIn(input.current); input.current?.focus({ preventScroll: true }) } }, [focusIn])
  if (!p) return <Navigate to={S.postFrom} replace />
  const mine = !!p.mine, follow = S.followingSet.has(p.user), isSaved = S.savedPosts.has(p.id)
  // 댓글 목록은 글을 만들 때 채워 둔다 (store.ts의 withComments). 그리는 중에는 읽기만 한다 (코드 리뷰 23번)
  const cm = p.cmList ?? [], reTo = p.replyTo != null ? cm[p.replyTo] : undefined
  const back = () => { p.replyTo = null; nav(S.postFrom) }
  /** 로그인이 필요한 일(댓글·답글·좋아요·팔로우·저장)을 로그인 없이 하려 하면 알림을 띄우고 로그인 화면으로 보낸다.
   *  로그인이 끝나면 이 글로 돌아온다. 결과: 막았으면 true (코드 리뷰 21번: 팔로우·글 좋아요·저장에도 적용) */
  const needLogin = (msg: string) => { if (S.loggedIn) return false; toast(msg); toLogin(`/post/${p.id}`); return true }
  const send = () => {
    if (needLogin('로그인하면 댓글을 쓸 수 있어요')) return
    const t = text.trim(); if (!t) return toast('댓글 내용을 적어 주세요')
    const nc: Comment = { u: S.me.nick, t, ago: '방금', me: true, likes: 0, liked: false, replies: [] }
    if (reTo) reTo.replies.push(nc); else cm.push(nc)
    p.cmts++; p.replyTo = null; setText('')
    toast(reTo ? '답글을 달았어요' : '댓글을 달았어요'); emit(); setFocusIn(Date.now())
  }
  const row = (c: Comment, i: number, j?: number) => {
    const re = j !== undefined
    return (
      <div className={`cmt${re ? ' re' : ''}`} key={re ? `${i}-${j}` : i}>
        <div className="cb">
          <p><b>{c.u}</b>{c.t}</p>
          <span>{c.ago}
            {!re && <button className="link xs" onClick={() => { if (needLogin('로그인하면 답글을 쓸 수 있어요')) return; p.replyTo = i; emit(); setFocusIn(Date.now()) }}>답글 달기</button>}
            {c.me && <button className="link xs" onClick={() => {
              if (!re) { p.cmts -= 1 + cm[i].replies.length; cm.splice(i, 1); if (p.replyTo === i) p.replyTo = null; else if (p.replyTo != null && p.replyTo > i) p.replyTo-- }
              else { cm[i].replies.splice(j!, 1); p.cmts-- }
              toast('댓글을 지웠어요'); emit()
            }}>삭제</button>}
          </span>
        </div>
        <button className="clike" aria-pressed={c.liked} aria-label="댓글 좋아요" onClick={() => {
          if (needLogin('로그인하면 좋아요를 누를 수 있어요')) return
          c.liked = !c.liked; c.likes += c.liked ? 1 : -1; emit()
        }}><Heart on={c.liked} />{c.likes || ''}</button>
      </div>
    )
  }
  const status = (w: PostT['wear'][number]) => {
    if (mine || !S.cmpOn) return null
    const it = w[2] ? byId(w[2]) : undefined
    if (!it) return <p className="s no">내 옷장에 없어요</p>
    return w[3] === 'same' ? <p className="s">내 옷장에 있어요</p> : <p className="s">비슷한 옷: {it.name}</p>
  }
  const who = mine ? S.me.nick : p.user
  return (
    <section className="screen on" id="s-post">
      <div className="dimg"><img src={p.img} alt="" style={{ objectPosition: p.pos }} /><button className="back" aria-label="뒤로" onClick={back}><Back /></button>{mine && <p className="badge">{p.scope}</p>}</div>
      <div className="pad">
        <div className="urow"><Face mine={mine} name={who} className={`uav ${mine ? 'me' : ''}`} />
          <div><p className="nm">{who}</p><p className="sub">{p.ago}{p.ch ? ' · 1년 안 입은 옷 꺼내 입기' : ''}</p></div>
          {mine ? <button className="btn" onClick={() => writeSheet(null, p)}>수정</button>
            : <button className={`btn ${follow ? 'on' : ''}`} onClick={() => { if (needLogin('로그인하면 팔로우할 수 있어요')) return; if (follow) S.followingSet.delete(p.user); else S.followingSet.add(p.user); toast(follow ? `${p.user} 팔로우를 끊었어요` : `${p.user}${eulreul(p.user)} 팔로우해요`); emit() }}>{follow ? '팔로잉' : '팔로우'}</button>}
        </div>
        <p className="dcap">{p.body}</p>
        <div className="dacts">
          <button aria-pressed={S.liked.has(p.id)} onClick={() => { if (needLogin('로그인하면 좋아요를 누를 수 있어요')) return; if (S.liked.has(p.id)) { S.liked.delete(p.id); p.likes-- } else { S.liked.add(p.id); p.likes++ } emit() }}><Heart on={S.liked.has(p.id)} />{p.likes}</button>
          <button aria-label="댓글 쓰기" onClick={() => setFocusIn(Date.now())}><Cmt />{p.cmts}</button>
          {!mine && <button aria-pressed={isSaved} onClick={() => { if (needLogin('로그인하면 글을 저장할 수 있어요')) return; if (isSaved) S.savedPosts.delete(p.id); else S.savedPosts.add(p.id); toast(isSaved ? '저장을 취소했어요' : '저장했어요. MY의 저장한 글에서 볼 수 있어요'); emit() }}><SaveIc on={isSaved} />{isSaved ? '저장됨' : '저장'}</button>}
        </div>
        <p className="secttl">{mine || !S.cmpOn ? '이 코디의 옷' : '이 코디의 옷 · 내 옷장과 비교'}</p>
        <div className="list">{p.wear.map((w, i) => <div className="mrow" key={i}><span className="sw" style={{ background: w[1] }} /><p className="n">{w[0]}</p>{status(w)}</div>)}</div>
        <p className="secttl">댓글 {p.cmts}</p>
        {cm.map((c, i) => <div key={i} style={{ display: 'contents' }}>{row(c, i)}{c.replies.map((r, j) => row(r, i, j))}</div>)}
        {reTo && <p className="cmto">{reTo.u}님에게 답글 다는 중<button className="link xs" onClick={() => { p.replyTo = null; emit() }}>취소</button></p>}
        <div className="cmform">
          <input ref={input} maxLength={100} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send() }}
            placeholder={!S.loggedIn ? '로그인하면 댓글을 쓸 수 있어요' : reTo ? '답글을 남겨 보세요' : '댓글을 남겨 보세요'} aria-label={reTo ? '답글 쓰기' : '댓글 쓰기'} />
          <button className="btn solid" onClick={send}>등록</button>
        </div>
        {mine ? (
          <button className="link danger" style={{ marginTop: 10 }} onClick={() => openModal(() => (
            <>
              <h3>이 글을 삭제할까요?</h3><p className="sub">삭제하면 되돌릴 수 없어요</p>
              <div className="col" style={{ marginTop: 18 }}>
                {/* 창 안의 버튼이라 nav()가 아니라 go(): 창을 열 때 쌓은 방문 기록 칸을 MY로 바꿔 끼워, MY에서 뒤로가기가 꼬이지 않게 (코드 리뷰 17번) */}
                <button className="btn solid" onClick={() => { S.posts.splice(S.posts.indexOf(p), 1); S.savedPosts.delete(p.id); S.postFrom = '/my'; closeAll(); go('/my'); toast('글을 삭제했어요') }}>삭제</button>
                <button className="btn" onClick={closeAll}>취소</button>
              </div>
            </>
          ))}>이 글 삭제</button>
        ) : (
          <div className="row2 stick">
            <button className="btn solid" disabled={!owned(p)} onClick={() => {
              setCombo(p.wear.map((w) => w[2]).filter((x): x is number => !!x && !!byId(x))); S.view = 'rows'; nav('/'); toast('내 옷장에서 비슷한 옷으로 맞췄어요')
            }}>{owned(p) ? '내 옷으로 따라 입기' : '내 옷장에 맞는 옷이 없어요'}</button>
          </div>
        )}
      </div>
    </section>
  )
}
