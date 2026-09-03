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
