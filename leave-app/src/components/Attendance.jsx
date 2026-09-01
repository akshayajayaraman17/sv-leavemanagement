import { useEffect, useState } from 'react'
import {
  fetchTodayAttendance, fetchAttendanceHistory,
  checkIn, checkOut, fetchPunches, addPunch,
  createRegularization, fetchMyRegularizations,
  updateAttendanceStatus, getApproverForEmployee,
} from '../lib/api'
import { Badge, Btn, C, Field, Mono, Panel, SecTitle, Spinner, card, formatDate, inputStyle } from './UI'

const MIN_HOURS = 8

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation is not supported by your browser')); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      e => reject(new Error(e.code === 1 ? 'Location permission denied' : 'Could not get location')),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  })
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } })
    const j = await res.json()
    const a = j.address || {}
    const parts = [a.road, a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.village || a.county].filter(Boolean)
    return parts.length ? parts.join(', ') : j.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  } catch { return `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
}

function getWeekDays() {
  const t = new Date()
  const day = t.getDay()
  const monday = new Date(t)
  monday.setDate(t.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 5 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d.toISOString().split('T')[0] })
}
const formatTime = ts => ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function calcHoursFromPunches(punches) {
  let total = 0
  for (let i = 0; i < punches.length; i++) {
    if (punches[i].punch_type === 'check_in') {
      const out = punches.find((p, j) => j > i && p.punch_type === 'check_out')
      if (out) total += (new Date(out.punch_time) - new Date(punches[i].punch_time)) / 3600000
    }
  }
  return Math.round(total * 100) / 100
}

export default function Attendance({ employee, onToast }) {
  const [record, setRecord]   = useState(null)
  const [punches, setPunches] = useState([])
  const [history, setHistory] = useState([])
  const [regs, setRegs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [locating, setLocating] = useState(false)
  const [locErr, setLocErr]   = useState('')
  const [regForm, setRegForm] = useState(null)
  const [regSaving, setRegSaving] = useState(false)
  const [geoDenied, setGeoDenied] = useState(false)
  const [manualLocation, setManualLocation] = useState('')
  const [manualNotes, setManualNotes]       = useState('')

  const weekDays = getWeekDays()
  const todayStr = new Date().toISOString().split('T')[0]

  const load = async () => {
    setLoading(true)
    const [{ data: rec, error: recErr }, { data: hist, error: histErr }, { data: regData, error: regErr }] = await Promise.all([
      fetchTodayAttendance(employee.id), fetchAttendanceHistory(employee.id, 30), fetchMyRegularizations(employee.id),
    ])
    const err = recErr || histErr || regErr
    if (err) onToast?.(err.message || 'Failed to load attendance data', 'error')
    setRecord(rec || null); setHistory(hist || []); setRegs(regData || [])
    if (rec?.id) { const { data: p } = await fetchPunches(rec.id); setPunches(p || []) } else setPunches([])
    setLoading(false)
  }
  useEffect(() => { load() }, [employee.id])

  const lastPunch = punches.length > 0 ? punches[punches.length - 1] : null
  const isCurrentlyIn = lastPunch?.punch_type === 'check_in'
  const hasAnyPunch = punches.length > 0
  const sessionCount = punches.filter(p => p.punch_type === 'check_in').length

  const writeCheckIn = async (lat, lng, address) => {
    const now = new Date().toISOString()
    const { data, error } = await checkIn({
      employee_id: employee.id, date: todayStr, check_in_time: now,
      check_in_lat: lat, check_in_lng: lng, check_in_address: address,
      check_out_time: null, check_out_lat: null, check_out_lng: null, check_out_address: null,
      total_hours: record?.total_hours || 0, status: 'present',
    })
    if (error) { setLocErr(error.message); return }
    await addPunch({ attendance_id: data.id, employee_id: employee.id, punch_type: 'check_in', punch_time: now, lat, lng, address })
    setRecord(data); await load()
  }

  const writeCheckOut = async (lat, lng, address) => {
    const now = new Date()
    await addPunch({ attendance_id: record.id, employee_id: employee.id, punch_type: 'check_out', punch_time: now.toISOString(), lat, lng, address })
    const { data: allPunches } = await fetchPunches(record.id)
    const totalHours = calcHoursFromPunches(allPunches || [])
    const { data, error } = await checkOut(record.id, {
      check_out_time: now.toISOString(), check_out_lat: lat, check_out_lng: lng, check_out_address: address, total_hours: totalHours,
    })
    if (error) { setLocErr(error.message); return }
    setRecord(data); await load()
  }

  const handleCheckIn = async () => {
    setLocErr(''); setLocating(true)
    try { const { lat, lng } = await getLocation(); await writeCheckIn(lat, lng, await reverseGeocode(lat, lng)); setGeoDenied(false) }
    catch (e) { setLocErr(e.message); setGeoDenied(true) } finally { setLocating(false) }
  }
  const handleCheckOut = async () => {
    if (!record) return
    setLocErr(''); setLocating(true)
    try { const { lat, lng } = await getLocation(); await writeCheckOut(lat, lng, await reverseGeocode(lat, lng)); setGeoDenied(false) }
    catch (e) { setLocErr(e.message); setGeoDenied(true) } finally { setLocating(false) }
  }
  const handleManualSubmit = async () => {
    if (!manualLocation.trim()) { setLocErr('Enter a location.'); return }
    setLocErr(''); setLocating(true)
    try {
      const address = manualNotes.trim() ? `${manualLocation.trim()} — ${manualNotes.trim()}` : manualLocation.trim()
      if (hasAnyPunch && isCurrentlyIn) await writeCheckOut(null, null, address)
      else await writeCheckIn(null, null, address)
      setGeoDenied(false); setManualLocation(''); setManualNotes('')
    } finally { setLocating(false) }
  }

  const submitRegularization = async () => {
    if (!regForm?.reason?.trim()) return
    setRegSaving(true)
    const { data: approverId } = await getApproverForEmployee(employee.id)
    const { error } = await createRegularization({
      attendance_id: regForm.attendanceId, employee_id: employee.id, approver_id: approverId || null,
      reason: regForm.reason.trim(), check_out_time: regForm.checkOutTime || null,
    })
    if (!error) await updateAttendanceStatus(regForm.attendanceId, 'incomplete')
    setRegSaving(false); setRegForm(null); load()
  }

  if (loading) return <Spinner />

  const incompleteDays = history.filter(h => h.date < todayStr && h.check_in_time && !h.check_out_time && h.status !== 'incomplete')
  const hasRegRequest = (id) => regs.some(r => r.attendance_id === id)
  const hours = record?.total_hours || 0
  const ringPct = Math.min(100, (hours / MIN_HOURS) * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Missing-checkout warnings */}
      {incompleteDays.filter(d => !hasRegRequest(d.id)).map(day => (
        <div key={day.id} style={{ ...card, border: `1px solid ${C.redLine}`, background: C.redBg }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 4 }}>Missing check-out — {formatDate(day.date)}</div>
              <div style={{ fontSize: 12, color: C.red }}>Checked in at {formatTime(day.check_in_time)} with no check-out. This day is marked as leave unless regularized.</div>
            </div>
            <Btn sm variant="danger" onClick={() => setRegForm({ attendanceId: day.id, date: day.date, checkInTime: day.check_in_time, reason: '', checkOutTime: '' })}>Regularize</Btn>
          </div>
        </div>
      ))}

      {regForm && (
        <div style={{ ...card, border: `1px solid ${C.amberLine}`, background: '#fdfaf4' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8a6a22', marginBottom: 4 }}>Request regularization — {formatDate(regForm.date)}</div>
          <div style={{ fontSize: 12, color: '#8a6a22', marginBottom: 12 }}>Checked in at {formatTime(regForm.checkInTime)}. Give a reason and your approximate check-out time.</div>
          <Field label="Proposed check-out time">
            <input type="time" value={regForm.checkOutTime} onChange={e => setRegForm(f => ({ ...f, checkOutTime: e.target.value }))} style={inputStyle()} />
          </Field>
          <Field label="Reason">
            <input value={regForm.reason} onChange={e => setRegForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Forgot to check out, system was down" style={inputStyle()} />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn full disabled={regSaving || !regForm.reason.trim()} onClick={submitRegularization}>{regSaving ? 'Submitting…' : 'Submit request'}</Btn>
            <Btn variant="ghost" onClick={() => setRegForm(null)}>Cancel</Btn>
          </div>
        </div>
      )}

      <div className="split-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
        {/* Today */}
        <div style={{ ...card, padding: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
            <div style={{ width: 132, height: 132, flex: 'none', borderRadius: '50%', background: `conic-gradient(#3a76ad ${ringPct}%, ${C.lineSoft} ${ringPct}%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 106, height: 106, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: C.serif, fontSize: 30, lineHeight: 1 }}>{hours.toFixed(1)}</div>
                <div style={{ fontSize: 10.5, color: C.muted, letterSpacing: '0.06em' }}>OF 8.0 H</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 12.5, color: C.sub }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long' })}</div>
              <div style={{ fontFamily: C.serif, fontSize: 24, marginTop: 2 }}>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div style={{ display: 'flex', gap: 22, marginTop: 16, flexWrap: 'wrap' }}>
                {[
                  ['First in', formatTime(punches[0]?.punch_time)],
                  ['Last out', formatTime(!isCurrentlyIn ? lastPunch?.punch_time : null)],
                  ['Sessions', String(sessionCount)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted }}>{k}</div>
                    <Mono style={{ fontSize: 15, marginTop: 3, display: 'block', color: C.body }}>{v}</Mono>
                  </div>
                ))}
              </div>
              {!hasAnyPunch && (
                <Btn full style={{ marginTop: 22, height: 44 }} disabled={locating} onClick={handleCheckIn}>{locating ? 'Getting location…' : 'Check in'}</Btn>
              )}
              {hasAnyPunch && isCurrentlyIn && (
                <Btn full style={{ marginTop: 22, height: 44, background: '#b0761d' }} disabled={locating} onClick={handleCheckOut}>{locating ? 'Getting location…' : 'Check out'}</Btn>
              )}
              {hasAnyPunch && !isCurrentlyIn && (
                <Btn full style={{ marginTop: 22, height: 44 }} disabled={locating} onClick={handleCheckIn}>{locating ? 'Getting location…' : 'Check in again'}</Btn>
              )}
            </div>
          </div>
          {lastPunch?.address && isCurrentlyIn && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 14 }}>📍 {lastPunch.address}</div>}
          {locErr && <div style={{ background: C.redBg, color: C.red, border: `1px solid ${C.redLine}`, fontSize: 12, padding: '9px 12px', borderRadius: 9, marginTop: 12 }}>{locErr}</div>}

          {punches.length > 0 && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.lineSoft}` }}>
              <SecTitle>Today's punches</SecTitle>
              {punches.map((p, i) => (
                <div key={p.id || i} style={{ display: 'grid', gridTemplateColumns: '14px 84px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: i < punches.length - 1 ? `1px solid ${C.rowLine}` : 'none' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.punch_type === 'check_in' ? C.greenDot : '#c2882a' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{p.punch_type === 'check_in' ? 'Check in' : 'Check out'}</span>
                  <span style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.address || '—'}</span>
                  <Mono style={{ fontSize: 12.5, color: C.body }}>{formatTime(p.punch_time)}</Mono>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Manual fallback */}
          {geoDenied && (
            <div style={{ ...card, border: `1px solid ${C.redLine}`, background: C.redBg }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 6 }}>Location access is blocked</div>
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 14 }}>You can still {hasAnyPunch && isCurrentlyIn ? 'check out' : 'check in'} — enter your location manually.</div>
              <Field label="Location"><input value={manualLocation} onChange={e => setManualLocation(e.target.value)} placeholder="e.g. Chennai Office, Client Site" style={inputStyle()} /></Field>
              <Field label="Notes (optional)"><input value={manualNotes} onChange={e => setManualNotes(e.target.value)} placeholder="Optional context for your approver" style={inputStyle()} /></Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn full disabled={locating || !manualLocation.trim()} onClick={handleManualSubmit}>{locating ? 'Saving…' : `${hasAnyPunch && isCurrentlyIn ? 'Check out' : 'Check in'} with this location`}</Btn>
                <Btn variant="ghost" onClick={() => { setGeoDenied(false); setLocErr('') }}>Retry GPS</Btn>
              </div>
            </div>
          )}

          {/* This week */}
          <Panel title="This week" right={<Mono style={{ fontSize: 11.5, color: C.sub }}>{history.filter(h => weekDays.includes(h.date)).reduce((s, h) => s + (h.total_hours || 0), 0).toFixed(1)} / 40.0 h</Mono>}>
            {weekDays.map((d, i) => {
              const rec = history.find(h => h.date === d)
              const h = rec?.total_hours || 0
              const isToday = d === todayStr
              const isPast = d < todayStr
              const incomplete = rec?.check_in_time && !rec?.check_out_time && isPast
              const fg = incomplete ? C.red : h >= MIN_HOURS ? '#1f7350' : h > 0 ? '#b0761d' : C.faint
              return (
                <div key={d} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) 46px', gap: 12, alignItems: 'center', padding: '8px 0' }}>
                  <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: isToday ? C.navy : C.muted, fontWeight: isToday ? 600 : 400 }}>{DAY_SHORT[i]}</span>
                  <div style={{ height: 6, borderRadius: 3, background: C.lineSoft, overflow: 'hidden' }}>
                    <div style={{ height: 6, width: `${Math.min(100, (h / MIN_HOURS) * 100)}%`, background: fg }} />
                  </div>
                  <Mono style={{ fontSize: 11.5, color: fg, textAlign: 'right' }}>{incomplete ? 'no out' : h ? h.toFixed(1) : '—'}</Mono>
                </div>
              )
            })}
          </Panel>

          {regs.length > 0 && (
            <Panel title="Regularization requests">
              {regs.slice(0, 5).map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.rowLine}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(r.attendance?.date)}</div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>{r.reason}{r.reject_reason ? ` · ${r.reject_reason}` : ''}</div>
                  </div>
                  <Badge status={r.status} />
                </div>
              ))}
            </Panel>
          )}
        </div>
      </div>

      {/* Recent history */}
      {history.length > 0 && (
        <Panel title="Recent attendance">
          {history.slice(0, 12).map(h => {
            const meetsMin = h.total_hours >= MIN_HOURS
            const incomplete = h.check_in_time && !h.check_out_time && h.date < todayStr
            return (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: `1px solid ${C.rowLine}`, gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{new Date(h.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>In {formatTime(h.check_in_time)} · Out {formatTime(h.check_out_time)}{h.check_in_address ? ` · ${h.check_in_address}` : ''}</div>
                </div>
                <span style={{ flexShrink: 0, fontFamily: C.mono, fontSize: 12, fontWeight: 500, borderRadius: 20, padding: '3px 10px',
                  background: incomplete ? C.redBg : meetsMin ? C.greenBg : h.check_in_time ? C.amberBg : C.redBg,
                  color: incomplete ? C.red : meetsMin ? '#1f7350' : h.check_in_time ? '#8a6a22' : C.red }}>
                  {incomplete ? 'no out' : h.total_hours != null ? `${h.total_hours.toFixed(1)}h` : h.check_in_time ? 'in only' : 'absent'}
                </span>
              </div>
            )
          })}
        </Panel>
      )}
    </div>
  )
}
