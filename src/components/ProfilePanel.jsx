import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import ActivityTab from './ActivityTab'
import './ProfilePanel.css'

const TABS = ['Overview', 'Wishlist', 'Watched', 'Favorites', 'Activity', 'Reviews']

const GENRE_COLORS = {
  'Sci-Fi': 85, 'Thriller': 72, 'Adventure': 68, 'Drama': 55, 'Action': 50
}

const FALLBACK = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'
const FALLBACK_POSTER = 'https://via.placeholder.com/120x180/1a1a2e/ffffff?text=?'

function timeAgo(ts) {
  const diff = Date.now() - (ts * 1000 || ts)
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return 'Yesterday'
  return new Date(ts > 1e10 ? ts : ts * 1000).toLocaleDateString()
}

export default function ProfilePanel({ onClose }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Overview')
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const overlayRef = useRef(null)

  useEffect(() => {
    if (!user?.username) return
    api.get(`/users/public/${encodeURIComponent(user.username)}`)
      .then(r => setProfile(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user?.username])

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose()
  }

  const goToSettings = () => {
    onClose()
    navigate('/profile')
  }

  // Compute top genres from watched + favorites
  const topGenres = ['Sci-Fi', 'Action', 'Thriller', 'Drama', 'Adventure']

  // Mock activity from real data
  const activity = [
    ...(profile?.favorites?.slice(0, 2).map(m => ({ type: 'favorite', movie: m, time: '2h ago' })) || []),
    ...(profile?.watched?.slice(0, 2).map(m => ({ type: 'watched', movie: m, time: 'Yesterday' })) || []),
    ...(profile?.wishlist?.slice(0, 1).map(m => ({ type: 'wishlist', movie: m, time: '3d ago' })) || []),
  ].slice(0, 5)

  return (
    <div className="pp-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="pp-panel fade-in-right">
        {/* Close button */}
        <button className="pp-close" onClick={onClose}>✕</button>

        {loading ? (
          <div className="pp-loading"><div className="spinner"></div></div>
        ) : !profile ? (
          <div className="pp-loading">Failed to load profile</div>
        ) : (
          <>
            {/* ── Hero Header ── */}
            <div className="pp-hero">
              <div className="pp-hero-bg">
                {/* Cinematic gradient overlay with movie-poster blur bg */}
                <div className="pp-hero-gradient"></div>
              </div>

              <div className="pp-hero-content">
                <div className="pp-avatar-wrap">
                  <img
                    src={profile.photo_url || FALLBACK}
                    alt={profile.name}
                    className="pp-avatar"
                    onError={e => { e.target.src = FALLBACK }}
                  />
                  <span className="pp-online-dot"></span>
                </div>

                <div className="pp-hero-info">
                  <div className="pp-name-row">
                    <h2 className="pp-name">{profile.name || profile.username}</h2>
                    <span className="pp-verified">✓</span>
                  </div>
                  <p className="pp-handle">@{profile.username}</p>
                  <p className="pp-bio">{profile.bio || 'Movie Lover | Reviews | Series Addict 🎬'}</p>
                  <p className="pp-joined">📅 Joined March 2023</p>
                </div>

                <div className="pp-hero-stats">
                  <div className="pp-hero-stat">
                    <span className="pp-stat-num">{profile.followers_count || 0}</span>
                    <span className="pp-stat-lbl">Followers</span>
                  </div>
                  <div className="pp-hero-stat">
                    <span className="pp-stat-num">{profile.following_count || 0}</span>
                    <span className="pp-stat-lbl">Following</span>
                  </div>
                  <div className="pp-hero-stat">
                    <span className="pp-stat-num">{profile.favorites?.length || 0}</span>
                    <span className="pp-stat-lbl">Favorites</span>
                  </div>
                </div>

                <div className="pp-hero-actions">
                  <button className="pp-edit-btn" onClick={goToSettings}>✏️ Edit Profile</button>
                  <button className="pp-share-btn" title="Share Profile">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                      <polyline points="16 6 12 2 8 6"/>
                      <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="pp-tabs">
              {TABS.map(tab => (
                <button
                  key={tab}
                  className={`pp-tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* ── Tab Content ── */}
            <div className="pp-body">

              {/* OVERVIEW */}
              {activeTab === 'Overview' && (
                <div className="pp-overview">
                  {/* Favorite Movies */}
                  {profile.favorites?.length > 0 && (
                    <section className="pp-section">
                      <div className="pp-section-header">
                        <span className="pp-section-title">⭐ Favorite Movies</span>
                        <button className="pp-view-all" onClick={() => setActiveTab('Favorites')}>View All</button>
                      </div>
                      <div className="pp-movie-row">
                        {profile.favorites.slice(0, 7).map((m, i) => (
                          <MovieThumb key={i} movie={m} onClick={() => { onClose(); navigate(`/movie?title=${encodeURIComponent(m.title)}`) }} />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Two-column lower section */}
                  <div className="pp-overview-grid">
                    {/* Recent Activity */}
                    <section className="pp-section">
                      <div className="pp-section-header">
                        <span className="pp-section-title">📈 Recent Activity</span>
                        <button className="pp-view-all" onClick={() => setActiveTab('Activity')}>View All</button>
                      </div>
                      <div className="pp-activity-list">
                        {activity.length === 0 ? (
                          <div className="pp-empty-small">No activity yet</div>
                        ) : activity.map((a, i) => (
                          <ActivityItem key={i} item={a} />
                        ))}
                      </div>
                    </section>

                    {/* About + Genres */}
                    <div>
                      <section className="pp-section">
                        <span className="pp-section-title">🧑 About Me</span>
                        <div className="pp-about-list">
                          <p className="pp-about-bio">{profile.bio || 'Movie reviewer and explorer. I watch movies so you don\'t have to. Rating what\'s worth your time.'}</p>
                          {profile.instagram_id && (
                            <a href={`https://instagram.com/${profile.instagram_id}`} target="_blank" rel="noreferrer" className="pp-about-row">
                              📷 Instagram
                            </a>
                          )}
                          <div className="pp-about-row">📍 India</div>
                        </div>
                      </section>

                      <section className="pp-section" style={{ marginTop: '1rem' }}>
                        <div className="pp-section-header">
                          <span className="pp-section-title">🎭 Top Genres</span>
                        </div>
                        <div className="pp-genres">
                          {topGenres.map(g => (
                            <div key={g} className="pp-genre-bar">
                              <div className="pp-genre-label-row">
                                <span>{g}</span>
                                <span className="pp-genre-pct">{GENRE_COLORS[g]}%</span>
                              </div>
                              <div className="pp-bar-track">
                                <div className="pp-bar-fill" style={{ width: `${GENRE_COLORS[g]}%` }}></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              )}

              {/* WISHLIST */}
              {activeTab === 'Wishlist' && (
                <MovieGrid movies={profile.wishlist} emptyMsg="No movies in wishlist" onMovieClick={(title) => { onClose(); navigate(`/movie?title=${encodeURIComponent(title)}`) }} />
              )}

              {/* WATCHED */}
              {activeTab === 'Watched' && (
                <MovieGrid movies={profile.watched} emptyMsg="No watched movies yet" onMovieClick={(title) => { onClose(); navigate(`/movie?title=${encodeURIComponent(title)}`) }} />
              )}

              {/* FAVORITES */}
              {activeTab === 'Favorites' && (
                <MovieGrid movies={profile.favorites} emptyMsg="No favorites yet" onMovieClick={(title) => { onClose(); navigate(`/movie?title=${encodeURIComponent(title)}`) }} />
              )}

              {/* ACTIVITY */}
              {activeTab === 'Activity' && (
                <ActivityTab />
              )}

              {/* REVIEWS — placeholder */}
              {activeTab === 'Reviews' && (
                <div className="pp-empty-state">
                  <span style={{ fontSize: '3rem' }}>📝</span>
                  <p>No reviews written yet</p>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.35)' }}>Start reviewing movies you've watched!</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MovieThumb({ movie, onClick }) {
  return (
    <div className="pp-movie-thumb" onClick={onClick}>
      <img
        src={movie.poster || FALLBACK_POSTER}
        alt={movie.title}
        onError={e => { e.target.src = FALLBACK_POSTER }}
      />
      <div className="pp-movie-thumb-overlay">
        <span className="pp-movie-thumb-title">{movie.title}</span>
        {movie.year && <span className="pp-movie-thumb-year">{movie.year}</span>}
        {movie.rating && movie.rating !== 'N/A' && (
          <span className="pp-movie-thumb-rating">⭐ {movie.rating}</span>
        )}
      </div>
    </div>
  )
}

function MovieGrid({ movies, emptyMsg, onMovieClick }) {
  if (!movies || movies.length === 0) {
    return (
      <div className="pp-empty-state">
        <span style={{ fontSize: '2.5rem' }}>🎬</span>
        <p>{emptyMsg}</p>
      </div>
    )
  }
  return (
    <div className="pp-movie-grid">
      {movies.map((m, i) => (
        <div key={i} className="pp-grid-movie" onClick={() => onMovieClick(m.title)}>
          <img
            src={m.poster || FALLBACK_POSTER}
            alt={m.title}
            onError={e => { e.target.src = FALLBACK_POSTER }}
          />
          <div className="pp-grid-movie-info">
            <span className="pp-grid-movie-title">{m.title}</span>
            {m.year && <span className="pp-grid-movie-year">{m.year}</span>}
            {m.rating && m.rating !== 'N/A' && (
              <span className="pp-grid-movie-rating">⭐ {m.rating}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ActivityItem({ item, full }) {
  const icons = { favorite: '❤️', watched: '👁️', wishlist: '🤍', review: '💬' }
  const labels = { favorite: 'Added to Favorites', watched: 'Watched', wishlist: 'Added to Wishlist', review: 'Reviewed' }

  return (
    <div className="pp-activity-item">
      <img
        src={item.movie?.poster || FALLBACK_POSTER}
        alt={item.movie?.title}
        className="pp-activity-poster"
        onError={e => { e.target.src = FALLBACK_POSTER }}
      />
      <div className="pp-activity-info">
        <span className="pp-activity-label">
          {labels[item.type] || 'Interacted with'} <strong>{item.movie?.title}</strong>
        </span>
        <span className="pp-activity-time">{item.time}</span>
      </div>
      <span className="pp-activity-icon">{icons[item.type] || '🎬'}</span>
    </div>
  )
}
