import { useEffect, useMemo, useState } from 'react'
import {
  fetchOrCreateTimesheet, fetchTimesheetEntries, addTimesheetEntry,
  deleteTimesheetEntry, submitTimesheet, fetchJiraAccount, postJiraWorklog,
  fetchTimesheetHistory, markEntriesJiraSynced, fetchAttendanceHistory,
  requestLateTimesheetSubmission,
} from '../lib/api'
import { Badge, Btn, C, Field, Mono, SecTitle, Spinner, card, formatDate, inputStyle } from './UI'
import { toDateStr, todayStr } from '../lib/dates'

function getMondayOf(offset = 0) {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  return toDateStr(d)
}
function getWeekDays(weekStart) {
  return Array.from({ length: 5 }, (_, i) => { const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() + i); return toDateStr(d) })
}
function getFridayOf(weekStart) { const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() + 4); return toDateStr(d) }
function fmtWeekLabel(ws) { return new Date(ws + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_SHORT  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const today = todayStr()

function EntryForm({ date, timesheetId, employeeId, jiraConnected, attHours, dayTsHours, onSave, onCancel }) {
  const [form, setForm] = useState({ jira_issue_key: '', project: '', task_description: '', hours: '1' })
  const [errs, setErrs] = useState({})
  const [saving, setSaving] = useState(false)
  const remaining = (attHours || 0) - dayTsHours

  const save = async () => {
    const e = {}
    if (!form.task_description.trim()) e.task_description = 'Required'
    const h = parseFloat(form.hours)
    if (!form.hours || isNaN(h) || h <= 0 || h > 24) e.hours = '0.5 – 24'
    if (h > remaining && remaining > 0) e.hours = `Max ${remaining.toFixed(1)}h (attendance limit)`
    if (Object.keys(e).length) { setErrs(e); return }
    setSaving(true)
    const { error } = await addTimesheetEntry({
      timesheet_id: timesheetId, employee_id: employeeId, date,
      jira_issue_key: form.jira_issue_key.trim().toUpperCase() || null,
      project: form.project.trim() || null, task_description: form.task_description.trim(),
      hours: parseFloat(form.hours),
    })
    setSaving(false)
    if (error) { setErrs({ _: error.message }); return }
    onSave()
  }

  return (
    <div style={{ background: C.bgSec, borderRadius: 10, padding: 14, marginTop: 10 }}>
      {attHours > 0 && (
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontFamily: C.mono }}>
          Attendance {attHours.toFixed(1)}h · logged {dayTsHours.toFixed(1)}h · remaining {remaining.toFixed(1)}h
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: jiraConnected ? '1fr 1fr' : '1fr', gap: 8 }}>
        {jiraConnected && (
          <Field label="Jira issue (optional)"><input value={form.jira_issue_key} onChange={e => setForm(f => ({ ...f, jira_issue_key: e.target.value }))} placeholder="PROJ-123" style={{ ...inputStyle(), fontSize: 13 }} /></Field>
        )}
        <Field label="Project"><input value={form.project} onChange={e => setForm(f => ({ ...f, project: e.target.value }))} placeholder="Project / component" style={{ ...inputStyle(), fontSize: 13 }} /></Field>
      </div>
      <Field label="What did you work on?" error={errs.task_description}>
        <input value={form.task_description} onChange={e => setForm(f => ({ ...f, task_description: e.target.value }))} placeholder="Brief description of the task" style={{ ...inputStyle(errs.task_description), fontSize: 13 }} onKeyDown={e => e.key === 'Enter' && save()} autoFocus />
      </Field>
      <Field label="Hours" error={errs.hours}>
        <input type="number" min="0.5" max={remaining > 0 ? remaining : 24} step="0.5" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} style={{ ...inputStyle(errs.hours), fontSize: 13, maxWidth: 110, fontFamily: C.mono }} />
      </Field>
      {errs._ && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{errs._}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn sm disabled={saving} onClick={save}>{saving ? 'Adding…' : 'Add entry'}</Btn>
        <Btn sm variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  )
}

function LateRequestForm({ timesheet, onSubmit, onCancel }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!reason.trim()) return
    setSaving(true)
    const { error } = await requestLateTimesheetSubmission(timesheet.id, reason.trim())
    setSaving(false)
    if (error) return
    onSubmit()
  }
  return (
    <div style={{ ...card, background: '#fdfaf4', border: `1px solid ${C.amberLine}`, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#8a6a22', marginBottom: 6 }}>Late submission request</div>
      <div style={{ fontSize: 12, color: '#8a6a22', marginBottom: 12 }}>The deadline for this week has passed. Submit a reason to unlock the timesheet.</div>
      <Field label="Reason for late submission"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Was on leave, system issue…" style={inputStyle()} /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn full disabled={saving || !reason.trim()} onClick={submit}>{saving ? 'Submitting…' : 'Request unlock'}</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  )
}

export default function Timesheet({ employee, onToast }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = getMondayOf(weekOffset)
  const weekDays = getWeekDays(weekStart)
  const friday = getFridayOf(weekStart)

  const [timesheet, setTimesheet] = useState(null)
  const [entries, setEntries] = useState([])
  const [attMap, setAttMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [addingDay, setAddingDay] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [jiraConnected, setJiraConnected] = useState(false)
  const [syncJira, setSyncJira] = useState(false)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [showLateReq, setShowLateReq] = useState(false)

  const load = async () => {
    setLoading(true); setAddingDay(null)
    const [{ data: ts, error }, { data: jira }, { data: attData }] = await Promise.all([
      fetchOrCreateTimesheet(employee.id, weekStart), fetchJiraAccount(employee.id), fetchAttendanceHistory(employee.id, 30),
    ])
    if (error || !ts) { setLoading(false); onToast?.(error?.message, 'error'); return }
    setTimesheet(ts); setJiraConnected(!!jira)
    const map = {}
    for (const day of weekDays) { const att = (attData || []).find(a => a.date === day); if (att) map[day] = att }
    setAttMap(map)
    const { data: ents, error: entriesErr } = await fetchTimesheetEntries(ts.id)
    if (entriesErr) onToast?.(entriesErr.message || 'Failed to load timesheet entries', 'error')
    setEntries(ents || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [weekStart, employee.id])

  const totalHours = useMemo(() => entries.reduce((s, e) => s + (e.hours || 0), 0), [entries])
  const hoursPerDay = useMemo(() => { const m = {}; for (const e of entries) m[e.date] = (m[e.date] || 0) + e.hours; return m }, [entries])

  const reloadEntries = async () => { if (!timesheet) return; const { data } = await fetchTimesheetEntries(timesheet.id); setEntries(data || []) }
  const handleDelete = async (id) => { setDeleting(id); await deleteTimesheetEntry(id); setEntries(p => p.filter(e => e.id !== id)); setDeleting(null) }

  const isDeadlinePassed = today > friday
  const isCurrentWeek = weekOffset === 0
  const isFutureWeek = weekOffset > 0

  const getSubmitErrors = () => {
    const errors = []
    for (const day of weekDays) {
      if (day > today) continue
      const att = attMap[day]
      const tsHours = hoursPerDay[day] || 0
      if (!att || !att.check_in_time) { if (tsHours > 0) errors.push(`${DAY_SHORT[weekDays.indexOf(day)]}: No attendance record`); continue }
      if (att.check_in_time && !att.check_out_time) errors.push(`${DAY_SHORT[weekDays.indexOf(day)]}: Incomplete attendance (missing check-out)`)
      if (tsHours > (att.total_hours || 0)) errors.push(`${DAY_SHORT[weekDays.indexOf(day)]}: Timesheet ${tsHours}h exceeds attendance ${(att.total_hours || 0).toFixed(1)}h`)
    }
    return errors
  }

  const handleSubmit = async () => {
    if (!timesheet || totalHours === 0) return
    const submitErrors = getSubmitErrors()
    if (submitErrors.length > 0) { onToast(submitErrors[0], 'error'); return }
    setSubmitting(true)
    if (syncJira && jiraConnected) {
      const toSync = entries.filter(e => e.jira_issue_key && !e.jira_synced)
      const synced = []
      for (const entry of toSync) {
        const { error } = await postJiraWorklog({
          employee_id: employee.id, issue_key: entry.jira_issue_key,
          time_spent_seconds: Math.round(entry.hours * 3600), comment: entry.task_description,
          started: entry.date + 'T09:00:00.000+0000',
        })
        if (!error) synced.push(entry.id)
      }
      if (synced.length) { await markEntriesJiraSynced(synced); setEntries(p => p.map(e => synced.includes(e.id) ? { ...e, jira_synced: true } : e)) }
    }
    const { data, error } = await submitTimesheet(timesheet.id, totalHours)
    setSubmitting(false)
    if (error) { onToast(error.message, 'error'); return }
    setTimesheet(data); onToast('Timesheet submitted for approval')
  }

  const loadHistory = async () => { const { data } = await fetchTimesheetHistory(employee.id); setHistory(data || []); setShowHistory(true) }

  if (loading) return <Spinner />

  const isDraft = timesheet?.status === 'draft'
  const isLocked = isDeadlinePassed && isDraft && !isFutureWeek
  const submitErrors = getSubmitErrors()
  const unsyncedJira = entries.filter(e => e.jira_issue_key && !e.jira_synced)

  return (
    <div>
      {timesheet?.reject_reason && (
        <div style={{ background: C.redBg, color: C.red, border: `1px solid ${C.redLine}`, fontSize: 12, padding: '10px 14px', borderRadius: 10, marginBottom: 14 }}>
          <strong>Rejected: </strong>{timesheet.reject_reason}
        </div>
      )}

      {showLateReq && <LateRequestForm timesheet={timesheet} onSubmit={() => { setShowLateReq(false); load(); onToast('Late submission request sent') }} onCancel={() => setShowLateReq(false)} />}

      <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', borderBottom: '1px solid #eaeff6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}>‹</button>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: isCurrentWeek ? C.navy : C.ink }}>{isCurrentWeek ? 'This week' : isFutureWeek ? 'Future week' : `Week of ${fmtWeekLabel(weekStart)}`}</div>
              <div style={{ fontSize: 11.5, color: C.sub }}>{fmtWeekLabel(weekStart)} – {fmtWeekLabel(weekDays[4])}</div>
            </div>
            <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}>›</button>
          </div>
          <div style={{ width: 1, height: 34, background: '#eaeff6' }} />
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted }}>Logged</div>
            <div style={{ fontFamily: C.serif, fontSize: 23, lineHeight: 1.2 }}>{totalHours.toFixed(1)}<span style={{ fontSize: 13, color: C.faint, fontFamily: C.sans }}> of 40.0 h</span></div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Badge status={isLocked ? 'locked' : timesheet?.status} />
            {isDraft && !isLocked && (
              <Btn sm disabled={submitting || totalHours === 0 || submitErrors.length > 0} onClick={handleSubmit}>{submitting ? 'Submitting…' : 'Submit week'}</Btn>
            )}
            {isLocked && !showLateReq && <Btn sm variant="danger" onClick={() => setShowLateReq(true)}>Request unlock</Btn>}
          </div>
        </div>
        <div style={{ padding: '10px 24px', background: C.bgSec, borderBottom: '1px solid #eaeff6', fontSize: 11.5, color: C.sub }}>
          Hours can't exceed your attendance for the day · a full day is 8h or more · due Friday, end of day
        </div>

        {weekDays.map((date, i) => {
          const dayEntries = entries.filter(e => e.date === date)
          const dayTsHours = hoursPerDay[date] || 0
          const att = attMap[date]
          const attHours = att?.total_hours || 0
          const hasAtt = !!att?.check_in_time
          const isPast = date < today
          const isFuture = date > today
          const canAdd = isDraft && !isFuture && !isLocked && (hasAtt || !isPast)
          const attStatus = !hasAtt && isPast ? 'absent' : hasAtt && !att?.check_out_time ? 'incomplete' : hasAtt ? 'present' : null
          const exceeds = dayTsHours > attHours && attHours > 0
          const expanded = dayEntries.length > 0 || addingDay === date
          const cap = attHours ? `${(attHours - dayTsHours).toFixed(1)} of ${attHours.toFixed(1)} h available` : isPast && !hasAtt ? 'no attendance' : '—'
          const barPct = attHours ? Math.min(100, (dayTsHours / attHours) * 100) : 0
          const barFg = exceeds ? C.red : dayTsHours >= 8 ? '#1f7350' : '#3a76ad'
          const rowBg = exceeds ? '#fdf3f1' : attStatus === 'absent' ? '#fdfaf4' : 'transparent'
          const chip = isFuture ? { bg: '#edf1f7', fg: '#78859a' } : attStatus === 'absent' ? { bg: '#f6ecd9', fg: '#8a6a22' } : { bg: C.navy, fg: '#fff' }
          const dayBtn = (label, tone, onClick, disabled) => {
            const t = tone === 'add' ? { border: '#cfdff0', bg: '#f1f7fc', fg: C.navy }
              : tone === 'reg' ? { border: '#e7d5ad', bg: '#fff', fg: '#8a6a22' }
              : tone === 'cancel' ? { border: C.redLine, bg: '#fff', fg: C.red }
              : { border: C.line, bg: '#fff', fg: C.faint }
            return <button onClick={onClick} disabled={disabled} style={{ height: 30, padding: '0 12px', border: `1px solid ${t.border}`, background: t.bg, borderRadius: 7, fontSize: 12.5, color: t.fg, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit' }}>{label}</button>
          }

          return (
            <div key={date} style={{ borderBottom: '1px solid #f1f5fa', background: rowBg }}>
              <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0,1fr) 150px 96px', gap: 16, alignItems: 'center', padding: '15px 24px' }}>
                <div style={{ textAlign: 'center', borderRadius: 8, background: chip.bg, padding: '5px 0' }}>
                  <div style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: chip.fg, opacity: chip.fg === '#fff' ? 0.7 : 1 }}>{DAY_SHORT[i]}</div>
                  <Mono style={{ fontSize: 15, color: chip.fg }}>{new Date(date + 'T12:00:00').getDate()}</Mono>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{DAY_LABELS[i]}</div>
                  <div style={{ fontSize: 11.5, color: exceeds || attStatus === 'absent' || attStatus === 'incomplete' ? '#8a6a22' : C.sub, marginTop: 2 }}>
                    {exceeds ? `${dayTsHours}h — exceeds attendance` :
                     attStatus === 'absent' ? 'No attendance record — entry blocked' :
                     attStatus === 'incomplete' ? 'Incomplete attendance — regularize first' :
                     dayTsHours > 0 ? `${dayTsHours}h logged` :
                     isFuture ? 'Not yet worked' : hasAtt ? `${attHours.toFixed(1)}h attendance recorded` : 'No entries yet'}
                  </div>
                </div>
                <div>
                  <div style={{ height: 5, borderRadius: 3, background: '#eaeff6', overflow: 'hidden' }}>
                    <div style={{ height: 5, width: `${barPct}%`, background: barFg }} />
                  </div>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, marginTop: 6 }}>{cap}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {canAdd
                    ? dayBtn(addingDay === date ? 'Cancel' : 'Add hours', addingDay === date ? 'cancel' : 'add', () => setAddingDay(addingDay === date ? null : date))
                    : attStatus === 'absent' && isDraft
                      ? dayBtn('Regularise', 'reg', () => onToast('Raise a regularization from the Attendance screen'))
                      : isFuture && isDraft
                        ? dayBtn('Add', 'future', undefined, true)
                        : null}
                </div>
              </div>

              {expanded && (
                <div style={{ padding: '0 24px 14px' }}>
                  {dayEntries.length > 0 && (
                    <div style={{ borderTop: '1px solid #f1f5fa', paddingTop: 6 }}>
                      {dayEntries.map(entry => (
                        <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: `1px solid ${C.rowLine}` }}>
                          <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 2 }}>
                              {entry.jira_issue_key && <Mono style={{ background: C.blueBg, color: C.blue, fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 6 }}>{entry.jira_issue_key}</Mono>}
                              {entry.project && <span style={{ fontSize: 11, color: C.muted }}>{entry.project}</span>}
                              {entry.jira_synced && <span style={{ fontSize: 10, color: '#1f7350' }}>✓ Jira</span>}
                            </div>
                            <div style={{ fontSize: 13 }}>{entry.task_description}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <Mono style={{ fontSize: 13, fontWeight: 500 }}>{entry.hours}h</Mono>
                            {isDraft && !isLocked && (
                              <button onClick={() => handleDelete(entry.id)} disabled={deleting === entry.id} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, fontSize: 16, lineHeight: 1 }}>×</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {addingDay === date && (
                    <EntryForm date={date} timesheetId={timesheet.id} employeeId={employee.id} jiraConnected={jiraConnected}
                      attHours={attHours} dayTsHours={dayTsHours}
                      onSave={async () => { setAddingDay(null); await reloadEntries() }} onCancel={() => setAddingDay(null)} />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isDraft && !isLocked && submitErrors.length > 0 && (
        <div style={{ ...card, background: '#fdfaf4', border: `1px solid ${C.amberLine}`, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#8a6a22', marginBottom: 4 }}>Pre-submission issues</div>
          {submitErrors.map((e, i) => <div key={i} style={{ fontSize: 11.5, color: '#8a6a22', lineHeight: 1.6 }}>• {e}</div>)}
        </div>
      )}

      {isDraft && !isLocked && jiraConnected && unsyncedJira.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.sub, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={syncJira} onChange={e => setSyncJira(e.target.checked)} style={{ accentColor: C.navy }} />
          Sync {unsyncedJira.length} Jira worklog{unsyncedJira.length > 1 ? 's' : ''} on submit
        </label>
      )}

      <div style={{ marginTop: 20 }}>
        <Btn variant="subtle" full sm onClick={showHistory ? () => setShowHistory(false) : loadHistory}>
          {showHistory ? 'Hide history' : 'View past timesheets'}
        </Btn>
      </div>
      {showHistory && (
        <div style={{ marginTop: 12 }}>
          <SecTitle>Past timesheets</SecTitle>
          {history.length === 0 ? <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No past timesheets</div> :
            history.map(ts => (
              <div key={ts.id} style={{ ...card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => {
                  const diff = Math.round((new Date(ts.week_start + 'T12:00:00') - new Date(getMondayOf(0) + 'T12:00:00')) / (7 * 86400000))
                  setWeekOffset(diff); setShowHistory(false)
                }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Week of {formatDate(ts.week_start)}</div>
                  <div style={{ fontSize: 11.5, color: C.sub, fontFamily: C.mono }}>{ts.total_hours}h logged</div>
                </div>
                <Badge status={ts.status} />
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

const navBtn = { width: 28, height: 28, border: `1px solid ${C.line}`, background: '#fff', borderRadius: 7, color: C.sub, fontSize: 13, cursor: 'pointer' }
