import { useState, useEffect } from 'react'
import api from '../services/api'
import './ActivityTab.css'

const FALLBACK_POSTER = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ActivityTab() {
  const [stats, setStats] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [insightFilter, setInsightFilter] = useState('This Month')

  useEffect(() => {
    Promise.all([
      api.get('/users/activity/stats'),
      api.get('/users/activity/timeline')
    ])
    .then(([statsRes, timelineRes]) => {
      setStats(statsRes.data)
      setTimeline(timelineRes.data.timeline || [])
    })
    .catch(console.error)
    .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="at-loading"><div className="spinner"></div></div>
  }

  const allTime = stats?.all_time || {}
  const thisMonth = stats?.this_month || {}

  // Insights values based on filter
  const isMonth = insightFilter === 'This Month'
  const watchedVal = isMonth ? (thisMonth.movies_watched || 0) : (allTime.movies_watched || 0)
  const watchedMax = isMonth ? 30 : 200
  const timeVal = isMonth ? (thisMonth.time_spent || 0) : (allTime.watch_time || 0)
  const timeMax = isMonth ? 60 : 400
  const reviewsVal = isMonth ? (thisMonth.reviews_written || 0) : (allTime.reviews_written || 0)
  const reviewsMax = isMonth ? 15 : 100
  const listsVal = isMonth ? (thisMonth.lists_created || 0) : (allTime.lists_created || 0)
  const listsMax = isMonth ? 10 : 50
  const activeDaysVal = thisMonth.days_active || 0

  const getEventActionDetails = (type) => {
    let icon = '🎬'; let color = '#8b2be2'; let actionStr = 'Interacted with'
    if (type === 'watched') { icon = '👁️'; color = '#8b2be2'; actionStr = 'Watched a movie' }
    else if (type === 'watch_completion') { icon = '👁️'; color = '#8b2be2'; actionStr = 'Completed a movie' }
    else if (type === 'watch_duration') { icon = '⏱️'; color = '#0984e3'; actionStr = 'Watched a movie' }
    else if (type === 'review') { icon = '📝'; color = '#ff4b2b'; actionStr = 'Reviewed a movie' }
    else if (type === 'rate') { icon = '⭐'; color = '#f39c12'; actionStr = 'Rated a movie' }
    else if (type === 'favorite_add') { icon = '❤️'; color = '#ff416c'; actionStr = 'Added to Favorites' }
    else if (type === 'wishlist_add') { icon = '📋'; color = '#f39c12'; actionStr = 'Added to Watchlist' }
    else if (type === 'list_create') { icon = '📃'; color = '#2ed573'; actionStr = 'Created a List' }
    else if (type === 'follow') { icon = '👤'; color = '#0984e3'; actionStr = 'Started following' }
    else if (type === 'follower_gained') { icon = '🎉'; color = '#2ed573'; actionStr = 'Gained a follower' }
    else if (type === 'message_send') { icon = '💬'; color = '#00bec4'; actionStr = 'Sent a message' }
    else if (type === 'search') { icon = '🔍'; color = '#8b2be2'; actionStr = 'Searched a movie' }
    return { icon, color, actionStr }
  }

  return (
    <div className="at-container fade-up">
      <div className="at-layout-grid">
        {/* Left Side: Stats and Recent Activity list */}
        <div className="at-main-col">
          <h3 className="at-section-title">Your Activity 📈</h3>
          
          {/* Top Stats Cards */}
          <div className="at-stats-grid">
            <StatCard icon="🎬" title="Movies Watched" value={allTime.movies_watched || 0} sub="All Time" color="#8b2be2" />
            <StatCard icon="⭐" title="Reviews Written" value={allTime.reviews_written || 0} sub="All Time" color="#ff4b2b" />
            <StatCard icon="📋" title="Lists Created" value={allTime.lists_created || 0} sub="All Time" color="#f39c12" />
            <StatCard icon="⏱️" title="Watch Time" value={`${allTime.watch_time || 0}h`} sub="All Time" color="#0984e3" />
          </div>

          {/* Recent Activity List */}
          <div className="at-recent-card glass-panel">
            <div className="at-card-header">
              <h4>Recent Activity</h4>
              <button className="at-text-btn" onClick={() => alert("Showing all activity history in timeline panels.")}>See All Activity</button>
            </div>
            <div className="at-activity-list-wrapper">
              {timeline.length === 0 ? (
                <div className="at-empty-state">No recent activity found.</div>
              ) : (
                timeline.slice(0, 5).map((e, index) => {
                  const details = getEventActionDetails(e.type)
                  return (
                    <div key={e.id || index} className="at-activity-list-item">
                      <div className="at-item-icon-wrap" style={{ background: `${details.color}15`, color: details.color }}>
                        <span>{details.icon}</span>
                      </div>
                      <div className="at-item-info">
                        <span className="at-item-action-text">
                          {details.actionStr}{' '}
                          <strong className="at-highlight-text">
                            {e.movie_title || e.other_user || (e.metadata && e.metadata.query) || 'System'}
                          </strong>
                        </span>
                        <span className="at-item-time">{timeAgo(e.timestamp)}</span>
                      </div>
                      {e.rating && <div className="at-item-rating">⭐ {e.rating}</div>}
                      {e.movie_poster && (
                        <img src={e.movie_poster} alt="poster" className="at-item-poster" onError={imgErr => imgErr.target.src = FALLBACK_POSTER} />
                      )}
                    </div>
                  )
                })
              )}
            </div>
            {timeline.length > 5 && (
              <button className="at-view-history-btn" onClick={() => alert("Scrolled down to timeline.")}>
                View All Activity History ➔
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Insights and Timeline nodes */}
        <div className="at-side-col">
          {/* Insights progress card */}
          <div className="at-insights-card glass-panel">
            <div className="at-insights-header">
              <h4>Activity Insights</h4>
              <select 
                className="at-filter-select"
                value={insightFilter}
                onChange={evt => setInsightFilter(evt.target.value)}
              >
                <option>This Month</option>
                <option>All Time</option>
              </select>
            </div>
            <div className="at-insights-list">
              <InsightRow icon="🎬" label="Movies Watched" value={watchedVal} max={watchedMax} color="#8b2be2" />
              <InsightRow icon="⏱️" label="Time Spent" value={`${timeVal}h`} max={timeMax} valNum={timeVal} color="#ff416c" />
              <InsightRow icon="📝" label="Reviews Written" value={reviewsVal} max={reviewsMax} color="#f39c12" />
              <InsightRow icon="📋" label="Lists Updated" value={listsVal} max={listsMax} color="#0984e3" />
              {isMonth && (
                <InsightRow icon="📅" label="Days Active" value={`${activeDaysVal} / 30`} max={30} valNum={activeDaysVal} color="#2ed573" />
              )}
            </div>
          </div>

          {/* Vertical Timeline Card */}
          <div className="at-timeline-card glass-panel">
            <div className="at-timeline-header">
              <h4>Activity Timeline</h4>
              <button className="at-filter-btn" onClick={() => alert("Timeline filter active.")}>Filter</button>
            </div>
            <div className="at-timeline-nodes-wrap">
              {timeline.length === 0 ? (
                <div className="at-empty-state">No timeline nodes.</div>
              ) : (
                timeline.slice(0, 5).map((e, index) => {
                  const details = getEventActionDetails(e.type)
                  return (
                    <div key={e.id || index} className="at-timeline-node">
                      <div className="at-node-left-line">
                        <div className="at-node-bullet" style={{ background: details.color, boxShadow: `0 0 10px ${details.color}80` }}>
                          <span>{details.icon}</span>
                        </div>
                        {index < 4 && index < timeline.length - 1 && <div className="at-node-vertical-connector"></div>}
                      </div>
                      <div className="at-node-content-box">
                        <div className="at-node-text-wrap">
                          <span className="at-node-action">{details.actionStr}</span>
                          <span className="at-node-title">{e.movie_title || e.other_user || 'Item'}</span>
                          {e.rating && <span className="at-node-rating-value">⭐ {e.rating}</span>}
                          <span className="at-node-time-ago">{timeAgo(e.timestamp)} • {formatTime(e.timestamp)}</span>
                        </div>
                        {e.movie_poster && (
                          <img src={e.movie_poster} alt="poster" className="at-node-thumb" onError={imgErr => imgErr.target.src = FALLBACK_POSTER} />
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {timeline.length > 5 && (
              <button className="at-timeline-footer-btn" onClick={() => alert("Full timeline loaded.")}>
                View Full Timeline
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, title, value, sub, color }) {
  return (
    <div className="at-stat-card glass-panel">
      <div className="at-stat-icon-container" style={{ background: `${color}15`, color }}>
        {icon}
      </div>
      <div className="at-stat-info-container">
        <span className="at-stat-label">{title}</span>
        <span className="at-stat-number">{value}</span>
        <span className="at-stat-subtitle">{sub}</span>
      </div>
    </div>
  )
}

function InsightRow({ icon, label, value, max, valNum, color }) {
  const numericValue = valNum ?? value
  const percentage = Math.min(100, Math.max(0, (numericValue / max) * 100)) || 0
  return (
    <div className="at-insight-row">
      <div className="at-insight-label-group">
        <span className="at-insight-icon-char">{icon}</span>
        <span className="at-insight-name">{label}</span>
      </div>
      <div className="at-insight-progress-container">
        <div className="at-insight-progress-bar" style={{ width: `${percentage}%`, background: color }}></div>
      </div>
      <span className="at-insight-value-label">{value}</span>
    </div>
  )
}
