import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import BGMPlayer from '../services/BGMPlayer'
import SpotifySticker from '../components/SpotifySticker'
import './StoriesViewer.css'

const FONT_STYLES = [
  { id: 'modern', name: 'Modern', style: { fontFamily: '"Inter", sans-serif' } },
  { id: 'classic', name: 'Classic', style: { fontFamily: '"Playfair Display", serif' } },
  { id: 'neon', name: 'Neon', style: { fontFamily: '"Comfortaa", sans-serif', textShadow: '0 0 10px rgba(255,97,210,0.8)' } },
  { id: 'handwriting', name: 'Handwriting', style: { fontFamily: '"Caveat", cursive' } }
]

const isVideoUrl = (url) => {
  if (!url) return false;
  return url.includes('video/') || 
         url.includes('.mp4') || 
         url.includes('.mov') || 
         url.includes('.webm') || 
         url.includes('.ogg') ||
         url.startsWith('data:video/');
};

const formatStoryTimeAgo = (timestamp) => {
  if (!timestamp) return 'now'
  const mins = Math.floor((Date.now() / 1000 - timestamp) / 60)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h`
}

export default function StoriesViewer() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const targetUser = params.get('user')
  const { user } = useAuthStore()

  const [groupedStories, setGroupedStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [userIndex, setUserIndex] = useState(0) // Current active user circle index
  const [storyIndex, setStoryIndex] = useState(0) // Current active story slide index
  
  // Interactions State
  const [replyText, setReplyText] = useState('')
  const [showViewers, setShowViewers] = useState(false)
  const [progressVal, setProgressVal] = useState(0)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [activeStickerTooltip, setActiveStickerTooltip] = useState(null)
  const [isPaused, setIsPaused] = useState(false)       // hold-to-pause (IG style)
  const [burstEmoji, setBurstEmoji] = useState(null)     // reaction burst animation
  const [toast, setToast] = useState(null)               // non-blocking toast

  const showToast = (text) => {
    setToast(text)
    clearTimeout(showToast._t)
    showToast._t = setTimeout(() => setToast(null), 2200)
  }

  const holdTimerRef = useRef(null)
  const wasHeldRef = useRef(false)
  
  const timerRef = useRef(null)
  const progressIntervalRef = useRef(null)
  const lastStoryIdRef = useRef(null)
  const audioPlayerRef = useRef(null)

  useEffect(() => {
    fetchStories()
  }, [])

  const fetchStories = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/social/stories')
      setGroupedStories(data)
      
      // Locate the user index if passed in query
      if (targetUser) {
        const idx = data.findIndex(g => g.username === targetUser)
        if (idx !== -1) {
          setUserIndex(idx)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const activeGroup = groupedStories[userIndex]
  const activeStories = activeGroup?.stories || []
  const activeStory = activeStories[storyIndex]

  // Timer intervals for progress mapping
  useEffect(() => {
    const paused = showMoreOptions || showDeleteConfirm || activeStickerTooltip || isPaused || showViewers
    if (activeStory && !paused) {
      if (lastStoryIdRef.current !== activeStory.id) {
        setProgressVal(0)
        lastStoryIdRef.current = activeStory.id
        // Mark as seen/logged
        api.post(`/social/stories/${activeStory.id}/view`).catch(() => {})
      }

      const duration = 5000
      const tick = 50
      const increment = (tick / duration) * 100
      
      const currentProgress = progressVal
      const remainingProgress = 100 - currentProgress
      const remainingDuration = (remainingProgress / 100) * duration

      progressIntervalRef.current = setInterval(() => {
        setProgressVal(prev => {
          const next = prev + increment
          if (next >= 100) {
            clearInterval(progressIntervalRef.current)
            return 100
          }
          return next
        })
      }, tick)

      timerRef.current = setTimeout(() => {
        handleNextStory()
      }, remainingDuration)
    }

    return () => {
      clearTimeout(timerRef.current)
      clearInterval(progressIntervalRef.current)
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
      }
    }
  }, [userIndex, storyIndex, groupedStories, showMoreOptions, showDeleteConfirm, activeStickerTooltip, isPaused, showViewers])

  // Play Spotify music if available in the current active story
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause()
      audioPlayerRef.current = null
    }

    if (activeStory?.type === 'custom_editor' && activeStory.overlays && !showMoreOptions && !showDeleteConfirm && !activeStickerTooltip) {
      const musicOverlay = activeStory.overlays.find(o => o.type === 'music')
      if (musicOverlay && musicOverlay.music?.previewUrl) {
        audioPlayerRef.current = new Audio(musicOverlay.music.previewUrl)
        audioPlayerRef.current.volume = 0.5
        audioPlayerRef.current.play().catch(e => console.error("Story music play error", e))
      }
    }
    
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current = null
      }
    }
  }, [activeStory, showMoreOptions, showDeleteConfirm, activeStickerTooltip])

  // BGM playback triggers
  useEffect(() => {
    if (activeStory && !showMoreOptions && !showDeleteConfirm && !activeStickerTooltip) {
      const movieOverlay = activeStory.overlays?.find(o => o.type === 'movie');
      const movieTitle = movieOverlay ? movieOverlay.movie.title : activeStory.movie_title;
      if (movieTitle) {
        BGMPlayer.play(movieTitle);
      } else {
        BGMPlayer.stop();
      }
    } else {
      BGMPlayer.stop();
    }
  }, [activeStory, showMoreOptions, showDeleteConfirm, activeStickerTooltip]);

  // Clean up BGM on unmount
  useEffect(() => {
    return () => {
      BGMPlayer.stop();
    };
  }, []);

  const handleStickerClick = (overlay) => {
    if (overlay.type === 'movie') {
      setActiveStickerTooltip({
        id: overlay.id,
        text: 'View this Movie',
        url: `/movie?title=${encodeURIComponent(overlay.movie.title)}`,
        x: (overlay.x / 450) * 100,
        y: (overlay.y / 800) * 100 - 12
      });
    } else if (overlay.type === 'mention') {
      setActiveStickerTooltip({
        id: overlay.id,
        text: 'View Profile',
        url: `/user/${encodeURIComponent(overlay.username)}`,
        x: (overlay.x / 450) * 100,
        y: (overlay.y / 800) * 100 - 6
      });
    }
  };

  const handleNextStory = () => {
    if (storyIndex < activeStories.length - 1) {
      setStoryIndex(prev => prev + 1)
    } else if (userIndex < groupedStories.length - 1) {
      // Go to next user circle
      setUserIndex(prev => prev + 1)
      setStoryIndex(0)
    } else {
      // Finished all stories
      navigate('/discover')
    }
  }

  const handlePrevStory = () => {
    if (storyIndex > 0) {
      setStoryIndex(prev => prev - 1)
    } else if (userIndex > 0) {
      // Go to previous user circle
      setUserIndex(prev => prev - 1)
      // Start from the last story of previous user
      const prevGroup = groupedStories[userIndex - 1]
      setStoryIndex(prevGroup.stories.length - 1)
    } else {
      // At the very beginning, do nothing or exit
      navigate('/discover')
    }
  }

  const handleLikeStory = async () => {
    if (!activeStory) return
    try {
      const { data } = await api.post(`/social/stories/${activeStory.id}/like`)
      setGroupedStories(prev => prev.map((g, uIdx) => {
        if (uIdx === userIndex) {
          return {
            ...g,
            stories: g.stories.map((s, sIdx) => 
              sIdx === storyIndex ? { ...s, likes: data.likes } : s
            )
          }
        }
        return g
      }))
    } catch (_) {}
  }

  const handleReactStory = async (emoji) => {
    if (!activeStory) return
    // Instant feedback: emoji burst animation
    setBurstEmoji({ emoji, key: Date.now() })
    setTimeout(() => setBurstEmoji(null), 1200)
    try {
      const { data } = await api.post(`/social/stories/${activeStory.id}/react`, { emoji })
      setGroupedStories(prev => prev.map((g, uIdx) => {
        if (uIdx === userIndex) {
          return {
            ...g,
            stories: g.stories.map((s, sIdx) =>
              sIdx === storyIndex ? { ...s, reactions: data.reactions } : s
            )
          }
        }
        return g
      }))
      showToast(`${emoji} Reaction sent to @${activeGroup.username}`)
    } catch (_) {}
  }

  const handleSendReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim() || !activeStory) return
    try {
      await api.post(`/social/stories/${activeStory.id}/reply`, { text: replyText.trim() })
      setReplyText('')
      showToast('💬 Reply sent as DM')
    } catch (_) {
      showToast('⚠️ Failed to send reply')
    }
  }

  const handleDeleteStory = async () => {
    try {
      await api.delete(`/social/stories/${activeStory.id}`)
      showToast("🗑️ Story deleted")
      
      setShowDeleteConfirm(false)
      setShowMoreOptions(false)
      
      const updatedGrouped = groupedStories.map((g, uIdx) => {
        if (uIdx === userIndex) {
          return {
            ...g,
            stories: g.stories.filter(s => s.id !== activeStory.id)
          }
        }
        return g
      }).filter(g => g.stories.length > 0)

      if (updatedGrouped.length === 0) {
        setGroupedStories([])
        navigate('/discover')
        return
      }

      // Check remaining stories for this user
      const currentGroup = updatedGrouped[userIndex]
      if (!currentGroup) {
        setUserIndex(prev => Math.max(0, prev - 1))
        setStoryIndex(0)
        setGroupedStories(updatedGrouped)
      } else {
        setGroupedStories(updatedGrouped)
        if (storyIndex >= currentGroup.stories.length) {
          setStoryIndex(currentGroup.stories.length - 1)
        }
      }
    } catch (err) {
      console.error(err)
      showToast("⚠️ Failed to delete story")
    }
  }

  if (loading) {
    return (
      <div className="page stories-viewer-page loading-screen">
        <div className="spinner"></div> Loading stories...
      </div>
    )
  }

  if (!activeStory) {
    return (
      <div className="page stories-viewer-page empty-screen">
        <h3>No active stories found</h3>
        <button className="btn btn-primary" onClick={() => navigate('/discover')}>Back to Discover</button>
      </div>
    )
  }

  const isLiked = activeStory.likes?.includes(user?.username)
  const isOwnStory = activeStory.username === user?.username

  return (
    <div className="stories-viewer-fullscreen">
      
      {/* Black backdrop click triggers — hold to pause (IG style) */}
      <div className="stories-left-tap"
        onPointerDown={() => { wasHeldRef.current = false; holdTimerRef.current = setTimeout(() => { wasHeldRef.current = true; setIsPaused(true) }, 220) }}
        onPointerUp={() => { clearTimeout(holdTimerRef.current); if (wasHeldRef.current) { setIsPaused(false) } }}
        onPointerLeave={() => { clearTimeout(holdTimerRef.current); if (wasHeldRef.current) setIsPaused(false) }}
        onClick={(e) => {
        if (wasHeldRef.current) return;
        if (activeStickerTooltip) {
          e.stopPropagation();
          setActiveStickerTooltip(null);
        } else {
          handlePrevStory();
        }
      }} />
      <div className="stories-right-tap"
        onPointerDown={() => { wasHeldRef.current = false; holdTimerRef.current = setTimeout(() => { wasHeldRef.current = true; setIsPaused(true) }, 220) }}
        onPointerUp={() => { clearTimeout(holdTimerRef.current); if (wasHeldRef.current) { setIsPaused(false) } }}
        onPointerLeave={() => { clearTimeout(holdTimerRef.current); if (wasHeldRef.current) setIsPaused(false) }}
        onDoubleClick={() => { if (!isOwnStory) { handleLikeStory(); setBurstEmoji({ emoji: '❤️', key: Date.now() }); setTimeout(() => setBurstEmoji(null), 1200) } }}
        onClick={(e) => {
        if (wasHeldRef.current) return;
        if (activeStickerTooltip) {
          e.stopPropagation();
          setActiveStickerTooltip(null);
        } else {
          handleNextStory();
        }
      }} />

      <div className="story-frame-container glass" onClick={() => { if (activeStickerTooltip) setActiveStickerTooltip(null); }}>
        
        {/* Progress bars ticks row */}
        <div className="story-progress-row">
          {activeStories.map((s, idx) => {
            let widthPct = 0
            if (idx < storyIndex) widthPct = 100
            else if (idx === storyIndex) widthPct = progressVal

            return (
              <div key={idx} className="story-progress-bar-track">
                <div className="story-progress-bar-fill" style={{ width: `${widthPct}%` }} />
              </div>
            )
          })}
        </div>

        {/* Story User Header */}
        <div className="story-user-header">
          <div className="story-profile-details" onClick={() => navigate(`/user/${activeStory.username}`)}>
            <img src={activeStory.photo_url} alt={activeGroup.username} />
            <div>
              <span className="story-group-name"><strong>{activeGroup.name || activeGroup.username}</strong></span>
              <span className="story-time-ago">
                @{activeGroup.username} · {formatStoryTimeAgo(activeStory.timestamp)}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 100 }}>
            {isPaused && <span className="story-paused-chip">⏸ Paused</span>}
            {isOwnStory && (
              <button className="story-more-btn" onClick={() => setShowMoreOptions(true)} title="More Options">
                •••
              </button>
            )}
            <button className="story-close-btn" onClick={() => navigate('/discover')}>&times;</button>
          </div>
        </div>

        {/* Reaction burst overlay */}
        {burstEmoji && (
          <div key={burstEmoji.key} className="story-reaction-burst">
            <span className="burst-main">{burstEmoji.emoji}</span>
            {[...Array(6)].map((_, i) => (
              <span key={i} className={`burst-particle p${i}`}>{burstEmoji.emoji}</span>
            ))}
          </div>
        )}

        {/* Toast (non-blocking, replaces alert) */}
        {toast && <div className="story-toast">{toast}</div>}

        {/* Story Main Slide Content */}
        <div key={activeStory.id} className="story-slide-body">
          {activeStory.type === 'image' && (
            isVideoUrl(activeStory.content) ? (
              <video 
                src={activeStory.content} 
                autoPlay 
                loop 
                muted 
                playsInline 
                className="story-image-content" 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
              />
            ) : (
              <img src={activeStory.content} alt="story image" className="story-image-content" />
            )
          )}

          {activeStory.type === 'poster' && (
            <div className="story-movie-poster-slide">
              <img src={activeStory.content} alt="movie poster" className="story-poster-img" />
              <div className="story-movie-overlay">
                <h3>🍿 Watching Now</h3>
                <h2>{activeStory.movie_title}</h2>
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '0.9rem' }}>
                  {activeStory.rating && <span style={{ color: '#ffd700', fontWeight: '700' }}>⭐ IMDb {activeStory.rating}</span>}
                  {activeStory.year && <span style={{ color: 'rgba(255,255,255,0.8)' }}>📅 {activeStory.year}</span>}
                </div>
              </div>
            </div>
          )}

          {activeStory.type === 'rating' && (
            <div className="story-movie-rating-slide">
              <img src={activeStory.content} alt="movie poster" className="story-poster-img" />
              <div className="story-movie-overlay rating-accent">
                <h3>⭐ Completed Movie</h3>
                <h2>{activeStory.movie_title}</h2>
                <span className="story-movie-score">NovaFlix: {activeStory.text || '10/10'}</span>
              </div>
            </div>
          )}

          {activeStory.type === 'text' && (
            <div className="story-custom-text-slide">
              <p className="story-custom-text">"{activeStory.text}"</p>
              {activeStory.movie_title && <span className="story-custom-tag">🎬 {activeStory.movie_title}</span>}
            </div>
          )}

          {activeStory.type === 'custom_editor' && (
            <div 
              className="story-custom-editor-slide"
              style={{
                background: activeStory.content ? 'transparent' : (activeStory.background_color || '#0d0818'),
                width: '100%',
                height: '100%',
                position: 'relative'
              }}
            >
              {activeStory.content && (
                isVideoUrl(activeStory.content) ? (
                  <video 
                    src={activeStory.content} 
                    autoPlay 
                    loop 
                    muted 
                    playsInline 
                    className="story-custom-bg-img" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} 
                  />
                ) : (
                  <img src={activeStory.content} alt="Story Background" className="story-custom-bg-img" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />
                )
              )}
              {activeStory.overlays?.map(overlay => {
                if (overlay.type === 'text') {
                  const font = FONT_STYLES.find(f => f.id === overlay.fontStyle);
                  return (
                    <div
                      key={overlay.id}
                      className="story-viewer-overlay-text"
                      style={{
                        position: 'absolute',
                        left: `${(overlay.x / 450) * 100}%`,
                        top: `${(overlay.y / 800) * 100}%`,
                        transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
                        color: overlay.color || '#fff',
                        fontFamily: font ? font.style.fontFamily : 'inherit',
                        textShadow: font ? font.style.textShadow : 'none',
                        background: overlay.hasBg ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                        backdropFilter: overlay.hasBg ? 'blur(16px)' : 'none',
                        WebkitBackdropFilter: overlay.hasBg ? 'blur(16px)' : 'none',
                        border: overlay.hasBg ? '1px solid rgba(255, 255, 255, 0.2)' : 'none',
                        boxShadow: overlay.hasBg ? '0 8px 32px 0 rgba(0, 0, 0, 0.3)' : 'none',
                        padding: overlay.hasBg ? '8px 14px' : '0',
                        borderRadius: '8px',
                        fontSize: '1.25rem',
                        fontWeight: '800',
                        textAlign: 'center',
                        wordWrap: 'break-word',
                        maxWidth: '280px',
                        whiteSpace: 'pre-wrap',
                        zIndex: 50
                      }}
                    >
                      {overlay.text}
                    </div>
                  );
                }

                if (overlay.type === 'mention') {
                  return (
                    <div
                      key={overlay.id}
                      className="story-viewer-overlay-mention"
                      style={{
                        position: 'absolute',
                        left: `${(overlay.x / 450) * 100}%`,
                        top: `${(overlay.y / 800) * 100}%`,
                        transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
                        cursor: 'pointer',
                        zIndex: 55
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStickerClick(overlay);
                      }}
                    >
                      @{overlay.username}
                    </div>
                  );
                }

                if (overlay.type === 'emoji') {
                  return (
                    <div
                      key={overlay.id}
                      className="story-viewer-overlay-emoji"
                      style={{
                        position: 'absolute',
                        left: `${(overlay.x / 450) * 100}%`,
                        top: `${(overlay.y / 800) * 100}%`,
                        transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
                        fontSize: '4rem',
                        zIndex: 50
                      }}
                    >
                      {overlay.emoji}
                    </div>
                  );
                }

                if (overlay.type === 'movie') {
                  const m = overlay.movie;
                  return (
                    <div
                      key={overlay.id}
                      className="story-viewer-overlay-movie glass"
                      style={{
                        position: 'absolute',
                        left: `${(overlay.x / 450) * 100}%`,
                        top: `${(overlay.y / 800) * 100}%`,
                        transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        padding: '12px',
                        borderRadius: '16px',
                        width: '280px',
                        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
                        zIndex: 55,
                        cursor: 'pointer'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStickerClick(overlay);
                      }}
                    >
                      <img 
                        src={m.poster} 
                        alt={m.title} 
                        style={{
                          width: '60px',
                          height: '90px',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#fff', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>🎬 {m.title}</span>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.65)' }}>{m.year} • {m.genres?.join(', ') || 'N/A'}</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.78rem', marginTop: '2px' }}>
                          <span style={{ color: '#ffd700', fontWeight: '700' }}>⭐ IMDb {m.imdbRating}</span>
                          <span style={{ color: '#ff61d2', fontWeight: '700' }}>🟣 Nova {m.novaRating}</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (overlay.type === 'music') {
                  return (
                    <div
                      key={overlay.id}
                      className="story-viewer-overlay-music"
                      style={{
                        position: 'absolute',
                        left: `${(overlay.x / 450) * 100}%`,
                        top: `${(overlay.y / 800) * 100}%`,
                        transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
                        zIndex: 56,
                      }}
                    >
                      <SpotifySticker music={overlay.music} />
                    </div>
                  );
                }

                return null;
              })}

              {activeStickerTooltip && (
                <div 
                  className="story-sticker-tooltip glass"
                  style={{
                    left: `${activeStickerTooltip.x}%`,
                    top: `${activeStickerTooltip.y}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(activeStickerTooltip.url);
                    setActiveStickerTooltip(null);
                  }}
                >
                  <span>{activeStickerTooltip.text}</span>
                  <div className="tooltip-arrow" />
                </div>
              )}
            </div>
          )}

          {/* Stickers/Overlays overlay tags (only if not custom editor story) */}
          {activeStory.type !== 'custom_editor' && activeStory.emoji && (
            <div className="story-emoji-overlay">{activeStory.emoji}</div>
          )}
          {activeStory.type !== 'custom_editor' && activeStory.hashtags?.length > 0 && (
            <div className="story-hashtags-overlay">
              {activeStory.hashtags.map(h => (
                <span key={h} className="story-hashtag-tag" onClick={(e) => { e.stopPropagation(); navigate(`/search?filter_type=Hashtag&q=${encodeURIComponent(h)}`); }}>
                  #{h}
                </span>
              ))}
            </div>
          )}

          {/* Mentions overlay (only if not custom editor story) */}
          {activeStory.type !== 'custom_editor' && activeStory.mentions?.length > 0 && (
            <div className="story-mentions-overlay">
              {activeStory.mentions.map(m => (
                <span key={m} className="story-mention-tag" onClick={(e) => { e.stopPropagation(); navigate(`/user/${encodeURIComponent(m)}`); }}>
                  @{m}
                </span>
              ))}
            </div>
          )}

          {/* Caption overlay for non-text stories (only if not custom editor story) */}
          {activeStory.type !== 'custom_editor' && activeStory.text && activeStory.type !== 'text' && (
            <div className="story-caption-overlay">
              <p className="story-caption-text">{activeStory.text}</p>
            </div>
          )}
        </div>

        {/* Story Bottom Interactions Panel */}
        <div className="story-bottom-drawer">
          {!isOwnStory ? (
            <div className="story-visitor-actions">
              <form onSubmit={handleSendReply} className="story-reply-form">
                <input
                  type="text"
                  placeholder={`Reply to ${activeGroup.username}...`}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
              </form>
              <button className={`story-footer-btn heart-btn ${isLiked ? 'liked' : ''}`} onClick={handleLikeStory}>
                {isLiked ? '❤️' : '🤍'}
              </button>
              
              <div className="story-quick-reactions">
                {['😂', '😮', '😱', '🔥', '👏'].map(emoji => (
                  <button key={emoji} className="story-react-btn" onClick={() => handleReactStory(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="story-owner-actions">
              <button className="story-viewers-toggle" onClick={() => setShowViewers(!showViewers)}>
                👁️ {activeStory.viewers?.length || 0}
                {activeStory.likes?.length > 0 && <span className="owner-like-count"> · ❤️ {activeStory.likes.length}</span>}
                {activeStory.reactions?.length > 0 && <span className="owner-react-count"> · {activeStory.reactions.length} reactions</span>}
              </button>
              {showViewers && (
                <div className="story-viewers-list glass">
                  <h4>Seen by ({activeStory.viewers?.length || 0})</h4>
                  <div className="viewers-scroll">
                    {activeStory.viewers?.map(v => {
                      const reaction = activeStory.reactions?.find(r => r.username === v.username)
                      const liked = activeStory.likes?.includes(v.username)
                      return (
                        <div key={v.username} className="viewer-item" onClick={() => navigate(`/user/${v.username}`)}>
                          <img src={v.photo_url} alt={v.username} />
                          <span>@{v.username}</span>
                          <span className="viewer-badges">
                            {liked && '❤️'}
                            {reaction && reaction.emoji}
                          </span>
                        </div>
                      )
                    })}
                    {(!activeStory.viewers || activeStory.viewers.length === 0) && (
                      <p className="no-viewers">No views yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Story More Options Bottom Sheet/Drawer */}
        {showMoreOptions && (
          <div className="story-options-drawer-backdrop" onClick={() => setShowMoreOptions(false)}>
            <div className="story-options-drawer" onClick={e => e.stopPropagation()}>
              <div className="drawer-handle" />
              <button className="drawer-option-btn delete-btn" onClick={() => { setShowMoreOptions(false); setShowDeleteConfirm(true); }}>
                Delete Story
              </button>
              <button className="drawer-option-btn" onClick={() => { showToast("💾 Saved to gallery"); setShowMoreOptions(false); }}>
                Save Story
              </button>
              <button className="drawer-option-btn" onClick={() => { showToast("📤 Shared to feed"); setShowMoreOptions(false); }}>
                Share as Post
              </button>
              <button className="drawer-option-btn" onClick={() => { showToast("⚙️ Story settings coming soon"); setShowMoreOptions(false); }}>
                Story Settings
              </button>
              <div className="drawer-divider" />
              <button className="drawer-option-btn cancel-btn" onClick={() => setShowMoreOptions(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Story Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="story-confirm-modal-backdrop" onClick={() => setShowDeleteConfirm(false)}>
            <div className="story-confirm-modal" onClick={e => e.stopPropagation()}>
              <h3>Delete this story?</h3>
              <p>This story will be permanently deleted.</p>
              <div className="confirm-modal-actions">
                <button className="confirm-btn delete" onClick={handleDeleteStory}>Delete</button>
                <button className="confirm-btn cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
