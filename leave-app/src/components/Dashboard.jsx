import { useEffect, useState } from 'react'
import {
  fetchLeaveBalance, fetchMyLeaves, fetchMyCompRequests, fetchHolidays, fetchBirthdays,
  fetchTodayAttendance, fetchEmployees, fetchAllAttendance, fetchTeamCalendar,
  fetchPendingForApprover, fetchPendingCompForApprover, fetchPendingTimesheets,
  fetchPendingRegularizations, decideLeave,
} from '../lib/api'
import { Avatar, C, Panel, Segmented, Spinner, card, formatDate } from './UI'
import { useToday } from '../lib/dates'
import { punchIn, punchOut } from '../lib/attendance'

const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'

const TONE = { annual: '#3a76ad', sick: '#3a76ad', comp: '#c2882a' }

export default function Dashboard({ employee, onToast, onNavigate, canApprove = false }) {
  const today = useToday()
  const isApprover = employee.role === 'admin' || employee.role === 'manager' || canApprove
  const [loading, setLoading] = useState(true)
  const [balances, setBalances] = useState([])
  const [leaves, setLeaves] = useState([])
  const [compReqs, setCompReqs] = useState([])
  const [holidays, setHolidays] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [attendance, setAttendance] = useState(null)
  const [inbox, setInbox] = useState([])
  const [pendingCounts, setPendingCounts] = useState({ leave: 0, comp: 0, ts: 0, reg: 0 })
  const [teamToday, setTeamToday] = useState([])
  const [deciding, setDeciding] = useState(null)
  const [punching, setPunching] = useState(false)
  const [teamFilter, setTeamFilter] = useState('in') // 'in' | 'out' | 'leave'

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchLeaveBalance(employee.id),
      fetchMyLeaves(employee.id),
      fetchMyCompRequests(employee.id),
      fetchHolidays(),
      fetchBirthdays(),
      fetchTodayAttendance(employee.id),
      isApprover ? fetchPendingForApprover(employee.id)     : Promise.resolve({ data: [] }),
      isApprover ? fetchPendingCompForApprover(employee.id) : Promise.resolve({ data: [] }),
      isApprover ? fetchPendingTimesheets(employee.id)      : Promise.resolve({ data: [] }),
      isApprover ? fetchPendingRegularizations(employee.id) : Promise.resolve({ data: [] }),
      isApprover ? fetchEmployees()                          : Promise.resolve({ data: [] }),
      isApprover ? fetchAllAttendance(300, { from: today, to: today }) : Promise.resolve({ data: [] }),
      isApprover ? fetchTeamCalendar(today, today)           : Promise.resolve({ data: [] }),
    ]).then(([b, l, c, h, bd, att, pl, pc, pt, pr, emps, allAtt, tc]) => {
      const err = b.error || l.error || c.error
      if (err) onToast?.(err.message || 'Failed to load some data', 'error')
      setBalances(b.data || [])
      setLeaves((l.data || []).slice(0, 4))
      setCompReqs((c.data || []).filter(x => x.status === 'pending'))
      setHolidays(h.data || [])
      setBirthdays(bd.data || [])
      setAttendance(att.data || null)
      setInbox((pl.data || []).slice(0, 3))
      setPendingCounts({
        leave: (pl.data || []).length, comp: (pc.data || []).length,
        ts: (pt.data || []).length, reg: (pr.data || []).length,
      })
      if (isApprover) {
        const onLeave = new Set((tc.data || []).map(x => x.employee_id))
        const attByEmp = {}
        for (const a of (allAtt.data || [])) attByEmp[a.employee_id] = a
        const rows = (emps.data || [])
          .filter(e => e.is_active !== false && e.id !== employee.id)
          .map(e => {
            const a = attByEmp[e.id]
            if (onLeave.has(e.id)) return { ...e, state: 'leave' }
            if (a?.check_in_time) return {
              ...e, state: 'in',
              inTime: fmtTime(a.check_in_time),
              outTime: a.check_out_time ? fmtTime(a.check_out_time) : null,
              checkedOut: !!a.check_out_time,
            }
            return { ...e, state: 'out' }
          })
          .sort((a, b) => ({ in: 0, leave: 1, out: 2 })[a.state] - ({ in: 0, leave: 1, out: 2 })[b.state])
        setTeamToday(rows)
      }
    }).finally(() => setLoading(false))
    // isApprover can flip true after the parent resolves approver status async
  }, [employee.id, today, isApprover])

  const decide = async (id, status) => {
    setDeciding(id)
    const { error } = await decideLeave(id, status)
    setDeciding(null)
    if (error) { onToast?.(error.message, 'error'); return }
    onToast?.(`Leave ${status}`)
    setInbox(p => p.filter(x => x.id !== id))
    setPendingCounts(p => ({ ...p, leave: Math.max(0, p.leave - 1) }))
  }

  const handlePunch = async () => {
    const isIn = attendance?.check_in_time && !attendance?.check_out_time
    setPunching(true)
    try {
      const { data, error } = isIn ? await punchOut(employee, attendance) : await punchIn(employee, attendance)
      if (error) { onToast?.(typeof error === 'string' ? error : error.message, 'error'); return }
      const { data: fresh } = await fetchTodayAttendance(employee.id)
      setAttendance(fresh || data || null)
      onToast?.(isIn ? 'Checked out' : 'Checked in')
    } catch (e) {
      onToast?.(`${e.message} — check in from the Attendance page`, 'error')
      onNavigate?.('attendance')
    } finally {
      setPunching(false)
    }
  }

  if (loading) return <Spinner />

  const curMonth = new Date(today + 'T12:00:00').getMonth()
  const holidaysThisMonth = holidays
    .filter(h => h.holiday_date >= today && new Date(h.holiday_date + 'T12:00:00').getMonth() === curMonth)
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
  const birthdaysThisMonth = birthdays
    .filter(b => new Date(b.date_of_birth + 'T12:00:00').getMonth() === curMonth)
    .sort((a, b) => new Date(a.date_of_birth + 'T12:00:00').getDate() - new Date(b.date_of_birth + 'T12:00:00').getDate())

  // Check-in state
  const checkedIn = attendance?.check_in_time && !attendance?.check_out_time
  const done = attendance?.check_in_time && attendance?.check_out_time
  const hours = (attendance?.total_hours || 0).toFixed(1)
  const bannerLabel = checkedIn ? 'Check out' : done ? 'Check in again' : 'Check in'
  const bannerSub = attendance?.check_in_time
    ? `Since ${fmtTime(attendance.check_in_time)}${(attendance.total_hours || 0) >= 8 ? ' · minimum 8h met' : ''}`
    : "You haven't checked in yet today"

  const totalPending = pendingCounts.leave + pendingCounts.comp + pendingCounts.ts + pendingCounts.reg
  const teamIn = teamToday.filter(t => t.state === 'in').length
  const teamLeave = teamToday.filter(t => t.state === 'leave').length
  const teamOut = teamToday.filter(t => t.state === 'out').length

  const reqDot = { pending: '#c2882a', approved: '#3a76ad', rejected: C.red, cancelled: C.faint }
  const reqBg = { pending: '#fdfaf4', approved: '#f4f8fd', rejected: C.redBg, cancelled: C.bgTert }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Check-in banner ── */}
      <div style={{
        background: C.navy, borderRadius: 14, padding: '24px 26px', color: '#e7f2ec',
        display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(231,242,236,0.6)' }}>
            {checkedIn ? 'You are checked in' : done ? 'Checked out' : 'Attendance'}
          </div>
          <div style={{ fontFamily: C.serif, fontSize: 38, lineHeight: 1.1, marginTop: 8, color: '#fff' }}>
            {hours}<span style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)' }}> h today</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(231,242,236,0.75)', marginTop: 6 }}>{bannerSub}</div>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.14)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 190 }}>
          <button onClick={handlePunch} disabled={punching}
            style={{ height: 42, border: 'none', borderRadius: 9, background: '#fff', color: C.navy, fontSize: 13.5, fontWeight: 600, cursor: punching ? 'default' : 'pointer', fontFamily: 'inherit', opacity: punching ? 0.7 : 1 }}>
            {punching ? (checkedIn ? 'Checking out…' : 'Checking in…') : bannerLabel}
          </button>
          <button onClick={() => onNavigate?.('apply')}
            style={{ height: 38, border: '1px solid rgba(255,255,255,0.3)', borderRadius: 9, background: 'none', color: '#e7f2ec', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Apply for leave
          </button>
        </div>
      </div>

      {/* ── Balance — one card, three columns ── */}
      {balances.length > 0 && (
        <div className="dash-balance-grid" style={{ ...card, padding: 0 }}>
          {balances.map(b => {
            const pct = b.total > 0 ? Math.round(((b.total - b.remaining) / b.total) * 100) : 0
            return (
              <div key={b.type_code} className="dash-balance-cell">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: C.sub }}>{b.label}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>{b.used} used</span>
                </div>
                <div style={{ fontFamily: C.serif, fontSize: 34, lineHeight: 1, marginTop: 10 }}>
                  {b.remaining}<span style={{ fontSize: 14, color: C.faint, fontFamily: C.sans }}> of {b.total}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: '#eaeff6', marginTop: 14, overflow: 'hidden' }}>
                  <div style={{ height: 4, width: `${Math.max(0, Math.min(100, pct))}%`, background: TONE[b.type_code] || '#3a76ad' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Team today (approvers) ── */}
      {isApprover && teamToday.length > 0 && (() => {
        const filterItems = [
          { id: 'in', label: `Checked in (${teamIn})` },
          { id: 'out', label: `Not in (${teamOut})` },
          ...(teamLeave > 0 ? [{ id: 'leave', label: `On leave (${teamLeave})` }] : []),
        ]
        const activeFilter = filterItems.some(i => i.id === teamFilter) ? teamFilter : 'in'
        const shown = teamToday.filter(t => t.state === activeFilter)
        return (
          <Panel
            title="Team today"
            right={
              <Segmented
                items={filterItems}
                value={activeFilter}
                onChange={setTeamFilter}
              />
            }
          >
            {shown.length === 0 ? (
              <div style={{ fontSize: 12.5, color: C.muted, padding: '4px 0' }}>
                {activeFilter === 'in' ? 'Nobody has checked in yet.'
                  : activeFilter === 'out' ? 'Everyone has checked in.'
                  : 'Nobody is on leave today.'}
              </div>
            ) : shown.slice(0, 10).map(t => {
              const label = activeFilter === 'in'
                ? (t.checkedOut ? 'Checked in & out' : 'Checked in')
                : activeFilter === 'leave' ? 'On leave' : 'Not checked in'
              const time = activeFilter === 'in'
                ? (t.checkedOut ? `${t.inTime} – ${t.outTime}` : t.inTime)
                : '—'
              return (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '190px minmax(0,1fr) 150px', gap: 14, alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.rowLine}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Avatar initials={t.avatar_initials} size={26} bg={C.bgTert} color={C.sub} />
                    <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.full_name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: activeFilter === 'leave' ? '#3a76ad' : activeFilter === 'out' ? '#c2882a' : t.checkedOut ? '#c2882a' : C.greenDot }} />
                    <span style={{ fontSize: 12.5, color: activeFilter === 'in' ? (t.checkedOut ? '#8a6a22' : C.body) : activeFilter === 'leave' ? '#2a5c8a' : '#8a6a22' }}>
                      {label}
                    </span>
                  </div>
                  <span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.sub, textAlign: 'right' }}>{time}</span>
                </div>
              )
            })}
            {shown.length > 10 && (
              <div style={{ fontSize: 11.5, color: C.faint, paddingTop: 10 }}>+{shown.length - 10} more</div>
            )}
          </Panel>
        )
      })()}

      <div className="home-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Your requests (employees) ── */}
        {!isApprover && leaves.length > 0 && (
          <Panel title="Your requests" right={<span onClick={() => onNavigate?.('history')} style={{ fontSize: 12, color: C.blue, cursor: 'pointer' }}>All ›</span>}>
            {leaves.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: '50%', background: reqDot[l.status] }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.leave_type} leave · {formatDate(l.from_date)} – {formatDate(l.to_date)}</div>
                  <div style={{ fontSize: 11.5, color: C.sub }}>{l.days} day{l.days !== 1 ? 's' : ''} · applied {formatDate(l.applied_on)}</div>
                </div>
                <span style={{ background: reqBg[l.status], color: reqDot[l.status], fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', borderRadius: 20, padding: '3px 9px', border: `1px solid ${C.line}` }}>{l.status}</span>
              </div>
            ))}
            {compReqs.length > 0 && (
              <div style={{ paddingTop: 11, fontSize: 12, color: C.muted }}>
                {compReqs.length} comp off request{compReqs.length > 1 ? 's' : ''} pending approval
              </div>
            )}
          </Panel>
        )}

        {/* ── Needs you (approvers) ── */}
        {isApprover && (
          <Panel title="Needs you" right={<span onClick={() => onNavigate?.('approvals')} style={{ fontSize: 12, color: C.blue, cursor: 'pointer' }}>Approvals ›</span>}>
            {totalPending === 0 ? (
              <div style={{ fontSize: 12.5, color: C.muted, padding: '4px 0' }}>Nothing pending your approval.</div>
            ) : (
              <>
                {inbox.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Avatar initials={i.employee?.avatar_initials} size={28} bg={C.blueBg} color={C.blue} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.employee?.full_name}</div>
                      <div style={{ fontSize: 11.5, color: C.sub, textTransform: 'capitalize' }}>{i.leave_type} leave · {formatDate(i.from_date)} – {formatDate(i.to_date)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button disabled={deciding === i.id} onClick={() => decide(i.id, 'approved')} style={{ height: 27, padding: '0 10px', border: `1px solid ${C.navyBg}`, background: C.navyBg, borderRadius: 6, fontSize: 12, color: C.navy, cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>
                      <button disabled={deciding === i.id} onClick={() => decide(i.id, 'rejected')} style={{ height: 27, padding: '0 9px', border: `1px solid ${C.line}`, background: '#fff', borderRadius: 6, fontSize: 12, color: C.sub, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                    </div>
                  </div>
                ))}
                <div style={{ paddingTop: 11, fontSize: 12, color: C.muted }}>
                  {[
                    pendingCounts.comp && `${pendingCounts.comp} comp off`,
                    pendingCounts.ts && `${pendingCounts.ts} timesheet`,
                    pendingCounts.reg && `${pendingCounts.reg} regularization`,
                  ].filter(Boolean).join(' · ') || 'Leave requests only'} awaiting review
                </div>
              </>
            )}
          </Panel>
        )}

        {/* ── Coming up ── */}
        <Panel title="Coming up" style={(!isApprover && leaves.length === 0) ? { gridColumn: '1 / -1' } : undefined}>
          {holidaysThisMonth.length === 0 && birthdaysThisMonth.length === 0 && (
            <div style={{ fontSize: 12.5, color: C.muted, padding: '4px 0' }}>Nothing on the calendar this month.</div>
          )}
          {holidaysThisMonth.map(h => (
            <ComingRow key={h.id} chipBg="#e4edf7" chipFg={C.navy}
              date={h.holiday_date} label={h.name} meta={`Company holiday · ${h.region || 'All'}`} />
          ))}
          {birthdaysThisMonth.map(b => (
            <ComingRow key={b.id} chipBg="#eef2f7" chipFg={C.sub}
              date={b.date_of_birth} label={`${b.full_name}${b.id === employee.id ? ' (You)' : ''} — birthday`} meta="Say hi" />
          ))}
        </Panel>
      </div>
    </div>
  )
}

function ComingRow({ date, label, meta, chipBg, chipFg }) {
  const d = new Date(date + 'T12:00:00')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)', gap: 14, padding: '12px 0', borderBottom: '1px solid #edf1f7', alignItems: 'center' }}>
      <div style={{ textAlign: 'center', borderRadius: 8, background: chipBg, padding: '5px 0' }}>
        <div style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: chipFg }}>{d.toLocaleDateString('en-IN', { month: 'short' })}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 15, color: chipFg }}>{d.getDate()}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: '#7b8798' }}>{meta}</div>
      </div>
    </div>
  )
}
