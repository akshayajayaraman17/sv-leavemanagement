// Local-timezone date helpers.
//
// `new Date()` already reflects the browser's own timezone — that part is
// automatic. The trap is `.toISOString()`, which converts to UTC first and so
// reports a different calendar day for anyone not on UTC (India is UTC+5:30,
// so a date at local midnight becomes 18:30 the previous day). Every
// "YYYY-MM-DD" string in this app must be formatted from local date parts
// instead, via these helpers.

export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayStr() {
  return toDateStr(new Date())
}
