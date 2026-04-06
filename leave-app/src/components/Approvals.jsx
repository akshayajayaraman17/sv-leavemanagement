import { useEffect, useState } from 'react'
import {
  fetchPendingForApprover, fetchPendingCompForApprover,
  decideLeave, decideCompOff,
  fetchPendingTimesheets, decideTimesheet, fetchTimesheetEntries,
  fetchPendingRegularizations, decideRegularization, updateAttendanceStatus,
} from '../lib/api'
import { Avatar, Badge, C, Empty, Spinner, btnStyle, card, formatDate, inputStyle } from './UI'

export default function Approvals({ employee, onToast }) {
  const [tab,        setTab]      = useState('comp')
  const [leaves,     setLeaves]   = useState([])
  const [comps,      setComps]    = useState([])
  const [timesheets, setTimesheets] = useState([])
  const [regs,       setRegs]     = useState([])
  const [loading,    setLoading]  = useState(true)
  const [deciding,   setDeciding] = useState(null)
  const [expandedTs, setExpandedTs] = useState(null)
  const [tsEntries,  setTsEntries] = useState({})
  const [rejectId,   setRejectId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchPendingForApprover(employee.id),
      fetchPendingCompForApprover(employee.id),
      fetchPendingTimesheets(employee.id),
      fetchPendingRegularizations(employee.id),
    ]).then(([l, c, ts, r]) => {
      setLeaves(l.data || [])
      setComps(c.data || [])
      setTimesheets(ts.data || [])
      setRegs(r.data || [])
    }).finally(() => setLoading(false))
  }

  useEffect(load, [employee.id])

  const loadTsEntries = async (tsId) => {
    if (tsEntries[tsId]) { setExpandedTs(expandedTs === tsId ? null : tsId); return }
    const { data } = await fetchTimesheetEntries(tsId)
    setTsEntries(p => ({ ...p, [tsId]: data || [] }))
    setExpandedTs(tsId)
  }

  const handleLeave = async (id, status) => {
    setDeciding(id)
    const { error } = await decideLeave(id, status)
    setDeciding(null)
    if (error) { onToast(error.message, 'error'); return }
    onToast(`Leave ${status}`)
    setLeaves(p => p.filter(l => l.id !== id))
  }

  const handleComp = async (id, status) => {
    setDeciding(id)
    const { error } = await decideCompOff(id, status)
    setDeciding(null)
    if (error) { onToast(error.message, 'error'); return }
    onToast(`Comp off ${status}`)
    setComps(p => p.filter(c => c.id !== id))
  }

  const handleTimesheet = async (id, status) => {
    if (status === 'rejected' && !rejectReason.trim()) { setRejectId(id); return }
    setDeciding(id)
    const reason = status === 'rejected' ? rejectReason : null
    const { error } = await decideTimesheet(id, status, reason)
    setDeciding(null)
    setRejectId(null)
    setRejectReason('')
    if (error) { onToast(error.message, 'error'); return }
    onToast(`Timesheet ${status}`)
    setTimesheets(p => p.filter(t => t.id !== id))
  }

  const handleRegularization = async (reg, status) => {
    setDeciding(reg.id)
    const reason = status === 'rejected' ? rejectReason : null
    const { error } = await decideRegularization(reg.id, status, reason)
    if (!error && status === 'approved') {
      // Update attendance status to present and set checkout time
      await updateAttendanceStatus(reg.attendance_id, 'present')
    }
    setDeciding(null)
    setRejectId(null)
    setRejectReason('')
    if (error) { onToast(error.message, 'error'); return }
    onToast(`Regularization ${status}`)
    setRegs(p => p.filter(r => r.id !== reg.id))
  }

  if (loading) return <Spinner />

  const TB = ({ id, label, count }) => (
    <button onClick={() => setTab(id)} style={{
      padding: '7px 16px', fontSize: 12, fontWeight: 500, borderRadius: 20,
      border: 'none', cursor: 'pointer',
      background: tab === id ? C.green : C.bgSec,
      color: tab === id ? '#fff' : C.textSec,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {label}
      {count > 0 && (
        <span style={{ background: tab === id ? 'rgba(255,255,255,0.3)' : '#E24B4A', color: '#fff', fontSize: 10, padding: '1px 5px', borderRadius: 8 }}>
          {count}
        </span>
      )}
    </button>
  )

  const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <TB id="comp"       label="Comp Off"        count={comps.length} />
        <TB id="leaves"     label="Leave Requests"   count={leaves.length} />
        <TB id="timesheets" label="Timesheets"       count={timesheets.length} />
        <TB id="regs"       label="Regularizations"  count={regs.length} />
      </div>

      {tab === 'comp' && (
        comps.length === 0 ? <Empty text="All comp off approvals done ✓" /> :
        comps.map(c => (
          <div key={c.id} style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar initials={c.employee?.avatar_initials} size={34} color={C.purple} bg={C.purpleBg} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{c.employee?.full_name}</div>
                <div style={{ fontSize: 11, color: C.textTert }}>{c.employee?.department} · Comp Off</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Date Worked</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(c.worked_date)}</div>
              </div>
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Hours / Earning</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{c.worked_hours}h → <span style={{ color: C.purple }}>+{c.earned_days}d</span></div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textSec, borderTop: `0.5px solid ${C.border}`, padding: '8px 0 10px' }}>{c.reason}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleComp(c.id, 'approved')} disabled={deciding === c.id} style={{ ...btnStyle(C.green, '#fff'), flex: 1 }}>Approve</button>
              <button onClick={() => handleComp(c.id, 'rejected')} disabled={deciding === c.id} style={{ ...btnStyle(C.bgSec, C.red, `0.5px solid #F09595`), flex: 1 }}>Reject</button>
            </div>
          </div>
        ))
      )}

      {tab === 'leaves' && (
        leaves.length === 0 ? <Empty text="All leave approvals done ✓" /> :
        leaves.map(l => (
          <div key={l.id} style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar initials={l.employee?.avatar_initials} size={34} color={C.blue} bg={C.blueBg} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{l.employee?.full_name}</div>
                <div style={{ fontSize: 11, color: C.textTert }}>{l.employee?.department} · {l.leave_type} leave</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Duration</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(l.from_date)} – {formatDate(l.to_date)}</div>
              </div>
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Days</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{l.days} day{l.days > 1 ? 's' : ''}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textSec, borderTop: `0.5px solid ${C.border}`, padding: '8px 0 6px' }}>{l.reason}</div>
            {l.medical_certificate_url && (
              <a href={l.medical_certificate_url} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.blue, marginBottom: 10 }}>
                📎 View medical certificate
              </a>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleLeave(l.id, 'approved')} disabled={deciding === l.id} style={{ ...btnStyle(C.green, '#fff'), flex: 1 }}>Approve</button>
              <button onClick={() => handleLeave(l.id, 'rejected')} disabled={deciding === l.id} style={{ ...btnStyle(C.bgSec, C.red, `0.5px solid #F09595`), flex: 1 }}>Reject</button>
            </div>
          </div>
        ))
      )}

      {tab === 'regs' && (
        regs.length === 0 ? <Empty text="No pending regularization requests ✓" /> :
        regs.map(r => (
          <div key={r.id} style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar initials={r.employee?.avatar_initials} size={34} color={C.amber} bg={C.amberBg} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.employee?.full_name}</div>
                <div style={{ fontSize: 11, color: C.textTert }}>{r.employee?.department} · Attendance Regularization</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Date</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(r.attendance?.date)}</div>
              </div>
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Check-In Time</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {r.attendance?.check_in_time
                    ? new Date(r.attendance.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                    : '—'}
                </div>
              </div>
            </div>
            {r.check_out_time && (
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px', marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Proposed Check-Out</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r.check_out_time}</div>
              </div>
            )}
            <div style={{ fontSize: 12, color: C.textSec, borderTop: `0.5px solid ${C.border}`, padding: '8px 0 10px' }}>
              <strong>Reason:</strong> {r.reason}
            </div>
            {rejectId === r.id && (
              <div style={{ marginBottom: 10 }}>
                <input
                  autoFocus
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection…"
                  style={{ ...inputStyle(true), marginBottom: 8 }}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleRegularization(r, 'approved')}
                disabled={deciding === r.id}
                style={{ ...btnStyle(C.green, '#fff'), flex: 1 }}
              >Approve</button>
              <button
                onClick={() => {
                  if (rejectId === r.id && rejectReason.trim()) {
                    handleRegularization(r, 'rejected')
                  } else {
                    setRejectId(r.id)
                    setRejectReason('')
                  }
                }}
                disabled={deciding === r.id}
                style={{ ...btnStyle(C.bgSec, C.red, `0.5px solid #F09595`), flex: 1 }}
              >
                {rejectId === r.id ? 'Confirm Reject' : 'Reject'}
              </button>
            </div>
          </div>
        ))
      )}

      {tab === 'timesheets' && (
        timesheets.length === 0 ? <Empty text="No timesheets pending approval ✓" /> :
        timesheets.map(ts => {
          const entries = tsEntries[ts.id] || []
          const isExpanded = expandedTs === ts.id
          const hoursPerDay = {}
          for (const e of entries) hoursPerDay[e.date] = (hoursPerDay[e.date] || 0) + e.hours

          return (
            <div key={ts.id} style={{ ...card, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Avatar initials={ts.employee?.avatar_initials} size={34} color={C.green} bg={C.greenBg} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{ts.employee?.full_name}</div>
                  <div style={{ fontSize: 11, color: C.textTert }}>{ts.employee?.department} · {ts.employee?.designation}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: ts.total_hours >= 40 ? C.green : C.amber }}>{ts.total_hours}h</div>
                  <div style={{ fontSize: 10, color: C.textTert }}>this week</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                  <div style={{ fontSize: 10, color: C.textTert }}>Week of</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(ts.week_start)}</div>
                </div>
                <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                  <div style={{ fontSize: 10, color: C.textTert }}>Submitted</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(ts.submitted_at)}</div>
                </div>
              </div>

              {/* Expand to see entries */}
              <button
                onClick={() => loadTsEntries(ts.id)}
                style={{ ...btnStyle(C.bgSec, C.textSec), fontSize: 12, padding: '5px 12px', marginBottom: 10, width: '100%' }}
              >
                {isExpanded ? '▲ Hide entries' : `▼ View entries`}
              </button>

              {isExpanded && entries.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {Object.entries(
                    entries.reduce((days, e) => {
                      if (!days[e.date]) days[e.date] = []
                      days[e.date].push(e)
                      return days
                    }, {})
                  ).map(([date, dayEntries]) => (
                    <div key={date} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>
                        {new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                        <span style={{ marginLeft: 8, color: C.textTert, fontWeight: 400 }}>{hoursPerDay[date]}h</span>
                      </div>
                      {dayEntries.map(entry => (
                        <div key={entry.id} style={{ background: C.bgSec, borderRadius: 8, padding: '6px 10px', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {entry.jira_issue_key && (
                              <span style={{ background: C.blueBg, color: C.blue, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, marginRight: 6 }}>
                                {entry.jira_issue_key}
                              </span>
                            )}
                            <span style={{ fontSize: 12 }}>{entry.task_description}</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{entry.hours}h</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Reject reason input */}
              {rejectId === ts.id && (
                <div style={{ marginBottom: 10 }}>
                  <input
                    autoFocus
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection…"
                    style={{ ...inputStyle(true), marginBottom: 8 }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleTimesheet(ts.id, 'approved')}
                  disabled={deciding === ts.id}
                  style={{ ...btnStyle(C.green, '#fff'), flex: 1 }}
                >Approve</button>
                <button
                  onClick={() => {
                    if (rejectId === ts.id && rejectReason.trim()) {
                      handleTimesheet(ts.id, 'rejected')
                    } else {
                      setRejectId(ts.id)
                      setRejectReason('')
                    }
                  }}
                  disabled={deciding === ts.id}
                  style={{ ...btnStyle(C.bgSec, C.red, `0.5px solid #F09595`), flex: 1 }}
                >
                  {rejectId === ts.id ? 'Confirm Reject' : 'Reject'}
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
