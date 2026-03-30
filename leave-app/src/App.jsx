import { useState, useEffect } from 'react'
import { useAuth } from './lib/AuthContext'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import { ApplyLeave, ApplyCompOff } from './components/ApplyLeave'
import MyLeaves from './components/MyLeaves'
import Approvals from './components/Approvals'
import AdminPanel from './components/AdminPanel'
import { Toast, C, Spinner } from './components/UI'
import { signOut } from './lib/api'

const NAV = {
  employee: [
    { id: 'dash',    label: 'Home',     icon: '◉' },
    { id: 'apply',   label: 'Apply',    icon: '+' },
    { id: 'comp',    label: 'Comp Off', icon: '◈' },
    { id: 'history', label: 'History',  icon: '≡' },
  ],
  manager: [
    { id: 'dash',      label: 'Home',      icon: '◉' },
    { id: 'apply',     label: 'Apply',     icon: '+' },
    { id: 'comp',      label: 'Comp Off',  icon: '◈' },
    { id: 'history',   label: 'History',   icon: '≡' },
    { id: 'approvals', label: 'Approvals', icon: '✓' },
  ],
  admin: [
    { id: 'dash',      label: 'Home',      icon: '◉' },
    { id: 'apply',     label: 'Apply',     icon: '+' },
    { id: 'comp',      label: 'Comp Off',  icon: '◈' },
    { id: 'history',   label: 'History',   icon: '≡' },
    { id: 'approvals', label: 'Approvals', icon: '✓' },
    { id: 'admin',     label: 'Admin',     icon: '⚙' },
  ],
}
const TITLES = { dash: 'Dashboard', apply: 'Apply Leave', comp: 'Request Comp Off', history: 'My Leaves', approvals: 'Approvals', admin: 'Admin Panel' }

export default function App() {
  const { employee, loading } = useAuth()
  const [tab,   setTab]   = useState('dash')
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bgSec }}>
      <Spinner />
    </div>
  )

  if (!employee) return <Login />

  const tabs = NAV[employee.role] || NAV.employee

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: 480, margin: '0 auto', background: '#f5f4f0', minHeight: '100vh' }}>
      <Toast msg={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

      {/* Header */}
      <div style={{ background: C.bg, borderBottom: `0.5px solid ${C.border}`, padding: '12px 16px 10px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 9, color: C.textTert, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Leave Manager</div>
            <div style={{ fontSize: 17, fontWeight: 500 }}>{TITLES[tab]}</div>
          </div>
          <button
            onClick={() => signOut()}
            style={{ fontSize: 11, color: C.textSec, background: C.bgSec, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 14px 88px' }}>
        {tab === 'dash'      && <Dashboard   employee={employee} />}
        {tab === 'apply'     && <ApplyLeave  employee={employee} onToast={showToast} />}
        {tab === 'comp'      && <ApplyCompOff employee={employee} onToast={showToast} />}
        {tab === 'history'   && <MyLeaves    employee={employee} />}
        {tab === 'approvals' && <Approvals   employee={employee} onToast={showToast} />}
        {tab === 'admin'     && <AdminPanel  onToast={showToast} />}
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: C.bg, borderTop: `0.5px solid ${C.border}`, display: 'flex', padding: '6px 0 10px' }}>
        {tabs.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 0' }}>
              <span style={{ fontSize: 15, color: active ? C.green : C.textTert }}>{t.icon}</span>
              <span style={{ fontSize: 9, fontWeight: active ? 500 : 400, color: active ? C.green : C.textTert }}>{t.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
