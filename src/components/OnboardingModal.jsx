import { useState } from 'react'
import './OnboardingModal.css'
import api from '../services/api'
import { useAuthStore } from '../store/useAuthStore'

// ── Data with photos ────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: 'Hollywood',     emoji: '🎬', color: '#ff6b6b' },
  { name: 'Bollywood',     emoji: '🎭', color: '#ffd93d' },
  { name: 'Action',        emoji: '💥', color: '#ff4757' },
  { name: 'Comedy',        emoji: '😂', color: '#ffa502' },
  { name: 'Drama',         emoji: '🎭', color: '#7bed9f' },
  { name: 'Sci-Fi',        emoji: '🚀', color: '#70a1ff' },
  { name: 'Horror',        emoji: '👻', color: '#747d8c' },
  { name: 'Romance',       emoji: '💖', color: '#ff6b81' },
  { name: 'Thriller',      emoji: '🔪', color: '#a4b0be' },
  { name: 'Anime',         emoji: '⛩️', color: '#eccc68' },
]

const ACTORS = [
  { name: 'Robert Downey Jr.',  photo: 'https://image.tmdb.org/t/p/w92/5qHNjhtjMD4YWH3UP0rm4tKwxCL.jpg' },
  { name: 'Johnny Depp',        photo: 'https://image.tmdb.org/t/p/w92/xFnKgJzSoO8t2LRRB3SDWN5YnAp.jpg' },
  { name: 'Leonardo DiCaprio',  photo: 'https://image.tmdb.org/t/p/w92/wo2hJpn04vbtmh0B9utCFdsQhxM.jpg' },
  { name: 'Brad Pitt',          photo: 'https://image.tmdb.org/t/p/w92/cckcYc2v0yh1tc9QjRelptcOBko.jpg' },
  { name: 'Tom Cruise',         photo: 'https://image.tmdb.org/t/p/w92/8qBylBsQf4llkGrWR3qAsOtOU8O.jpg' },
  { name: 'Christian Bale',     photo: 'https://image.tmdb.org/t/p/w92/55XFoGCZ8v5Xs3yp1LViFNKwSLU.jpg' },
  { name: 'Shah Rukh Khan',     photo: 'https://image.tmdb.org/t/p/w92/WT0sapHFNWHcBZEzCjzRMzLqXeT.jpg' },
  { name: 'Salman Khan',        photo: 'https://image.tmdb.org/t/p/w92/7cFmABcV9bv0B6ldVvFB4DJHXMZ.jpg' },
  { name: 'Aamir Khan',         photo: 'https://image.tmdb.org/t/p/w92/uChklH7gVxn3RMX7qHRD4PobEHm.jpg' },
  { name: 'Hrithik Roshan',     photo: 'https://image.tmdb.org/t/p/w92/kq7JWMNbSWAR5tIRcBW6dT7XZPD.jpg' },
  { name: 'Ranbir Kapoor',      photo: 'https://image.tmdb.org/t/p/w92/t7nQaVxTz0p3a8ow2VLQB4kuyYX.jpg' },
  { name: 'Akshay Kumar',       photo: 'https://image.tmdb.org/t/p/w92/oFuiFZ5Ac5e8RVq5kDZyaFJ86FP.jpg' },
  { name: 'Prabhas',            photo: 'https://image.tmdb.org/t/p/w92/kbLGs9iWl4Vs0pHAGpBKkRYDx0V.jpg' },
  { name: 'Allu Arjun',         photo: 'https://image.tmdb.org/t/p/w92/1PwgRyFQ8GJt1m88UD7LMCmj3qM.jpg' },
]

const ACTRESSES = [
  { name: 'Scarlett Johansson', photo: 'https://image.tmdb.org/t/p/w92/r7WLn4H8FkBrm6FJwzFknUHRE7L.jpg' },
  { name: 'Jennifer Lawrence',  photo: 'https://image.tmdb.org/t/p/w92/bGoHXMsJqX9n7KSCMXDXH4FNaAq.jpg' },
  { name: 'Emma Watson',        photo: 'https://image.tmdb.org/t/p/w92/8gZADjMm5OVKoGWTDElbq5xaW1J.jpg' },
  { name: 'Margot Robbie',      photo: 'https://image.tmdb.org/t/p/w92/euDPyqLnuwaWMHajcU3oZ9uZezR.jpg' },
  { name: 'Angelina Jolie',     photo: 'https://image.tmdb.org/t/p/w92/9DhGXlkOKpU3bBkQGMFNiCKWIr.jpg' },
  { name: 'Natalie Portman',    photo: 'https://image.tmdb.org/t/p/w92/xBHvZcjRiWyobQ9kxBhO6B2dtRI.jpg' },
  { name: 'Deepika Padukone',   photo: 'https://image.tmdb.org/t/p/w92/tZq8LFCNF0HUvXEVqXzAnKm7kPn.jpg' },
  { name: 'Alia Bhatt',         photo: 'https://image.tmdb.org/t/p/w92/pXFHmWixVoGnzOEBZPo9k8Y9g27.jpg' },
  { name: 'Priyanka Chopra',    photo: 'https://image.tmdb.org/t/p/w92/xCnQMmk7GZUX5sQtqhJsKqOrpkK.jpg' },
  { name: 'Katrina Kaif',       photo: 'https://image.tmdb.org/t/p/w92/mXU6VQH4DGVPF5Gt7mCj2VljKN8.jpg' },
  { name: 'Kareena Kapoor',     photo: 'https://image.tmdb.org/t/p/w92/wbGgRSGvh7BU3pDOtlBD4Gkqh3.jpg' },
  { name: 'Shraddha Kapoor',    photo: 'https://image.tmdb.org/t/p/w92/stEcLSQKWLCHCYJAw5TSFuECL5Z.jpg' },
  { name: 'Rashmika Mandanna',  photo: 'https://image.tmdb.org/t/p/w92/8NlWPtIJJ5Kl5n0Y2mJQKoZbhQH.jpg' },
]

const DIRECTORS = [
  { name: 'Christopher Nolan',    photo: 'https://image.tmdb.org/t/p/w92/xuAIuYSmsUzKlUMBFGVZaWsY3DZ.jpg' },
  { name: 'Steven Spielberg',     photo: 'https://image.tmdb.org/t/p/w92/tZxcg19YQ3e8fJ0pOs7hjlnmmr6.jpg' },
  { name: 'Quentin Tarantino',    photo: 'https://image.tmdb.org/t/p/w92/1gjcpAa99FAOWGnrUvHEXXsRs7o.jpg' },
  { name: 'James Cameron',        photo: 'https://image.tmdb.org/t/p/w92/9NAZnTjBQ9WcXAQEzZpKy4vdQto.jpg' },
  { name: 'Martin Scorsese',      photo: 'https://image.tmdb.org/t/p/w92/9U9Y5GQuWX3EZy39B8nkk4NY01S.jpg' },
  { name: 'S.S. Rajamouli',       photo: 'https://image.tmdb.org/t/p/w92/j55q5iQrDCGtKRCNbX6Ln1PK9J1.jpg' },
  { name: 'Sanjay Leela Bhansali', photo: 'https://image.tmdb.org/t/p/w92/iocOlIZeEQsLiTqGgvBYc3YRSCN.jpg' },
  { name: 'Karan Johar',          photo: 'https://image.tmdb.org/t/p/w92/z7pPbx7GMCLVEXbmFSaYYHFHx0U.jpg' },
  { name: 'Anurag Kashyap',       photo: 'https://image.tmdb.org/t/p/w92/vYRN3Q7YzYhM6EMEBhRxSQ31OYh.jpg' },
  { name: 'Prashanth Neel',       photo: 'https://image.tmdb.org/t/p/w92/uXRoqEBE4SjJGn8BkRnDYyqpNJI.jpg' },
]

const STUDIOS = [
  { name: 'Disney',              logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Disney%2B_logo.svg/200px-Disney%2B_logo.svg.png', bg: '#040714' },
  { name: 'Warner Bros.',        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Warner_Bros._2019_logo.svg/200px-Warner_Bros._2019_logo.svg.png', bg: '#003087' },
  { name: 'Universal',           logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Universal_Pictures_logo.svg/200px-Universal_Pictures_logo.svg.png', bg: '#000' },
  { name: 'Paramount',           logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Paramount_Pictures_%282023%29.svg/200px-Paramount_Pictures_%282023%29.svg.png', bg: '#001e62' },
  { name: 'Sony Pictures',       logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Sony_Pictures_Entertainment_logo.svg/200px-Sony_Pictures_Entertainment_logo.svg.png', bg: '#000' },
  { name: 'Netflix',             logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/200px-Netflix_2015_logo.svg.png', bg: '#141414' },
  { name: 'Marvel Studios',      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Marvel_Logo.svg/200px-Marvel_Logo.svg.png', bg: '#ed1d24' },
  { name: 'DC Films',            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/DC_Comics_logo.svg/200px-DC_Comics_logo.svg.png', bg: '#0476F2' },
  { name: '20th Century Studios', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/20th_Century_Studios_logo.svg/200px-20th_Century_Studios_logo.svg.png', bg: '#000' },
  { name: 'A24',                 logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/A24_Films_logo.svg/200px-A24_Films_logo.svg.png', bg: '#000' },
]

const STEPS_CONFIG = [
  { key: 'categories', title: '🎬 Pick Your Taste', desc: 'Select the genres you love watching most', data: CATEGORIES },
  { key: 'actors',     title: '🎭 Favorite Actors',    desc: 'Who do you love watching on screen?',   data: ACTORS },
  { key: 'actresses',  title: '💃 Favorite Actresses', desc: 'Select your favorite lead actresses.',  data: ACTRESSES },
  { key: 'directors',  title: '🎥 Favorite Directors', desc: "Whose cinematic vision gets you?",     data: DIRECTORS },
  { key: 'studios',    title: '🏢 Production Houses',  desc: 'Studios whose content you enjoy.',     data: STUDIOS },
]

const FALLBACK_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'

function ItemCard({ step, item, isSelected, onToggle }) {
  if (step === 'categories') {
    return (
      <button
        type="button"
        className={`onboarding-cat-card ${isSelected ? 'selected' : ''}`}
        onClick={() => onToggle(item.name)}
        style={{ '--cat-color': item.color }}
      >
        <span className="cat-emoji">{item.emoji}</span>
        <span className="cat-name">{item.name}</span>
        {isSelected && <span className="cat-check">✓</span>}
      </button>
    )
  }

  if (step === 'studios') {
    return (
      <button
        type="button"
        className={`onboarding-studio-card ${isSelected ? 'selected' : ''}`}
        onClick={() => onToggle(item.name)}
        style={{ '--studio-bg': item.bg }}
      >
        <img
          src={item.logo}
          alt={item.name}
          className="studio-logo"
          onError={e => { e.target.style.display = 'none' }}
        />
        <span className="studio-name">{item.name}</span>
        {isSelected && <span className="studio-check">✓</span>}
      </button>
    )
  }

  // Actor / actress / director — person card
  return (
    <button
      type="button"
      className={`onboarding-person-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onToggle(item.name || item)}
    >
      <img
        src={item.photo || FALLBACK_AVATAR}
        alt={item.name || item}
        className="person-photo"
        onError={e => { e.target.src = FALLBACK_AVATAR }}
      />
      <span className="person-name">{item.name || item}</span>
      {isSelected && <div className="person-check-overlay">✓</div>}
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function OnboardingModal({ isOpen, onClose }) {
  const { updateUser } = useAuthStore()

  const [step, setStep] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [customItems, setCustomItems] = useState({ actors: [], actresses: [], directors: [] })
  const [selected, setSelected] = useState({ categories: [], actors: [], actresses: [], directors: [], studios: [] })

  const currentConfig = STEPS_CONFIG[step] || STEPS_CONFIG[0]
  const currentKey = currentConfig.key

  const allItems = currentKey === 'categories' || currentKey === 'studios'
    ? currentConfig.data
    : [...currentConfig.data, ...(customItems[currentKey] || []).map(n => ({ name: n, photo: null }))]

  const filteredItems = allItems.filter(item => {
    const name = item.name || item
    return name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const toggleSelect = (name) => {
    setSelected(prev => {
      const list = prev[currentKey]
      return { ...prev, [currentKey]: list.includes(name) ? list.filter(x => x !== name) : [...list, name] }
    })
  }

  const handleSearchAdd = () => {
    if (!searchQuery.trim() || currentKey === 'categories' || currentKey === 'studios') return
    const trimmed = searchQuery.trim()
    const existing = allItems.find(x => (x.name || x).toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      if (!selected[currentKey].includes(existing.name || existing)) toggleSelect(existing.name || existing)
    } else {
      setCustomItems(prev => ({ ...prev, [currentKey]: [...(prev[currentKey] || []), trimmed] }))
      setSelected(prev => ({ ...prev, [currentKey]: [...prev[currentKey], trimmed] }))
    }
    setSearchQuery('')
  }

  const goNext = () => {
    if (step < 4) { setStep(s => s + 1); setSearchQuery('') }
  }

  const goBack = () => {
    if (step > 0) { setStep(s => s - 1); setSearchQuery('') }
  }

  // "Do this later" — close WITHOUT saving (will show again next login)
  const handleDoLater = () => {
    onClose()
  }

  // "Finish" — save everything and mark completed (never shows again)
  const handleFinish = async () => {
    const totalSelected = Object.values(selected).flat().length
    if (totalSelected === 0) {
      // If absolutely nothing selected, treat as "do later"
      onClose()
      return
    }
    try {
      await api.post('/users/onboarding', selected)
    } catch (e) {
      console.error('Onboarding save failed:', e)
    } finally {
      updateUser({ onboarding_completed: true, preferences: selected })
      onClose()
    }
  }

  const progressPct = ((step + 1) / 5) * 100
  const showSearch = currentKey !== 'categories' && currentKey !== 'studios'

  if (!isOpen) return null

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">

        {/* Top bar: progress + skip-all */}
        <div className="onboarding-topbar">
          <div className="onboarding-progress-bar">
            <div className="onboarding-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <button className="onboarding-dothislater-btn" onClick={handleDoLater} title="Do this later">
            Do this later
          </button>
        </div>

        {/* Step dots */}
        <div className="onboarding-steps-dots">
          {STEPS_CONFIG.map((_, i) => (
            <div key={i} className={`onboarding-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
          ))}
        </div>

        {/* Header */}
        <div className="onboarding-header">
          <h2>{currentConfig.title}</h2>
          <p>{currentConfig.desc}</p>
          {selected[currentKey].length > 0 && (
            <span className="selected-count">{selected[currentKey].length} selected</span>
          )}
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="onboarding-search-container">
            <span className="onboarding-search-icon">🔍</span>
            <input
              type="text"
              placeholder={`Search or add a custom ${currentKey.slice(0, -1)}...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearchAdd()}
            />
            {searchQuery.trim() && (
              <button className="onboarding-add-btn" onClick={handleSearchAdd}>+ Add</button>
            )}
          </div>
        )}

        {/* Items grid */}
        <div className={`onboarding-grid ${currentKey}`}>
          {filteredItems.map(item => {
            const name = item.name || item
            return (
              <ItemCard
                key={name}
                step={currentKey}
                item={item}
                isSelected={selected[currentKey].includes(name)}
                onToggle={toggleSelect}
              />
            )
          })}
          {filteredItems.length === 0 && (
            <p className="no-results-msg">No matches — press Enter or click <strong>+ Add</strong> to add it!</p>
          )}
        </div>

        {/* Footer */}
        <div className="onboarding-footer">
          <div>
            {step > 0 && (
              <button className="onboarding-btn-secondary" onClick={goBack}>← Back</button>
            )}
          </div>
          <div className="onboarding-footer-right">
            {step < 4 ? (
              <>
                <button className="onboarding-btn-skip" onClick={goNext}>Skip</button>
                <button className="onboarding-btn-primary" onClick={goNext}>Next →</button>
              </>
            ) : (
              <button className="onboarding-btn-primary finish-btn" onClick={handleFinish}>🎉 Finish Setup</button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
