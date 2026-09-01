import { useEffect, useMemo, useState } from 'react'
import {
  fetchLeaveBalance, fetchEmployees, applyLeave, applyCompOff, getApproverForEmployee,
  uploadMedicalCertificate, fetchMyCompRequests, fetchHolidays, fetchAttendanceHistory,
  fetchAttendanceForDate, checkIn,
} from '../lib/api'
import { workingDays } from '../lib/leaveDays'
import { Btn, C, Field, Mono, Segmented, Spinner, SELF_REPORTED_TAG, card, formatDate, inputStyle } from './UI'

const today = new Date().toISOString().split('T')[0]

// ── Inline range calendar (Apply for leave) ───────────────────────────────────
const CAL_DOWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseISO = s => new Date(s + 'T12:00:00')
const fmtPill = s => s ? parseISO(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'
const calNav = { width: 24, height: 24, border: `1px solid ${C.line}`, background: '#fff', borderRadius: 6, color: '#78859a', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }
const datePill = { border: '1px solid #d9e6f3', background: '#f4f8fd', borderRadius: 9, padding: '9px 14px', minWidth: 92 }

function RangeCalendar({ from, to, minDate, single, onPick }) {
  const init = from ? parseISO(from) : new Date()
  const [view, setView] = useState(new Date(init.getFullYear(), init.getMonth(), 1))
  const y = view.getFullYear(), m = view.getMonth()
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7
  const gridStart = new Date(y, m, 1 - startDow)
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d })

  return (
    <div style={{ marginTop: 16, border: '1px solid #eaeff6', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{view.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setView(new Date(y, m - 1, 1))} style={calNav}>‹</button>
          <button type="button" onClick={() => setView(new Date(y, m + 1, 1))} style={calNav}>›</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4, marginBottom: 6 }}>
        {CAL_DOWS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.faint }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4 }}>
        {cells.map((d, i) => {
          const ds = isoOf(d)
          const inMonth = d.getMonth() === m
          const disabled = !inMonth || (minDate && ds < minDate)
          const onlyFrom = from && !to && ds === from
          const inRange = from && to && ds >= from && ds <= to && !single
          const on = inRange || onlyFrom || (single && ds === from)
          const radius = !on ? 8
            : (ds === from && ds === to) || onlyFrom || single ? 8
              : ds === from ? '8px 0 0 8px'
                : ds === to ? '0 8px 8px 0' : 0
          return (
            <div key={i} onClick={() => !disabled && onPick(ds)}
              style={{
                height: 32, borderRadius: radius,
                background: on ? C.navy : 'transparent',
                color: !inMonth ? 'transparent' : disabled ? C.faint : on ? '#fff' : C.body,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: C.mono, fontSize: 12, cursor: disabled ? 'default' : 'pointer',
              }}>
              {inMonth ? d.getDate() : ''}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Apply (leave + comp off in one screen) ────────────────────────────────────
export function Apply({ employee, onToast }) {
  const [mode, setMode] = useState('leave')
  return (
    <div>
      <Segmented
        items={[{ id: 'leave', label: 'Leave request' }, { id: 'comp', label: 'Comp off' }]}
        value={mode} onChange={setMode} style={{ marginBottom: 18 }}
      />
      {mode === 'leave'
        ? <ApplyLeave employee={employee} onToast={onToast} />
        : <ApplyCompOff employee={employee} onToast={onToast} />}
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

  const pickDate = (ds) => {
    setErrs({})
    if (form.half) { setForm(f => ({ ...f, from: ds, to: ds })); return }
    setForm(f => {
      if (!f.from || (f.from && f.to)) return { ...f, from: ds, to: '' }
      if (ds < f.from) return { ...f, from: ds, to: '' }
      return { ...f, to: ds }
    })
  }

  return (
    <div className="split-narrow" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ ...card, padding: '24px 26px' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={datePill}>
            <div style={{ fontSize: 10.5, color: '#78859a' }}>From</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>{fmtPill(form.from)}</div>
          </div>
          <span style={{ color: '#b3bdcb' }}>→</span>
          <div style={datePill}>
            <div style={{ fontSize: 10.5, color: '#78859a' }}>To</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>{fmtPill(form.to)}</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 6, fontSize: 12.5, color: C.body, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.half} style={{ width: 13, height: 13, accentColor: C.navy, margin: 0 }}
              onChange={e => { const c = e.target.checked; setForm(f => ({ ...f, half: c, to: c ? f.from : f.to })) }} />
            Half day
          </label>
        </div>
        {(errs.from || errs.to) && <div style={{ fontSize: 11.5, color: '#c9564a', marginTop: 6 }}>{errs.from || errs.to}</div>}
        {form.half && <div style={{ fontSize: 11, color: '#8a6a22', marginTop: 6 }}>Half-day requests are single-day only — pick one date below.</div>}

        <RangeCalendar from={form.from} to={form.to} minDate={today} single={form.half} onPick={pickDate} />

        <Field label="Reason" error={errs.reason} style={{ marginTop: 20 }}>
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
  const [candidates, setCandidates] = useState([])
  const [selected, setSelected]     = useState('')
  const [reason, setReason]         = useState('')
  const [errs, setErrs]             = useState({})
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const [manualDates, setManualDates]     = useState([])
  const [manualOpen, setManualOpen]       = useState(false)
  const [manual, setManual]               = useState({ date: '', inT: '', outT: '', reason: '' })
  const [manualSubmitting, setManualSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchEmployees(), getApproverForEmployee(employee.id),
      fetchMyCompRequests(employee.id), fetchHolidays(),
      fetchAttendanceHistory(employee.id, 120),
    ]).then(([e, a, cr, h, att]) => {
      const err = e.error || cr.error || h.error || att.error
      if (err) onToast?.(err.message || 'Failed to load some data', 'error')
      if (a.data) setApprover((e.data || []).find(x => x.id === a.data) || null)

      const holNames = {}
      for (const x of (h.data || [])) holNames[x.holiday_date] = x.name
      const reqs = cr.data || []

      const rows = (att.data || [])
        .filter(r => r.date < today)
        .map(r => {
          const dow = new Date(r.date + 'T12:00:00').getDay()
          const isWeekend = dow === 0 || dow === 6
          const isHoliday = r.date in holNames
          if (!isWeekend && !isHoliday) return null
          const hours = r.total_hours || 0
          const validPunches = !!r.check_in_time && !!r.check_out_time && r.status !== 'absent' && r.status !== 'incomplete'
          const already = reqs.some(x => x.worked_date === r.date && x.status !== 'rejected')
          const eligible = validPunches && hours >= 8 && !already
          return {
            date: r.date, hours, eligible,
            kind: isHoliday ? holNames[r.date] : dow === 0 ? 'Sunday' : 'Saturday',
            note: already ? 'Already requested'
              : !validPunches ? 'Missing a valid punch — not eligible'
                : hours < 8 ? 'Under 8h — not eligible'
                  : 'Punches validated',
          }
        })
        .filter(Boolean)

      setCandidates(rows)
      const firstOk = rows.find(r => r.eligible)
      if (firstOk) setSelected(firstOk.date)

      // Past weekend/holiday days with no attendance row at all and no live
      // comp request — these can be claimed by hand (approver-verified).
      const attDates = new Set((att.data || []).map(r => r.date))
      const reqDates = new Set(reqs.filter(x => x.status !== 'rejected').map(x => x.worked_date))
      const md = []
      for (let i = 1; i <= 120; i++) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const ds = isoOf(d)
        const dow = d.getDay()
        const isHoliday = ds in holNames
        if (dow !== 0 && dow !== 6 && !isHoliday) continue
        if (attDates.has(ds) || reqDates.has(ds)) continue
        md.push({ date: ds, kind: isHoliday ? holNames[ds] : dow === 0 ? 'Sunday' : 'Saturday' })
      }
      setManualDates(md)
    }).finally(() => setLoading(false))
  }, [employee.id])

  const picked = candidates.find(c => c.date === selected && c.eligible) || null
  const eligibleCount = candidates.filter(c => c.eligible).length

  const submit = async () => {
    const e = {}
    if (!picked) e.day = 'Pick an eligible day'
    if (!reason.trim()) e.reason = 'Required'
    if (Object.keys(e).length) { setErrs(e); return }
    setSubmitting(true)
    const { error } = await applyCompOff({
      employee_id: employee.id, worked_date: picked.date,
      worked_hours: picked.hours, earned_days: 1,
      reason: reason.trim(), approver_id: approver?.id || null,
    })
    setSubmitting(false)
    if (error) { onToast(error.message || (typeof error === 'string' ? error : 'Failed to submit'), 'error'); return }
    setDone(true)
  }

  const submitManual = async () => {
    const e = {}
    if (!manual.date) e.mdate = 'Pick a day'
    if (!manual.inT) e.min = 'Required'
    if (!manual.outT) e.mout = 'Required'
    if (!manual.reason.trim()) e.mreason = 'Required'
    let hrs = 0
    if (manual.date && manual.inT && manual.outT) {
      hrs = Math.round(((new Date(`${manual.date}T${manual.outT}:00`) - new Date(`${manual.date}T${manual.inT}:00`)) / 3600000) * 100) / 100
      if (hrs <= 0) e.mout = 'Must be after check-in'
      else if (hrs < 8) e.mout = `Only ${hrs.toFixed(1)}h — comp off needs 8h+`
    }
    if (Object.keys(e).length) { setErrs(e); return }
    setManualSubmitting(true)

    // Never overwrite a real, completed attendance record.
    const { data: existing } = await fetchAttendanceForDate(employee.id, manual.date)
    if (existing?.check_out_time) {
      setManualSubmitting(false)
      onToast('That day already has an attendance record — pick it from the list above.', 'error')
      return
    }

    const { error: attErr } = await checkIn({
      employee_id: employee.id, date: manual.date,
      check_in_time: new Date(`${manual.date}T${manual.inT}:00`).toISOString(),
      check_out_time: new Date(`${manual.date}T${manual.outT}:00`).toISOString(),
      check_in_lat: null, check_in_lng: null, check_in_address: 'Self-reported — no GPS punch',
      check_out_lat: null, check_out_lng: null, check_out_address: null,
      total_hours: hrs, status: 'incomplete',
    })
    if (attErr) { setManualSubmitting(false); onToast(attErr.message || 'Could not save the day', 'error'); return }

    const { error } = await applyCompOff({
      employee_id: employee.id, worked_date: manual.date,
      worked_hours: hrs, earned_days: 1,
      reason: `${SELF_REPORTED_TAG} ${manual.reason.trim()}`,
      approver_id: approver?.id || null,
    })
    setManualSubmitting(false)
    if (error) { onToast(error.message || (typeof error === 'string' ? error : 'Failed to submit'), 'error'); return }
    setDone(true)
  }

  if (loading) return <Spinner />
  if (done) return <Done tone={C.purple} title="Comp off request submitted"
    sub={`Pending approval from ${approver?.full_name || 'your approver'}.`}
    againLabel="Submit another"
    onAgain={() => { setDone(false); setSelected(''); setReason(''); setErrs({}); setManualOpen(false); setManual({ date: '', inT: '', outT: '', reason: '' }) }} />

  return (
    <div className="split-narrow" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ ...card, padding: '24px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted }}>Eligible days worked</div>
          <div style={{ fontSize: 11.5, color: '#7b8798' }}>8h+ on a weekend or holiday, with valid punches</div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {candidates.length === 0 && (
            <div style={{ fontSize: 12.5, color: C.muted, padding: '18px 0', lineHeight: 1.6 }}>
              No weekend or holiday work found in the last few months. Check in and out for 8h or more on a Saturday, Sunday, or company holiday and it will show up here.
            </div>
          )}
          {candidates.map(c => {
            const on = c.date === selected && c.eligible
            return (
              <div key={c.date} onClick={() => { if (c.eligible) { setSelected(c.date); setErrs({}) } }}
                style={{
                  display: 'grid', gridTemplateColumns: '20px 108px minmax(90px,1fr) 92px', gap: 14, alignItems: 'center',
                  border: `1px solid ${on ? C.navy : C.line}`, background: on ? '#f4f8fd' : c.eligible ? '#fff' : C.bgSec,
                  borderRadius: 10, padding: '13px 15px', cursor: c.eligible ? 'pointer' : 'not-allowed',
                  boxShadow: on ? `inset 0 0 0 1px ${C.navy}` : 'none',
                }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${on ? C.navy : c.eligible ? '#c8d3e0' : C.line}`, background: on ? C.navy : '#fff', boxShadow: on ? 'inset 0 0 0 2.5px #fff' : 'none' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: c.eligible ? C.ink : C.faint }}>{fmtPill(c.date)}</div>
                  <div style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.kind}</div>
                </div>
                <div style={{ fontSize: 12, color: c.eligible ? '#2a5c8a' : '#c2882a' }}>{c.note}</div>
                <div style={{ textAlign: 'right', fontFamily: C.mono, fontSize: 13, color: c.eligible ? C.ink : C.faint }}>{c.hours.toFixed(1)} h</div>
              </div>
            )
          })}
        </div>
        {errs.day && <div style={{ fontSize: 11.5, color: '#c9564a', marginTop: 8 }}>{errs.day}</div>}

        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '24px 0 10px' }}>What did you work on?</div>
        <textarea rows={3} value={reason}
          onChange={e => { setReason(e.target.value); setErrs(p => ({ ...p, reason: undefined })) }}
          placeholder="One or two lines your manager can approve against"
          style={{ ...inputStyle(errs.reason), resize: 'vertical', minHeight: 96 }} />
        {errs.reason && <div style={{ fontSize: 11.5, color: '#c9564a', marginTop: 6 }}>{errs.reason}</div>}

        <div style={{ marginTop: 22, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 18 }}>
          {!manualOpen ? (
            <button onClick={() => { setManualOpen(true); setErrs({}) }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: C.navy, fontFamily: 'inherit' }}>
              ＋ Worked a weekend or holiday that isn't listed?
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Log a day you worked</div>
              <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.55, marginBottom: 14 }}>
                For a weekend or holiday you worked but didn't check in on. Your approver verifies it before any comp off is credited.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Day worked" error={errs.mdate} style={{ gridColumn: '1 / -1' }}>
                  <select value={manual.date} onChange={e => { setManual(m => ({ ...m, date: e.target.value })); setErrs({}) }} style={inputStyle(errs.mdate)}>
                    <option value="">Select a day…</option>
                    {manualDates.map(d => <option key={d.date} value={d.date}>{fmtPill(d.date)} · {d.kind}</option>)}
                  </select>
                </Field>
                <Field label="Check-in" error={errs.min}>
                  <input type="time" value={manual.inT} onChange={e => setManual(m => ({ ...m, inT: e.target.value }))} style={inputStyle(errs.min)} />
                </Field>
                <Field label="Check-out" error={errs.mout}>
                  <input type="time" value={manual.outT} onChange={e => setManual(m => ({ ...m, outT: e.target.value }))} style={inputStyle(errs.mout)} />
                </Field>
              </div>
              <Field label="What did you work on?" error={errs.mreason}>
                <textarea rows={2} value={manual.reason} onChange={e => setManual(m => ({ ...m, reason: e.target.value }))}
                  placeholder="Context your approver can verify against"
                  style={{ ...inputStyle(errs.mreason), resize: 'vertical', minHeight: 64 }} />
              </Field>
              {manualDates.length === 0 && (
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>No un-logged weekend or holiday days in the last few months.</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Btn disabled={manualSubmitting} onClick={submitManual}>{manualSubmitting ? 'Submitting…' : 'Submit for approval'}</Btn>
                <Btn variant="ghost" onClick={() => { setManualOpen(false); setErrs({}) }}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: 22, position: 'sticky', top: 24 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted }}>You will earn</div>
        <div style={{ fontFamily: C.serif, fontSize: 30, lineHeight: 1.15, marginTop: 10 }}>
          {picked ? '1 day' : 'Nothing yet'}
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
          {picked ? `For ${fmtPill(picked.date)} · ${picked.hours.toFixed(1)} h`
            : eligibleCount ? 'Pick an eligible day on the left' : 'No eligible days right now'}
        </div>
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
          {[
            ['Day worked', picked ? formatDate(picked.date) : '—'],
            ['Hours logged', picked ? `${picked.hours.toFixed(1)} h` : '—'],
            ['Comp off balance', picked ? '+1 day' : '—'],
            ['Approver', approver?.full_name || '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 12.5 }}>
              <span style={{ color: C.sub }}>{k}</span><span style={{ color: C.body, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
        <Btn full disabled={submitting || !picked} onClick={submit} style={{ marginTop: 16 }}>
          {submitting ? 'Submitting…' : 'Request comp off'}
        </Btn>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: C.muted, marginTop: 9 }}>
          {approver?.full_name?.split(' ')[0] || 'Your approver'} approves comp off requests
        </div>
      </div>
    </div>
  )
}
