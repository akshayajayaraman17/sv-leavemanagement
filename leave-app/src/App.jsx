import { lazy, Suspense, useEffect, useState } from 'react'
import { useAuth } from './lib/AuthContext'
import Login from './components/Login'
import ForcePasswordChange from './components/ForcePasswordChange'
import ErrorBoundary from './components/ErrorBoundary'
import { Toast, C, Spinner, Avatar } from './components/UI'
import {
  signOut, fetchPendingForApprover, fetchPendingCompForApprover,
  fetchPendingTimesheets, fetchPendingRegularizations,
} from './lib/api'
import { fetchNotificationFeed, getNotifSeenAt } from './lib/notifications'

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

// icon = 14px-wide monochrome glyph, matching the mockup's muted nav marks.
// group 'main' = the mockup's primary nav (shown first); group 'more' = app-only
// pages (Notifications, My Leaves, Calendar, Team, Jira) grouped below a divider.
const NAV_ALL = [
  { id: 'dash',          label: 'Home',          icon: '◆', roles: ['employee', 'manager', 'admin'], group: 'main' },
  { id: 'attendance',    label: 'Attendance',    icon: '◷', roles: ['employee', 'manager', 'admin'], group: 'main' },
  { id: 'timesheet',     label: 'Timesheet',     icon: '▦', roles: ['employee', 'manager', 'admin'], group: 'main' },
  { id: 'apply',         label: 'Apply',         icon: '＋', roles: ['employee', 'manager', 'admin'], group: 'main' },
  { id: 'comp',          label: 'Comp Off',      icon: '◈', roles: ['employee', 'manager', 'admin'], group: 'main' },
  { id: 'approvals',     label: 'Approvals',     icon: '✓', roles: ['manager', 'admin'],             group: 'main' },
  { id: 'profile',       label: 'My Profile',    icon: '○', roles: ['employee', 'manager', 'admin'], group: 'main' },
  { id: 'admin',         label: 'Employees',     icon: '▦', roles: ['admin'],                        group: 'main' },
  { id: 'notifications', label: 'Notifications', icon: '◔', roles: ['employee', 'manager', 'admin'], group: 'more' },
  { id: 'history',       label: 'My Leaves',     icon: '≡', roles: ['employee', 'manager', 'admin'], group: 'more' },
  { id: 'calendar',      label: 'Calendar',      icon: '▤', roles: ['employee', 'manager', 'admin'], group: 'more' },
  { id: 'team',          label: 'Team',          icon: '⬡', roles: ['manager'],                      group: 'more' },
  { id: 'jira',          label: 'Jira',          icon: '⟐', roles: ['employee', 'manager', 'admin'], group: 'more' },
]

const TITLES = {
  notifications: 'Notifications', attendance: 'Attendance', timesheet: 'Timesheet',
  apply: 'Apply for leave', comp: 'Request comp off', history: 'My Leaves', calendar: 'Team Calendar',
  approvals: 'Approvals', team: 'Team', admin: 'Employees', jira: 'Jira', profile: 'My Profile',
}

const MOBILE_PRIMARY = {
  employee: ['dash', 'attendance', 'apply', 'history'],
  manager:  ['dash', 'approvals', 'attendance', 'apply'],
  admin:    ['dash', 'approvals', 'attendance', 'admin'],
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function App() {
  const { employee, loading, blockedMessage } = useAuth()
  const [tab, setTab] = useState('dash')
  const [toast, setToast] = useState(null)
  const [hasUnread, setHasUnread] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!employee) return
    let cancelled = false
    fetchNotificationFeed(employee).then(({ feed }) => {
      if (cancelled) return
      const seenAt = getNotifSeenAt()
      setHasUnread(feed.some(n => n.pinned || (n.date && new Date(n.date).getTime() > seenAt)))
    })
    if (employee.role === 'admin' || employee.role === 'manager') {
      Promise.all([
        fetchPendingForApprover(employee.id), fetchPendingCompForApprover(employee.id),
        fetchPendingTimesheets(employee.id), fetchPendingRegularizations(employee.id),
      ]).then(res => {
        if (cancelled) return
        setPendingCount(res.reduce((n, r) => n + (r.data?.length || 0), 0))
      })
    }
    return () => { cancelled = true }
  }, [employee?.id])

  const goTab = (id) => {
    setTab(id)
    setMoreOpen(false)
    if (id === 'notifications') setHasUnread(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bgSec }}>
      <Spinner />
    </div>
  )
  if (!employee) return <Login blockedMessage={blockedMessage} />
  if (employee.must_change_password) return <ForcePasswordChange employee={employee} />

  const role = employee.role || 'employee'
  const nav = NAV_ALL.filter(n => n.roles.includes(role))
  const mainNav = nav.filter(n => n.group === 'main')
  const moreNav = nav.filter(n => n.group === 'more')
  const primaryIds = MOBILE_PRIMARY[role] || MOBILE_PRIMARY.employee
  const primary = nav.filter(n => primaryIds.includes(n.id))
  const secondary = nav.filter(n => !primaryIds.includes(n.id))

  const isHome = tab === 'dash'
  const eyebrow = isHome
    ? new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'Leave Manager'
  const title = isHome ? `${greeting()}, ${employee.full_name.split(' ')[0]}` : (TITLES[tab] || 'Home')

  const navBadge = (id) => (id === 'notifications' && hasUnread ? '•' : null)
  const navCount = (id) => (id === 'approvals' && pendingCount > 0 ? pendingCount : null)

  const navItem = (n) => (
    <button key={n.id} onClick={() => goTab(n.id)} className={`sidebar-nav-item${tab === n.id ? ' active' : ''}`}>
      <span className="sidebar-nav-icon">{n.icon}</span>
      <span style={{ flex: 1 }}>{n.label}</span>
      {navCount(n.id) != null && <span className="sidebar-nav-badge">{navCount(n.id)}</span>}
      {navBadge(n.id) && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c2882a', flexShrink: 0 }} />
      )}
    </button>
  )

  return (
    <div className="app-shell">
      <Toast msg={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

      {/* ── Sidebar (desktop) ── */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div style={{
            width: 30, height: 30, flex: 'none', borderRadius: 8, background: C.navy, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif, fontSize: 16,
          }}>L</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Leave Manager</div>
            <div style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {employee.department || 'Strategic Ventures'}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column' }}>
          {mainNav.map(navItem)}
          {moreNav.length > 0 && (
            <>
              <div style={{ flex: 1, minHeight: 14 }} />
              <div style={{ height: 1, background: 'var(--line)', margin: '0 14px 6px' }} />
              {moreNav.map(navItem)}
            </>
          )}
        </nav>

        <div className="sidebar-foot">
          <button
            onClick={() => goTab('profile')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 10,
              borderRadius: 9, background: '#e8eef6', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <Avatar initials={employee.avatar_initials} size={28} round />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{employee.full_name}</div>
              <div style={{ fontSize: 10.5, color: C.muted }}>{employee.designation || role}</div>
            </div>
          </button>
          <button
            onClick={() => signOut()}
            style={{ width: '100%', marginTop: 8, fontSize: 12, color: C.sub, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="app-main">
        <header className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="topbar-eyebrow">{eyebrow}</div>
              <h1 className="topbar-title">{title}</h1>
            </div>
            <button
              onClick={() => signOut()}
              className="mobile-signout"
              style={{ fontSize: 11.5, color: C.sub, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', marginTop: 4 }}
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="app-content">
          <div className="content-max">
            <ErrorBoundary key={tab}>
              <Suspense fallback={<Spinner />}>
                {tab === 'dash'          && <Dashboard     employee={employee} onToast={showToast} onNavigate={goTab} />}
                {tab === 'notifications' && <Notifications employee={employee} onToast={showToast} />}
                {tab === 'attendance'    && <Attendance    employee={employee} onToast={showToast} />}
                {tab === 'timesheet'     && <Timesheet     employee={employee} onToast={showToast} />}
                {tab === 'apply'         && <ApplyLeave    employee={employee} onToast={showToast} />}
                {tab === 'comp'          && <ApplyCompOff  employee={employee} onToast={showToast} />}
                {tab === 'history'       && <MyLeaves      employee={employee} onToast={showToast} />}
                {tab === 'calendar'      && <Calendar      onToast={showToast} />}
                {tab === 'approvals'     && <Approvals     employee={employee} onToast={showToast} />}
                {tab === 'admin'         && <AdminPanel    onToast={showToast} />}
                {tab === 'team'          && <Team          viewer={employee} onToast={showToast} />}
                {tab === 'jira'          && <JiraSettings  employee={employee} onToast={showToast} />}
                {tab === 'profile'       && <Profile       employee={employee} onToast={showToast} />}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>

        {/* ── Mobile bottom nav ── */}
        {moreOpen && (
          <div
            onClick={() => setMoreOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.42)', zIndex: 25 }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff',
                borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '10px 8px 20px',
                zIndex: 26, maxWidth: 560, margin: '0 auto',
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: C.line, margin: '4px auto 10px' }} />
              {secondary.map(n => (
                <button
                  key={n.id}
                  onClick={() => goTab(n.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    background: tab === n.id ? C.navyBg : 'none', border: 'none', borderRadius: 10,
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
                    color: tab === n.id ? C.navy : C.body, fontWeight: tab === n.id ? 600 : 400,
                  }}
                >
                  <span style={{ width: 16, textAlign: 'center', color: C.faint }}>{n.icon}</span>
                  {n.label}
                  {navBadge(n.id) && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#c2882a' }} />}
                </button>
              ))}
              <button
                onClick={() => signOut()}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: C.red }}
              >
                <span style={{ width: 16, textAlign: 'center' }}>⎋</span>
                Sign out
              </button>
            </div>
          </div>
        )}

        <nav className="app-bottomnav">
          {primary.map(n => {
            const on = tab === n.id
            return (
              <button key={n.id} onClick={() => goTab(n.id)} className="bottomnav-item">
                <span style={{ fontSize: 15, color: on ? C.navy : C.faint }}>{n.icon}</span>
                <span style={{ fontSize: 9.5, fontWeight: on ? 600 : 400, color: on ? C.navy : C.muted }}>{n.label}</span>
                {navBadge(n.id) && <span style={{ position: 'absolute', top: 2, right: '28%', width: 6, height: 6, borderRadius: '50%', background: '#c2882a' }} />}
              </button>
            )
          })}
          <button onClick={() => setMoreOpen(v => !v)} className="bottomnav-item">
            <span style={{ fontSize: 15, color: moreOpen ? C.navy : C.faint }}>•••</span>
            <span style={{ fontSize: 9.5, color: moreOpen ? C.navy : C.muted }}>More</span>
            {!moreOpen && secondary.some(n => navBadge(n.id)) && (
              <span style={{ position: 'absolute', top: 2, right: '28%', width: 6, height: 6, borderRadius: '50%', background: '#c2882a' }} />
            )}
          </button>
        </nav>
      </div>
    </div>
  )
}
