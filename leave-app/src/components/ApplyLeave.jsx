import { useEffect, useMemo, useState } from 'react'
import { fetchLeaveBalance, fetchEmployees, applyLeave, applyCompOff, getApproverForEmployee, uploadMedicalCertificate, fetchMyCompRequests } from '../lib/api'
import { supabase } from '../lib/supabase'
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
  const [certificate, setCertificate] = useState(null)
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

  const isSick = form.type === 'sick'

  const validate = () => {
    const e = {}
    if (!form.from)  e.from = 'Required'
    if (!form.to)    e.to   = 'Required'
    if (form.from && form.to && new Date(form.to) < new Date(form.from)) e.to = 'Must be after start'
    if (!form.reason.trim()) e.reason = 'Required'
    if (bal && days > bal.remaining) e.to = `Only ${bal.remaining}d available`
    if (isSick && !certificate) e.certificate = 'Medical certificate is required for sick leave'
    return e
  }

  const submit = async () => {
    const e = validate(); if (Object.keys(e).length) { setErrs(e); return }
    setSubmitting(true)

    let certUrl = null
    if (isSick && certificate) {
      const { url, error: uploadErr } = await uploadMedicalCertificate(employee.id, certificate)
      if (uploadErr) { onToast('Failed to upload certificate: ' + uploadErr.message, 'error'); setSubmitting(false); return }
      certUrl = url
    }

    const { error } = await applyLeave({
      employee_id:              employee.id,
      leave_type:               form.type,
      from_date:                form.from,
      to_date:                  form.to,
      days,
      reason:                   form.reason,
      approver_id:              approver?.id || null,
      medical_certificate_url:  certUrl,
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

      {isSick && (
        <Field label="Medical Certificate" error={errs.certificate}>
          <div style={{
            border: `1.5px dashed ${errs.certificate ? '#E24B4A' : certificate ? C.green : C.borderMed}`,
            borderRadius: 8, padding: '14px 12px', background: certificate ? C.greenBg : C.bg,
            cursor: 'pointer', textAlign: 'center',
          }}
            onClick={() => document.getElementById('cert-upload').click()}
          >
            {certificate ? (
              <div style={{ fontSize: 13, color: C.green, fontWeight: 500 }}>
                ✓ {certificate.name}
                <button
                  onClick={e => { e.stopPropagation(); setCertificate(null) }}
                  style={{ marginLeft: 10, background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 14 }}
                >×</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 22, marginBottom: 6 }}>📎</div>
                <div style={{ fontSize: 13, color: C.textSec, fontWeight: 500 }}>Click to upload certificate</div>
                <div style={{ fontSize: 11, color: C.textTert, marginTop: 3 }}>PDF, JPG or PNG · Max 5MB</div>
              </>
            )}
          </div>
          <input
            id="cert-upload"
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (!f) return
              if (f.size > 5 * 1024 * 1024) { onToast('File must be under 5MB', 'error'); return }
              setCertificate(f)
              setErrs(p => ({ ...p, certificate: undefined }))
            }}
          />
          <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>
            * Medical certificate is mandatory for sick leave
          </div>
        </Field>
      )}

      <button onClick={submit} disabled={submitting} style={{ ...btnStyle(C.green, '#fff'), width: '100%', opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Submitting…' : 'Submit Request'}
      </button>
    </div>
  )
}

// ── Apply Comp Off ─────────────────────────────────────────────────────────────
export function ApplyCompOff({ employee, onToast }) {
  const [employees,  setEmployees]  = useState([])
  const [approver,   setApprover]   = useState(null)
  const [existingReqs, setExisting] = useState([])
  const [form,       setForm]       = useState({ workedDate: '', reason: '' })
  const [attendance, setAttendance] = useState(null)   // attendance record for selected date
  const [attLoading, setAttLoading] = useState(false)
  const [attError,   setAttError]   = useState('')
  const [errs,       setErrs]       = useState({})
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done,       setDone]       = useState(false)

  useEffect(() => {
    Promise.all([
      fetchEmployees(),
      getApproverForEmployee(employee.id),
      fetchMyCompRequests(employee.id),
    ]).then(([e, a, cr]) => {
      setEmployees(e.data || [])
      setExisting(cr.data || [])
      const apprId = a.data
      if (apprId) setApprover((e.data || []).find(x => x.id === apprId) || null)
    }).finally(() => setLoading(false))
  }, [employee.id])

  // Auto-validate attendance when date changes
  useEffect(() => {
    if (!form.workedDate) { setAttendance(null); setAttError(''); return }
    const validateDate = async () => {
      setAttLoading(true)
      setAttError('')
      setAttendance(null)

      // Check if date is in the past
      if (form.workedDate >= today) {
        setAttError('Comp-off can only be requested for past dates')
        setAttLoading(false)
        return
      }

      // Check if date is a weekend (Sat/Sun)
      const d = new Date(form.workedDate + 'T12:00:00')
      const dayOfWeek = d.getDay()
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        setAttError('Comp-off is only for work done on weekends or holidays')
        setAttLoading(false)
        return
      }

      // Check for duplicate request
      const isDuplicate = existingReqs.some(r =>
        r.worked_date === form.workedDate && r.status !== 'rejected'
      )
      if (isDuplicate) {
        setAttError('A comp-off request already exists for this date')
        setAttLoading(false)
        return
      }

      // Fetch attendance for that date
      const { data: att } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('date', form.workedDate)
        .maybeSingle()

      if (!att || !att.check_in_time) {
        setAttError('No check-in record found for this date. You must have valid attendance.')
        setAttLoading(false)
        return
      }

      if (!att.check_out_time) {
        setAttError('No check-out record found. Both check-in and check-out are required.')
        setAttLoading(false)
        return
      }

      if (att.status === 'absent' || att.status === 'incomplete') {
        setAttError('Attendance is marked as ' + att.status + '. Cannot apply comp-off.')
        setAttLoading(false)
        return
      }

      if ((att.total_hours || 0) < 8) {
        setAttError(`Only ${att.total_hours?.toFixed(1) || 0}h logged. Minimum 8 hours required for comp-off.`)
        setAttLoading(false)
        return
      }

      setAttendance(att)
      setAttLoading(false)
    }
    validateDate()
  }, [form.workedDate])

  const earnedDays = attendance ? (attendance.total_hours >= 8 ? 1 : 0) : 0

  const validate = () => {
    const e = {}
    if (!form.workedDate) e.workedDate = 'Required'
    if (!attendance) e.workedDate = attError || 'Invalid date'
    if (!form.reason.trim()) e.reason = 'Required'
    return e
  }

  const submit = async () => {
    const e = validate(); if (Object.keys(e).length) { setErrs(e); return }
    setSubmitting(true)
    const { error } = await applyCompOff({
      employee_id:  employee.id,
      worked_date:  form.workedDate,
      worked_hours: attendance.total_hours,
      earned_days:  earnedDays,
      reason:       form.reason,
      approver_id:  approver?.id || null,
    })
    setSubmitting(false)
    if (error) {
      const msg = error.message || (typeof error === 'string' ? error : 'Failed to submit')
      onToast(msg, 'error')
      return
    }
    setDone(true)
  }

  if (loading) return <Spinner />
  if (done) return (
    <div style={{ textAlign: 'center', padding: '56px 0' }}>
      <div style={{ fontSize: 44, color: C.purple, marginBottom: 14 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>Comp off request submitted</div>
      <div style={{ fontSize: 13, color: C.textSec, marginBottom: 28 }}>Pending approval from {approver?.full_name || 'your approver'}</div>
      <button onClick={() => { setDone(false); setForm({ workedDate: '', reason: '' }); setAttendance(null); setErrs({}); setExisting(prev => prev) }} style={btnStyle(C.purple, '#fff')}>Submit Another</button>
    </div>
  )

  const formatTime = ts => ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'

  return (
    <div>
      <div style={{ ...card, background: C.purpleBg, border: `0.5px solid #AFA9EC`, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#3C3489', marginBottom: 4 }}>Comp-Off Policy</div>
        <div style={{ fontSize: 12, color: '#534AB7', lineHeight: 1.65 }}>
          Work 8+ hours on a weekend/holiday to earn 1 comp-off day. Attendance with valid check-in/check-out is required. System will auto-validate your attendance record.
        </div>
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
      <Field label="Date Worked (weekend / holiday)" error={errs.workedDate}>
        <input type="date" max={today} value={form.workedDate} onChange={e => { setForm(f => ({ ...f, workedDate: e.target.value })); setErrs({}); }} style={inputStyle(errs.workedDate)} />
      </Field>

      {/* Attendance validation feedback */}
      {attLoading && (
        <div style={{ background: C.bgSec, borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: C.textSec }}>
          Validating attendance...
        </div>
      )}
      {attError && !attLoading && form.workedDate && (
        <div style={{ background: C.redBg, color: C.red, fontSize: 12, padding: '10px 12px', borderRadius: 8, marginBottom: 14 }}>
          {attError}
        </div>
      )}
      {attendance && !attLoading && (
        <div style={{ background: C.greenBg, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#0F6E56', fontWeight: 600, marginBottom: 6 }}>✓ Attendance Verified</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: '#0F6E56' }}>Check In</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F6E56' }}>{formatTime(attendance.check_in_time)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#0F6E56' }}>Check Out</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F6E56' }}>{formatTime(attendance.check_out_time)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#0F6E56' }}>Total Hours</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F6E56' }}>{attendance.total_hours?.toFixed(1)}h</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#0F6E56', marginTop: 8, fontWeight: 500 }}>
            Will earn {earnedDays} comp-off day{earnedDays !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      <Field label="Work Done / Reason" error={errs.reason}>
        <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Describe the work done on that day…" style={{ ...inputStyle(errs.reason), resize: 'vertical' }} />
      </Field>
      <button
        onClick={submit}
        disabled={submitting || !attendance}
        style={{ ...btnStyle(C.purple, '#fff'), width: '100%', opacity: (submitting || !attendance) ? 0.5 : 1 }}
      >
        {submitting ? 'Submitting…' : 'Submit Comp Off Request'}
      </button>
    </div>
  )
}
