import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import MovieCard from '../components/MovieCard'
import SkeletonCard from '../components/SkeletonCard'

export default function ActorDetails() {
  const [params] = useSearchParams()
  const name = params.get('name')
  const navigate = useNavigate()
  const [actor, setActor] = useState(null)
  const [loading, setLoading] = useState(true)

  // Celebrity subscription state
  const [celeb, setCeleb] = useState(null) // celebrity record from /celebrities/search
  const [subLoading, setSubLoading] = useState(false)

  useEffect(() => {
    if (!name) return
    setLoading(true)
    api.get(`/movies/actor?name=${encodeURIComponent(name)}`)
      .then(r => setActor(r.data))
      .finally(() => setLoading(false))
  }, [name])

  // Fetch subscription status for this celebrity
  useEffect(() => {
    if (!name) return
    api.get(`/celebrities/search?q=${encodeURIComponent(name)}`)
      .then(r => {
        const results = r.data.results || []
        // Find best match by exact name
        const exact = results.find(c => c.name.toLowerCase() === name.toLowerCase())
        setCeleb(exact || results[0] || null)
      })
      .catch(() => setCeleb(null))
  }, [name])

  const handleSubscribeToggle = async () => {
    if (!celeb || subLoading) return
    setSubLoading(true)
    try {
      if (celeb.is_subscribed) {
        await api.post('/celebrities/unsubscribe', { celeb_id: celeb.id })
        setCeleb(prev => ({
          ...prev,
          is_subscribed: false,
          subscriber_count: Math.max(0, prev.subscriber_count - 1)
        }))
      } else {
        await api.post('/celebrities/subscribe', { celeb_id: celeb.id })
        setCeleb(prev => ({
          ...prev,
          is_subscribed: true,
          subscriber_count: prev.subscriber_count + 1
        }))
      }
    } catch (err) {
      console.error('Subscribe toggle failed:', err)
    } finally {
      setSubLoading(false)
    }
  }

  const typeColors = {
    director: { bg: 'rgba(255,75,43,0.12)', color: '#ff6b4a', border: 'rgba(255,75,43,0.3)' },
    actor: { bg: 'rgba(99,102,241,0.12)', color: '#818cf8', border: 'rgba(99,102,241,0.3)' },
    actress: { bg: 'rgba(233,30,140,0.12)', color: '#f472b6', border: 'rgba(233,30,140,0.3)' }
  }
  const typeStyle = celeb ? typeColors[celeb.type] || typeColors.actor : null

  const formatCount = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n

  if (loading) return (
    <div className="page"><div className="container">
      <div className="skeleton" style={{ height: 200, borderRadius: 18 }} />
    </div></div>
  )

  if (!actor) return <div className="page"><div className="container"><p>Actor not found.</p></div></div>

  return (
    <div className="page fade-up">
      <div className="container">
        <button className="btn btn-ghost" style={{ marginBottom: '1.5rem' }} onClick={() => navigate(-1)}>← Back</button>

        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2.5rem', alignItems: 'flex-start' }}>
          <img src={actor.image} alt={actor.name}
            style={{ width: 180, height: 220, borderRadius: 16, objectFit: 'cover', flexShrink: 0,
                     boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                     border: celeb?.is_subscribed ? '3px solid #818cf8' : '3px solid transparent' }}
            onError={e => e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: 0 }}>{actor.name}</h1>
              {celeb && (
                <span style={{
                  fontSize: '0.7rem', fontWeight: 800, padding: '3px 9px', borderRadius: '20px',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  background: typeStyle.bg, color: typeStyle.color, border: `1px solid ${typeStyle.border}`
                }}>
                  {celeb.type === 'director' ? 'Director' : celeb.type === 'actress' ? 'Actress' : 'Actor'}
                </span>
              )}
            </div>

            {actor.dob !== 'N/A' && (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                📅 Born: {actor.dob} {actor.age !== 'N/A' && `(Age ${actor.age})`}
              </p>
            )}
            {actor.country !== 'N/A' && (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: actor.insta ? '0.25rem' : '1rem' }}>🌍 {actor.country}</p>
            )}
            {actor.insta && (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <a href={`https://instagram.com/${actor.insta}`} target="_blank" rel="noopener noreferrer" style={{ color: '#E1306C', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  📸 Instagram (@{actor.insta})
                </a>
              </p>
            )}
            <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, fontSize: '0.9rem', marginBottom: '1.25rem' }}>{actor.bio}</p>

            {/* Subscribe / Unsubscribe button — only for creators in the system */}
            {celeb && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={handleSubscribeToggle}
                  disabled={subLoading}
                  style={{
                    padding: '0.55rem 1.6rem',
                    borderRadius: '10px',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    border: 'none',
                    cursor: subLoading ? 'not-allowed' : 'pointer',
                    opacity: subLoading ? 0.7 : 1,
                    transition: 'all 0.22s ease',
                    background: celeb.is_subscribed
                      ? 'rgba(255,255,255,0.08)'
                      : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: celeb.is_subscribed ? 'rgba(255,255,255,0.75)' : '#fff',
                    border: celeb.is_subscribed ? '1px solid rgba(255,255,255,0.12)' : 'none',
                    boxShadow: celeb.is_subscribed ? 'none' : '0 4px 15px rgba(99,102,241,0.4)'
                  }}
                >
                  {subLoading ? '...' : celeb.is_subscribed ? '✓ Subscribed' : '+ Subscribe'}
                </button>

                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
                  {formatCount(celeb.subscriber_count)} subscribers
                </span>

                {celeb.is_subscribed && (
                  <span style={{
                    fontSize: '0.75rem', color: '#818cf8',
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                    padding: '3px 9px', borderRadius: '8px'
                  }}>
                    ⚡ +40% boost in your recommendations
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {actor.known_for?.length > 0 && (
          <>
            <h2 className="section-title">🎬 Known For</h2>
            <div className="movie-grid">
              {actor.known_for.map((item, idx) => {
                if (typeof item === 'string') {
                  return <MovieCard key={item} title={item} poster={null} rating="N/A" year="N/A" />;
                }
                return (
                  <MovieCard 
                    key={item.title || idx} 
                    title={item.title} 
                    poster={item.poster} 
                    rating={item.rating} 
                    year={item.year} 
                    nf_rating={item.nf_rating} 
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
