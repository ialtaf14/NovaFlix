import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import './Collections.css'

export default function Collections() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Creation State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [coverImage, setCoverImage] = useState('')
  const [moviesList, setMoviesList] = useState([]) // Array of movie titles
  
  // Search suggestion inside creator
  const [searchQuery, setSearchQuery] = useState('')
  const [movieSuggestions, setMovieSuggestions] = useState([])

  useEffect(() => {
    fetchCollections()
  }, [])

  const fetchCollections = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/social/collections')
      setCollections(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Handle movie search suggestions inside creator
  useEffect(() => {
    if (!searchQuery.trim()) {
      setMovieSuggestions([])
      return
    }
    const delayDebounce = setTimeout(async () => {
      try {
        const { data } = await api.get(`/movies/search?q=${encodeURIComponent(searchQuery)}`)
        // Deduplicate suggestions
        setMovieSuggestions(data.movies || [])
      } catch (_) {}
    }, 300)
    return () => clearTimeout(delayDebounce)
  }, [searchQuery])

  const handleAddMovie = (movieTitle) => {
    if (!moviesList.includes(movieTitle)) {
      setMoviesList(prev => [...prev, movieTitle])
    }
    setSearchQuery('')
    setMovieSuggestions([])
  }

  const handleRemoveMovie = (movieTitle) => {
    setMoviesList(prev => prev.filter(t => t !== movieTitle))
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) {
      alert("Collection title is required")
      return
    }
    try {
      await api.post('/social/collections', {
        title: title.trim(),
        description: description.strip || description,
        is_public: isPublic,
        cover_image: coverImage.trim() || undefined,
        movies: moviesList
      })
      setTitle('')
      setDescription('')
      setIsPublic(true)
      setCoverImage('')
      setMoviesList([])
      setShowCreateModal(false)
      fetchCollections()
      alert("🎉 Collection created successfully! Awarded +20 XP")
    } catch (err) {
      alert("Failed to create collection")
    }
  }

  const handleLikeCollection = async (e, id) => {
    e.stopPropagation()
    if (!user) {
      navigate('/login')
      return
    }
    try {
      const { data } = await api.post(`/social/collections/${id}/like`)
      setCollections(prev => prev.map(c => c.id === id ? { ...c, likes: data.likes } : c))
    } catch (_) {}
  }

  const handleFollowCollection = async (e, id) => {
    e.stopPropagation()
    if (!user) {
      navigate('/login')
      return
    }
    try {
      const { data } = await api.post(`/social/collections/${id}/follow`)
      setCollections(prev => prev.map(c => c.id === id ? { ...c, followers: data.followers } : c))
    } catch (_) {}
  }

  const handleShareCollection = (e, col) => {
    e.stopPropagation()
    navigator.clipboard.writeText(window.location.origin + `/collections?id=${col.id}`)
    alert("🔗 Collection link copied to clipboard!")
  }

  if (loading) {
    return (
      <div className="page fade-up container" style={{ textAlign: 'center', marginTop: '5rem' }}>
        <div className="spinner"></div> Loading collections...
      </div>
    )
  }

  return (
    <div className="page collections-page fade-up">
      <div className="container">
        
        <div className="collections-header">
          <div>
            <h1 className="section-title" style={{ marginBottom: '0.2rem', fontSize: '2rem' }}>📂 Movie Collections</h1>
            <p className="subtitle" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Browse curated movie lists or assemble your own custom collections.</p>
          </div>
          {user && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              + Create Collection
            </button>
          )}
        </div>

        <div className="collections-grid">
          {collections.length === 0 ? (
            <p className="empty-state">No collections created yet.</p>
          ) : (
            collections.map(col => {
              const isLiked = col.likes?.includes(user?.username)
              const isFollowing = col.followers?.includes(user?.username)
              
              return (
                <div key={col.id} className="glass collection-card">
                  <div className="collection-cover-wrapper">
                    <img src={col.cover_image} alt={col.title} className="collection-cover"
                      onError={e => e.target.src = "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&q=80"} />
                    <span className="collection-badge-count">{col.movies?.length || 0} Movies</span>
                    
                    {!col.is_public && <span className="collection-private-badge">🔒 Private</span>}
                  </div>

                  <div className="collection-details">
                    <h3 className="collection-title">{col.title}</h3>
                    <span className="collection-author">Curated by @{col.creator_username}</span>
                    <p className="collection-desc">{col.description || 'No description provided.'}</p>

                    {/* Movie thumbnails row */}
                    {col.movies?.length > 0 && (
                      <div className="collection-movies-previews">
                        {col.movies.slice(0, 4).map(m => (
                          <span key={m} className="col-movie-pill" onClick={() => navigate(`/movie?title=${encodeURIComponent(m)}`)}>
                            🎬 {m}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="collection-card-actions">
                      <button className={`btn-col-action ${isLiked ? 'liked' : ''}`} onClick={(e) => handleLikeCollection(e, col.id)}>
                        ❤️ {col.likes?.length || 0}
                      </button>
                      <button className={`btn-col-action ${isFollowing ? 'following' : ''}`} onClick={(e) => handleFollowCollection(e, col.id)}>
                        ⭐ {isFollowing ? 'Following' : 'Follow'}
                      </button>
                      <button className="btn-col-action" onClick={(e) => handleShareCollection(e, col)}>
                        📤 Share
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>

      {/* --- CREATE COLLECTION MODAL --- */}
      {showCreateModal && (
        <div className="col-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="col-modal glass" onClick={e => e.stopPropagation()}>
            <div className="col-modal-header">
              <h3>Create Custom Collection</h3>
              <button className="col-close-btn" onClick={() => setShowCreateModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleCreateSubmit} className="col-modal-form">
              <div className="form-group">
                <label>Collection Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Best Sci-Fi Mind-Benders"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  className="input"
                  style={{ height: '70px', resize: 'none' }}
                  placeholder="Add a detailed description..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="form-group-row">
                <div className="form-group">
                  <label>Visibility</label>
                  <select className="prof-select" value={isPublic ? 'public' : 'private'} onChange={e => setIsPublic(e.target.value === 'public')}>
                    <option value="public">🌍 Public Collection</option>
                    <option value="private">🔒 Private Collection</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Cover Image URL (Optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="https://unsplash.com/..."
                    value={coverImage}
                    onChange={e => setCoverImage(e.target.value)}
                  />
                </div>
              </div>

              {/* Add Movies Section */}
              <div className="form-group">
                <label>Search & Add Movies (+20 XP on Create)</label>
                <div className="col-movie-search-wrapper">
                  <input
                    type="text"
                    className="input"
                    placeholder="Search movies by title..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {movieSuggestions.length > 0 && (
                    <div className="col-suggestions-list glass">
                      {movieSuggestions.map(m => (
                        <div key={m.title} className="col-suggestion-item" onClick={() => handleAddMovie(m.title)}>
                          <img src={m.poster} alt={m.title} />
                          <span>{m.title} ({m.year})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Added Movies List */}
              {moviesList.length > 0 && (
                <div className="added-movies-list">
                  {moviesList.map(t => (
                    <span key={t} className="added-movie-tag">
                      {t}
                      <button type="button" className="tag-remove-btn" onClick={() => handleRemoveMovie(t)}>&times;</button>
                    </span>
                  ))}
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem' }}>
                Build Collection
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
