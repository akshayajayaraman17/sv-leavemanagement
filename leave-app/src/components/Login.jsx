import { useState } from 'react'
import { signIn } from '../lib/api'
import { supabase } from '../lib/supabase'
import { passwordError, PASSWORD_HINT } from '../lib/password'
import { C, Btn, Field, inputStyle } from './UI'

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: C.bgSec, padding: 16,
    }}>
      <div style={{
        background: '#fff', border: `1px solid ${C.line}`,
        borderRadius: 16, padding: 32, width: '100%', maxWidth: 400,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: C.navy, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif, fontSize: 18,
          }}>L</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Leave Manager</div>
            <div style={{ fontSize: 11, color: C.muted }}>Strategic Ventures</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

const errBox = {
  background: C.redBg, color: C.red, border: `1px solid ${C.redLine}`,
  fontSize: 12.5, padding: '9px 12px', borderRadius: 9, marginBottom: 14,
}
const okBox = {
  background: C.greenBg, color: '#1f7350', border: `1px solid ${C.greenLine}`,
  fontSize: 12.5, padding: '9px 12px', borderRadius: 9, marginBottom: 14,
}

function SignInForm({ onForgot, blockedMessage }) {
  const [form, setForm]       = useState({ email: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await signIn(form.email, form.password)
    setLoading(false)
    if (error) setError(error.message)
  }

  return (
    <Shell>
      <div style={{ fontFamily: C.serif, fontSize: 24, marginBottom: 4 }}>Sign in</div>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 22 }}>Use your work email and password.</div>
      {blockedMessage && <div style={errBox}>{blockedMessage}</div>}
      <form onSubmit={submit}>
        <Field label="Work email">
          <input type="email" required autoComplete="email"
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            style={inputStyle()} placeholder="you@strategicventures.co.in" />
        </Field>
        <Field label="Password">
          <input type="password" required autoComplete="current-password"
            value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            style={inputStyle()} placeholder="••••••••" />
        </Field>
        {error && <div style={errBox}>{error}</div>}
        <Btn type="submit" full disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</Btn>
      </form>
      <button onClick={onForgot} style={{ display: 'block', width: '100%', marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.blue }}>
        Forgot password?
      </button>
      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: C.muted }}>
        Contact your admin if you don't have access.
      </div>
    </Shell>
  )
}

// step: 'email' → 'otp' → 'reset' → 'done'
function ForgotPassword({ onBack }) {
  const [step, setStep]       = useState('email')
  const [email, setEmail]     = useState('')
  const [otp, setOtp]         = useState('')
  const [newPw, setNewPw]     = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError]     = useState('')
  const [info, setInfo]       = useState('')
  const [loading, setLoading] = useState(false)

  const sendOtp = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('Enter your email address'); return }
    setError(''); setInfo(''); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep('otp')
  }

  const verifyOtp = async (e) => {
    e.preventDefault()
    if (otp.trim().length < 6) { setError('Enter the 6-digit OTP from your email'); return }
    setError(''); setLoading(true)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: 'recovery' })
    setLoading(false)
    if (error) { setError('Invalid or expired OTP. Try again.'); return }
    setStep('reset')
  }

  const resendOtp = async () => {
    setError(''); setInfo(''); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setLoading(false)
    if (error) { setError(error.message); return }
    setInfo('OTP resent — check your inbox.')
  }

  const resetPassword = async (e) => {
    e.preventDefault()
    const pwErr = passwordError(newPw)
    if (pwErr)             { setError(pwErr); return }
    if (newPw !== confirm) { setError('Passwords do not match'); return }
    setError(''); setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setLoading(false)
    if (error) { setError(error.message); return }
    await supabase.auth.signOut()
    setStep('done')
  }

  const steps = ['email', 'otp', 'reset']
  const stepIdx = steps.indexOf(step)

  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 22 }}>
        {steps.map((s, i) => {
          const done = i < stepIdx || step === 'done'
          const active = s === step
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', fontSize: 10.5, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? C.navy : active ? C.navy : C.bgTert,
                color: (done || active) ? '#fff' : C.muted,
              }}>{done ? '✓' : i + 1}</div>
              {i < 2 && <div style={{ width: 22, height: 1, background: done ? C.navy : C.line }} />}
            </div>
          )
        })}
      </div>

      {step === 'email' && (
        <form onSubmit={sendOtp}>
          <div style={{ fontFamily: C.serif, fontSize: 20, marginBottom: 6 }}>Forgot your password?</div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 18 }}>We'll send a 6-digit OTP to verify your identity.</div>
          <Field label="Work email">
            <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="you@strategicventures.co.in" style={inputStyle()} />
          </Field>
          {error && <div style={errBox}>{error}</div>}
          <Btn type="submit" full disabled={loading}>{loading ? 'Sending…' : 'Send OTP'}</Btn>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={verifyOtp}>
          <div style={{ fontFamily: C.serif, fontSize: 20, marginBottom: 6 }}>Enter OTP</div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 18 }}>Sent to <strong>{email}</strong>. Check inbox and spam.</div>
          <Field label="One-time password">
            <input type="text" required autoFocus inputMode="numeric" maxLength={6}
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              style={{ ...inputStyle(), letterSpacing: '0.3em', fontSize: 20, textAlign: 'center', fontWeight: 600, fontFamily: C.mono }} />
          </Field>
          {error && <div style={errBox}>{error}</div>}
          {info && <div style={okBox}>{info}</div>}
          <Btn type="submit" full disabled={loading}>{loading ? 'Verifying…' : 'Verify OTP'}</Btn>
          <button type="button" onClick={resendOtp} disabled={loading} style={{ display: 'block', width: '100%', marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.blue }}>Resend OTP</button>
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={resetPassword}>
          <div style={{ fontFamily: C.serif, fontSize: 20, marginBottom: 6 }}>Set new password</div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 18 }}>Choose a strong new password.</div>
          <Field label="New password" hint={PASSWORD_HINT}>
            <input type="password" required autoFocus value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Choose a strong password" style={inputStyle()} />
          </Field>
          <Field label="Confirm password">
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" style={inputStyle()} />
          </Field>
          {error && <div style={errBox}>{error}</div>}
          <Btn type="submit" full disabled={loading}>{loading ? 'Updating…' : 'Set new password'}</Btn>
        </form>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 40, color: C.green, marginBottom: 12 }}>✓</div>
          <div style={{ fontFamily: C.serif, fontSize: 20, marginBottom: 8 }}>Password reset</div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 22 }}>Sign in with your new password.</div>
          <Btn full onClick={onBack}>Back to sign in</Btn>
        </div>
      )}

      {step !== 'done' && (
        <button onClick={onBack} style={{ display: 'block', width: '100%', marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.muted }}>‹ Back to sign in</button>
      )}
    </Shell>
  )
}

export default function Login({ blockedMessage }) {
  const [showForgot, setShowForgot] = useState(false)
  if (showForgot) return <ForgotPassword onBack={() => setShowForgot(false)} />
  return <SignInForm onForgot={() => setShowForgot(true)} blockedMessage={blockedMessage} />
}
