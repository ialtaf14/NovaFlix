import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './SearchBar.css'

export default function SearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [movieResults, setMovieResults] = useState([])
  const [userResults, setUserResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setMovieResults([])
      setUserResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timeoutId = setTimeout(() => {
      Promise.allSettled([
        api.get(`/movies/search?q=${encodeURIComponent(query)}`),
        api.get(`/users/search?q=${encodeURIComponent(query)}`)
      ]).then(([moviesRes, usersRes]) => {
        if (moviesRes.status === 'fulfilled') {
          setMovieResults(moviesRes.value.data.results || [])
        }
        if (usersRes.status === 'fulfilled') {
          setUserResults(usersRes.value.data.results || [])
        }
        setLoading(false)
        setShowDropdown(true)
      })
    }, 400) // Debounce

    return () => clearTimeout(timeoutId)
  }, [query])

  const handleMovieClick = (title) => {
    setShowDropdown(false)
    setQuery('')
    api.post('/users/activity/log', {
      type: 'search',
      movie_title: title,
      metadata: { query }
    }).catch(() => {})
    navigate(`/movie?title=${encodeURIComponent(title)}`)
  }

  const handleUserClick = (username) => {
    setShowDropdown(false)
    setQuery('')
    api.post('/users/activity/log', {
      type: 'profile_view',
      other_user: username,
      metadata: { query }
    }).catch(() => {})
    navigate(`/user/${encodeURIComponent(username)}`)
  }

  return (
    <div className="search-bar-container" ref={dropdownRef}>
      <input
        type="text"
        className="search-input"
        placeholder="Search movies, users..."
        value={query}
        onChange={(e) => {
            setQuery(e.target.value)
            setShowDropdown(true)
        }}
        onFocus={() => { if (query.trim().length >= 2) setShowDropdown(true) }}
      />
      
      {showDropdown && (query.trim().length >= 2) && (
        <div className="search-dropdown">
          {loading ? (
            <div className="search-loading">
              <div className="spinner"></div> Searching...
            </div>
          ) : (movieResults.length === 0 && userResults.length === 0) ? (
            <div className="search-no-results">No results found for "{query}"</div>
          ) : (
            <>
              {userResults.length > 0 && (
                <div className="search-section">
                  <div className="search-section-title">Users</div>
                  {userResults.map(u => (
                    <div key={u.username} className="search-item user-item" onClick={() => handleUserClick(u.username)}>
                      <img src={u.photo_url} alt={u.username} className="search-user-avatar" />
                      <div className="search-user-info">
                        <div className="search-user-name">{u.name}</div>
                        <div className="search-user-handle">@{u.username}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {movieResults.length > 0 && (
                <div className="search-section">
                  <div className="search-section-title">Movies</div>
                  {movieResults.map(m => (
                    <div key={m.title} className="search-item movie-item" onClick={() => handleMovieClick(m.title)}>
                      <img src={m.poster} alt={m.title} className="search-movie-poster" />
                      <div className="search-movie-info">
                        <div className="search-movie-title">{m.title}</div>
                        <div className="search-movie-meta">⭐ {m.rating} • {m.year}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
