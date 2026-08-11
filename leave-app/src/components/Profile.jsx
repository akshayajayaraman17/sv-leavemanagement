import { useEffect, useState } from 'react'
import { fetchEmployees, updateProfile } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Avatar, C, Field, SecTitle, btnStyle, card, formatDate, inputStyle } from './UI'

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', employee: 'Employee' }

export default function Profile({ employee, onToast }) {
  const [form, setForm] = useState({
    phone:         employee.phone         || '',
    address:       employee.address       || '',
    date_of_birth: employee.date_of_birth || '',
  })
  const [saving, setSaving] = useState(false)
  const [manager, setManager] = useState(null)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!employee.manager_id) return
    fetchEmployees().then(({ data }) => {
      setManager((data || []).find(e => e.id === employee.manager_id) || null)
    })
  }, [employee.manager_id])

  // Change password state
  const [pw, setPw]         = useState({ current: '', newPw: '', confirm: '' })
  const [pwErrs, setPwErrs] = useState({})
  const [changingPw, setChangingPw] = useState(false)
  const [pwStep, setPwStep] = useState('form') // 'form' | 'success'

  const saveProfile = async () => {
    setSaving(true)
    const { error } = await updateProfile(employee.id, {
      phone:         form.phone.trim() || null,
      address:       form.address.trim() || null,
      date_of_birth: form.date_of_birth || null,
    })
    setSaving(false)
    if (error) { onToast(error.message, 'error'); return }
    onToast('Profile updated')
  }

  const changePassword = async () => {
    const e = {}
    if (!pw.current)                  e.current = 'Required'
    if (!pw.newPw)                    e.newPw   = 'Required'
    else if (pw.newPw.length < 8)     e.newPw   = 'Min 8 characters'
    if (pw.newPw !== pw.confirm)      e.confirm  = 'Passwords do not match'
    if (pw.current && pw.current === pw.newPw) e.newPw = 'New password must differ from current'
    if (Object.keys(e).length) { setPwErrs(e); return }

    setChangingPw(true)

    // Step 1: verify current password
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email:    employee.email,
      password: pw.current,
    })
    if (signInErr) {
      setChangingPw(false)
      setPwErrs({ current: 'Incorrect current password' })
      return
    }

    // Step 2: set new password
    const { error } = await supabase.auth.updateUser({ password: pw.newPw })
    setChangingPw(false)
    if (error) { onToast(error.message, 'error'); return }

    setPw({ current: '', newPw: '', confirm: '' })
    setPwErrs({})
    setPwStep('success')
    setTimeout(() => setPwStep('form'), 4000)
    onToast('Password changed successfully')
  }

  return (
    <div>
      {/* ── Avatar + name card ── */}
      <div style={{ ...card, background: C.bgSec, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar initials={employee.avatar_initials} size={60} color={C.green} bg={C.greenBg} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.2 }}>{employee.full_name}</div>
            <div style={{ fontSize: 13, color: C.textSec, marginTop: 3 }}>
              {employee.designation || ROLE_LABEL[employee.role]}
            </div>
            <div style={{ fontSize: 12, color: C.textTert, marginTop: 2 }}>
              {employee.department || '—'} · {employee.employee_code}
            </div>
          </div>
        </div>
      </div>

      {/* ── Account info (read-only) ── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <SecTitle>Account Info</SecTitle>
        <div style={{ fontSize: 11, color: C.textTert, marginBottom: 8 }}>
          These are set by your admin — contact them to make changes.
        </div>
        {[
          ['Email',              employee.email],
          ['Role',               ROLE_LABEL[employee.role]],
          ['Department',         employee.department  || '—'],
          ['Designation',        employee.designation || '—'],
          ['Reporting Manager',  manager?.full_name    || '—'],
          ['Date of Joining',    formatDate(employee.joining_date)],
          ['Employee Code',      employee.employee_code],
          ['Status',             employee.is_active ? 'Active' : 'Inactive'],
        ].map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '9px 0', borderBottom: `0.5px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 13, color: C.textSec }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{value || '—'}</span>
          </div>
        ))}
      </div>

      {/* ── Editable fields ── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <SecTitle>Edit Profile</SecTitle>
        <Field label="Phone Number">
          <input
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="+91 98765 43210"
            style={inputStyle()}
          />
        </Field>
        <Field label="Address">
          <textarea
            rows={3}
            value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            placeholder="Your home / current address"
            style={{ ...inputStyle(), resize: 'vertical' }}
          />
        </Field>
        <Field label="Date of Birth" hint="Shown to coworkers on the dashboard during your birthday month">
          <input
            type="date"
            value={form.date_of_birth}
            max={today}
            onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
            style={inputStyle()}
          />
        </Field>
        <button
          onClick={saveProfile}
          disabled={saving}
          style={{ ...btnStyle(C.green, '#fff'), width: '100%', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* ── Change password ── */}
      <div style={{ ...card }}>
        <SecTitle>Change Password</SecTitle>

        {pwStep === 'success' ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: C.green }}>Password changed successfully</div>
          </div>
        ) : (
          <>
            <Field label="Current Password" error={pwErrs.current}>
              <input
                type="password"
                value={pw.current}
                onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
                placeholder="Your current password"
                style={inputStyle(pwErrs.current)}
              />
            </Field>
            <Field label="New Password" error={pwErrs.newPw}>
              <input
                type="password"
                value={pw.newPw}
                onChange={e => setPw(p => ({ ...p, newPw: e.target.value }))}
                placeholder="Min 8 characters"
                style={inputStyle(pwErrs.newPw)}
              />
            </Field>
            <Field label="Confirm New Password" error={pwErrs.confirm}>
              <input
                type="password"
                value={pw.confirm}
                onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                placeholder="Repeat new password"
                style={inputStyle(pwErrs.confirm)}
              />
            </Field>
            <button
              onClick={changePassword}
              disabled={changingPw}
              style={{ ...btnStyle(C.blue, '#fff'), width: '100%', opacity: changingPw ? 0.7 : 1 }}
            >
              {changingPw ? 'Verifying…' : 'Change Password'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
