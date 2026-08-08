import { useState, useEffect, useRef } from 'react'
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

  // Top recommendation for Hero Banner
  const heroMovie = personalized?.recommended?.[0] || trending.daily?.[0]

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

        {/* Hero Featured Recommendation */}
        {!personalizedLoading && heroMovie && (
          <div className="hero-banner glass" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 200px',
            gap: '2.5rem',
            padding: '2.5rem',
            borderRadius: '24px',
            marginBottom: '3rem',
            background: 'linear-gradient(135deg, rgba(255,75,43,0.15) 0%, rgba(10,10,15,0.95) 100%)',
            border: '1px solid rgba(255,75,43,0.25)',
            alignItems: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <span style={{ color: '#ff4b2b', textTransform: 'uppercase', letterSpacing: '2.5px', fontSize: '0.75rem', fontWeight: 800 }}>★ TOP PICK FOR YOU</span>
              <h1 style={{ fontSize: '2.4rem', fontWeight: 900, margin: 0, lineHeight: 1.1, color: '#fff' }}>{heroMovie.title}</h1>
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', fontSize: '0.85rem' }}>
                <span style={{ color: '#ffd700', fontWeight: 700 }}>⭐ {heroMovie.rating || 'N/A'}</span>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                <span style={{ color: 'var(--muted)' }}>📅 {heroMovie.year}</span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                A highly recommended movie based on your watch patterns, similar wishlist tags, and trending user engagement. Click below to explore trailers and full details.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button className="btn btn-primary" onClick={() => navigate(`/movie?title=${encodeURIComponent(heroMovie.title)}`)}>
                  ▶ Explore Movie
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <img src={heroMovie.poster} alt={heroMovie.title}
                style={{ width: '100%', maxWidth: '160px', borderRadius: '14px', boxShadow: '0 12px 35px rgba(0,0,0,0.6)', cursor: 'pointer', transition: 'transform 0.3s' }}
                onClick={() => navigate(`/movie?title=${encodeURIComponent(heroMovie.title)}`)}
                className="hero-image"
                onError={e => e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg'} />
            </div>
          </div>
        )}

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
        .hero-image:hover {
          transform: scale(1.04);
        }
        @media (max-width: 600px) {
          .hero-banner {
            grid-template-columns: 1fr !important;
            padding: 1.5rem !important;
          }
          .hero-image {
            max-width: 120px !important;
          }
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
