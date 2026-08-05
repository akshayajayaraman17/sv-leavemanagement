import { useEffect, useState } from 'react'
import { fetchMyLeaves, fetchMyCompRequests, getMedicalCertificateUrl, cancelLeave } from '../lib/api'
import { Badge, C, Confirm, Empty, Spinner, btnStyle, card, formatDate } from './UI'

const today = new Date().toISOString().split('T')[0]
const isCancellable = l => l.status === 'pending' || (l.status === 'approved' && l.from_date >= today)

export default function MyLeaves({ employee, onToast }) {
  const [tab,      setTab]      = useState('leaves')
  const [leaves,   setLeaves]   = useState([])
  const [comps,    setComps]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [cancelling,    setCancelling]    = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchMyLeaves(employee.id),
      fetchMyCompRequests(employee.id),
    ]).then(([l, c]) => {
      if (l.error || c.error) onToast?.((l.error || c.error).message || 'Failed to load some data', 'error')
      setLeaves(l.data || [])
      setComps(c.data || [])
    }).finally(() => setLoading(false))
  }
  useEffect(load, [employee.id])

  if (loading) return <Spinner />

  const viewCertificate = async (value) => {
    const { url, error } = await getMedicalCertificateUrl(value)
    if (error || !url) { onToast?.('Failed to load certificate', 'error'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const doCancel = async () => {
    setCancelling(true)
    const { error } = await cancelLeave(confirmCancel.id)
    setCancelling(false)
    setConfirmCancel(null)
    if (error) { onToast?.(error.message, 'error'); return }
    onToast?.('Leave request cancelled')
    load()
  }

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
      {confirmCancel && (
        <Confirm
          msg={`Cancel your ${confirmCancel.leave_type} leave request for ${formatDate(confirmCancel.from_date)} – ${formatDate(confirmCancel.to_date)}?`}
          onYes={doCancel}
          onNo={() => setConfirmCancel(null)}
        />
      )}

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
              <button
                onClick={() => viewCertificate(l.medical_certificate_url)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.blue, marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                📎 View medical certificate
              </button>
            )}
            {l.reject_reason && (
              <div style={{ fontSize: 11, color: C.red, marginTop: 6, background: C.redBg, padding: '5px 8px', borderRadius: 6 }}>
                Rejection reason: {l.reject_reason}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <div style={{ fontSize: 10, color: C.textTert }}>Applied {formatDate(l.applied_on)}</div>
              {isCancellable(l) && (
                <button
                  onClick={() => setConfirmCancel(l)}
                  disabled={cancelling}
                  style={{ ...btnStyle(C.redBg, C.red), padding: '4px 10px', fontSize: 11 }}
                >
                  Cancel Request
                </button>
              )}
            </div>
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
