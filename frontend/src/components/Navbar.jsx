import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import './Navbar.css'

export default function Navbar({ visible, onToggleRecommend, onToggleNotif }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const dropdownRef = useRef(null)

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    const q = searchParams.get('q') || ''
    if (q.trim()) {
      const history = JSON.parse(localStorage.getItem('novaflix_search_history') || '[]')
      const filtered = history.filter(h => h.toLowerCase() !== q.toLowerCase())
      const updated = [q, ...filtered].slice(0, 10)
      localStorage.setItem('novaflix_search_history', JSON.stringify(updated))
      window.dispatchEvent(new Event('novaflix_search_submit'))
    }
  }

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch (_) { }
    logout()
    navigate('/login')
  }

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch unread counts on mount and poll for real-time updates
  useEffect(() => {
    if (!user) return
    const fetchCounts = () => {
      api.get('/notifications/unread-count').then(r => setUnreadNotifs(r.data.count)).catch(() => {})
      api.get('/chat/conversations').then(r => {
        const total = (r.data.conversations || []).reduce((s, c) => s + (c.unread_count || 0), 0)
        setUnreadMessages(total)
      }).catch(() => {})
    }
    fetchCounts()
    const interval = setInterval(fetchCounts, 8000)
    return () => clearInterval(interval)
  }, [user])

  const handleSearchClick = () => {
    navigate('/search')
  }

  const handleDropdownLink = (tabName) => {
    setIsProfileOpen(false)
    navigate(`/profile?tab=${tabName}`)
  }

  const getTabName = () => {
    const path = location.pathname
    const search = location.search
    if (path.startsWith('/discover')) {
      if (search.includes('add_story=true') || search.includes('share=true')) {
        return 'Add to Story'
      }
      return 'Discover'
    }
    if (path.startsWith('/movies')) return 'Movies'
    if (path.startsWith('/series')) return 'Series'
    if (path.startsWith('/anime')) return 'Anime'
    if (path.startsWith('/recommended')) return 'Recommended'
    if (path.startsWith('/search')) return 'Search'
    if (path.startsWith('/profile')) return 'Profile'
    if (path.startsWith('/messages')) return 'Messages'
    if (path.startsWith('/notifications')) return 'Notifications'
    if (path.startsWith('/watch-party')) return 'Watch Party'
    if (path.startsWith('/collections')) return 'Collections'
    if (path.startsWith('/movie')) return 'Movie'
    if (path.startsWith('/actor')) return 'Actor'
    if (path.startsWith('/stories')) return 'Stories'
    if (path.startsWith('/ai-assistant')) return 'AI Assistant'
    if (path.startsWith('/activity-feed')) return 'Activity Feed'
    if (path.startsWith('/user/')) return 'User Profile'
    return 'Discover'
  }

  return (
    <>
      <nav className={`navbar ${visible ? '' : 'hidden'}`}>
        {/* Left Pill: Brand and Logo */}
        <div className="navbar-pill navbar-left">
          {location.pathname !== '/discover' && (
            <button className="nav-back-btn" onClick={() => navigate(-1)} title="Go Back">
              ⬅
            </button>
          )}
          <Link to="/discover" className="navbar-brand">
            <img src="/logo.jpg" alt="NovaFlix Logo" className="navbar-logo-img" />
            <span className="brand-neon">Nova</span>Flix
          </Link>
        </div>

        {/* Center Pill: Discover & Search Trigger */}
        <div className="navbar-pill navbar-center">
          <Link to={location.pathname} className="pill-nav-link">{getTabName()}</Link>
          
          <div className="navbar-search-and-story-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            {location.pathname === '/search' ? (
              <form onSubmit={handleSearchSubmit} className="navbar-search-input-wrap" style={{ flex: 1 }}>
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="navbar-search-input"
                  placeholder="Search movies, users, genres..."
                  value={searchParams.get('q') || ''}
                  onChange={e => navigate(`/search?q=${encodeURIComponent(e.target.value)}`, { replace: true })}
                  autoFocus
                />
                {(searchParams.get('q') || '') && (
                  <button 
                    type="button"
                    className="navbar-search-clear" 
                    onClick={() => navigate('/search', { replace: true })}
                  >
                    ×
                  </button>
                )}
              </form>
            ) : (
              <div className="navbar-search-trigger" onClick={handleSearchClick} style={{ flex: 1 }}>
                <span className="search-icon">🔍</span>
                <span className="search-placeholder">Search movies, users, genres...</span>
              </div>
            )}
            
            {!location.search.includes('add_story=true') && (
              <button 
                className="navbar-add-story-btn"
                title="Add Story"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/discover?add_story=true');
                }}
                style={{
                  background: 'rgba(255, 97, 210, 0.15)',
                  border: '1px solid rgba(255, 97, 210, 0.3)',
                  color: '#ff61d2',
                  borderRadius: '20px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={e => {
                  e.target.style.background = 'rgba(255, 97, 210, 0.25)';
                  e.target.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={e => {
                  e.target.style.background = 'rgba(255, 97, 210, 0.15)';
                  e.target.style.transform = 'scale(1)';
                }}
              >
                ➕ Story
              </button>
            )}
          </div>
        </div>


        {/* Right Pill: Messages, Notifications, Profile Group */}
        <div className="navbar-pill navbar-right" ref={dropdownRef}>
          <button className="nav-icon-btn" title="Recommend" onClick={onToggleRecommend}>
            🎯
          </button>

          <button className="nav-icon-btn" title="Messages" onClick={() => navigate('/messages')}>
            💬
            {unreadMessages > 0 && <span className="nav-badge">{unreadMessages > 9 ? '9+' : unreadMessages}</span>}
          </button>

          <button className="nav-icon-btn" title="Notifications" onClick={onToggleNotif}>
            🔔
            {unreadNotifs > 0 && <span className="nav-badge">{unreadNotifs > 9 ? '9+' : unreadNotifs}</span>}
          </button>

          <div className="profile-menu-container">
            <button className="profile-avatar-btn" onClick={() => setIsProfileOpen(!isProfileOpen)}>
              <img
                src={user?.profile?.photo_url || 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'}
                alt="Profile"
                onError={e => { e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png' }}
              />
            </button>

            {isProfileOpen && (
              <div className="profile-dropdown fade-up">
                <div className="dropdown-header">
                  <img
                    src={user?.profile?.photo_url || 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'}
                    alt="Profile" className="dropdown-avatar"
                    onError={e => { e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png' }}
                  />
                  <div className="dropdown-user-info">
                    <span className="dropdown-name">{user?.profile?.name || user?.name || user?.username}</span>
                    <span className="dropdown-username">@{user?.username}</span>
                  </div>
                </div>

                <div className="dropdown-links">
                  <div className="dropdown-link" onClick={() => handleDropdownLink('overview')}>
                    <span>👤 View Profile</span>
                  </div>
                  <div className="dropdown-link" onClick={() => handleDropdownLink('wishlist')}>
                    <span>🤍 Wishlist</span>
                  </div>
                  <div className="dropdown-link" onClick={() => handleDropdownLink('watched')}>
                    <span>✅ Watched Movies</span>
                  </div>
                  <div className="dropdown-link" onClick={() => handleDropdownLink('favorites')}>
                    <span>⭐ Favorites</span>
                  </div>
                  <div className="dropdown-link" onClick={() => handleDropdownLink('activity')}>
                    <span>📈 Activity</span>
                  </div>
                  <div className="dropdown-link" onClick={() => handleDropdownLink('account_settings')}>
                    <span>⚙️ Settings</span>
                  </div>

                  <div className="dropdown-divider"></div>

                  <div className="dropdown-link logout" onClick={handleLogout}>
                    <span>🚪 Logout</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  )
}
