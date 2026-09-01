import { useState } from 'react'
import { passwordError, PASSWORD_HINT } from '../lib/password'

// ─── Design tokens ────────────────────────────────────────────────────────────
// Palette rebuilt to the navy / Newsreader / IBM Plex Mono system. The legacy
// key names (bg, bgSec, textSec, green, greenBg, …) are kept so screens don't
// all break at once — they now resolve to the new values.
export const C = {
  bg:        '#ffffff',
  bgSec:     '#f7f9fc',
  bgTert:    '#eef2f7',
  panel:     '#ffffff',
  sidebar:   '#edf1f7',

  border:    '#dce4ee',
  borderMed: '#c8d3e0',
  line:      '#dce4ee',
  lineSoft:  '#eef2f7',
  rowLine:   '#f1f5fa',

  text:      '#101828',
  ink:       '#101828',
  body:      '#3d4a5c',
  textSec:   '#5b6878',
  sub:       '#5b6878',
  textTert:  '#94a1b3',
  muted:     '#94a1b3',
  faint:     '#b3bdcb',

  navy:      '#14406b',
  navyHover: '#0e3054',
  navyBg:    '#e4edf7',

  green:     '#1f7a54',
  greenBg:   '#e7f3ec',
  greenLine: '#c7e3d5',
  greenDot:  '#2f9e6b',
  blue:      '#1f6fb2',
  blueBg:    '#eaf2fb',
  blueLine:  '#cfe0f1',
  amber:     '#a9761d',
  amberBg:   '#f8efdb',
  amberLine: '#e7d5ad',
  purple:    '#5b52c9',
  purpleBg:  '#eeedfe',
  purpleLine:'#d6d2f4',
  red:       '#a83526',
  redBg:     '#f9ece9',
  redLine:   '#e6c9c4',

  sans:  'var(--sans)',
  serif: 'var(--serif)',
  mono:  'var(--mono)',
}

export const card = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 14,
  padding: 20,
  boxSizing: 'border-box',
}

export const inputStyle = (err) => ({
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 12px',
  fontSize: 13.5,
  border: `1px solid ${err ? '#c9564a' : '#d8e0ea'}`,
  borderRadius: 9,
  background: C.bg,
  color: C.ink,
  outline: 'none',
})

export const btnStyle = (bg, color, border) => ({
  background: bg,
  color,
  border: border || '1px solid transparent',
  borderRadius: 9,
  padding: '10px 18px',
  fontSize: 13.5,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  lineHeight: 1.2,
})

// ─── Button ───────────────────────────────────────────────────────────────────
const BTN_VARIANTS = {
  primary: { background: C.navy,   color: '#fff',    border: '1px solid transparent' },
  ghost:   { background: '#fff',   color: '#2b3648', border: `1px solid #d3dce7` },
  subtle:  { background: '#f1f5fa',color: '#2b3648', border: '1px solid transparent' },
  danger:  { background: '#fff',   color: C.red,     border: `1px solid ${C.redLine}` },
  navySoft:{ background: C.navyBg, color: C.navy,    border: '1px solid transparent' },
}
export function Btn({ variant = 'primary', full, sm, disabled, style, children, ...rest }) {
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary
  return (
    <button
      disabled={disabled}
      style={{
        ...v,
        borderRadius: 9,
        padding: sm ? '7px 13px' : '10px 18px',
        fontSize: sm ? 12.5 : 13.5,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        width: full ? '100%' : undefined,
        opacity: disabled ? 0.55 : 1,
        lineHeight: 1.2,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
export function Avatar({ initials, size = 34, color = C.navy, bg = C.navyBg, round = false }) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: round ? '50%' : Math.round(size * 0.28),
      background: bg, color, fontWeight: 600,
      fontSize: size * 0.36, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {initials || '?'}
    </div>
  )
}

// ─── Monospace inline value ───────────────────────────────────────────────────
export function Mono({ children, style }) {
  return <span style={{ fontFamily: C.mono, ...style }}>{children}</span>
}

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS = {
  approved:  { bg: C.greenBg, fg: '#1f7350', line: C.greenLine, label: 'Approved'  },
  present:   { bg: C.greenBg, fg: '#1f7350', line: C.greenLine, label: 'Present'   },
  active:    { bg: C.greenBg, fg: '#1f7350', line: C.greenLine, label: 'Active'    },
  submitted: { bg: C.amberBg, fg: '#8a6a22', line: C.amberLine, label: 'Submitted' },
  pending:   { bg: C.amberBg, fg: '#8a6a22', line: C.amberLine, label: 'Pending'   },
  incomplete:{ bg: C.amberBg, fg: '#8a6a22', line: C.amberLine, label: 'Incomplete'},
  rejected:  { bg: C.redBg,   fg: C.red,     line: C.redLine,   label: 'Rejected'  },
  locked:    { bg: C.redBg,   fg: C.red,     line: C.redLine,   label: 'Locked'    },
  cancelled: { bg: C.bgTert,  fg: C.sub,     line: C.line,      label: 'Cancelled' },
  inactive:  { bg: C.bgTert,  fg: C.sub,     line: C.line,      label: 'Inactive'  },
  draft:     { bg: C.bgTert,  fg: C.sub,     line: C.line,      label: 'Draft'     },
}
export function Badge({ status, label }) {
  const s = STATUS[status] || STATUS.pending
  return (
    <span style={{
      background: s.bg, color: s.fg, border: `1px solid ${s.line}`,
      fontSize: 10.5, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase',
      padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
    }}>{label || s.label}</span>
  )
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
export function Field({ label, error, children, hint, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      {label && (
        <label style={{ fontSize: 12.5, fontWeight: 500, color: C.sub, marginBottom: 5, display: 'block' }}>
          {label}
          {error && <span style={{ color: '#c9564a', fontWeight: 400, marginLeft: 8, fontSize: 11.5 }}>{error}</span>}
        </label>
      )}
      {children}
      {hint && !error && <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}

// ─── Section title (uppercase eyebrow) ────────────────────────────────────────
export function SecTitle({ children, style }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 600, color: C.muted,
      textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Panel (card with optional header) ────────────────────────────────────────
export function Panel({ title, right, children, style, bodyStyle, pad = 20 }) {
  return (
    <div style={{ ...card, padding: 0, ...style }}>
      {(title || right) && (
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 12, padding: `16px ${pad}px 0`,
        }}>
          {title && <SecTitle style={{ marginBottom: 0 }}>{title}</SecTitle>}
          {right}
        </div>
      )}
      <div style={{ padding: pad, ...bodyStyle }}>{children}</div>
    </div>
  )
}

// ─── Stat tile ────────────────────────────────────────────────────────────────
export function StatTile({ label, value, unit, meta, pct, color = '#3a76ad', foot }) {
  return (
    <div style={{ ...card }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 12.5, color: C.sub }}>{label}</span>
        {meta && <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>{meta}</span>}
      </div>
      <div style={{ fontFamily: C.serif, fontSize: 32, lineHeight: 1, marginTop: 10 }}>
        {value}{unit && <span style={{ fontSize: 14, color: C.faint, fontFamily: C.sans }}> {unit}</span>}
      </div>
      {pct != null && (
        <div style={{ height: 4, borderRadius: 2, background: C.lineSoft, marginTop: 14, overflow: 'hidden' }}>
          <div style={{ height: 4, width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
        </div>
      )}
      {foot && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: C.faint }}>{foot}</div>}
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ pct, color = '#3a76ad', height = 5 }) {
  return (
    <div style={{ height, borderRadius: height / 2, background: C.lineSoft, overflow: 'hidden' }}>
      <div style={{ height, width: `${Math.max(0, Math.min(100, pct || 0))}%`, background: color }} />
    </div>
  )
}

// ─── Tabs (underline) ─────────────────────────────────────────────────────────
export function Tabs({ items, value, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: 22, borderBottom: `1px solid ${C.line}`, marginBottom: 18, flexWrap: 'wrap', ...style }}>
      {items.map(t => {
        const on = t.id === value
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: '9px 2px 12px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? 600 : 400,
              color: on ? C.navy : C.sub,
              boxShadow: on ? `inset 0 -2px 0 ${C.navy}` : 'none',
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            {t.label}
            {t.count != null && (
              <span style={{ fontFamily: C.mono, fontSize: 10.5, color: t.count > 0 ? '#3a76ad' : C.faint }}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Segmented control (pill group) ──────────────────────────────────────────
export function Segmented({ items, value, onChange, style }) {
  return (
    <div style={{ display: 'inline-flex', gap: 3, padding: 3, background: '#e2e9f2', borderRadius: 9, ...style }}>
      {items.map(t => {
        const on = t.id === value
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, fontWeight: on ? 600 : 400,
              background: on ? '#fff' : 'transparent',
              color: on ? C.navy : C.sub,
              boxShadow: on ? '0 1px 2px rgba(16,24,40,0.12)' : 'none',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Key / value row ──────────────────────────────────────────────────────────
export function KV({ k, v, last }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 12,
      padding: '7px 0', borderBottom: last ? 'none' : `1px solid ${C.rowLine}`,
      fontSize: 13,
    }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ color: C.body }}>{v ?? '—'}</span>
    </div>
  )
}

// ─── Loading spinner ──────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        border: '2px solid #e3e9f1', borderTopColor: C.navy,
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function Empty({ text }) {
  return <div style={{ textAlign: 'center', padding: '44px 0', color: C.muted, fontSize: 13 }}>{text}</div>
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export function Toast({ msg, type = 'success', onClose }) {
  if (!msg) return null
  const err = type === 'error'
  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      background: err ? C.redBg : C.greenBg, color: err ? C.red : '#1f7350',
      border: `1px solid ${err ? C.redLine : C.greenLine}`,
      borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 500,
      zIndex: 2000, display: 'flex', alignItems: 'center', gap: 10, maxWidth: 380,
      boxShadow: '0 8px 24px rgba(16,24,40,0.12)',
    }}>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  )
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
export function Modal({ title, children, onClose, footer, width = 420 }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.42)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: width }}>
        {title && <div style={{ fontFamily: C.serif, fontSize: 19, marginBottom: 10 }}>{title}</div>}
        {children}
        {footer && <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────
export function Confirm({ msg, onYes, onNo, yesLabel = 'Yes, proceed' }) {
  return (
    <Modal title="Confirm" onClose={onNo} width={340} footer={
      <>
        <Btn variant="ghost" full onClick={onNo}>Cancel</Btn>
        <Btn variant="danger" full onClick={onYes}>{yesLabel}</Btn>
      </>
    }>
      <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>{msg}</div>
    </Modal>
  )
}

// ─── Offboard modal ───────────────────────────────────────────────────────────
const EXIT_REASONS = ['Resignation', 'Termination', 'Layoff', 'End of contract', 'Other']

export function OffboardModal({ name, onConfirm, onCancel, submitting }) {
  const [exitDate, setExitDate]       = useState(new Date().toISOString().split('T')[0])
  const [reasonKind, setReasonKind]   = useState('Resignation')
  const [otherReason, setOtherReason] = useState('')
  const reason = reasonKind === 'Other' ? otherReason.trim() : reasonKind
  const canSubmit = !submitting && (reasonKind !== 'Other' || otherReason.trim())

  return (
    <Modal title={`Deactivate ${name}?`} onClose={onCancel} width={380} footer={
      <>
        <Btn variant="ghost" full disabled={submitting} onClick={onCancel}>Cancel</Btn>
        <Btn variant="danger" full disabled={!canSubmit}
          onClick={() => onConfirm({ exitDate, exitReason: reason || null })}>
          {submitting ? 'Deactivating…' : 'Deactivate'}
        </Btn>
      </>
    }>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 16, lineHeight: 1.6 }}>
        They lose access immediately and are skipped as an approver. Reversible with Reactivate.
      </div>
      <Field label="Last working day">
        <input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} style={inputStyle()} />
      </Field>
      <Field label="Reason">
        <select value={reasonKind} onChange={e => setReasonKind(e.target.value)} style={inputStyle()}>
          {EXIT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      {reasonKind === 'Other' && (
        <Field label="Specify reason">
          <input value={otherReason} onChange={e => setOtherReason(e.target.value)} style={inputStyle()} placeholder="Reason for leaving" />
        </Field>
      )}
    </Modal>
  )
}

// ─── Reset password modal ─────────────────────────────────────────────────────
export function ResetPasswordModal({ name, onConfirm, onCancel, submitting }) {
  const [pw, setPw]           = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)

  const pwErr = passwordError(pw)
  const mismatchErr = confirm && pw !== confirm ? 'Passwords do not match' : null
  const canSubmit = !submitting && !pwErr && !mismatchErr && confirm

  return (
    <Modal title={`Reset password for ${name}?`} onClose={onCancel} width={380} footer={
      <>
        <Btn variant="ghost" full disabled={submitting} onClick={onCancel}>Cancel</Btn>
        <Btn full disabled={submitting} onClick={() => { setTouched(true); if (canSubmit) onConfirm(pw) }}>
          {submitting ? 'Setting…' : 'Set password'}
        </Btn>
      </>
    }>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 16, lineHeight: 1.6 }}>
        Sets their password directly — no email is sent. Share it with them yourself; they must change it on next sign-in.
      </div>
      <Field label="New password" error={touched ? pwErr : null} hint={PASSWORD_HINT}>
        <input type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)} style={inputStyle(touched && pwErr)} />
      </Field>
      <Field label="Confirm password" error={touched ? mismatchErr : null}>
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle(touched && mismatchErr)} />
      </Field>
    </Modal>
  )
}

// ─── Date formatting ──────────────────────────────────────────────────────────
export function formatDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDayMonth(s) {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
