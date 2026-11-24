import { S, ini } from '../store'

/** 프로필 동그라미: 내 프로필 사진이 있으면 사진, 없으면 이름 첫 글자 */
export function Face({ mine, name, className }: { mine?: boolean; name: string; className: string }) {
  const photo = mine ? S.me.photo : null
  return <span className={`${className} ${photo ? 'has-photo' : ''}`}>{photo ? <img src={photo} alt="" /> : className.includes('avatar') ? name.slice(0, 1) : ini(name)}</span>
}
