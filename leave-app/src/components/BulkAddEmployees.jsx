import { useState } from 'react'
import { createEmployee } from '../lib/api'
import { parseCsv, rowsToCsv, downloadCsv } from '../lib/csv'
import { generateTempPassword } from '../lib/password'
import { generateEmpCode } from '../lib/employeeCode'
import { Btn, C, card, inputStyle } from './UI'
import { todayStr } from '../lib/dates'

const VALID_ROLES = ['admin', 'manager', 'employee']
const today = todayStr()

const TEMPLATE_COLUMNS = [
  { key: 'full_name', label: 'full_name' },
  { key: 'email', label: 'email' },
  { key: 'employee_code', label: 'employee_code' },
  { key: 'department', label: 'department' },
  { key: 'designation', label: 'designation' },
  { key: 'role', label: 'role' },
  { key: 'joining_date', label: 'joining_date' },
  { key: 'date_of_birth', label: 'date_of_birth' },
  { key: 'manager_employee_code', label: 'manager_employee_code' },
]

function downloadTemplate() {
  const example = {
    full_name: 'Jane Smith', email: 'jane@company.com', employee_code: '',
    department: 'Engineering', designation: 'Software Engineer', role: 'employee',
    joining_date: today, date_of_birth: '', manager_employee_code: '',
  }
  downloadCsv('employee-import-template.csv', rowsToCsv([example], TEMPLATE_COLUMNS))
}

// Validates parsed CSV rows against the existing roster + each other.
// Auto-generated employee codes are reserved sequentially within the
// batch so two blank-code rows don't collide.
function validateRows(rawRows, existingEmployees) {
  const seenEmails = new Set()
  const seenCodes = new Set()
  const existingEmails = new Set(existingEmployees.map(e => e.email.toLowerCase()))
  const existingCodes = new Set(existingEmployees.map(e => e.employee_code))
  let codeSeed = [...existingEmployees]

  return rawRows.map((r, i) => {
    const errors = []
    const warnings = []

    const full_name = (r.full_name || '').trim()
    const email = (r.email || '').trim().toLowerCase()
    let employee_code = (r.employee_code || '').trim()
    const department = (r.department || '').trim()
    const designation = (r.designation || '').trim()
    let role = (r.role || 'employee').trim().toLowerCase()
    let joining_date = (r.joining_date || today).trim()
    let date_of_birth = (r.date_of_birth || '').trim()
    const managerCode = (r.manager_employee_code || '').trim()

    if (!full_name) errors.push('Full name is required')
    if (!email) errors.push('Email is required')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email format')
    else if (existingEmails.has(email) || seenEmails.has(email)) errors.push('Email already in use')

    if (!employee_code) {
      employee_code = generateEmpCode(codeSeed)
    } else if (existingCodes.has(employee_code) || seenCodes.has(employee_code)) {
      errors.push('Employee code already in use')
    }
    codeSeed = [...codeSeed, { employee_code }]

    if (!VALID_ROLES.includes(role)) {
      errors.push(`Invalid role "${r.role}" (must be admin, manager or employee)`)
      role = 'employee'
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(joining_date) || Number.isNaN(new Date(joining_date).getTime())) {
      errors.push('Invalid joining date (use YYYY-MM-DD)')
      joining_date = today
    }

    if (date_of_birth) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth) || Number.isNaN(new Date(date_of_birth).getTime())) {
        warnings.push('Invalid date of birth (use YYYY-MM-DD) — left blank')
        date_of_birth = ''
      } else if (date_of_birth > today) {
        warnings.push('Date of birth is in the future — left blank')
        date_of_birth = ''
      }
    }

    let manager_id = null
    if (managerCode) {
      const mgr = existingEmployees.find(e => e.employee_code === managerCode)
      if (mgr) manager_id = mgr.id
      else warnings.push(`Manager code "${managerCode}" not found — will be created without a manager`)
    }

    if (email) seenEmails.add(email)
    if (employee_code) seenCodes.add(employee_code)

    return {
      rowNum: i + 2, // header is row 1
      full_name, email, employee_code, department, designation, role, joining_date, date_of_birth, manager_id,
      errors, warnings,
    }
  })
}

const th = { padding: '9px 10px', fontWeight: 600, color: C.muted, whiteSpace: 'nowrap', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }
const td = { padding: '9px 10px', fontSize: 12, verticalAlign: 'top' }

export default function BulkAddEmployees({ employees, onBack, onDone, onToast }) {
  const [step,      setStep]      = useState('upload') // 'upload' | 'preview' | 'results'
  const [rows,       setRows]      = useState([])
  const [fileName,   setFileName]  = useState('')
  const [creating,   setCreating]  = useState(false)
  const [progress,   setProgress]  = useState({ done: 0, total: 0 })
  const [results,    setResults]   = useState([])
  const [passwordMode,   setPasswordMode]   = useState('shared') // 'random' | 'shared'
  const [sharedPassword, setSharedPassword] = useState('')
  const [revealed, setRevealed] = useState(new Set())

  const toggleReveal = (email) => setRevealed(prev => {
    const next = new Set(prev)
    next.has(email) ? next.delete(email) : next.add(email)
    return next
  })

  const copyPassword = async (pw) => {
    try { await navigator.clipboard.writeText(pw); onToast('Password copied') }
    catch { onToast('Could not copy — copy it manually', 'error') }
  }

  const handleFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length === 0) {
      onToast('That CSV has no data rows', 'error')
      return
    }
    setRows(validateRows(parsed, employees))
    setStep('preview')
  }

  const readyRows = rows.filter(r => r.errors.length === 0)
  const sharedPasswordValid = sharedPassword.trim().length >= 8
  const canCreate = readyRows.length > 0 && (passwordMode === 'random' || sharedPasswordValid)

  const doCreate = async () => {
    setCreating(true)
    setProgress({ done: 0, total: readyRows.length })
    const out = []
    for (const row of readyRows) {
      const tempPassword = passwordMode === 'shared' ? sharedPassword.trim() : generateTempPassword()
      const { error } = await createEmployee({
        email: row.email,
        password: tempPassword,
        full_name: row.full_name,
        employee_code: row.employee_code,
        department: row.department || null,
        designation: row.designation || null,
        role: row.role,
        joining_date: row.joining_date,
        date_of_birth: row.date_of_birth || null,
        manager_id: row.manager_id,
      })
      out.push({
        full_name: row.full_name,
        email: row.email,
        employee_code: row.employee_code,
        tempPassword,
        status: error ? 'failed' : 'created',
        error: error ? (typeof error === 'string' ? error : error.message) : null,
      })
      setProgress(p => ({ ...p, done: p.done + 1 }))
    }
    setResults(out)
    setCreating(false)
    setStep('results')
  }

  const exportResults = () => {
    const created = results.filter(r => r.status === 'created')
    downloadCsv('new-employee-credentials.csv', rowsToCsv(created, [
      { key: 'full_name',      label: 'Name' },
      { key: 'email',          label: 'Email' },
      { key: 'employee_code',  label: 'Employee Code' },
      { key: 'tempPassword',   label: 'Temporary Password' },
    ]))
  }

  const createdCount = results.filter(r => r.status === 'created').length
  const failedCount  = results.filter(r => r.status === 'failed').length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Btn variant="ghost" sm onClick={onBack}>‹ Back</Btn>
        <div style={{ fontFamily: C.serif, fontSize: 21 }}>Bulk add employees</div>
      </div>

      {step === 'upload' && (
        <div>
          <div style={{ ...card, background: C.bgSec, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>How it works</div>
            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
              Upload a CSV of new hires. Only <strong>full_name</strong> and <strong>email</strong> are required —
              employee code auto-generates if left blank, and role/joining date default sensibly.
              <strong> date_of_birth</strong> is optional (YYYY-MM-DD) — set it to have that person show up in the
              dashboard's birthday list. You'll choose a random-per-employee or shared initial password on the next
              screen, and see/export it after creation. Everyone created here is required to set their own password
              on first login. A manager must already exist in the system — reference them by employee code.
            </div>
          </div>

          <Btn variant="ghost" sm style={{ marginBottom: 20 }} onClick={downloadTemplate}>Download CSV template</Btn>

          <div
            role="button" tabIndex={0}
            style={{
              border: `1.5px dashed ${C.borderMed}`, borderRadius: 10, padding: '26px 12px',
              background: C.bgSec, cursor: 'pointer', textAlign: 'center',
            }}
            onClick={() => document.getElementById('bulk-csv-upload').click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('bulk-csv-upload').click() } }}
          >
            <div style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>
              {fileName || 'Click to upload a CSV file'}
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>Uses the template columns above</div>
          </div>
          <input
            id="bulk-csv-upload"
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ ...card, flex: 1, minWidth: 140, textAlign: 'center', background: C.greenBg, border: `1px solid ${C.greenLine}` }}>
              <div style={{ fontFamily: C.serif, fontSize: 24, color: '#1f7350' }}>{readyRows.length}</div>
              <div style={{ fontSize: 11, color: '#1f7350' }}>ready to create</div>
            </div>
            {(() => {
              const skipped = rows.length - readyRows.length
              return (
                <div style={{ ...card, flex: 1, minWidth: 140, textAlign: 'center', background: skipped > 0 ? C.redBg : C.bgSec, border: `1px solid ${skipped > 0 ? C.redLine : C.line}` }}>
                  <div style={{ fontFamily: C.serif, fontSize: 24, color: skipped > 0 ? C.red : C.muted }}>{skipped}</div>
                  <div style={{ fontSize: 11, color: skipped > 0 ? C.red : C.faint }}>will be skipped</div>
                </div>
              )
            })()}
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div className="hscroll">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.bgSec, textAlign: 'left' }}>
                    {['Row', 'Name', 'Email', 'Code', 'Role', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.rowNum} style={{ borderTop: `1px solid ${C.rowLine}` }}>
                      <td style={{ ...td, color: C.faint, fontFamily: C.mono }}>{r.rowNum}</td>
                      <td style={td}>{r.full_name || '—'}</td>
                      <td style={td}>{r.email || '—'}</td>
                      <td style={{ ...td, fontFamily: C.mono }}>{r.employee_code}</td>
                      <td style={{ ...td, textTransform: 'capitalize' }}>{r.role}</td>
                      <td style={td}>
                        {r.errors.length > 0 ? (
                          <span style={{ color: C.red }}>✗ {r.errors.join('; ')}</span>
                        ) : r.warnings.length > 0 ? (
                          <span style={{ color: C.amber }}>⚠ {r.warnings.join('; ')}</span>
                        ) : (
                          <span style={{ color: C.green }}>✓ Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Initial password</div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
              <input type="radio" checked={passwordMode === 'random'} onChange={() => setPasswordMode('random')} style={{ marginTop: 3 }} />
              <div>
                <div style={{ fontSize: 13 }}>Random per employee <span style={{ color: C.faint, fontWeight: 400 }}>(recommended)</span></div>
                <div style={{ fontSize: 11, color: C.faint }}>Each employee gets their own generated password — no shared secret.</div>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input type="radio" checked={passwordMode === 'shared'} onChange={() => setPasswordMode('shared')} style={{ marginTop: 3 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>Same password for everyone</div>
                <div style={{ fontSize: 11, color: C.faint, marginBottom: passwordMode === 'shared' ? 8 : 0 }}>
                  Anyone who knows it can sign in as any of these employees until they change it — each one is
                  required to set their own password immediately on first login.
                </div>
                {passwordMode === 'shared' && (
                  <input
                    value={sharedPassword}
                    onChange={e => setSharedPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    style={{ ...inputStyle(!sharedPasswordValid), maxWidth: 220 }}
                  />
                )}
              </div>
            </label>
          </div>

          {creating && (
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>
              Creating {progress.done} of {progress.total}…
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" disabled={creating} onClick={() => setStep('upload')}>‹ Choose different file</Btn>
            <Btn full disabled={creating || !canCreate} onClick={doCreate}>
              {creating ? 'Creating…' : `Create ${readyRows.length} employee${readyRows.length !== 1 ? 's' : ''}`}
            </Btn>
          </div>
        </div>
      )}

      {step === 'results' && (
        <div>
          <div style={{
            ...card, marginBottom: 16,
            background: createdCount > 0 ? C.greenBg : C.redBg,
            border: `1px solid ${createdCount > 0 ? C.greenLine : C.redLine}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: createdCount > 0 ? '#1f7350' : C.red, marginBottom: 4 }}>
              {createdCount} created{failedCount > 0 ? `, ${failedCount} failed` : ''}
            </div>
            {createdCount > 0 && (
              <div style={{ fontSize: 12, color: '#1f7350', lineHeight: 1.6 }}>
                These passwords are shown only once — export or copy them now and share each one securely
                with the employee it belongs to.
              </div>
            )}
          </div>

          {createdCount > 0 && (
            <Btn variant="ghost" sm style={{ marginBottom: 16 }} onClick={exportResults}>Export credentials CSV</Btn>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div className="hscroll">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.bgSec, textAlign: 'left' }}>
                    {['Name', 'Email', 'Code', 'Temporary password', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.email} style={{ borderTop: `1px solid ${C.rowLine}` }}>
                      <td style={td}>{r.full_name}</td>
                      <td style={td}>{r.email}</td>
                      <td style={{ ...td, fontFamily: C.mono }}>{r.employee_code}</td>
                      <td style={{ ...td, fontFamily: C.mono }}>
                        {r.status === 'created' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>{revealed.has(r.email) ? r.tempPassword : '••••••••'}</span>
                            <button onClick={() => toggleReveal(r.email)} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontSize: 11, fontWeight: 500, padding: 0 }}>
                              {revealed.has(r.email) ? 'Hide' : 'Reveal'}
                            </button>
                            <button onClick={() => copyPassword(r.tempPassword)} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontSize: 11, fontWeight: 500, padding: 0 }}>
                              Copy
                            </button>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={td}>
                        {r.status === 'created'
                          ? <span style={{ color: C.green }}>✓ Created</span>
                          : <span style={{ color: C.red }}>✗ {r.error || 'Failed'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Btn full onClick={onDone}>Done</Btn>
        </div>
      )}
    </div>
  )
}
