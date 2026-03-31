import { useEffect, useMemo, useState } from 'react'
import {
  fetchOrCreateTimesheet, fetchTimesheetEntries, addTimesheetEntry,
  deleteTimesheetEntry, submitTimesheet, fetchJiraAccount, postJiraWorklog,
  fetchTimesheetHistory, markEntriesJiraSynced,
} from '../lib/api'
import { C, Field, SecTitle, Spinner, btnStyle, card, formatDate, inputStyle } from './UI'

// ── Week helpers ──────────────────────────────────────────────────────────────
function getMondayOf(offset = 0) {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function getWeekDays(weekStart) {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00')
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function fmtWeekLabel(ws) {
  return new Date(ws + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const DAY_LABELS  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_SHORT   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const today       = new Date().toISOString().split('T')[0]

// ── Status badge ──────────────────────────────────────────────────────────────
const TS_STATUS = {
  draft:     { bg: C.bgTert,   color: C.textSec, label: 'Draft'     },
  submitted: { bg: C.amberBg,  color: C.amber,   label: 'Submitted' },
  approved:  { bg: C.greenBg,  color: '#0F6E56', label: 'Approved'  },
  rejected:  { bg: C.redBg,    color: C.red,     label: 'Rejected'  },
}
function TsBadge({ status }) {
  const s = TS_STATUS[status] || TS_STATUS.draft
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
    }}>{s.label}</span>
  )
}

// ── Add entry inline form ─────────────────────────────────────────────────────
function EntryForm({ date, timesheetId, employeeId, jiraConnected, onSave, onCancel }) {
  const [form, setForm] = useState({ jira_issue_key: '', project: '', task_description: '', hours: '1' })
  const [errs, setErrs] = useState({})
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const e = {}
    if (!form.task_description.trim()) e.task_description = 'Required'
    const h = parseFloat(form.hours)
    if (!form.hours || isNaN(h) || h <= 0 || h > 24) e.hours = '0.5 – 24'
    if (Object.keys(e).length) { setErrs(e); return }
    setSaving(true)
    const { error } = await addTimesheetEntry({
      timesheet_id:     timesheetId,
      employee_id:      employeeId,
      date,
      jira_issue_key:   form.jira_issue_key.trim().toUpperCase() || null,
      project:          form.project.trim() || null,
      task_description: form.task_description.trim(),
      hours:            parseFloat(form.hours),
    })
    setSaving(false)
    if (error) { setErrs({ _: error.message }); return }
    onSave()
  }

  return (
    <div style={{ background: C.bgSec, borderRadius: 10, padding: 12, marginTop: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: jiraConnected ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 0 }}>
        {jiraConnected && (
          <Field label="Jira Issue (optional)">
            <input
              value={form.jira_issue_key}
              onChange={e => setForm(f => ({ ...f, jira_issue_key: e.target.value }))}
              placeholder="PROJ-123"
              style={{ ...inputStyle(), fontSize: 13 }}
            />
          </Field>
        )}
        <Field label="Project">
          <input
            value={form.project}
            onChange={e => setForm(f => ({ ...f, project: e.target.value }))}
            placeholder="Project / component"
            style={{ ...inputStyle(), fontSize: 13 }}
          />
        </Field>
      </div>
      <Field label="What did you work on?" error={errs.task_description}>
        <input
          value={form.task_description}
          onChange={e => setForm(f => ({ ...f, task_description: e.target.value }))}
          placeholder="Brief description of the task"
          style={{ ...inputStyle(errs.task_description), fontSize: 13 }}
          onKeyDown={e => e.key === 'Enter' && save()}
          autoFocus
        />
      </Field>
      <Field label="Hours" error={errs.hours}>
        <input
          type="number" min="0.5" max="24" step="0.5"
          value={form.hours}
          onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
          style={{ ...inputStyle(errs.hours), fontSize: 13, maxWidth: 100 }}
        />
      </Field>
      {errs._ && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{errs._}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ ...btnStyle(C.green, '#fff'), fontSize: 13, padding: '8px 20px' }}>
          {saving ? 'Adding…' : 'Add Entry'}
        </button>
        <button onClick={onCancel} style={{ ...btnStyle(C.bgTert, C.textSec), fontSize: 13, padding: '8px 14px' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Timesheet({ employee, onToast }) {
  const [weekOffset,   setWeekOffset]   = useState(0)
  const weekStart = getMondayOf(weekOffset)
  const weekDays  = getWeekDays(weekStart)

  const [timesheet,    setTimesheet]    = useState(null)
  const [entries,      setEntries]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [addingDay,    setAddingDay]    = useState(null)
  const [deleting,     setDeleting]     = useState(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [jiraConnected,setJiraConnected]= useState(false)
  const [syncJira,     setSyncJira]     = useState(false)
  const [history,      setHistory]      = useState([])
  const [showHistory,  setShowHistory]  = useState(false)
  const [rejectInput,  setRejectInput]  = useState(null)

  const load = async () => {
    setLoading(true)
    setAddingDay(null)
    const [{ data: ts, error }, { data: jira }] = await Promise.all([
      fetchOrCreateTimesheet(employee.id, weekStart),
      fetchJiraAccount(employee.id),
    ])
    if (error || !ts) { setLoading(false); onToast?.(error?.message, 'error'); return }
    setTimesheet(ts)
    setJiraConnected(!!jira)
    const { data: ents } = await fetchTimesheetEntries(ts.id)
    setEntries(ents || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [weekStart, employee.id])

  const totalHours = useMemo(() => entries.reduce((s, e) => s + (e.hours || 0), 0), [entries])
  const hoursPerDay = useMemo(() => {
    const map = {}
    for (const e of entries) map[e.date] = (map[e.date] || 0) + e.hours
    return map
  }, [entries])

  const reloadEntries = async () => {
    if (!timesheet) return
    const { data } = await fetchTimesheetEntries(timesheet.id)
    setEntries(data || [])
  }

  const handleDelete = async (id) => {
    setDeleting(id)
    await deleteTimesheetEntry(id)
    setEntries(p => p.filter(e => e.id !== id))
    setDeleting(null)
  }

  const handleSubmit = async () => {
    if (!timesheet || totalHours === 0) return
    setSubmitting(true)

    // Sync to Jira if opted in
    if (syncJira && jiraConnected) {
      const toSync = entries.filter(e => e.jira_issue_key && !e.jira_synced)
      const synced = []
      for (const entry of toSync) {
        const { error } = await postJiraWorklog({
          employee_id:          employee.id,
          issue_key:            entry.jira_issue_key,
          time_spent_seconds:   Math.round(entry.hours * 3600),
          comment:              entry.task_description,
          started:              entry.date + 'T09:00:00.000+0000',
        })
        if (!error) synced.push(entry.id)
      }
      if (synced.length) {
        await markEntriesJiraSynced(synced)
        setEntries(p => p.map(e => synced.includes(e.id) ? { ...e, jira_synced: true } : e))
      }
    }

    const { data, error } = await submitTimesheet(timesheet.id, totalHours)
    setSubmitting(false)
    if (error) { onToast(error.message, 'error'); return }
    setTimesheet(data)
    onToast('Timesheet submitted for approval')
  }

  const loadHistory = async () => {
    const { data } = await fetchTimesheetHistory(employee.id)
    setHistory(data || [])
    setShowHistory(true)
  }

  if (loading) return <Spinner />

  const isDraft      = timesheet?.status === 'draft'
  const isFutureWeek = weekOffset > 0
  const isCurrentWeek = weekOffset === 0

  const unsyncedJiraEntries = entries.filter(e => e.jira_issue_key && !e.jira_synced)

  return (
    <div>
      {/* ── Week navigator ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          style={{ ...btnStyle(C.bgSec, C.textSec), padding: '7px 14px', fontSize: 16 }}
        >‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: isCurrentWeek ? C.green : C.text }}>
            {isCurrentWeek ? 'This week' : isFutureWeek ? 'Future week' : `Week of ${fmtWeekLabel(weekStart)}`}
          </div>
          <div style={{ fontSize: 10, color: C.textTert, marginTop: 2 }}>
            {fmtWeekLabel(weekStart)} – {fmtWeekLabel(weekDays[4])}
          </div>
        </div>
        <button
          onClick={() => setWeekOffset(w => w + 1)}
          style={{ ...btnStyle(C.bgSec, C.textSec), padding: '7px 14px', fontSize: 16 }}
        >›</button>
      </div>

      {/* ── Summary bar ── */}
      <div style={{ ...card, background: C.bgSec, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, color: C.textTert, marginBottom: 4 }}>Total this week</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: totalHours >= 40 ? C.green : totalHours > 0 ? C.amber : C.textTert, lineHeight: 1 }}>
            {totalHours.toFixed(1)}h
          </div>
          <div style={{ fontSize: 10, color: C.textTert, marginTop: 3 }}>
            {totalHours >= 40 ? '✓ 40h target met' : `${(40 - totalHours).toFixed(1)}h remaining`}
          </div>
        </div>
        <TsBadge status={timesheet?.status} />
      </div>

      {/* Rejection reason */}
      {timesheet?.reject_reason && (
        <div style={{ background: C.redBg, color: C.red, fontSize: 12, padding: '10px 14px', borderRadius: 10, marginBottom: 14 }}>
          <strong>Rejected: </strong>{timesheet.reject_reason}
        </div>
      )}

      {/* ── Daily rows ── */}
      {weekDays.map((date, i) => {
        const dayEntries = entries.filter(e => e.date === date)
        const dayHours   = hoursPerDay[date] || 0
        const isPast     = date < today
        const isFuture   = date > today
        const isToday    = date === today
        const canAdd     = isDraft && !isFuture

        return (
          <div key={date} style={{ ...card, marginBottom: 12 }}>
            {/* Day header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: isToday ? C.green : isPast && dayHours >= 8 ? C.greenBg : isPast && dayHours > 0 ? C.amberBg : C.bgSec,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: isToday ? 'rgba(255,255,255,0.7)' : C.textTert }}>
                    {DAY_SHORT[i]}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: isToday ? '#fff' : C.text }}>
                    {new Date(date + 'T12:00:00').getDate()}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{DAY_LABELS[i]}</div>
                  <div style={{ fontSize: 11, color: dayHours >= 8 ? C.green : dayHours > 0 ? C.amber : C.textTert }}>
                    {dayHours > 0 ? `${dayHours}h logged` : isPast ? 'Nothing logged' : 'No entries yet'}
                  </div>
                </div>
              </div>
              {canAdd && (
                <button
                  onClick={() => setAddingDay(addingDay === date ? null : date)}
                  style={{
                    ...btnStyle(addingDay === date ? C.redBg : C.bgSec, addingDay === date ? C.red : C.textSec),
                    fontSize: 12, padding: '5px 12px', borderRadius: 20,
                  }}
                >
                  {addingDay === date ? '✕ Cancel' : '+ Add'}
                </button>
              )}
            </div>

            {/* Entries list */}
            {dayEntries.length > 0 && (
              <div style={{ borderTop: `0.5px solid ${C.border}`, marginTop: 10, paddingTop: 8 }}>
                {dayEntries.map(entry => (
                  <div key={entry.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '7px 0', borderBottom: `0.5px solid ${C.bgTert}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 2 }}>
                        {entry.jira_issue_key && (
                          <span style={{
                            background: C.blueBg, color: C.blue,
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                          }}>
                            {entry.jira_issue_key}
                          </span>
                        )}
                        {entry.project && (
                          <span style={{ fontSize: 11, color: C.textTert }}>{entry.project}</span>
                        )}
                        {entry.jira_synced && (
                          <span style={{ fontSize: 10, color: C.green }}>✓ Jira</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: C.text }}>{entry.task_description}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{entry.hours}h</span>
                      {isDraft && (
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={deleting === entry.id}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textTert, fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                        >×</button>
                      )}
                    </div>
                  </div>
                ))}
                <div style={{ paddingTop: 6, textAlign: 'right', fontSize: 12, fontWeight: 600, color: dayHours >= 8 ? C.green : C.amber }}>
                  {dayHours}h
                </div>
              </div>
            )}

            {/* Inline add form */}
            {addingDay === date && (
              <EntryForm
                date={date}
                timesheetId={timesheet.id}
                employeeId={employee.id}
                jiraConnected={jiraConnected}
                onSave={async () => { setAddingDay(null); await reloadEntries() }}
                onCancel={() => setAddingDay(null)}
              />
            )}
          </div>
        )
      })}

      {/* ── Submit section ── */}
      {isDraft && (
        <div style={{ ...card, marginTop: 4 }}>
          {jiraConnected && unsyncedJiraEntries.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSec, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={syncJira} onChange={e => setSyncJira(e.target.checked)} />
              Sync {unsyncedJiraEntries.length} Jira worklog{unsyncedJiraEntries.length > 1 ? 's' : ''} on submit
            </label>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || totalHours === 0}
            style={{
              ...btnStyle(C.green, '#fff'), width: '100%',
              opacity: (submitting || totalHours === 0) ? 0.6 : 1,
            }}
          >
            {submitting ? 'Submitting…' : 'Submit for Approval'}
          </button>
          {totalHours === 0 && (
            <div style={{ fontSize: 11, color: C.textTert, textAlign: 'center', marginTop: 6 }}>
              Log at least one entry before submitting
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      <div style={{ marginTop: 24 }}>
        <button
          onClick={showHistory ? () => setShowHistory(false) : loadHistory}
          style={{ ...btnStyle(C.bgSec, C.textSec), width: '100%', fontSize: 12 }}
        >
          {showHistory ? 'Hide history' : 'View past timesheets'}
        </button>
      </div>

      {showHistory && (
        <div style={{ marginTop: 12 }}>
          <SecTitle>Past timesheets</SecTitle>
          {history.length === 0
            ? <div style={{ color: C.textTert, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No past timesheets</div>
            : history.map(ts => (
              <div
                key={ts.id}
                style={{ ...card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => {
                  const diff = Math.round((new Date(ts.week_start + 'T12:00:00') - new Date(getMondayOf(0) + 'T12:00:00')) / (7 * 86400000))
                  setWeekOffset(diff)
                  setShowHistory(false)
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Week of {formatDate(ts.week_start)}</div>
                  <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{ts.total_hours}h logged</div>
                </div>
                <TsBadge status={ts.status} />
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}
