import { toDateStr } from './dates'

export function workingDays(from, to, holidaySet = new Set()) {
  let count = 0, d = new Date(from + 'T12:00:00'), end = new Date(to + 'T12:00:00')
  while (d <= end) {
    const w = d.getDay()
    const dateStr = toDateStr(d)
    if (w !== 0 && w !== 6 && !holidaySet.has(dateStr)) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}
