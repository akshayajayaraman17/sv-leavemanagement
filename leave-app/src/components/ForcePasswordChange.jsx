import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearMustChangePassword, signOut } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { passwordError, PASSWORD_HINT } from '../lib/password'
import { C, Btn, Field, inputStyle } from './UI'

export default function ForcePasswordChange({ employee }) {
  const { refreshEmployee } = useAuth()
  const [newPw, setNewPw]     = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const pwRuleErr = passwordError(newPw)
    if (pwRuleErr)         { setError(pwRuleErr); return }
    if (newPw !== confirm) { setError('Passwords do not match'); return }
    setError(''); setLoading(true)

    const { error: pwErr } = await supabase.auth.updateUser({ password: newPw })
    if (pwErr) {
      setLoading(false)
      setError(
        /session (missing|expired|not found)|not authenticated|jwt/i.test(pwErr.message || '')
          ? 'Your sign-in session expired before this could be saved. Sign out, sign back in with your temporary password, and try again.'
          : pwErr.message
      )
      return
    }

    const { error: clearErr } = await clearMustChangePassword(employee.id)
    setLoading(false)
    if (clearErr) { setError(clearErr.message); return }
    await refreshEmployee()
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: C.bgSec, padding: 16,
    }}>
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 400 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: '#f6ecd9', color: '#8a6a22',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, marginBottom: 14,
        }}>🔒</div>
        <div style={{ fontFamily: C.serif, fontSize: 22, marginBottom: 6 }}>Set a new password</div>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, marginBottom: 22 }}>
          Your account was created with a temporary password. Choose your own to continue — you'll use it every time you sign in from now on.
        </div>

        <form onSubmit={submit}>
          <Field label="New password" hint={PASSWORD_HINT}>
            <input type="password" required autoFocus value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Choose a strong password" style={inputStyle()} />
          </Field>
          <Field label="Confirm new password">
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" style={inputStyle()} />
          </Field>
          {error && (
            <div style={{ background: C.redBg, color: C.red, border: `1px solid ${C.redLine}`, fontSize: 12.5, padding: '9px 12px', borderRadius: 9, marginBottom: 14 }}>{error}</div>
          )}
          <Btn type="submit" full disabled={loading}>{loading ? 'Saving…' : 'Set password & continue'}</Btn>
        </form>

        <button onClick={() => signOut()} style={{ display: 'block', width: '100%', marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.muted }}>Sign out</button>
      </div>
    </div>
  )
}
