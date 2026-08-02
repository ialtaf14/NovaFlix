import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import MovieCard from '../components/MovieCard'
import { useAuthStore } from '../store/useAuthStore'
import ChatModal from '../components/ChatModal'

export default function UserProfile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('wishlist') // wishlist, watched, favorites, followers, following
  const [modalType, setModalType] = useState(null) // 'followers', 'following', 'favorites', null
  const [searchQuery, setSearchQuery] = useState('')
  const [followLoading, setFollowLoading] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  
  const [myProfile, setMyProfile] = useState(null)

  useEffect(() => {
    // Fetch target profile
    setLoading(true)
    api.get(`/users/public/${encodeURIComponent(username)}`)
      .then(res => {
        setProfile(res.data)
        setError(null)
      })
      .catch(err => {
        if (err.response && err.response.status === 404) {
          setError("User not found.")
        } else {
          setError("An error occurred.")
        }
      })
      .finally(() => setLoading(false))
      
    // Fetch our own profile to compute mutuals
    if (user && user.username !== username) {
      api.get(`/users/public/${encodeURIComponent(user.username)}`)
        .then(res => {
          setMyProfile(res.data)
        })
        .catch(err => console.error("Failed to fetch my profile", err))
    }
  }, [username, user])

  if (loading) {
    return (
      <div className="page fade-up container" style={{ textAlign: 'center', marginTop: '5rem' }}>
        <div className="spinner"></div> Loading profile...
      </div>
    )
  }

  if (error) {
    return (
      <div className="page fade-up container" style={{ textAlign: 'center', marginTop: '5rem' }}>
        <h2>{error}</h2>
        <button className="btn btn-primary" onClick={() => navigate('/discover')}>Go Back</button>
      </div>
    )
  }

  if (profile && !profile.public) {
    return (
      <div className="page fade-up container" style={{ textAlign: 'center', marginTop: '5rem' }}>
        <h2>🔒 This profile is private</h2>
        <p style={{ color: 'var(--muted)' }}>@{profile.username} has chosen to keep their profile private.</p>
        <button className="btn btn-primary" onClick={() => navigate('/discover')} style={{ marginTop: '1rem' }}>Back to Discover</button>
      </div>
    )
  }

  const isSelf = user && user.username === profile.username
  const isFollowing = profile.followers?.some(f => f.username === user?.username)
  
  // Mutual followers: people profile is following AND I am following
  const mutuals = []
  if (myProfile && profile) {
    profile.followers?.forEach(f => {
      if (myProfile.following?.some(mf => mf.username === f.username)) {
        mutuals.push(f)
      }
    })
  }

  const handleFollowToggle = async () => {
    if (!user) {
      navigate('/login')
      return
    }
    setFollowLoading(true)
    try {
      if (isFollowing) {
        await api.delete(`/users/${encodeURIComponent(profile.username)}/follow`)
        setProfile(prev => ({
          ...prev,
          followers_count: prev.followers_count - 1,
          followers: prev.followers.filter(f => f.username !== user.username)
        }))
      } else {
        await api.post(`/users/${encodeURIComponent(profile.username)}/follow`)
        setProfile(prev => ({
          ...prev,
          followers_count: prev.followers_count + 1,
          followers: [...prev.followers, { username: user.username, name: user.name || user.username }]
        }))
      }
    } catch (err) {
      console.error("Follow error", err)
      alert(err.response?.data?.detail || "Action failed")
    } finally {
      setFollowLoading(false)
    }
  }

  const renderTabs = () => {
    const tabs = [
      { id: 'wishlist', label: 'Wishlist', count: profile.wishlist?.length },
      { id: 'watched', label: 'Watched', count: profile.watched?.length }
    ]

    return (
      <div className="profile-tabs">
        {tabs.map(t => (
          <button 
            key={t.id} 
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label} {t.count !== undefined ? <span className="tab-count">{t.count}</span> : null}
          </button>
        ))}
      </div>
    )
  }

  const renderTabContent = () => {
    if (activeTab === 'wishlist') {
      return (
        <div className="movie-grid">
          {profile.wishlist?.length > 0 ? profile.wishlist.map(m => <MovieCard key={m.title} {...m} />) : <p className="empty-state">No wishlist items.</p>}
        </div>
      )
    }
    if (activeTab === 'watched') {
      return (
        <div className="movie-grid">
          {profile.watched?.length > 0 ? profile.watched.map(m => <MovieCard key={m.title} {...m} />) : <p className="empty-state">No watched movies.</p>}
        </div>
      )
    }
    if (activeTab === 'favorites') {
      return (
        <div className="movie-grid">
          {profile.favorites?.length > 0 ? profile.favorites.map(m => <MovieCard key={m.title} {...m} />) : <p className="empty-state">No favorite movies.</p>}
        </div>
      )
    }

    if (activeTab === 'followers' || activeTab === 'following') {
      const list = activeTab === 'followers' ? profile.followers : profile.following
      return (
        <div className="user-list">
          {list?.length > 0 ? list.map(u => (
            <div key={u.username} className="user-list-item" onClick={() => navigate(`/user/${u.username}`)}>
              <img src={u.photo_url || "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"} alt={u.username} />
              <div>
                <div className="user-list-name">{u.name}</div>
                <div className="user-list-username">@{u.username}</div>
              </div>
            </div>
          )) : <p className="empty-state">No users found.</p>}
        </div>
      )
    }
  }

  const renderInstaModal = () => {
    if (!modalType) return null;

    let title = '';
    let content = null;

    const closeModal = () => setModalType(null);
    const handleModalClick = (e) => e.stopPropagation();

    if (modalType === 'followers' || modalType === 'following') {
      title = modalType === 'followers' ? 'Followers' : 'Following';
      const sourceList = modalType === 'followers' ? profile.followers : profile.following;
      const filteredList = sourceList?.filter(u => 
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase()))
      ) || [];

      content = (
        <>
          <div className="insta-search-container">
            <input 
              type="text" 
              className="insta-search-input" 
              placeholder={`Search ${title.toLowerCase()}...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="insta-modal-body">
            {filteredList.length > 0 ? filteredList.map(u => {
              const isMeFollowing = myProfile?.following?.some(mf => mf.username === u.username);
              const isMe = user?.username === u.username;

              return (
                <div key={u.username} className="insta-user-item">
                  <div className="insta-user-info" onClick={() => { closeModal(); navigate(`/user/${u.username}`); }}>
                    <img src={u.photo_url || "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"} alt={u.username} />
                    <div className="insta-user-details">
                      <span className="insta-user-name">{u.name || u.username}</span>
                      <span className="insta-user-username">@{u.username}</span>
                    </div>
                  </div>
                  {user && !isMe && (
                    <button className={`insta-follow-btn ${isMeFollowing ? 'following' : 'follow'}`}>
                      {isMeFollowing ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
              );
            }) : <p className="empty-state" style={{padding: '2rem'}}>No users found.</p>}
          </div>
        </>
      );
    } else if (modalType === 'favorites') {
      title = 'Favorite Movies';
      content = (
        <div className="insta-modal-body" style={{padding: '1.5rem 0'}}>
          {profile.favorites?.length > 0 ? (
            <div className="insta-grid">
              {profile.favorites.map(m => (
                <div key={m.title} onClick={closeModal} style={{cursor: 'pointer'}}>
                  <MovieCard {...m} />
                </div>
              ))}
            </div>
          ) : <p className="empty-state">No favorite movies.</p>}
        </div>
      );
    }

    return (
      <div className="insta-modal-overlay" onClick={closeModal}>
        <div className={`insta-modal ${modalType === 'favorites' ? 'large' : ''}`} onClick={handleModalClick}>
          <div className="insta-modal-header">
            <h3 className="insta-modal-title">{title}</h3>
            <button className="insta-close-btn" onClick={closeModal}>&times;</button>
          </div>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="page fade-up container profile-container">
      {/* Top Banner Section */}
      <div className="profile-header glass">
        <div className="profile-avatar-wrapper">
          <img 
            src={profile.photo_url} 
            alt={profile.username} 
            className="profile-avatar"
          />
        </div>
        
        <div className="profile-header-info">
          <div className="profile-title-row">
            <div>
              <h1 className="profile-name">{profile.name}</h1>
              <div className="profile-username">@{profile.username}</div>
            </div>
            
            {!isSelf && (
              <div className="profile-actions">
                <button 
                  className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'} follow-btn`}
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                >
                  {followLoading ? '...' : isFollowing ? 'Unfollow' : 'Follow'}
                </button>
                <button className="btn btn-icon" title="Message" onClick={() => user ? setIsChatOpen(true) : navigate('/login')}>💬</button>
                <button className="btn btn-icon" title="Share" onClick={() => {
                  navigator.clipboard.writeText(window.location.href)
                  alert('Profile link copied!')
                }}>🔗</button>
              </div>
            )}
          </div>
          
          <div className="profile-stats">
            <div className="stat-item" onClick={() => {setModalType('followers'); setSearchQuery('');}}>
              <span className="stat-value">{profile.followers_count}</span>
              <span className="stat-label">Followers</span>
            </div>
            <div className="stat-item" onClick={() => {setModalType('following'); setSearchQuery('');}}>
              <span className="stat-value">{profile.following_count}</span>
              <span className="stat-label">Following</span>
            </div>
            <div className="stat-item" onClick={() => {setModalType('favorites'); setSearchQuery('');}}>
              <span className="stat-value">{profile.favorites?.length || 0}</span>
              <span className="stat-label">Favorites</span>
            </div>
          </div>
          
          <p className="profile-bio">{profile.bio}</p>
          
          {profile.instagram_id && (
            <a 
              href={`https://instagram.com/${profile.instagram_id}`} 
              target="_blank" 
              rel="noreferrer"
              className="profile-instagram"
            >
              📸 @{profile.instagram_id}
            </a>
          )}
          
          {mutuals.length > 0 && !isSelf && (
            <div className="mutual-followers">
              <span>Followed by </span>
              <strong>{mutuals[0].username}</strong>
              {mutuals.length > 1 && <span> and {mutuals.length - 1} others you follow</span>}
            </div>
          )}
        </div>
      </div>

      {/* Profile Tabs */}
      {renderTabs()}

      {/* Tab Content */}
      <div className="profile-content">
        {renderTabContent()}
      </div>

      {renderInstaModal()}

      {/* Chat Modal */}
      {isChatOpen && (
        <ChatModal 
          targetUsername={profile.username}
          targetName={profile.name}
          targetPhoto={profile.photo_url}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  )
}
