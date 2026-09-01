import { useEffect, useState } from 'react'
import { fetchNotificationFeed, getNotifSeenAt, markNotifSeenNow } from '../lib/notifications'
import { C, Empty, Spinner, card, formatDate } from './UI'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(dateStr)
}

export default function Notifications({ employee, onToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const seenAt = getNotifSeenAt()
    fetchNotificationFeed(employee).then(({ feed, error }) => {
      if (error) onToast?.(error.message || 'Failed to load some notifications', 'error')
      setItems(feed.map(n => ({ ...n, unread: !n.pinned && n.date && new Date(n.date).getTime() > seenAt })))
      markNotifSeenNow()
    }).finally(() => setLoading(false))
  }, [employee.id])

  if (loading) return <Spinner />

  return (
    <div>
      {items.length === 0 ? <Empty text="No notifications yet" /> : items.map(n => (
        <div key={n.id} style={{
          ...card, marginBottom: 10, display: 'flex', gap: 12, alignItems: 'flex-start',
          borderColor: n.unread ? '#c7e3d5' : C.line,
          background: n.pinned ? '#f4f8fd' : n.unread ? '#fbfefc' : '#fff',
        }}>
          {n.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.greenDot, marginTop: 7, flexShrink: 0 }} />}
          <div style={{ width: 32, height: 32, borderRadius: 9, background: n.pinned ? C.blueBg : C.bgTert, color: n.pinned ? C.blue : C.sub, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{n.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: n.unread ? 600 : 500, textTransform: 'capitalize' }}>{n.title}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{n.subtitle}</div>
          </div>
          {!n.pinned && <div style={{ fontSize: 10.5, color: C.faint, flexShrink: 0, whiteSpace: 'nowrap' }}>{timeAgo(n.date)}</div>}
        </div>
      ))}
    </div>
  )
}
