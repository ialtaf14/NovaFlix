import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './Notifications.css'

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

export default function Notifications({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [activeTab, setActiveTab] = useState('All')
  const [searchQ, setSearchQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen])

  async function fetchNotifications() {
    try {
      const { data } = await api.get('/notifications')
      setNotifications(data.notifications || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function markAllRead() {
    try {
      await api.post('/notifications/mark-all-read')
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    } catch (e) {
      console.error(e)
    }
  }

  async function markOneRead(id) {
    try {
      await api.post(`/notifications/mark-read/${id}`)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    } catch (e) {
      console.error(e)
    }
  }

  const handleFollowBack = async (e, username) => {
    e.stopPropagation()
    try {
      await api.post(`/users/${username}/follow`)
      // Refresh notifications list to update state
      fetchNotifications()
    } catch (err) {
      console.error("Follow back failed:", err)
    }
  }

  const handleNotifClick = (n) => {
    if (!n.read) {
      markOneRead(n.id)
    }
    if (n.movie) {
      navigate(`/movie?title=${encodeURIComponent(n.movie)}`)
      if (onClose) onClose()
    } else if (n.actor) {
      navigate(`/user/${encodeURIComponent(n.actor)}`)
      if (onClose) onClose()
    }
  }

  const visible = filterByTab(notifications, activeTab)
    .filter(n => !searchQ || n.text.toLowerCase().includes(searchQ.toLowerCase()))

  const newNotifs = visible.filter(n => !n.read)
  const oldNotifs = visible.filter(n => n.read)

  return (
    <>
      <div 
        className={`recommend-sidebar-overlay ${isOpen ? 'open' : ''}`} 
        onClick={onClose} 
        style={{ zIndex: 9998 }}
      />
      
      <div className={`recommend-sidebar notifications-sidebar ${isOpen ? 'open' : ''}`} style={{ zIndex: 9999, overflowY: 'auto' }}>
        <div className="recommend-sidebar-header">
          <h2>🔔 <span>Your</span> Notifications</h2>
          <button className="recommend-close-btn" onClick={onClose} title="Close Notifications">
            &times;
          </button>
        </div>

        <div className="recommend-sidebar-body" style={{ padding: '20px' }}>
          <div className="notif-header-row">
            {notifications.some(n => !n.read) && (
              <button className="notif-mark-all" onClick={markAllRead}>
                Mark all as read
              </button>
            )}
          </div>

          {/* Tab filters */}
          <div className="notif-tabs-row">
            {TABS.map(tab => (
              <button
                key={tab}
                className={`notif-tab-pill ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search filter */}
          <div className="notif-search-wrap glass">
            <span className="notif-search-icon">🔍</span>
            <input
              className="notif-search-input"
              placeholder="Filter notifications..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
          </div>

          {/* Notifications list */}
          <div className="notif-list-container glass">
            {loading ? (
              <div className="notif-loader">
                <div className="spinner"></div>
              </div>
            ) : visible.length === 0 ? (
              <div className="notif-empty">No notifications matching criteria.</div>
            ) : (
              <div className="notif-section">
                {newNotifs.length > 0 && (
                  <>
                    <div className="notif-section-label">New</div>
                    {newNotifs.map(n => (
                      <NotifItem
                        key={n.id}
                        n={n}
                        onClick={() => handleNotifClick(n)}
                        onFollowBack={(e) => handleFollowBack(e, n.actor)}
                      />
                    ))}
                    <div className="notif-divider"></div>
                  </>
                )}

                {oldNotifs.length > 0 && (
                  <>
                    {newNotifs.length > 0 && <div className="notif-section-label" style={{ marginTop: '1rem' }}>Earlier</div>}
                    {oldNotifs.map(n => (
                      <NotifItem
                        key={n.id}
                        n={n}
                        onClick={() => handleNotifClick(n)}
                        onFollowBack={(e) => handleFollowBack(e, n.actor)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function NotifItem({ n, onClick, onFollowBack }) {
  return (
    <div className={`notif-item ${n.read ? '' : 'unread'}`} onClick={onClick}>
      <div className="notif-item-left">
        <div className="notif-avatar-wrap">
          <img
            src={n.actor_photo}
            alt={n.actor}
            onError={e => { e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png' }}
            className="notif-item-avatar"
          />
          <span className="notif-type-icon-badge">{TYPE_ICONS[n.type] || '🔔'}</span>
        </div>
        <div className="notif-item-info">
          <span className="notif-item-text">{n.text}</span>
          {n.movie && <span className="notif-item-movie">🎬 {n.movie}</span>}
          <span className="notif-item-time">{timeAgo(n.timestamp)}</span>
        </div>
      </div>
      <div className="notif-item-right">
        {n.type === 'follow' && (
          <button className="notif-follow-btn follow" onClick={onFollowBack}>
            Follow Back
          </button>
        )}
        {!n.read && <span className="notif-unread-dot"></span>}
      </div>
    </div>
  )
}
