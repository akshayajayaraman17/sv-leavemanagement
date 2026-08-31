import { useEffect, useMemo, useState } from 'react'
import { fetchLeaveBalance, fetchEmployees, applyLeave, applyCompOff, getApproverForEmployee, uploadMedicalCertificate, fetchMyCompRequests, fetchHolidays, fetchAttendanceForDate } from '../lib/api'
import { workingDays } from '../lib/leaveDays'
import { Avatar, C, Field, Spinner, btnStyle, card, formatDate, inputStyle } from './UI'

const today = new Date().toISOString().split('T')[0]

// ── Apply Leave ────────────────────────────────────────────────────────────────
export function ApplyLeave({ employee, onToast }) {
  const [balances,  setBalances]  = useState([])
  const [approver,  setApprover]  = useState(null)
  const [holidays,  setHolidays]  = useState(new Set())
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
      fetchHolidays(),
    ]).then(([b, e, a, h]) => {
      const err = b.error || e.error || h.error
      if (err) onToast?.(err.message || 'Failed to load some data', 'error')
      setBalances(b.data || [])
      const apprId = a.data
      if (apprId) setApprover((e.data || []).find(x => x.id === apprId) || null)
      setHolidays(new Set((h.data || []).map(x => x.holiday_date)))
    }).finally(() => setLoading(false))
  }, [employee.id])

  const bal = balances.find(b => b.type_code === form.type)
  const days = useMemo(() => {
    if (!form.from || !form.to || new Date(form.to) < new Date(form.from)) return 0
    return form.half ? 0.5 : workingDays(form.from, form.to, holidays)
  }, [form.from, form.to, form.half, holidays])

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
    if (error) {
      const msg = error.message?.includes('no_overlapping_leave')
        ? 'You already have a pending or approved leave request that overlaps with these dates'
        : error.message
      onToast(msg, 'error')
      return
    }
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
        <Field label="Start Date" error={errs.from}><input type="date" min={today} value={form.from} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, from: v, to: f.half ? v : f.to })) }} style={inputStyle(errs.from)} /></Field>
        <Field label="End Date"   error={errs.to}>  <input type="date" min={form.from || today} value={form.to} disabled={form.half} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} style={inputStyle(errs.to)} /></Field>
      </div>
      <div style={{ marginBottom: form.half ? 4 : 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSec, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.half} onChange={e => {
            const checked = e.target.checked
            setForm(f => ({ ...f, half: checked, to: checked ? f.from : f.to }))
          }} />
          Half day
        </label>
      </div>
      {form.half && (
        <div style={{ fontSize: 11, color: C.amber, marginBottom: 14 }}>
          Half day requests are single-day only — end date was set to match the start date.
        </div>
      )}
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
  const [approver,   setApprover]   = useState(null)
  const [existingReqs, setExisting] = useState([])
  const [holidays,   setHolidays]   = useState(new Set())
  const [form,       setForm]       = useState({ workedDate: '', reason: '' })
  const [attendance, setAttendance] = useState(null)   // attendance record for selected date
  const [attLoading, setAttLoading] = useState(false)
  const [checks,     setChecks]     = useState([])     // live validation checklist
  const [errs,       setErrs]       = useState({})
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done,       setDone]       = useState(false)

  useEffect(() => {
    Promise.all([
      fetchEmployees(),
      getApproverForEmployee(employee.id),
      fetchMyCompRequests(employee.id),
      fetchHolidays(),
    ]).then(([e, a, cr, h]) => {
      const err = e.error || cr.error || h.error
      if (err) onToast?.(err.message || 'Failed to load some data', 'error')
      setExisting(cr.data || [])
      const apprId = a.data
      if (apprId) setApprover((e.data || []).find(x => x.id === apprId) || null)
      setHolidays(new Set((h.data || []).map(x => x.holiday_date)))
    }).finally(() => setLoading(false))
  }, [employee.id])

  // Live validation checklist — computed all at once (not one message at a
  // time) so the user sees every criterion simultaneously. The first three
  // checks are synchronous; the attendance check only runs once they pass.
  useEffect(() => {
    if (!form.workedDate) { setAttendance(null); setChecks([]); return }
    let cancelled = false

    const d = new Date(form.workedDate + 'T12:00:00')
    const dayOfWeek = d.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isPast = form.workedDate < today
    const isHolidayOrWeekend = isWeekend || holidays.has(form.workedDate)
    const isDuplicate = existingReqs.some(r => r.worked_date === form.workedDate && r.status !== 'rejected')
    const dateLabel = formatDate(form.workedDate)

    const baseChecks = [
      { key: 'past', ok: isPast,
        text: isPast ? `${dateLabel} is in the past` : `${dateLabel} must be in the past` },
      { key: 'weekend', ok: isHolidayOrWeekend,
        text: isHolidayOrWeekend
          ? `${dateLabel} was a ${isWeekend ? (dayOfWeek === 0 ? 'Sunday' : 'Saturday') : 'company holiday'}`
          : `${dateLabel} is a weekday — comp-off requires a weekend or holiday` },
      { key: 'duplicate', ok: !isDuplicate,
        text: isDuplicate ? 'A comp-off request already exists for this date' : 'No existing comp-off request for this date' },
    ]

    const canCheckAttendance = isPast && isHolidayOrWeekend && !isDuplicate
    setAttendance(null)
    setAttLoading(canCheckAttendance)
    setChecks([...baseChecks, { key: 'attendance', ok: false, text: canCheckAttendance ? 'Checking attendance…' : 'Attendance is checked once the above pass' }])

    if (!canCheckAttendance) return

    fetchAttendanceForDate(employee.id, form.workedDate).then(({ data: att }) => {
      if (cancelled) return
      let ok = false, text
      if (!att || !att.check_in_time)                                text = 'No check-in record found for this date'
      else if (!att.check_out_time)                                  text = 'No check-out record found — both check-in and check-out are required'
      else if (att.status === 'absent' || att.status === 'incomplete') text = `Attendance is marked as ${att.status}`
      else if ((att.total_hours || 0) < 8)                           text = `Only ${(att.total_hours || 0).toFixed(1)}h logged — minimum 8 hours required`
      else { ok = true; text = `Attendance verified: ${att.total_hours.toFixed(1)}h logged` }

      setChecks([...baseChecks, { key: 'attendance', ok, text }])
      setAttendance(ok ? att : null)
      setAttLoading(false)
    })

    return () => { cancelled = true }
  }, [form.workedDate, holidays, existingReqs])

  const earnedDays = attendance ? (attendance.total_hours >= 8 ? 1 : 0) : 0

  const validate = () => {
    const e = {}
    if (!form.workedDate) e.workedDate = 'Required'
    if (!attendance) e.workedDate = 'All checks above must pass before submitting'
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
      <button onClick={() => { setDone(false); setForm({ workedDate: '', reason: '' }); setAttendance(null); setChecks([]); setErrs({}); setExisting(prev => prev) }} style={btnStyle(C.purple, '#fff')}>Submit Another</button>
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

      {/* Live validation checklist — every criterion shown at once */}
      {checks.length > 0 && (
        <div style={{ ...card, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {checks.map(c => (
            <div key={c.key} style={{ fontSize: 13, fontWeight: 600, color: c.ok ? C.green : C.red }}>
              {c.ok ? '✓' : '✕'} {c.text}
            </div>
          ))}
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
