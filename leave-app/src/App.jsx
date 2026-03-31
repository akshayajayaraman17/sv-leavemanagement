import { useState, useEffect } from 'react'
import { useAuth } from './lib/AuthContext'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import { ApplyLeave, ApplyCompOff } from './components/ApplyLeave'
import MyLeaves from './components/MyLeaves'
import Approvals from './components/Approvals'
import AdminPanel from './components/AdminPanel'
import JiraSettings from './components/JiraSettings'
import Attendance from './components/Attendance'
import Timesheet from './components/Timesheet'
import Profile from './components/Profile'
import { Toast, C, Spinner, Avatar } from './components/UI'
import { signOut } from './lib/api'

const NAV = {
  employee: [
    { id: 'dash',       label: 'Home',       icon: '◉' },
    { id: 'attendance', label: 'Attendance',  icon: '⏱' },
    { id: 'timesheet',  label: 'Timesheet',   icon: '📋' },
    { id: 'apply',      label: 'Apply',       icon: '+' },
    { id: 'comp',       label: 'Comp Off',    icon: '◈' },
    { id: 'history',    label: 'History',     icon: '≡' },
    { id: 'jira',       label: 'Jira',        icon: '🔗' },
    { id: 'profile',    label: 'Profile',     icon: '👤' },
  ],
  manager: [
    { id: 'dash',       label: 'Home',       icon: '◉' },
    { id: 'attendance', label: 'Attendance',  icon: '⏱' },
    { id: 'timesheet',  label: 'Timesheet',   icon: '📋' },
    { id: 'apply',      label: 'Apply',       icon: '+' },
    { id: 'comp',       label: 'Comp Off',    icon: '◈' },
    { id: 'history',    label: 'History',     icon: '≡' },
    { id: 'approvals',  label: 'Approvals',   icon: '✓' },
    { id: 'jira',       label: 'Jira',        icon: '🔗' },
    { id: 'profile',    label: 'Profile',     icon: '👤' },
  ],
  admin: [
    { id: 'dash',       label: 'Home',       icon: '◉' },
    { id: 'attendance', label: 'Attendance',  icon: '⏱' },
    { id: 'timesheet',  label: 'Timesheet',   icon: '📋' },
    { id: 'apply',      label: 'Apply',       icon: '+' },
    { id: 'comp',       label: 'Comp Off',    icon: '◈' },
    { id: 'history',    label: 'History',     icon: '≡' },
    { id: 'approvals',  label: 'Approvals',   icon: '✓' },
    { id: 'admin',      label: 'Admin',       icon: '⚙' },
    { id: 'jira',       label: 'Jira',        icon: '🔗' },
    { id: 'profile',    label: 'Profile',     icon: '👤' },
  ],
}
const TITLES = {
  dash: 'Dashboard', attendance: 'Attendance', timesheet: 'Timesheet',
  apply: 'Apply Leave', comp: 'Request Comp Off', history: 'My Leaves',
  approvals: 'Approvals', admin: 'Admin Panel', jira: 'Jira', profile: 'My Profile',
}

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
    <div className="app-shell" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <Toast msg={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

      {/* ── Desktop Sidebar ── */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div style={{ fontSize: 9, color: C.textTert, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Leave Manager</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar initials={employee.avatar_initials} size={36} color={C.green} bg={C.greenBg} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.2 }}>{employee.full_name}</div>
              <div style={{ fontSize: 11, color: C.textSec }}>{employee.designation || employee.role}</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`sidebar-nav-item${tab === t.id ? ' active' : ''}`}
            >
              <span className="sidebar-nav-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-signout">
          <button
            onClick={() => signOut()}
            style={{ fontSize: 12, color: C.textSec, background: C.bgSec, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', width: '100%' }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="app-main">
        {/* Top bar */}
        <div className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 9, color: C.textTert, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Leave Manager</div>
              <div style={{ fontSize: 17, fontWeight: 500 }}>{TITLES[tab]}</div>
            </div>
            {/* Sign out only visible on mobile (hidden on desktop via sidebar) */}
            <button
              onClick={() => signOut()}
              className="mobile-signout"
              style={{ fontSize: 11, color: C.textSec, background: C.bgSec, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Page content */}
        <div className="app-content">
          <div className="content-max">
            {tab === 'dash'       && <Dashboard    employee={employee} />}
            {tab === 'attendance' && <Attendance   employee={employee} />}
            {tab === 'timesheet'  && <Timesheet    employee={employee} onToast={showToast} />}
            {tab === 'apply'      && <ApplyLeave   employee={employee} onToast={showToast} />}
            {tab === 'comp'       && <ApplyCompOff employee={employee} onToast={showToast} />}
            {tab === 'history'    && <MyLeaves     employee={employee} />}
            {tab === 'approvals'  && <Approvals    employee={employee} onToast={showToast} />}
            {tab === 'admin'      && <AdminPanel   onToast={showToast} />}
            {tab === 'jira'       && <JiraSettings employee={employee} onToast={showToast} />}
            {tab === 'profile'    && <Profile      employee={employee} onToast={showToast} />}
          </div>
        </div>

        {/* Mobile bottom nav */}
        <nav className="app-bottomnav">
          {tabs.map(t => {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 0' }}>
                <span style={{ fontSize: 15, color: active ? C.green : C.textTert }}>{t.icon}</span>
                <span style={{ fontSize: 9, fontWeight: active ? 500 : 400, color: active ? C.green : C.textTert }}>{t.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
