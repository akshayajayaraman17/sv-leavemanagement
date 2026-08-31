export function workingDays(from, to, holidaySet = new Set()) {
  let count = 0, d = new Date(from), end = new Date(to)
  while (d <= end) {
    const w = d.getDay()
    const dateStr = d.toISOString().split('T')[0]
    if (w !== 0 && w !== 6 && !holidaySet.has(dateStr)) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}
