import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './RecommendSidebar.css'

export default function RecommendSidebar({ isOpen, onClose }) {
  const navigate = useNavigate()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [allTitles, setAllTitles] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  const [selectedMovie, setSelectedMovie] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const [recommendations, setRecommendations] = useState({
    by_cast: [],
    by_director: [],
    by_genre: [],
    by_rating: []
  })
  
  const [expandedCategories, setExpandedCategories] = useState({
    by_cast: true,
    by_director: true,
    by_genre: true,
    by_rating: true
  })

  const sidebarRef = useRef(null)
  const inputRef = useRef(null)
  const suggestionsRef = useRef(null)

  // Fetch all titles once when sidebar is opened
  useEffect(() => {
    if (isOpen && allTitles.length === 0) {
      api.get('/movies/list')
        .then(res => {
          if (res.data?.titles) {
            setAllTitles(res.data.titles)
          }
        })
        .catch(err => {
          console.error('Failed to load movie list for recommendations:', err)
        })
    }
  }, [isOpen, allTitles])

  // Focus search input when sidebar opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      // Disable body scroll when sidebar is open
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Filter suggestions when search query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([])
      setActiveSuggestionIdx(-1)
      return
    }
    
    const query = searchQuery.toLowerCase().trim()
    const matches = allTitles
      .filter(title => title.toLowerCase().includes(query))
      .slice(0, 10)
      
    setSuggestions(matches)
    setActiveSuggestionIdx(-1)
  }, [searchQuery, allTitles])

  // Click outside to close suggestions
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(event.target) &&
        !inputRef.current?.contains(event.target)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-search movie when opened via poster target icon click
  useEffect(() => {
    const handleOpenWithMovie = (e) => {
      const targetTitle = e.detail?.title || e.detail?.movieTitle
      if (targetTitle) {
        setSearchQuery(targetTitle)
        fetchRecommendations(targetTitle)
      }
    }
    window.addEventListener('novaflix_open_recommendations', handleOpenWithMovie)
    return () => window.removeEventListener('novaflix_open_recommendations', handleOpenWithMovie)
  }, [])

  // Handle recommendation fetch with auto-retry
  const fetchRecommendations = (title, isRetry = false) => {
    setLoading(true)
    setError('')
    setSelectedMovie(title)
    setShowSuggestions(false)

    api.get('/movies/smart-recommend', { params: { title } })
      .then(res => {
        if (res.data?.categories) {
          setRecommendations(res.data.categories)
          setExpandedCategories({
            by_genre: true,
            by_director: true,
            by_rating: true,
            by_cast: true,
            by_story: true
          })
        }
      })
      .catch(err => {
        console.error('Error fetching smart recommendations:', err)
        const status = err.response?.status
        if (status === 404) {
          setError(`Movie "${title}" not found. Try a different title.`)
        } else if (!isRetry) {
          // Auto-retry once after 1s (covers transient backend/session issues)
          setTimeout(() => fetchRecommendations(title, true), 1000)
        } else {
          const errMsg = err.response?.data?.detail
            || (status ? `Server error (${status}).` : 'Could not reach server.')
          setError(errMsg)
        }
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const getBestMatch = (query) => {
    if (!query.trim()) return null
    const q = query.toLowerCase().trim()
    const exact = allTitles.find(t => t.toLowerCase() === q)
    if (exact) return exact
    const startsWith = allTitles.find(t => t.toLowerCase().startsWith(q))
    if (startsWith) return startsWith
    const includes = allTitles.find(t => t.toLowerCase().includes(q))
    if (includes) return includes
    return null
  }

  // Keyboard navigation for suggestions
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault()
      setActiveSuggestionIdx(prev => (prev + 1 < suggestions.length ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault()
      setActiveSuggestionIdx(prev => (prev - 1 >= 0 ? prev - 1 : suggestions.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeSuggestionIdx >= 0 && activeSuggestionIdx < suggestions.length) {
        const selected = suggestions[activeSuggestionIdx]
        setSearchQuery(selected)
        fetchRecommendations(selected)
      } else {
        const matched = getBestMatch(searchQuery) || searchQuery.trim()
        if (matched) {
          setSearchQuery(matched)
          fetchRecommendations(matched)
        }
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleSuggestionClick = (title) => {
    setSearchQuery(title)
    fetchRecommendations(title)
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    const matched = getBestMatch(searchQuery) || searchQuery.trim()
    if (matched) {
      setSearchQuery(matched)
      fetchRecommendations(matched)
    }
  }

  const handleClear = () => {
    setSearchQuery('')
    setSuggestions([])
    setShowSuggestions(false)
    setError('')
    setSelectedMovie('')
    setRecommendations({
      by_cast: [],
      by_director: [],
      by_genre: [],
      by_rating: []
    })
  }

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }))
  }

  const handleMovieClick = (movieTitle) => {
    navigate(`/movie?title=${encodeURIComponent(movieTitle)}`)
    onClose()
  }

  const categoryLabels = {
    by_genre: { label: 'Same Genre', icon: '🎭' },
    by_director: { label: 'Same Director', icon: '🎬' },
    by_rating: { label: 'Similar Rating', icon: '⭐' },
    by_cast: { label: 'Same Cast', icon: '👥' },
    by_story: { label: 'Similar Plot', icon: '📖' }
  }

  return (
    <>
      <div 
        className={`recommend-sidebar-overlay ${isOpen ? 'open' : ''}`} 
        onClick={onClose} 
      />
      
      <div 
        className={`recommend-sidebar ${isOpen ? 'open' : ''}`}
        ref={sidebarRef}
      >
        <div className="recommend-sidebar-header">
          <h2>🎯 <span>Smart</span> Recommendations</h2>
          <button className="recommend-close-btn" onClick={onClose} title="Close Sidebar">
            &times;
          </button>
        </div>

        <div className="recommend-sidebar-body">
          {/* Search Input Box */}
          <div className="recommend-search-box">
            <form onSubmit={handleSearchSubmit} className="recommend-search-input-wrapper">
              <span className="recommend-search-icon">🔍</span>
              <input
                ref={inputRef}
                type="text"
                className="input"
                placeholder="Type movie title (e.g. Avatar)..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowSuggestions(true)
                  setError('')
                }}
                onFocus={(e) => {
                  e.target.select()  // auto-select all text so user can type immediately
                  setShowSuggestions(true)
                }}
                onKeyDown={handleKeyDown}
              />
              {searchQuery && (
                <button type="button" className="recommend-clear-btn" onClick={handleClear}>
                  &times;
                </button>
              )}
            </form>

            {/* Autocomplete Dropdown List */}
            {showSuggestions && suggestions.length > 0 && (
              <ul className="recommend-suggestions" ref={suggestionsRef}>
                {suggestions.map((title, idx) => (
                  <li
                    key={title}
                    className={`recommend-suggestion-item ${idx === activeSuggestionIdx ? 'active' : ''}`}
                    onClick={() => handleSuggestionClick(title)}
                  >
                    🎬 {title}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div style={{ color: '#ff4b2b', fontSize: '0.85rem', padding: '0.75rem 0.5rem', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span>⚠️ {error}</span>
              {!error.includes('not found') && (
                <button
                  onClick={() => fetchRecommendations(selectedMovie)}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'rgba(255,75,43,0.15)',
                    border: '1px solid rgba(255,75,43,0.4)',
                    color: '#ff4b2b',
                    padding: '4px 14px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  🔄 Retry
                </button>
              )}
            </div>
          )}

          {/* Main Content Areas */}
          {loading ? (
            <div className="recommend-loader">
              <span className="spinner"></span>
              <span>Generating smart recommendations...</span>
            </div>
          ) : selectedMovie ? (
            <>
              <div className="recommend-source-movie">
                <div className="recommend-source-label">Based On</div>
                <div className="recommend-source-title">{selectedMovie}</div>
              </div>

              {/* Categories */}
              {Object.keys(recommendations).map((catKey) => {
                const movies = recommendations[catKey]
                const { label, icon } = categoryLabels[catKey]
                const isExpanded = expandedCategories[catKey]

                if (!movies || movies.length === 0) return null

                return (
                  <div 
                    key={catKey} 
                    className={`recommend-category ${isExpanded ? 'expanded' : ''}`}
                  >
                    <div 
                      className="recommend-category-header" 
                      onClick={() => toggleCategory(catKey)}
                    >
                      <div className="recommend-category-title">
                        <span>{icon}</span> {label}
                        <span className="recommend-category-count">{movies.length}</span>
                      </div>
                      <span className="recommend-category-arrow">▼</span>
                    </div>

                    {isExpanded && (
                      <div className="recommend-category-content">
                        <div className="recommend-movie-row">
                          {movies.map((movie) => (
                            <div 
                              key={movie.title} 
                              className="recommend-movie-card"
                              onClick={() => handleMovieClick(movie.title)}
                              title={movie.title}
                            >
                              <div className="recommend-poster-wrapper">
                                {movie.in_wishlist && (
                                  <div className="recommend-wishlist-badge" title="On Wishlist">
                                    ✨ Wish
                                  </div>
                                )}
                                <img 
                                  src={movie.poster} 
                                  alt={movie.title} 
                                  className="recommend-poster"
                                  onError={(e) => {
                                    e.target.src = 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&q=80&w=300'
                                  }}
                                />
                              </div>
                              <div className="recommend-movie-info">
                                <span className="recommend-movie-title">{movie.title}</span>
                                <div className="recommend-movie-meta">
                                  <span className="recommend-movie-rating">★ {movie.rating}</span>
                                  <span>{movie.year}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Search Another Movie Button */}
              <div style={{ padding: '1rem 0 0.5rem', textAlign: 'center' }}>
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSuggestions([])
                    setShowSuggestions(false)
                    setError('')
                    setSelectedMovie('')
                    setRecommendations({ by_cast: [], by_director: [], by_genre: [], by_rating: [] })
                    setTimeout(() => inputRef.current?.focus(), 100)
                    // scroll sidebar body back to top
                    sidebarRef.current?.querySelector('.recommend-sidebar-body')?.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: '#fff',
                    padding: '10px 24px',
                    borderRadius: '12px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    letterSpacing: '0.01em'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                >
                  🔍 Search Another Movie
                </button>
              </div>
            </>
          ) : (
            <div className="recommend-empty-state">
              <div className="recommend-empty-icon">🎯</div>
              <h3>Explore Movie Recommendations</h3>
              <p style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                Search for any movie from the database. We will find matching movies categorized by shared cast, director, genres, and similar IMDb ratings.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
