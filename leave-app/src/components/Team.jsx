import { useEffect, useState } from 'react'
import {
  fetchEmployees, fetchLeaveBalance, fetchMyLeaves,
  fetchTimesheetHistory, fetchTimesheetEntries,
  fetchAttendanceHistory, getMedicalCertificateUrl,
} from '../lib/api'
import { Avatar, Badge, Btn, C, Empty, KV, Mono, Panel, ProgressBar, SecTitle, Spinner, Tabs, card, formatDate, inputStyle } from './UI'

const ROLES = { admin: 'Admin', manager: 'Manager', employee: 'Employee' }
const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'

function EmployeeDetail({ emp, allEmployees, onBack, onToast }) {
  const [tab, setTab] = useState('profile')
  const [balances, setBalances] = useState([])
  const [leaves, setLeaves] = useState([])
  const [timesheets, setTimesheets] = useState([])
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedTs, setExpandedTs] = useState(null)
  const [tsEntries, setTsEntries] = useState({})

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
    if (!tsEntries[tsId]) { const { data } = await fetchTimesheetEntries(tsId); setTsEntries(p => ({ ...p, [tsId]: data || [] })) }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Btn variant="ghost" sm onClick={onBack}>‹ Back</Btn>
        <Avatar initials={emp.avatar_initials} size={40} />
        <div>
          <div style={{ fontFamily: C.serif, fontSize: 20 }}>{emp.full_name}</div>
          <div style={{ fontSize: 12, color: C.sub }}>{emp.designation || ROLES[emp.role]} · {emp.department || '—'}</div>
        </div>
      </div>

      <Tabs items={[
        { id: 'profile', label: 'Profile' }, { id: 'leaves', label: 'Leaves' },
        { id: 'timesheet', label: 'Timesheet' }, { id: 'attendance', label: 'Attendance' },
      ]} value={tab} onChange={setTab} />

      {loading ? <Spinner /> : <>
        {tab === 'profile' && (
          <div className="split-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
            <div style={{ ...card }}>
              <SecTitle>Personal info</SecTitle>
              <KV k="Email" v={emp.email} />
              <KV k="Phone" v={emp.phone} />
              <KV k="Address" v={emp.address} />
              <KV k="Employee code" v={emp.employee_code} />
              <KV k="Role" v={ROLES[emp.role]} />
              <KV k="Department" v={emp.department} />
              <KV k="Designation" v={emp.designation} />
              <KV k="Reporting manager" v={manager?.full_name} />
              <KV k="Date of joining" v={formatDate(emp.joining_date)} />
              <KV k="Status" v={emp.is_active ? 'Active' : 'Inactive'} last={emp.is_active || !emp.exit_date} />
              {!emp.is_active && emp.exit_date && <KV k="Last working day" v={formatDate(emp.exit_date)} last />}
            </div>
            <Panel title={`Leave balance — ${new Date().getFullYear()}`}>
              {balances.map((b, i) => {
                const pct = b.total > 0 ? Math.round((b.used / b.total) * 100) : 0
                return (
                  <div key={b.type_code} style={{ marginBottom: i < balances.length - 1 ? 14 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.body }}>
                      <span>{b.label}</span>
                      <span style={{ fontFamily: C.mono, fontSize: 11.5 }}><span style={{ color: C.ink }}>{b.remaining}</span><span style={{ color: C.faint }}> of {b.total}</span></span>
                    </div>
                    <div style={{ marginTop: 6 }}><ProgressBar pct={pct} color={b.type_code === 'comp' ? '#c2882a' : '#3a76ad'} /></div>
                  </div>
                )
              })}
            </Panel>
          </div>
        )}

        {tab === 'leaves' && (leaves.length === 0 ? <Empty text="No leave requests" /> : leaves.map(l => (
          <div key={l.id} style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>{l.leave_type} leave</span>
              <Badge status={l.status} />
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 3 }}>{formatDate(l.from_date)} – {formatDate(l.to_date)} · <Mono>{l.days}</Mono> day{l.days !== 1 ? 's' : ''}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{l.reason}</div>
            {l.medical_certificate_url && <button onClick={() => viewCertificate(l.medical_certificate_url)} style={{ fontSize: 11.5, color: C.blue, marginTop: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>Medical certificate</button>}
            {l.reject_reason && <div style={{ fontSize: 11.5, color: C.red, marginTop: 5, background: C.redBg, border: `1px solid ${C.redLine}`, padding: '4px 8px', borderRadius: 6 }}>Rejected: {l.reject_reason}</div>}
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 5 }}>Applied {formatDate(l.applied_on)}</div>
          </div>
        )))}

        {tab === 'timesheet' && (timesheets.length === 0 ? <Empty text="No timesheets yet" /> : timesheets.map(ts => {
          const entries = tsEntries[ts.id] || []
          return (
            <div key={ts.id} style={{ ...card, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Week of {formatDate(ts.week_start)}</div>
                  <div style={{ fontSize: 11.5, color: C.sub, fontFamily: C.mono }}>{ts.total_hours}h logged{ts.submitted_at ? ` · submitted ${formatDate(ts.submitted_at)}` : ''}</div>
                </div>
                <Badge status={ts.status} />
              </div>
              {ts.reject_reason && <div style={{ fontSize: 11.5, color: C.red, background: C.redBg, border: `1px solid ${C.redLine}`, padding: '4px 8px', borderRadius: 6, marginBottom: 6 }}>Rejected: {ts.reject_reason}</div>}
              <Btn variant="subtle" full sm onClick={() => loadTsEntries(ts.id)}>{expandedTs === ts.id ? 'Hide entries' : 'View entries'}</Btn>
              {expandedTs === ts.id && entries.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {entries.map(e => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.rowLine}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {e.jira_issue_key && <Mono style={{ background: C.blueBg, color: C.blue, fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 5, marginRight: 5 }}>{e.jira_issue_key}</Mono>}
                        <span style={{ fontSize: 12 }}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {e.task_description}</span>
                      </div>
                      <Mono style={{ fontSize: 12, fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>{e.hours}h</Mono>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        }))}

        {tab === 'attendance' && (attendance.length === 0 ? <Empty text="No attendance records" /> : attendance.map(a => (
          <div key={a.id} style={{ ...card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{new Date(a.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
              <div style={{ fontSize: 11.5, color: C.sub, marginTop: 3 }}>In {fmtTime(a.check_in_time)} · Out {fmtTime(a.check_out_time)}{a.check_in_address ? ` · ${a.check_in_address}` : ''}</div>
            </div>
            {a.total_hours != null ? <Mono style={{ background: C.greenBg, color: '#1f7350', fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>{a.total_hours.toFixed(1)}h</Mono>
              : a.check_in_time ? <span style={{ background: C.amberBg, color: '#8a6a22', fontSize: 11, padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>in only</span> : null}
          </div>
        )))}
      </>}
    </div>
  )
}

export default function Team({ viewer, onToast }) {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchEmployees().then(({ data, error }) => {
      if (error) onToast?.(error.message || 'Failed to load team', 'error')
      setEmployees((data || []).filter(e => e.id !== viewer.id))
    }).finally(() => setLoading(false))
  }, [viewer.id])

  if (loading) return <Spinner />
  if (selected) return <EmployeeDetail emp={selected} allEmployees={employees} onBack={() => setSelected(null)} onToast={onToast} />

  const filtered = employees.filter(e =>
    (e.full_name + (e.department || '') + (e.designation || '') + (e.employee_code || '')).toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, department or code…" style={{ ...inputStyle(), marginBottom: 12, maxWidth: 360 }} />
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 12 }}>{filtered.length} employee{filtered.length !== 1 ? 's' : ''} · salary & admin actions are in the Admin Panel</div>

      {filtered.length === 0 ? <Empty text="No employees found" /> : filtered.map(e => {
        const mgr = employees.find(x => x.id === e.manager_id)
        return (
          <button key={e.id} onClick={() => setSelected(e)}
            style={{ ...card, marginBottom: 10, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar initials={e.avatar_initials} size={38} bg={C.bgTert} color={C.sub} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{e.full_name}</div>
                    <div style={{ fontSize: 11.5, color: C.sub, marginTop: 1 }}>{e.designation || ROLES[e.role]} · {e.department || '—'}</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 1, fontFamily: C.mono }}>{e.employee_code}{mgr ? ` · reports to ${mgr.full_name}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <Badge status={e.is_active ? 'active' : 'inactive'} />
                    <span style={{ background: C.bgSec, color: C.sub, fontSize: 10, padding: '2px 8px', borderRadius: 10 }}>{ROLES[e.role]}</span>
                  </div>
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
