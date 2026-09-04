// Shared notification-feed builder — used by Notifications.jsx (to render
// the full feed) and App.jsx (to decide whether the bell icon shows an
// unread dot). Kept in one place so both stay in sync instead of two
// components independently re-deriving "what counts as a notification".
import {
  fetchMyLeaves, fetchMyCompRequests, fetchLeaveAdjustments,
  fetchMyRegularizations, fetchTimesheetHistory,
  fetchPendingForApprover, fetchPendingCompForApprover,
  fetchPendingTimesheets, fetchPendingRegularizations, isApproverForAnyone,
} from './api'
import { C, formatDate } from '../components/UI'

export const NOTIF_SEEN_KEY = 'notif_seen_at'

export function getNotifSeenAt() {
  return parseInt(localStorage.getItem(NOTIF_SEEN_KEY) || '0', 10)
}

export function markNotifSeenNow() {
  localStorage.setItem(NOTIF_SEEN_KEY, String(Date.now()))
}

export async function fetchNotificationFeed(employee) {
  const isApprover = employee.role === 'admin' || employee.role === 'manager'
    || (await isApproverForAnyone(employee.id)).data === true
  const calls = [
    fetchMyLeaves(employee.id),
    fetchMyCompRequests(employee.id),
    fetchLeaveAdjustments(employee.id),
    fetchMyRegularizations(employee.id),
    fetchTimesheetHistory(employee.id),
    isApprover ? fetchPendingForApprover(employee.id)     : Promise.resolve({ data: [] }),
    isApprover ? fetchPendingCompForApprover(employee.id) : Promise.resolve({ data: [] }),
    isApprover ? fetchPendingTimesheets(employee.id)      : Promise.resolve({ data: [] }),
    isApprover ? fetchPendingRegularizations(employee.id) : Promise.resolve({ data: [] }),
  ]

  const results = await Promise.all(calls)
  const [
    leaves, comps, adjustments, regs, timesheets,
    pendingLeaves, pendingComps, pendingTs, pendingRegs,
  ] = results
  const error = results.find(r => r?.error)?.error

  const feed = []

  for (const l of (leaves.data || [])) {
    if (l.status !== 'approved' && l.status !== 'rejected') continue
    feed.push({
      id: `leave-${l.id}`,
      date: l.decided_on || l.applied_on,
      color: l.status === 'approved' ? C.green : C.red,
      bg: l.status === 'approved' ? C.greenBg : C.redBg,
      icon: l.status === 'approved' ? '✓' : '✕',
      title: `${l.leave_type} leave ${l.status}`,
      subtitle: `${formatDate(l.from_date)} – ${formatDate(l.to_date)}${l.reject_reason ? ` · ${l.reject_reason}` : ''}`,
    })
  }

  for (const c of (comps.data || [])) {
    if (c.status !== 'approved' && c.status !== 'rejected') continue
    feed.push({
      id: `comp-${c.id}`,
      date: c.decided_on || c.applied_on,
      color: c.status === 'approved' ? C.purple : C.red,
      bg: c.status === 'approved' ? C.purpleBg : C.redBg,
      icon: c.status === 'approved' ? '✓' : '✕',
      title: `Comp off ${c.status}`,
      subtitle: `Worked ${formatDate(c.worked_date)} · +${c.earned_days}d`,
    })
  }

  for (const a of (adjustments.data || [])) {
    if (!a.adjustment) continue
    feed.push({
      id: `adj-${a.id}`,
      date: a.updated_at || a.created_at,
      color: C.amber,
      bg: C.amberBg,
      icon: '⚙',
      title: `${a.type_code} leave balance adjusted by admin`,
      subtitle: `${a.adjustment > 0 ? '+' : ''}${a.adjustment} days${a.reason ? ` · ${a.reason}` : ''}`,
    })
  }

  for (const r of (regs.data || [])) {
    if (r.status !== 'approved' && r.status !== 'rejected') continue
    feed.push({
      id: `reg-${r.id}`,
      date: r.decided_at || r.created_at,
      color: r.status === 'approved' ? C.green : C.red,
      bg: r.status === 'approved' ? C.greenBg : C.redBg,
      icon: r.status === 'approved' ? '✓' : '✕',
      title: `Attendance regularization ${r.status}`,
      subtitle: `${formatDate(r.attendance?.date)}${r.reject_reason ? ` · ${r.reject_reason}` : ''}`,
    })
  }

  for (const t of (timesheets.data || [])) {
    if (t.status !== 'approved' && t.status !== 'rejected') continue
    feed.push({
      id: `ts-${t.id}`,
      date: t.approved_at || t.submitted_at,
      color: t.status === 'approved' ? C.green : C.red,
      bg: t.status === 'approved' ? C.greenBg : C.redBg,
      icon: t.status === 'approved' ? '✓' : '✕',
      title: `Timesheet ${t.status}`,
      subtitle: `Week of ${formatDate(t.week_start)}${t.reject_reason ? ` · ${t.reject_reason}` : ''}`,
    })
  }

  if (isApprover) {
    const pendingGroups = [
      [pendingLeaves.data || [], 'leave request'],
      [pendingComps.data  || [], 'comp off request'],
      [pendingTs.data     || [], 'timesheet'],
      [pendingRegs.data   || [], 'regularization request'],
    ]
    for (const [list, label] of pendingGroups) {
      if (list.length === 0) continue
      feed.push({
        id: `pending-${label}`,
        pinned: true,
        color: C.blue,
        bg: C.blueBg,
        icon: '⏳',
        title: `${list.length} ${label}${list.length > 1 ? 's' : ''} awaiting your approval`,
        subtitle: 'Go to Approvals to review',
      })
    }
  }

  feed.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.date) - new Date(a.date)
  })

  return { feed, error }
}
