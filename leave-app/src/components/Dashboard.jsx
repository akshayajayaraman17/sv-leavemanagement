import { useEffect, useState } from 'react'
import { fetchLeaveBalance, fetchMyLeaves, fetchMyCompRequests } from '../lib/api'
import { Avatar, Badge, C, SecTitle, Spinner, card, formatDate } from './UI'

export default function Dashboard({ employee }) {
  const [balances,  setBalances]  = useState([])
  const [leaves,    setLeaves]    = useState([])
  const [compReqs,  setCompReqs]  = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      fetchLeaveBalance(employee.id),
      fetchMyLeaves(employee.id),
      fetchMyCompRequests(employee.id),
    ]).then(([b, l, c]) => {
      setBalances(b.data || [])
      setLeaves((l.data || []).slice(0, 4))
      setCompReqs((c.data || []).filter(x => x.status === 'pending'))
    }).finally(() => setLoading(false))
  }, [employee.id])

  if (loading) return <Spinner />

  return (
    <div>
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
