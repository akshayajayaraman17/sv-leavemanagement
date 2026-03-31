import { useEffect, useState } from 'react'
import { fetchMyLeaves, fetchMyCompRequests } from '../lib/api'
import { Badge, C, Empty, SecTitle, Spinner, card, formatDate } from './UI'

export default function MyLeaves({ employee }) {
  const [tab,      setTab]      = useState('leaves')
  const [leaves,   setLeaves]   = useState([])
  const [comps,    setComps]    = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      fetchMyLeaves(employee.id),
      fetchMyCompRequests(employee.id),
    ]).then(([l, c]) => {
      setLeaves(l.data || [])
      setComps(c.data || [])
    }).finally(() => setLoading(false))
  }, [employee.id])

  if (loading) return <Spinner />

  const TB = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={{
      padding: '7px 16px', fontSize: 12, fontWeight: 500, borderRadius: 20,
      border: 'none', cursor: 'pointer',
      background: tab === id ? C.green : C.bgSec,
      color: tab === id ? '#fff' : C.textSec,
    }}>{label}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <TB id="leaves" label="Leave Requests" />
        <TB id="comp"   label="Comp Off" />
      </div>

      {tab === 'leaves' && (
        leaves.length === 0 ? <Empty text="No leave requests yet" /> :
        leaves.map(l => (
          <div key={l.id} style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>{l.leave_type} Leave</span>
              <Badge status={l.status} />
            </div>
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 4 }}>
              {formatDate(l.from_date)} – {formatDate(l.to_date)} · {l.days} day{l.days > 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 12, color: C.textTert }}>{l.reason}</div>
            {l.medical_certificate_url && (
              <a href={l.medical_certificate_url} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.blue, marginTop: 6 }}>
                📎 View medical certificate
              </a>
            )}
            {l.reject_reason && (
              <div style={{ fontSize: 11, color: C.red, marginTop: 6, background: C.redBg, padding: '5px 8px', borderRadius: 6 }}>
                Rejection reason: {l.reject_reason}
              </div>
            )}
            <div style={{ fontSize: 10, color: C.textTert, marginTop: 6 }}>Applied {formatDate(l.applied_on)}</div>
          </div>
        ))
      )}

      {tab === 'comp' && (
        comps.length === 0 ? <Empty text="No comp off requests yet" /> :
        comps.map(c => (
          <div key={c.id} style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 500 }}>Worked {formatDate(c.worked_date)}</span>
                <span style={{ fontSize: 11, color: C.purple, marginLeft: 8 }}>+{c.earned_days}d</span>
              </div>
              <Badge status={c.status} />
            </div>
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 4 }}>{c.worked_hours}h · {c.reason}</div>
            <div style={{ fontSize: 10, color: C.textTert }}>Applied {formatDate(c.applied_on)}</div>
          </div>
        ))
      )}
    </div>
  )
}
