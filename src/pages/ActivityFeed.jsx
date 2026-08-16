import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import './ActivityFeed.css'

export default function ActivityFeed() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [feedItems, setFeedItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [commentInputs, setCommentInputs] = useState({}) // eventId -> text
  const [followedList, setFollowedList] = useState([])

  useEffect(() => {
    fetchFeed()
  }, [])

  const fetchFeed = async () => {
    setLoading(true)
    try {
      // Get current user profile details to retrieve follows
      const profRes = await api.get('/users/profile')
      setFollowedList(profRes.data.following?.map(f => f.username) || [])

      // We load activity timeline of the current user
      const feedRes = await api.get('/users/activity/timeline?limit=50')
      
      // Simulate followings activity feed items by mapping mock interactions
      // since the activities DB might be mostly self, we populate some rich mock items
      // from mock users like emma_watson, chris_evans, etc., to make the feed look alive.
      const rawEvents = feedRes.data.activities || []
      
      const mockFeed = [
        {
          id: 'mock-1',
          username: 'emma_watson',
          name: 'Emma Watson',
          photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80',
          type: 'rate',
          movie_title: 'Inception',
          movie_poster: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=300&q=80',
          rating: 10,
          timestamp: Date.now() - 3600000 * 2, // 2h ago
          likes: ['chris_evans', 'alex_morgan'],
          comments: [
            { username: 'chris_evans', name: 'Chris Evans', text: "Masterpiece indeed! Christopher Nolan is genius." }
          ]
        },
        {
          id: 'mock-2',
          username: 'chris_evans',
          name: 'Chris Evans',
          photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
          type: 'watched',
          movie_title: 'Interstellar',
          movie_poster: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&q=80',
          timestamp: Date.now() - 3600000 * 5, // 5h ago
          likes: ['emma_watson'],
          comments: []
        },
        {
          id: 'mock-3',
          username: 'alex_morgan',
          name: 'Alex Morgan',
          photo_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80',
          type: 'wishlist_add',
          movie_title: 'Oppenheimer',
          movie_poster: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=300&q=80',
          timestamp: Date.now() - 3600000 * 12, // 12h ago
          likes: [],
          comments: []
        }
      ]

      // Combine user logs and mocks
      const mappedUserEvents = rawEvents.map(e => ({
        id: e.id,
        username: user?.username,
        name: user?.name || user?.username,
        photo_url: user?.profile?.photo_url || "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png",
        type: e.type,
        movie_title: e.movie_title,
        movie_poster: e.movie_poster || "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg",
        rating: e.rating,
        other_user: e.other_user,
        timestamp: e.timestamp,
        likes: e.metadata?.feed_likes || [],
        comments: e.metadata?.feed_comments || []
      }))

      const combined = [...mappedUserEvents, ...mockFeed]
      combined.sort((a, b) => b.timestamp - a.timestamp)
      setFeedItems(combined)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleLikeItem = (id) => {
    if (!user) return
    setFeedItems(prev => prev.map(item => {
      if (item.id === id) {
        const liked = item.likes.includes(user.username)
        return {
          ...item,
          likes: liked 
            ? item.likes.filter(u => u !== user.username)
            : [...item.likes, user.username]
        }
      }
      return item
    }))
  }

  const handleAddComment = (e, id) => {
    e.preventDefault()
    const text = commentInputs[id]
    if (!text || !text.trim() || !user) return

    const newComment = {
      username: user.username,
      name: user.name || user.username,
      text: text.trim(),
      timestamp: Date.now()
    }

    setFeedItems(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          comments: [...item.comments, newComment]
        }
      }
      return item
    }))

    setCommentInputs(prev => ({ ...prev, [id]: '' }))
  }

  const handleFollowToggle = async (username) => {
    if (!user) return
    const isFollowing = followedList.includes(username)
    try {
      if (isFollowing) {
        await api.delete(`/users/${encodeURIComponent(username)}/follow`)
        setFollowedList(prev => prev.filter(u => u !== username))
      } else {
        await api.post(`/users/${encodeURIComponent(username)}/follow`)
        setFollowedList(prev => [...prev, username])
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleShareItem = (item) => {
    navigator.clipboard.writeText(window.location.origin + `/movie?title=${encodeURIComponent(item.movie_title || '')}`)
    alert("🔗 Movie link shared! Link copied to clipboard.")
  }

  const getEventText = (item) => {
    switch (item.type) {
      case 'watched':
      case 'watch_completion':
        return `watched`
      case 'wishlist_add':
        return `added to Wishlist`
      case 'favorite_add':
        return `added to Favorites`
      case 'rate':
        return `rated ${item.movie_title} ${item.rating}/10`
      case 'review':
        return `reviewed`
      case 'follow':
        return `followed @${item.other_user}`
      default:
        return `completed action`
    }
  }

  if (loading) {
    return (
      <div className="page fade-up container" style={{ textAlign: 'center', marginTop: '5rem' }}>
        <div className="spinner"></div> Loading feed...
      </div>
    )
  }

  return (
    <div className="page feed-page fade-up">
      <div className="container" style={{ maxWidth: 650 }}>
        <h1 className="section-title" style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>🔥 Activity Feed</h1>

        <div className="feed-list">
          {feedItems.length === 0 ? (
            <p className="empty-state">No activities to display.</p>
          ) : (
            feedItems.map(item => {
              const isLiked = item.likes.includes(user?.username)
              const showFollow = item.username !== user?.username && !followedList.includes(item.username)
              
              return (
                <div key={item.id} className="glass feed-card">
                  
                  {/* Card Header */}
                  <div className="feed-card-header">
                    <div className="feed-user-info" onClick={() => navigate(`/user/${item.username}`)}>
                      <img src={item.photo_url} alt={item.username} className="feed-avatar"
                        onError={e => e.target.src = "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"} />
                      <div>
                        <span className="feed-username"><strong>{item.name || item.username}</strong></span>
                        <span className="feed-event-action">
                          {getEventText(item)} {item.type !== 'follow' && item.type !== 'rate' && (
                            <strong className="clickable" onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/movie?title=${encodeURIComponent(item.movie_title || '')}`)
                            }}>{item.movie_title}</strong>
                          )}
                        </span>
                      </div>
                    </div>
                    {showFollow && (
                      <button className="btn-feed-follow" onClick={() => handleFollowToggle(item.username)}>
                        Follow
                      </button>
                    )}
                  </div>

                  {/* Card Media (Movie poster if applicable) */}
                  {item.movie_title && item.type !== 'follow' && (
                    <div className="feed-card-media" onClick={() => navigate(`/movie?title=${encodeURIComponent(item.movie_title)}`)}>
                      <img src={item.movie_poster} alt={item.movie_title} className="feed-media-image"
                        onError={e => e.target.src = "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg"} />
                      <div className="media-overlay">
                        <h4>{item.movie_title}</h4>
                      </div>
                    </div>
                  )}

                  {/* Card Footer Actions */}
                  <div className="feed-card-footer">
                    <div className="feed-actions-row">
                      <button className={`feed-action-btn ${isLiked ? 'liked' : ''}`} onClick={() => handleLikeItem(item.id)}>
                        ❤️ {item.likes.length} Likes
                      </button>
                      <button className="feed-action-btn" onClick={() => handleShareItem(item)}>
                        📤 Share Movie
                      </button>
                    </div>

                    {/* Comments block */}
                    <div className="feed-comments-section">
                      {item.comments.length > 0 && (
                        <div className="feed-comments-list">
                          {item.comments.map((c, idx) => (
                            <div key={idx} className="feed-comment-row">
                              <span className="comment-user"><strong>{c.name || c.username}</strong></span>
                              <span className="comment-text">{c.text}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <form onSubmit={(e) => handleAddComment(e, item.id)} className="feed-comment-form">
                        <input
                          type="text"
                          className="input feed-comment-input"
                          placeholder="Add a comment..."
                          value={commentInputs[item.id] || ''}
                          onChange={e => setCommentInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                        />
                        <button type="submit" className="btn-comment-submit">Post</button>
                      </form>
                    </div>
                  </div>

                </div>
              )
            })
          )}
        </div>

      </div>
    </div>
  )
}
