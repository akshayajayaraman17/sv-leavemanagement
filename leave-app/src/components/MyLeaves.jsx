import { useEffect, useState } from 'react'
import {
  fetchMyLeaves, fetchMyCompRequests, fetchMyPermissions,
  getMedicalCertificateUrl, cancelLeave, cancelPermission,
} from '../lib/api'
import { formatDuration } from '../lib/permission'
import { Badge, Btn, C, Confirm, Empty, Mono, Spinner, Tabs, card, formatDate, inputStyle } from './UI'
import { todayStr } from '../lib/dates'

const today = todayStr()
const isCancellable = l => l.status === 'pending' || (l.status === 'approved' && l.from_date >= today)
const fmtTime = t => t ? t.slice(0, 5) : '—'

export default function MyLeaves({ employee, onToast }) {
  const [tab, setTab]       = useState('leaves')
  const [leaves, setLeaves] = useState([])
  const [comps, setComps]   = useState([])
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [confirmCancelPermission, setConfirmCancelPermission] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [yearFilter, setYearFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = () => {
    setLoading(true)
    Promise.all([fetchMyLeaves(employee.id), fetchMyCompRequests(employee.id), fetchMyPermissions(employee.id)]).then(([l, c, p]) => {
      if (l.error || c.error || p.error) onToast?.((l.error || c.error || p.error).message || 'Failed to load some data', 'error')
      setLeaves(l.data || []); setComps(c.data || []); setPermissions(p.data || [])
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
  const doCancelPermission = async () => {
    setCancelling(true)
    const { error } = await cancelPermission(confirmCancelPermission.id)
    setCancelling(false); setConfirmCancelPermission(null)
    if (error) { onToast?.(error.message, 'error'); return }
    onToast?.('Permission request cancelled'); load()
  }

  const years = Array.from(new Set([...leaves, ...comps, ...permissions].map(x => (x.from_date || x.worked_date || x.request_date || '').slice(0, 4)).filter(Boolean))).sort((a, b) => b - a)
  const fLeaves = leaves.filter(l => (yearFilter === 'all' || l.from_date?.slice(0, 4) === yearFilter) && (statusFilter === 'all' || l.status === statusFilter))
  const fComps = comps.filter(c => (yearFilter === 'all' || c.worked_date?.slice(0, 4) === yearFilter) && (statusFilter === 'all' || c.status === statusFilter))
  const fPermissions = permissions.filter(p => (yearFilter === 'all' || p.request_date?.slice(0, 4) === yearFilter) && (statusFilter === 'all' || p.status === statusFilter))

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
      {confirmCancelPermission && (
        <Confirm
          msg={`Cancel your permission request for ${formatDate(confirmCancelPermission.request_date)}, ${fmtTime(confirmCancelPermission.from_time)}–${fmtTime(confirmCancelPermission.to_time)}?`}
          yesLabel="Cancel request"
          onYes={doCancelPermission} onNo={() => setConfirmCancelPermission(null)}
        />
      )}

      <Tabs items={[{ id: 'leaves', label: 'Leave requests' }, { id: 'permission', label: 'Permission' }, { id: 'comp', label: 'Comp off' }]} value={tab} onChange={setTab} />

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

      {tab === 'permission' && (fPermissions.length === 0 ? <Empty text={permissions.length === 0 ? 'No permission requests yet' : 'Nothing matches these filters'} /> :
        fPermissions.map(p => (
          <div key={p.id} style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{formatDate(p.request_date)}</span>
              <Badge status={p.status} />
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>
              {fmtTime(p.from_time)} – {fmtTime(p.to_time)} · <Mono>{formatDuration(p.duration_minutes)}</Mono>
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>{p.reason}</div>
            {p.reject_reason && (
              <div style={{ fontSize: 11.5, color: C.red, marginTop: 6, background: C.redBg, border: `1px solid ${C.redLine}`, padding: '5px 8px', borderRadius: 6 }}>Rejection reason: {p.reject_reason}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <div style={{ fontSize: 10.5, color: C.faint }}>Applied {formatDate(p.applied_on)}</div>
              {p.status === 'pending' && <Btn sm variant="danger" disabled={cancelling} onClick={() => setConfirmCancelPermission(p)}>Cancel request</Btn>}
            </div>
          </div>
        )))}
    </div>
  )
}
