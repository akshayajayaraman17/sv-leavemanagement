import { useEffect, useMemo, useState } from 'react'
import {
  fetchLeaveBalance, fetchEmployees, applyLeave, applyCompOff, getApproverForEmployee,
  uploadMedicalCertificate, fetchMyCompRequests, fetchHolidays, fetchAttendanceForDate,
} from '../lib/api'
import { workingDays } from '../lib/leaveDays'
import { Avatar, Btn, C, Field, Mono, Panel, Spinner, card, formatDate, inputStyle } from './UI'

const today = new Date().toISOString().split('T')[0]
const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'

const TYPE_TONE = { annual: '#3a76ad', sick: '#3a76ad', comp: '#c2882a' }

function ApproverCard({ approver, verb = 'Approver' }) {
  if (!approver) return null
  return (
    <div style={{ ...card, background: C.bgSec, display: 'flex', alignItems: 'center', gap: 10, padding: 14 }}>
      <Avatar initials={approver.avatar_initials} size={30} bg={C.navyBg} color={C.navy} />
      <div>
        <div style={{ fontSize: 10.5, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{verb}</div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{approver.full_name}</div>
      </div>
    </div>
  )
}

function Done({ tone, title, sub, onAgain, againLabel }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 0' }}>
      <div style={{ fontSize: 40, color: tone, marginBottom: 12 }}>✓</div>
      <div style={{ fontFamily: C.serif, fontSize: 22, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 24 }}>{sub}</div>
      <Btn onClick={onAgain}>{againLabel}</Btn>
    </div>
  )
}

// ── Apply Leave ────────────────────────────────────────────────────────────────
export function ApplyLeave({ employee, onToast }) {
  const [balances, setBalances]   = useState([])
  const [approver, setApprover]   = useState(null)
  const [holidays, setHolidays]   = useState(new Set())
  const [form, setForm]           = useState({ type: 'annual', from: '', to: '', reason: '', half: false })
  const [certificate, setCertificate] = useState(null)
  const [errs, setErrs]           = useState({})
  const [loading, setLoading]     = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]           = useState(false)

  useEffect(() => {
    Promise.all([
      fetchLeaveBalance(employee.id), fetchEmployees(),
      getApproverForEmployee(employee.id), fetchHolidays(),
    ]).then(([b, e, a, h]) => {
      const err = b.error || e.error || h.error
      if (err) onToast?.(err.message || 'Failed to load some data', 'error')
      setBalances(b.data || [])
      if (a.data) setApprover((e.data || []).find(x => x.id === a.data) || null)
      setHolidays(new Set((h.data || []).map(x => x.holiday_date)))
    }).finally(() => setLoading(false))
  }, [employee.id])

  const bal = balances.find(b => b.type_code === form.type)
  const isSick = form.type === 'sick'
  const days = useMemo(() => {
    if (!form.from || !form.to || new Date(form.to) < new Date(form.from)) return 0
    return form.half ? 0.5 : workingDays(form.from, form.to, holidays)
  }, [form.from, form.to, form.half, holidays])
  const over = bal && days > bal.remaining

  const validate = () => {
    const e = {}
    if (!form.from) e.from = 'Required'
    if (!form.to)   e.to = 'Required'
    if (form.from && form.to && new Date(form.to) < new Date(form.from)) e.to = 'Must be after start'
    if (!form.reason.trim()) e.reason = 'Required'
    if (over) e.to = `Only ${bal.remaining}d available`
    if (isSick && !certificate) e.certificate = 'Medical certificate is required for medical leave'
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
      employee_id: employee.id, leave_type: form.type,
      from_date: form.from, to_date: form.to, days, reason: form.reason,
      approver_id: approver?.id || null, medical_certificate_url: certUrl,
    })
    setSubmitting(false)
    if (error) {
      const msg = error.message?.includes('no_overlapping_leave')
        ? 'You already have a pending or approved leave request that overlaps these dates'
        : error.message
      onToast(msg, 'error'); return
    }
    setDone(true)
  }

  if (loading) return <Spinner />
  if (done) return <Done tone={C.green} title="Request submitted"
    sub={`Sent to ${approver?.full_name || 'your approver'} — you'll be notified once decided.`}
    againLabel="Apply another"
    onAgain={() => { setDone(false); setForm({ type: 'annual', from: '', to: '', reason: '', half: false }); setCertificate(null); setErrs({}) }} />

  return (
    <div className="split-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ ...card, padding: 24 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, marginBottom: 12 }}>Leave type</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
          {balances.map(b => {
            const on = b.type_code === form.type
            const disabled = b.type_code === 'comp' && b.remaining <= 0
            return (
              <button key={b.type_code} disabled={disabled}
                onClick={() => setForm(f => ({ ...f, type: b.type_code }))}
                style={{
                  textAlign: 'left', border: `1px solid ${on ? C.navy : C.line}`, background: on ? '#f4f8fd' : '#fff',
                  borderRadius: 10, padding: '13px 14px', cursor: disabled ? 'not-allowed' : 'pointer',
                  boxShadow: on ? `inset 0 0 0 1px ${C.navy}` : 'none', fontFamily: 'inherit',
                  opacity: disabled ? 0.55 : 1,
                }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{b.label}</div>
                <div style={{ fontFamily: C.mono, fontSize: 11.5, color: on ? '#2a5c8a' : C.muted, marginTop: 4 }}>{b.remaining} remaining</div>
              </button>
            )
          })}
        </div>

        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '24px 0 12px' }}>Dates</div>
        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="From" error={errs.from}>
            <input type="date" min={today} value={form.from}
              onChange={e => { const v = e.target.value; setForm(f => ({ ...f, from: v, to: f.half ? v : f.to })) }}
              style={inputStyle(errs.from)} />
          </Field>
          <Field label="To" error={errs.to}>
            <input type="date" min={form.from || today} value={form.to} disabled={form.half}
              onChange={e => setForm(f => ({ ...f, to: e.target.value }))} style={inputStyle(errs.to)} />
          </Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.body, cursor: 'pointer', marginBottom: form.half ? 6 : 4 }}>
          <input type="checkbox" checked={form.half} style={{ width: 13, height: 13, accentColor: C.navy, margin: 0 }}
            onChange={e => { const c = e.target.checked; setForm(f => ({ ...f, half: c, to: c ? f.from : f.to })) }} />
          Half day
        </label>
        {form.half && <div style={{ fontSize: 11, color: '#8a6a22', marginBottom: 10 }}>Half-day requests are single-day only — end date matches the start.</div>}

        <Field label="Reason" error={errs.reason} style={{ marginTop: 6 }}>
          <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            placeholder="Short context for your approver"
            style={{ ...inputStyle(errs.reason), resize: 'vertical', minHeight: 84 }} />
        </Field>

        {isSick && (
          <Field label="Medical certificate" error={errs.certificate}>
            <div
              onClick={() => document.getElementById('cert-upload').click()}
              style={{
                border: `1.5px dashed ${errs.certificate ? '#c9564a' : certificate ? C.green : '#c8d3e0'}`,
                borderRadius: 10, padding: '14px 12px', background: certificate ? C.greenBg : '#fff',
                cursor: 'pointer', textAlign: 'center',
              }}>
              {certificate ? (
                <div style={{ fontSize: 13, color: '#1f7350', fontWeight: 500 }}>
                  ✓ {certificate.name}
                  <button onClick={e => { e.stopPropagation(); setCertificate(null) }} style={{ marginLeft: 10, background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>Click to upload certificate</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>PDF, JPG or PNG · max 5MB · required for medical leave</div>
                </>
              )}
            </div>
            <input id="cert-upload" type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]; if (!f) return
                if (f.size > 5 * 1024 * 1024) { onToast('File must be under 5MB', 'error'); return }
                setCertificate(f); setErrs(p => ({ ...p, certificate: undefined }))
              }} />
          </Field>
        )}
      </div>

      {/* Summary sidebar */}
      <div style={{ ...card, padding: 22, position: 'sticky', top: 24 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted }}>Request summary</div>
        <div style={{ fontFamily: C.serif, fontSize: 30, lineHeight: 1.15, marginTop: 10 }}>
          {days > 0 ? `${days} day${days !== 1 ? 's' : ''}` : '—'}
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
          {form.from && form.to ? `${formatDate(form.from)} – ${formatDate(form.to)}` : 'Pick your dates'}
        </div>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
          {[
            ['Type', bal?.label || '—'],
            ['Working days', <Mono key="d">{days || 0}</Mono>],
            ['Approver', approver?.full_name || '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 12.5 }}>
              <span style={{ color: C.sub }}>{k}</span>
              <span style={{ color: C.body, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>

        {days > 0 && bal && (
          <div style={{
            marginTop: 16, padding: '12px 14px', borderRadius: 10,
            background: over ? C.redBg : '#f4f8fd', border: `1px solid ${over ? C.redLine : '#d9e6f3'}`,
            fontSize: 12, color: over ? C.red : '#2a5c8a', lineHeight: 1.55,
          }}>
            {over
              ? `This exceeds your ${bal.label.toLowerCase()} balance — only ${bal.remaining} day${bal.remaining !== 1 ? 's' : ''} left.`
              : <>{bal.label} balance goes from <strong>{bal.remaining}</strong> to <strong>{bal.remaining - days}</strong> days.</>}
          </div>
        )}

        <Btn full disabled={submitting} onClick={submit} style={{ marginTop: 16 }}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </Btn>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: C.muted, marginTop: 9 }}>
          Goes to {approver?.full_name?.split(' ')[0] || 'your approver'} for approval
        </div>
      </div>
    </div>
  )
}

// ── Apply Comp Off ─────────────────────────────────────────────────────────────
export function ApplyCompOff({ employee, onToast }) {
  const [approver, setApprover]     = useState(null)
  const [existingReqs, setExisting] = useState([])
  const [holidays, setHolidays]     = useState(new Set())
  const [form, setForm]             = useState({ workedDate: '', reason: '' })
  const [attendance, setAttendance] = useState(null)
  const [attLoading, setAttLoading] = useState(false)
  const [checks, setChecks]         = useState([])
  const [errs, setErrs]             = useState({})
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)

  useEffect(() => {
    Promise.all([
      fetchEmployees(), getApproverForEmployee(employee.id),
      fetchMyCompRequests(employee.id), fetchHolidays(),
    ]).then(([e, a, cr, h]) => {
      const err = e.error || cr.error || h.error
      if (err) onToast?.(err.message || 'Failed to load some data', 'error')
      setExisting(cr.data || [])
      if (a.data) setApprover((e.data || []).find(x => x.id === a.data) || null)
      setHolidays(new Set((h.data || []).map(x => x.holiday_date)))
    }).finally(() => setLoading(false))
  }, [employee.id])

  useEffect(() => {
    if (!form.workedDate) { setAttendance(null); setChecks([]); return }
    let cancelled = false
    const d = new Date(form.workedDate + 'T12:00:00')
    const dow = d.getDay()
    const isWeekend = dow === 0 || dow === 6
    const isPast = form.workedDate < today
    const isHolOrWknd = isWeekend || holidays.has(form.workedDate)
    const isDup = existingReqs.some(r => r.worked_date === form.workedDate && r.status !== 'rejected')
    const label = formatDate(form.workedDate)

    const base = [
      { key: 'past', ok: isPast, text: isPast ? `${label} is in the past` : `${label} must be in the past` },
      { key: 'weekend', ok: isHolOrWknd, text: isHolOrWknd
        ? `${label} was a ${isWeekend ? (dow === 0 ? 'Sunday' : 'Saturday') : 'company holiday'}`
        : `${label} is a weekday — comp-off requires a weekend or holiday` },
      { key: 'dup', ok: !isDup, text: isDup ? 'A comp-off request already exists for this date' : 'No existing comp-off request for this date' },
    ]
    const canCheck = isPast && isHolOrWknd && !isDup
    setAttendance(null); setAttLoading(canCheck)
    setChecks([...base, { key: 'att', ok: false, text: canCheck ? 'Checking attendance…' : 'Attendance is checked once the above pass' }])
    if (!canCheck) return

    fetchAttendanceForDate(employee.id, form.workedDate).then(({ data: att }) => {
      if (cancelled) return
      let ok = false, text
      if (!att || !att.check_in_time)                                    text = 'No check-in record found for this date'
      else if (!att.check_out_time)                                      text = 'No check-out record — both check-in and check-out are required'
      else if (att.status === 'absent' || att.status === 'incomplete')   text = `Attendance is marked as ${att.status}`
      else if ((att.total_hours || 0) < 8)                               text = `Only ${(att.total_hours || 0).toFixed(1)}h logged — minimum 8 hours required`
      else { ok = true; text = `Attendance verified: ${att.total_hours.toFixed(1)}h logged` }
      setChecks([...base, { key: 'att', ok, text }])
      setAttendance(ok ? att : null)
      setAttLoading(false)
    })
    return () => { cancelled = true }
  }, [form.workedDate, holidays, existingReqs])

  const earnedDays = attendance ? (attendance.total_hours >= 8 ? 1 : 0) : 0

  const submit = async () => {
    const e = {}
    if (!attendance) e.workedDate = 'All checks above must pass before submitting'
    if (!form.reason.trim()) e.reason = 'Required'
    if (Object.keys(e).length) { setErrs(e); return }
    setSubmitting(true)
    const { error } = await applyCompOff({
      employee_id: employee.id, worked_date: form.workedDate,
      worked_hours: attendance.total_hours, earned_days: earnedDays,
      reason: form.reason, approver_id: approver?.id || null,
    })
    setSubmitting(false)
    if (error) { onToast(error.message || (typeof error === 'string' ? error : 'Failed to submit'), 'error'); return }
    setDone(true)
  }

  if (loading) return <Spinner />
  if (done) return <Done tone={C.purple} title="Comp off request submitted"
    sub={`Pending approval from ${approver?.full_name || 'your approver'}.`}
    againLabel="Submit another"
    onAgain={() => { setDone(false); setForm({ workedDate: '', reason: '' }); setAttendance(null); setChecks([]); setErrs({}) }} />

  return (
    <div className="split-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ ...card, padding: 24 }}>
        <div style={{
          background: C.purpleBg, border: `1px solid ${C.purpleLine}`, borderRadius: 10,
          padding: '13px 15px', marginBottom: 18, fontSize: 12, color: '#4a41a8', lineHeight: 1.6,
        }}>
          Work 8+ hours on a weekend or company holiday, with valid check-in and check-out, to earn 1 comp-off day. Your attendance record is validated automatically.
        </div>
        <ApproverCard approver={approver} verb="Will be approved by" />

        <Field label="Date worked (weekend / holiday)" error={errs.workedDate} style={{ marginTop: 16 }}>
          <input type="date" max={today} value={form.workedDate}
            onChange={e => { setForm(f => ({ ...f, workedDate: e.target.value })); setErrs({}) }}
            style={inputStyle(errs.workedDate)} />
        </Field>

        {checks.length > 0 && (
          <div style={{ ...card, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6, padding: 14 }}>
            {checks.map(c => (
              <div key={c.key} style={{ fontSize: 13, fontWeight: 500, color: c.ok ? '#1f7350' : c.text.includes('Checking') ? C.sub : C.red }}>
                {c.ok ? '✓' : c.text.includes('Checking') ? '…' : '✕'} {c.text}
              </div>
            ))}
          </div>
        )}

        {attendance && !attLoading && (
          <div style={{ background: C.greenBg, border: `1px solid ${C.greenLine}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, color: '#1f7350', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Attendance verified</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[['Check in', fmtTime(attendance.check_in_time)], ['Check out', fmtTime(attendance.check_out_time)], ['Total', `${attendance.total_hours?.toFixed(1)}h`]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: '#1f7350' }}>{k}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 500, color: '#1f7350' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Field label="What did you work on?" error={errs.reason}>
          <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            placeholder="One or two lines your manager can approve against"
            style={{ ...inputStyle(errs.reason), resize: 'vertical', minHeight: 90 }} />
        </Field>
      </div>

      <div style={{ ...card, padding: 22, position: 'sticky', top: 24 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted }}>You will earn</div>
        <div style={{ fontFamily: C.serif, fontSize: 30, lineHeight: 1.15, marginTop: 10 }}>
          {attendance ? `${earnedDays} day${earnedDays !== 1 ? 's' : ''}` : 'Nothing yet'}
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
          {attendance ? `For ${formatDate(form.workedDate)} · ${attendance.total_hours?.toFixed(1)}h` : 'Pick an eligible day on the left'}
        </div>
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
          {[
            ['Day worked', attendance ? formatDate(form.workedDate) : '—'],
            ['Hours logged', attendance ? `${attendance.total_hours?.toFixed(1)}h` : '—'],
            ['Comp off balance', attendance ? `+${earnedDays} day` : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 12.5 }}>
              <span style={{ color: C.sub }}>{k}</span><span style={{ color: C.body }}>{v}</span>
            </div>
          ))}
        </div>
        <Btn full disabled={submitting || !attendance} onClick={submit} style={{ marginTop: 16, background: C.purple }}>
          {submitting ? 'Submitting…' : 'Request comp off'}
        </Btn>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: C.muted, marginTop: 9 }}>
          {approver?.full_name?.split(' ')[0] || 'Your approver'} approves comp off requests
        </div>
      </div>
    </div>
  )
}
