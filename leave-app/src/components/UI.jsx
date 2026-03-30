// ─── Design tokens ────────────────────────────────────────────────────────────
export const C = {
  bg:        '#ffffff',
  bgSec:     '#f5f4f0',
  bgTert:    '#eeecea',
  border:    'rgba(0,0,0,0.1)',
  borderMed: 'rgba(0,0,0,0.18)',
  text:      '#1a1a1a',
  textSec:   '#6b6a65',
  textTert:  '#9e9d98',
  green:     '#1D9E75',
  greenBg:   '#E1F5EE',
  blue:      '#378ADD',
  blueBg:    '#E6F1FB',
  amber:     '#BA7517',
  amberBg:   '#FAEEDA',
  purple:    '#7F77DD',
  purpleBg:  '#EEEDFE',
  red:       '#A32D2D',
  redBg:     '#FCEBEB',
}

export const card = {
  background: C.bg,
  border: `0.5px solid ${C.border}`,
  borderRadius: 12,
  padding: 16,
}

export const inputStyle = (err) => ({
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 12px',
  fontSize: 14,
  border: err ? '1px solid #E24B4A' : `0.5px solid ${C.borderMed}`,
  borderRadius: 8,
  background: C.bg,
  color: C.text,
  outline: 'none',
})

export const btnStyle = (bg, color, border) => ({
  background: bg,
  color,
  border: border || 'none',
  borderRadius: 8,
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
})

// ─── Avatar ────────────────────────────────────────────────────────────────────
export function Avatar({ initials, size = 36, color = C.blue, bg = C.blueBg }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color, fontWeight: 500,
      fontSize: size * 0.34, display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {initials || '?'}
    </div>
  )
}

// ─── Status badge ──────────────────────────────────────────────────────────────
const STATUS = {
  approved: { bg: C.greenBg,  color: '#0F6E56', label: 'Approved' },
  pending:  { bg: C.amberBg,  color: '#854F0B', label: 'Pending'  },
  rejected: { bg: C.redBg,    color: C.red,     label: 'Rejected' },
  cancelled:{ bg: C.bgTert,   color: C.textSec, label: 'Cancelled'},
}
export function Badge({ status }) {
  const s = STATUS[status] || STATUS.pending
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 500, padding: '3px 10px',
      borderRadius: 20, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

// ─── Field wrapper ─────────────────────────────────────────────────────────────
export function Field({ label, error, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: C.textSec, marginBottom: 5, display: 'block' }}>
        {label}
        {error && <span style={{ color: '#E24B4A', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>{error}</span>}
      </label>
      {children}
      {hint && !error && <div style={{ fontSize: 11, color: C.textTert, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

// ─── Section title ─────────────────────────────────────────────────────────────
export function SecTitle({ children, style }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: C.textTert, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10, ...style }}>
      {children}
    </div>
  )
}

// ─── Loading spinner ───────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        border: '2px solid #e0e0e0', borderTopColor: C.green,
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────────
export function Empty({ text }) {
  return <div style={{ textAlign: 'center', padding: '48px 0', color: C.textTert, fontSize: 13 }}>{text}</div>
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
export function Toast({ msg, type = 'success', onClose }) {
  if (!msg) return null
  const bg = type === 'error' ? C.redBg : C.greenBg
  const color = type === 'error' ? C.red : '#0F6E56'
  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      background: bg, color, border: `0.5px solid ${color}`,
      borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 500,
      zIndex: 999, display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    }}>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color, fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  )
}

// ─── Confirm dialog ────────────────────────────────────────────────────────────
export function Confirm({ msg, onYes, onNo }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ ...card, maxWidth: 320, width: '90%' }}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Confirm</div>
        <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>{msg}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onYes} style={{ ...btnStyle(C.red, '#fff'), flex: 1 }}>Yes, proceed</button>
          <button onClick={onNo}  style={{ ...btnStyle(C.bgSec, C.textSec, `0.5px solid ${C.border}`), flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function formatDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
