import { useEffect, useState } from 'react'
import {
  fetchEmployees, fetchLeaveBalance, fetchMyLeaves,
  fetchTimesheetHistory, fetchTimesheetEntries,
  fetchAttendanceHistory, getMedicalCertificateUrl,
} from '../lib/api'
import { Avatar, Badge, C, Empty, SecTitle, Spinner, card, formatDate, btnStyle, inputStyle } from './UI'

const ROLES = { admin: 'Admin', manager: 'Manager', employee: 'Employee' }

// ── Tab button ────────────────────────────────────────────────────────────────
function TB({ active, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 16px', fontSize: 12, fontWeight: 500, borderRadius: 20,
      border: 'none', cursor: 'pointer',
      background: active ? C.green : C.bgSec,
      color: active ? '#fff' : C.textSec,
    }}>{label}</button>
  )
}

function formatTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ── Employee detail view ──────────────────────────────────────────────────────
// Read-only — managers browsing their reports. Admins manage employees
// (edit/deactivate/reset password/salary) from the Admin Panel instead,
// which has its own Activity tab covering this same leave/timesheet/
// attendance history, so there's one place for that rather than two.
function EmployeeDetail({ emp, allEmployees, onBack, onToast }) {
  const [tab,        setTab]       = useState('profile')
  const [balances,   setBalances]  = useState([])
  const [leaves,     setLeaves]    = useState([])
  const [timesheets, setTimesheets]= useState([])
  const [attendance, setAttendance]= useState([])
  const [loading,    setLoading]   = useState(true)
  const [expandedTs, setExpandedTs]= useState(null)
  const [tsEntries,  setTsEntries] = useState({})

  useEffect(() => {
    setLoading(true)
    const report = (label) => ({ error }) => { if (error) onToast?.(`Failed to load ${label}`, 'error') }
    Promise.all([
      fetchLeaveBalance(emp.id).then(r => { report('leave balance')(r); setBalances(r.data || []) }),
      fetchMyLeaves(emp.id).then(r => { report('leave history')(r); setLeaves(r.data || []) }),
      fetchTimesheetHistory(emp.id).then(r => { report('timesheets')(r); setTimesheets(r.data || []) }),
      fetchAttendanceHistory(emp.id, 30).then(r => { report('attendance')(r); setAttendance(r.data || []) }),
    ]).finally(() => setLoading(false))
  }, [emp.id])

  const loadTsEntries = async (tsId) => {
    if (expandedTs === tsId) { setExpandedTs(null); return }
    if (!tsEntries[tsId]) {
      const { data } = await fetchTimesheetEntries(tsId)
      setTsEntries(p => ({ ...p, [tsId]: data || [] }))
    }
    setExpandedTs(tsId)
  }

  const manager = allEmployees.find(e => e.id === emp.manager_id)

  const viewCertificate = async (value) => {
    const { url, error } = await getMedicalCertificateUrl(value)
    if (error || !url) { onToast?.('Failed to load certificate', 'error'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={onBack} style={{ ...btnStyle(C.bgSec, C.textSec), padding: '6px 12px', fontSize: 12 }}>‹ Back</button>
        <Avatar initials={emp.avatar_initials} size={40} color={C.green} bg={C.greenBg} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{emp.full_name}</div>
          <div style={{ fontSize: 12, color: C.textSec }}>{emp.designation || ROLES[emp.role]} · {emp.department || '—'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <TB id="profile"    active={tab==='profile'}    label="Profile"    onClick={() => setTab('profile')} />
        <TB id="leaves"     active={tab==='leaves'}     label="Leaves"     onClick={() => setTab('leaves')} />
        <TB id="timesheet"  active={tab==='timesheet'}  label="Timesheet"  onClick={() => setTab('timesheet')} />
        <TB id="attendance" active={tab==='attendance'} label="Attendance" onClick={() => setTab('attendance')} />
      </div>

      {loading ? <Spinner /> : <>

        {/* ── Profile tab ── */}
        {tab === 'profile' && (
          <div>
            <div style={{ ...card, marginBottom: 12 }}>
              <SecTitle>Personal Info</SecTitle>
              {[
                ['Email',         emp.email],
                ['Phone',         emp.phone   || '—'],
                ['Address',       emp.address || '—'],
                ['Employee Code', emp.employee_code],
                ['Role',          ROLES[emp.role]],
                ['Department',    emp.department  || '—'],
                ['Designation',   emp.designation || '—'],
                ['Reporting Manager', manager?.full_name || '—'],
                ['Date of Joining',   formatDate(emp.joining_date)],
                ['Status',        emp.is_active ? 'Active' : 'Inactive'],
                ...(!emp.is_active && emp.exit_date ? [['Last Working Day', formatDate(emp.exit_date)]] : []),
              ].map(([label, value]) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '8px 0', borderBottom: `0.5px solid ${C.border}`, gap: 12,
                }}>
                  <span style={{ fontSize: 13, color: C.textSec, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>

            <SecTitle>Leave Balance — {new Date().getFullYear()}</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {balances.map(b => (
                <div key={b.type_code} style={card}>
                  <div style={{ fontSize: 11, color: C.textSec, marginBottom: 4 }}>{b.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 600, color: b.color, lineHeight: 1 }}>{b.remaining}</div>
                  <div style={{ fontSize: 10, color: C.textTert, marginBottom: 8 }}>of {b.total} remaining</div>
                  <div style={{ background: C.bgSec, borderRadius: 4, height: 3 }}>
                    <div style={{ width: `${b.total > 0 ? Math.round((b.used / b.total) * 100) : 0}%`, height: '100%', background: b.color, borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.textTert, marginTop: 4 }}>{b.used} used</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Leaves tab ── */}
        {tab === 'leaves' && (
          <div>
            {leaves.length === 0 ? <Empty text="No leave requests" /> :
              leaves.map(l => (
                <div key={l.id} style={{ ...card, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>{l.leave_type} Leave</span>
                    <Badge status={l.status} />
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, marginBottom: 3 }}>
                    {formatDate(l.from_date)} – {formatDate(l.to_date)} · {l.days} day{l.days > 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: 12, color: C.textTert }}>{l.reason}</div>
                  {l.medical_certificate_url && (
                    <button
                      onClick={() => viewCertificate(l.medical_certificate_url)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.blue, marginTop: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                      📎 Medical certificate
                    </button>
                  )}
                  {l.reject_reason && (
                    <div style={{ fontSize: 11, color: C.red, marginTop: 5, background: C.redBg, padding: '4px 8px', borderRadius: 6 }}>
                      Rejected: {l.reject_reason}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: C.textTert, marginTop: 5 }}>Applied {formatDate(l.applied_on)}</div>
                </div>
              ))
            }
          </div>
        )}

        {/* ── Timesheet tab ── */}
        {tab === 'timesheet' && (
          <div>
            {timesheets.length === 0 ? <Empty text="No timesheets yet" /> :
              timesheets.map(ts => {
                const entries = tsEntries[ts.id] || []
                return (
                  <div key={ts.id} style={{ ...card, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>Week of {formatDate(ts.week_start)}</div>
                        <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>
                          {ts.total_hours}h logged
                          {ts.submitted_at && ` · Submitted ${formatDate(ts.submitted_at)}`}
                        </div>
                      </div>
                      <Badge status={ts.status} />
                    </div>
                    {ts.reject_reason && (
                      <div style={{ fontSize: 11, color: C.red, background: C.redBg, padding: '4px 8px', borderRadius: 6, marginBottom: 6 }}>
                        Rejected: {ts.reject_reason}
                      </div>
                    )}
                    <button
                      onClick={() => loadTsEntries(ts.id)}
                      style={{ ...btnStyle(C.bgSec, C.textSec), fontSize: 11, padding: '4px 10px', width: '100%' }}
                    >
                      {expandedTs === ts.id ? '▲ Hide entries' : '▼ View entries'}
                    </button>
                    {expandedTs === ts.id && entries.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {entries.map(e => (
                          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `0.5px solid ${C.bgTert}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {e.jira_issue_key && (
                                <span style={{ background: C.blueBg, color: C.blue, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, marginRight: 5 }}>
                                  {e.jira_issue_key}
                                </span>
                              )}
                              <span style={{ fontSize: 12 }}>
                                {new Date(e.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {e.task_description}
                              </span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{e.hours}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            }
          </div>
        )}

        {/* ── Attendance tab ── */}
        {tab === 'attendance' && (
          <div>
            {attendance.length === 0 ? <Empty text="No attendance records" /> :
              attendance.map(a => (
                <div key={a.id} style={{ ...card, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {new Date(a.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>
                        In: {formatTime(a.check_in_time)} · Out: {formatTime(a.check_out_time)}
                      </div>
                      {a.check_in_address && (
                        <div style={{ fontSize: 10, color: C.textTert, marginTop: 3 }}>📍 {a.check_in_address}</div>
                      )}
                    </div>
                    {a.total_hours != null ? (
                      <span style={{ background: C.greenBg, color: '#0F6E56', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
                        {a.total_hours.toFixed(1)}h
                      </span>
                    ) : a.check_in_time ? (
                      <span style={{ background: C.amberBg, color: C.amber, fontSize: 11, padding: '3px 10px', borderRadius: 20 }}>In only</span>
                    ) : null}
                  </div>
                </div>
              ))
            }
          </div>
        )}

      </>}
    </div>
  )
}

// ── Team list view ────────────────────────────────────────────────────────────
export default function Team({ viewer, onToast }) {
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [q,         setQ]         = useState('')
  const [selected,  setSelected]  = useState(null)

  useEffect(() => {
    fetchEmployees()
      .then(({ data, error }) => {
        if (error) onToast?.(error.message || 'Failed to load team', 'error')
        setEmployees((data || []).filter(e => e.id !== viewer.id))
      })
      .finally(() => setLoading(false))
  }, [viewer.id])

  if (loading) return <Spinner />

  if (selected) {
    return (
      <EmployeeDetail
        emp={selected}
        allEmployees={employees}
        onBack={() => setSelected(null)}
        onToast={onToast}
      />
    )
  }

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(q.toLowerCase()) ||
    (e.department || '').toLowerCase().includes(q.toLowerCase()) ||
    (e.designation || '').toLowerCase().includes(q.toLowerCase()) ||
    (e.employee_code || '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search by name, department or code…"
        style={{ ...inputStyle(), marginBottom: 14 }}
      />
      <div style={{ fontSize: 11, color: C.textTert, marginBottom: 12 }}>
        {filtered.length} employee{filtered.length !== 1 ? 's' : ''} · Salary and admin actions are in Admin Panel
      </div>

      {filtered.length === 0 ? <Empty text="No employees found" /> :
        filtered.map(e => {
          const mgr = employees.find(x => x.id === e.manager_id)
          return (
            <button
              key={e.id}
              style={{ ...card, marginBottom: 10, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}
              onClick={() => setSelected(e)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar initials={e.avatar_initials} size={40} color={C.blue} bg={C.blueBg} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{e.full_name}</div>
                      <div style={{ fontSize: 11, color: C.textSec, marginTop: 1 }}>
                        {e.designation || ROLES[e.role]} · {e.department || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: C.textTert, marginTop: 1 }}>
                        {e.employee_code}{mgr ? ` · Reports to ${mgr.full_name}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{
                        background: e.is_active ? C.greenBg : C.bgTert,
                        color: e.is_active ? '#0F6E56' : C.textSec,
                        fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10,
                      }}>
                        {e.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span style={{
                        background: C.bgSec, color: C.textSec,
                        fontSize: 10, padding: '2px 8px', borderRadius: 10,
                      }}>
                        {ROLES[e.role]}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </button>
          )
        })
      }
    </div>
  )
}
