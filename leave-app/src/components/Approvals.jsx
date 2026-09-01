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

  const rejectInput = () => (
    <input autoFocus value={rejectReason} onChange={e => setRejectReason(e.target.value)}
      placeholder="Reason for rejection…" style={{ ...inputStyle(true), marginBottom: 10 }} />
  )
  const bulkOverride = (id) => bulkRejecting && selected.has(id) && (
    <input value={bulkRejectItems[id] || ''} onChange={e => setBulkRejectItems(p => ({ ...p, [id]: e.target.value }))}
      placeholder="Override reason for this item (optional)" style={{ ...inputStyle(), marginBottom: 10, fontSize: 12 }} />
  )
  const fmtT = ts => ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'
  const apprBtn = { height: 32, padding: '0 14px', border: 'none', background: C.navy, borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }
  const rejBtn  = { height: 32, padding: '0 12px', border: `1px solid ${C.line}`, background: '#fff', borderRadius: 7, fontSize: 12.5, color: '#78859a', cursor: 'pointer', fontFamily: 'inherit' }

  const row = ({ id, initials, avBg, avFg, who, code, what, reason, after, flag, flagFg, onApprove, onReject, rejectLabel = 'Reject', children }) => (
    <div key={id} style={{ borderBottom: `1px solid ${C.rowLine}`, minWidth: 760, boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(180px,1fr) minmax(160px,1.1fr) 128px 168px', gap: 16, alignItems: 'center', padding: '15px 20px' }}>
        <input type="checkbox" checked={selected.has(id)} onChange={() => toggleSelected(id)} style={{ accentColor: C.navy, justifySelf: 'center' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <Avatar initials={initials} size={32} bg={avBg} color={avFg} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{who}</div>
            {code && <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{code}</div>}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: '#2b3648' }}>{what}</div>
          {reason && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>{reason}</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.body }}>{after}</div>
          {flag && <div style={{ fontSize: 11, color: flagFg || C.muted, marginTop: 2 }}>{flag}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
          <button onClick={onApprove} disabled={deciding === id} style={apprBtn}>Approve</button>
          <button onClick={onReject} disabled={deciding === id} style={rejBtn}>{rejectLabel}</button>
        </div>
      </div>
      {children && <div style={{ padding: '0 20px 14px 80px' }}>{children}</div>}
    </div>
  )

  const listCard = (rows) => (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div className="hscroll">
        {rows}
        <div style={{ padding: '14px 20px', background: C.bgSec, fontSize: 12, color: C.muted, minWidth: 760, boxSizing: 'border-box' }}>
          Approving a request updates the requester's balance immediately and notifies them.
        </div>
      </div>
    </div>
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

      {tab === 'leaves' && (leaves.length === 0 ? <Empty text="All leave approvals done" /> : listCard(leaves.map(l => row({
        id: l.id, initials: l.employee?.avatar_initials, avBg: C.blueBg, avFg: C.blue,
        who: l.employee?.full_name, code: l.employee?.employee_code || l.employee?.department,
        what: <span style={{ textTransform: 'capitalize' }}>{l.leave_type} leave · {formatDate(l.from_date)} – {formatDate(l.to_date)}</span>,
        reason: l.reason,
        after: `${l.days} day${l.days !== 1 ? 's' : ''}`,
        flag: l.medical_certificate_url
          ? <button onClick={() => viewCertificate(l.medical_certificate_url)} style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>Medical certificate</button>
          : null,
        onApprove: () => handleLeave(l.id, 'approved'), onReject: () => handleLeave(l.id, 'rejected'),
      }))))}

      {tab === 'comp' && (comps.length === 0 ? <Empty text="All comp off approvals done" /> : listCard(comps.map(c => row({
        id: c.id, initials: c.employee?.avatar_initials, avBg: C.purpleBg, avFg: C.purple,
        who: c.employee?.full_name, code: c.employee?.employee_code || c.employee?.department,
        what: `Comp off · worked ${formatDate(c.worked_date)}`,
        reason: c.reason,
        after: <>Earns <Mono>{c.earned_days}</Mono> day</>,
        flag: <><Mono>{c.worked_hours}h</Mono> logged</>, flagFg: '#3a76ad',
        onApprove: () => handleComp(c.id, 'approved'), onReject: () => handleComp(c.id, 'rejected'),
      }))))}

      {tab === 'regs' && (regs.length === 0 ? <Empty text="No pending regularization requests" /> : listCard(regs.map(r => row({
        id: r.id, initials: r.employee?.avatar_initials, avBg: '#f6ecd9', avFg: '#8a6a22',
        who: r.employee?.full_name, code: r.employee?.employee_code || r.employee?.department,
        what: `Regularisation · ${formatDate(r.attendance?.date)}`,
        reason: r.reason,
        after: `In ${fmtT(r.attendance?.check_in_time)}`,
        flag: r.check_out_time ? `Proposed out ${r.check_out_time}` : null,
        rejectLabel: rejectId === r.id ? 'Confirm reject' : 'Reject',
        onApprove: () => handleRegularization(r, 'approved'),
        onReject: () => { if (rejectId === r.id && rejectReason.trim()) handleRegularization(r, 'rejected'); else { setRejectId(r.id); setRejectReason('') } },
        children: (rejectId === r.id || (bulkRejecting && selected.has(r.id)))
          ? <>{rejectId === r.id && rejectInput()}{bulkOverride(r.id)}</>
          : null,
      }))))}

      {tab === 'timesheets' && (timesheets.length === 0 ? <Empty text="No timesheets pending approval" /> : listCard(timesheets.map(ts => {
        const entries = tsEntries[ts.id] || []
        const isExpanded = expandedTs === ts.id
        const byDay = entries.reduce((d, e) => { (d[e.date] = d[e.date] || []).push(e); return d }, {})
        return row({
          id: ts.id, initials: ts.employee?.avatar_initials, avBg: C.greenBg, avFg: '#1f7350',
          who: ts.employee?.full_name, code: ts.employee?.employee_code || ts.employee?.designation,
          what: `Timesheet · week of ${formatDate(ts.week_start)}`,
          reason: `Submitted ${formatDate(ts.submitted_at)}`,
          after: <span style={{ fontFamily: C.mono, color: ts.total_hours >= 40 ? '#1f7350' : '#8a6a22' }}>{ts.total_hours}h logged</span>,
          flag: <button onClick={() => loadTsEntries(ts.id)} style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>{isExpanded ? 'Hide entries' : 'View entries'}</button>,
          rejectLabel: rejectId === ts.id ? 'Confirm reject' : 'Reject',
          onApprove: () => handleTimesheet(ts.id, 'approved'),
          onReject: () => { if (rejectId === ts.id && rejectReason.trim()) handleTimesheet(ts.id, 'rejected'); else { setRejectId(ts.id); setRejectReason('') } },
          children: ((isExpanded && entries.length > 0) || rejectId === ts.id || (bulkRejecting && selected.has(ts.id))) ? (
              <>
                {isExpanded && entries.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    {Object.entries(byDay).map(([date, de]) => (
                      <div key={date} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 4 }}>
                          {new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                          <span style={{ marginLeft: 8, color: C.muted, fontWeight: 400, fontFamily: C.mono }}>{de.reduce((s, e) => s + e.hours, 0)}h</span>
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
              </>
            ) : null,
        })
      })))}
    </div>
  )
}
