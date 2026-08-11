import { useEffect, useState } from 'react'
import { fetchNotificationFeed, getNotifSeenAt, markNotifSeenNow } from '../lib/notifications'
import { C, Empty, Spinner, card, formatDate } from './UI'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(dateStr)
}

export default function Notifications({ employee, onToast }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    // Capture the cursor from *before* this visit so items that arrived
    // since the last time this tab was opened render as unread — then push
    // the cursor forward so the next visit starts fresh.
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
          ...(n.unread ? { borderColor: `${C.green}55`, background: '#fbfefc' } : {}),
        }}>
          {n.unread && <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, marginTop: 6, flexShrink: 0 }} />}
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: n.bg, color: n.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
          }}>
            {n.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: n.unread ? 600 : 500, textTransform: 'capitalize' }}>{n.title}</div>
            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{n.subtitle}</div>
          </div>
          {!n.pinned && (
            <div style={{ fontSize: 10, color: C.textTert, flexShrink: 0, whiteSpace: 'nowrap' }}>{timeAgo(n.date)}</div>
          )}
        </div>
      ))}
    </div>
  )
}
