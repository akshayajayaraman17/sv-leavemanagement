import { useEffect, useState } from 'react'
import {
  fetchPendingForApprover, fetchPendingCompForApprover,
  decideLeave, decideCompOff,
  fetchPendingTimesheets, decideTimesheet, fetchTimesheetEntries,
  fetchPendingRegularizations, decideRegularization, updateAttendanceStatus,
  getMedicalCertificateUrl,
} from '../lib/api'
import { Avatar, Btn, C, Empty, Mono, Spinner, Tabs, card, formatDate, inputStyle } from './UI'

export default function Approvals({ employee, onToast }) {
  const [tab, setTab]             = useState('leaves')
  const [leaves, setLeaves]       = useState([])
  const [comps, setComps]         = useState([])
  const [timesheets, setTimesheets] = useState([])
  const [regs, setRegs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [deciding, setDeciding]   = useState(null)
  const [expandedTs, setExpandedTs] = useState(null)
  const [tsEntries, setTsEntries] = useState({})
  const [rejectId, setRejectId]   = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [selected, setSelected]   = useState(new Set())
  const [bulkBusy, setBulkBusy]   = useState(false)
  const [bulkRejecting, setBulkRejecting] = useState(false)
  const [bulkRejectReason, setBulkRejectReason] = useState('')
  const [bulkRejectItems, setBulkRejectItems] = useState({})

  const TAB_LABEL = { comp: 'comp off request', leaves: 'leave request', timesheets: 'timesheet', regs: 'regularization' }
  const currentList = tab === 'comp' ? comps : tab === 'leaves' ? leaves : tab === 'timesheets' ? timesheets : regs
  const needsReason = tab === 'timesheets' || tab === 'regs'

  const switchTab = (id) => {
    setTab(id); setSelected(new Set()); setBulkRejecting(false)
    setBulkRejectReason(''); setBulkRejectItems({}); setRejectId(null)
  }

  const toggleSelected = (id) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const allSelected = currentList.length > 0 && currentList.every(i => selected.has(i.id))
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(currentList.map(i => i.id)))

  const bulkDecide = async (status) => {
    if (status === 'rejected' && needsReason && !bulkRejectReason.trim()) { setBulkRejecting(true); return }
    setBulkBusy(true)
    const ids = Array.from(selected)
    const sharedReason = bulkRejectReason.trim() || null
    const reasonFor = (id) => (bulkRejectItems[id]?.trim() || sharedReason)

    const results = await Promise.all(ids.map(async (id) => {
      if (tab === 'comp')       return { id, ...(await decideCompOff(id, status)) }
      if (tab === 'leaves')     return { id, ...(await decideLeave(id, status)) }
      if (tab === 'timesheets') return { id, ...(await decideTimesheet(id, status, status === 'rejected' ? reasonFor(id) : null)) }
      const res = await decideRegularization(id, status, status === 'rejected' ? reasonFor(id) : null)
      if (!res.error && status === 'approved') {
        const reg = regs.find(r => r.id === id)
        if (reg) await updateAttendanceStatus(reg.attendance_id, 'present')
      }
      return { id, ...res }
    }))

    const succeeded = new Set(results.filter(r => !r.error).map(r => r.id))
    const failed = results.length - succeeded.size
    if (tab === 'comp')       setComps(p => p.filter(c => !succeeded.has(c.id)))
    if (tab === 'leaves')     setLeaves(p => p.filter(l => !succeeded.has(l.id)))
    if (tab === 'timesheets') setTimesheets(p => p.filter(t => !succeeded.has(t.id)))
    if (tab === 'regs')       setRegs(p => p.filter(r => !succeeded.has(r.id)))
    setBulkBusy(false); setBulkRejecting(false); setBulkRejectReason(''); setBulkRejectItems({}); setSelected(new Set())
    if (succeeded.size) onToast(`${succeeded.size} ${TAB_LABEL[tab]}${succeeded.size > 1 ? 's' : ''} ${status}${failed ? ` — ${failed} failed` : ''}`)
    else onToast('Bulk action failed', 'error')
  }

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchPendingForApprover(employee.id), fetchPendingCompForApprover(employee.id),
      fetchPendingTimesheets(employee.id), fetchPendingRegularizations(employee.id),
    ]).then(([l, c, ts, r]) => {
      const err = l.error || c.error || ts.error || r.error
      if (err) onToast(err.message || 'Failed to load some approvals', 'error')
      setLeaves(l.data || []); setComps(c.data || []); setTimesheets(ts.data || []); setRegs(r.data || [])
    }).finally(() => setLoading(false))
  }
  useEffect(load, [employee.id])

  const loadTsEntries = async (tsId) => {
    if (tsEntries[tsId]) { setExpandedTs(expandedTs === tsId ? null : tsId); return }
    const { data } = await fetchTimesheetEntries(tsId)
    setTsEntries(p => ({ ...p, [tsId]: data || [] }))
    setExpandedTs(tsId)
  }

  const viewCertificate = async (value) => {
    const { url, error } = await getMedicalCertificateUrl(value)
    if (error || !url) { onToast('Failed to load certificate', 'error'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleLeave = async (id, status) => {
    setDeciding(id)
    const { error } = await decideLeave(id, status)
    setDeciding(null)
    if (error) { onToast(error.message, 'error'); return }
    onToast(`Leave ${status}`); setLeaves(p => p.filter(l => l.id !== id))
  }
  const handleComp = async (id, status) => {
    setDeciding(id)
    const { error } = await decideCompOff(id, status)
    setDeciding(null)
    if (error) { onToast(error.message, 'error'); return }
    onToast(`Comp off ${status}`); setComps(p => p.filter(c => c.id !== id))
  }
  const handleTimesheet = async (id, status) => {
    if (status === 'rejected' && !rejectReason.trim()) { setRejectId(id); return }
    setDeciding(id)
    const { error } = await decideTimesheet(id, status, status === 'rejected' ? rejectReason : null)
    setDeciding(null); setRejectId(null); setRejectReason('')
    if (error) { onToast(error.message, 'error'); return }
    onToast(`Timesheet ${status}`); setTimesheets(p => p.filter(t => t.id !== id))
  }
  const handleRegularization = async (reg, status) => {
    setDeciding(reg.id)
    const { error } = await decideRegularization(reg.id, status, status === 'rejected' ? rejectReason : null)
    if (!error && status === 'approved') await updateAttendanceStatus(reg.attendance_id, 'present')
    setDeciding(null); setRejectId(null); setRejectReason('')
    if (error) { onToast(error.message, 'error'); return }
    onToast(`Regularization ${status}`); setRegs(p => p.filter(r => r.id !== reg.id))
  }

  if (loading) return <Spinner />

  const items = [
    { id: 'leaves', label: 'Leave requests', count: leaves.length },
    { id: 'comp', label: 'Comp off', count: comps.length },
    { id: 'timesheets', label: 'Timesheets', count: timesheets.length },
    { id: 'regs', label: 'Regularizations', count: regs.length },
  ]

  const chip = (k, v) => (
    <div style={{ background: C.bgSec, borderRadius: 8, padding: '7px 10px', border: `1px solid ${C.lineSoft}` }}>
      <div style={{ fontSize: 10, color: C.muted }}>{k}</div>
      <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{v}</div>
    </div>
  )
  const rowActions = (onApprove, onReject, id, rejectLabel = 'Reject') => (
    <div style={{ display: 'flex', gap: 8 }}>
      <Btn full disabled={deciding === id} onClick={onApprove}>Approve</Btn>
      <Btn full variant="danger" disabled={deciding === id} onClick={onReject}>{rejectLabel}</Btn>
    </div>
  )
  const rejectInput = () => (
    <input autoFocus value={rejectReason} onChange={e => setRejectReason(e.target.value)}
      placeholder="Reason for rejection…" style={{ ...inputStyle(true), marginBottom: 10 }} />
  )
  const bulkOverride = (id) => bulkRejecting && selected.has(id) && (
    <input value={bulkRejectItems[id] || ''} onChange={e => setBulkRejectItems(p => ({ ...p, [id]: e.target.value }))}
      placeholder="Override reason for this item (optional)" style={{ ...inputStyle(), marginBottom: 10, fontSize: 12 }} />
  )

  return (
    <div>
      <Tabs items={items} value={tab} onChange={switchTab} />

      {currentList.length > 0 && (
        <div style={{ ...card, marginBottom: 14, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.sub, cursor: 'pointer' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ accentColor: C.navy }} />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </label>
          {selected.size > 0 && !bulkRejecting && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Btn sm disabled={bulkBusy} onClick={() => bulkDecide('approved')}>{bulkBusy ? 'Approving…' : `Approve ${selected.size}`}</Btn>
              <Btn sm variant="danger" disabled={bulkBusy} onClick={() => bulkDecide('rejected')}>Reject {selected.size}</Btn>
            </div>
          )}
          {bulkRejecting && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flex: '1 1 240px' }}>
              <input autoFocus value={bulkRejectReason} onChange={e => setBulkRejectReason(e.target.value)}
                placeholder="Reason for rejection…" style={{ ...inputStyle(true), flex: 1 }} />
              <Btn sm variant="danger" disabled={bulkBusy || !bulkRejectReason.trim()} onClick={() => bulkDecide('rejected')} style={{ whiteSpace: 'nowrap' }}>
                {bulkBusy ? 'Rejecting…' : 'Confirm'}
              </Btn>
            </div>
          )}
        </div>
      )}

      {tab === 'leaves' && (leaves.length === 0 ? <Empty text="All leave approvals done" /> : leaves.map(l => (
        <div key={l.id} style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelected(l.id)} style={{ accentColor: C.navy }} />
            <Avatar initials={l.employee?.avatar_initials} size={32} bg={C.blueBg} color={C.blue} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{l.employee?.full_name}</div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'capitalize' }}>{l.employee?.department} · {l.leave_type} leave</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {chip('Duration', `${formatDate(l.from_date)} – ${formatDate(l.to_date)}`)}
            {chip('Days', <Mono>{l.days}</Mono>)}
          </div>
          <div style={{ fontSize: 12, color: C.sub, borderTop: `1px solid ${C.lineSoft}`, padding: '8px 0 6px' }}>{l.reason}</div>
          {l.medical_certificate_url && (
            <button onClick={() => viewCertificate(l.medical_certificate_url)} style={{ fontSize: 11.5, color: C.blue, marginBottom: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>View medical certificate</button>
          )}
          {rowActions(() => handleLeave(l.id, 'approved'), () => handleLeave(l.id, 'rejected'), l.id)}
        </div>
      )))}

      {tab === 'comp' && (comps.length === 0 ? <Empty text="All comp off approvals done" /> : comps.map(c => (
        <div key={c.id} style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} style={{ accentColor: C.navy }} />
            <Avatar initials={c.employee?.avatar_initials} size={32} bg={C.purpleBg} color={C.purple} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{c.employee?.full_name}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{c.employee?.department} · Comp off</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {chip('Date worked', formatDate(c.worked_date))}
            {chip('Hours → earning', <span><Mono>{c.worked_hours}h</Mono> → <span style={{ color: C.purple }}>+{c.earned_days}d</span></span>)}
          </div>
          <div style={{ fontSize: 12, color: C.sub, borderTop: `1px solid ${C.lineSoft}`, padding: '8px 0 10px' }}>{c.reason}</div>
          {rowActions(() => handleComp(c.id, 'approved'), () => handleComp(c.id, 'rejected'), c.id)}
        </div>
      )))}

      {tab === 'regs' && (regs.length === 0 ? <Empty text="No pending regularization requests" /> : regs.map(r => (
        <div key={r.id} style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelected(r.id)} style={{ accentColor: C.navy }} />
            <Avatar initials={r.employee?.avatar_initials} size={32} bg="#f6ecd9" color="#8a6a22" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{r.employee?.full_name}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{r.employee?.department} · Attendance regularization</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {chip('Date', formatDate(r.attendance?.date))}
            {chip('Check-in', r.attendance?.check_in_time ? new Date(r.attendance.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—')}
          </div>
          {r.check_out_time && <div style={{ marginBottom: 10 }}>{chip('Proposed check-out', r.check_out_time)}</div>}
          <div style={{ fontSize: 12, color: C.sub, borderTop: `1px solid ${C.lineSoft}`, padding: '8px 0 10px' }}><strong>Reason:</strong> {r.reason}</div>
          {rejectId === r.id && rejectInput()}
          {bulkOverride(r.id)}
          {rowActions(
            () => handleRegularization(r, 'approved'),
            () => { if (rejectId === r.id && rejectReason.trim()) handleRegularization(r, 'rejected'); else { setRejectId(r.id); setRejectReason('') } },
            r.id, rejectId === r.id ? 'Confirm reject' : 'Reject')}
        </div>
      )))}

      {tab === 'timesheets' && (timesheets.length === 0 ? <Empty text="No timesheets pending approval" /> : timesheets.map(ts => {
        const entries = tsEntries[ts.id] || []
        const isExpanded = expandedTs === ts.id
        const hpd = {}
        for (const e of entries) hpd[e.date] = (hpd[e.date] || 0) + e.hours
        return (
          <div key={ts.id} style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <input type="checkbox" checked={selected.has(ts.id)} onChange={() => toggleSelected(ts.id)} style={{ accentColor: C.navy }} />
              <Avatar initials={ts.employee?.avatar_initials} size={32} bg={C.greenBg} color="#1f7350" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{ts.employee?.full_name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{ts.employee?.department} · {ts.employee?.designation}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 500, color: ts.total_hours >= 40 ? '#1f7350' : '#8a6a22' }}>{ts.total_hours}h</div>
                <div style={{ fontSize: 10, color: C.muted }}>this week</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {chip('Week of', formatDate(ts.week_start))}
              {chip('Submitted', formatDate(ts.submitted_at))}
            </div>
            <Btn variant="subtle" full sm style={{ marginBottom: 10 }} onClick={() => loadTsEntries(ts.id)}>
              {isExpanded ? 'Hide entries' : 'View entries'}
            </Btn>
            {isExpanded && entries.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {Object.entries(entries.reduce((d, e) => { (d[e.date] = d[e.date] || []).push(e); return d }, {})).map(([date, de]) => (
                  <div key={date} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 4 }}>
                      {new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      <span style={{ marginLeft: 8, color: C.muted, fontWeight: 400, fontFamily: C.mono }}>{hpd[date]}h</span>
                    </div>
                    {de.map(e => (
                      <div key={e.id} style={{ background: C.bgSec, borderRadius: 8, padding: '6px 10px', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {e.jira_issue_key && <Mono style={{ background: C.blueBg, color: C.blue, fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 5, marginRight: 6 }}>{e.jira_issue_key}</Mono>}
                          <span style={{ fontSize: 12 }}>{e.task_description}</span>
                        </div>
                        <Mono style={{ fontSize: 12, fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>{e.hours}h</Mono>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {rejectId === ts.id && rejectInput()}
            {bulkOverride(ts.id)}
            {rowActions(
              () => handleTimesheet(ts.id, 'approved'),
              () => { if (rejectId === ts.id && rejectReason.trim()) handleTimesheet(ts.id, 'rejected'); else { setRejectId(ts.id); setRejectReason('') } },
              ts.id, rejectId === ts.id ? 'Confirm reject' : 'Reject')}
          </div>
        )
      }))}

      <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
        Approving a request updates the requester's balance immediately and notifies them.
      </div>
    </div>
  )
}
