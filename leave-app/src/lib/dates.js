// Local-timezone date helpers.
//
// `new Date()` already reflects the browser's own timezone — that part is
// automatic. The trap is `.toISOString()`, which converts to UTC first and so
// reports a different calendar day for anyone not on UTC (India is UTC+5:30,
// so a date at local midnight becomes 18:30 the previous day). Every
// "YYYY-MM-DD" string in this app must be formatted from local date parts
// instead, via these helpers.

import { useEffect, useState } from 'react'

export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayStr() {
  return toDateStr(new Date())
}

// Human-readable tenure since a "YYYY-MM-DD" joining date, e.g. "2y 3m",
// "8m", "8m 12d" (under a month rounds to days), or "Joins <date>" for a
// future-dated joining_date. Calendar-month based (not /30-day math), so
// it lines up with how "X years of service" is normally counted.
export function formatTenure(joiningDate) {
  if (!joiningDate) return '—'
  const start = new Date(joiningDate + 'T00:00:00')
  const now = new Date()
  if (start > now) return `Joins ${joiningDate}`

  let years  = now.getFullYear()  - start.getFullYear()
  let months = now.getMonth()     - start.getMonth()
  let days   = now.getDate()      - start.getDate()
  if (days < 0) {
    months -= 1
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate()
  }
  if (months < 0) { years -= 1; months += 12 }

  if (years > 0) return months > 0 ? `${years}y ${months}m` : `${years}y`
  if (months > 0) return `${months}m`
  return `${days}d`
}

// Today's local date string that keeps itself current: it re-checks once a
// minute and whenever the tab regains focus, so a screen left open past
// midnight (or a PWA reopened the next morning) rolls over to the new day on
// its own. Use it as an effect dependency to reload day-scoped data — no
// manual refresh needed.
export function useToday() {
  const [day, setDay] = useState(todayStr)
  useEffect(() => {
    const sync = () => setDay(prev => (prev === todayStr() ? prev : todayStr()))
    const id = setInterval(sync, 60_000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])
  return day
}
