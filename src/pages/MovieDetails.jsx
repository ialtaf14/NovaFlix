import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import MovieCard from '../components/MovieCard'
import './MovieDetails.css'

const formatCurrency = (value) => {
  if (!value) return 'N/A'
  if (value >= 1.0e9) {
    return (value / 1.0e9).toFixed(1).replace(/\.0$/, '') + ' B'
  }
  if (value >= 1.0e6) {
    return (value / 1.0e6).toFixed(1).replace(/\.0$/, '') + ' M'
  }
  if (value >= 1.0e3) {
    return (value / 1.0e3).toFixed(1).replace(/\.0$/, '') + ' K'
  }
  return value.toString()
}


const RATING_MEANINGS = {
  10: "Masterpiece",
  9: "Incredible",
  8: "Great",
  7: "Good",
  6: "Okay",
  5: "Average",
  4: "Subpar",
  3: "Bad",
  2: "Awful",
  1: "Abysmal"
}

export default function MovieDetails() {
  const [params] = useSearchParams()
  const title = params.get('title')
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()

  const [movie, setMovie] = useState(null)
  const [loading, setLoading] = useState(true)
  const [wishlist, setWishlist] = useState(user?.wishlist || [])
  const [watched, setWatched] = useState(user?.watched_list || [])
  const [favorites, setFavorites] = useState(user?.favorite_list || [])
  
  // Rating picker modal
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [selectedRating, setSelectedRating] = useState(9)

  // Review Form State
  const [userRating, setUserRating] = useState(10)
  const [userReview, setUserReview] = useState('')
  const [movieReviews, setMovieReviews] = useState([])
  const [submittingReview, setSubmittingReview] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Replies inputs state
  const [replyInputs, setReplyInputs] = useState({}) // username -> replyText

  // Simulated Video Player Modal State
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playerProgress, setPlayerProgress] = useState(0)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [playbackVolume, setPlaybackVolume] = useState(80)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [completedLogged, setCompletedLogged] = useState(false)

  const playbackTimerRef = useRef(null)
  const logIntervalRef = useRef(null)
  const [trailerVideoId, setTrailerVideoId] = useState(null)
  const [dominantColor, setDominantColor] = useState(null)

  // Social/Extension Page Tabs & Recommendations
  const [activeTab, setActiveTab] = useState('overview')
  const [recommendations, setRecommendations] = useState({})
  const [screenshots, setScreenshots] = useState([])
  const [activeScreenshot, setActiveScreenshot] = useState(null)

  // Timed Trailer & Clips States
  const CLIPS = [
    { id: 'official', name: 'Official Trailer', suffix: 'official trailer', duration: '2:28' },
    { id: 'teaser', name: 'Teaser Trailer', suffix: 'teaser trailer', duration: '1:30' },
    { id: 'imax', name: 'IMAX Trailer', suffix: 'imax trailer', duration: '2:11' },
    { id: 'bts', name: 'Behind the Scenes', suffix: 'behind the scenes bts', duration: '3:45' }
  ]
  const [selectedClip, setSelectedClip] = useState(CLIPS[0])
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(false)
  const [isTrailerFullscreen, setIsTrailerFullscreen] = useState(false)
  const [isTrailerMinimized, setIsTrailerMinimized] = useState(false)
  const [trailerQuality, setTrailerQuality] = useState('Auto')
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const [trailerError, setTrailerError] = useState(false)

  const trailerRef = useRef(null)
  const isTrailerPlayingRef = useRef(isTrailerPlaying)

  const getRuntimeMinutes = () => {
    if (!movie?.runtime || movie.runtime === 'N/A') return 120
    const parsed = parseInt(movie.runtime.replace(/\D/g, ''))
    return isNaN(parsed) || parsed <= 0 ? 120 : parsed
  }

  const totalRuntimeMinutes = getRuntimeMinutes()
  const totalRuntimeSeconds = totalRuntimeMinutes * 60

  // Keep a ref to user so we can use it inside the effect
  // without making user a dependency (avoids re-fetching when user object updates after login)
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

  useEffect(() => {
    if (!title) return
    setLoading(true)
    setMovie(null)
    setIsTrailerPlaying(false)
    setIsTrailerMinimized(false)
    setSelectedClip({ id: 'official', name: 'Official Trailer', suffix: 'official trailer', duration: '2:28' })
    setActiveTab('overview')

    let cancelled = false

    const fetchDetails = api.get(`/movies/details?title=${encodeURIComponent(title)}`)
      .catch(async () => {
        const cleaned = title.replace(/[:\-]/g, ' ').replace(/\s+/g, ' ').trim()
        if (cleaned !== title) {
          return api.get(`/movies/details?title=${encodeURIComponent(cleaned)}`)
        }
        throw new Error('Details fetch failed')
      })
      .catch(() => ({
        data: {
          title: title,
          poster: 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg',
          plot: 'Information is being loaded...',
          rating: 'N/A',
          votes: 'N/A',
          year: 'N/A',
          runtime: '120 min',
          genre: 'N/A',
          director: 'N/A',
          cast: [],
          awards: 'N/A'
        }
      }))

    Promise.all([
      fetchDetails,
      api.get(`/users/reviews/${encodeURIComponent(title)}`).catch(() => ({ data: { reviews: [] } })),
      api.get(`/movies/recommend?title=${encodeURIComponent(title)}`).catch(() => ({ data: { recommendations: { by_tags: [] } } })),
      api.get(`/movies/trailer?title=${encodeURIComponent(title)}`).catch(() => ({ data: { video_id: null } })),
      api.get(`/movies/screenshots?title=${encodeURIComponent(title)}`).catch(() => ({ data: { screenshots: [] } }))
    ])
    .then(([detailsRes, reviewsRes, recommendRes, trailerRes, screenshotsRes]) => {
      if (cancelled) return
      setMovie(detailsRes.data)
      setMovieReviews(reviewsRes.data.reviews || [])
      setRecommendations(recommendRes.data?.recommendations || {})
      if (trailerRes.data?.video_id) setTrailerVideoId(trailerRes.data.video_id)
      setScreenshots(screenshotsRes.data?.screenshots || [])
      
      // Auto-populate own review if exists
      const currentUser = userRef.current
      const ownReview = (reviewsRes.data.reviews || []).find(r => r.username === currentUser?.username)
      if (ownReview) {
        setUserRating(ownReview.rating || 10)
        setUserReview(ownReview.review || '')
        setSelectedRating(ownReview.rating || 9)
      }
      
      // Log view activity
      if (currentUser) {
        api.post('/users/view', { title }).catch(() => {})
        api.post('/users/activity/log', {
          type: 'profile_view',
          movie_title: title,
          movie_poster: detailsRes.data.poster
        }).catch(() => {})
      }
    })
    .catch((err) => {
      if (!cancelled) console.error('[MovieDetails] fetch error:', err)
    })
    .finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [title])

  useEffect(() => {
    if (!movie?.poster || movie.poster.includes('fallback')) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = movie.poster;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let r = 0, g = 0, b = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 200) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        setDominantColor(`rgb(${r}, ${g}, ${b})`);
      } catch(e) {}
    };
  }, [movie?.poster]);

  useEffect(() => {
    isTrailerPlayingRef.current = isTrailerPlaying
  }, [isTrailerPlaying])

  useEffect(() => {
    const handleScroll = () => {
      if (!trailerRef.current || !isTrailerPlayingRef.current) return
      
      const rect = trailerRef.current.getBoundingClientRect()
      const isOutOfView = rect.bottom < 0 || rect.top > window.innerHeight
      
      if (isOutOfView) {
        setIsTrailerMinimized(true)
      } else {
        setIsTrailerMinimized(false)
      }
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Sync auth wishlist and favorites
  useEffect(() => {
    if (user) {
      setWishlist(user.wishlist || [])
      setWatched(user.watched_list || [])
      setFavorites(user.favorite_list || [])
    }
  }, [user])

  const isWishlisted = wishlist.includes(title)
  const isWatched = watched.includes(title)
  const isFavorite = favorites.includes(title)

  const toggleWishlist = async () => {
    try {
      if (isWishlisted) {
        const { data } = await api.delete(`/users/wishlist/${encodeURIComponent(title)}`)
        setWishlist(data.wishlist); updateUser({ wishlist: data.wishlist })
      } else {
        const { data } = await api.post('/users/wishlist', { title })
        setWishlist(data.wishlist); updateUser({ wishlist: data.wishlist })
      }
    } catch (_) {}
  }

  const toggleWatched = async () => {
    try {
      if (isWatched) {
        const { data } = await api.delete(`/users/watched/${encodeURIComponent(title)}`)
        setWatched(data.watched_list); updateUser({ watched_list: data.watched_list })
      } else {
        const { data } = await api.post('/users/watched', { title })
        setWatched(data.watched_list); updateUser({ watched_list: data.watched_list })
      }
    } catch (_) {}
  }

  const toggleFavorite = async () => {
    try {
      if (isFavorite) {
        const { data } = await api.delete(`/users/favorites/${encodeURIComponent(title)}`)
        setFavorites(data.favorite_list); updateUser({ favorite_list: data.favorite_list })
      } else {
        const { data } = await api.post('/users/favorites', { title })
        setFavorites(data.favorite_list); updateUser({ favorite_list: data.favorite_list })
      }
    } catch (_) {}
  }

  // --- Search active thread chat to share movie ---
  const handleShareMovie = () => {
    // Navigate to Chat page with sharing parameter in URL query
    navigate(`/messages?share_movie=${encodeURIComponent(title)}`)
  }

  // --- NovaFlix 1-10 Ratings Picker ---
  const handleSaveRatingOnly = async (ratingVal) => {
    try {
      await api.post('/users/review', {
        title,
        rating: ratingVal,
        review: userReview
      })
      setUserRating(ratingVal)
      setSelectedRating(ratingVal)
      setShowRatingModal(false)
      
      // Refresh
      const detailsRes = await api.get(`/movies/details?title=${encodeURIComponent(title)}`)
      setMovie(detailsRes.data)
      const reviewsRes = await api.get(`/users/reviews/${encodeURIComponent(title)}`)
      setMovieReviews(reviewsRes.data.reviews || [])
    } catch (err) {
      alert("Failed to save rating.")
    }
  }

  // --- Write/Edit Review ---
  const handleSubmitReview = async (e) => {
    e.preventDefault()
    if (!user) {
      navigate('/login')
      return
    }
    setSubmittingReview(true)
    try {
      await api.post('/users/review', {
        title,
        rating: parseFloat(userRating),
        review: userReview
      })
      
      // Refetch reviews
      const { data } = await api.get(`/users/reviews/${encodeURIComponent(title)}`)
      setMovieReviews(data.reviews || [])
      alert("⭐ Review submitted successfully!")
    } catch (err) {
      alert("Failed to submit review.")
    } finally {
      setSubmittingReview(false)
    }
  }

  const handleDeleteReview = async () => {
    if (!window.confirm("Are you sure you want to delete your review?")) return
    try {
      await api.delete(`/users/review/${encodeURIComponent(title)}`)
      setUserReview('')
      // Refetch reviews
      const { data } = await api.get(`/users/reviews/${encodeURIComponent(title)}`)
      setMovieReviews(data.reviews || [])
      alert("🗑️ Review deleted!")
    } catch (err) {
      alert("Failed to delete review.")
    }
  }

  const handleLikeReview = async (authorUsername) => {
    if (!user) return navigate('/login')
    try {
      await api.post('/users/review/like', {
        title,
        author_username: authorUsername
      })
      // Refetch reviews
      const { data } = await api.get(`/users/reviews/${encodeURIComponent(title)}`)
      setMovieReviews(data.reviews || [])
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddReply = async (authorUsername) => {
    if (!user) return navigate('/login')
    const replyText = replyInputs[authorUsername]
    if (!replyText || !replyText.trim()) return

    try {
      await api.post('/users/review/reply', {
        title,
        author_username: authorUsername,
        text: replyText.trim()
      })
      
      setReplyInputs(prev => ({ ...prev, [authorUsername]: '' }))
      // Refetch reviews
      const { data } = await api.get(`/users/reviews/${encodeURIComponent(title)}`)
      setMovieReviews(data.reviews || [])
    } catch (err) {
      console.error(err)
    }
  }

  // --- Simulated Video Player Tickers ---
  const handleWatchMovie = () => {
    if (!user) {
      navigate('/login')
      return
    }
    setIsPlayerOpen(true)
    setIsPlaying(true)
    setPlayerProgress(0)
    setPlaybackTime(0)
    setCompletedLogged(false)
    lastLoggedProgress.current = 0
    
    api.post('/users/activity/log', {
      type: 'watch_duration',
      movie_title: title,
      movie_poster: movie.poster,
      metadata: { duration_min: 0, completion_pct: 0 }
    }).catch(() => {})
  }

  useEffect(() => {
    if (isPlayerOpen && isPlaying) {
      playbackTimerRef.current = setInterval(() => {
        setPlaybackTime(prev => {
          const nextTime = Math.min(totalRuntimeSeconds, prev + 10)
          const nextPct = Math.round((nextTime / totalRuntimeSeconds) * 100)
          setPlayerProgress(nextPct)
          return nextTime
        })
      }, 1000)

      logIntervalRef.current = setInterval(() => {
        setPlaybackTime(timeVal => {
          const pct = Math.round((timeVal / totalRuntimeSeconds) * 100)
          const watchMin = Math.round(timeVal / 60)
          
          if (pct > lastLoggedProgress.current) {
            api.post('/users/activity/log', {
              type: 'watch_duration',
              movie_title: title,
              movie_poster: movie.poster,
              metadata: { duration_min: watchMin, completion_pct: pct }
            }).catch(() => {})
            lastLoggedProgress.current = pct
          }
          return timeVal
        })
      }, 5000)
    } else {
      clearInterval(playbackTimerRef.current)
      clearInterval(logIntervalRef.current)
    }

    return () => {
      clearInterval(playbackTimerRef.current)
      clearInterval(logIntervalRef.current)
    }
  }, [isPlayerOpen, isPlaying])

  useEffect(() => {
    if (playerProgress >= 95 && !completedLogged && isPlayerOpen) {
      setCompletedLogged(true)
      setIsPlaying(false)
      
      if (!isWatched) {
        api.post('/users/watched', { title })
          .then(res => {
            setWatched(res.data.watched_list)
            updateUser({ watched_list: res.data.watched_list })
          })
          .catch(console.error)
      }

      api.post('/users/activity/log', {
        type: 'watch_completion',
        movie_title: title,
        movie_poster: movie.poster,
        metadata: { completion_pct: 100 }
      })
      .then(() => {
        alert("🎉 Movie completed! Added to your Watched list.")
      })
      .catch(console.error)
    }
  }, [playerProgress, completedLogged, isPlayerOpen])

  const handleClosePlayer = () => {
    setIsPlayerOpen(false)
    setIsPlaying(false)
    if (playerProgress < 95) {
      const finalWatchMin = Math.round(playbackTime / 60)
      api.post('/users/activity/log', {
        type: 'watch_duration',
        movie_title: title,
        movie_poster: movie.poster,
        metadata: { duration_min: finalWatchMin, completion_pct: playerProgress, status: 'paused' }
      }).catch(() => {})
    }
  }

  const handleScrubChange = (e) => {
    const nextPct = parseInt(e.target.value)
    const nextTime = Math.round((nextPct / 100) * totalRuntimeSeconds)
    setPlayerProgress(nextPct)
    setPlaybackTime(nextTime)
  }

  const formatPlaybackTimer = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  if (loading) return (
    <div className="page"><div className="container">
      <div className="skeleton" style={{ height: 400, borderRadius: 18, marginBottom: '2rem' }} />
    </div></div>
  )

  if (!movie) return <div className="page"><div className="container"><p>Movie not found.</p></div></div>

  return (
    <div className="page movie-details-container fade-up" style={{ 
      '--adaptive-theme': dominantColor || '#8b2be2',
      '--adaptive-theme-alpha': dominantColor ? dominantColor.replace('rgb', 'rgba').replace(')', ', 0.3)') : 'rgba(139, 43, 226, 0.3)',
      '--adaptive-bg': dominantColor ? dominantColor.replace('rgb', 'rgba').replace(')', ', 0.05)') : 'rgba(139, 43, 226, 0.05)'
    }}>
      {/* Background Poster Blur Layer */}
      {movie.poster && (
        <div className="movie-details-backdrop" style={{ backgroundImage: `url(${movie.poster})` }}></div>
      )}
      
      <div className="container" style={{ position: 'relative', zIndex: 2 }}>
        
        {/* Back button */}
        <button className="back-arrow-btn" onClick={() => navigate(-1)} title="Go Back">
          ←
        </button>

        {/* Movie Info Panel */}
        <div className="movie-details-hero">
          <div className="details-left">
            <img src={movie.poster} alt={movie.title}
              className="movie-details-poster"
              onError={e => e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg'} />
          </div>

          <div className="details-right">
            <h1 className="movie-details-title">{movie.title}</h1>

            <div className="ratings-row">
              {movie.rating !== 'N/A' && (
                <span className="rating-badge imdb">⭐ IMDb: {movie.rating}</span>
              )}
              <span className="rating-badge novaflix" onClick={() => setShowRatingModal(true)} style={{ cursor: 'pointer' }}>
                🟣 NovaFlix: {movie.novaflix_rating !== 'N/A' ? movie.novaflix_rating : 'Rate'}
              </span>
            </div>

            <div className="meta-row">
              <span className="meta-badge">📅 {movie.year}</span>
              <span className="meta-badge">⏱ {movie.runtime}</span>
              <span className="meta-badge">🌍 {movie.language}</span>
            </div>

            <p className="movie-plot-desc">{movie.plot}</p>

            <div className="credits-row">
              {movie.genre && <span><strong>Genre:</strong> {movie.genre}</span>}
              {movie.director && <span><strong>Director:</strong> {movie.director}</span>}
            </div>

            {/* Actions Panel */}
            <div className="movie-actions-row">
              <button className="btn-action-primary btn-watch-trailer-action" onClick={() => {
                setActiveTab('trailers')
                setIsTrailerPlaying(true)
                setTimeout(() => {
                  trailerRef.current?.scrollIntoView({ behavior: 'smooth' })
                }, 100)
              }}>
                🎬 Watch Trailer
              </button>
              
              <button className={`btn-action-outline ${isWishlisted ? 'active' : ''}`} onClick={toggleWishlist}>
                {isWishlisted ? '💖 Wishlisted' : '🤍 Wishlist'}
              </button>

              <button className={`btn-action-outline btn-favorite-heart ${isFavorite ? 'active' : ''}`} onClick={toggleFavorite}>
                <span className="heart-icon">❤️</span> {isFavorite ? 'Favorited' : 'Favorite'}
              </button>

              <button className={`btn-action-outline ${isWatched ? 'active' : ''}`} onClick={toggleWatched}>
                {isWatched ? '✅ Watched' : '👁 Mark Watched'}
              </button>

              <button className="btn-action-outline" onClick={handleShareMovie}>
                📤 Share Chat
              </button>
            </div>

            {movie.providers && (
              <div className="provider-badge-card glass">
                <img src={movie.providers.logo} alt={movie.providers.name} />
                <span>Streaming on <strong>{movie.providers.name}</strong></span>
              </div>
            )}

            <div className="stream-search-row">
              <span className="stream-search-label">🔍 Search on:</span>
              <div className="stream-search-buttons">
                <a href={`https://www.netflix.com/search?q=${encodeURIComponent(movie.title)}`} target="_blank" rel="noreferrer" className="stream-btn netflix">Netflix</a>
                <a href={`https://www.hotstar.com/in/explore?search_query=${encodeURIComponent(movie.title)}`} target="_blank" rel="noreferrer" className="stream-btn hotstar">Hotstar</a>
                <a href={`https://www.primevideo.com/search/ref=atv_sr_sug_1?phrase=${encodeURIComponent(movie.title)}`} target="_blank" rel="noreferrer" className="stream-btn prime">Prime</a>
                <a href={`https://play.max.com/search?q=${encodeURIComponent(movie.title)}`} target="_blank" rel="noreferrer" className="stream-btn max">Max</a>
                <a href={`https://tv.apple.com/us/search?q=${encodeURIComponent(movie.title)}`} target="_blank" rel="noreferrer" className="stream-btn apple">Apple TV</a>
                <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' movie')}`} target="_blank" rel="noreferrer" className="stream-btn youtube">YouTube</a>
              </div>
            </div>
          </div>
        </div>

        {/* TAB ROW */}
        <div className="movie-details-tabs-row glass">
          <button 
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} 
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`tab-btn ${activeTab === 'cast' ? 'active' : ''}`} 
            onClick={() => setActiveTab('cast')}
          >
            Cast
          </button>
          <button 
            className={`tab-btn ${activeTab === 'reviews' ? 'active' : ''}`} 
            onClick={() => setActiveTab('reviews')}
          >
            Reviews ({movieReviews.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'trailers' ? 'active' : ''}`} 
            onClick={() => setActiveTab('trailers')}
          >
            Trailers
          </button>
          <button 
            className={`tab-btn ${activeTab === 'screenshots' ? 'active' : ''}`} 
            onClick={() => setActiveTab('screenshots')}
          >
            Screenshots
          </button>
          <button 
            className={`tab-btn ${activeTab === 'more-like-this' ? 'active' : ''}`} 
            onClick={() => setActiveTab('more-like-this')}
          >
            More Like This
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'overview' && (
          <div className="tab-pane-content">
            <OverviewContent movie={movie} navigate={navigate} />
          </div>
        )}

        {activeTab === 'cast' && (
          <CastSection cast={movie.cast} />
        )}

        {activeTab === 'reviews' && (
          <div className="reviews-tab-pane fade-up">
            {/* REVIEWS & RATINGS SYSTEM */}
            <div className="reviews-section-layout">
              
              {/* Form write review */}
              <div className="review-form-card glass">
                <h3>Write Review</h3>
                <form onSubmit={handleSubmitReview}>
                  
                  {/* Rating Star Selection */}
                  <div className="review-rating-selector">
                    <span className="rating-label">Rating:</span>
                    <div className="star-rating-row">
                      {[1,2,3,4,5,6,7,8,9,10].map(val => (
                        <span 
                          key={val} 
                          className={`star-digit ${userRating >= val ? 'active' : ''}`}
                          onClick={() => setUserRating(val)}
                        >
                          ★
                        </span>
                      ))}
                      <span className="rating-meaning-label">{userRating} - {RATING_MEANINGS[userRating]}</span>
                    </div>
                  </div>

                  {/* Textarea review */}
                  <div className="review-text-area-wrap">
                    <textarea
                      className="review-textarea"
                      placeholder="What did you think of this movie? Write a review..."
                      value={userReview}
                      maxLength={500}
                      onChange={e => setUserReview(e.target.value)}
                      required
                    />
                    
                    <div className="review-text-footer">
                      <span className="char-count">{userReview.length} / 500</span>
                      
                      {/* Emoji selector */}
                      <div className="emoji-select-container">
                        <button type="button" className="emoji-trigger" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                          😊 Add Emoji
                        </button>
                        {showEmojiPicker && (
                          <div className="emoji-picker-box glass">
                            {['🔥', '😍', '👏', '🎬', '🏆', '🙌', '🍿', '🌌', '🤯', '😭', '😴', '👎'].map(emoji => (
                              <span key={emoji} className="emoji-item" onClick={() => {
                                setUserReview(p => p + emoji)
                                setShowEmojiPicker(false)
                              }}>{emoji}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="review-submit-actions">
                    <button type="submit" className="btn-action-primary" disabled={submittingReview}>
                      {submittingReview ? 'Submitting...' : 'Submit Review'}
                    </button>
                    {movieReviews.some(r => r.username === user?.username) && (
                      <button type="button" className="btn-delete-review" onClick={handleDeleteReview}>
                        Delete Review
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Reviews list panel */}
              <div className="reviews-list-card">
                <h3>Reviews ({movieReviews.length})</h3>
                <div className="reviews-list-container">
                  {movieReviews.length === 0 ? (
                    <div className="empty-reviews-state">No cinephile reviews yet. Write yours above!</div>
                  ) : (
                    movieReviews.map((rev, index) => (
                      <div key={index} className="review-item-card glass">
                        <div className="review-item-header">
                          <div className="review-user-info" onClick={() => navigate(`/user/${rev.username}`)}>
                            <img src={rev.photo_url} alt={rev.username} className="review-user-avatar"
                              onError={e => e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'} />
                            <div>
                              <div className="review-user-name">{rev.name || rev.username}</div>
                              <div className="review-user-handle">@{rev.username}</div>
                            </div>
                          </div>
                          
                          <div className="review-item-rating">
                            <span className="rating-num">🟣 {rev.rating}</span>
                            <span className="rating-meaning">{rev.rating_text}</span>
                          </div>
                        </div>

                        <p className="review-item-text">"{rev.review}"</p>
                        
                        <div className="review-item-footer">
                          <span className="review-item-time">Reviewed {timeAgo(rev.timestamp * 1000)}</span>
                          
                          <div className="review-actions-row">
                            <button className={`review-like-btn ${rev.likes?.includes(user?.username) ? 'liked' : ''}`} onClick={() => handleLikeReview(rev.username)}>
                              ❤️ {rev.likes?.length || 0}
                            </button>
                          </div>
                        </div>

                        {/* Replies Panel */}
                        <div className="review-replies-section">
                          {rev.replies?.length > 0 && (
                            <div className="replies-list">
                              {rev.replies.map(reply => (
                                <div key={reply.id} className="reply-item">
                                  <img src={reply.photo_url} alt={reply.username} className="reply-avatar" />
                                  <div className="reply-body">
                                    <span className="reply-user"><strong>{reply.name || reply.username}</strong> @{reply.username}</span>
                                    <p className="reply-text">{reply.text}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Add reply input */}
                          {user && (
                            <div className="reply-input-row">
                              <input
                                type="text"
                                className="reply-text-input"
                                placeholder="Add a reply..."
                                value={replyInputs[rev.username] || ''}
                                onChange={e => setReplyInputs(prev => ({ ...prev, [rev.username]: e.target.value }))}
                                onKeyPress={e => e.key === 'Enter' && handleAddReply(rev.username)}
                              />
                              <button className="reply-send-btn" onClick={() => handleAddReply(rev.username)}>
                                Reply
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trailers' && (
          <div className="tab-pane-content">
            <div className="watch-trailer-section" ref={trailerRef}>
              <h2 className="section-title">▶ Watch Trailer</h2>
              
              <div className="trailer-section-wrapper">
                {isTrailerMinimized && <div className="trailer-placeholder" />}
                
                <div className={`trailer-player-container ${isTrailerMinimized ? 'minimized' : ''} ${isTrailerFullscreen ? 'fullscreen' : ''} glass`}>
                  <div className="trailer-player-header">
                    <span className="trailer-player-title">{movie.title} - {selectedClip.name}</span>
                    <div className="trailer-player-actions">
                      {isTrailerMinimized ? (
                        <button className="player-btn" onClick={() => setIsTrailerMinimized(false)} title="Restore Player">🔳</button>
                      ) : (
                        <button className="player-btn" onClick={() => setIsTrailerMinimized(true)} title="Minimize (PIP)">🗕</button>
                      )}
                      <button className="player-btn" onClick={() => setIsTrailerFullscreen(!isTrailerFullscreen)} title={isTrailerFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                        {isTrailerFullscreen ? '🗗' : '🗖'}
                      </button>
                      {isTrailerPlaying && (
                        <button className="player-btn close-btn" onClick={() => {
                          setIsTrailerPlaying(false)
                          setIsTrailerMinimized(false)
                        }} title="Close Video">×</button>
                      )}
                    </div>
                  </div>

                  <div className="trailer-video-area">
                    {!isTrailerPlaying ? (
                      <div className="trailer-preview-thumbnail" onClick={() => setIsTrailerPlaying(true)}>
                        <div className="trailer-preview-blur-bg" style={{ backgroundImage: `url(${movie.poster})` }} />
                        <div className="trailer-preview-content">
                          <div className="trailer-play-btn">▶</div>
                          <span className="trailer-preview-label">Play {selectedClip.name}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="trailer-iframe-wrapper">
                        {trailerVideoId ? (
                          <iframe
                            src={`https://www.youtube-nocookie.com/embed/${trailerVideoId}?autoplay=1&rel=0${trailerQuality === '1080p' ? '&vq=hd1080' : trailerQuality === '720p' ? '&vq=hd720' : trailerQuality === '480p' ? '&vq=large' : ''}`}
                            title={`${movie.title} Trailer`}
                            frameBorder="0"
                            allow="autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                            className="trailer-iframe"
                          />
                        ) : (
                          <div className="trailer-fallback">
                            <p>⚠️ Trailer unavailable. Try searching on <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' ' + selectedClip.suffix)}`} target="_blank" rel="noopener noreferrer">YouTube</a>.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="trailer-player-footer">
                    <span className="trailer-duration-badge">⏱ Duration: {selectedClip.duration}</span>
                    
                    <div className="trailer-quality-selector-wrap">
                      <button className="quality-trigger-btn" onClick={() => setShowQualityMenu(!showQualityMenu)}>
                        ⚙️ Quality: {trailerQuality}
                      </button>
                      {showQualityMenu && (
                        <div className="quality-dropdown-menu glass">
                          {['Auto', '1080p', '720p', '480p'].map(q => (
                            <button
                              key={q}
                              className={`quality-item-btn ${trailerQuality === q ? 'active' : ''}`}
                              onClick={() => {
                                setTrailerQuality(q)
                                setShowQualityMenu(false)
                              }}
                            >
                              {q === 'Auto' ? 'Auto' : `${q} ${q === '480p' ? '(SD)' : '(HD)'}`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Removed More Trailers & Clips Section */}
            </div>
          </div>
        )}

        {activeTab === 'screenshots' && (
          <div className="details-section screenshots-tab-section fade-up">
            <h2 className="section-title">🖼️ Movie Stills & Scenes</h2>
            {(!screenshots || screenshots.length === 0) ? (
              <p className="empty-state-text">No screenshots found for this movie.</p>
            ) : (
              <div className="screenshots-grid">
                {screenshots.map((url, i) => (
                  <div key={i} className="screenshot-item" onClick={() => setActiveScreenshot(url)}>
                    <img 
                      src={url} 
                      alt={`Scene ${i + 1}`} 
                      className="screenshot-img"
                      loading="lazy"
                    />
                    <div className="screenshot-hover-overlay">
                      <span>View Fullscreen</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'more-like-this' && (
          <div className="details-section recommendations-tab-section fade-up">
            <h2 className="section-title">🎬 More Like This</h2>
            {(!recommendations.by_tags || recommendations.by_tags.length === 0) ? (
              <p className="empty-state-text">No recommendations available for this movie.</p>
            ) : (
              <div className="recommendations-grid">
                {recommendations.by_tags.map(rec => (
                  <MovieCard
                    key={rec.title}
                    {...rec}
                  />
                ))}
              </div>
            )}
            
            {recommendations.by_studio && recommendations.by_studio.length > 0 && (
              <>
                <h2 className="section-title" style={{ marginTop: '3rem' }}>🏢 From the Same Studio</h2>
                <div className="recommendations-grid">
                  {recommendations.by_studio.map(rec => (
                    <MovieCard
                      key={rec.title}
                      {...rec}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>

      {/* --- NOVAFLIX 1-10 RATING SELECTOR MODAL --- */}
      {showRatingModal && (
        <div className="rating-picker-modal-overlay" onClick={() => setShowRatingModal(false)}>
          <div className="rating-picker-modal glass" onClick={e => e.stopPropagation()}>
            <div className="picker-modal-header">
              <h3>Purple Rating System</h3>
              <button className="picker-close-btn" onClick={() => setShowRatingModal(false)}>×</button>
            </div>
            
            <div className="picker-modal-desc">
              Rate <strong>{movie.title}</strong> on a scale from 1 (Abysmal) to 10 (Masterpiece):
            </div>

            <div className="picker-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                <button 
                  key={num} 
                  className={`picker-num-btn ${selectedRating === num ? 'active' : ''}`}
                  onClick={() => handleSaveRatingOnly(num)}
                >
                  <span className="num-val">{num}</span>
                  <span className="num-meaning">{RATING_MEANINGS[num]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Removed Simulated Movie Player Modal */}

      {/* Lightbox Modal for Screenshots */}
      {activeScreenshot && (
        <div className="screenshot-lightbox" onClick={() => setActiveScreenshot(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={activeScreenshot} alt="Movie Scene Full" className="lightbox-img" />
            <button className="lightbox-close" onClick={() => setActiveScreenshot(null)}>×</button>
          </div>
        </div>
      )}

    </div>
  )
}

function OverviewContent({ movie, navigate }) {
  const [directorData, setDirectorData] = useState(null)
  const [directorMovies, setDirectorMovies] = useState([])

  useEffect(() => {
    if (!movie.director || movie.director === 'N/A') return
    api.get(`/movies/director?name=${encodeURIComponent(movie.director)}`)
      .then(res => {
        setDirectorData(res.data.director)
        setDirectorMovies(res.data.movies || [])
      })
      .catch(() => {})
  }, [movie.director])

  const awardsList = movie.awards && movie.awards !== 'N/A'
    ? movie.awards.split(/[.;]/).filter(s => s.trim()).map(s => s.trim())
    : []

  return (
    <>
      {/* Overview Info Cards */}
      <div className="overview-info-grid">
        {movie.director && movie.director !== 'N/A' && (
          <div className="overview-info-card glass director-card" onClick={() => navigate(`/actor?name=${encodeURIComponent(movie.director)}`)}>
            {directorData?.image && directorData.image !== 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png' ? (
              <img src={directorData.image} alt={movie.director} className="director-card-photo"
                onError={e => e.target.style.display = 'none'} />
            ) : (
              <span className="overview-info-icon">🎬</span>
            )}
            <span className="overview-info-label">Director</span>
            <span className="overview-info-value">{movie.director}</span>
          </div>
        )}
        {movie.budget > 0 && (
          <div className="overview-info-card glass">
            <span className="overview-info-icon">💰</span>
            <span className="overview-info-label">Budget</span>
            <span className="overview-info-value">${formatCurrency(movie.budget)}</span>
          </div>
        )}
        {movie.revenue > 0 && (
          <div className="overview-info-card glass">
            <span className="overview-info-icon">💵</span>
            <span className="overview-info-label">Box Office</span>
            <span className="overview-info-value">${formatCurrency(movie.revenue)}</span>
          </div>
        )}
        {movie.franchise && (
          <div className="overview-info-card glass">
            <span className="overview-info-icon">📦</span>
            <span className="overview-info-label">Franchise</span>
            <span className="overview-info-value">{movie.franchise}</span>
          </div>
        )}
      </div>

      {/* Awards Section */}
      {awardsList.length > 0 && (
        <div className="details-section fade-up">
          <h2 className="section-title">🏆 Awards</h2>
          <div className="awards-list">
            {awardsList.map((award, i) => (
              <div key={i} className="award-item glass">
                <span className="award-bullet">🏅</span>
                <span className="award-text">{award}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Franchise Collection Section */}
      {movie.franchise_movies && movie.franchise_movies.length > 0 && (
        <div className="details-section fade-up">
          <h2 className="section-title">📦 {movie.franchise} Collection</h2>
          <div className="recommendations-grid">
            {movie.franchise_movies.map(m => (
              <MovieCard
                key={m.title}
                {...m}
              />
            ))}
          </div>
        </div>
      )}

      {/* Director's Top Movies */}
      {directorMovies.length > 0 && (
        <div className="details-section fade-up">
          <h2 className="section-title">🎬 More from {movie.director}</h2>
          <div className="recommendations-grid">
            {directorMovies.map(m => (
              <MovieCard
                key={m.title}
                {...m}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function CastSection({ cast }) {
  const [actors, setActors] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let names = []
    if (Array.isArray(cast)) {
      names = cast.slice(0, 12)
    } else if (typeof cast === 'string') {
      names = cast.split(',').map(n => n.trim()).filter(Boolean).slice(0, 12)
    }

    if (!names.length) {
      setLoading(false)
      return
    }

    api.get(`/movies/actors/batch?names=${encodeURIComponent(names.join(','))}`)
      .then(res => {
        const data = res.data.actors || {}
        setActors(names.map(name => ({
          name,
          details: data[name] || {}
        })))
      })
      .catch(() => setActors(names.map(name => ({ name, details: {} }))))
      .finally(() => setLoading(false))
  }, [cast])

  if (loading) return (
    <div className="details-section fade-up">
      <h2 className="section-title">👥 Cast</h2>
      <div className="cast-grid">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="cast-card-skeleton glass" />
        ))}
      </div>
    </div>
  )

  if (!actors.length) return (
    <div className="details-section fade-up">
      <h2 className="section-title">👥 Cast</h2>
      <p className="empty-state-text">No cast details available.</p>
    </div>
  )

  return (
    <div className="details-section fade-up">
      <h2 className="section-title">👥 Cast</h2>
      <div className="cast-grid">
        {actors.map(actor => (
          <div
            key={actor.name}
            className="cast-card glass"
            onClick={() => navigate(`/actor?name=${encodeURIComponent(actor.name)}`)}
          >
            <img
              src={actor.details.image || 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'}
              alt={actor.name}
              className="cast-card-photo"
              onError={e => e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'}
            />
            <div className="cast-card-info">
              <span className="cast-card-name">{actor.name}</span>
              {actor.details.dob && actor.details.dob !== 'N/A' && (
                <span className="cast-card-dob">{actor.details.dob}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  let interval = Math.floor(seconds / 31536000)
  if (interval >= 1) return interval + "y ago"
  interval = Math.floor(seconds / 2592000)
  if (interval >= 1) return interval + "mo ago"
  interval = Math.floor(seconds / 86400)
  if (interval >= 1) return interval + "d ago"
  interval = Math.floor(seconds / 3600)
  if (interval >= 1) return interval + "h ago"
  interval = Math.floor(seconds / 60)
  if (interval >= 1) return interval + "m ago"
  return "just now"
}
