import { S, ini } from '../store'

/** 프로필 동그라미: 내 프로필 사진이 있으면 사진, 없으면 이름 첫 글자.
 *  photo를 주면 그 사진을 쓴다 (프로필 편집 창처럼 아직 저장하지 않은 사진을 미리 보여 줄 때, null이면 사진 없음) */
export function Face({ mine, name, className, photo: given }: { mine?: boolean; name: string; className: string; photo?: string | null }) {
  const photo = given !== undefined ? given : mine ? S.me.photo : null
  return <span className={`${className} ${photo ? 'has-photo' : ''}`}>{photo ? <img src={photo} alt="" /> : className.includes('avatar') ? name.slice(0, 1) : ini(name)}</span>
}
