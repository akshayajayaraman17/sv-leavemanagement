import { useState } from 'react'
import { signIn } from '../lib/api'
import { supabase } from '../lib/supabase'
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

// ── Forgot password — OTP via magic link ──────────────────────────────────────
// step: 'email' → 'otp' → 'reset' → 'done'
function ForgotPassword({ onBack }) {
  const [step,    setStep]    = useState('email')
  const [email,   setEmail]   = useState('')
  const [otp,     setOtp]     = useState('')
  const [newPw,   setNewPw]   = useState('')
  const [confirm, setConfirm] = useState('')
  const [error,   setError]   = useState('')
  const [info,    setInfo]    = useState('')
  const [loading, setLoading] = useState(false)

  // Step 1 — send OTP
  const sendOtp = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('Enter your email address'); return }
    setError('')
    setInfo('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep('otp')
  }

  // Step 2 — verify OTP
  const verifyOtp = async (e) => {
    e.preventDefault()
    if (otp.trim().length < 6) { setError('Enter the 6-digit OTP from your email'); return }
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    })
    setLoading(false)
    if (error) { setError('Invalid or expired OTP. Try again.'); return }
    setStep('reset')
  }

  // Resend OTP
  const resendOtp = async () => {
    setError('')
    setInfo('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setInfo('OTP resent! Check your inbox.')
  }

  // Step 3 — set new password
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
        {['email','otp','reset'].map((s, i) => {
          const stepIdx  = ['email','otp','reset'].indexOf(step)
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
        <form onSubmit={sendOtp}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Forgot your password?</div>
          <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>
            Enter your work email and we'll send a 6-digit OTP to verify your identity.
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
            {loading ? 'Sending OTP…' : 'Send OTP'}
          </button>
        </form>
      )}

      {/* Step 2 — OTP */}
      {step === 'otp' && (
        <form onSubmit={verifyOtp}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Enter OTP</div>
          <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>
            A 6-digit code was sent to <strong>{email}</strong>. Check your inbox and spam folder.
          </div>
          <Field label="One-Time Password">
            <input
              type="text" required autoFocus inputMode="numeric"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              style={{ ...inputStyle(), letterSpacing: '0.3em', fontSize: 20, textAlign: 'center', fontWeight: 600 }}
            />
          </Field>
          {error && <div style={{ background: C.redBg, color: C.red, fontSize: 13, padding: '9px 12px', borderRadius: 8, marginBottom: 14 }}>{error}</div>}
          {info && <div style={{ background: C.greenBg, color: C.green, fontSize: 13, padding: '9px 12px', borderRadius: 8, marginBottom: 14 }}>{info}</div>}
          <button type="submit" disabled={loading} style={{ ...btnStyle(C.green, '#fff'), width: '100%', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Verifying…' : 'Verify OTP'}
          </button>
          <button
            type="button" onClick={resendOtp} disabled={loading}
            style={{ display: 'block', width: '100%', marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.blue }}
          >
            Resend OTP
          </button>
        </form>
      )}

      {/* Step 3 — New password */}
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
  const [showForgot, setShowForgot] = useState(false)

  if (showForgot) return <ForgotPassword onBack={() => setShowForgot(false)} />
  return <SignInForm onForgot={() => setShowForgot(true)} />
}
