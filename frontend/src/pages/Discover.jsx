import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import MovieCard from '../components/MovieCard'
import SkeletonCard from '../components/SkeletonCard'
import StoryEditor from '../components/StoryEditor'
import StoriesBar from '../components/StoriesBar'
import OnboardingModal from '../components/OnboardingModal'
import api from '../services/api'
import { useCachedResource } from '../hooks/useCachedResource'
import { useCachedState } from '../hooks/useCachedState'
import useDragScroll from '../hooks/useDragScroll'

// ── Cinematic Auto-Sliding Hero Banner ──────────────────────────────────────
function HeroBanner({ movies, loading, onNavigate }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [animating, setAnimating] = useState(false)
  const timerRef = useRef(null)

  const goTo = useCallback((idx, total) => {
    if (animating) return
    setAnimating(true)
    setTimeout(() => {
      setActiveIdx((idx + total) % total)
      setAnimating(false)
    }, 400)
  }, [animating])

  useEffect(() => {
    if (!movies || movies.length === 0) return
    timerRef.current = setInterval(() => {
      setActiveIdx(prev => (prev + 1) % movies.length)
    }, 5000)
    return () => clearInterval(timerRef.current)
  }, [movies])

  const resetTimer = (idx) => {
    clearInterval(timerRef.current)
    setActiveIdx(idx)
    timerRef.current = setInterval(() => {
      setActiveIdx(prev => (prev + 1) % movies.length)
    }, 5000)
  }

  if (loading) {
    return (
      <div className="hero-slider-skeleton">
        <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 0 }} />
      </div>
    )
  }
  if (!movies || movies.length === 0) return null

  const movie = movies[activeIdx]
  const total = movies.length

  return (
    <div className="hero-slider" key={activeIdx}>
      {/* Background Backdrop */}
      <div
        className={`hero-slider-bg ${animating ? 'hero-fade-out' : 'hero-fade-in'}`}
        style={{ backgroundImage: `url(${movie.poster})` }}
      />
      <div className="hero-slider-overlay" />

      {/* Content */}
      <div className={`hero-slider-content ${animating ? 'hero-fade-out' : 'hero-fade-in'}`}>
        <div className="hero-slider-left">
          <span className="hero-badge">★ TOP PICK FOR YOU</span>
          <h1 className="hero-title">{movie.title}</h1>
          <div className="hero-meta">
            {movie.rating && movie.rating !== 'N/A' && <span className="hero-rating">⭐ {movie.rating}</span>}
            {movie.year && movie.year !== 'N/A' && <span className="hero-year">📅 {movie.year}</span>}
            {movie.genre && <span className="hero-genre">{movie.genre.split(',')[0].trim()}</span>}
          </div>
          <div className="hero-actions">
            <button className="hero-btn-primary" onClick={() => onNavigate(movie.title)}>
              ▶ Watch Now
            </button>
            <button className="hero-btn-secondary" onClick={() => onNavigate(movie.title)}>
              ℹ More Info
            </button>
          </div>
        </div>
        <div className="hero-slider-right">
          <img
            src={movie.poster}
            alt={movie.title}
            className="hero-poster-card"
            onClick={() => onNavigate(movie.title)}
            onError={e => e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg'}
          />
        </div>
      </div>

      {/* Prev / Next Arrows */}
      <button className="hero-arrow hero-arrow-left" onClick={() => { resetTimer((activeIdx - 1 + total) % total) }}>‹</button>
      <button className="hero-arrow hero-arrow-right" onClick={() => { resetTimer((activeIdx + 1) % total) }}>›</button>

      {/* Dot Indicators */}
      <div className="hero-dots">
        {movies.map((_, i) => (
          <button
            key={i}
            className={`hero-dot ${i === activeIdx ? 'active' : ''}`}
            onClick={() => resetTimer(i)}
          />
        ))}
      </div>

      {/* Progress Bar */}
      <div className="hero-progress-bar">
        <div className="hero-progress-fill" key={activeIdx} />
      </div>
    </div>
  )
}

// Custom movie card specifically for the Mood Recommendation row to meet all 9 item requirements without affecting existing movie cards.
function MoodMovieCard({ title, poster, rating, year, genre, novaflix_rating }) {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()
  const [copied, setCopied] = useState(false)

  const wishlist = user?.wishlist || []
  const favorites = user?.favorite_list || []
  const isWishlisted = wishlist.includes(title)
  const isFavorite = favorites.includes(title)

  const handleWishlistClick = async (e) => {
    e.stopPropagation()
    try {
      if (isWishlisted) {
        const { data } = await api.delete(`/users/wishlist/${encodeURIComponent(title)}`)
        updateUser({ wishlist: data.wishlist })
      } else {
        const { data } = await api.post('/users/wishlist', { title })
        updateUser({ wishlist: data.wishlist })
      }
    } catch (_) {}
  }

  const handleFavoriteClick = async (e) => {
    e.stopPropagation()
    try {
      if (isFavorite) {
        const { data } = await api.delete(`/users/favorites/${encodeURIComponent(title)}`)
        updateUser({ favorite_list: data.favorite_list })
      } else {
        const { data } = await api.post('/users/favorites', { title })
        updateUser({ favorite_list: data.favorite_list })
      }
    } catch (_) {}
  }

  const handleShareClick = (e) => {
    e.stopPropagation()
    // Copy movie link
    const shareUrl = `${window.location.origin}/movie?title=${encodeURIComponent(title)}`
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
    // Navigate to Chat to share
    setTimeout(() => {
      navigate(`/messages?share_movie=${encodeURIComponent(title)}`)
    }, 700)
  }

  return (
    <div className="mood-movie-card" onClick={() => navigate(`/movie?title=${encodeURIComponent(title)}`)}>
      <div className="mood-movie-poster-wrapper">
        <img
          src={poster || 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg'}
          alt={title}
          className="mood-movie-poster"
          onError={(e) => { e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg' }}
        />

        <div className={`novaflix-rating-badge ${!novaflix_rating || novaflix_rating === 'N/A' ? 'nf-no-rating' : ''}`} title="NovaFlix Rating">
          <span className="nf-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="12" fill="url(#nfGrad)"/>
              <defs><linearGradient id="nfGrad" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stopColor="#a855f7"/><stop offset="100%" stopColor="#7c3aed"/></linearGradient></defs>
              <text x="12" y="16.5" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="900" fontFamily="Arial,sans-serif">NF</text>
            </svg>
          </span>
          <span className="nf-score">{novaflix_rating && novaflix_rating !== 'N/A' ? novaflix_rating : 'N/R'}</span>
        </div>

        {/* Floating Quick Action Buttons */}
        {user && (
          <div className="mood-movie-actions">
            <button
              className={`mood-action-btn ${isFavorite ? 'active' : ''}`}
              onClick={handleFavoriteClick}
              title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            >
              {isFavorite ? '❤️' : '♡'}
            </button>
            <button
              className={`mood-action-btn ${isWishlisted ? 'active' : ''}`}
              onClick={handleWishlistClick}
              title={isWishlisted ? "Remove from Wishlist" : "Add to Wishlist"}
            >
              {isWishlisted ? '💖' : '🤍'}
            </button>
            <button
              className={`mood-action-btn share-btn ${copied ? 'copied' : ''}`}
              onClick={handleShareClick}
              title="Share to Chat"
            >
              {copied ? '✅' : '🔗'}
            </button>
          </div>
        )}

        {/* Hover/Details Overlay */}
        <div className="mood-movie-info-overlay">
          <div className="mood-movie-rating-row">
            <span className="rating-badge imdb-badge">⭐ {rating !== 'N/A' ? rating : '?'}</span>
          </div>
          <p className="mood-movie-genre">{genre || 'N/A'}</p>
        </div>
      </div>

      <div className="mood-movie-details-bottom">
        <h4 className="mood-movie-title" title={title}>{title}</h4>
        <span className="mood-movie-year">📅 {year}</span>
      </div>

      {copied && (
        <div className="share-toast">Link Copied! Opening Chat...</div>
      )}
    </div>
  )
}

export default function Discover() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, updateUser } = useAuthStore()
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)

  // ── Session-cached data: fetched once, then instant on every tab switch ──
  const EMPTY_TRENDING = { daily: [], weekly: [], monthly: [], region: [], top_rated: [], recent: [], hidden_gems: [] }

  const { data: trendingData, loading: trendingLoading } = useCachedResource('discover:trending', () =>
    api.get('/movies/trending-all').then(r => r.data || EMPTY_TRENDING)
  )
  const trending = trendingData || EMPTY_TRENDING

  const { data: latestData, loading: latestLoading } = useCachedResource('discover:latest', () =>
    api.get('/movies/latest').then(r => r.data?.movies || []))
  const latestMovies = latestData || []

  // Personalized recs are keyed by wishlist/watched sizes: they refresh when the
  // user changes those, but stay cached across pure tab switches.
  const persoKey = `discover:personalized:${user?.username || 'guest'}:${user?.wishlist?.length ?? 0}:${user?.watched_list?.length ?? 0}`
  const { data: personalized, loading: personalizedLoading } = useCachedResource(
    persoKey,
    () => api.get('/movies/personalized').then(r => r.data)
  )

  // Stories (refreshable after posting a new story)
  const { data: storiesData, refresh: refreshStories } = useCachedResource(
    'discover:stories',
    () => api.get('/social/stories').then(r => r.data),
    { enabled: !!user }
  )
  const stories = storiesData || []

  const [showAddStory, setShowAddStory] = useState(false)

  // Mood recommendations — persisted so a picked mood + its results survive tab switches
  const [selectedMood, setSelectedMood] = useCachedState('discover:selectedMood', null)
  const [moodMovies, setMoodMovies] = useCachedState('discover:moodMovies', [])
  const [moodLoading, setMoodLoading] = useState(false)
  const [moodOffset, setMoodOffset] = useCachedState('discover:moodOffset', 0)
  const [moodHasMore, setMoodHasMore] = useCachedState('discover:moodHasMore', true)
  const [moodLoadingMore, setMoodLoadingMore] = useState(false)
  const moodRowRef = useRef(null)

  useEffect(() => {
    if (searchParams.get('share') === 'true' || searchParams.get('add_story') === 'true') {
      setShowAddStory(true)
    }
  }, [searchParams])

  const closeStoryModal = () => {
    setShowAddStory(false)
    navigate('/discover', { replace: true })
  }

  const handleMoodClick = async (mood) => {
    setSelectedMood(mood)
    setMoodLoading(true)
    setMoodOffset(0)
    setMoodHasMore(true)
    try {
      const { data } = await api.get(`/social/ai/moods?mood=${encodeURIComponent(mood)}&limit=20&offset=0`)
      setMoodMovies(data)
      if (data.length < 20) {
        setMoodHasMore(false)
      }
    } catch (_) {}
    setMoodLoading(false)
  }

  const handleLoadMoreMoodMovies = async () => {
    if (moodLoadingMore || !moodHasMore) return
    setMoodLoadingMore(true)
    const nextOffset = moodOffset + 20
    try {
      const { data } = await api.get(`/social/ai/moods?mood=${encodeURIComponent(selectedMood)}&limit=20&offset=${nextOffset}`)
      setMoodMovies(prev => [...prev, ...data])
      setMoodOffset(nextOffset)
      if (data.length < 20) {
        setMoodHasMore(false)
      }
    } catch (_) {}
    setMoodLoadingMore(false)
  }

  const handleMoodScroll = () => {
    if (!moodRowRef.current || moodLoadingMore || !moodHasMore || moodLoading) return
    const { scrollLeft, scrollWidth, clientWidth } = moodRowRef.current
    if (scrollWidth - scrollLeft - clientWidth < 300) {
      handleLoadMoreMoodMovies()
    }
  }

  // Hero Banner: top 6 personalized picks + trending fallbacks
  const heroMovies = [
    ...(personalized?.recommended || []).slice(0, 4),
    ...(trending.daily || []).slice(0, 4)
  ].filter((m, i, arr) => arr.findIndex(x => x.title === m.title) === i).slice(0, 6)

  const RowSection = ({ title, movies, loading }) => {
    const rowRef = useDragScroll()
    const progressRef = useRef(null)

    const handleRowScroll = () => {
      if (!rowRef.current || !progressRef.current) return
      requestAnimationFrame(() => {
        if (!rowRef.current || !progressRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = rowRef.current
        const progress = scrollWidth > clientWidth ? (scrollLeft / (scrollWidth - clientWidth)) * 100 : 0
        progressRef.current.style.width = `${Math.min(progress, 100)}%`
      })
    }

    if (loading) {
      return (
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="skeleton" style={{ height: 24, width: 220, borderRadius: 8, marginBottom: '1.2rem' }} />
          <div className="movie-row">
            {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      )
    }

    if (!movies || movies.length === 0) return null

    return (
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 className="section-title">{title}</h2>
        <div className="movie-row" ref={rowRef} onScroll={handleRowScroll}>
          {movies.map(m => <MovieCard key={m.title} {...m} />)}
        </div>
        {/* Progress Indicator */}
        <div style={{
          height: '3px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '2px',
          marginTop: '0.8rem',
          overflow: 'hidden'
        }}>
          <div ref={progressRef} style={{
            height: '100%',
            background: '#ff4b2b',
            width: `0%`,
            transition: 'width 0.1s ease-out',
            borderRadius: '2px'
          }} />
        </div>
      </div>
    )
  }

  return (
    <div className="page fade-up">
      <OnboardingModal 
        isOpen={user != null && !user.onboarding_completed && !onboardingDismissed} 
        onClose={() => setOnboardingDismissed(true)} 
      />

      {/* ── CINEMATIC HERO SLIDER (full-width, outside container) ── */}
      <HeroBanner
        movies={heroMovies}
        loading={personalizedLoading && trendingLoading}
        onNavigate={(title) => navigate(`/movie?title=${encodeURIComponent(title)}`)}
      />

      <div className="container">

        {/* STORIES LIST ROW */}
        <StoriesBar
          stories={stories}
          currentUser={user}
          onAddStory={() => setShowAddStory(true)}
        />

        {/* Header Title */}
        <h1 className="section-title" style={{ fontSize: '2.2rem', marginBottom: '0.4rem', fontWeight: 900 }}>
          🎬 Discover
        </h1>
        <p style={{ color: 'var(--muted)', marginBottom: '2.5rem', fontSize: '0.9rem' }}>
          Explore trending titles and personalized recommendations curated just for you.
        </p>

        {/* MOOD RECOMMENDATIONS SECTION */}
        <div style={{ marginBottom: '3rem' }}>
          <h2 className="section-title">😄 Mood Recommendations</h2>
          <p style={{ color: 'var(--muted)', marginTop: '-8px', marginBottom: '1.2rem', fontSize: '0.82rem' }}>
            Select a mood and let Nova AI recommend tailored movies that match your vibe.
          </p>
          <div className="mood-cards-row" style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none' }}>
            {[
              { label: 'Happy', emoji: '😄', bg: 'linear-gradient(135deg, #ffe066 0%, #f5a623 100%)', color: '#5c3e00' },
              { label: 'Emotional', emoji: '😢', bg: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)', color: '#fff' },
              { label: 'Mind-Blowing', emoji: '🤯', bg: 'linear-gradient(135deg, #a29bfe 0%, #6c5ce7 100%)', color: '#fff' },
              { label: 'Horror', emoji: '😱', bg: 'linear-gradient(135deg, #2d3436 0%, #000000 100%)', color: '#ff7675' },
              { label: 'Action', emoji: '🔥', bg: 'linear-gradient(135deg, #ff7675 0%, #d63031 100%)', color: '#fff' },
              { label: 'Romantic', emoji: '💖', bg: 'linear-gradient(135deg, #fd79a8 0%, #e84393 100%)', color: '#fff' }
            ].map(mood => {
              const isActive = selectedMood === mood.label;
              return (
                <div
                  key={mood.label}
                  onClick={() => handleMoodClick(mood.label)}
                  style={{
                    background: mood.bg,
                    color: mood.color,
                    padding: '1rem 1.8rem',
                    borderRadius: '16px',
                    fontWeight: 800,
                    fontSize: '1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexShrink: 0,
                    boxShadow: isActive ? '0 0 20px rgba(255,255,255,0.35), 0 4px 12px rgba(0,0,0,0.4)' : '0 4px 10px rgba(0,0,0,0.15)',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    border: isActive ? '2px solid #fff' : '2px solid transparent',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  className={`mood-pill-btn ${isActive ? 'active' : ''}`}
                >
                  <span>{mood.emoji}</span>
                  <span>{mood.label}</span>
                  {isActive && <div className="active-glow-effect"></div>}
                </div>
              );
            })}
          </div>

          {/* Mood results loading & display */}
          {selectedMood && (
            <div className="glass-panel mood-results-panel fade-up" style={{ marginTop: '1.5rem', padding: '1.5rem', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#fff' }}>
                  Nova AI Recommendations for: <span style={{ color: '#ff4b2b' }}>{selectedMood}</span>
                </h3>
                <button
                  onClick={() => setSelectedMood(null)}
                  style={{ background: 'rgba(255,75,43,0.1)', border: 'none', color: '#ff4b2b', padding: '4px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.2s' }}
                  className="clear-recs-btn"
                >
                  Clear recommendations
                </button>
              </div>

              {moodLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '2rem 0', fontSize: '0.95rem', color: 'var(--muted)', justifyContent: 'center' }}>
                  <div className="spinner" style={{ width: '1.5rem', height: '1.5rem' }}></div> Thinking up personalized movie list...
                </div>
              ) : (
                <div
                  className="movie-row mood-movies-row"
                  ref={moodRowRef}
                  onScroll={handleMoodScroll}
                  style={{ scrollbarWidth: 'thin', display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '10px' }}
                >
                  {moodMovies.map(m => (
                    <MoodMovieCard key={m.title} {...m} />
                  ))}

                  {moodHasMore && (
                    <div className="show-more-card" onClick={handleLoadMoreMoodMovies}>
                      {moodLoadingMore ? (
                        <div className="spinner" style={{ width: '1.5rem', height: '1.5rem', borderColor: '#ff4b2b', borderTopColor: 'transparent' }}></div>
                      ) : (
                        <>
                          <div className="show-more-icon">➔</div>
                          <div className="show-more-text">Show More</div>
                        </>
                      )}
                    </div>
                  )}

                  {(!moodMovies || moodMovies.length === 0) && (
                    <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '1rem 0' }}>No recommendations found fitting this mood.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── PERSONALIZED NETFLIX ROWS ── */}
        <RowSection title="👀 Continue Watching" movies={personalized?.continue_watching} loading={personalizedLoading} />
        <RowSection title="🎯 Similar to your interests" movies={personalized?.recommended} loading={personalizedLoading} />
        <RowSection title="💖 Wishlist Picks" movies={personalized?.wishlist_picks} loading={personalizedLoading} />

        {/* ── LATEST MOVIES ── */}
        <RowSection title="🆕 Latest Movies" movies={latestMovies} loading={latestLoading} />

        {/* ── TRENDING ROWS ── */}
        <RowSection title="🔥 Daily Trending" movies={trending.daily} loading={trendingLoading} />
        <RowSection title="💎 Hidden Gems" movies={trending.hidden_gems} loading={trendingLoading} />
        <RowSection title="📅 Weekly Trending" movies={trending.weekly} loading={trendingLoading} />
        <RowSection title="🌍 Popular in your region" movies={trending.region} loading={trendingLoading} />
        <RowSection title="⭐ Top Rated Movies" movies={trending.top_rated} loading={trendingLoading} />
        <RowSection title="🎬 Recently Released" movies={trending.recent} loading={trendingLoading} />
        <RowSection title="🗓️ Monthly Trending" movies={trending.monthly} loading={trendingLoading} />

        <StoryEditor
          isOpen={showAddStory}
          onClose={closeStoryModal}
          onSuccess={refreshStories}
        />

      </div>

      <style>{`
        /* ── Hero Slider ── */
        .hero-slider {
          position: relative;
          width: 100%;
          height: 520px;
          overflow: hidden;
          margin-bottom: 0;
          background: #0a0a0f;
        }
        @media (max-width: 768px) {
          .hero-slider { height: 380px; }
        }
        .hero-slider-skeleton {
          width: 100%;
          height: 520px;
          background: #121218;
        }
        .hero-slider-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center top;
          filter: blur(18px) brightness(0.35);
          transform: scale(1.08);
          transition: opacity 0.5s ease;
        }
        .hero-slider-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to right, rgba(5,5,10,0.97) 0%, rgba(5,5,10,0.7) 55%, rgba(5,5,10,0.15) 100%),
                      linear-gradient(to top, rgba(5,5,10,1) 0%, transparent 40%);
        }
        .hero-slider-content {
          position: relative;
          z-index: 2;
          height: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
          transition: opacity 0.4s ease;
        }
        .hero-slider-left {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 550px;
        }
        .hero-badge {
          color: #ff4b2b;
          text-transform: uppercase;
          letter-spacing: 3px;
          font-size: 0.72rem;
          font-weight: 800;
        }
        .hero-title {
          font-size: clamp(1.8rem, 4vw, 3rem);
          font-weight: 900;
          margin: 0;
          line-height: 1.1;
          color: #fff;
          text-shadow: 0 2px 20px rgba(0,0,0,0.8);
        }
        .hero-meta {
          display: flex;
          gap: 0.8rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .hero-rating { color: #ffd700; font-weight: 700; font-size: 0.9rem; }
        .hero-year { color: rgba(255,255,255,0.55); font-size: 0.9rem; }
        .hero-genre {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.8);
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 0.78rem;
          font-weight: 600;
        }
        .hero-actions { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
        .hero-btn-primary {
          padding: 0.75rem 2rem;
          background: #ff4b2b;
          color: #fff;
          border: none;
          border-radius: 12px;
          font-weight: 800;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 20px rgba(255,75,43,0.4);
        }
        .hero-btn-primary:hover { background: #e03e20; transform: scale(1.04); }
        .hero-btn-secondary {
          padding: 0.75rem 1.5rem;
          background: rgba(255,255,255,0.1);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s;
          backdrop-filter: blur(6px);
        }
        .hero-btn-secondary:hover { background: rgba(255,255,255,0.18); transform: scale(1.04); }
        .hero-slider-right {
          flex-shrink: 0;
        }
        .hero-poster-card {
          width: 180px;
          aspect-ratio: 2/3;
          object-fit: cover;
          border-radius: 18px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 0 2px rgba(255,255,255,0.06);
          cursor: pointer;
          transition: transform 0.35s ease, box-shadow 0.35s ease;
        }
        .hero-poster-card:hover {
          transform: scale(1.05) translateY(-4px);
          box-shadow: 0 28px 60px rgba(0,0,0,0.9), 0 0 30px rgba(255,75,43,0.2);
        }
        @media (max-width: 600px) {
          .hero-slider-right { display: none; }
          .hero-slider-content { padding: 0 1.2rem; }
          .hero-title { font-size: 1.6rem; }
        }
        /* Arrows */
        .hero-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 10;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          color: #fff;
          font-size: 2.2rem;
          line-height: 1;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          backdrop-filter: blur(6px);
          transition: all 0.2s;
        }
        .hero-arrow:hover { background: rgba(255,75,43,0.35); border-color: #ff4b2b; transform: translateY(-50%) scale(1.1); }
        .hero-arrow-left { left: 1.5rem; }
        .hero-arrow-right { right: 1.5rem; }
        /* Dots */
        .hero-dots {
          position: absolute;
          bottom: 3rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          z-index: 10;
        }
        .hero-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: none;
          background: rgba(255,255,255,0.3);
          cursor: pointer;
          transition: all 0.3s;
          padding: 0;
        }
        .hero-dot.active { background: #ff4b2b; width: 24px; border-radius: 4px; }
        /* Progress Bar */
        .hero-progress-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(255,255,255,0.1);
          z-index: 10;
        }
        .hero-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #ff4b2b, #ff8c69);
          animation: hero-progress 5s linear forwards;
          border-radius: 0 2px 2px 0;
        }
        @keyframes hero-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        /* Fade transitions */
        .hero-fade-in { animation: heroFadeIn 0.5s ease forwards; }
        .hero-fade-out { opacity: 0; }
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── Mood Pill Glowing Effect ── */
        .mood-pill-btn {
          position: relative;
          user-select: none;
        }
        .mood-pill-btn.active::after {
          content: '';
          position: absolute;
          top: -2px; left: -2px; right: -2px; bottom: -2px;
          border-radius: 16px;
          background: inherit;
          filter: blur(8px);
          opacity: 0.4;
          z-index: -1;
          pointer-events: none;
        }

        .clear-recs-btn:hover {
          background: rgba(255,75,43,0.2) !important;
          transform: scale(1.02);
        }

        /* ── Mood Recommendations Movie Card ── */
        .mood-movies-row {
          padding-top: 10px !important;
          padding-bottom: 20px !important;
        }

        .mood-movie-card {
          flex: 0 0 200px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          overflow: hidden;
          cursor: pointer;
          position: relative;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          display: flex;
          flex-direction: column;
        }

        .mood-movie-card:hover {
          transform: translateY(-8px) scale(1.02);
          box-shadow: 0 16px 32px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.04);
        }

        .mood-movie-poster-wrapper {
          position: relative;
          width: 100%;
          aspect-ratio: 2/3;
          overflow: hidden;
          background: #121218;
        }

        .mood-movie-poster {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s ease;
        }

        .mood-movie-card:hover .mood-movie-poster {
          transform: scale(1.04);
        }

        /* ── Floating Actions ── */
        .mood-movie-actions {
          position: absolute;
          top: 10px;
          right: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          opacity: 0;
          transform: translateX(10px);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 5;
        }

        .mood-movie-card:hover .mood-movie-actions {
          opacity: 1;
          transform: translateX(0);
        }

        .mood-action-btn {
          background: rgba(10, 10, 15, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #fff;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.95rem;
          padding: 0;
        }

        .mood-action-btn:hover {
          background: #ff4b2b;
          border-color: #ff4b2b;
          transform: scale(1.12);
        }

        .mood-action-btn.active {
          color: #ff4b2b;
          border-color: rgba(255, 75, 43, 0.4);
        }

        .mood-action-btn.share-btn:hover {
          background: #2ed573;
          border-color: #2ed573;
        }

        /* ── Hover Details Overlay ── */
        .mood-movie-info-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(10, 10, 15, 0.98) 0%, rgba(10, 10, 15, 0.5) 70%, transparent 100%);
          padding: 20px 12px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          opacity: 0;
          transform: translateY(8px);
          transition: all 0.3s ease;
          z-index: 3;
        }

        .mood-movie-card:hover .mood-movie-info-overlay {
          opacity: 1;
          transform: translateY(0);
        }

        .mood-movie-rating-row {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .rating-badge {
          font-size: 0.72rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }

        .imdb-badge {
          background: rgba(245, 166, 35, 0.15);
          color: #f5a623;
          border: 1px solid rgba(245, 166, 35, 0.25);
        }

        .nova-badge {
          background: rgba(255, 97, 210, 0.15);
          color: #ff61d2;
          border: 1px solid rgba(255, 97, 210, 0.25);
        }

        .mood-movie-genre {
          font-size: 0.7rem;
          color: var(--muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin: 0;
        }

        /* ── Details Bottom Area ── */
        .mood-movie-details-bottom {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: rgba(10, 10, 15, 0.4);
          border-top: 1px solid rgba(255, 255, 255, 0.02);
          flex-grow: 1;
        }

        .mood-movie-title {
          font-size: 0.88rem;
          font-weight: 700;
          color: #fff;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mood-movie-year {
          font-size: 0.75rem;
          color: var(--muted);
        }

        /* ── Toast and Load More ── */
        .share-toast {
          position: absolute;
          top: 45%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(10, 10, 15, 0.96);
          border: 1px solid #2ed573;
          color: #fff;
          padding: 10px 16px;
          border-radius: 24px;
          font-size: 0.75rem;
          font-weight: 700;
          text-align: center;
          z-index: 100;
          box-shadow: 0 8px 24px rgba(46, 213, 115, 0.4);
          pointer-events: none;
          white-space: nowrap;
        }

        .show-more-card {
          flex: 0 0 150px;
          height: 100%;
          min-height: 290px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.01);
          border: 2px dashed rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          align-self: stretch;
        }

        .show-more-card:hover {
          background: rgba(255, 75, 43, 0.04);
          border-color: #ff4b2b;
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 10px 25px rgba(255, 75, 43, 0.15);
        }

        .show-more-icon {
          font-size: 2rem;
          color: #ff4b2b;
          margin-bottom: 10px;
          transition: transform 0.3s ease;
        }

        .show-more-card:hover .show-more-icon {
          transform: translateX(6px);
        }

        .show-more-text {
          font-size: 0.85rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: 0.5px;
        }

        @media (max-width: 768px) {
          .mood-movie-card {
            flex: 0 0 160px;
          }
          .show-more-card {
            flex: 0 0 130px;
            min-height: 230px;
          }
          .mood-movie-actions {
            opacity: 1;
            transform: translateX(0);
          }
          .mood-movie-info-overlay {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
