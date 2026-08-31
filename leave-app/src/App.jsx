import { lazy, Suspense, useEffect, useState } from 'react'
import { useAuth } from './lib/AuthContext'
import Login from './components/Login'
import ForcePasswordChange from './components/ForcePasswordChange'
import ErrorBoundary from './components/ErrorBoundary'
import { Toast, C, Spinner, Avatar } from './components/UI'
import { signOut } from './lib/api'
import { fetchNotificationFeed, getNotifSeenAt } from './lib/notifications'

// Tab content is lazy-loaded — only the shell + whichever tab is active
// need to be in the initial bundle.
const Dashboard     = lazy(() => import('./components/Dashboard'))
const ApplyLeave    = lazy(() => import('./components/ApplyLeave').then(m => ({ default: m.ApplyLeave })))
const ApplyCompOff  = lazy(() => import('./components/ApplyLeave').then(m => ({ default: m.ApplyCompOff })))
const MyLeaves      = lazy(() => import('./components/MyLeaves'))
const Approvals     = lazy(() => import('./components/Approvals'))
const AdminPanel    = lazy(() => import('./components/AdminPanel'))
const JiraSettings  = lazy(() => import('./components/JiraSettings'))
const Attendance    = lazy(() => import('./components/Attendance'))
const Timesheet     = lazy(() => import('./components/Timesheet'))
const Profile       = lazy(() => import('./components/Profile'))
const Team          = lazy(() => import('./components/Team'))
const Notifications = lazy(() => import('./components/Notifications'))
const Calendar      = lazy(() => import('./components/Calendar'))

const NAV = {
  employee: [
    { id: 'dash',       label: 'Home',       icon: '◉' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'attendance', label: 'Attendance',  icon: '⏱' },
    { id: 'timesheet',  label: 'Timesheet',   icon: '📋' },
    { id: 'apply',      label: 'Apply',       icon: '+' },
    { id: 'comp',       label: 'Comp Off',    icon: '◈' },
    { id: 'history',    label: 'History',     icon: '≡' },
    { id: 'calendar',   label: 'Calendar',    icon: '📅' },
    { id: 'jira',       label: 'Jira',        icon: '🔗' },
    { id: 'profile',    label: 'Profile',     icon: '👤' },
  ],
  manager: [
    { id: 'dash',       label: 'Home',       icon: '◉' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'attendance', label: 'Attendance',  icon: '⏱' },
    { id: 'timesheet',  label: 'Timesheet',   icon: '📋' },
    { id: 'apply',      label: 'Apply',       icon: '+' },
    { id: 'comp',       label: 'Comp Off',    icon: '◈' },
    { id: 'history',    label: 'History',     icon: '≡' },
    { id: 'calendar',   label: 'Calendar',    icon: '📅' },
    { id: 'approvals',  label: 'Approvals',   icon: '✓' },
    { id: 'team',       label: 'Team',        icon: '👥' },
    { id: 'jira',       label: 'Jira',        icon: '🔗' },
    { id: 'profile',    label: 'Profile',     icon: '👤' },
  ],
  admin: [
    { id: 'dash',       label: 'Home',       icon: '◉' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'attendance', label: 'Attendance',  icon: '⏱' },
    { id: 'timesheet',  label: 'Timesheet',   icon: '📋' },
    { id: 'apply',      label: 'Apply',       icon: '+' },
    { id: 'comp',       label: 'Comp Off',    icon: '◈' },
    { id: 'history',    label: 'History',     icon: '≡' },
    { id: 'calendar',   label: 'Calendar',    icon: '📅' },
    { id: 'approvals',  label: 'Approvals',   icon: '✓' },
    { id: 'team',       label: 'Team',        icon: '👥' },
    { id: 'admin',      label: 'Admin',       icon: '⚙' },
    { id: 'jira',       label: 'Jira',        icon: '🔗' },
    { id: 'profile',    label: 'Profile',     icon: '👤' },
  ],
}
const TITLES = {
  dash: 'Dashboard', notifications: 'Notifications', attendance: 'Attendance', timesheet: 'Timesheet',
  apply: 'Apply Leave', comp: 'Request Comp Off', history: 'My Leaves', calendar: 'Team Calendar',
  approvals: 'Approvals', team: 'Team', admin: 'Admin Panel', jira: 'Jira', profile: 'My Profile',
}

export default function App() {
  const { employee, loading, blockedMessage } = useAuth()
  const [tab,   setTab]   = useState('dash')
  const [toast, setToast] = useState(null)
  const [hasUnread, setHasUnread] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // Check once per session/employee whether anything's arrived since the
  // last Notifications visit, to light up the bell icon before the user
  // opens that tab. Re-checked whenever the employee changes; cleared
  // immediately (optimistically) once the user opens the tab itself —
  // Notifications.jsx advances the actual "seen" cursor once its own
  // fetch resolves.
  useEffect(() => {
    if (!employee) return
    let cancelled = false
    fetchNotificationFeed(employee).then(({ feed }) => {
      if (cancelled) return
      const seenAt = getNotifSeenAt()
      setHasUnread(feed.some(n => n.pinned || (n.date && new Date(n.date).getTime() > seenAt)))
    })
    return () => { cancelled = true }
  }, [employee?.id])

  const goTab = (id) => {
    setTab(id)
    if (id === 'notifications') setHasUnread(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bgSec }}>
      <Spinner />
    </div>
  )

  if (!employee) return <Login blockedMessage={blockedMessage} />

  if (employee.must_change_password) return <ForcePasswordChange employee={employee} />

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
              onClick={() => goTab(t.id)}
              className={`sidebar-nav-item${tab === t.id ? ' active' : ''}`}
              style={{ position: 'relative' }}
            >
              <span className="sidebar-nav-icon">{t.icon}</span>
              {t.label}
              {t.id === 'notifications' && hasUnread && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, marginLeft: 'auto' }} />
              )}
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
            <ErrorBoundary key={tab}>
              <Suspense fallback={<Spinner />}>
                {tab === 'dash'       && <Dashboard     employee={employee} onToast={showToast} onNavigate={goTab} />}
                {tab === 'notifications' && <Notifications employee={employee} onToast={showToast} />}
                {tab === 'attendance' && <Attendance   employee={employee} onToast={showToast} />}
                {tab === 'timesheet'  && <Timesheet    employee={employee} onToast={showToast} />}
                {tab === 'apply'      && <ApplyLeave   employee={employee} onToast={showToast} />}
                {tab === 'comp'       && <ApplyCompOff employee={employee} onToast={showToast} />}
                {tab === 'history'    && <MyLeaves     employee={employee} onToast={showToast} />}
                {tab === 'calendar'   && <Calendar     onToast={showToast} />}
                {tab === 'approvals'  && <Approvals    employee={employee} onToast={showToast} />}
                {tab === 'admin'      && <AdminPanel   onToast={showToast} />}
                {tab === 'team'       && <Team          viewer={employee} onToast={showToast} />}
                {tab === 'jira'       && <JiraSettings employee={employee} onToast={showToast} />}
                {tab === 'profile'    && <Profile      employee={employee} onToast={showToast} />}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <nav className="app-bottomnav">
          {tabs.map(t => {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => goTab(t.id)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 0', position: 'relative' }}>
                <span style={{ fontSize: 15, color: active ? C.green : C.textTert }}>{t.icon}</span>
                <span style={{ fontSize: 9, fontWeight: active ? 500 : 400, color: active ? C.green : C.textTert }}>{t.label}</span>
                {t.id === 'notifications' && hasUnread && (
                  <span style={{ position: 'absolute', top: 2, right: '30%', width: 6, height: 6, borderRadius: '50%', background: C.red }} />
                )}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
