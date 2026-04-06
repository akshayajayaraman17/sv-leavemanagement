import { useEffect, useState } from 'react'
import {
  fetchTodayAttendance, fetchAttendanceHistory,
  checkIn, checkOut,
  fetchPunches, addPunch,
  createRegularization, fetchMyRegularizations,
  updateAttendanceStatus,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import { C, SecTitle, Spinner, card, formatDate, Field, btnStyle, inputStyle, Badge } from './UI'

const MIN_HOURS = 8

// ── Location helpers ──────────────────────────────────────────────────────────
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      e => reject(new Error(e.code === 1 ? 'Location permission denied' : 'Could not get location')),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  })
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const j = await res.json()
    const a = j.address || {}
    const parts = [
      a.road,
      a.suburb || a.neighbourhood || a.quarter,
      a.city || a.town || a.village || a.county,
    ].filter(Boolean)
    return parts.length ? parts.join(', ') : j.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getWeekDays() {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function formatTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

// Calculate total hours from paired punches
function calcHoursFromPunches(punches) {
  let total = 0
  for (let i = 0; i < punches.length; i++) {
    if (punches[i].punch_type === 'check_in') {
      const outPunch = punches.find((p, j) => j > i && p.punch_type === 'check_out')
      if (outPunch) {
        total += (new Date(outPunch.punch_time) - new Date(punches[i].punch_time)) / 3600000
      }
    }
  }
  return Math.round(total * 100) / 100
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Attendance({ employee }) {
  const [record,      setRecord]      = useState(null)   // today's attendance record
  const [punches,     setPunches]     = useState([])      // today's punch events
  const [history,     setHistory]     = useState([])
  const [regs,        setRegs]        = useState([])      // regularization requests
  const [loading,     setLoading]     = useState(true)
  const [locating,    setLocating]    = useState(false)
  const [locErr,      setLocErr]      = useState('')
  const [regForm,     setRegForm]     = useState(null)    // { attendanceId, reason, checkOutTime }
  const [regSaving,   setRegSaving]   = useState(false)

  const weekDays = getWeekDays()
  const todayStr = new Date().toISOString().split('T')[0]

  const load = async () => {
    setLoading(true)
    const [{ data: rec }, { data: hist }, { data: regData }] = await Promise.all([
      fetchTodayAttendance(employee.id),
      fetchAttendanceHistory(employee.id, 30),
      fetchMyRegularizations(employee.id),
    ])
    setRecord(rec || null)
    setHistory(hist || [])
    setRegs(regData || [])
    // Load today's punches if record exists
    if (rec?.id) {
      const { data: p } = await fetchPunches(rec.id)
      setPunches(p || [])
    } else {
      setPunches([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [employee.id])

  // Determine current punch state from punches
  const lastPunch = punches.length > 0 ? punches[punches.length - 1] : null
  const isCurrentlyIn = lastPunch?.punch_type === 'check_in'
  const hasAnyPunch = punches.length > 0
  const checkedIn = !!record?.check_in_time
  const checkedOut = !!record?.check_out_time
  const sessionCount = punches.filter(p => p.punch_type === 'check_in').length

  const handleCheckIn = async () => {
    setLocErr('')
    setLocating(true)
    try {
      const { lat, lng } = await getLocation()
      const address = await reverseGeocode(lat, lng)
      const now = new Date().toISOString()

      // Create or update attendance record
      const prevHours = record?.total_hours || 0
      const { data, error } = await checkIn({
        employee_id: employee.id,
        date: todayStr,
        check_in_time: now,
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_address: address,
        check_out_time: null,
        check_out_lat: null,
        check_out_lng: null,
        check_out_address: null,
        total_hours: prevHours,
        status: 'present',
      })
      if (error) { setLocErr(error.message); return }

      // Add punch record
      await addPunch({
        attendance_id: data.id,
        employee_id: employee.id,
        punch_type: 'check_in',
        punch_time: now,
        lat, lng, address,
      })

      setRecord(data)
      await load()
    } catch (e) {
      setLocErr(e.message)
    } finally {
      setLocating(false)
    }
  }

  const handleCheckOut = async () => {
    if (!record) return
    setLocErr('')
    setLocating(true)
    try {
      const { lat, lng } = await getLocation()
      const address = await reverseGeocode(lat, lng)
      const now = new Date()

      // Add punch record first
      await addPunch({
        attendance_id: record.id,
        employee_id: employee.id,
        punch_type: 'check_out',
        punch_time: now.toISOString(),
        lat, lng, address,
      })

      // Recalculate total hours from all punches
      const { data: allPunches } = await fetchPunches(record.id)
      // Add current checkout to the list for calculation
      const withCurrent = [...(allPunches || []), {
        punch_type: 'check_out',
        punch_time: now.toISOString(),
      }]
      // Actually the punch was already inserted, so just use allPunches
      const totalHours = calcHoursFromPunches(allPunches || [])

      const { data, error } = await checkOut(record.id, {
        check_out_time: now.toISOString(),
        check_out_lat: lat,
        check_out_lng: lng,
        check_out_address: address,
        total_hours: totalHours,
      })
      if (error) { setLocErr(error.message); return }

      setRecord(data)
      await load()
    } catch (e) {
      setLocErr(e.message)
    } finally {
      setLocating(false)
    }
  }

  // Submit regularization request for a day with missing checkout
  const submitRegularization = async () => {
    if (!regForm?.reason?.trim()) return
    setRegSaving(true)

    // Get approver
    const { data: approverId } = await supabase.rpc('get_approver', { emp_id: employee.id })

    const { error } = await createRegularization({
      attendance_id: regForm.attendanceId,
      employee_id: employee.id,
      approver_id: approverId || null,
      reason: regForm.reason.trim(),
      check_out_time: regForm.checkOutTime || null,
    })

    if (!error) {
      // Mark attendance as incomplete (pending regularization)
      await updateAttendanceStatus(regForm.attendanceId, 'incomplete')
    }

    setRegSaving(false)
    setRegForm(null)
    load()
  }

  if (loading) return <Spinner />

  const todayDate  = new Date()
  const dayName    = todayDate.toLocaleDateString('en-IN', { weekday: 'long' })
  const dateStr    = todayDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  // Find incomplete days (checked in but not out, in the past)
  const incompleteDays = history.filter(h =>
    h.date < todayStr &&
    h.check_in_time &&
    !h.check_out_time &&
    h.status !== 'incomplete' // not already requested
  )

  // Check if a regularization already exists for a given attendance
  const hasRegRequest = (attendanceId) => regs.some(r => r.attendance_id === attendanceId)

  return (
    <div>
      {/* ── Missing checkout warnings ── */}
      {incompleteDays.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {incompleteDays.filter(d => !hasRegRequest(d.id)).map(day => (
            <div key={day.id} style={{
              ...card, marginBottom: 10, border: `1px solid ${C.red}`,
              background: C.redBg,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 4 }}>
                    Missing Check-Out
                  </div>
                  <div style={{ fontSize: 12, color: C.red }}>
                    {formatDate(day.date)} — Checked in at {formatTime(day.check_in_time)} but no check-out recorded.
                    This day will be marked as <strong>leave</strong> unless regularized.
                  </div>
                </div>
                <button
                  onClick={() => setRegForm({
                    attendanceId: day.id,
                    date: day.date,
                    checkInTime: day.check_in_time,
                    reason: '',
                    checkOutTime: '',
                  })}
                  style={{ ...btnStyle(C.red, '#fff'), padding: '6px 12px', fontSize: 11, flexShrink: 0, marginLeft: 10 }}
                >
                  Regularize
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Regularization form modal ── */}
      {regForm && (
        <div style={{
          ...card, marginBottom: 20, border: `1px solid ${C.amber}`,
          background: C.amberBg,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#854F0B', marginBottom: 4 }}>
            Request Regularization — {formatDate(regForm.date)}
          </div>
          <div style={{ fontSize: 12, color: '#854F0B', marginBottom: 12 }}>
            Checked in at {formatTime(regForm.checkInTime)}. Please provide the reason for missing checkout and your approximate check-out time.
          </div>
          <Field label="Proposed Check-Out Time">
            <input
              type="time"
              value={regForm.checkOutTime}
              onChange={e => setRegForm(f => ({ ...f, checkOutTime: e.target.value }))}
              style={inputStyle()}
            />
          </Field>
          <Field label="Reason">
            <input
              value={regForm.reason}
              onChange={e => setRegForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g., Forgot to check out, system was down"
              style={inputStyle()}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={submitRegularization}
              disabled={regSaving || !regForm.reason.trim()}
              style={{ ...btnStyle(C.green, '#fff'), flex: 1, opacity: regSaving ? 0.7 : 1 }}
            >
              {regSaving ? 'Submitting…' : 'Submit Request'}
            </button>
            <button
              onClick={() => setRegForm(null)}
              style={{ ...btnStyle(C.bgSec, C.textSec), padding: '8px 16px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Today card ── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.textTert, marginBottom: 2 }}>{dayName}</div>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>{dateStr}</div>

        {/* Not yet checked in */}
        {!hasAnyPunch && (
          <div style={{ textAlign: 'center', paddingBottom: 4 }}>
            <div style={{ fontSize: 13, color: C.textSec, marginBottom: 18 }}>
              You haven't checked in yet
            </div>
            <button
              onClick={handleCheckIn}
              disabled={locating}
              style={{
                background: C.green, color: '#fff', border: 'none', borderRadius: 12,
                padding: '14px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                opacity: locating ? 0.7 : 1, width: '100%',
              }}
            >
              {locating ? '📍 Getting location…' : '✓  Check In'}
            </button>
          </div>
        )}

        {/* Currently checked in (can check out) */}
        {hasAnyPunch && isCurrentlyIn && (
          <div>
            <div style={{ background: C.greenBg, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#0F6E56', marginBottom: 2 }}>
                    Checked in at {sessionCount > 1 ? `(Session ${sessionCount})` : ''}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: C.green, lineHeight: 1 }}>
                    {formatTime(lastPunch.punch_time)}
                  </div>
                </div>
                {record?.total_hours > 0 && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#0F6E56' }}>Accumulated</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: C.green }}>{record.total_hours.toFixed(1)}h</div>
                  </div>
                )}
              </div>
              {lastPunch.address && (
                <div style={{ fontSize: 11, color: '#0F6E56', marginTop: 6 }}>📍 {lastPunch.address}</div>
              )}
            </div>
            <button
              onClick={handleCheckOut}
              disabled={locating}
              style={{
                background: C.amber, color: '#fff', border: 'none', borderRadius: 12,
                padding: '14px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                opacity: locating ? 0.7 : 1, width: '100%',
              }}
            >
              {locating ? '📍 Getting location…' : '✗  Check Out'}
            </button>
          </div>
        )}

        {/* Checked out — show summary + option to check in again */}
        {hasAnyPunch && !isCurrentlyIn && (
          <div>
            {/* Session summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ background: C.greenBg, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#0F6E56', marginBottom: 2 }}>First Check In</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>
                  {formatTime(punches[0]?.punch_time)}
                </div>
              </div>
              <div style={{ background: C.amberBg, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#854F0B', marginBottom: 2 }}>Last Check Out</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.amber }}>
                  {formatTime(lastPunch?.punch_time)}
                </div>
              </div>
            </div>

            {/* Total hours with 8hr indicator */}
            <div style={{
              background: record?.total_hours >= MIN_HOURS ? C.greenBg : C.amberBg,
              borderRadius: 8, padding: '10px 0', textAlign: 'center', marginBottom: 10,
            }}>
              <span style={{ fontSize: 13, color: C.textSec }}>Total hours: </span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{record?.total_hours?.toFixed(1)}h</span>
              {record?.total_hours < MIN_HOURS && (
                <span style={{ fontSize: 11, color: C.amber, marginLeft: 8 }}>
                  ({(MIN_HOURS - record.total_hours).toFixed(1)}h remaining for min {MIN_HOURS}h)
                </span>
              )}
              {record?.total_hours >= MIN_HOURS && (
                <span style={{ fontSize: 11, color: '#0F6E56', marginLeft: 8 }}>✓ Min {MIN_HOURS}h met</span>
              )}
            </div>

            {sessionCount > 0 && (
              <div style={{ fontSize: 11, color: C.textTert, textAlign: 'center', marginBottom: 10 }}>
                {sessionCount} session{sessionCount > 1 ? 's' : ''} today
              </div>
            )}

            {/* Allow re-check-in */}
            <button
              onClick={handleCheckIn}
              disabled={locating}
              style={{
                background: C.blue, color: '#fff', border: 'none', borderRadius: 12,
                padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: locating ? 0.7 : 1, width: '100%',
              }}
            >
              {locating ? '📍 Getting location…' : '✓  Check In Again'}
            </button>
          </div>
        )}

        {locErr && (
          <div style={{ background: C.redBg, color: C.red, fontSize: 12, padding: '9px 12px', borderRadius: 8, marginTop: 12 }}>
            {locErr}
          </div>
        )}
      </div>

      {/* ── Today's punch log ── */}
      {punches.length > 1 && (
        <>
          <SecTitle>Today's Punch Log</SecTitle>
          <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 20 }}>
            {punches.map((p, i) => (
              <div key={p.id || i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px',
                borderBottom: i < punches.length - 1 ? `0.5px solid ${C.border}` : 'none',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: p.punch_type === 'check_in' ? C.green : C.amber,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>
                    {p.punch_type === 'check_in' ? 'Check In' : 'Check Out'}
                  </span>
                  {p.address && (
                    <span style={{ fontSize: 10, color: C.textTert, marginLeft: 8 }}>📍 {p.address}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>
                  {formatTime(p.punch_time)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── This week summary ── */}
      <SecTitle>This week</SecTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 24 }}>
        {weekDays.map((d, i) => {
          const rec      = history.find(h => h.date === d)
          const isToday  = d === todayStr
          const isPast   = d < todayStr
          const hasIn    = !!rec?.check_in_time
          const hasOut   = !!rec?.check_out_time
          const meetsMin = rec?.total_hours >= MIN_HOURS
          const isIncomplete = hasIn && !hasOut && isPast
          const dotColor = isIncomplete ? C.red
            : hasOut ? (meetsMin ? C.green : C.amber)
            : hasIn ? C.amber
            : (isPast ? C.red : C.bgTert)
          return (
            <div key={d} style={{
              background: isToday ? C.blueBg : C.bg,
              border: `0.5px solid ${isToday ? C.blue : isIncomplete ? C.red : C.border}`,
              borderRadius: 10, padding: '10px 4px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: isToday ? C.blue : C.textTert, fontWeight: isToday ? 600 : 400, textTransform: 'uppercase' }}>
                {DAY_SHORT[i]}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, margin: '4px 0' }}>
                {new Date(d + 'T12:00:00').getDate()}
              </div>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, margin: '0 auto 3px' }} />
              {hasOut && (
                <div style={{ fontSize: 9, color: meetsMin ? C.green : C.amber, fontWeight: 600 }}>
                  {rec.total_hours?.toFixed(1)}h
                </div>
              )}
              {hasIn && !hasOut && isToday && (
                <div style={{ fontSize: 9, color: C.amber }}>In</div>
              )}
              {isIncomplete && (
                <div style={{ fontSize: 8, color: C.red, fontWeight: 500 }}>No out</div>
              )}
              {isPast && !hasIn && (
                <div style={{ fontSize: 9, color: C.red }}>—</div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Regularization requests ── */}
      {regs.length > 0 && (
        <>
          <SecTitle>Regularization Requests</SecTitle>
          {regs.slice(0, 5).map(r => (
            <div key={r.id} style={{ ...card, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(r.attendance?.date)}</div>
                  <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{r.reason}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                  background: r.status === 'approved' ? C.greenBg
                    : r.status === 'rejected' ? C.redBg : C.amberBg,
                  color: r.status === 'approved' ? '#0F6E56'
                    : r.status === 'rejected' ? C.red : '#854F0B',
                }}>
                  {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                </span>
              </div>
              {r.reject_reason && (
                <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Reason: {r.reject_reason}</div>
              )}
            </div>
          ))}
        </>
      )}

      {/* ── Recent history ── */}
      {history.length > 0 && (
        <>
          <SecTitle>Recent Attendance</SecTitle>
          {history.slice(0, 10).map(h => {
            const meetsMin = h.total_hours >= MIN_HOURS
            const isIncomplete = h.check_in_time && !h.check_out_time && h.date < todayStr
            return (
              <div key={h.id} style={{ ...card, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {new Date(h.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>
                      In: {formatTime(h.check_in_time)} &nbsp;·&nbsp; Out: {formatTime(h.check_out_time)}
                    </div>
                    {h.check_in_address && (
                      <div style={{ fontSize: 10, color: C.textTert, marginTop: 3 }}>
                        📍 {h.check_in_address}
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: 10 }}>
                    {isIncomplete ? (
                      <span style={{ background: C.redBg, color: C.red, fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20 }}>
                        No checkout
                      </span>
                    ) : h.total_hours != null ? (
                      <span style={{
                        background: meetsMin ? C.greenBg : C.amberBg,
                        color: meetsMin ? '#0F6E56' : '#854F0B',
                        fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                      }}>
                        {h.total_hours.toFixed(1)}h
                      </span>
                    ) : h.check_in_time ? (
                      <span style={{ background: C.amberBg, color: C.amber, fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20 }}>
                        In only
                      </span>
                    ) : (
                      <span style={{ background: C.redBg, color: C.red, fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20 }}>
                        Absent
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
