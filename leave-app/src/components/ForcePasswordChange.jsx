import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearMustChangePassword, signOut } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { passwordError, PASSWORD_HINT } from '../lib/password'
import { C, Btn, Field, inputStyle } from './UI'

export default function ForcePasswordChange({ employee }) {
  const { refreshEmployee } = useAuth()
  const [tempPw, setTempPw]   = useState('')
  const [newPw, setNewPw]     = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!tempPw)               { setError('Enter the temporary password you just signed in with'); return }
    const pwRuleErr = passwordError(newPw)
    if (pwRuleErr)             { setError(pwRuleErr); return }
    if (newPw === tempPw)      { setError('Your new password must be different from the temporary one'); return }
    if (newPw !== confirm)     { setError('Passwords do not match'); return }
    setError(''); setLoading(true)

    // Re-authenticate with the temporary password first. The forced-change
    // screen is the one place a session can be stale before the user acts on
    // it (long-lived on this screen, opened in a shared browser, refresh token
    // rotated elsewhere) — signing in here guarantees updateUser runs against
    // a fresh session instead of failing with "Auth session missing".
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: employee.email,
      password: tempPw,
    })
    if (signInErr) {
      setLoading(false)
      setError('That temporary password is not correct. Use the one your admin gave you.')
      return
    }

    const { error: pwErr } = await supabase.auth.updateUser({ password: newPw })
    if (pwErr) {
      setLoading(false)
      setError(pwErr.message || 'Could not update your password. Try again.')
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
          Your account was created with a temporary password. Confirm it below and choose your own — you'll use the new one every time you sign in from now on.
        </div>

        <form onSubmit={submit}>
          <Field label="Temporary password" hint="The password your admin gave you, that you just signed in with.">
            <input type="password" required autoFocus autoComplete="current-password" value={tempPw} onChange={e => setTempPw(e.target.value)} placeholder="Temporary password" style={inputStyle()} />
          </Field>
          <Field label="New password" hint={PASSWORD_HINT}>
            <input type="password" required autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Choose a strong password" style={inputStyle()} />
          </Field>
          <Field label="Confirm new password">
            <input type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" style={inputStyle()} />
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
