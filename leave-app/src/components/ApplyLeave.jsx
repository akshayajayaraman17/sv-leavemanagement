import { useEffect, useMemo, useState } from 'react'
import { fetchLeaveBalance, fetchEmployees, applyLeave, applyCompOff, getApproverForEmployee } from '../lib/api'
import { Avatar, Badge, C, Field, SecTitle, Spinner, btnStyle, card, inputStyle, formatDate } from './UI'

function workingDays(from, to) {
  let count = 0, d = new Date(from), end = new Date(to)
  while (d <= end) { const w = d.getDay(); if (w !== 0 && w !== 6) count++; d.setDate(d.getDate() + 1) }
  return count
}
const today = new Date().toISOString().split('T')[0]

// ── Apply Leave ────────────────────────────────────────────────────────────────
export function ApplyLeave({ employee, onToast }) {
  const [balances,  setBalances]  = useState([])
  const [employees, setEmployees] = useState([])
  const [approver,  setApprover]  = useState(null)
  const [form,      setForm]      = useState({ type: 'annual', from: '', to: '', reason: '', half: false })
  const [errs,      setErrs]      = useState({})
  const [loading,   setLoading]   = useState(true)
  const [submitting,setSubmitting]= useState(false)
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    Promise.all([
      fetchLeaveBalance(employee.id),
      fetchEmployees(),
      getApproverForEmployee(employee.id),
    ]).then(([b, e, a]) => {
      setBalances(b.data || [])
      setEmployees(e.data || [])
      const apprId = a.data
      if (apprId) setApprover((e.data || []).find(x => x.id === apprId) || null)
    }).finally(() => setLoading(false))
  }, [employee.id])

  const bal = balances.find(b => b.type_code === form.type)
  const days = useMemo(() => {
    if (!form.from || !form.to || new Date(form.to) < new Date(form.from)) return 0
    return form.half ? 0.5 : workingDays(form.from, form.to)
  }, [form.from, form.to, form.half])

  const validate = () => {
    const e = {}
    if (!form.from)  e.from = 'Required'
    if (!form.to)    e.to   = 'Required'
    if (form.from && form.to && new Date(form.to) < new Date(form.from)) e.to = 'Must be after start'
    if (!form.reason.trim()) e.reason = 'Required'
    if (bal && days > bal.remaining) e.to = `Only ${bal.remaining}d available`
    return e
  }

  const submit = async () => {
    const e = validate(); if (Object.keys(e).length) { setErrs(e); return }
    setSubmitting(true)
    const { error } = await applyLeave({
      employee_id: employee.id,
      leave_type:  form.type,
      from_date:   form.from,
      to_date:     form.to,
      days,
      reason:      form.reason,
      approver_id: approver?.id || null,
    })
    setSubmitting(false)
    if (error) { onToast(error.message, 'error'); return }
    setDone(true)
  }

  if (loading)  return <Spinner />
  if (done) return (
    <div style={{ textAlign: 'center', padding: '56px 0' }}>
      <div style={{ fontSize: 44, color: C.green, marginBottom: 14 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>Request submitted</div>
      <div style={{ fontSize: 13, color: C.textSec, marginBottom: 4 }}>Sent to {approver?.full_name || 'your approver'}</div>
      <div style={{ fontSize: 11, color: C.textTert, marginBottom: 28 }}>You'll be notified once a decision is made</div>
      <button onClick={() => { setDone(false); setForm({ type: 'annual', from: '', to: '', reason: '', half: false }); setErrs({}) }} style={btnStyle(C.green, '#fff')}>Apply Another</button>
    </div>
  )

  return (
    <div>
      {approver && (
        <div style={{ ...card, background: C.bgSec, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar initials={approver.avatar_initials} size={30} color={C.blue} bg={C.blueBg} />
          <div>
            <div style={{ fontSize: 11, color: C.textTert }}>Approver</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{approver.full_name}</div>
          </div>
        </div>
      )}
      <Field label="Leave Type">
        <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle()}>
          {balances.map(b => <option key={b.type_code} value={b.type_code}>{b.label} ({b.remaining} remaining)</option>)}
        </select>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Start Date" error={errs.from}><input type="date" min={today} value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} style={inputStyle(errs.from)} /></Field>
        <Field label="End Date"   error={errs.to}>  <input type="date" min={form.from || today} value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} style={inputStyle(errs.to)} /></Field>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSec, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.half} onChange={e => setForm(f => ({ ...f, half: e.target.checked }))} />
          Half day
        </label>
      </div>
      {days > 0 && (
        <div style={{ background: days > (bal?.remaining || 0) ? C.redBg : C.greenBg, color: days > (bal?.remaining || 0) ? C.red : '#0F6E56', fontSize: 13, fontWeight: 500, padding: '9px 12px', borderRadius: 8, marginBottom: 14 }}>
          {days} working day{days !== 1 ? 's' : ''} · {bal?.remaining ?? '?'} available
        </div>
      )}
      <Field label="Reason" error={errs.reason}>
        <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Brief reason for leave…" style={{ ...inputStyle(errs.reason), resize: 'vertical' }} />
      </Field>
      <button onClick={submit} disabled={submitting} style={{ ...btnStyle(C.green, '#fff'), width: '100%', opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Submitting…' : 'Submit Request'}
      </button>
    </div>
  )
}

// ── Apply Comp Off ─────────────────────────────────────────────────────────────
export function ApplyCompOff({ employee, onToast }) {
  const [employees, setEmployees] = useState([])
  const [approver,  setApprover]  = useState(null)
  const [form,      setForm]      = useState({ workedDate: '', workedHours: '8', reason: '' })
  const [errs,      setErrs]      = useState({})
  const [loading,   setLoading]   = useState(true)
  const [submitting,setSubmitting]= useState(false)
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    Promise.all([fetchEmployees(), getApproverForEmployee(employee.id)]).then(([e, a]) => {
      setEmployees(e.data || [])
      const apprId = a.data
      if (apprId) setApprover((e.data || []).find(x => x.id === apprId) || null)
    }).finally(() => setLoading(false))
  }, [employee.id])

  const hrs = parseFloat(form.workedHours) || 0
  const earnedDays = hrs >= 6 ? 1 : hrs >= 3 ? 0.5 : 0

  const validate = () => {
    const e = {}
    if (!form.workedDate) e.workedDate = 'Required'
    if (!form.workedHours || isNaN(form.workedHours) || hrs < 1 || hrs > 12) e.workedHours = '1–12 hrs'
    if (!form.reason.trim()) e.reason = 'Required'
    return e
  }

  const submit = async () => {
    const e = validate(); if (Object.keys(e).length) { setErrs(e); return }
    setSubmitting(true)
    const { error } = await applyCompOff({
      employee_id:  employee.id,
      worked_date:  form.workedDate,
      worked_hours: hrs,
      earned_days:  earnedDays,
      reason:       form.reason,
      approver_id:  approver?.id || null,
    })
    setSubmitting(false)
    if (error) { onToast(error.message, 'error'); return }
    setDone(true)
  }

  if (loading) return <Spinner />
  if (done) return (
    <div style={{ textAlign: 'center', padding: '56px 0' }}>
      <div style={{ fontSize: 44, color: C.purple, marginBottom: 14 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>Comp off request submitted</div>
      <div style={{ fontSize: 13, color: C.textSec, marginBottom: 28 }}>Pending approval from {approver?.full_name || 'your approver'}</div>
      <button onClick={() => { setDone(false); setForm({ workedDate: '', workedHours: '8', reason: '' }); setErrs({}) }} style={btnStyle(C.purple, '#fff')}>Submit Another</button>
    </div>
  )

  return (
    <div>
      <div style={{ ...card, background: C.purpleBg, border: `0.5px solid #AFA9EC`, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#3C3489', marginBottom: 4 }}>How comp off works</div>
        <div style={{ fontSize: 12, color: '#534AB7', lineHeight: 1.65 }}>Work ≥6 hrs on holiday/weekend earns 1 day. Work 3–5 hrs earns 0.5 days. Balance is credited once approved.</div>
      </div>
      {approver && (
        <div style={{ ...card, background: C.bgSec, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar initials={approver.avatar_initials} size={30} color={C.purple} bg={C.purpleBg} />
          <div>
            <div style={{ fontSize: 11, color: C.textTert }}>Will be approved by</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{approver.full_name}</div>
          </div>
        </div>
      )}
      <Field label="Date Worked (holiday / weekend)" error={errs.workedDate}>
        <input type="date" max={today} value={form.workedDate} onChange={e => setForm(f => ({ ...f, workedDate: e.target.value }))} style={inputStyle(errs.workedDate)} />
      </Field>
      <Field label="Hours Worked" error={errs.workedHours}>
        <input type="number" min={1} max={12} value={form.workedHours} onChange={e => setForm(f => ({ ...f, workedHours: e.target.value }))} style={inputStyle(errs.workedHours)} />
        {hrs >= 1 && !isNaN(hrs) && <div style={{ fontSize: 12, color: C.purple, marginTop: 5 }}>Will earn {earnedDays} comp off day{earnedDays !== 1 ? 's' : ''}</div>}
      </Field>
      <Field label="Work Done / Reason" error={errs.reason}>
        <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Describe the work done…" style={{ ...inputStyle(errs.reason), resize: 'vertical' }} />
      </Field>
      <button onClick={submit} disabled={submitting} style={{ ...btnStyle(C.purple, '#fff'), width: '100%', opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Submitting…' : 'Submit Comp Off Request'}
      </button>
    </div>
  )
}
