import { useState } from 'react'
import { signIn } from '../lib/api'
import { C, btnStyle, inputStyle, Field } from './UI'

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
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
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: C.bgSec, padding: 16,
    }}>
      <div style={{
        background: C.bg, border: `0.5px solid ${C.border}`,
        borderRadius: 16, padding: 32, width: '100%', maxWidth: 400,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: C.greenBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', fontSize: 22,
          }}>📋</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Leave Manager</div>
          <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>Sign in to your account</div>
        </div>

        <form onSubmit={submit}>
          <Field label="Work Email">
            <input
              type="email" required autoComplete="email"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              style={inputStyle()} placeholder="you@company.com"
            />
          </Field>
          <Field label="Password">
            <input
              type="password" required autoComplete="current-password"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
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

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: C.textTert }}>
          Contact your admin if you don't have access
        </div>
      </div>
    </div>
  )
}
