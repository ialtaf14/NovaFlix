import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import MovieCard from '../components/MovieCard'
import SeriesAnimeCard from '../components/SeriesAnimeCard'
import './Search.css'

export default function Search() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  
  const setQuery = (val) => {
    if (val) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('q', val)
        return next
      })
    } else {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('q')
        return next
      })
    }
  }

  const [activeTab, setActiveTab] = useState('All') // 'All' | 'Movies' | 'Series' | 'Anime' | 'People' | 'Creators'
  const [movieResults, setMovieResults] = useState([])
  const [seriesResults, setSeriesResults] = useState([])
  const [animeResults, setAnimeResults] = useState([])
  const [userResults, setUserResults] = useState([])
  const [creatorResults, setCreatorResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchHistory, setSearchHistory] = useState([])

  // Advanced Filters State
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    release_year: '',
    imdb_min: '',
    imdb_max: '',
    novaflix_min: '',
    novaflix_max: '',
    runtime_min: '',
    runtime_max: '',
    ott_platform: '',
    language: '',
    country: '',
    genre: '',
    cast: '',
    director: ''
  })
  
  // Load search history from localStorage on mount & listen to top bar search submissions
  useEffect(() => {
    const handleHistoryUpdate = () => {
      const history = JSON.parse(localStorage.getItem('novaflix_search_history') || '[]')
      setSearchHistory(history)
    }
    handleHistoryUpdate()
    window.addEventListener('novaflix_search_submit', handleHistoryUpdate)
    return () => window.removeEventListener('novaflix_search_submit', handleHistoryUpdate)
  }, [])

  // Search logic on query/filters change (debounced)
  useEffect(() => {
    const hasFilters = Object.values(filters).some(v => v !== '')
    if (query.trim().length < 2 && !hasFilters) {
      setMovieResults([])
      setSeriesResults([])
      setAnimeResults([])
      setUserResults([])
      setCreatorResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timeoutId = setTimeout(() => {
      const searchParamsObj = {
        q: query || undefined,
        release_year: filters.release_year || undefined,
        imdb_min: filters.imdb_min || undefined,
        imdb_max: filters.imdb_max || undefined,
        novaflix_min: filters.novaflix_min || undefined,
        novaflix_max: filters.novaflix_max || undefined,
        runtime_min: filters.runtime_min || undefined,
        runtime_max: filters.runtime_max || undefined,
        ott_platform: filters.ott_platform || undefined,
        language: filters.language || undefined,
        country: filters.country || undefined,
        genre: filters.genre || undefined,
        cast: filters.cast || undefined,
        director: filters.director || undefined
      }

      const requests = [
        api.get('/movies/search', { params: searchParamsObj }),
        api.get('/series/search', { params: { q: query } }),
        api.get('/anime/search', { params: { q: query } }),
        api.get(`/users/search?q=${encodeURIComponent(query || '')}`),
      ]

      // Search celebrities only if query length >= 2
      if (query.trim().length >= 2) {
        requests.push(api.get(`/celebrities/search?q=${encodeURIComponent(query.trim())}`))
      }

      Promise.allSettled(requests).then(([moviesRes, seriesRes, animeRes, usersRes, celebRes]) => {
        if (moviesRes.status === 'fulfilled') {
          setMovieResults(moviesRes.value.data.results || [])
        }
        if (seriesRes.status === 'fulfilled') {
          setSeriesResults(seriesRes.value.data.results || [])
        }
        if (animeRes.status === 'fulfilled') {
          setAnimeResults(animeRes.value.data.results || [])
        }
        if (usersRes.status === 'fulfilled') {
          setUserResults(usersRes.value.data.results || [])
        }
        if (celebRes && celebRes.status === 'fulfilled') {
          setCreatorResults(celebRes.value.data.results || [])
        }
        setLoading(false)
      }).catch(err => {
        console.error("Search error:", err)
        setLoading(false)
      })
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query, filters])

  const addToHistory = (searchTerm) => {
    if (!searchTerm.trim()) return
    const filtered = searchHistory.filter(h => h.toLowerCase() !== searchTerm.toLowerCase())
    const updated = [searchTerm, ...filtered].slice(0, 10)
    setSearchHistory(updated)
    localStorage.setItem('novaflix_search_history', JSON.stringify(updated))
  }

  const handleRemoveHistory = (e, index) => {
    e.stopPropagation()
    const updated = searchHistory.filter((_, idx) => idx !== index)
    setSearchHistory(updated)
    localStorage.setItem('novaflix_search_history', JSON.stringify(updated))
  }

  const handleClearAllHistory = () => {
    setSearchHistory([])
    localStorage.removeItem('novaflix_search_history')
  }

  const handleFollowToggle = async (e, targetUser, isFollowing) => {
    e.stopPropagation()
    try {
      if (isFollowing) {
        await api.delete(`/users/${targetUser}/follow`)
      } else {
        await api.post(`/users/${targetUser}/follow`)
      }
      // Re-trigger user search to update followers count and status
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(query)}`)
      setUserResults(data.results || [])
    } catch (err) {
      console.error("Follow toggle failed:", err)
    }
  }

  const handleSubscribeToggle = async (e, celeb, isSubscribed) => {
    e.stopPropagation()
    try {
      if (isSubscribed) {
        await api.post('/celebrities/unsubscribe', { celeb_id: celeb.id })
      } else {
        await api.post('/celebrities/subscribe', { celeb_id: celeb.id })
      }
      // Update local state immediately for snappy UX
      setCreatorResults(prev => prev.map(c =>
        c.id === celeb.id
          ? {
              ...c,
              is_subscribed: !isSubscribed,
              subscriber_count: isSubscribed
                ? Math.max(0, c.subscriber_count - 1)
                : c.subscriber_count + 1
            }
          : c
      ))
    } catch (err) {
      console.error("Subscribe toggle failed:", err)
    }
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) {
      addToHistory(query)
    }
  }

  const handleHistoryClick = (term) => {
    setQuery(term)
  }

  const formatCount = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n

  const typeLabel = { director: 'Director', actor: 'Actor', actress: 'Actress' }

  return (
    <div className="page search-page-container fade-up">
      <div className="container">
        
        {/* Search Input handled in top Navbar */}

        {/* Toggle Advanced Filters Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem', marginTop: '0.8rem' }}>
          <button 
            type="button" 
            onClick={() => setShowFilters(!showFilters)}
            style={{
              background: showFilters ? 'rgba(255, 75, 43, 0.15)' : 'rgba(255,255,255,0.06)',
              border: showFilters ? '1px solid rgba(255, 75, 43, 0.4)' : '1px solid rgba(255,255,255,0.08)',
              color: showFilters ? '#ff4b2b' : '#fff',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            ⚙️ {showFilters ? 'Hide Filters' : 'Advanced Filters'}
          </button>
        </div>

        {/* Filters Panel Drawer */}
        {showFilters && (
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.2rem' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>Release Year / Range</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. 2022 or 2015-2025"
                  value={filters.release_year}
                  onChange={e => setFilters(f => ({ ...f, release_year: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>Genre</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. Action, Sci-Fi"
                  value={filters.genre}
                  onChange={e => setFilters(f => ({ ...f, genre: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>IMDb Score Min</label>
                <input 
                  type="number" 
                  step="0.1"
                  min="0"
                  max="10"
                  className="input" 
                  placeholder="e.g. 7.5"
                  value={filters.imdb_min}
                  onChange={e => setFilters(f => ({ ...f, imdb_min: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>IMDb Score Max</label>
                <input 
                  type="number" 
                  step="0.1"
                  min="0"
                  max="10"
                  className="input" 
                  placeholder="e.g. 9.5"
                  value={filters.imdb_max}
                  onChange={e => setFilters(f => ({ ...f, imdb_max: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>Runtime Min (mins)</label>
                <input 
                  type="number" 
                  className="input" 
                  placeholder="e.g. 90"
                  value={filters.runtime_min}
                  onChange={e => setFilters(f => ({ ...f, runtime_min: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>Runtime Max (mins)</label>
                <input 
                  type="number" 
                  className="input" 
                  placeholder="e.g. 180"
                  value={filters.runtime_max}
                  onChange={e => setFilters(f => ({ ...f, runtime_max: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>OTT Platform</label>
                <select 
                  className="prof-select" 
                  style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px', borderRadius: '8px' }}
                  value={filters.ott_platform}
                  onChange={e => setFilters(f => ({ ...f, ott_platform: e.target.value }))}
                >
                  <option value="">Any Platform</option>
                  <option value="Netflix">Netflix</option>
                  <option value="Amazon Prime Video">Amazon Prime</option>
                  <option value="Disney+">Disney+</option>
                  <option value="Hulu">Hulu</option>
                  <option value="Max">Max</option>
                  <option value="Apple TV+">Apple TV+</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>Language</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. English, Hindi"
                  value={filters.language}
                  onChange={e => setFilters(f => ({ ...f, language: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>Country</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. India, USA"
                  value={filters.country}
                  onChange={e => setFilters(f => ({ ...f, country: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>Director</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. Christopher Nolan"
                  value={filters.director}
                  onChange={e => setFilters(f => ({ ...f, director: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>Cast / Actor</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. Leonardo DiCaprio"
                  value={filters.cast}
                  onChange={e => setFilters(f => ({ ...f, cast: e.target.value }))}
                />
              </div>

            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button 
                type="button" 
                onClick={() => setFilters({
                  release_year: '',
                  imdb_min: '',
                  imdb_max: '',
                  novaflix_min: '',
                  novaflix_max: '',
                  runtime_min: '',
                  runtime_max: '',
                  ott_platform: '',
                  language: '',
                  country: '',
                  genre: '',
                  cast: '',
                  director: ''
                })}
                style={{ background: 'none', border: 'none', color: '#ff4b2b', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}

        {/* Tab pills */}
        <div className="search-tabs-row">
          {['All', 'Movies', 'Series', 'Anime', 'People', 'Creators'].map(tab => (
            <button
              key={tab}
              className={`search-tab-pill ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'Creators' ? '🎬 Creators' : tab}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="search-loader">
            <div className="spinner"></div>
            <span>Searching NovaFlix library...</span>
          </div>
        )}

        {/* Empty state & Search History */}
        {!loading && !query && (
          <div className="search-history-panel glass">
            <div className="search-history-header">
              <h3>Recent Searches</h3>
              {searchHistory.length > 0 && (
                <button className="clear-all-btn" onClick={handleClearAllHistory}>
                  Clear All
                </button>
              )}
            </div>
            {searchHistory.length === 0 ? (
              <p className="no-history-text">Search for your favorite movies, actors, directors, or friends above.</p>
            ) : (
              <div className="history-list">
                {searchHistory.map((item, idx) => (
                  <div key={idx} className="history-item" onClick={() => handleHistoryClick(item)}>
                    <span className="history-icon">⏳</span>
                    <span className="history-text">{item}</span>
                    <button className="remove-history-btn" onClick={(e) => handleRemoveHistory(e, idx)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search Results */}
        {!loading && query && (
          <div className="search-results-content">
            
            {/* --- CREATORS (CELEBRITIES) SECTION --- */}
            {(activeTab === 'All' || activeTab === 'Creators') && creatorResults.length > 0 && (
              <div className="results-section">
                <div className="section-header">
                  <h2>🎬 Creators</h2>
                  {activeTab === 'All' && <span className="see-all-link" onClick={() => setActiveTab('Creators')}>See All</span>}
                </div>

                {/* Info banner about subscription boost */}
                {creatorResults.some(c => c.is_subscribed) && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                    borderRadius: '10px', padding: '0.5rem 0.9rem', marginBottom: '1rem',
                    fontSize: '0.78rem', color: 'rgba(180,183,255,0.9)'
                  }}>
                    ⚡ Subscribed creators' movies are boosted <strong style={{ color: '#818cf8' }}>+40%</strong> in your recommendations
                  </div>
                )}

                <div className={activeTab === 'All' ? 'creators-row-horizontal' : 'creators-grid-vertical'}>
                  {creatorResults.map(celeb => (
                    <div
                      key={celeb.id}
                      className="creator-card"
                      onClick={() => navigate(`/actor?name=${encodeURIComponent(celeb.name)}`)}
                    >
                      {/* Type badge */}
                      <span className={`creator-type-badge ${celeb.type}`}>
                        {typeLabel[celeb.type] || celeb.type}
                      </span>

                      <img
                        src={celeb.photo}
                        alt={celeb.name}
                        className="creator-avatar"
                        onError={e => { e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png' }}
                        style={{
                          border: celeb.is_subscribed
                            ? '2px solid #818cf8'
                            : '2px solid rgba(255,255,255,0.1)'
                        }}
                      />

                      <div className="creator-info">
                        <span className="creator-name">{celeb.name}</span>
                        <span className="creator-subscribers">
                          {formatCount(celeb.subscriber_count)} subscribers
                        </span>
                      </div>

                      <button
                        className={`creator-subscribe-btn ${celeb.is_subscribed ? 'subscribed' : 'subscribe'}`}
                        onClick={(e) => handleSubscribeToggle(e, celeb, celeb.is_subscribed)}
                      >
                        {celeb.is_subscribed ? '✓ Subscribed' : '+ Subscribe'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* --- PEOPLE SECTION --- */}
            {(activeTab === 'All' || activeTab === 'People') && userResults.length > 0 && (
              <div className="results-section">
                <div className="section-header">
                  <h2>People</h2>
                  {activeTab === 'All' && <span className="see-all-link" onClick={() => setActiveTab('People')}>See All</span>}
                </div>
                <div className={activeTab === 'All' ? "people-row-horizontal" : "people-grid-vertical"}>
                  {userResults.map(person => (
                    <div
                      key={person.username}
                      className="person-card glass"
                      onClick={() => navigate(`/user/${person.username}`)}
                    >
                      <img
                        src={person.photo_url}
                        alt={person.name}
                        onError={e => { e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png' }}
                        className="person-avatar"
                      />
                      <div className="person-info">
                        <span className="person-name">{person.name}</span>
                        <span className="person-followers">@{person.username} • {person.followers_count >= 1000 ? `${(person.followers_count/1000).toFixed(1)}K` : person.followers_count} followers</span>
                      </div>
                      <button
                        className={`person-follow-btn ${person.is_following ? 'following' : 'follow'}`}
                        onClick={(e) => handleFollowToggle(e, person.username, person.is_following)}
                      >
                        {person.is_following ? 'Following' : 'Follow'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* --- MOVIES SECTION --- */}
            {(activeTab === 'All' || activeTab === 'Movies') && movieResults.length > 0 && (
              <div className="results-section">
                <div className="section-header">
                  <h2>Movies</h2>
                  {activeTab === 'All' && <span className="see-all-link" onClick={() => setActiveTab('Movies')}>See All</span>}
                </div>
                <div className="movie-grid">
                  {movieResults.map(m => (
                    <MovieCard key={m.title} {...m} />
                  ))}
                </div>
              </div>
            )}

            {/* --- SERIES SECTION --- */}
            {(activeTab === 'All' || activeTab === 'Series') && seriesResults.length > 0 && (
              <div className="results-section">
                <div className="section-header">
                  <h2>TV Series</h2>
                  {activeTab === 'All' && <span className="see-all-link" onClick={() => setActiveTab('Series')}>See All</span>}
                </div>
                <div className="movie-grid">
                  {seriesResults.map(s => (
                    <SeriesAnimeCard key={s.title} {...s} type="series" />
                  ))}
                </div>
              </div>
            )}

            {/* --- ANIME SECTION --- */}
            {(activeTab === 'All' || activeTab === 'Anime') && animeResults.length > 0 && (
              <div className="results-section">
                <div className="section-header">
                  <h2>Anime</h2>
                  {activeTab === 'All' && <span className="see-all-link" onClick={() => setActiveTab('Anime')}>See All</span>}
                </div>
                <div className="movie-grid">
                  {animeResults.map(a => (
                    <SeriesAnimeCard key={a.title} {...a} type="anime" />
                  ))}
                </div>
              </div>
            )}

            {/* --- NO RESULTS FOUND --- */}
            {movieResults.length === 0 && seriesResults.length === 0 && animeResults.length === 0 && userResults.length === 0 && creatorResults.length === 0 && (
              <div className="search-empty-state">
                <span>🔍</span>
                <h3>No results found for "{query}"</h3>
                <p>Try double checking the spelling or search for another movie, series, anime, user profile, or creator.</p>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
