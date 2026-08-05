import { useEffect, useMemo, useState } from 'react'
import { fetchTeamCalendar, fetchHolidays, fetchLeaveTypes } from '../lib/api'
import { C, Spinner, card } from './UI'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_LABEL = { month: 'long', year: 'numeric' }

function toDateStr(d) { return d.toISOString().split('T')[0] }

// Monday-first grid covering the full weeks that touch this month
function buildGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // 0 = Monday
  const gridStart = new Date(year, month, 1 - startOffset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
}

export default function Calendar() {
  const [cursor,   setCursor]   = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [events,   setEvents]   = useState([])
  const [holidays, setHolidays] = useState({})
  const [typeMap,  setTypeMap]  = useState({})
  const [loading,  setLoading]  = useState(true)

  const year  = cursor.getFullYear()
  const month = cursor.getMonth()
  const grid  = useMemo(() => buildGrid(year, month), [year, month])
  const todayStr = toDateStr(new Date())

  useEffect(() => {
    setLoading(true)
    const rangeFrom = toDateStr(grid[0])
    const rangeTo   = toDateStr(grid[grid.length - 1])
    Promise.all([
      fetchTeamCalendar(rangeFrom, rangeTo),
      fetchHolidays(),
      fetchLeaveTypes(),
    ]).then(([ev, h, lt]) => {
      setEvents(ev.data || [])
      const hMap = {}
      for (const holiday of (h.data || [])) hMap[holiday.holiday_date] = holiday.name
      setHolidays(hMap)
      const tMap = {}
      for (const t of (lt.data || [])) tMap[t.code] = { color: t.color, bg: t.bg_color, label: t.label }
      setTypeMap(tMap)
    }).finally(() => setLoading(false))
  }, [year, month, grid])

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const ev of events) {
      const from = new Date(ev.from_date + 'T12:00:00')
      const to   = new Date(ev.to_date + 'T12:00:00')
      const d = new Date(from)
      while (d <= to) {
        const key = toDateStr(d)
        if (!map[key]) map[key] = []
        map[key].push(ev)
        d.setDate(d.getDate() + 1)
      }
    }
    return map
  }, [events])

  const prevMonth = () => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d })
  const nextMonth = () => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d })
  const goToday   = () => setCursor(() => { const d = new Date(); d.setDate(1); return d })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{cursor.toLocaleDateString('en-IN', MONTH_LABEL)}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <button onClick={goToday} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12 }}>Today</button>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {DAY_LABELS.map(d => (
              <div key={d} style={{ fontSize: 10, fontWeight: 600, color: C.textTert, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d}</div>
            ))}
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
                  ...card, padding: '6px 6px 8px', minHeight: 76,
                  opacity: inMonth ? 1 : 0.35,
                  border: `${isToday ? '1.5px' : '0.5px'} solid ${isToday ? C.blue : holidayName ? C.amber : C.border}`,
                  background: holidayName ? C.amberBg : C.bg,
                }}>
                  <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 500, color: isToday ? C.blue : C.textSec, marginBottom: 3 }}>
                    {d.getDate()}
                  </div>
                  {holidayName && (
                    <div style={{ fontSize: 9, color: '#854F0B', fontWeight: 500, marginBottom: 3, lineHeight: 1.3 }}>{holidayName}</div>
                  )}
                  {dayEvents.slice(0, 3).map((ev, i) => {
                    const t = typeMap[ev.leave_type] || { color: C.textSec, bg: C.bgSec }
                    return (
                      <div key={ev.employee_id + i} title={`${ev.full_name} — ${t.label || ev.leave_type}`} style={{
                        fontSize: 9, fontWeight: 500, color: t.color, background: t.bg,
                        borderRadius: 5, padding: '1px 5px', marginBottom: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {ev.full_name.split(' ')[0]}
                      </div>
                    )
                  })}
                  {dayEvents.length > 3 && (
                    <div style={{ fontSize: 9, color: C.textTert }}>+{dayEvents.length - 3} more</div>
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

const navBtn = {
  width: 28, height: 28, borderRadius: 8, border: `0.5px solid ${C.border}`,
  background: C.bgSec, color: C.textSec, cursor: 'pointer', fontSize: 15,
}
