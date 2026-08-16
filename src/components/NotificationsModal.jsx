import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import './NotificationsModal.css'

const TABS = ['All', 'People', 'Activity', 'Movies', 'System']

const TYPE_ICONS = {
  follow: '👤', like: '❤️', comment: '💬',
  activity: '🎬', recommendation: '⭐', system: '🔔'
}

function timeAgo(ts) {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return 'Yesterday'
  return new Date(ts).toLocaleDateString()
}

function filterByTab(notifs, tab) {
  if (tab === 'All') return notifs
  if (tab === 'People') return notifs.filter(n => ['follow', 'like', 'comment'].includes(n.type))
  if (tab === 'Activity') return notifs.filter(n => n.type === 'activity')
  if (tab === 'Movies') return notifs.filter(n => n.movie)
  if (tab === 'System') return notifs.filter(n => ['recommendation', 'system'].includes(n.type))
  return notifs
}

export default function NotificationsModal({ onClose, onUnreadChange }) {
  const [notifications, setNotifications] = useState([])
  const [activeTab, setActiveTab] = useState('All')
  const [searchQ, setSearchQ] = useState('')
  const [loading, setLoading] = useState(true)
  const overlayRef = useRef(null)

  useEffect(() => {
    fetchNotifications()
  }, [])

  async function fetchNotifications() {
    try {
      const { data } = await api.get('/notifications')
      setNotifications(data.notifications)
      onUnreadChange?.(data.unread_count)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function markAllRead() {
    await api.post('/notifications/mark-all-read')
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    onUnreadChange?.(0)
  }

  async function markOneRead(id) {
    await api.post(`/notifications/mark-read/${id}`)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    const unread = notifications.filter(n => n.id !== id && !n.read).length
    onUnreadChange?.(unread)
  }

  const visible = filterByTab(notifications, activeTab)
    .filter(n => !searchQ || n.text.toLowerCase().includes(searchQ.toLowerCase()))

  const newNotifs = visible.filter(n => !n.read)
  const oldNotifs = visible.filter(n => n.read)

  return (
    <div className="nm-overlay" ref={overlayRef} onClick={e => e.target === overlayRef.current && onClose()}>
      <div className="nm-panel fade-up">
        {/* Header */}
        <div className="nm-header">
          <span className="nm-title">Notifications</span>
          <button className="nm-settings-btn" title="Settings">⚙️</button>
        </div>

        {/* Tabs */}
        <div className="nm-tabs">
          {TABS.map(tab => (
            <button key={tab} className={`nm-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}>{tab}</button>
          ))}
        </div>

        {/* Search */}
        <div className="nm-search-wrap">
          <span className="nm-search-icon">🔍</span>
          <input className="nm-search-input" placeholder="Search notifications..."
            value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        </div>

        {/* List */}
        <div className="nm-body">
          {loading ? (
            <div className="nm-empty"><div className="spinner"></div></div>
          ) : visible.length === 0 ? (
            <div className="nm-empty">No notifications yet</div>
          ) : (
            <>
              {newNotifs.length > 0 && (
                <div className="nm-section">
                  <div className="nm-section-label">New</div>
                  {newNotifs.map(n => (
                    <NotifItem key={n.id} n={n} onRead={markOneRead} />
                  ))}
                </div>
              )}
              {oldNotifs.length > 0 && (
                <div className="nm-section">
                  <div className="nm-section-label">Today</div>
                  {oldNotifs.map(n => (
                    <NotifItem key={n.id} n={n} onRead={markOneRead} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="nm-footer">
          <button className="nm-mark-all" onClick={markAllRead}>Mark all as read</button>
        </div>
      </div>
    </div>
  )
}

function NotifItem({ n, onRead }) {
  return (
    <div className={`nm-item ${n.read ? '' : 'unread'}`} onClick={() => !n.read && onRead(n.id)}>
      <div className="nm-item-left">
        <div className="nm-avatar-wrap">
          <img src={n.actor_photo} alt={n.actor}
            onError={e => { e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png' }} />
          <span className="nm-type-icon">{TYPE_ICONS[n.type] || '🔔'}</span>
        </div>
        <div className="nm-item-info">
          <span className="nm-item-text">{n.text}</span>
          {n.movie && <span className="nm-item-movie">🎬 {n.movie}</span>}
          <span className="nm-item-time">{timeAgo(n.timestamp)}</span>
        </div>
      </div>
      <div className="nm-item-right">
        {n.type === 'follow' && (
          <button className="nm-follow-btn">Follow Back</button>
        )}
        {!n.read && <span className="nm-unread-dot"></span>}
      </div>
    </div>
  )
}
