import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearMustChangePassword, signOut } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { C, Field, btnStyle, inputStyle } from './UI'

export default function ForcePasswordChange({ employee }) {
  const { refreshEmployee } = useAuth()
  const [newPw,   setNewPw]   = useState('')
  const [confirm, setConfirm] = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!newPw || newPw.length < 8) { setError('Min 8 characters'); return }
    if (newPw !== confirm)          { setError('Passwords do not match'); return }
    // Deliberately no "new password must differ from the temp password"
    // check here (unlike Profile.jsx's change-password flow). The temp
    // password only ever lives in Login.jsx's local state during
    // sign-in — reaching it here would mean threading a plaintext
    // password through AuthContext/App just for this one comparison,
    // which extends its exposure for a fairly marginal guarantee.
    setError('')
    setLoading(true)

    const { error: pwErr } = await supabase.auth.updateUser({ password: newPw })
    if (pwErr) { setLoading(false); setError(pwErr.message); return }

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
      <div style={{
        background: C.bg, border: `0.5px solid ${C.border}`,
        borderRadius: 16, padding: 32, width: '100%', maxWidth: 400,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: C.amberBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', fontSize: 22,
          }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Set a new password</div>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
            Your account was created with a temporary password. Choose your own to continue —
            you'll use it every time you sign in from now on.
          </div>
        </div>

        <form onSubmit={submit}>
          <Field label="New Password">
            <input
              type="password" required autoFocus
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="Min 8 characters"
              style={inputStyle()}
            />
          </Field>
          <Field label="Confirm New Password">
            <input
              type="password" required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat new password"
              style={inputStyle()}
            />
          </Field>

          {error && (
            <div style={{
              background: C.redBg, color: C.red, fontSize: 13,
              padding: '9px 12px', borderRadius: 8, marginBottom: 14,
            }}>{error}</div>
          )}

          <button
            type="submit" disabled={loading}
            style={{ ...btnStyle(C.green, '#fff'), width: '100%', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>

        <button
          onClick={() => signOut()}
          style={{
            display: 'block', width: '100%', marginTop: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: C.textTert, textAlign: 'center',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
