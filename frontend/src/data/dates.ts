/** Calendar date helpers use local calendar fields and UTC day ordinals to avoid DST drift. */
export type DateKey = `${number}-${string}-${string}`

export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function dateKeyDaysAgo(days: number, now = new Date()): DateKey {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  return toDateKey(date)
}

function ordinal(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function daysBetweenDateKeys(from: string, to: string): number {
  return ordinal(to) - ordinal(from)
}

export function formatDateKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  const currentYear = new Date().getFullYear()
  return `${year !== currentYear ? `${year}년 ` : ''}${month}월 ${day}일`
}

export function todayDateKey(): DateKey {
  return toDateKey(new Date())
}
