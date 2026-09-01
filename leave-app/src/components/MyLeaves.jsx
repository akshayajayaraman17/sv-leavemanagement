import { useEffect, useState } from 'react'
import { fetchMyLeaves, fetchMyCompRequests, getMedicalCertificateUrl, cancelLeave } from '../lib/api'
import { Badge, Btn, C, Confirm, Empty, Mono, Spinner, Tabs, card, formatDate, inputStyle } from './UI'

const today = new Date().toISOString().split('T')[0]
const isCancellable = l => l.status === 'pending' || (l.status === 'approved' && l.from_date >= today)

export default function MyLeaves({ employee, onToast }) {
  const [tab, setTab]       = useState('leaves')
  const [leaves, setLeaves] = useState([])
  const [comps, setComps]   = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [yearFilter, setYearFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = () => {
    setLoading(true)
    Promise.all([fetchMyLeaves(employee.id), fetchMyCompRequests(employee.id)]).then(([l, c]) => {
      if (l.error || c.error) onToast?.((l.error || c.error).message || 'Failed to load some data', 'error')
      setLeaves(l.data || []); setComps(c.data || [])
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
    setCancelling(false); setConfirmCancel(null)
    if (error) { onToast?.(error.message, 'error'); return }
    onToast?.('Leave request cancelled'); load()
  }

  const years = Array.from(new Set([...leaves, ...comps].map(x => (x.from_date || x.worked_date || '').slice(0, 4)).filter(Boolean))).sort((a, b) => b - a)
  const fLeaves = leaves.filter(l => (yearFilter === 'all' || l.from_date?.slice(0, 4) === yearFilter) && (statusFilter === 'all' || l.status === statusFilter))
  const fComps = comps.filter(c => (yearFilter === 'all' || c.worked_date?.slice(0, 4) === yearFilter) && (statusFilter === 'all' || c.status === statusFilter))

  const filterSel = { ...inputStyle(), width: 'auto', padding: '7px 10px', fontSize: 12 }

  return (
    <div>
      {confirmCancel && (
        <Confirm
          msg={`Cancel your ${confirmCancel.leave_type} leave request for ${formatDate(confirmCancel.from_date)} – ${formatDate(confirmCancel.to_date)}?`}
          yesLabel="Cancel request"
          onYes={doCancel} onNo={() => setConfirmCancel(null)}
        />
      )}

      <Tabs items={[{ id: 'leaves', label: 'Leave requests' }, { id: 'comp', label: 'Comp off' }]} value={tab} onChange={setTab} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={filterSel}>
          <option value="all">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={filterSel}>
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {tab === 'leaves' && (fLeaves.length === 0 ? <Empty text={leaves.length === 0 ? 'No leave requests yet' : 'Nothing matches these filters'} /> :
        fLeaves.map(l => (
          <div key={l.id} style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>{l.leave_type} leave</span>
              <Badge status={l.status} />
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>
              {formatDate(l.from_date)} – {formatDate(l.to_date)} · <Mono>{l.days}</Mono> day{l.days !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>{l.reason}</div>
            {l.medical_certificate_url && (
              <button onClick={() => viewCertificate(l.medical_certificate_url)} style={{ fontSize: 11.5, color: C.blue, marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>View medical certificate</button>
            )}
            {l.reject_reason && (
              <div style={{ fontSize: 11.5, color: C.red, marginTop: 6, background: C.redBg, border: `1px solid ${C.redLine}`, padding: '5px 8px', borderRadius: 6 }}>Rejection reason: {l.reject_reason}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <div style={{ fontSize: 10.5, color: C.faint }}>Applied {formatDate(l.applied_on)}</div>
              {isCancellable(l) && <Btn sm variant="danger" disabled={cancelling} onClick={() => setConfirmCancel(l)}>Cancel request</Btn>}
            </div>
          </div>
        )))}

      {tab === 'comp' && (fComps.length === 0 ? <Empty text={comps.length === 0 ? 'No comp off requests yet' : 'Nothing matches these filters'} /> :
        fComps.map(c => (
          <div key={c.id} style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 500 }}>Worked {formatDate(c.worked_date)}</span>
                <span style={{ fontSize: 11.5, color: C.purple, marginLeft: 8 }}>+{c.earned_days}d</span>
              </div>
              <Badge status={c.status} />
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}><Mono>{c.worked_hours}h</Mono> · {c.reason}</div>
            <div style={{ fontSize: 10.5, color: C.faint }}>Applied {formatDate(c.applied_on)}</div>
          </div>
        )))}
    </div>
  )
}
