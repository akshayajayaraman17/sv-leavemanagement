import { useEffect, useState } from 'react'
import { fetchEmployees, updateProfile } from '../lib/api'
import { supabase } from '../lib/supabase'
import { passwordError, PASSWORD_HINT } from '../lib/password'
import { Avatar, Btn, C, Field, KV, Panel, ProgressBar, SecTitle, card, formatDate, inputStyle } from './UI'
import { todayStr } from '../lib/dates'

const ROLE = { admin: 'Admin', manager: 'Manager', employee: 'Employee' }

export default function Profile({ employee, onToast }) {
  const [form, setForm] = useState({
    phone: employee.phone || '', address: employee.address || '', date_of_birth: employee.date_of_birth || '',
  })
  const [saving, setSaving] = useState(false)
  const [manager, setManager] = useState(null)
  const today = todayStr()

  useEffect(() => {
    if (!employee.manager_id) return
    fetchEmployees().then(({ data }) => setManager((data || []).find(e => e.id === employee.manager_id) || null))
  }, [employee.manager_id])

  const [pw, setPw] = useState({ current: '', newPw: '', confirm: '' })
  const [pwErrs, setPwErrs] = useState({})
  const [changingPw, setChangingPw] = useState(false)
  const [pwStep, setPwStep] = useState('form')
  const [showPw, setShowPw] = useState(false)

  const saveProfile = async () => {
    setSaving(true)
    const { error } = await updateProfile(employee.id, {
      phone: form.phone.trim() || null, address: form.address.trim() || null, date_of_birth: form.date_of_birth || null,
    })
    setSaving(false)
    if (error) { onToast(error.message, 'error'); return }
    onToast('Profile updated')
  }

  const changePassword = async () => {
    const e = {}
    if (!pw.current) e.current = 'Required'
    const err = passwordError(pw.newPw)
    if (err) e.newPw = err
    if (pw.newPw !== pw.confirm) e.confirm = 'Passwords do not match'
    if (pw.current && pw.current === pw.newPw) e.newPw = 'New password must differ from current'
    if (Object.keys(e).length) { setPwErrs(e); return }
    setChangingPw(true)
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: employee.email, password: pw.current })
    if (signInErr) { setChangingPw(false); setPwErrs({ current: 'Incorrect current password' }); return }
    const { error } = await supabase.auth.updateUser({ password: pw.newPw })
    setChangingPw(false)
    if (error) { onToast(error.message, 'error'); return }
    setPw({ current: '', newPw: '', confirm: '' }); setPwErrs({}); setPwStep('success')
    onToast('Password changed successfully')
  }

  return (
    <div className="split-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ ...card, padding: '24px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Avatar initials={employee.avatar_initials} size={56} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontFamily: C.serif, fontSize: 24 }}>{employee.full_name}</div>
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>{employee.designation || ROLE[employee.role]} · {employee.employee_code}</div>
            </div>
            <Btn variant="ghost" sm onClick={() => setShowPw(v => !v)}>{showPw ? 'Hide' : 'Change password'}</Btn>
          </div>
          <div style={{ marginTop: 22 }}>
            <SecTitle>Details</SecTitle>
            <KV k="Email" v={employee.email} />
            <KV k="Role" v={ROLE[employee.role]} />
            <KV k="Department" v={employee.department} />
            <KV k="Designation" v={employee.designation} />
            <KV k="Reporting manager" v={manager?.full_name} />
            <KV k="Date of joining" v={formatDate(employee.joining_date)} />
            <KV k="Status" v={employee.is_active ? 'Active' : 'Inactive'} last />
          </div>
        </div>

        {showPw && (
        <Panel title="Change password">
          {pwStep === 'success' ? (
            <div style={{ background: C.greenBg, border: `1px solid ${C.greenLine}`, borderRadius: 9, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#1f7350' }}>Password updated successfully.</span>
              <button onClick={() => setPwStep('form')} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1f7350', fontSize: 17, lineHeight: 1 }}>×</button>
            </div>
          ) : (
            <>
              <Field label="Current password" error={pwErrs.current}>
                <input type="password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} placeholder="Your current password" style={inputStyle(pwErrs.current)} />
              </Field>
              <Field label="New password" error={pwErrs.newPw} hint={PASSWORD_HINT}>
                <input type="password" value={pw.newPw} onChange={e => setPw(p => ({ ...p, newPw: e.target.value }))} placeholder="Choose a strong password" style={inputStyle(pwErrs.newPw)} />
              </Field>
              <Field label="Confirm new password" error={pwErrs.confirm}>
                <input type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} placeholder="Repeat new password" style={inputStyle(pwErrs.confirm)} />
              </Field>
              <Btn full disabled={changingPw} onClick={changePassword}>{changingPw ? 'Verifying…' : 'Change password'}</Btn>
            </>
          )}
        </Panel>
        )}

        <Panel title="Edit profile">
          <Field label="Phone number"><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" style={inputStyle()} /></Field>
          <Field label="Address"><textarea rows={3} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Your home / current address" style={{ ...inputStyle(), resize: 'vertical' }} /></Field>
          <Field label="Date of birth" hint="Shown to coworkers on the dashboard during your birthday month">
            <input type="date" max={today} value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} style={inputStyle()} />
          </Field>
          <Btn full disabled={saving} onClick={saveProfile}>{saving ? 'Saving…' : 'Save changes'}</Btn>
        </Panel>
      </div>

      <ProfileBalance employee={employee} onToast={onToast} />
    </div>
  )
}

function ProfileBalance({ employee, onToast }) {
  const [balances, setBalances] = useState([])
  useEffect(() => {
    import('../lib/api').then(({ fetchLeaveBalance }) =>
      fetchLeaveBalance(employee.id).then(({ data, error }) => { if (error) onToast?.('Failed to load balance', 'error'); setBalances(data || []) }))
  }, [employee.id])
  return (
    <Panel title="Leave balance" style={{ position: 'sticky', top: 24 }}>
      {balances.map((b, i) => {
        const pct = b.total > 0 ? Math.round((b.used / b.total) * 100) : 0
        return (
          <div key={b.type_code} style={{ marginBottom: i < balances.length - 1 ? 14 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 12.5, color: C.body }}>
              <span>{b.label}</span>
              <span style={{ fontFamily: C.mono, fontSize: 11.5 }}><span style={{ color: C.ink }}>{b.remaining}</span><span style={{ color: C.faint }}> of {b.total} left</span></span>
            </div>
            <div style={{ marginTop: 6 }}><ProgressBar pct={pct} color={b.type_code === 'comp' ? '#c2882a' : '#3a76ad'} /></div>
          </div>
        )
      })}
    </Panel>
  )
}
