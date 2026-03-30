import { useEffect, useState } from 'react'
import {
  fetchPendingForApprover, fetchPendingCompForApprover,
  decideLeave, decideCompOff
} from '../lib/api'
import { Avatar, Badge, C, Empty, Spinner, btnStyle, card, formatDate } from './UI'

export default function Approvals({ employee, onToast }) {
  const [tab,      setTab]    = useState('comp')
  const [leaves,   setLeaves] = useState([])
  const [comps,    setComps]  = useState([])
  const [loading,  setLoading]= useState(true)
  const [deciding, setDeciding] = useState(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchPendingForApprover(employee.id),
      fetchPendingCompForApprover(employee.id),
    ]).then(([l, c]) => {
      setLeaves(l.data || [])
      setComps(c.data || [])
    }).finally(() => setLoading(false))
  }

  useEffect(load, [employee.id])

  const handleLeave = async (id, status) => {
    setDeciding(id)
    const { error } = await decideLeave(id, status)
    setDeciding(null)
    if (error) { onToast(error.message, 'error'); return }
    onToast(`Leave ${status}`)
    setLeaves(p => p.filter(l => l.id !== id))
  }

  const handleComp = async (id, status) => {
    setDeciding(id)
    const { error } = await decideCompOff(id, status)
    setDeciding(null)
    if (error) { onToast(error.message, 'error'); return }
    onToast(`Comp off ${status}`)
    setComps(p => p.filter(c => c.id !== id))
  }

  if (loading) return <Spinner />

  const TB = ({ id, label, count }) => (
    <button onClick={() => setTab(id)} style={{
      padding: '7px 16px', fontSize: 12, fontWeight: 500, borderRadius: 20,
      border: 'none', cursor: 'pointer',
      background: tab === id ? C.green : C.bgSec,
      color: tab === id ? '#fff' : C.textSec,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {label}
      {count > 0 && (
        <span style={{ background: tab === id ? 'rgba(255,255,255,0.3)' : '#E24B4A', color: '#fff', fontSize: 10, padding: '1px 5px', borderRadius: 8 }}>
          {count}
        </span>
      )}
    </button>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <TB id="comp"   label="Comp Off"       count={comps.length} />
        <TB id="leaves" label="Leave Requests"  count={leaves.length} />
      </div>

      {tab === 'comp' && (
        comps.length === 0 ? <Empty text="All comp off approvals done ✓" /> :
        comps.map(c => (
          <div key={c.id} style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar initials={c.employee?.avatar_initials} size={34} color={C.purple} bg={C.purpleBg} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{c.employee?.full_name}</div>
                <div style={{ fontSize: 11, color: C.textTert }}>{c.employee?.department} · Comp Off</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Date Worked</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(c.worked_date)}</div>
              </div>
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Hours / Earning</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{c.worked_hours}h → <span style={{ color: C.purple }}>+{c.earned_days}d</span></div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textSec, borderTop: `0.5px solid ${C.border}`, padding: '8px 0 10px' }}>{c.reason}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleComp(c.id, 'approved')} disabled={deciding === c.id} style={{ ...btnStyle(C.green, '#fff'), flex: 1 }}>Approve</button>
              <button onClick={() => handleComp(c.id, 'rejected')} disabled={deciding === c.id} style={{ ...btnStyle(C.bgSec, C.red, `0.5px solid #F09595`), flex: 1 }}>Reject</button>
            </div>
          </div>
        ))
      )}

      {tab === 'leaves' && (
        leaves.length === 0 ? <Empty text="All leave approvals done ✓" /> :
        leaves.map(l => (
          <div key={l.id} style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar initials={l.employee?.avatar_initials} size={34} color={C.blue} bg={C.blueBg} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{l.employee?.full_name}</div>
                <div style={{ fontSize: 11, color: C.textTert }}>{l.employee?.department} · {l.leave_type} leave</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Duration</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(l.from_date)} – {formatDate(l.to_date)}</div>
              </div>
              <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 10, color: C.textTert }}>Days</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{l.days} day{l.days > 1 ? 's' : ''}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textSec, borderTop: `0.5px solid ${C.border}`, padding: '8px 0 10px' }}>{l.reason}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleLeave(l.id, 'approved')} disabled={deciding === l.id} style={{ ...btnStyle(C.green, '#fff'), flex: 1 }}>Approve</button>
              <button onClick={() => handleLeave(l.id, 'rejected')} disabled={deciding === l.id} style={{ ...btnStyle(C.bgSec, C.red, `0.5px solid #F09595`), flex: 1 }}>Reject</button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
