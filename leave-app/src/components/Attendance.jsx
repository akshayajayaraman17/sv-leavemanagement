import { useEffect, useState } from 'react'
import { fetchTodayAttendance, fetchAttendanceHistory, checkIn, checkOut } from '../lib/api'
import { C, SecTitle, Spinner, card, formatDate } from './UI'

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

// ── Component ─────────────────────────────────────────────────────────────────
export default function Attendance({ employee }) {
  const [record,   setRecord]   = useState(null)   // today's record
  const [history,  setHistory]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [locating, setLocating] = useState(false)
  const [locErr,   setLocErr]   = useState('')

  const weekDays = getWeekDays()
  const todayStr = new Date().toISOString().split('T')[0]

  const load = async () => {
    setLoading(true)
    const [{ data: rec }, { data: hist }] = await Promise.all([
      fetchTodayAttendance(employee.id),
      fetchAttendanceHistory(employee.id, 20),
    ])
    setRecord(rec || null)
    setHistory(hist || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [employee.id])

  const handleCheckIn = async () => {
    setLocErr('')
    setLocating(true)
    try {
      const { lat, lng } = await getLocation()
      const address = await reverseGeocode(lat, lng)
      const { data, error } = await checkIn({
        employee_id: employee.id,
        date: todayStr,
        check_in_time: new Date().toISOString(),
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_address: address,
      })
      if (error) { setLocErr(error.message); return }
      setRecord(data)
      setHistory(h => [data, ...h.filter(x => x.date !== todayStr)])
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
      const totalHours = Math.round(((now - new Date(record.check_in_time)) / 3600000) * 100) / 100
      const { data, error } = await checkOut(record.id, {
        check_out_time: now.toISOString(),
        check_out_lat: lat,
        check_out_lng: lng,
        check_out_address: address,
        total_hours: totalHours,
      })
      if (error) { setLocErr(error.message); return }
      setRecord(data)
      setHistory(h => [data, ...h.filter(x => x.date !== todayStr)])
    } catch (e) {
      setLocErr(e.message)
    } finally {
      setLocating(false)
    }
  }

  if (loading) return <Spinner />

  const checkedIn  = !!record?.check_in_time
  const checkedOut = !!record?.check_out_time
  const todayDate  = new Date()
  const dayName    = todayDate.toLocaleDateString('en-IN', { weekday: 'long' })
  const dateStr    = todayDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      {/* ── Today card ── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.textTert, marginBottom: 2 }}>{dayName}</div>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>{dateStr}</div>

        {/* Not yet checked in */}
        {!checkedIn && (
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

        {/* Checked in, not yet out */}
        {checkedIn && !checkedOut && (
          <div>
            <div style={{ background: C.greenBg, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#0F6E56', marginBottom: 2 }}>Checked in at</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.green, lineHeight: 1 }}>
                {formatTime(record.check_in_time)}
              </div>
              {record.check_in_address && (
                <div style={{ fontSize: 11, color: '#0F6E56', marginTop: 6 }}>
                  📍 {record.check_in_address}
                </div>
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

        {/* Both done */}
        {checkedIn && checkedOut && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ background: C.greenBg, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#0F6E56', marginBottom: 2 }}>Check In</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>{formatTime(record.check_in_time)}</div>
                {record.check_in_address && (
                  <div style={{ fontSize: 10, color: '#0F6E56', marginTop: 4 }}>📍 {record.check_in_address}</div>
                )}
              </div>
              <div style={{ background: C.amberBg, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#854F0B', marginBottom: 2 }}>Check Out</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.amber }}>{formatTime(record.check_out_time)}</div>
                {record.check_out_address && (
                  <div style={{ fontSize: 10, color: '#854F0B', marginTop: 4 }}>📍 {record.check_out_address}</div>
                )}
              </div>
            </div>
            <div style={{ background: C.bgSec, borderRadius: 8, padding: '10px 0', textAlign: 'center' }}>
              <span style={{ fontSize: 13, color: C.textSec }}>Total hours today: </span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{record.total_hours?.toFixed(1)}h</span>
            </div>
          </div>
        )}

        {locErr && (
          <div style={{ background: C.redBg, color: C.red, fontSize: 12, padding: '9px 12px', borderRadius: 8, marginTop: 12 }}>
            {locErr}
          </div>
        )}
      </div>

      {/* ── This week summary ── */}
      <SecTitle>This week</SecTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 24 }}>
        {weekDays.map((d, i) => {
          const rec      = history.find(h => h.date === d)
          const isToday  = d === todayStr
          const isPast   = d < todayStr
          const hasIn    = !!rec?.check_in_time
          const hasOut   = !!rec?.check_out_time
          const dotColor = hasOut ? C.green : hasIn ? C.amber : (isPast ? C.red : C.bgTert)
          return (
            <div key={d} style={{
              background: isToday ? C.blueBg : C.bg,
              border: `0.5px solid ${isToday ? C.blue : C.border}`,
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
                <div style={{ fontSize: 9, color: C.green, fontWeight: 600 }}>
                  {rec.total_hours?.toFixed(1)}h
                </div>
              )}
              {hasIn && !hasOut && (
                <div style={{ fontSize: 9, color: C.amber }}>In</div>
              )}
              {isPast && !hasIn && (
                <div style={{ fontSize: 9, color: C.red }}>—</div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Recent history ── */}
      {history.length > 0 && (
        <>
          <SecTitle>Recent Attendance</SecTitle>
          {history.slice(0, 10).map(h => (
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
                  {h.total_hours != null ? (
                    <span style={{ background: C.greenBg, color: '#0F6E56', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
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
          ))}
        </>
      )}
    </div>
  )
}
