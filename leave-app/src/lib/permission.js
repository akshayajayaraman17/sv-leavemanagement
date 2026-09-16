// Pure business-rule logic for permission requests, kept separate from
// ApplyPermission.jsx so it's unit-testable without a DOM/Supabase client.
// The database (migration-permission-requests.sql) enforces the same rules
// server-side — this module exists so the UI can validate and disable the
// submit button before a round-trip, not as the source of truth.

export const MAX_PERMISSIONS_PER_MONTH = 2
export const MAX_PERMISSION_MINUTES = 120

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
