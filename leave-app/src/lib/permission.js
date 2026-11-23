// Pure business-rule logic for permission requests, kept separate from
// ApplyPermission.jsx so it's unit-testable without a DOM/Supabase client.
// The database (migration-permission-requests.sql) enforces the same rules
// server-side — this module exists so the UI can validate and disable the
// submit button before a round-trip, not as the source of truth.

import { toDateStr } from './dates'

export const MAX_PERMISSIONS_PER_MONTH = 2
export const MAX_PERMISSION_MINUTES = 120
export const HOURS_PER_WORKDAY = 8

// "HH:MM" (24h, as produced by <input type="time">) → minutes since midnight.
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// Duration in minutes; 0 if either time is missing or the range is invalid
// (to <= from), so callers can treat "not a positive duration" as one case.
export function durationMinutes(fromTime, toTime) {
  if (!fromTime || !toTime) return 0
  const mins = toMinutes(toTime) - toMinutes(fromTime)
  return mins > 0 ? mins : 0
}

export function formatDuration(mins) {
  if (!mins || mins <= 0) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

// `remaining` is the caller's already-computed (allowed - used) count for the
// request's month, so this stays a pure function of its arguments.
export function validatePermission({ date, fromTime, toTime, reason }, remaining) {
  const errs = {}
  if (!date) errs.date = 'Required'
  if (!fromTime) errs.fromTime = 'Required'
  if (!toTime) errs.toTime = 'Required'
  if (fromTime && toTime) {
    const raw = toMinutes(toTime) - toMinutes(fromTime)
    if (raw <= 0) errs.toTime = 'To time must be after from time'
    else if (raw > MAX_PERMISSION_MINUTES) errs.toTime = 'Maximum permission duration is 2 hours'
  }
  if (!reason || !reason.trim()) errs.reason = 'Required'
  if (remaining <= 0) {
    errs.limit = 'You have already used your 2 permissions for this month. Please apply for Half-Day Leave instead.'
  }
  return errs
}

// ── Weekly compensation ──────────────────────────────────────────────────────
// Permission hours must be made up in the same Mon–Sun week. Rather than
// tracking "extra" hours per permission, the rule is: the employee's attended
// hours for that week (from GPS attendance) must still reach the normal weekly
// target — 8h × working days, where working days are Mon–Fri minus company
// holidays for their region and approved leave (a half-day leave removes 4h).
// A week with several permissions is judged once against the same target.

// Mon..Sun "YYYY-MM-DD" bounds of the week containing dateStr.
export function weekBounds(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const offset = (d.getDay() + 6) % 7          // Mon=0 … Sun=6
  const mon = new Date(d); mon.setDate(d.getDate() - offset)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { start: toDateStr(mon), end: toDateStr(sun) }
}

function weekDates(startStr) {
  const out = []
  const d = new Date(startStr + 'T12:00:00')
  for (let i = 0; i < 7; i++) { out.push(toDateStr(d)); d.setDate(d.getDate() + 1) }
  return out
}

// holidayApplies mirrors the Holidays admin screen: region 'All' applies to
// everyone, otherwise it must match the employee's location.
const holidayApplies = (h, location) => !h.region || h.region === 'All' || h.region === location

// Inputs are already scoped to one employee:
//   attendance: [{ date, total_hours }]
//   leaves:     approved leave_requests [{ from_date, to_date, days }]
//   holidays:   company_holidays [{ holiday_date, region }]
// Returns { status: 'compensated' | 'in_progress' | 'short', weekStart,
// weekEnd, target, worked, shortfall } — hours rounded to 2 dp.
export function computeCompensation({ requestDate, location, attendance = [], leaves = [], holidays = [], today }) {
  const { start, end } = weekBounds(requestDate)
  const dates = weekDates(start)
  const holidaySet = new Set(holidays.filter(h => holidayApplies(h, location)).map(h => h.holiday_date))

  let target = 0
  dates.slice(0, 5).forEach(d => {                 // Mon–Fri
    if (holidaySet.has(d)) return
    const leave = leaves.find(l => l.from_date <= d && l.to_date >= d)
    if (!leave) { target += HOURS_PER_WORKDAY; return }
    // A single-day request with days < 1 is a half-day; anything else is a full day off.
    const offFraction = leave.from_date === leave.to_date && Number(leave.days) < 1 ? Number(leave.days) : 1
    target += HOURS_PER_WORKDAY * (1 - offFraction)
  })

  const worked = attendance
    .filter(a => a.date >= start && a.date <= end)
    .reduce((s, a) => s + (Number(a.total_hours) || 0), 0)

  const r2 = n => Math.round(n * 100) / 100
  const shortfall = Math.max(0, target - worked)
  const status = shortfall <= 0 ? 'compensated' : today > end ? 'short' : 'in_progress'
  return { status, weekStart: start, weekEnd: end, target: r2(target), worked: r2(worked), shortfall: r2(shortfall) }
}

export const COMPENSATION_LABEL = {
  compensated: 'Compensated',
  in_progress: 'In progress',
  short:       'Not compensated',
}

export function compensationText(c, fmtDate = d => d) {
  if (!c) return ''
  if (c.status === 'compensated') return `Compensated · ${c.worked} / ${c.target} h`
  if (c.status === 'in_progress') return `In progress · ${c.shortfall} h to go by ${fmtDate(c.weekEnd)}`
  return `Not compensated · short ${c.shortfall} h`
}

// Only approved permissions need making up. Returns the { from, to } span of
// the weeks they fall in (for fetchCompensationInputs), or null if none.
export function compensationRange(permissions) {
  const approved = permissions.filter(p => p.status === 'approved')
  if (!approved.length) return null
  const weeks = approved.map(p => weekBounds(p.request_date))
  return {
    from: weeks.reduce((m, w) => (w.start < m ? w.start : m), weeks[0].start),
    to:   weeks.reduce((m, w) => (w.end > m ? w.end : m), weeks[0].end),
  }
}

// { [permissionId]: compensation } for every approved permission.
// locationOf(employeeId) → that employee's location (for regional holidays).
export function compensationById(permissions, { attendance = [], leaves = [], holidays = [] }, today, locationOf) {
  const byEmp = (rows) => rows.reduce((m, r) => ((m[r.employee_id] ||= []).push(r), m), {})
  const attBy = byEmp(attendance), lvBy = byEmp(leaves)
  const out = {}
  for (const p of permissions) {
    if (p.status !== 'approved') continue
    out[p.id] = computeCompensation({
      requestDate: p.request_date,
      location: locationOf(p.employee_id),
      attendance: attBy[p.employee_id] || [],
      leaves: lvBy[p.employee_id] || [],
      holidays,
      today,
    })
  }
  return out
}
