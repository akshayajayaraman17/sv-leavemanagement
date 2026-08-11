import { useEffect, useState } from 'react'
import { fetchLeaveBalance, fetchMyLeaves, fetchMyCompRequests, fetchHolidays, fetchBirthdays } from '../lib/api'
import { Avatar, Badge, C, SecTitle, Spinner, card, formatDate, formatDayMonth } from './UI'

export default function Dashboard({ employee, onToast, onNavigate }) {
  const [balances,  setBalances]  = useState([])
  const [leaves,    setLeaves]    = useState([])
  const [compReqs,  setCompReqs]  = useState([])
  const [holidays,  setHolidays]  = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [holidaysError,  setHolidaysError]  = useState(false)
  const [birthdaysError, setBirthdaysError] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchLeaveBalance(employee.id),
      fetchMyLeaves(employee.id),
      fetchMyCompRequests(employee.id),
    ]).then(([b, l, c]) => {
      const err = b.error || l.error || c.error
      if (err) onToast?.(err.message || 'Failed to load some data', 'error')
      setBalances(b.data || [])
      setLeaves((l.data || []).slice(0, 4))
      setCompReqs((c.data || []).filter(x => x.status === 'pending'))
    }).finally(() => setLoading(false))
    loadHolidays()
    loadBirthdays()
  }, [employee.id])

  const loadHolidays = () => {
    setHolidaysError(false)
    fetchHolidays().then(({ data, error }) => {
      if (error) { setHolidaysError(true); return }
      setHolidays(data || [])
    })
  }

  const loadBirthdays = () => {
    setBirthdaysError(false)
    fetchBirthdays().then(({ data, error }) => {
      if (error) { setBirthdaysError(true); return }
      setBirthdays(data || [])
    })
  }

  if (loading) return <Spinner />

  const now = new Date()
  const curMonth = now.getMonth()
  const todayStr = now.toISOString().split('T')[0]

  const holidaysThisMonth = holidays
    .filter(h => h.holiday_date >= todayStr && new Date(h.holiday_date + 'T12:00:00').getMonth() === curMonth)
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))

  const birthdaysThisMonth = birthdays
    .filter(b => new Date(b.date_of_birth + 'T12:00:00').getMonth() === curMonth)
    .sort((a, b) => new Date(a.date_of_birth + 'T12:00:00').getDate() - new Date(b.date_of_birth + 'T12:00:00').getDate())

  return (
    <div>
      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button
          onClick={() => onNavigate?.('apply')}
          style={{ background: C.green, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          Apply Leave
        </button>
        <button
          onClick={() => onNavigate?.('attendance')}
          style={{ background: 'transparent', color: C.text, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Check In
        </button>
      </div>

      {/* Profile card */}
      <div style={{ ...card, background: C.bgSec, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar initials={employee.avatar_initials} size={44} color={C.green} bg={C.greenBg} />
          <div>
            <div style={{ fontWeight: 500, fontSize: 15 }}>{employee.full_name}</div>
            <div style={{ fontSize: 12, color: C.textSec }}>
              {employee.designation || employee.role} · {employee.department || 'No dept'}
            </div>
            <div style={{ fontSize: 11, color: C.textTert }}>Joined {formatDate(employee.joining_date)}</div>
          </div>
        </div>
      </div>

      <SecTitle>Leave Balance — {new Date().getFullYear()}</SecTitle>
      <div className="balance-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
        {balances.map(b => {
          const pct = b.total > 0 ? Math.round((b.used / b.total) * 100) : 0
          return (
            <div key={b.type_code} style={card}>
              <div style={{ fontSize: 11, color: C.textSec, marginBottom: 4 }}>{b.label}</div>
              <div style={{ fontSize: 28, fontWeight: 500, color: b.color, lineHeight: 1 }}>{b.remaining}</div>
              <div style={{ fontSize: 10, color: C.textTert, marginBottom: 9 }}>of {b.total} remaining</div>
              <div style={{ background: C.bgSec, borderRadius: 4, height: 3 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: b.color, borderRadius: 4 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                <span style={{ fontSize: 10, color: C.textTert }}>{b.used} used</span>
                {b.type_code === 'comp' && <span style={{ fontSize: 10, color: b.color }}>{b.total} earned</span>}
              </div>
            </div>
          )
        })}
      </div>

      {(holidaysThisMonth.length > 0 || birthdaysThisMonth.length > 0 || holidaysError || birthdaysError) && (
        <SecTitle>This Month</SecTitle>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: (holidaysThisMonth.length || holidaysError) && (birthdaysThisMonth.length || birthdaysError) ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 22 }}>
        {holidaysError ? (
          <div style={card}>
            <div style={{ fontSize: 13, color: C.red, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Couldn't load this section.</span>
              <button onClick={loadHolidays} style={{ background: 'transparent', border: `1px solid ${C.red}`, color: C.red, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Retry</button>
            </div>
          </div>
        ) : holidaysThisMonth.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: 11, color: C.textSec, marginBottom: 8 }}>📅 Upcoming Holidays</div>
            {holidaysThisMonth.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
                <span style={{ fontSize: 13 }}>{h.name}</span>
                <span style={{ fontSize: 11, color: C.textTert, flexShrink: 0, marginLeft: 8 }}>{formatDayMonth(h.holiday_date)}</span>
              </div>
            ))}
          </div>
        )}
        {birthdaysError ? (
          <div style={card}>
            <div style={{ fontSize: 13, color: C.red, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Couldn't load this section.</span>
              <button onClick={loadBirthdays} style={{ background: 'transparent', border: `1px solid ${C.red}`, color: C.red, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Retry</button>
            </div>
          </div>
        ) : birthdaysThisMonth.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: 11, color: C.textSec, marginBottom: 8 }}>🎂 Birthdays</div>
            {birthdaysThisMonth.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                <Avatar initials={b.avatar_initials} size={22} color={C.purple} bg={C.purpleBg} />
                <span style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
                  {b.full_name}{b.id === employee.id ? ' (You)' : ''}
                </span>
                <span style={{ fontSize: 11, color: C.textTert, flexShrink: 0 }}>{formatDayMonth(b.date_of_birth)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {compReqs.length > 0 && <>
        <SecTitle>Pending Comp Off Requests</SecTitle>
        {compReqs.map(c => (
          <div key={c.id} style={{ ...card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Worked {formatDate(c.worked_date)}</div>
              <div style={{ fontSize: 11, color: C.textSec }}>{c.worked_hours}h · {c.reason}</div>
            </div>
            <Badge status={c.status} />
          </div>
        ))}
      </>}

      {leaves.length > 0 && <>
        <SecTitle style={{ marginTop: 8 }}>Recent Leaves</SecTitle>
        {leaves.map(l => (
          <div key={l.id} style={{ ...card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>{l.leave_type} leave</div>
              <div style={{ fontSize: 11, color: C.textSec }}>{formatDate(l.from_date)} – {formatDate(l.to_date)} · {l.days}d</div>
            </div>
            <Badge status={l.status} />
          </div>
        ))}
      </>}
    </div>
  )
}
