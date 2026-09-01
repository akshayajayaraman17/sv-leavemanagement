import { useEffect, useMemo, useState } from 'react'
import { fetchTeamCalendar, fetchHolidays, fetchLeaveTypes } from '../lib/api'
import { C, Spinner, card } from './UI'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function toDateStr(d) { return d.toISOString().split('T')[0] }

function buildGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - startOffset)
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d })
}

export default function Calendar({ onToast }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [events, setEvents] = useState([])
  const [holidays, setHolidays] = useState({})
  const [typeMap, setTypeMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [expandedDay, setExpandedDay] = useState(null)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const grid = useMemo(() => buildGrid(year, month), [year, month])
  const todayStr = toDateStr(new Date())

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchTeamCalendar(toDateStr(grid[0]), toDateStr(grid[grid.length - 1])),
      fetchHolidays(), fetchLeaveTypes(),
    ]).then(([ev, h, lt]) => {
      const err = ev.error || h.error || lt.error
      if (err) onToast?.(err.message || 'Failed to load calendar data', 'error')
      setEvents(ev.data || [])
      const hMap = {}; for (const x of (h.data || [])) hMap[x.holiday_date] = x.name; setHolidays(hMap)
      const tMap = {}; for (const t of (lt.data || [])) tMap[t.code] = { color: t.color, bg: t.bg_color, label: t.label }; setTypeMap(tMap)
    }).finally(() => setLoading(false))
  }, [year, month, grid])

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const ev of events) {
      const d = new Date(ev.from_date + 'T12:00:00'), to = new Date(ev.to_date + 'T12:00:00')
      while (d <= to) { const k = toDateStr(d); (map[k] = map[k] || []).push(ev); d.setDate(d.getDate() + 1) }
    }
    return map
  }, [events])

  const nav = { width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.line}`, background: '#fff', color: C.sub, cursor: 'pointer', fontSize: 13 }

  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: C.serif, fontSize: 20 }}>{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={nav} onClick={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d })}>‹</button>
          <button style={{ ...nav, width: 'auto', padding: '0 12px', fontSize: 12 }} onClick={() => setCursor(() => { const d = new Date(); d.setDate(1); return d })}>Today</button>
          <button style={nav} onClick={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d })}>›</button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
            {DAY_LABELS.map(d => <div key={d} style={{ fontSize: 9.5, fontWeight: 600, color: C.faint, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {grid.map(d => {
              const dateStr = toDateStr(d)
              const inMonth = d.getMonth() === month
              const isToday = dateStr === todayStr
              const holidayName = holidays[dateStr]
              const dayEvents = eventsByDate[dateStr] || []
              return (
                <div key={dateStr} style={{
                  minHeight: 78, borderRadius: 8, padding: '6px 6px 8px',
                  opacity: inMonth ? 1 : 0.35,
                  border: `1px solid ${isToday ? C.navy : holidayName ? C.amberLine : C.lineSoft}`,
                  background: holidayName ? '#fdfaf4' : '#fff',
                }}>
                  <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: isToday ? 600 : 400, color: isToday ? C.navy : C.sub, marginBottom: 3 }}>{d.getDate()}</div>
                  {holidayName && <div style={{ fontSize: 9, color: '#8a6a22', fontWeight: 500, marginBottom: 3, lineHeight: 1.3 }}>{holidayName}</div>}
                  {(expandedDay === dateStr ? dayEvents : dayEvents.slice(0, 3)).map((ev, i) => {
                    const t = typeMap[ev.leave_type] || { color: C.sub, bg: C.bgSec }
                    return (
                      <div key={ev.employee_id + i} title={`${ev.full_name} — ${t.label || ev.leave_type}`} style={{
                        fontSize: 9, fontWeight: 500, color: t.color, background: t.bg, borderRadius: 5,
                        padding: '1px 5px', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{expandedDay === dateStr ? ev.full_name : ev.full_name.split(' ')[0]}</div>
                    )
                  })}
                  {dayEvents.length > 3 && (
                    <button onClick={() => setExpandedDay(x => x === dateStr ? null : dateStr)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 9, fontWeight: 600, color: C.blue, textAlign: 'left' }}>
                      {expandedDay === dateStr ? 'Close' : `+${dayEvents.length - 3} more`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
