import { useEffect, useMemo, useState } from 'react'
import {
  fetchEmployees, createEmployee, updateEmployee, deactivateEmployee, reactivateEmployee, resetEmployeePassword, renumberEmployeeCodes,
  fetchSalary, upsertSalary, fetchApprovers, setApprovers,
  fetchLeaveTypes, fetchLeaveAdjustments, upsertLeaveAdjustment, grantCompOff, adminAddLeave,
  fetchLeaveBalance, fetchHolidays, createHoliday, deleteHoliday, fetchAuditLog,
  fetchAllLeaveRequests, fetchAllAttendance,
  fetchMyLeaves, fetchTimesheetHistory, fetchTimesheetEntries, fetchAttendanceHistory, getMedicalCertificateUrl,
} from '../lib/api'
import { workingDays } from '../lib/leaveDays'
import { rowsToCsv, downloadCsv, parseCsv } from '../lib/csv'
import { printPayslip } from '../lib/payslip'
import { generateEmpCode } from '../lib/employeeCode'
import { toDateStr, todayStr } from '../lib/dates'
import BulkAddEmployees from './BulkAddEmployees'
import {
  Avatar, Badge, Btn, C, Confirm, Empty, Field, Modal, Mono, OffboardModal, Panel,
  ResetPasswordModal, SecTitle, Segmented, Spinner, card, inputStyle, formatDate,
} from './UI'

const ROLES = { admin: 'Admin', manager: 'Manager', employee: 'Employee' }
const DEPTS = ['Engineering', 'HR', 'Finance', 'Sales', 'Operations', 'Marketing', 'Design', 'Product']
const REGIONS = ['India', 'United States', 'United Kingdom']
const today = todayStr()

const noteBox = (tone) => ({
  ...card,
  background: tone === 'amber' ? C.amberBg : tone === 'purple' ? C.purpleBg : C.bgSec,
  border: `1px solid ${tone === 'amber' ? C.amberLine : tone === 'purple' ? C.purpleLine : C.line}`,
})

// ── Add/Edit Employee Form ────────────────────────────────────────────────────

function EmployeeForm({ initial, employees, onSave, onBack, onToast, onReset, onDeactivate, onReactivate }) {
  const isEdit = !!initial?.id
  const [form, setForm] = useState({
    full_name:    initial?.full_name    || '',
    email:        initial?.email        || '',
    phone:        initial?.phone        || '',
    employee_code:initial?.employee_code|| generateEmpCode(employees),
    department:   initial?.department   || '',
    designation:  initial?.designation  || '',
    location:     initial?.location     || '',
    role:         initial?.role         || 'employee',
    joining_date: initial?.joining_date || today,
    manager_id:   initial?.manager_id   || '',
    password:     '',
  })
  const [salary, setSalary]             = useState(null)
  const [approvers, setApproversState]  = useState([])
  const [selectedApprovers, setSelAppr] = useState([])
  const [leaveTypes, setLeaveTypes]     = useState([])
  const [leaveAdj, setLeaveAdj]         = useState({})   // { type_code: adjustment_value } — live-edited
  const [origLeaveAdj, setOrigLeaveAdj] = useState({})   // { type_code: adjustment_value } — as last saved
  const [leaveReasons, setLeaveReasons] = useState({})   // { type_code: reason }
  const [empBalance, setEmpBalance]     = useState([])
  const [compForm, setCompForm]         = useState({ workedDate: '', workedHours: '8', earnedDays: '1', reason: '' })
  const [compErrs, setCompErrs]         = useState({})
  const [compSaving, setCompSaving]     = useState(false)
  const [compDone, setCompDone]         = useState(false)
  const [errs, setErrs]                 = useState({})
  const [saving, setSaving]             = useState(false)
  const [activeTab, setActiveTab]       = useState('details')
  const [adminConfirmOpen, setAdminConfirmOpen] = useState(false)

  // Activity tab — leave/timesheet/attendance history, folded in from
  // what used to be Team's per-employee detail view so admins have one
  // place for everything instead of switching to a separate Team tab.
  const [activityLeaves,     setActivityLeaves]     = useState([])
  const [activityTimesheets, setActivityTimesheets] = useState([])
  const [activityAttendance, setActivityAttendance] = useState([])
  const [expandedTs, setExpandedTs] = useState(null)
  const [tsEntries,  setTsEntries]  = useState({})

  // Add Leave Record — lets an admin insert an already-approved leave
  // directly (backdating, regularizing something never applied for),
  // distinct from the entitlement adjustment below it.
  const [holidaySet, setHolidaySet]   = useState(new Set())
  const [addLeaveForm, setAddLeaveForm] = useState({ type: 'annual', from: '', to: '', reason: '' })
  const [addLeaveErrs, setAddLeaveErrs] = useState({})
  const [addingLeave,  setAddingLeave]  = useState(false)

  const activeOtherAdmins = employees.filter(e => e.role === 'admin' && e.is_active !== false && e.id !== initial?.id).length
  const isGrantingAdmin = form.role === 'admin' && (!isEdit || initial.role !== 'admin')
  const isLastAdminDemotion = isEdit && initial?.role === 'admin' && form.role !== 'admin' && activeOtherAdmins === 0

  useEffect(() => {
    if (isEdit) {
      fetchSalary(initial.id).then(({ data }) => setSalary(data || {}))
      fetchApprovers(initial.id).then(({ data, error }) => {
        if (error) onToast?.('Failed to load approvers', 'error')
        setSelAppr((data || []).map(a => a.approver_id))
      })
      fetchLeaveBalance(initial.id).then(({ data, error }) => {
        if (error) onToast?.('Failed to load leave balance', 'error')
        setEmpBalance(data || [])
      })
      fetchLeaveAdjustments(initial.id).then(({ data, error }) => {
        if (error) onToast?.('Failed to load leave adjustments', 'error')
        const adj = {}, reasons = {}
        for (const row of (data || [])) {
          adj[row.type_code]     = row.adjustment
          reasons[row.type_code] = row.reason || ''
        }
        setLeaveAdj(adj)
        setOrigLeaveAdj(adj)
        setLeaveReasons(reasons)
      })
      fetchMyLeaves(initial.id).then(({ data, error }) => {
        if (error) onToast?.('Failed to load leave history', 'error')
        setActivityLeaves(data || [])
      })
      fetchTimesheetHistory(initial.id).then(({ data, error }) => {
        if (error) onToast?.('Failed to load timesheets', 'error')
        setActivityTimesheets(data || [])
      })
      fetchAttendanceHistory(initial.id, 30).then(({ data, error }) => {
        if (error) onToast?.('Failed to load attendance', 'error')
        setActivityAttendance(data || [])
      })
    }
    setApproversState(employees.filter(e => e.id !== initial?.id))
    fetchLeaveTypes().then(({ data, error }) => {
      if (error) onToast?.('Failed to load leave types', 'error')
      setLeaveTypes(data || [])
    })
    fetchHolidays().then(({ data, error }) => {
      if (error) onToast?.('Failed to load holidays', 'error')
      setHolidaySet(new Set((data || []).map(h => h.holiday_date)))
    })
  }, [initial?.id])

  const [salForm, setSalForm] = useState({
    basic_salary: '', hra: '', transport_allowance: '',
    other_allowances: '', pf_deduction: '', tax_deduction: '',
    other_deductions: '', effective_from: today,
  })

  useEffect(() => {
    if (salary) setSalForm(prev => ({ ...prev, ...salary }))
  }, [salary])

  const gross = ['basic_salary','hra','transport_allowance','other_allowances']
    .reduce((s, k) => s + (parseFloat(salForm[k]) || 0), 0)
  const deductions = ['pf_deduction','tax_deduction','other_deductions']
    .reduce((s, k) => s + (parseFloat(salForm[k]) || 0), 0)
  const net = gross - deductions

  const validate = () => {
    const e = {}
    if (!form.full_name.trim())    e.full_name    = 'Required'
    if (!form.email.trim())        e.email        = 'Required'
    if (!form.employee_code.trim()) e.employee_code = 'Required'
    if (!form.joining_date)        e.joining_date = 'Required'
    if (!isEdit && !form.password) e.password     = 'Required'
    return e
  }

  const handleSaveClick = () => {
    const e = validate(); if (Object.keys(e).length) { setErrs(e); return }
    if (isLastAdminDemotion) { onToast('Cannot change role — at least one active admin must remain', 'error'); return }
    if (isGrantingAdmin) { setAdminConfirmOpen(true); return }
    save()
  }

  const save = async () => {
    setSaving(true)
    let empId = initial?.id

    if (isEdit) {
      const { error } = await updateEmployee(initial.id, {
        full_name:     form.full_name,
        phone:         form.phone,
        department:    form.department,
        designation:   form.designation,
        location:      form.location || null,
        role:          form.role,
        joining_date:  form.joining_date,
        manager_id:    form.manager_id || null,
        employee_code: form.employee_code,
      })
      if (error) { onToast(error.message, 'error'); setSaving(false); return }
    } else {
      const { data, error } = await createEmployee(form)
      if (error) {
        const msg = typeof error === 'string' ? error : (error.message || 'Failed to create employee')
        onToast(msg, 'error')
        setSaving(false)
        return
      }
      empId = data?.id
    }

    // Save salary
    if (empId) {
      await upsertSalary({ ...salForm, employee_id: empId })
      await setApprovers(empId, selectedApprovers)
      // Save leave / comp-off entitlement adjustments (edited either on the
      // Details balance panel or the Leave tab — both bind to leaveAdj).
      for (const lt of leaveTypes) {
        const adj  = parseFloat(leaveAdj[lt.code]) || 0
        const orig = parseFloat(origLeaveAdj[lt.code]) || 0
        if (adj !== orig || leaveReasons[lt.code]) {
          await upsertLeaveAdjustment({
            employee_id: empId,
            type_code:   lt.code,
            adjustment:  adj,
            reason:      leaveReasons[lt.code] || null,
          })
        }
      }
    }

    // Keep EMP-NNN codes in joining-date order: a new hire changes the
    // sequence, and so does editing an existing joining_date.
    if (!isEdit || form.joining_date !== initial.joining_date) {
      const { error } = await renumberEmployeeCodes()
      if (error) onToast('Saved, but renumbering codes failed: ' + (error.message || error), 'error')
    }

    setSaving(false)
    onToast(isEdit ? 'Employee updated' : 'Employee added successfully')
    onSave()
  }

  const formatTime = (ts) => {
    if (!ts) return '—'
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const loadTsEntries = async (tsId) => {
    if (expandedTs === tsId) { setExpandedTs(null); return }
    if (!tsEntries[tsId]) {
      const { data } = await fetchTimesheetEntries(tsId)
      setTsEntries(p => ({ ...p, [tsId]: data || [] }))
    }
    setExpandedTs(tsId)
  }

  const viewCertificate = async (value) => {
    const { url, error } = await getMedicalCertificateUrl(value)
    if (error || !url) { onToast?.('Failed to load certificate', 'error'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const addLeaveDays = useMemo(() => {
    if (!addLeaveForm.from || !addLeaveForm.to || new Date(addLeaveForm.to) < new Date(addLeaveForm.from)) return 0
    return workingDays(addLeaveForm.from, addLeaveForm.to, holidaySet)
  }, [addLeaveForm.from, addLeaveForm.to, holidaySet])

  const submitAddLeave = async () => {
    const e = {}
    if (!addLeaveForm.from)  e.from = 'Required'
    if (!addLeaveForm.to)    e.to   = 'Required'
    if (addLeaveForm.from && addLeaveForm.to && new Date(addLeaveForm.to) < new Date(addLeaveForm.from)) e.to = 'Must be after start'
    if (!addLeaveForm.reason.trim()) e.reason = 'Required'
    const bal = empBalance.find(b => b.type_code === addLeaveForm.type)
    if (bal && addLeaveDays > bal.remaining) e.to = `Only ${bal.remaining}d available — use the entitlement adjustment below to grant more first`
    if (Object.keys(e).length) { setAddLeaveErrs(e); return }

    setAddingLeave(true)
    const { error } = await adminAddLeave({
      employee_id: initial.id,
      leave_type:  addLeaveForm.type,
      from_date:   addLeaveForm.from,
      to_date:     addLeaveForm.to,
      days:        addLeaveDays,
      reason:      addLeaveForm.reason.trim(),
    })
    setAddingLeave(false)
    if (error) { onToast?.(error.message || 'Failed to add leave', 'error'); return }

    onToast?.('Leave added')
    setAddLeaveForm({ type: 'annual', from: '', to: '', reason: '' })
    setAddLeaveErrs({})
    fetchLeaveBalance(initial.id).then(({ data }) => setEmpBalance(data || []))
    fetchMyLeaves(initial.id).then(({ data }) => setActivityLeaves(data || []))
  }

  const validateCompForm = () => {
    const e = {}
    if (!compForm.workedDate) e.workedDate = 'Required'
    if (!compForm.earnedDays || parseFloat(compForm.earnedDays) <= 0) e.earnedDays = 'Required'
    if (!compForm.workedHours || parseFloat(compForm.workedHours) <= 0) e.workedHours = 'Required'
    if (!compForm.reason.trim()) e.reason = 'Required'
    return e
  }

  const saveCompOff = async () => {
    const e = validateCompForm(); if (Object.keys(e).length) { setCompErrs(e); return }
    setCompSaving(true)

    const { error } = await grantCompOff({
      employee_id:  initial.id,
      worked_date:  compForm.workedDate,
      worked_hours: parseFloat(compForm.workedHours),
      earned_days:  parseFloat(compForm.earnedDays),
      reason:       compForm.reason,
    })

    setCompSaving(false)
    if (error) { onToast(error.message || 'Failed to credit comp off', 'error'); return }

    setCompDone(true)
    setCompForm({ workedDate: '', workedHours: '8', earnedDays: '1', reason: '' })
    onToast('Comp off credited successfully')
  }

  const toggleApprover = (id) => setSelAppr(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const sec = { borderTop: `1px solid ${C.lineSoft}`, paddingTop: 20, marginTop: 22 }
  const TABS = isEdit
    ? [['details', 'Details'], ['salary', 'Salary'], ['leave', 'Leave'], ['approvers', 'Approvers'], ['activity', 'Activity']]
    : [['details', 'Details'], ['salary', 'Salary'], ['approvers', 'Approvers']]
  const tab = TABS.some(([id]) => id === activeTab) ? activeTab : 'details'

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 1080 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '22px 26px', borderBottom: `1px solid ${C.lineSoft}` }}>
        <Avatar initials={isEdit ? initial.avatar_initials : (form.full_name.slice(0, 2).toUpperCase() || '—')} size={46} bg={C.bgTert} color={C.sub} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: C.serif, fontSize: 22, lineHeight: 1.2 }}>{isEdit ? initial.full_name : (form.full_name || 'Add new employee')}</div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
            {[form.designation, form.department].filter(Boolean).join(' – ') || 'New employee'}
            {form.employee_code ? <> · <Mono>{form.employee_code}</Mono></> : null}
          </div>
        </div>
        <button onClick={onBack} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
      </div>

      {/* Tabs */}
      <div className="hscroll" style={{ display: 'flex', padding: '0 14px', borderBottom: `1px solid ${C.lineSoft}` }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{
              padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'inherit',
              color: tab === id ? C.navy : C.sub,
              borderBottom: `2px solid ${tab === id ? C.navy : 'transparent'}`, marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '22px 26px 24px' }}>
        {/* Details */}
        {tab === 'details' && (
        <div className="split-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 28, alignItems: 'start' }}>
        <div>
          <SecTitle>Employment details</SecTitle>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <Field label="Full name" error={errs.full_name}>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={inputStyle(errs.full_name)} placeholder="Jane Smith" />
            </Field>
            <Field
              label="Employee code" error={errs.employee_code}
              hint={isEdit
                ? 'Codes are renumbered by joining date whenever a joining date changes.'
                : 'Provisional — reassigned by joining-date order across the roster when you save.'}
            >
              <input value={form.employee_code} onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))} style={{ ...inputStyle(errs.employee_code), background: !isEdit ? C.bgSec : undefined }} placeholder="EMP-001" readOnly={!isEdit} />
            </Field>
          </div>
          <Field label="Work email" error={errs.email}>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle(errs.email)} placeholder="jane@company.com" disabled={isEdit} />
          </Field>
          {!isEdit && (
            <Field label="Temporary password" error={errs.password} hint="They'll be required to set their own password on first login.">
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={inputStyle(errs.password)} placeholder="Min 8 characters" />
            </Field>
          )}
          <Field label="Phone">
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle()} placeholder="+91 98765 43210" />
          </Field>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <Field label="Department">
              <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} style={inputStyle()}>
                <option value="">— Select —</option>
                {DEPTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Designation">
              <input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} style={inputStyle()} placeholder="Software Engineer" />
            </Field>
          </div>
          <Field label="Location" hint="Determines which regional company holidays apply to this employee.">
            <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={inputStyle()}>
              <option value="">— Select —</option>
              {REGIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <Field label="Role">
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inputStyle()}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Date of joining" error={errs.joining_date}>
              <input type="date" value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} style={inputStyle(errs.joining_date)} />
            </Field>
          </div>
          <Field label="Reporting manager">
            <select value={form.manager_id} onChange={e => setForm(f => ({ ...f, manager_id: e.target.value }))} style={inputStyle()}>
              <option value="">— No manager —</option>
              {employees.filter(e => e.id !== initial?.id && e.role !== 'employee').map(e => (
                <option key={e.id} value={e.id}>{e.full_name} ({ROLES[e.role]})</option>
              ))}
            </select>
          </Field>

          {isEdit && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 12 }}>
                <span style={{ color: C.sub }}>Status</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: initial.is_active ? '#1f7350' : C.red }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: initial.is_active ? C.greenDot : C.red }} />
                  {initial.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn variant="ghost" sm onClick={onReset}>Reset password</Btn>
                {initial.is_active
                  ? <Btn variant="danger" sm onClick={onDeactivate}>Deactivate employee</Btn>
                  : <Btn variant="ghost" sm onClick={onReactivate}>Reactivate employee</Btn>}
              </div>
            </div>
          )}
        </div>

        {/* Leave & comp off balance + save */}
        <div>
          {isEdit && empBalance.length > 0 && (
            <>
              <SecTitle>Leave &amp; comp off balance</SecTitle>
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                {empBalance.map((b, i) => {
                  const base    = b.total - (parseFloat(origLeaveAdj[b.type_code]) || 0)
                  const edited  = leaveAdj[b.type_code]
                  const shown   = edited === undefined || edited === '' ? b.total : base + (parseFloat(edited) || 0)
                  const changed = String(shown) !== String(b.total)
                  return (
                    <div key={b.type_code} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 60px 60px', gap: 10, alignItems: 'center', padding: '11px 14px', borderTop: i ? `1px solid ${C.rowLine}` : 'none' }}>
                      <span style={{ fontSize: 12.5, color: C.body }}>{b.label}</span>
                      <input value={b.used} readOnly tabIndex={-1} style={{ ...inputStyle(), textAlign: 'center', padding: '7px 2px', background: C.bgSec, color: C.muted }} />
                      <input type="number" step="0.5" value={shown}
                        onChange={e => {
                          const v = e.target.value
                          setLeaveAdj(a => ({ ...a, [b.type_code]: v === '' ? '' : String((parseFloat(v) || 0) - base) }))
                        }}
                        style={{ ...inputStyle(), textAlign: 'center', padding: '7px 2px', borderColor: changed ? C.navy : undefined }} />
                    </div>
                  )
                })}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 60px 60px', gap: 10, padding: '2px 14px 9px' }}>
                  <span />
                  <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.faint, textAlign: 'center' }}>used</span>
                  <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.faint, textAlign: 'center' }}>total</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.faint, margin: '8px 0 16px' }}>Editing a total adjusts the employee's entitlement — applied on Save. Detailed adjustments with a note live in the Leave tab.</div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn disabled={saving} onClick={handleSaveClick} style={{ minWidth: 150 }}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add employee'}
            </Btn>
            <Btn variant="ghost" onClick={onBack}>Cancel</Btn>
          </div>
        </div>
        </div>
        )}

      {/* Salary */}
      {tab === 'salary' && (
      <div>
          <SecTitle>Salary</SecTitle>
          <div style={{ ...card, background: C.bgSec, marginBottom: 16 }}>
            <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[['Gross', gross, C.ink], ['Deductions', deductions, C.red], ['Net', net, C.navy]].map(([label, val, color]) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                  <div style={{ fontFamily: C.serif, fontSize: 20, color, marginTop: 3 }}>₹{val.toLocaleString('en-IN')}</div>
                </div>
              ))}
            </div>
          </div>
          <SecTitle>Earnings</SecTitle>
          {[['basic_salary','Basic salary'],['hra','HRA'],['transport_allowance','Transport allowance'],['other_allowances','Other allowances']].map(([k, label]) => (
            <Field key={k} label={label}>
              <input type="number" min={0} value={salForm[k]} onChange={e => setSalForm(f => ({ ...f, [k]: e.target.value }))} style={inputStyle()} placeholder="0" />
            </Field>
          ))}
          <SecTitle style={{ marginTop: 8 }}>Deductions</SecTitle>
          {[['pf_deduction','PF deduction'],['tax_deduction','Tax (TDS)'],['other_deductions','Other deductions']].map(([k, label]) => (
            <Field key={k} label={label}>
              <input type="number" min={0} value={salForm[k]} onChange={e => setSalForm(f => ({ ...f, [k]: e.target.value }))} style={inputStyle()} placeholder="0" />
            </Field>
          ))}
          <Field label="Effective from">
            <input type="date" value={salForm.effective_from} onChange={e => setSalForm(f => ({ ...f, effective_from: e.target.value }))} style={inputStyle()} />
          </Field>
          {isEdit && (
            <Btn variant="ghost" sm style={{ marginTop: 4 }}
              onClick={() => printPayslip({ employee: { ...initial, ...form }, salary: salForm })}>
              Print / download payslip
            </Btn>
          )}
          <div style={{ ...sec, display: 'flex', gap: 10 }}>
            <Btn disabled={saving} onClick={handleSaveClick} style={{ minWidth: 150 }}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add employee'}
            </Btn>
            <Btn variant="ghost" onClick={onBack}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Leave */}
      {tab === 'leave' && isEdit && (
        <div>
          <div style={{ ...card, marginBottom: 16 }}>
            <SecTitle>Add leave record</SecTitle>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.6 }}>
              Records an already-approved leave directly — for backdating or regularizing something the employee never applied for. Deducts from their balance immediately.
            </div>
            <Field label="Leave type">
              <select value={addLeaveForm.type} onChange={e => setAddLeaveForm(f => ({ ...f, type: e.target.value }))} style={inputStyle()}>
                {leaveTypes.filter(lt => !lt.is_comp_off).map(lt => <option key={lt.code} value={lt.code}>{lt.label}</option>)}
              </select>
            </Field>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <Field label="From" error={addLeaveErrs.from}>
                <input type="date" value={addLeaveForm.from} onChange={e => setAddLeaveForm(f => ({ ...f, from: e.target.value }))} style={inputStyle(addLeaveErrs.from)} />
              </Field>
              <Field label="To" error={addLeaveErrs.to}>
                <input type="date" value={addLeaveForm.to} onChange={e => setAddLeaveForm(f => ({ ...f, to: e.target.value }))} style={inputStyle(addLeaveErrs.to)} />
              </Field>
            </div>
            <Field label="Reason" error={addLeaveErrs.reason}>
              <input value={addLeaveForm.reason} onChange={e => setAddLeaveForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Regularizing unplanned absence on 12 Aug" style={inputStyle(addLeaveErrs.reason)} />
            </Field>
            {addLeaveDays > 0 && (
              <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 10 }}><Mono>{addLeaveDays}</Mono> working day{addLeaveDays !== 1 ? 's' : ''}</div>
            )}
            <Btn full disabled={addingLeave} onClick={submitAddLeave}>{addingLeave ? 'Adding…' : 'Add leave'}</Btn>
          </div>

          <div style={{ ...noteBox('amber'), marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#8a6a22', marginBottom: 4 }}>Admin leave override</div>
            <div style={{ fontSize: 12, color: '#8a6a22', lineHeight: 1.6 }}>
              Adjust an employee's leave entitlement. Positive numbers add days, negative numbers deduct. Changes apply immediately to their balance.
            </div>
          </div>
          {leaveTypes.filter(lt => !lt.is_comp_off).map(lt => {
            const currentTotal = empBalance.find(b => b.type_code === lt.code)?.total ?? lt.annual_days
            const origAdj = parseFloat(origLeaveAdj[lt.code]) || 0
            const newAdj  = parseFloat(leaveAdj[lt.code]) || 0
            const newTotal = currentTotal - origAdj + newAdj
            return (
              <div key={lt.code} style={{ ...card, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: lt.color, flexShrink: 0 }} />
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{lt.label}</div>
                  <div style={{ fontSize: 11, color: C.faint, marginLeft: 'auto' }}>Current: <Mono>{currentTotal}</Mono> days</div>
                </div>
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                  <Field label="Adjustment (days)">
                    <input
                      type="number" step="0.5"
                      value={leaveAdj[lt.code] ?? ''}
                      onChange={e => setLeaveAdj(a => ({ ...a, [lt.code]: e.target.value }))}
                      placeholder="e.g. +3 or -2"
                      style={inputStyle()}
                    />
                  </Field>
                  <Field label="Reason">
                    <input
                      value={leaveReasons[lt.code] || ''}
                      onChange={e => setLeaveReasons(r => ({ ...r, [lt.code]: e.target.value }))}
                      placeholder="Optional note"
                      style={inputStyle()}
                    />
                  </Field>
                </div>
                {leaveAdj[lt.code] && (
                  <div style={{ fontSize: 11.5, color: C.sub, marginTop: 4 }}>
                    New total: <Mono>{newTotal}</Mono> days
                  </div>
                )}
              </div>
            )
          })}

          <div style={sec}>
          <SecTitle>Credit comp off</SecTitle>
          <div style={{ ...noteBox('purple'), marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#4b3fb0', marginBottom: 4 }}>Manually credit comp off</div>
            <div style={{ fontSize: 12, color: '#4b3fb0', lineHeight: 1.6 }}>
              Manually add approved comp off days for this employee. This creates an immediately approved comp off record so the balance is updated right away.
            </div>
          </div>
          {compDone ? (
            <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <div style={{ fontFamily: C.serif, fontSize: 19, marginBottom: 6 }}>Comp off credited</div>
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 18 }}>The employee's comp off balance has been updated.</div>
              <Btn onClick={() => setCompDone(false)}>Add another</Btn>
            </div>
          ) : (
            <>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <Field label="Worked date" error={compErrs.workedDate}>
                  <input type="date" value={compForm.workedDate} onChange={e => { setCompForm(f => ({ ...f, workedDate: e.target.value })); setCompErrs({}) }} style={inputStyle(compErrs.workedDate)} />
                </Field>
                <Field label="Hours worked" error={compErrs.workedHours}>
                  <input type="number" min="0" step="0.5" value={compForm.workedHours} onChange={e => { setCompForm(f => ({ ...f, workedHours: e.target.value })); setCompErrs({}) }} style={inputStyle(compErrs.workedHours)} />
                </Field>
              </div>
              <Field label="Comp off days" error={compErrs.earnedDays}>
                <input type="number" min="0.5" step="0.5" value={compForm.earnedDays} onChange={e => { setCompForm(f => ({ ...f, earnedDays: e.target.value })); setCompErrs({}) }} style={inputStyle(compErrs.earnedDays)} />
              </Field>
              <Field label="Reason" error={compErrs.reason}>
                <textarea rows={3} value={compForm.reason} onChange={e => { setCompForm(f => ({ ...f, reason: e.target.value })); setCompErrs({}) }} style={{ ...inputStyle(compErrs.reason), resize: 'vertical' }} placeholder="Reason for crediting comp off" />
              </Field>
              <Btn full disabled={compSaving} onClick={saveCompOff}>{compSaving ? 'Saving…' : 'Credit comp off'}</Btn>
            </>
          )}
          </div>
        </div>
      )}

      {/* Approvers */}
      {tab === 'approvers' && (
      <div>
          <SecTitle>Approvers</SecTitle>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
            Select up to 3 approvers for this employee's leave and comp off requests. Requests go to approver #1 first, then #2, then #3. If none selected, the reporting manager is used.
          </div>
          {approvers.length === 0 ? <Empty text="No other employees found" /> : (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {approvers.map((e, i, arr) => (
                <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${C.rowLine}` : 'none', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedApprovers.includes(e.id)} onChange={() => toggleApprover(e.id)} />
                  <Avatar initials={e.avatar_initials} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{e.full_name}</div>
                    <div style={{ fontSize: 11, color: C.sub }}>{ROLES[e.role]} {e.department ? `· ${e.department}` : ''}</div>
                  </div>
                  {selectedApprovers.includes(e.id) && (
                    <span style={{ background: C.navyBg, color: C.navy, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, fontFamily: C.mono }}>
                      #{selectedApprovers.indexOf(e.id) + 1}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
          {selectedApprovers.length > 0 && (
            <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>
              {selectedApprovers.length} approver{selectedApprovers.length > 1 ? 's' : ''} — requests route to #1 first
            </div>
          )}
          <div style={{ ...sec, display: 'flex', gap: 10 }}>
            <Btn disabled={saving} onClick={handleSaveClick} style={{ minWidth: 150 }}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add employee'}
            </Btn>
            <Btn variant="ghost" onClick={onBack}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Activity — read-only history, folded in from Team */}
      {tab === 'activity' && isEdit && (
        <div>
          <SecTitle>Leave history</SecTitle>
          {activityLeaves.length === 0 ? <Empty text="No leave requests" /> :
            activityLeaves.map(l => (
              <div key={l.id} style={{ ...card, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>{l.leave_type} leave</span>
                  <Badge status={l.status} />
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginBottom: 3 }}>
                  {formatDate(l.from_date)} – {formatDate(l.to_date)} · <Mono>{l.days}</Mono> day{l.days > 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>{l.reason}</div>
                {l.medical_certificate_url && (
                  <button
                    onClick={() => viewCertificate(l.medical_certificate_url)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.blue, marginTop: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                    Medical certificate
                  </button>
                )}
                {l.reject_reason && (
                  <div style={{ fontSize: 11.5, color: C.red, marginTop: 5, background: C.redBg, border: `1px solid ${C.redLine}`, padding: '4px 8px', borderRadius: 6 }}>
                    Rejected: {l.reject_reason}
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: C.faint, marginTop: 5 }}>Applied {formatDate(l.applied_on)}</div>
              </div>
            ))
          }

          <SecTitle style={{ marginTop: 18 }}>Timesheets</SecTitle>
          {activityTimesheets.length === 0 ? <Empty text="No timesheets yet" /> :
            activityTimesheets.map(ts => {
              const entries = tsEntries[ts.id] || []
              return (
                <div key={ts.id} style={{ ...card, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>Week of {formatDate(ts.week_start)}</div>
                      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2, fontFamily: C.mono }}>
                        {ts.total_hours}h logged
                        {ts.submitted_at && ` · submitted ${formatDate(ts.submitted_at)}`}
                      </div>
                    </div>
                    <Badge status={ts.status} />
                  </div>
                  {ts.reject_reason && (
                    <div style={{ fontSize: 11.5, color: C.red, background: C.redBg, border: `1px solid ${C.redLine}`, padding: '4px 8px', borderRadius: 6, marginBottom: 6 }}>
                      Rejected: {ts.reject_reason}
                    </div>
                  )}
                  <Btn variant="subtle" full sm onClick={() => loadTsEntries(ts.id)}>
                    {expandedTs === ts.id ? 'Hide entries' : 'View entries'}
                  </Btn>
                  {expandedTs === ts.id && entries.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {entries.map(e => (
                        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.rowLine}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {e.jira_issue_key && (
                              <Mono style={{ background: C.blueBg, color: C.blue, fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 5, marginRight: 5 }}>
                                {e.jira_issue_key}
                              </Mono>
                            )}
                            <span style={{ fontSize: 12 }}>
                              {new Date(e.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {e.task_description}
                            </span>
                          </div>
                          <Mono style={{ fontSize: 12, fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>{e.hours}h</Mono>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          }

          <SecTitle style={{ marginTop: 18 }}>Attendance (last 30 days)</SecTitle>
          {activityAttendance.length === 0 ? <Empty text="No attendance records" /> :
            activityAttendance.map(a => (
              <div key={a.id} style={{ ...card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {new Date(a.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.sub, marginTop: 3 }}>
                    In {formatTime(a.check_in_time)} · Out {formatTime(a.check_out_time)}{a.check_in_address ? ` · ${a.check_in_address}` : ''}
                  </div>
                </div>
                {a.total_hours != null ? (
                  <Mono style={{ background: C.greenBg, color: '#1f7350', fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>
                    {a.total_hours.toFixed(1)}h
                  </Mono>
                ) : a.check_in_time ? (
                  <span style={{ background: C.amberBg, color: '#8a6a22', fontSize: 11, padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>in only</span>
                ) : null}
              </div>
            ))
          }
        </div>
      )}
      </div>

      {adminConfirmOpen && (
        <Confirm
          msg={`Grant admin access to ${form.full_name || 'this user'}? They will have full access to employee records, salaries, and settings.`}
          yesLabel="Grant admin access"
          onYes={() => { setAdminConfirmOpen(false); save() }}
          onNo={() => setAdminConfirmOpen(false)}
        />
      )}
    </div>
  )
}

// ── Company Holidays ───────────────────────────────────────────────────────────
function BulkHolidayModal({ employees, onClose, onImported, onToast }) {
  const [region,   setRegion]   = useState(REGIONS[0])
  const [step,     setStep]     = useState(1) // 1 upload, 2 preview
  const [fileName, setFileName] = useState('')
  const [rows,     setRows]     = useState([]) // [{ date, name }]
  const [importing, setImporting] = useState(false)

  const downloadTemplate = () => {
    downloadCsv('holiday-import-template.csv', rowsToCsv(
      [{ date: today, name: 'e.g. Founders Day' }],
      [{ key: 'date', label: 'date' }, { key: 'name', label: 'name' }]
    ))
  }

  const handleFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    const text = await file.text()
    const parsed = parseCsv(text)
    const valid = parsed
      .map(r => ({ date: (r.date || '').trim(), name: (r.name || '').trim() }))
      .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(new Date(r.date).getTime()) && r.name)
    if (valid.length === 0) { onToast('No valid date/name rows found in that CSV', 'error'); return }
    setRows(valid)
    setStep(2)
  }

  const confirmImport = async () => {
    setImporting(true)
    let created = 0, failed = 0
    for (const r of rows) {
      const { error } = await createHoliday({ holiday_date: r.date, name: r.name, region })
      if (error) failed++; else created++
    }
    setImporting(false)
    onToast(`${created} holiday${created !== 1 ? 's' : ''} imported for ${region}${failed ? ` — ${failed} failed (likely duplicates)` : ''}`)
    onImported()
  }

  return (
    <Modal title="Bulk upload holidays by region" onClose={onClose} width={460} footer={
      step === 1
        ? <Btn variant="ghost" full onClick={onClose}>Cancel</Btn>
        : <>
            <Btn variant="ghost" full disabled={importing} onClick={onClose}>Cancel</Btn>
            <Btn full disabled={importing} onClick={confirmImport}>{importing ? 'Importing…' : `Import ${rows.length} holidays`}</Btn>
          </>
    }>
      <Field label="Region" hint="Applies to every employee whose profile Location matches this region.">
        <select value={region} onChange={e => setRegion(e.target.value)} style={inputStyle()}>
          {REGIONS.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>

      {step === 1 && (
        <>
          <Btn variant="ghost" sm style={{ marginBottom: 12 }} onClick={downloadTemplate}>Download CSV template</Btn>
          <div
            role="button" tabIndex={0}
            onClick={() => document.getElementById('bulk-holiday-upload').click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('bulk-holiday-upload').click() } }}
            style={{ border: `1.5px dashed ${C.borderMed}`, borderRadius: 10, padding: '22px 12px', background: C.bgSec, cursor: 'pointer', textAlign: 'center' }}
          >
            <div style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>{fileName || 'Click, drag a CSV file here, or press Enter to upload'}</div>
          </div>
          <input id="bulk-holiday-upload" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>{rows.length} row{rows.length !== 1 ? 's' : ''} ready to import for {region}:</div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {rows.map((r, i) => (
              <div key={i} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.rowLine}`, padding: '6px 0' }}>
                <span>{r.name}</span><span style={{ color: C.sub }}>{formatDate(r.date)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}

function HolidaysPanel({ employees, onToast }) {
  const [holidays, setHolidays] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [form,     setForm]     = useState({ holiday_date: '', name: '', region: REGIONS[0] })
  const [errs,     setErrs]     = useState({})
  const [saving,   setSaving]   = useState(false)
  const [confirm,  setConfirm]  = useState(null)
  const [regionFilter, setRegionFilter] = useState('all')
  const [bulkOpen,  setBulkOpen]  = useState(false)
  const [copying,   setCopying]   = useState(false)

  const load = () => {
    setLoading(true)
    fetchHolidays()
      .then(({ data, error }) => {
        if (error) onToast('Failed to load holidays', 'error')
        setHolidays(data || [])
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const add = async () => {
    const e = {}
    if (!form.holiday_date) e.holiday_date = 'Required'
    if (!form.name.trim())  e.name = 'Required'
    if (Object.keys(e).length) { setErrs(e); return }

    setSaving(true)
    const { error } = await createHoliday({ holiday_date: form.holiday_date, name: form.name.trim(), region: form.region })
    setSaving(false)
    if (error) { onToast(error.message, 'error'); return }
    setForm(f => ({ ...f, holiday_date: '', name: '' }))
    setErrs({})
    onToast(`Holiday added for ${form.region}`)
    load()
  }

  const remove = async (id) => {
    const { error } = await deleteHoliday(id)
    if (error) { onToast(error.message, 'error'); return }
    onToast('Holiday removed')
    setConfirm(null)
    load()
  }

  const copyLastYear = async () => {
    setCopying(true)
    let created = 0, failed = 0
    for (const h of holidays) {
      const d = new Date(h.holiday_date + 'T12:00:00')
      d.setFullYear(d.getFullYear() + 1)
      const iso = toDateStr(d)
      const { error } = await createHoliday({ holiday_date: iso, name: h.name, region: h.region })
      if (error) failed++; else created++
    }
    setCopying(false)
    onToast(`${created} holiday${created !== 1 ? 's' : ''} copied from last year${failed ? ` — ${failed} skipped (already exist)` : ''}`)
    load()
  }

  const employeeCountForRegion = (region) =>
    employees.filter(e => region === 'All' || e.location === region).length

  const visibleHolidays = holidays.filter(h => regionFilter === 'all' || h.region === regionFilter || h.region === 'All')

  if (loading) return <Spinner />

  return (
    <div>
      {confirm && (
        <Confirm
          msg={`Remove ${confirm.name} (${formatDate(confirm.holiday_date)})?`}
          yesLabel="Remove holiday"
          onYes={() => remove(confirm.id)}
          onNo={() => setConfirm(null)}
        />
      )}
      {bulkOpen && (
        <BulkHolidayModal
          employees={employees}
          onClose={() => setBulkOpen(false)}
          onImported={() => { setBulkOpen(false); load() }}
          onToast={onToast}
        />
      )}

      <div style={{ ...card, marginBottom: 18 }}>
        <SecTitle>Add holiday</SecTitle>
        <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <Field label="Date" error={errs.holiday_date}>
            <input type="date" value={form.holiday_date} onChange={e => setForm(f => ({ ...f, holiday_date: e.target.value }))} style={inputStyle(errs.holiday_date)} />
          </Field>
          <Field label="Name" error={errs.name}>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Diwali" style={inputStyle(errs.name)} />
          </Field>
          <Field label="Region">
            <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} style={inputStyle()}>
              {REGIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        <Btn sm disabled={saving} onClick={add}>{saving ? 'Adding…' : 'Add holiday'}</Btn>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: C.faint }}>{visibleHolidays.length} holiday{visibleHolidays.length !== 1 ? 's' : ''}</span>
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ ...inputStyle(), width: 'auto', padding: '5px 8px', fontSize: 12 }}>
            <option value="all">All regions</option>
            {REGIONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <button onClick={copyLastYear} disabled={copying || holidays.length === 0} style={{ background: 'none', border: 'none', color: C.blue, fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: 0 }}>
            {copying ? 'Copying…' : "Copy last year's holidays"}
          </button>
          <button onClick={() => setBulkOpen(true)} style={{ background: 'none', border: 'none', color: C.blue, fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: 0 }}>
            Bulk upload by region
          </button>
        </div>
      </div>

      {visibleHolidays.length === 0 ? <Empty text="No holidays configured" /> : visibleHolidays.map(h => (
        <div key={h.id} style={{ ...card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{h.name}</div>
            <div style={{ fontSize: 11.5, color: C.sub }}>
              {formatDate(h.holiday_date)} · {h.region} · {employeeCountForRegion(h.region)} employee{employeeCountForRegion(h.region) !== 1 ? 's' : ''}
            </div>
          </div>
          <Btn variant="danger" sm onClick={() => setConfirm(h)}>Remove</Btn>
        </div>
      ))}
    </div>
  )
}

// ── Audit Log ───────────────────────────────────────────────────────────────────
const AUDIT_ACTION_LABEL = {
  salary_change:    'Salary updated',
  leave_adjustment: 'Leave adjustment',
  role_change:      'Role changed',
}
const AUDIT_IGNORED_KEYS = new Set(['id', 'employee_id', 'created_at', 'updated_at'])

function formatDateTime(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function summarizeAuditChange({ old_values, new_values }) {
  if (!old_values && new_values) return 'Created'
  if (old_values && !new_values) return 'Deleted'
  if (!old_values || !new_values) return '—'
  const changed = Object.keys(new_values).filter(k =>
    !AUDIT_IGNORED_KEYS.has(k) && JSON.stringify(old_values[k]) !== JSON.stringify(new_values[k])
  )
  if (changed.length === 0) return 'No field changes'
  return changed.map(k => `${k}: ${old_values[k] ?? '—'} → ${new_values[k] ?? '—'}`).join(' · ')
}

function AuditLogPanel({ onToast }) {
  const [entries, setEntries] = useState([])
  const [loading,  setLoading] = useState(true)

  useEffect(() => {
    fetchAuditLog(200)
      .then(({ data, error }) => {
        if (error) onToast?.('Failed to load audit log', 'error')
        setEntries(data || [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  return (
    <div>
      <div style={{ ...noteBox('amber'), marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#8a6a22', lineHeight: 1.6 }}>
          This log covers only salary changes, leave adjustments, and role changes. It does not cover approvals,
          employee lifecycle events (creation/deactivation), holiday changes, or Jira connections.
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.faint, marginBottom: 12 }}>{entries.length} recent action{entries.length !== 1 ? 's' : ''}</div>
      {entries.length === 0 ? <Empty text="No audit events yet" /> : entries.map(e => (
        <div key={e.id} style={{ ...card, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{AUDIT_ACTION_LABEL[e.action] || e.action}</div>
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>
            {e.actor?.full_name || 'Unknown'} · {formatDateTime(e.created_at)}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, wordBreak: 'break-word' }}>
            {summarizeAuditChange(e)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── CSV Export ─────────────────────────────────────────────────────────────────
function ExportPanel({ employees, onToast }) {
  const [exporting, setExporting] = useState(null)
  const [leaveRange, setLeaveRange] = useState({ from: '', to: '' })
  const [attRange,   setAttRange]   = useState({ from: '', to: '' })

  const exportEmployees = () => {
    setExporting('employees')
    downloadCsv('employees.csv', rowsToCsv(employees, [
      { key: 'employee_code', label: 'Employee Code' },
      { key: 'full_name',     label: 'Full Name' },
      { key: 'email',         label: 'Email' },
      { key: 'department',    label: 'Department' },
      { key: 'designation',   label: 'Designation' },
      { key: 'role',          label: 'Role' },
      { key: 'joining_date',  label: 'Joining Date' },
      { key: 'is_active',     label: 'Active' },
      { key: 'exit_date',     label: 'Exit Date' },
      { key: 'exit_reason',   label: 'Exit Reason' },
    ]))
    setExporting(null)
    onToast('Employees exported')
  }

  const exportLeaveRequests = async () => {
    setExporting('leave')
    const { data, error } = await fetchAllLeaveRequests(leaveRange)
    setExporting(null)
    if (error) { onToast(error.message, 'error'); return }
    downloadCsv('leave-requests.csv', rowsToCsv(data || [], [
      { key: 'employee.employee_code', label: 'Employee Code' },
      { key: 'employee.full_name',     label: 'Employee' },
      { key: 'employee.department',    label: 'Department' },
      { key: 'leave_type',             label: 'Leave Type' },
      { key: 'from_date',              label: 'From' },
      { key: 'to_date',                label: 'To' },
      { key: 'days',                   label: 'Days' },
      { key: 'status',                 label: 'Status' },
      { key: 'applied_on',             label: 'Applied On' },
      { key: 'decided_on',             label: 'Decided On' },
    ]))
    onToast('Leave requests exported')
  }

  const exportAttendance = async () => {
    setExporting('attendance')
    const { data, error } = await fetchAllAttendance(1000, attRange)
    setExporting(null)
    if (error) { onToast(error.message, 'error'); return }
    downloadCsv('attendance.csv', rowsToCsv(data || [], [
      { key: 'employee.full_name',  label: 'Employee' },
      { key: 'employee.department', label: 'Department' },
      { key: 'date',                label: 'Date' },
      { key: 'check_in_time',       label: 'Check In' },
      { key: 'check_out_time',      label: 'Check Out' },
      { key: 'total_hours',         label: 'Total Hours' },
      { key: 'status',              label: 'Status' },
    ]))
    onToast('Attendance exported')
  }

  const dateRangeInputs = (range, setRange) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: C.faint, marginBottom: 4 }}>Date range (optional)</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} style={{ ...inputStyle(), padding: '6px 8px', fontSize: 12 }} />
        <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} style={{ ...inputStyle(), padding: '6px 8px', fontSize: 12 }} />
      </div>
    </div>
  )

  const exportRow = (title, desc, key, onClick, rangeControls) => (
    <div style={{ ...card, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>{desc}</div>
      {rangeControls}
      <Btn sm disabled={exporting === key} onClick={onClick}>{exporting === key ? 'Exporting…' : 'Export CSV'}</Btn>
    </div>
  )

  return (
    <div>
      {exportRow('Employee roster', `All ${employees.length} employees with contact and role details.`, 'employees', exportEmployees)}
      {exportRow('Leave requests', 'All leave requests across the organization, any status.', 'leave', exportLeaveRequests, dateRangeInputs(leaveRange, setLeaveRange))}
      {exportRow('Attendance', 'Limited to the most recent 1,000 rows — narrow the date range below if you need older records reliably included.', 'attendance', exportAttendance, dateRangeInputs(attRange, setAttRange))}
    </div>
  )
}

// ── Admin Panel root ──────────────────────────────────────────────────────────
export default function AdminPanel({ onToast }) {
  const [section,   setSection]   = useState('employees')   // 'employees' | 'holidays' | 'audit' | 'export'
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState('list')   // 'list' | 'add' | 'edit' | 'bulk'
  const [editing,   setEditing]   = useState(null)
  const [confirm,   setConfirm]   = useState(null)
  const [q,         setQ]         = useState('')

  const load = () => {
    setLoading(true)
    fetchEmployees()
      .then(({ data, error }) => {
        if (error) onToast('Failed to load employees', 'error')
        setEmployees(data || [])
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const [offboarding, setOffboarding] = useState(false)

  const handleDeactivate = async (id, { exitDate, exitReason }) => {
    const target = employees.find(e => e.id === id)
    if (target?.role === 'admin') {
      const otherActiveAdmins = employees.filter(e => e.role === 'admin' && e.is_active !== false && e.id !== id).length
      if (otherActiveAdmins === 0) {
        onToast('Cannot deactivate — at least one active admin must remain', 'error')
        setConfirm(null)
        return
      }
    }
    setOffboarding(true)
    const { error } = await deactivateEmployee(id, { exitDate, exitReason })
    setOffboarding(false)
    if (error) { onToast(typeof error === 'string' ? error : error.message, 'error'); return }
    onToast('Employee deactivated')
    setConfirm(null)
    setView('list')
    load()
  }

  const handleReactivate = async (id) => {
    const { error } = await reactivateEmployee(id)
    if (error) { onToast(typeof error === 'string' ? error : error.message, 'error'); return }
    onToast('Employee reactivated')
    setView('list')
    load()
  }

  const [resetTarget, setResetTarget] = useState(null)
  const [resetting,   setResetting]   = useState(false)
  const [renumbering, setRenumbering] = useState(false)

  const runRenumber = async () => {
    setRenumbering(true)
    const { error } = await renumberEmployeeCodes()
    setRenumbering(false)
    if (error) { onToast('Renumber failed: ' + (error.message || error), 'error'); return }
    onToast('Employee codes renumbered by joining date')
    load()
  }

  const handleResetPassword = async (password) => {
    setResetting(true)
    const { error } = await resetEmployeePassword(resetTarget.id, password)
    setResetting(false)
    if (error) { onToast(typeof error === 'string' ? error : error.message, 'error'); return }
    onToast('Password set — share it with them directly')
    setResetTarget(null)
  }

  if (loading) return <Spinner />

  const sectionTabs = (
    <Segmented
      items={[
        { id: 'employees', label: 'Employees' },
        { id: 'holidays', label: 'Holidays' },
        { id: 'audit', label: 'Audit log' },
        { id: 'export', label: 'Export' },
      ]}
      value={section}
      onChange={setSection}
      style={{ marginBottom: 18 }}
    />
  )

  if (section === 'holidays') {
    return (
      <div>
        {sectionTabs}
        <HolidaysPanel employees={employees} onToast={onToast} />
      </div>
    )
  }

  if (section === 'audit') {
    return (
      <div>
        {sectionTabs}
        <AuditLogPanel onToast={onToast} />
      </div>
    )
  }

  if (section === 'export') {
    return (
      <div>
        {sectionTabs}
        <ExportPanel employees={employees} onToast={onToast} />
      </div>
    )
  }

  if (view === 'add' || view === 'edit') {
    return (
      <div>
        {confirm && (
          <OffboardModal
            name={confirm.full_name}
            submitting={offboarding}
            onConfirm={(details) => handleDeactivate(confirm.id, details)}
            onCancel={() => setConfirm(null)}
          />
        )}
        {resetTarget && (
          <ResetPasswordModal
            name={resetTarget.full_name}
            submitting={resetting}
            onConfirm={handleResetPassword}
            onCancel={() => setResetTarget(null)}
          />
        )}
        <EmployeeForm
          initial={view === 'edit' ? editing : null}
          employees={employees}
          onSave={() => { setView('list'); load() }}
          onBack={() => setView('list')}
          onToast={onToast}
          onReset={() => setResetTarget(editing)}
          onDeactivate={() => setConfirm(editing)}
          onReactivate={() => handleReactivate(editing.id)}
        />
      </div>
    )
  }

  if (view === 'bulk') {
    return (
      <BulkAddEmployees
        employees={employees}
        onBack={() => setView('list')}
        onDone={async () => { await renumberEmployeeCodes(); setView('list'); load() }}
        onToast={onToast}
      />
    )
  }

  const filtered = employees
    .filter(e =>
      e.full_name.toLowerCase().includes(q.toLowerCase()) ||
      e.email.toLowerCase().includes(q.toLowerCase()) ||
      (e.employee_code || '').toLowerCase().includes(q.toLowerCase())
    )
    .sort((a, b) => (a.employee_code || '').localeCompare(b.employee_code || '', undefined, { numeric: true }))

  return (
    <div>
      {sectionTabs}

      {confirm && (
        <OffboardModal
          name={confirm.full_name}
          submitting={offboarding}
          onConfirm={(details) => handleDeactivate(confirm.id, details)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          name={resetTarget.full_name}
          submitting={resetting}
          onConfirm={handleResetPassword}
          onCancel={() => setResetTarget(null)}
        />
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 13 }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees"
            style={{ ...inputStyle(), height: 34, padding: '0 12px 0 30px', fontSize: 13 }} />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.muted }}>{filtered.length} of {employees.length} shown</span>
        <Btn variant="ghost" sm disabled={renumbering} onClick={runRenumber} style={{ whiteSpace: 'nowrap' }}>
          {renumbering ? 'Renumbering…' : 'Renumber by join date'}
        </Btn>
        <Btn variant="ghost" sm onClick={() => setView('bulk')} style={{ whiteSpace: 'nowrap' }}>Bulk add</Btn>
        <Btn sm onClick={() => setView('add')} style={{ whiteSpace: 'nowrap' }}>+ Add employee</Btn>
      </div>

      {filtered.length === 0 ? <Empty text="No employees found" /> : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div className="hscroll">
            <div style={{ display: 'grid', gridTemplateColumns: EMP_COLS, gap: 14, alignItems: 'center', padding: '9px 22px', background: C.bgSec, borderBottom: `1px solid ${C.lineSoft}`, minWidth: 860, boxSizing: 'border-box', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>
              <div>Employee</div><div>Designation</div><div>Dept</div><div>Role</div><div style={{ textAlign: 'right' }}>Actions</div>
            </div>
            {filtered.map(e => (
              <div key={e.id}
                onClick={() => { setEditing(e); setView('edit') }}
                style={{ display: 'grid', gridTemplateColumns: EMP_COLS, gap: 14, alignItems: 'center', padding: '0 22px', minHeight: 56, borderBottom: `1px solid ${C.rowLine}`, minWidth: 860, boxSizing: 'border-box', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, padding: '9px 0' }}>
                  <Avatar initials={e.avatar_initials} size={28} bg={C.bgTert} color={C.sub} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.full_name}</div>
                    <div style={{ fontSize: 10.5, color: C.muted, fontFamily: C.mono }}>{e.employee_code}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: C.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.designation || '—'}</div>
                <div style={{ fontSize: 12.5, color: C.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.department || '—'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.body }}>
                  {ROLES[e.role]}
                  {!e.is_active && <span style={{ fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.red, border: `1px solid ${C.redLine}`, borderRadius: 20, padding: '1px 7px' }}>Inactive</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }} onClick={ev => ev.stopPropagation()}>
                  <button onClick={() => { setEditing(e); setView('edit') }} style={empActBtn}>Edit</button>
                  <button onClick={() => setResetTarget(e)} style={empActBtn}>Reset</button>
                  {e.is_active
                    ? <button onClick={() => setConfirm(e)} style={{ ...empActBtn, color: C.red, borderColor: C.redLine }}>Deactivate</button>
                    : <button onClick={() => handleReactivate(e.id)} style={{ ...empActBtn, color: '#2a5c8a' }}>Reactivate</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const EMP_COLS = 'minmax(190px,1.6fr) minmax(150px,1.2fr) minmax(90px,120px) 150px 210px'
const empActBtn = { height: 28, padding: '0 10px', border: `1px solid ${C.line}`, background: '#fff', borderRadius: 6, fontSize: 12, color: '#2b3648', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
