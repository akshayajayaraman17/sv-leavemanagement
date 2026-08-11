import { useEffect, useState } from 'react'
import {
  fetchEmployees, fetchLeaveBalance, fetchMyLeaves, updateEmployee,
  fetchTimesheetHistory, fetchTimesheetEntries, fetchSalary,
  fetchAttendanceHistory, getMedicalCertificateUrl,
} from '../lib/api'
import { Avatar, Badge, C, Empty, Field, SecTitle, Spinner, card, formatDate, inputStyle, btnStyle } from './UI'

const ROLES = { admin: 'Admin', manager: 'Manager', employee: 'Employee' }

const TS_STATUS_COLOR = {
  draft:     { bg: C.bgTert,  color: C.textSec },
  submitted: { bg: C.amberBg, color: C.amber   },
  approved:  { bg: C.greenBg, color: '#0F6E56' },
  rejected:  { bg: C.redBg,   color: C.red     },
}

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
function EmployeeDetail({ emp: empProp, viewerRole, allEmployees, onBack, onToast }) {
  const [emp,        setEmp]       = useState(empProp)
  const [tab,        setTab]       = useState('profile')
  const [balances,   setBalances]  = useState([])
  const [leaves,     setLeaves]    = useState([])
  const [timesheets, setTimesheets]= useState([])
  const [attendance, setAttendance]= useState([])
  const [salary,     setSalary]    = useState(null)
  const [loading,    setLoading]   = useState(true)
  const [expandedTs, setExpandedTs]= useState(null)
  const [tsEntries,  setTsEntries] = useState({})
  const [editing,    setEditing]   = useState(false)
  const [form,       setForm]      = useState(null)
  const [saving,     setSaving]    = useState(false)

  const isAdmin = viewerRole === 'admin'

  const startEdit = () => {
    setForm({
      phone:         emp.phone         || '',
      employee_code: emp.employee_code || '',
      department:    emp.department    || '',
      designation:   emp.designation   || '',
      role:          emp.role,
      manager_id:    emp.manager_id    || '',
      joining_date:  emp.joining_date  || '',
      is_active:     emp.is_active,
    })
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!form.employee_code.trim()) { onToast?.('Employee code is required', 'error'); return }
    if (!form.joining_date)         { onToast?.('Date of joining is required', 'error'); return }

    const activeOtherAdmins = allEmployees.filter(e => e.role === 'admin' && e.is_active !== false && e.id !== emp.id).length
    if (emp.role === 'admin' && form.role !== 'admin' && activeOtherAdmins === 0) {
      onToast?.('Cannot change role — at least one active admin must remain', 'error')
      return
    }

    setSaving(true)
    const updates = {
      employee_code: form.employee_code.trim(),
      phone:         form.phone.trim() || null,
      department:    form.department.trim() || null,
      designation:   form.designation.trim() || null,
      role:          form.role,
      manager_id:    form.manager_id || null,
      joining_date:  form.joining_date,
      is_active:     form.is_active,
    }
    const { error } = await updateEmployee(emp.id, updates)
    setSaving(false)
    if (error) { onToast?.(error.message || 'Failed to update employee', 'error'); return }

    setEmp(e => ({ ...e, ...updates }))
    setEditing(false)
    onToast?.('Employee updated')
  }

  useEffect(() => {
    setLoading(true)
    const report = (label) => ({ error }) => { if (error) onToast?.(`Failed to load ${label}`, 'error') }
    const calls = [
      fetchLeaveBalance(emp.id).then(r => { report('leave balance')(r); setBalances(r.data || []) }),
      fetchMyLeaves(emp.id).then(r => { report('leave history')(r); setLeaves(r.data || []) }),
      fetchTimesheetHistory(emp.id).then(r => { report('timesheets')(r); setTimesheets(r.data || []) }),
      fetchAttendanceHistory(emp.id, 30).then(r => { report('attendance')(r); setAttendance(r.data || []) }),
    ]
    if (isAdmin) calls.push(fetchSalary(emp.id).then(r => { setSalary(r.data) }))
    Promise.all(calls).finally(() => setLoading(false))
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
        {isAdmin && <TB id="salary" active={tab==='salary'} label="Salary" onClick={() => setTab('salary')} />}
      </div>

      {loading ? <Spinner /> : <>

        {/* ── Profile tab ── */}
        {tab === 'profile' && (
          <div>
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SecTitle>Personal Info</SecTitle>
                {isAdmin && !editing && (
                  <button onClick={startEdit} style={{ ...btnStyle(C.bgSec, C.textSec), padding: '5px 12px', fontSize: 12 }}>
                    Edit
                  </button>
                )}
              </div>

              {!editing ? (
                [
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
                ].map(([label, value]) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '8px 0', borderBottom: `0.5px solid ${C.border}`, gap: 12,
                  }}>
                    <span style={{ fontSize: 13, color: C.textSec, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{value}</span>
                  </div>
                ))
              ) : (
                <div style={{ marginTop: 10 }}>
                  <Field label="Employee Code">
                    <input value={form.employee_code} onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))} style={inputStyle()} />
                  </Field>
                  <Field label="Phone">
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle()} placeholder="+91 98765 43210" />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Department">
                      <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} style={inputStyle()} />
                    </Field>
                    <Field label="Designation">
                      <input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} style={inputStyle()} />
                    </Field>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Role">
                      <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inputStyle()}>
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </Field>
                    <Field label="Date of Joining">
                      <input type="date" value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} style={inputStyle()} />
                    </Field>
                  </div>
                  <Field label="Reporting Manager">
                    <select value={form.manager_id} onChange={e => setForm(f => ({ ...f, manager_id: e.target.value }))} style={inputStyle()}>
                      <option value="">— No manager —</option>
                      {allEmployees.filter(e => e.id !== emp.id && e.role !== 'employee').map(e => (
                        <option key={e.id} value={e.id}>{e.full_name} ({ROLES[e.role]})</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={form.is_active ? 'active' : 'inactive'} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'active' }))} style={inputStyle()}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </Field>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={() => setEditing(false)} disabled={saving} style={{ ...btnStyle(C.bgSec, C.textSec), flex: 1, fontSize: 13 }}>
                      Cancel
                    </button>
                    <button onClick={saveEdit} disabled={saving} style={{ ...btnStyle(C.green, '#fff'), flex: 1, fontSize: 13, opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
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
                const sc = TS_STATUS_COLOR[ts.status] || TS_STATUS_COLOR.draft
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
                      <span style={{ background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
                        {ts.status.charAt(0).toUpperCase() + ts.status.slice(1)}
                      </span>
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

        {/* ── Salary tab (admin only) ── */}
        {tab === 'salary' && isAdmin && (
          <div>
            {!salary ? (
              <Empty text="No salary details on record" />
            ) : (
              <>
                <div style={{ ...card, background: C.greenBg, border: `0.5px solid #9FE1CB`, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      ['Gross',      ['basic_salary','hra','transport_allowance','other_allowances'].reduce((s,k) => s + (parseFloat(salary[k]) || 0), 0), C.green],
                      ['Deductions', ['pf_deduction','tax_deduction','other_deductions'].reduce((s,k) => s + (parseFloat(salary[k]) || 0), 0), C.red],
                      ['Net',        ['basic_salary','hra','transport_allowance','other_allowances'].reduce((s,k) => s + (parseFloat(salary[k]) || 0), 0)
                                   - ['pf_deduction','tax_deduction','other_deductions'].reduce((s,k) => s + (parseFloat(salary[k]) || 0), 0), C.green],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#085041', marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 17, fontWeight: 700, color }}>₹{val.toLocaleString('en-IN')}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <SecTitle>Earnings</SecTitle>
                {[['Basic Salary','basic_salary'],['HRA','hra'],['Transport','transport_allowance'],['Other','other_allowances']].map(([label, key]) => (
                  salary[key] > 0 && (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `0.5px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, color: C.textSec }}>{label}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>₹{parseFloat(salary[key]).toLocaleString('en-IN')}</span>
                    </div>
                  )
                ))}

                <SecTitle style={{ marginTop: 14 }}>Deductions</SecTitle>
                {[['PF Deduction','pf_deduction'],['Tax (TDS)','tax_deduction'],['Other','other_deductions']].map(([label, key]) => (
                  salary[key] > 0 && (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `0.5px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, color: C.textSec }}>{label}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.red }}>₹{parseFloat(salary[key]).toLocaleString('en-IN')}</span>
                    </div>
                  )
                ))}

                <div style={{ fontSize: 11, color: C.textTert, marginTop: 10 }}>
                  Effective from {formatDate(salary.effective_from)}
                </div>
              </>
            )}
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
        viewerRole={viewer.role}
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
        {filtered.length} employee{filtered.length !== 1 ? 's' : ''}
        {viewer.role === 'manager' && ' · Salary details are admin-only'}
      </div>

      {filtered.length === 0 ? <Empty text="No employees found" /> :
        filtered.map(e => {
          const mgr = employees.find(x => x.id === e.manager_id)
          return (
            <div
              key={e.id}
              style={{ ...card, marginBottom: 10, cursor: 'pointer' }}
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
            </div>
          )
        })
      }
    </div>
  )
}
