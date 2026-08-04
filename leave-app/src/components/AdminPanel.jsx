import { useEffect, useState } from 'react'
import {
  fetchEmployees, createEmployee, updateEmployee, deactivateEmployee,
  fetchSalary, upsertSalary, fetchApprovers, setApprovers,
  fetchLeaveTypes, fetchLeaveAdjustments, upsertLeaveAdjustment, grantCompOff,
} from '../lib/api'
import { Avatar, Badge, C, Confirm, Empty, Field, SecTitle, Spinner, btnStyle, card, inputStyle, formatDate } from './UI'

const ROLES = { admin: 'Admin', manager: 'Manager', employee: 'Employee' }
const DEPTS = ['Engineering', 'HR', 'Finance', 'Sales', 'Operations', 'Marketing', 'Design', 'Product']
const today = new Date().toISOString().split('T')[0]

// ── Add/Edit Employee Form ────────────────────────────────────────────────────
function generateEmpCode(employees) {
  const existing = (employees || [])
    .map(e => e.employee_code)
    .filter(c => /^EMP\d+$/.test(c))
    .map(c => parseInt(c.replace('EMP', ''), 10))
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
  return `EMP${String(next).padStart(3, '0')}`
}

function EmployeeForm({ initial, initialTab = 'details', employees, onSave, onBack, onToast }) {
  const isEdit = !!initial?.id
  const [form, setForm] = useState({
    full_name:    initial?.full_name    || '',
    email:        initial?.email        || '',
    phone:        initial?.phone        || '',
    employee_code:initial?.employee_code|| generateEmpCode(employees),
    department:   initial?.department   || '',
    designation:  initial?.designation  || '',
    role:         initial?.role         || 'employee',
    joining_date: initial?.joining_date || today,
    manager_id:   initial?.manager_id   || '',
    password:     '',
  })
  const [salary, setSalary]             = useState(null)
  const [approvers, setApproversState]  = useState([])
  const [selectedApprovers, setSelAppr] = useState([])
  const [leaveTypes, setLeaveTypes]     = useState([])
  const [leaveAdj, setLeaveAdj]         = useState({})   // { type_code: adjustment_value }
  const [leaveReasons, setLeaveReasons] = useState({})   // { type_code: reason }
  const [compForm, setCompForm]         = useState({ workedDate: '', workedHours: '8', earnedDays: '1', reason: '' })
  const [compErrs, setCompErrs]         = useState({})
  const [compSaving, setCompSaving]     = useState(false)
  const [compDone, setCompDone]         = useState(false)
  const [errs, setErrs]                 = useState({})
  const [saving, setSaving]             = useState(false)
  const [activeTab, setActiveTab]       = useState(initialTab)
  const [adminConfirmOpen, setAdminConfirmOpen] = useState(false)

  const activeOtherAdmins = employees.filter(e => e.role === 'admin' && e.is_active !== false && e.id !== initial?.id).length
  const isGrantingAdmin = form.role === 'admin' && (!isEdit || initial.role !== 'admin')
  const isLastAdminDemotion = isEdit && initial?.role === 'admin' && form.role !== 'admin' && activeOtherAdmins === 0

  useEffect(() => {
    if (isEdit) {
      fetchSalary(initial.id).then(({ data }) => setSalary(data || {}))
      fetchApprovers(initial.id).then(({ data }) => setSelAppr((data || []).map(a => a.approver_id)))
      fetchLeaveAdjustments(initial.id).then(({ data }) => {
        const adj = {}, reasons = {}
        for (const row of (data || [])) {
          adj[row.type_code]     = row.adjustment
          reasons[row.type_code] = row.reason || ''
        }
        setLeaveAdj(adj)
        setLeaveReasons(reasons)
      })
    }
    setApproversState(employees.filter(e => e.id !== initial?.id))
    fetchLeaveTypes().then(({ data }) => setLeaveTypes(data || []))
  }, [initial?.id])

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

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
      // Save leave adjustments
      for (const lt of leaveTypes.filter(t => !t.is_comp_off)) {
        const adj = parseFloat(leaveAdj[lt.code]) || 0
        if (adj !== 0 || leaveReasons[lt.code]) {
          await upsertLeaveAdjustment({
            employee_id: empId,
            type_code:   lt.code,
            adjustment:  adj,
            reason:      leaveReasons[lt.code] || null,
          })
        }
      }
    }

    setSaving(false)
    onToast(isEdit ? 'Employee updated' : 'Employee added successfully')
    onSave()
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

  const TB = ({ id, label }) => (
    <button onClick={() => setActiveTab(id)} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: 'none', cursor: 'pointer', background: activeTab === id ? C.green : C.bgSec, color: activeTab === id ? '#fff' : C.textSec }}>
      {label}
    </button>
  )

  return (
    <div>
      <button onClick={onBack} style={{ ...btnStyle(C.bgSec, C.textSec), padding: '6px 14px', fontSize: 12, marginBottom: 16 }}>‹ Back</button>
      <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 16 }}>{isEdit ? `Edit ${initial.full_name}` : 'Add New Employee'}</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <TB id="details"   label="Details" />
        <TB id="salary"    label="Salary" />
        <TB id="approvers" label="Approvers" />
        {isEdit && <TB id="leave" label="Leave" />}
        {isEdit && <TB id="comp" label="Comp Off" />}
      </div>

      {/* Details tab */}
      {activeTab === 'details' && (
        <div>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Full Name" error={errs.full_name}>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={inputStyle(errs.full_name)} placeholder="Jane Smith" />
            </Field>
            <Field label="Employee Code" error={errs.employee_code}>
              <input value={form.employee_code} onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))} style={{ ...inputStyle(errs.employee_code), background: !isEdit ? C.bgSec : undefined }} placeholder="EMP001" readOnly={!isEdit} />
            </Field>
          </div>
          <Field label="Work Email" error={errs.email}>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle(errs.email)} placeholder="jane@company.com" disabled={isEdit} />
          </Field>
          {!isEdit && (
            <Field label="Temporary Password" error={errs.password}>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={inputStyle(errs.password)} placeholder="Min 8 characters" />
            </Field>
          )}
          <Field label="Phone">
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle()} placeholder="+91 98765 43210" />
          </Field>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Role">
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inputStyle()}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Date of Joining" error={errs.joining_date}>
              <input type="date" value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} style={inputStyle(errs.joining_date)} />
            </Field>
          </div>
          <Field label="Reporting Manager">
            <select value={form.manager_id} onChange={e => setForm(f => ({ ...f, manager_id: e.target.value }))} style={inputStyle()}>
              <option value="">— No manager —</option>
              {employees.filter(e => e.id !== initial?.id && e.role !== 'employee').map(e => (
                <option key={e.id} value={e.id}>{e.full_name} ({ROLES[e.role]})</option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {/* Salary tab */}
      {activeTab === 'salary' && (
        <div>
          <div style={{ ...card, background: '#E1F5EE', border: `0.5px solid #9FE1CB`, marginBottom: 16 }}>
            <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#085041' }}>Gross</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: C.green }}>₹{gross.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#085041' }}>Deductions</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: C.red }}>₹{deductions.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#085041' }}>Net</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: C.green }}>₹{net.toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>
          <SecTitle>Earnings</SecTitle>
          {[['basic_salary','Basic Salary'],['hra','HRA'],['transport_allowance','Transport Allowance'],['other_allowances','Other Allowances']].map(([k, label]) => (
            <Field key={k} label={label}>
              <input type="number" min={0} value={salForm[k]} onChange={e => setSalForm(f => ({ ...f, [k]: e.target.value }))} style={inputStyle()} placeholder="0" />
            </Field>
          ))}
          <SecTitle style={{ marginTop: 8 }}>Deductions</SecTitle>
          {[['pf_deduction','PF Deduction'],['tax_deduction','Tax (TDS)'],['other_deductions','Other Deductions']].map(([k, label]) => (
            <Field key={k} label={label}>
              <input type="number" min={0} value={salForm[k]} onChange={e => setSalForm(f => ({ ...f, [k]: e.target.value }))} style={inputStyle()} placeholder="0" />
            </Field>
          ))}
          <Field label="Effective From">
            <input type="date" value={salForm.effective_from} onChange={e => setSalForm(f => ({ ...f, effective_from: e.target.value }))} style={inputStyle()} />
          </Field>
        </div>
      )}

      {/* Leave adjustments tab */}
      {activeTab === 'leave' && (
        <div>
          <div style={{ ...card, background: C.amberBg, border: `0.5px solid #E8C97A`, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#854F0B', marginBottom: 4 }}>Admin leave override</div>
            <div style={{ fontSize: 12, color: '#854F0B', lineHeight: 1.6 }}>
              Adjust an employee's leave entitlement. Positive numbers add days, negative numbers deduct. Changes apply immediately to their balance.
            </div>
            <button onClick={() => setActiveTab('comp')} style={{ ...btnStyle(C.purple, '#fff'), marginTop: 12, padding: '7px 12px', fontSize: 12, borderRadius: 18 }}>
              Credit Comp Off
            </button>
          </div>
          {leaveTypes.filter(lt => !lt.is_comp_off).map(lt => (
            <div key={lt.code} style={{ ...card, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: lt.color, flexShrink: 0 }} />
                <div style={{ fontSize: 13, fontWeight: 500 }}>{lt.label}</div>
                <div style={{ fontSize: 11, color: C.textTert, marginLeft: 'auto' }}>Base: {lt.annual_days} days/yr</div>
              </div>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
                <div style={{ fontSize: 11, color: C.textSec, marginTop: 4 }}>
                  New total: {lt.annual_days + (parseFloat(leaveAdj[lt.code]) || 0)} days
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {activeTab === 'comp' && isEdit && (
        <div>
          <div style={{ ...card, background: C.purpleBg, border: `0.5px solid #AFA9EC`, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#3C3489', marginBottom: 4 }}>Credit Comp Off</div>
            <div style={{ fontSize: 12, color: '#534AB7', lineHeight: 1.6 }}>
              Manually add approved comp off days for this employee. This creates an immediately approved comp off record so the balance is updated right away.
            </div>
          </div>
          {compDone ? (
            <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>Comp off credited</div>
              <div style={{ fontSize: 12, color: C.textSec, marginBottom: 18 }}>The employee's comp off balance has been updated.</div>
              <button onClick={() => setCompDone(false)} style={btnStyle(C.purple, '#fff')}>Add another</button>
            </div>
          ) : (
            <>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Worked Date" error={compErrs.workedDate}>
                  <input type="date" value={compForm.workedDate} onChange={e => { setCompForm(f => ({ ...f, workedDate: e.target.value })); setCompErrs({}) }} style={inputStyle(compErrs.workedDate)} />
                </Field>
                <Field label="Hours Worked" error={compErrs.workedHours}>
                  <input type="number" min="0" step="0.5" value={compForm.workedHours} onChange={e => { setCompForm(f => ({ ...f, workedHours: e.target.value })); setCompErrs({}) }} style={inputStyle(compErrs.workedHours)} />
                </Field>
              </div>
              <Field label="Comp Off Days" error={compErrs.earnedDays}>
                <input type="number" min="0.5" step="0.5" value={compForm.earnedDays} onChange={e => { setCompForm(f => ({ ...f, earnedDays: e.target.value })); setCompErrs({}) }} style={inputStyle(compErrs.earnedDays)} />
              </Field>
              <Field label="Reason" error={compErrs.reason}>
                <textarea rows={3} value={compForm.reason} onChange={e => { setCompForm(f => ({ ...f, reason: e.target.value })); setCompErrs({}) }} style={{ ...inputStyle(compErrs.reason), resize: 'vertical' }} placeholder="Reason for crediting comp off" />
              </Field>
              <button onClick={saveCompOff} disabled={compSaving} style={{ ...btnStyle(C.purple, '#fff'), width: '100%', opacity: compSaving ? 0.7 : 1 }}>
                {compSaving ? 'Saving…' : 'Credit Comp Off'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Approvers tab */}
      {activeTab === 'approvers' && (
        <div>
          <div style={{ fontSize: 13, color: C.textSec, marginBottom: 14, lineHeight: 1.6 }}>
            Select up to 3 approvers for this employee's leave and comp off requests. Requests go to approver #1 first, then #2, then #3. If none selected, the reporting manager is used.
          </div>
          {approvers.length === 0 ? <Empty text="No other employees found" /> : (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {approvers.map((e, i, arr) => (
                <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < arr.length - 1 ? `0.5px solid ${C.border}` : 'none', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedApprovers.includes(e.id)} onChange={() => toggleApprover(e.id)} />
                  <Avatar initials={e.avatar_initials} size={28} color={C.purple} bg={C.purpleBg} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{e.full_name}</div>
                    <div style={{ fontSize: 11, color: C.textSec }}>{ROLES[e.role]} {e.department ? `· ${e.department}` : ''}</div>
                  </div>
                  {selectedApprovers.includes(e.id) && (
                    <span style={{ background: C.purpleBg, color: '#534AB7', fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10 }}>
                      #{selectedApprovers.indexOf(e.id) + 1}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
          {selectedApprovers.length > 0 && (
            <div style={{ fontSize: 11, color: C.textTert, marginTop: 8 }}>
              {selectedApprovers.length} approver{selectedApprovers.length > 1 ? 's' : ''} — requests route to #1 first
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <button onClick={handleSaveClick} disabled={saving} style={{ ...btnStyle(C.green, '#fff'), width: '100%', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : isEdit ? 'Update Employee' : 'Add Employee'}
        </button>
      </div>

      {adminConfirmOpen && (
        <Confirm
          msg={`Grant admin access to ${form.full_name || 'this user'}? They will have full access to employee records, salaries, and settings.`}
          onYes={() => { setAdminConfirmOpen(false); save() }}
          onNo={() => setAdminConfirmOpen(false)}
        />
      )}
    </div>
  )
}

// ── Admin Panel root ──────────────────────────────────────────────────────────
export default function AdminPanel({ onToast }) {
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState('list')   // 'list' | 'add' | 'edit'
  const [editing,   setEditing]   = useState(null)
  const [editingTab, setEditingTab] = useState('details')
  const [confirm,   setConfirm]   = useState(null)
  const [q,         setQ]         = useState('')

  const load = () => {
    setLoading(true)
    fetchEmployees().then(({ data }) => setEmployees(data || [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleDeactivate = async (id) => {
    const target = employees.find(e => e.id === id)
    if (target?.role === 'admin') {
      const otherActiveAdmins = employees.filter(e => e.role === 'admin' && e.is_active !== false && e.id !== id).length
      if (otherActiveAdmins === 0) {
        onToast('Cannot deactivate — at least one active admin must remain', 'error')
        setConfirm(null)
        return
      }
    }
    const { error } = await deactivateEmployee(id)
    if (error) { onToast(error.message, 'error'); return }
    onToast('Employee deactivated')
    setConfirm(null)
    load()
  }

  if (loading) return <Spinner />

  if (view === 'add' || view === 'edit') {
    return (
      <EmployeeForm
        initial={view === 'edit' ? editing : null}
        initialTab={view === 'edit' ? editingTab : 'details'}
        employees={employees}
        onSave={() => { setView('list'); load() }}
        onBack={() => setView('list')}
        onToast={onToast}
      />
    )
  }

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(q.toLowerCase()) ||
    e.email.toLowerCase().includes(q.toLowerCase()) ||
    (e.employee_code || '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div>
      {confirm && (
        <Confirm
          msg={`Deactivate ${confirm.full_name}? They will lose access immediately.`}
          onYes={() => handleDeactivate(confirm.id)}
          onNo={() => setConfirm(null)}
        />
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search employees…" style={{ ...inputStyle(), flex: 1 }}
        />
        <button onClick={() => setView('add')} style={{ ...btnStyle(C.green, '#fff'), whiteSpace: 'nowrap', padding: '9px 14px', fontSize: 13 }}>
          + Add Employee
        </button>
      </div>

      <div style={{ fontSize: 11, color: C.textTert, marginBottom: 12 }}>{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</div>

      {filtered.length === 0 ? <Empty text="No employees found" /> : filtered.map(e => {
        const mgr = employees.find(x => x.id === e.manager_id)
        return (
          <div key={e.id} style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Avatar initials={e.avatar_initials} size={38} color={C.blue} bg={C.blueBg} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{e.full_name}</div>
                    <div style={{ fontSize: 11, color: C.textSec }}>{e.employee_code} · {e.designation || ROLES[e.role]} · {e.department || '—'}</div>
                    <div style={{ fontSize: 11, color: C.textTert }}>Manager: {mgr?.full_name || '—'} · Joined {formatDate(e.joining_date)}</div>
                  </div>
                  <span style={{ background: e.is_active ? C.greenBg : C.bgTert, color: e.is_active ? '#0F6E56' : C.textSec, fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10, flexShrink: 0 }}>
                    {e.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => { setEditing(e); setEditingTab('details'); setView('edit') }} style={{ ...btnStyle(C.bgSec, C.textSec), padding: '6px 12px', fontSize: 12 }}>Edit</button>
                  <button onClick={() => { setEditing(e); setEditingTab('leave'); setView('edit') }} style={{ ...btnStyle(C.purpleBg, '#3C3489'), padding: '6px 12px', fontSize: 12 }}>Add / Remove Leaves</button>
                  {e.is_active && <button onClick={() => setConfirm(e)} style={{ ...btnStyle(C.redBg, C.red), padding: '6px 12px', fontSize: 12 }}>Deactivate</button>}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
