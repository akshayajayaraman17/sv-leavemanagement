import { useState } from 'react'
import { signIn } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { C, btnStyle, inputStyle, Field } from './UI'

// ── Shared card wrapper ────────────────────────────────────────────────────────
function LoginCard({ children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: C.bgSec, padding: 16,
    }}>
      <div style={{
        background: C.bg, border: `0.5px solid ${C.border}`,
        borderRadius: 16, padding: 32, width: '100%', maxWidth: 400,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: C.greenBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', fontSize: 22,
          }}>📋</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Leave Manager</div>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Sign In ────────────────────────────────────────────────────────────────────
function SignInForm({ onForgot }) {
  const [form, setForm]     = useState({ email: '', password: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(form.email, form.password)
    setLoading(false)
    if (error) setError(error.message)
  }

  return (
    <LoginCard>
      <div style={{ fontSize: 14, color: C.textSec, textAlign: 'center', marginBottom: 24 }}>
        Sign in to your account
      </div>
      <form onSubmit={submit}>
        <Field label="Work Email">
          <input
            type="email" required autoComplete="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            style={inputStyle()} placeholder="you@company.com"
          />
        </Field>
        <Field label="Password">
          <input
            type="password" required autoComplete="current-password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            style={inputStyle()} placeholder="••••••••"
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
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <button
        onClick={onForgot}
        style={{
          display: 'block', width: '100%', marginTop: 16,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, color: C.blue, textAlign: 'center',
        }}
      >
        Forgot password?
      </button>

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: C.textTert }}>
        Contact your admin if you don't have access
      </div>
    </LoginCard>
  )
}

// ── Forgot password — uses Supabase resetPasswordForEmail ─────────────────────
// step: 'email' → 'sent' → 'reset' → 'done'
function ForgotPassword({ onBack, startAtReset }) {
  const [step,    setStep]    = useState(startAtReset ? 'reset' : 'email')
  const [email,   setEmail]   = useState('')
  const [newPw,   setNewPw]   = useState('')
  const [confirm, setConfirm] = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  // Step 1 — send reset email
  const sendResetEmail = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('Enter your email address'); return }
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep('sent')
  }

  // Step 2 — set new password (after user clicks link in email)
  const resetPassword = async (e) => {
    e.preventDefault()
    if (!newPw || newPw.length < 8) { setError('Min 8 characters'); return }
    if (newPw !== confirm)           { setError('Passwords do not match'); return }
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setLoading(false)
    if (error) { setError(error.message); return }
    await supabase.auth.signOut()
    setStep('done')
  }

  return (
    <LoginCard>
      {/* Step indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
        {['email','sent','reset'].map((s, i) => {
          const stepIdx  = ['email','sent','reset'].indexOf(step)
          const isDone   = i < stepIdx || step === 'done'
          const isActive = s === step
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? C.green : isActive ? C.blue : C.bgTert,
                color: (isDone || isActive) ? '#fff' : C.textTert,
              }}>
                {isDone ? '✓' : i + 1}
              </div>
              {i < 2 && <div style={{ width: 24, height: 1, background: isDone ? C.green : C.border }} />}
            </div>
          )
        })}
      </div>

      {/* Step 1 — Email */}
      {step === 'email' && (
        <form onSubmit={sendResetEmail}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Forgot your password?</div>
          <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>
            Enter your work email and we'll send a password reset link.
          </div>
          <Field label="Work Email">
            <input
              type="email" required autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={inputStyle()}
            />
          </Field>
          {error && <div style={{ background: C.redBg, color: C.red, fontSize: 13, padding: '9px 12px', borderRadius: 8, marginBottom: 14 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ ...btnStyle(C.green, '#fff'), width: '100%', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>
      )}

      {/* Step 2 — Email sent confirmation */}
      {step === 'sent' && (
        <div>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📧</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Check your email</div>
            <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>
              We sent a password reset link to <strong>{email}</strong>. Click the link in the email to set a new password.
            </div>
            <div style={{ fontSize: 12, color: C.textTert, marginBottom: 20 }}>
              Don't see it? Check your spam folder. The link expires in 1 hour.
            </div>
          </div>
          <button
            onClick={() => { setError(''); sendResetEmail({ preventDefault: () => {} }) }}
            disabled={loading}
            style={{ ...btnStyle(C.blue, '#fff'), width: '100%', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Sending…' : 'Resend Email'}
          </button>
        </div>
      )}

      {/* Step 3 — New password (after clicking link) */}
      {step === 'reset' && (
        <form onSubmit={resetPassword}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Set new password</div>
          <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>
            Choose a strong new password for your account.
          </div>
          <Field label="New Password">
            <input
              type="password" required autoFocus
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="Min 8 characters"
              style={inputStyle()}
            />
          </Field>
          <Field label="Confirm Password">
            <input
              type="password" required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat new password"
              style={inputStyle()}
            />
          </Field>
          {error && <div style={{ background: C.redBg, color: C.red, fontSize: 13, padding: '9px 12px', borderRadius: 8, marginBottom: 14 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ ...btnStyle(C.green, '#fff'), width: '100%', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Updating…' : 'Set New Password'}
          </button>
        </form>
      )}

      {/* Done */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 44, color: C.green, marginBottom: 14 }}>✓</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Password reset!</div>
          <div style={{ fontSize: 13, color: C.textSec, marginBottom: 24 }}>
            Your password has been updated. Sign in with your new password.
          </div>
          <button onClick={onBack} style={{ ...btnStyle(C.green, '#fff'), width: '100%' }}>
            Back to Sign In
          </button>
        </div>
      )}

      {step !== 'done' && (
        <button
          onClick={onBack}
          style={{ display: 'block', width: '100%', marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.textTert }}
        >
          ‹ Back to sign in
        </button>
      )}
    </LoginCard>
  )
}

// ── Root export ────────────────────────────────────────────────────────────────
export default function Login() {
  const { isPasswordRecovery, clearPasswordRecovery } = useAuth()
  const [showForgot, setShowForgot] = useState(false)

  const handleBack = () => {
    setShowForgot(false)
    if (isPasswordRecovery) {
      clearPasswordRecovery()
      supabase.auth.signOut()
    }
  }

  if (isPasswordRecovery || showForgot) {
    return <ForgotPassword onBack={handleBack} startAtReset={isPasswordRecovery} />
  }
  return <SignInForm onForgot={() => setShowForgot(true)} />
}
