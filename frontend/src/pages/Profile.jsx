import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import ActivityTab from '../components/ActivityTab'
import ImageUploadModal from '../components/ImageUploadModal'
import PasswordInput from '../components/PasswordInput'
import './Profile.css'

const FALLBACK_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'
const FALLBACK_COVER = 'https://images.unsplash.com/photo-1574267431622-c231bb2b5b33?w=1200&q=80'

// Accent colors palette
const ACCENT_COLORS = [
  { name: 'Pink', hex: '#E1306C' },
  { name: 'Purple', hex: '#8b2be2' },
  { name: 'Blue', hex: '#0984e3' },
  { name: 'Cyan', hex: '#00bec4' },
  { name: 'Green', hex: '#2ed573' },
  { name: 'Orange', hex: '#f39c12' },
  { name: 'Red', hex: '#d63031' }
]

const BG_THEMES = [
  { id: 'dark', name: 'Cinematic Obsidian', class: 'theme-bg-dark', style: { background: '#08080c' } },
  { id: 'grad1', name: 'Mystic Dusk', class: 'theme-bg-gradient-1', style: { background: 'linear-gradient(135deg, #1f1c2c, #928dab)' } },
  { id: 'grad2', name: 'Deep Space', class: 'theme-bg-gradient-2', style: { background: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' } },
  { id: 'grad3', name: 'Oceanic Blue', class: 'theme-bg-gradient-3', style: { background: 'linear-gradient(135deg, #3a7bd5, #3a6073)' } }
]

export default function Profile() {
  const { user, updateUser, logout } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // State to track if main profile view is shown or settings is active
  const [activeTab, setActiveTab] = useState('edit_profile') // overview, activity, wishlist, watched, favorites, reviews, edit_profile, account_settings, privacy_settings, notifications_settings, theme_settings, movie_dna
  const [modalType, setModalType] = useState(null) // 'followers', 'following', null
  const [followSearchQuery, setFollowSearchQuery] = useState('')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadType, setUploadType] = useState('profile')
  
  const [profileData, setProfileData] = useState(null)
  const [activityStats, setActivityStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [draftSaved, setDraftSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Gamification & Safety State
  const [gamification, setGamification] = useState(null)
  const [safety, setSafety] = useState({
    blocked: [],
    muted: [],
    restricted_comment: [],
    private_account: false,
    age_restriction: 'None',
    hidden_words: []
  })
  const [blockInput, setBlockInput] = useState('')
  const [muteInput, setMuteInput] = useState('')
  const [restrictInput, setRestrictInput] = useState('')
  const [hiddenWordsInput, setHiddenWordsInput] = useState('')

  const handleImageUpload = async (base64Str, type) => {
    try {
      const res = await api.post('/users/upload', {
        image_base64: base64Str,
        type
      })
      const url = res.data.url
      const fieldKey = type === 'cover' ? 'cover_url' : 'photo_url'
      setFormFields(f => ({ ...f, [fieldKey]: url }))
      const payload = { [fieldKey]: url }
      await api.put('/users/profile', payload)
      // Update the global auth store so navbar/header avatars refresh immediately
      updateUser({ profile: { [fieldKey]: url } })
    } catch (error) {
      console.error('Failed to upload image', error)
      alert('Upload failed. Please check the image size and try again.')
    }
  }

  // Sync tab from search parameters
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) setActiveTab(tab)
  }, [searchParams])

  // Form Fields State
  const [formFields, setFormFields] = useState({
    name: '',
    username: '',
    bio: '',
    location: '',
    website: '',
    birthday: '',
    photo_url: '',
    cover_url: ''
  })

  // Preference Tag State
  const [genres, setGenres] = useState([])
  const [actors, setActors] = useState([])
  const [actresses, setActresses] = useState([])
  const [directors, setDirectors] = useState([])
  const [studios, setStudios] = useState([])
  const [categories, setCategories] = useState([])
  const [franchises, setFranchises] = useState([])
  const [languages, setLanguages] = useState([])
  const [eras, setEras] = useState([])

  // Account Customization Settings State
  const [accentColor, setAccentColor] = useState('#E1306C')
  const [bgTheme, setBgTheme] = useState('dark')

  // Privacy Settings Toggles
  const [privacyToggles, setPrivacyToggles] = useState({
    public_profile: true,
    private_account: false,
    show_followers: true,
    show_watched: true,
    show_activity: true,
    allow_messages: 'Everyone'
  })

  // Notifications Toggles
  const [notifToggles, setNotifToggles] = useState({
    follow_notifs: true,
    message_notifs: true,
    recommend_notifs: true,
    like_notifs: true,
    comment_notifs: true
  })

  // Account settings form state (password)
  const [pwdForm, setPwdForm] = useState({ current: '', new: '', confirm: '' })
  const [pwdMessage, setPwdMessage] = useState('')

  // Initial load
  useEffect(() => {
    fetchProfileAndStats()
  }, [])

  const fetchProfileAndStats = () => {
    setLoading(true)
    Promise.all([
      api.get('/users/profile'),
      api.get('/users/activity/stats'),
      api.get('/social/gamification').catch(() => ({ data: null }))
    ])
    .then(([profileRes, statsRes, gamificationRes]) => {
      const profile = profileRes.data
      setProfileData(profile)
      setActivityStats(statsRes.data)
      if (gamificationRes && gamificationRes.data) {
        setGamification(gamificationRes.data)
      }
      updateUser(profile)

      // Load fields
      const bioData = profile.profile?.bio || ''
      const photo = profile.profile?.photo_url || ''
      const cover = profile.profile?.cover_url || ''
      const loc = profile.profile?.location || ''
      const web = profile.profile?.website || ''
      const birth = profile.profile?.birthday || ''

      // Toggles
      const priv = profile.privacy || {}
      const notif = profile.notifications || {}
      const pref = profile.preferences || {}
      const th = profile.theme || {}

      setFormFields({
        name: profile.name || '',
        username: profile.username || '',
        bio: bioData,
        location: loc,
        website: web,
        birthday: birth,
        photo_url: photo,
        cover_url: cover
      })

      setGenres(pref.genres || [])
      setActors(pref.actors || [])
      setActresses(pref.actresses || [])
      setDirectors(pref.directors || [])
      setStudios(pref.studios || [])
      setCategories(pref.categories || [])
      setFranchises(pref.franchises || [])
      setLanguages(pref.languages || [])
      setEras(pref.eras || [])

      setAccentColor(th.accent_color || '#E1306C')
      setBgTheme(th.background_theme || 'dark')

      setPrivacyToggles({
        public_profile: priv.public_profile ?? true,
        private_account: priv.private_account ?? false,
        show_followers: priv.show_followers ?? true,
        show_watched: priv.show_watched ?? true,
        show_activity: priv.show_activity ?? true,
        allow_messages: priv.allow_messages ?? 'Everyone'
      })

      const saf = profile.safety || {}
      setSafety({
        blocked: saf.blocked || [],
        muted: saf.muted || [],
        restricted_comment: saf.restricted_comment || [],
        private_account: saf.private_account || priv.private_account || false,
        age_restriction: saf.age_restriction || 'None',
        hidden_words: saf.hidden_words || []
      })
      setHiddenWordsInput((saf.hidden_words || []).join(', '))

      setNotifToggles({
        follow_notifs: notif.follow_notifs ?? true,
        message_notifs: notif.message_notifs ?? true,
        recommend_notifs: notif.recommend_notifs ?? true,
        like_notifs: notif.like_notifs ?? true,
        comment_notifs: notif.comment_notifs ?? true
      })

      // Load draft from localStorage if any exists
      const draft = localStorage.getItem(`draft:${profile.username}`)
      if (draft) {
        try {
          const parsed = JSON.parse(draft)
          setFormFields(f => ({ ...f, ...parsed.fields }))
          if (parsed.genres) setGenres(parsed.genres)
          if (parsed.actors) setActors(parsed.actors)
          if (parsed.directors) setDirectors(parsed.directors)
          if (parsed.franchises) setFranchises(parsed.franchises)
          if (parsed.languages) setLanguages(parsed.languages)
          if (parsed.eras) setEras(parsed.eras)
          setDraftSaved(true)
        } catch (e) {}
      }
    })
    .catch(console.error)
    .finally(() => setLoading(false))
  }

  // Auto-Save Draft Trigger (for profile text fields)
  useEffect(() => {
    if (!profileData?.username) return
    const timer = setTimeout(() => {
      const draftData = {
        fields: formFields,
        genres,
        actors,
        directors,
        franchises,
        languages,
        eras
      }
      localStorage.setItem(`draft:${profileData.username}`, JSON.stringify(draftData))
      setDraftSaved(true)
    }, 1500)
    return () => clearTimeout(timer)
  }, [formFields, genres, actors, directors, franchises, languages, eras])

  // Auto-Save Privacy Settings immediately on toggle change
  useEffect(() => {
    if (!profileData?.username) return
    const timer = setTimeout(async () => {
      try {
        await api.put('/users/profile', { privacy: privacyToggles })
      } catch (err) {
        console.error('Auto-save privacy failed:', err)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [privacyToggles])

  // Auto-Save Notification Settings immediately on toggle change
  useEffect(() => {
    if (!profileData?.username) return
    const timer = setTimeout(async () => {
      try {
        await api.put('/users/profile', { notifications: notifToggles })
      } catch (err) {
        console.error('Auto-save notifications failed:', err)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [notifToggles])

  // Auto-Save Theme Settings immediately on change
  useEffect(() => {
    if (!profileData?.username) return
    const timer = setTimeout(async () => {
      try {
        await api.put('/users/profile', { theme: { accent_color: accentColor, background_theme: bgTheme } })
      } catch (err) {
        console.error('Auto-save theme failed:', err)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [accentColor, bgTheme])

  // Save changes to backend
  const handleSaveChanges = async () => {
    setSaving(true)
    try {
      const updatePayload = {
        name: formFields.name,
        username: formFields.username,
        bio: formFields.bio,
        photo_url: formFields.photo_url,
        cover_url: formFields.cover_url,
        location: formFields.location,
        website: formFields.website,
        birthday: formFields.birthday,
        preferences: {
          genres,
          actors,
          actresses,
          directors,
          studios,
          categories,
          franchises,
          languages,
          eras
        },
        theme: {
          accent_color: accentColor,
          background_theme: bgTheme
        },
        privacy: privacyToggles,
        notifications: notifToggles
      }

      const { data } = await api.put('/users/profile', updatePayload)
      
      // Save safety settings
      await api.put('/social/safety/settings', {
        private_account: safety.private_account,
        age_restriction: safety.age_restriction,
        hidden_words: safety.hidden_words
      })

      updateUser({
        ...data.profile,
        username: data.new_username
      })
      
      // Clear draft
      localStorage.removeItem(`draft:${profileData.username}`)
      setDraftSaved(false)
      alert("Changes saved successfully!")
      fetchProfileAndStats()
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const handleSafetyAction = async (targetUsername, action) => {
    try {
      const { data } = await api.post('/social/safety/block', {
        target_username: targetUsername,
        action: action
      })
      alert(data.message)
      fetchProfileAndStats()
    } catch (err) {
      alert(err.response?.data?.detail || "Safety action failed")
    }
  }

  const handleCancel = () => {
    // Clear draft and reload
    localStorage.removeItem(`draft:${profileData.username}`)
    setDraftSaved(false)
    fetchProfileAndStats()
  }

  // Handle password updates
  const handleChangePassword = async () => {
    if (pwdForm.new !== pwdForm.confirm) {
      setPwdMessage("Passwords do not match.")
      return
    }
    try {
      await api.post('/users/password', { current_password: pwdForm.current, new_password: pwdForm.new })
      setPwdMessage("Password updated successfully!")
      setPwdForm({ current: '', new: '', confirm: '' })
    } catch (err) {
      setPwdMessage(err.response?.data?.detail || "Update failed")
    }
  }

  // Compute profile completion elements
  const checklist = [
    { label: 'Add profile picture', done: !!formFields.photo_url },
    { label: 'Add cover photo', done: !!formFields.cover_url },
    { label: 'Add bio', done: !!formFields.bio },
    { label: 'Add location', done: !!formFields.location },
    { label: 'Add favorite genres', done: genres.length > 0 },
    { label: 'Add favorite actors', done: actors.length > 0 }
  ]
  const completedCount = checklist.filter(c => c.done).length
  const completionPercentage = Math.round((completedCount / checklist.length) * 100)

  // Compute Cinephile Level stats based on activity
  const moviesCount = activityStats?.all_time?.movies_watched || 0
  const reviewsCount = activityStats?.all_time?.reviews_written || 0
  const listsCount = activityStats?.all_time?.lists_created || 0
  
  const xp = gamification ? gamification.xp : (moviesCount * 50) + (reviewsCount * 100) + (listsCount * 150)
  const cinephileLevel = gamification ? gamification.level : Math.floor(xp / 500) + 1
  const levelXpProgress = gamification ? gamification.level_xp_progress : xp % 500

  // Quick lists toggle helpers
  const toggleGenre = (genreName) => {
    if (genres.includes(genreName)) {
      setGenres(genres.filter(g => g !== genreName))
    } else {
      setGenres([...genres, genreName])
    }
  }

  const toggleLanguage = (lang) => {
    if (languages.includes(lang)) {
      setLanguages(languages.filter(l => l !== lang))
    } else {
      setLanguages([...languages, lang])
    }
  }

  const toggleEra = (era) => {
    if (eras.includes(era)) {
      setEras(eras.filter(e => e !== era))
    } else {
      setEras([...eras, era])
    }
  }

  // Adding generic tags
  const addPromptTag = (list, setList, labelName) => {
    const val = prompt(`Add favorite ${labelName}:`)
    if (val && val.trim() !== '') {
      if (!list.includes(val.trim())) {
        setList([...list, val.trim()])
      }
    }
  }

  const removeTag = (list, setList, val) => {
    setList(list.filter(item => item !== val))
  }

  if (loading || !profileData) {
    return <div className="prof-page"><div className="spinner"></div> Loading profile...</div>
  }

  // Select class for background styling
  const activeBgTheme = BG_THEMES.find(t => t.id === bgTheme)
  const bgClass = activeBgTheme ? activeBgTheme.class : ''
  const inlineStyles = { '--accent-color': accentColor }

  const isSettingsTab = ['edit_profile', 'account_settings', 'privacy_settings', 'notifications_settings', 'theme_settings'].includes(activeTab)

  return (
    <div className={`prof-page ${bgClass}`} style={inlineStyles}>
      <div className="prof-container">
        
        {/* LEFT COLUMN: persistent sidebar */}
        <div className="prof-sidebar">
          {/* Main profile links */}
          <div className="prof-sidebar-menu">
            <button className={`prof-sidebar-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => {
              setActiveTab('overview')
            }}>
              🏠 Overview
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'movie_dna' ? 'active' : ''}`} onClick={() => setActiveTab('movie_dna')}>
              🧬 Movie DNA
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'wishlist' ? 'active' : ''}`} onClick={() => setActiveTab('wishlist')}>
              🤍 Wishlist <span className="prof-tab-count">{profileData.wishlist?.length || 0}</span>
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'watched' ? 'active' : ''}`} onClick={() => setActiveTab('watched')}>
              👁️ Watched Movies <span className="prof-tab-count">{profileData.watched_list?.length || 0}</span>
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>
              ⭐ Favorites <span className="prof-tab-count">{profileData.favorite_list?.length || 0}</span>
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
              💬 Reviews
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'ratings' ? 'active' : ''}`} onClick={() => setActiveTab('ratings')}>
              🟣 Ratings <span className="prof-tab-count">{profileData.ratings?.length || 0}</span>
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
              📊 Activity
            </button>
            
            <div className="prof-sidebar-divider"></div>
            
            {/* Settings section links */}
            <button className={`prof-sidebar-btn ${activeTab === 'edit_profile' ? 'active' : ''}`} onClick={() => setActiveTab('edit_profile')}>
              ✏️ Edit Profile
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'account_settings' ? 'active' : ''}`} onClick={() => setActiveTab('account_settings')}>
              ⚙️ Account Settings
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'privacy_settings' ? 'active' : ''}`} onClick={() => setActiveTab('privacy_settings')}>
              🔒 Privacy
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'notifications_settings' ? 'active' : ''}`} onClick={() => setActiveTab('notifications_settings')}>
              🔔 Notifications
            </button>
            <button className={`prof-sidebar-btn ${activeTab === 'theme_settings' ? 'active' : ''}`} onClick={() => setActiveTab('theme_settings')}>
              🎭 Theme & Appearance
            </button>

            <div className="prof-sidebar-divider"></div>

            <button className="prof-sidebar-btn" style={{ color: '#ff4b2b' }} onClick={() => {
              api.post('/auth/logout').finally(() => { logout(); navigate('/login') })
            }}>
              🚪 Logout
            </button>
          </div>

          {/* SIDEBAR WIDGETS */}
          {/* Profile Completion */}
          <div className="prof-widget-card">
            <span className="prof-widget-title">Profile Completion</span>
            <div className="prof-widget-value">
              <span>{completionPercentage}%</span>
              <span style={{ fontSize: '0.95rem' }}>★</span>
            </div>
            <div className="prof-widget-bar-track">
              <div className="prof-widget-bar-fill" style={{ width: `${completionPercentage}%` }}></div>
            </div>
            <span className="prof-widget-sub">Your profile is {completionPercentage}% complete</span>
          </div>

          {/* Movie Level */}
          <div className="prof-widget-card">
            <span className="prof-widget-title">Movie Level</span>
            <div className="prof-widget-value" style={{ color: 'var(--accent-color)' }}>
              Level {cinephileLevel}
            </div>
            <div className="prof-widget-bar-track">
              <div className="prof-widget-bar-fill" style={{ width: `${(levelXpProgress / 500) * 100}%` }}></div>
            </div>
            <span className="prof-widget-sub">Cinephile ({xp} XP total)</span>
          </div>

          {/* Streak */}
          <div className="prof-widget-card" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.85rem' }}>
            <span style={{ fontSize: '1.8rem' }}>🔥</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="prof-widget-value">{activityStats?.all_time?.current_streak || 0} Days</span>
              <span className="prof-widget-sub">Daily streak. Keep going!</span>
            </div>
          </div>
        </div>

        {/* MIDDLE & RIGHT COMBINED PANELS */}
        <div className="prof-main-view">

          {isSettingsTab ? (
            /* ── THREE COLUMN SETTINGS VIEWS ── */
            <div className="prof-content-layout">
              {/* Center Form Settings Pane */}
              <div className="prof-settings-pane">
                
                {/* 1. EDIT PROFILE TAB */}
                {activeTab === 'edit_profile' && (
                  <>
                    <div className="prof-pane-header">
                      <div className="prof-pane-title">
                        <h2>Edit Profile</h2>
                        <p>Manage your profile information and preferences</p>
                      </div>
                      <button className="prof-select" style={{ fontSize: '0.78rem' }} onClick={() => setActiveTab('overview')}>
                        Preview Profile
                      </button>
                    </div>

                    {/* Banner Cover Cover/Banner & avatar image upload UI */}
                    <div className="prof-banner-wrapper">
                      <img 
                        src={formFields.cover_url || FALLBACK_COVER} 
                        alt="cover" 
                        className="prof-cover-image"
                        onError={e => e.target.src = FALLBACK_COVER}
                      />
                      <button 
                        className="prof-cover-overlay-btn" 
                        onClick={() => {
                          setUploadType('cover')
                          setUploadModalOpen(true)
                        }}
                      >
                        📷 Change Cover
                      </button>
                      
                      <div className="prof-avatar-container-relative">
                        <div className="prof-avatar-image-wrap">
                          <img 
                            src={formFields.photo_url || FALLBACK_AVATAR} 
                            alt="avatar" 
                            className="prof-avatar-image"
                            onError={e => e.target.src = FALLBACK_AVATAR}
                          />
                        </div>
                        <button 
                          className="prof-avatar-camera-btn"
                          onClick={() => {
                            setUploadType('profile')
                            setUploadModalOpen(true)
                          }}
                          title="Change Profile Photo"
                        >
                          📷
                        </button>
                      </div>
                    </div>

                    {/* Form Fields starting */}
                    <div className="prof-fields-spacer">
                      <div className="prof-form-row">
                        <div className="prof-form-group">
                          <label>Display Name</label>
                          <div className="prof-input-wrap">
                            <input 
                              type="text" 
                              className="prof-input" 
                              value={formFields.name}
                              onChange={e => setFormFields(f => ({ ...f, name: e.target.value }))}
                            />
                            <span className="prof-input-verified-badge" title="Verified Account">✔</span>
                          </div>
                        </div>
                        <div className="prof-form-group">
                          <label>Username</label>
                          <div className="prof-input-wrap">
                            <span className="prof-input-icon">@</span>
                            <input 
                              type="text" 
                              className="prof-input" 
                              value={formFields.username}
                              onChange={e => setFormFields(f => ({ ...f, username: e.target.value }))}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="prof-form-group">
                        <label>Bio (max 150 characters)</label>
                        <textarea 
                          className="prof-input prof-textarea" 
                          maxLength={150}
                          value={formFields.bio}
                          onChange={e => setFormFields(f => ({ ...f, bio: e.target.value }))}
                        />
                        <span className="prof-char-counter">{formFields.bio?.length || 0} / 150</span>
                      </div>

                      <div className="prof-form-row">
                        <div className="prof-form-group">
                          <label>Location</label>
                          <div className="prof-input-wrap">
                            <span className="prof-input-icon">📍</span>
                            <input 
                              type="text" 
                              className="prof-input" 
                              placeholder="e.g. Mumbai, India"
                              value={formFields.location}
                              onChange={e => setFormFields(f => ({ ...f, location: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="prof-form-group">
                          <label>Website</label>
                          <div className="prof-input-wrap">
                            <span className="prof-input-icon">🔗</span>
                            <input 
                              type="text" 
                              className="prof-input" 
                              placeholder="e.g. https://linktr.ee/altaf_khan"
                              value={formFields.website}
                              onChange={e => setFormFields(f => ({ ...f, website: e.target.value }))}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="prof-form-group" style={{ maxWidth: '50%' }}>
                        <label>Birthday</label>
                        <div className="prof-input-wrap">
                          <span className="prof-input-icon">📅</span>
                          <input 
                            type="text" 
                            className="prof-input" 
                            placeholder="e.g. 15 March 1998"
                            value={formFields.birthday}
                            onChange={e => setFormFields(f => ({ ...f, birthday: e.target.value }))}
                          />
                        </div>
                      </div>

                      {/* Taste & Preferences — Onboarding data */}
                      <div className="prof-pref-section" style={{ marginTop: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                          <div>
                            <h3 className="prof-pref-title" style={{ margin: 0 }}>🎯 Taste & Preferences</h3>
                            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '4px 0 0' }}>These power your personalized recommendations</p>
                          </div>
                        </div>

                        {/* Categories */}
                        <div className="prof-pref-group">
                          <span className="prof-pref-label">📂 Categories</span>
                          <div className="prof-tags-container" style={{ flexWrap: 'wrap' }}>
                            {['Hollywood', 'Bollywood', 'Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror', 'Romance', 'Thriller', 'Anime'].map(cat => (
                              <span
                                key={cat}
                                className={`prof-tag-pill clickable ${categories.includes(cat) ? 'active' : ''}`}
                                onClick={() => setCategories(prev => prev.includes(cat) ? prev.filter(x => x !== cat) : [...prev, cat])}
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Actors */}
                        <div className="prof-pref-group">
                          <span className="prof-pref-label">🎭 Favorite Actors</span>
                          <div className="prof-tags-container">
                            {['Robert Downey Jr.', 'Johnny Depp', 'Leonardo DiCaprio', 'Tom Cruise', 'Shah Rukh Khan', 'Salman Khan', 'Aamir Khan', 'Hrithik Roshan', ...actors.filter(a => !['Robert Downey Jr.', 'Johnny Depp', 'Leonardo DiCaprio', 'Tom Cruise', 'Shah Rukh Khan', 'Salman Khan', 'Aamir Khan', 'Hrithik Roshan'].includes(a))].map(act => (
                              <span
                                key={act}
                                className={`prof-tag-pill clickable ${actors.includes(act) ? 'active' : ''}`}
                                onClick={() => setActors(prev => prev.includes(act) ? prev.filter(x => x !== act) : [...prev, act])}
                              >
                                {act}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Actresses */}
                        <div className="prof-pref-group">
                          <span className="prof-pref-label">💃 Favorite Actresses</span>
                          <div className="prof-tags-container">
                            {['Scarlett Johansson', 'Jennifer Lawrence', 'Deepika Padukone', 'Alia Bhatt', 'Priyanka Chopra', 'Rashmika Mandanna', ...actresses.filter(a => !['Scarlett Johansson', 'Jennifer Lawrence', 'Deepika Padukone', 'Alia Bhatt', 'Priyanka Chopra', 'Rashmika Mandanna'].includes(a))].map(act => (
                              <span
                                key={act}
                                className={`prof-tag-pill clickable ${actresses.includes(act) ? 'active' : ''}`}
                                onClick={() => setActresses(prev => prev.includes(act) ? prev.filter(x => x !== act) : [...prev, act])}
                              >
                                {act}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Directors */}
                        <div className="prof-pref-group">
                          <span className="prof-pref-label">🎥 Favorite Directors</span>
                          <div className="prof-tags-container">
                            {['Christopher Nolan', 'Steven Spielberg', 'James Cameron', 'S.S. Rajamouli', 'Karan Johar', ...directors.filter(d => !['Christopher Nolan', 'Steven Spielberg', 'James Cameron', 'S.S. Rajamouli', 'Karan Johar'].includes(d))].map(dir => (
                              <span
                                key={dir}
                                className={`prof-tag-pill clickable ${directors.includes(dir) ? 'active' : ''}`}
                                onClick={() => setDirectors(prev => prev.includes(dir) ? prev.filter(x => x !== dir) : [...prev, dir])}
                              >
                                {dir}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Studios */}
                        <div className="prof-pref-group">
                          <span className="prof-pref-label">🏢 Production Houses</span>
                          <div className="prof-tags-container">
                            {['Disney', 'Warner Bros.', 'Netflix', 'Marvel Studios', 'Universal', 'A24', 'Sony Pictures', ...studios.filter(s => !['Disney', 'Warner Bros.', 'Netflix', 'Marvel Studios', 'Universal', 'A24', 'Sony Pictures'].includes(s))].map(st => (
                              <span
                                key={st}
                                className={`prof-tag-pill clickable ${studios.includes(st) ? 'active' : ''}`}
                                onClick={() => setStudios(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st])}
                              >
                                {st}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Movie Preferences section */}
                      <div className="prof-pref-section">
                        <h3 className="prof-pref-title">Movie Preferences</h3>
                        
                        <div className="prof-pref-grid">
                          {/* Genres */}
                          <div className="prof-pref-group">
                            <span className="prof-pref-label">Favorite Genres</span>
                            <div className="prof-tags-container">
                              {['Sci-Fi', 'Action', 'Thriller', 'Adventure', 'Drama'].map(g => (
                                <span 
                                  key={g} 
                                  className={`prof-tag-pill clickable ${genres.includes(g) ? 'active' : ''}`}
                                  onClick={() => toggleGenre(g)}
                                >
                                  {g}
                                </span>
                              ))}
                              <button className="prof-tag-add-btn" onClick={() => addPromptTag(genres, setGenres, 'genre')}>+</button>
                            </div>
                          </div>

                          {/* Actors */}
                          <div className="prof-pref-group">
                            <span className="prof-pref-label">Favorite Actors</span>
                            <div className="prof-tags-container">
                              {actors.map(act => (
                                <span key={act} className="prof-tag-pill">
                                  <div className="prof-circle-avatar-wrap">
                                    <img src={`https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50&q=80`} className="prof-circle-avatar" alt="actor" />
                                    <span>{act}</span>
                                  </div>
                                  <button className="prof-tag-close" onClick={() => removeTag(actors, setActors, act)}>×</button>
                                </span>
                              ))}
                              <button className="prof-tag-add-btn" onClick={() => addPromptTag(actors, setActors, 'actor')}>+</button>
                            </div>
                          </div>

                          {/* Directors */}
                          <div className="prof-pref-group">
                            <span className="prof-pref-label">Favorite Directors</span>
                            <div className="prof-tags-container">
                              {directors.map(dir => (
                                <span key={dir} className="prof-tag-pill">
                                  <div className="prof-circle-avatar-wrap">
                                    <img src={`https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=50&q=80`} className="prof-circle-avatar" alt="director" />
                                    <span>{dir}</span>
                                  </div>
                                  <button className="prof-tag-close" onClick={() => removeTag(directors, setDirectors, dir)}>×</button>
                                </span>
                              ))}
                              <button className="prof-tag-add-btn" onClick={() => addPromptTag(directors, setDirectors, 'director')}>+</button>
                            </div>
                          </div>

                          {/* Franchises */}
                          <div className="prof-pref-group">
                            <span className="prof-pref-label">Favorite Franchises</span>
                            <div className="prof-tags-container">
                              {franchises.map(fran => (
                                <span key={fran} className="prof-tag-pill">
                                  <span style={{ fontWeight: 800, color: 'var(--accent-color)', marginRight: '2px' }}>{fran.slice(0, 3).toUpperCase()}</span>
                                  <span>{fran}</span>
                                  <button className="prof-tag-close" onClick={() => removeTag(franchises, setFranchises, fran)}>×</button>
                                </span>
                              ))}
                              <button className="prof-tag-add-btn" onClick={() => addPromptTag(franchises, setFranchises, 'franchise')}>+</button>
                            </div>
                          </div>

                          {/* Languages */}
                          <div className="prof-pref-group">
                            <span className="prof-pref-label">Favorite Languages</span>
                            <div className="prof-tags-container">
                              {['English', 'Hindi', 'Korean', 'Japanese'].map(lang => (
                                <span 
                                  key={lang} 
                                  className={`prof-tag-pill clickable ${languages.includes(lang) ? 'active' : ''}`}
                                  onClick={() => toggleLanguage(lang)}
                                >
                                  {lang}
                                </span>
                              ))}
                              <button className="prof-tag-add-btn" onClick={() => addPromptTag(languages, setLanguages, 'language')}>+</button>
                            </div>
                          </div>

                          {/* Eras */}
                          <div className="prof-pref-group">
                            <span className="prof-pref-label">Favorite Era</span>
                            <div className="prof-tags-container">
                              {['1990–2000', '2000–2010', '2010–2020', 'Latest'].map(era => (
                                <span 
                                  key={era} 
                                  className={`prof-tag-pill clickable ${eras.includes(era) ? 'active' : ''}`}
                                  onClick={() => toggleEra(era)}
                                >
                                  {era}
                                </span>
                              ))}
                              <button className="prof-tag-add-btn" onClick={() => addPromptTag(eras, setEras, 'era')}>+</button>
                            </div>
                          </div>

                        </div>
                      </div>

                    </div>

                    {/* Action buttons row */}
                    <div className="prof-action-buttons-group">
                      <div className="prof-action-buttons-row">
                        <button className="prof-btn-secondary" onClick={handleCancel}>
                          Cancel
                        </button>
                        <button className="prof-btn-primary-gradient" onClick={handleSaveChanges} disabled={saving}>
                          <span className="prof-btn-icon">💾</span> {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button className="prof-btn-secondary" onClick={() => {
                          localStorage.removeItem(`draft:${profileData.username}`)
                          setDraftSaved(false)
                          setActiveTab('overview')
                        }}>
                          <span className="prof-btn-icon">👁️</span> Preview Profile
                        </button>
                      </div>
                      {draftSaved && (
                        <div className="prof-autosave-status-centered">
                          <span className="check-icon">✓</span> Changes are automatically saved as draft
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* 2. ACCOUNT SETTINGS TAB */}
                {activeTab === 'account_settings' && (
                  <>
                    <div className="prof-pane-header">
                      <div className="prof-pane-title">
                        <h2>Account Settings</h2>
                        <p>Change password, manage sessions, and secure account.</p>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
                      <div className="prof-form-group">
                        <label>Current Password</label>
                        <PasswordInput 
                          className="prof-input" 
                          placeholder="••••••••" 
                          value={pwdForm.current} 
                          onChange={e => setPwdForm(f => ({ ...f, current: e.target.value }))} 
                        />
                      </div>
                      <div className="prof-form-group">
                        <label>New Password</label>
                        <PasswordInput 
                          className="prof-input" 
                          placeholder="••••••••" 
                          value={pwdForm.new} 
                          onChange={e => setPwdForm(f => ({ ...f, new: e.target.value }))} 
                        />
                      </div>
                      <div className="prof-form-group">
                        <label>Confirm New Password</label>
                        <PasswordInput 
                          className="prof-input" 
                          placeholder="••••••••" 
                          value={pwdForm.confirm} 
                          onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))} 
                        />
                      </div>
                    <div className="prof-action-buttons-group">
                      <div className="prof-action-buttons-row" style={{ justifyContent: 'flex-start' }}>
                        <button className="prof-btn-primary-gradient" onClick={handleChangePassword}>
                          Update Password
                        </button>
                      </div>
                      {pwdMessage && (
                        <p style={{ 
                          fontSize: '0.85rem', 
                          color: pwdMessage.includes('success') ? '#2ed573' : '#ff4b2b', 
                          marginTop: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}>
                          {pwdMessage.includes('success') ? '✓' : '⚠️'} {pwdMessage}
                        </p>
                      )}
                    </div>
                    </div>
                  </>
                )}

                {/* 3. PRIVACY SETTINGS TAB */}
                {activeTab === 'privacy_settings' && (
                  <>
                    <div className="prof-pane-header">
                      <div className="prof-pane-title">
                        <h2>Privacy settings</h2>
                        <p>Manage visibility, followers sharing, and messenger settings.</p>
                      </div>
                    </div>
                    <div className="prof-settings-list" style={{ marginTop: '1rem' }}>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Public Profile</span>
                          <span className="prof-settings-sub">Allow anyone on Novaflix to view your profile details.</span>
                        </div>
                        <button 
                          className={`prof-toggle-btn ${privacyToggles.public_profile ? 'active' : ''}`}
                          onClick={() => setPrivacyToggles(prev => ({ ...prev, public_profile: !prev.public_profile }))}
                        />
                      </div>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Private Account</span>
                          <span className="prof-settings-sub">Only approved followers can see your profile details and watched lists.</span>
                        </div>
                        <button 
                          className={`prof-toggle-btn ${privacyToggles.private_account ? 'active' : ''}`}
                          onClick={() => setPrivacyToggles(prev => ({ ...prev, private_account: !prev.private_account }))}
                        />
                      </div>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Show Followers Count</span>
                          <span className="prof-settings-sub">Display the number of followers and following lists on your profile header.</span>
                        </div>
                        <button 
                          className={`prof-toggle-btn ${privacyToggles.show_followers ? 'active' : ''}`}
                          onClick={() => setPrivacyToggles(prev => ({ ...prev, show_followers: !prev.show_followers }))}
                        />
                      </div>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Show Watched Movies</span>
                          <span className="prof-settings-sub">Display watched movies timeline list under your watched tab.</span>
                        </div>
                        <button 
                          className={`prof-toggle-btn ${privacyToggles.show_watched ? 'active' : ''}`}
                          onClick={() => setPrivacyToggles(prev => ({ ...prev, show_watched: !prev.show_watched }))}
                        />
                      </div>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Show Activity Tab</span>
                          <span className="prof-settings-sub">Display your analytics cards and activity stream to viewers.</span>
                        </div>
                        <button 
                          className={`prof-toggle-btn ${privacyToggles.show_activity ? 'active' : ''}`}
                          onClick={() => setPrivacyToggles(prev => ({ ...prev, show_activity: !prev.show_activity }))}
                        />
                      </div>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Allow Messages From</span>
                          <span className="prof-settings-sub">Select who is allowed to send you direct messages.</span>
                        </div>
                        <select 
                          className="prof-select" 
                          value={privacyToggles.allow_messages}
                          onChange={e => setPrivacyToggles(prev => ({ ...prev, allow_messages: e.target.value }))}
                        >
                          <option>Everyone</option>
                          <option>Followers Only</option>
                          <option>Nobody</option>
                        </select>
                      </div>
                    </div>
                    <div className="prof-action-buttons-group">
                      <div className="prof-action-buttons-row" style={{ justifyContent: 'flex-start' }}>
                        <button className="prof-btn-primary-gradient" onClick={handleSaveChanges}>
                          Save Privacy Settings
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: '2.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '2rem' }}>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.5rem' }}>🛡️ Safety & Safety Controls</h3>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        
                        {/* Age Restriction settings */}
                        <div className="prof-settings-row">
                          <div className="prof-settings-info">
                            <span className="prof-settings-lbl">Age Restriction settings</span>
                            <span className="prof-settings-sub">Select minimum rating for movies visible to you.</span>
                          </div>
                          <select 
                            className="prof-select"
                            value={safety.age_restriction}
                            onChange={e => setSafety(prev => ({ ...prev, age_restriction: e.target.value }))}
                          >
                            <option>None</option>
                            <option>13+</option>
                            <option>17+</option>
                          </select>
                        </div>

                        {/* Hidden Words Filter */}
                        <div className="prof-settings-row" style={{ alignItems: 'flex-start' }}>
                          <div className="prof-settings-info">
                            <span className="prof-settings-lbl">Hidden Words Filter</span>
                            <span className="prof-settings-sub">Hide reviews or comments containing these comma-separated words.</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '220px' }}>
                            <input 
                              type="text" 
                              className="prof-input" 
                              placeholder="e.g. spoiler, bad"
                              value={hiddenWordsInput}
                              onChange={e => setHiddenWordsInput(e.target.value)}
                              onBlur={() => {
                                const words = hiddenWordsInput.split(',').map(w => w.trim()).filter(w => w)
                                setSafety(prev => ({ ...prev, hidden_words: words }))
                              }}
                            />
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {safety.hidden_words.map(word => (
                                <span key={word} style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {word}
                                  <button style={{ background: 'none', border: 'none', color: '#ff4b2b', cursor: 'pointer', padding: 0 }} onClick={() => {
                                    setSafety(prev => {
                                      const next = prev.hidden_words.filter(w => w !== word)
                                      setHiddenWordsInput(next.join(', '))
                                      return { ...prev, hidden_words: next }
                                    })
                                  }}>×</button>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Block User Controls */}
                        <div className="prof-settings-row" style={{ alignItems: 'flex-start' }}>
                          <div className="prof-settings-info">
                            <span className="prof-settings-lbl">Block User</span>
                            <span className="prof-settings-sub">Block users from following you, messaging you, or seeing your profile.</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '220px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input 
                                type="text" 
                                className="prof-input" 
                                placeholder="Username"
                                value={blockInput}
                                onChange={e => setBlockInput(e.target.value)}
                              />
                              <button className="btn btn-primary" style={{ padding: '0 12px' }} onClick={() => {
                                if (blockInput.trim()) {
                                  handleSafetyAction(blockInput.trim(), 'block')
                                  setBlockInput('')
                                }
                              }}>Block</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                              {safety.blocked?.map(u => (
                                <div key={u} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', background: 'rgba(255,255,255,0.04)', padding: '4px 8px', borderRadius: '4px' }}>
                                  <span>@{u}</span>
                                  <button style={{ background: 'none', border: 'none', color: '#ff4b2b', cursor: 'pointer' }} onClick={() => handleSafetyAction(u, 'block')}>Unblock</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Mute User Controls */}
                        <div className="prof-settings-row" style={{ alignItems: 'flex-start' }}>
                          <div className="prof-settings-info">
                            <span className="prof-settings-lbl">Mute User</span>
                            <span className="prof-settings-sub">Mute user posts, reviews, and stories from your activity feed.</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '220px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input 
                                type="text" 
                                className="prof-input" 
                                placeholder="Username"
                                value={muteInput}
                                onChange={e => setMuteInput(e.target.value)}
                              />
                              <button className="btn btn-primary" style={{ padding: '0 12px' }} onClick={() => {
                                if (muteInput.trim()) {
                                  handleSafetyAction(muteInput.trim(), 'mute')
                                  setMuteInput('')
                                }
                              }}>Mute</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                              {safety.muted?.map(u => (
                                <div key={u} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', background: 'rgba(255,255,255,0.04)', padding: '4px 8px', borderRadius: '4px' }}>
                                  <span>@{u}</span>
                                  <button style={{ background: 'none', border: 'none', color: '#ff4b2b', cursor: 'pointer' }} onClick={() => handleSafetyAction(u, 'mute')}>Unmute</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Restrict Comments Controls */}
                        <div className="prof-settings-row" style={{ alignItems: 'flex-start' }}>
                          <div className="prof-settings-info">
                            <span className="prof-settings-lbl">Restrict Comments</span>
                            <span className="prof-settings-sub">Restrict a user from commenting on your collections and reviews.</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '220px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input 
                                type="text" 
                                className="prof-input" 
                                placeholder="Username"
                                value={restrictInput}
                                onChange={e => setRestrictInput(e.target.value)}
                              />
                              <button className="btn btn-primary" style={{ padding: '0 12px' }} onClick={() => {
                                if (restrictInput.trim()) {
                                  handleSafetyAction(restrictInput.trim(), 'restrict_comment')
                                  setRestrictInput('')
                                }
                              }}>Restrict</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                              {safety.restricted_comment?.map(u => (
                                <div key={u} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', background: 'rgba(255,255,255,0.04)', padding: '4px 8px', borderRadius: '4px' }}>
                                  <span>@{u}</span>
                                  <button style={{ background: 'none', border: 'none', color: '#ff4b2b', cursor: 'pointer' }} onClick={() => handleSafetyAction(u, 'restrict_comment')}>Unrestrict</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  </>
                )}

                {/* 4. NOTIFICATIONS TAB */}
                {activeTab === 'notifications_settings' && (
                  <>
                    <div className="prof-pane-header">
                      <div className="prof-pane-title">
                        <h2>Notifications settings</h2>
                        <p>Configure which alerts you would like to receive.</p>
                      </div>
                    </div>
                    <div className="prof-settings-list" style={{ marginTop: '1rem' }}>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Follow notifications</span>
                          <span className="prof-settings-sub">Receive alerts when another user follows you.</span>
                        </div>
                        <button 
                          className={`prof-toggle-btn ${notifToggles.follow_notifs ? 'active' : ''}`}
                          onClick={() => setNotifToggles(prev => ({ ...prev, follow_notifs: !prev.follow_notifs }))}
                        />
                      </div>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Message notifications</span>
                          <span className="prof-settings-sub">Receive notifications for incoming chat messages.</span>
                        </div>
                        <button 
                          className={`prof-toggle-btn ${notifToggles.message_notifs ? 'active' : ''}`}
                          onClick={() => setNotifToggles(prev => ({ ...prev, message_notifs: !prev.message_notifs }))}
                        />
                      </div>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Movie recommendations</span>
                          <span className="prof-settings-sub">Receive weekly recommended movie alerts based on preferences.</span>
                        </div>
                        <button 
                          className={`prof-toggle-btn ${notifToggles.recommend_notifs ? 'active' : ''}`}
                          onClick={() => setNotifToggles(prev => ({ ...prev, recommend_notifs: !prev.recommend_notifs }))}
                        />
                      </div>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Like notifications</span>
                          <span className="prof-settings-sub">Receive alerts when someone likes your movie review.</span>
                        </div>
                        <button 
                          className={`prof-toggle-btn ${notifToggles.like_notifs ? 'active' : ''}`}
                          onClick={() => setNotifToggles(prev => ({ ...prev, like_notifs: !prev.like_notifs }))}
                        />
                      </div>
                      <div className="prof-settings-row">
                        <div className="prof-settings-info">
                          <span className="prof-settings-lbl">Comment notifications</span>
                          <span className="prof-settings-sub">Receive alerts when someone comments on your lists or reviews.</span>
                        </div>
                        <button 
                          className={`prof-toggle-btn ${notifToggles.comment_notifs ? 'active' : ''}`}
                          onClick={() => setNotifToggles(prev => ({ ...prev, comment_notifs: !prev.comment_notifs }))}
                        />
                      </div>
                    </div>
                    <div className="prof-action-buttons-group">
                      <div className="prof-action-buttons-row" style={{ justifyContent: 'flex-start' }}>
                        <button className="prof-btn-primary-gradient" onClick={handleSaveChanges}>
                          Save Notifications
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* 5. THEME & APPEARANCE TAB */}
                {activeTab === 'theme_settings' && (
                  <>
                    <div className="prof-pane-header">
                      <div className="prof-pane-title">
                        <h2>Theme & Appearance</h2>
                        <p>Change your profile accent color and background gradients.</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
                      <div className="prof-form-group">
                        <label>Accent Color</label>
                        <div className="prof-colors-row">
                          {ACCENT_COLORS.map(c => (
                            <div 
                              key={c.hex} 
                              className={`prof-color-dot ${accentColor === c.hex ? 'active' : ''}`}
                              style={{ backgroundColor: c.hex }}
                              onClick={() => setAccentColor(c.hex)}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="prof-form-group">
                        <label>Profile Theme / Background</label>
                        <div className="prof-bg-row">
                          {BG_THEMES.map(t => (
                            <div 
                              key={t.id} 
                              className={`prof-bg-thumb ${bgTheme === t.id ? 'active' : ''}`}
                              style={t.style}
                              onClick={() => setBgTheme(t.id)}
                            >
                              {bgTheme === t.id && <span className="prof-bg-check">✓</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="prof-action-buttons-group">
                      <div className="prof-action-buttons-row" style={{ justifyContent: 'flex-start' }}>
                        <button className="prof-btn-primary-gradient" onClick={handleSaveChanges}>
                          Save Theme settings
                        </button>
                      </div>
                    </div>
                  </>
                )}

              </div>

              {/* Right Settings Pane (Completion & Analytics) */}
              <div className="prof-right-pane">
                {/* 1. Profile Completion Ring */}
                <div className="prof-settings-pane">
                  <h4 className="prof-widget-title" style={{ marginBottom: '1rem' }}>Profile Completion</h4>
                  <div className="prof-completion-ring-wrap">
                    <div className="prof-ring-svg-container">
                      <svg width="72" height="72" className="prof-ring-svg">
                        <circle cx="36" cy="36" r="32" className="prof-ring-bg" />
                        <circle 
                          cx="36" cy="36" r="32" 
                          className="prof-ring-fill" 
                          strokeDasharray={2 * Math.PI * 32}
                          strokeDashoffset={2 * Math.PI * 32 * (1 - completionPercentage / 100)}
                        />
                      </svg>
                      <div className="prof-completion-text-center">
                        <span className="prof-completion-num">{completionPercentage}%</span>
                        <span className="prof-completion-lbl">Done</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>Profile Strength</span>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>Checklist completed</span>
                    </div>
                  </div>
                  <div className="prof-checklist">
                    {checklist.map((item, idx) => (
                      <div key={idx} className={`prof-checklist-item ${item.done ? 'done' : ''}`}>
                        <span>{item.label}</span>
                        <span className="prof-check-icon">{item.done ? '✓' : '○'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Activity Insights */}
                <div className="prof-settings-pane">
                  <h4 className="prof-widget-title" style={{ marginBottom: '1rem' }}>Activity Insights</h4>
                  <div className="prof-insights-grid">
                    <div className="prof-insight-card">
                      <span className="prof-insight-hdr">🎬 Watched</span>
                      <span className="prof-insight-val">{moviesCount}</span>
                      <span className="prof-insight-sub">Total Movies</span>
                    </div>
                    <div className="prof-insight-card">
                      <span className="prof-insight-hdr">⏱ Watch Hours</span>
                      <span className="prof-insight-val">{activityStats?.all_time?.watch_time || 0}h</span>
                      <span className="prof-insight-sub">Total hours</span>
                    </div>
                    <div className="prof-insight-card">
                      <span className="prof-insight-hdr">❤️ Wishlist</span>
                      <span className="prof-insight-val">{profileData.wishlist?.length || 0}</span>
                      <span className="prof-insight-sub">Movies</span>
                    </div>
                    <div className="prof-insight-card">
                      <span className="prof-insight-hdr">⭐ Reviews</span>
                      <span className="prof-insight-val">{reviewsCount}</span>
                      <span className="prof-insight-sub">Reviews</span>
                    </div>
                  </div>
                </div>

                {/* 3. Privacy Settings preview */}
                <div className="prof-settings-pane">
                  <h4 className="prof-widget-title" style={{ marginBottom: '1rem' }}>Privacy Overview</h4>
                  <div className="prof-settings-list">
                    <div className="prof-settings-row">
                      <span className="prof-settings-lbl" style={{ fontSize: '0.78rem' }}>Public Profile</span>
                      <span style={{ fontSize: '0.8rem', color: privacyToggles.public_profile ? '#2ed573' : 'rgba(255,255,255,0.3)' }}>
                        {privacyToggles.public_profile ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>
                    <div className="prof-settings-row">
                      <span className="prof-settings-lbl" style={{ fontSize: '0.78rem' }}>Private Account</span>
                      <span style={{ fontSize: '0.8rem', color: privacyToggles.private_account ? '#2ed573' : 'rgba(255,255,255,0.3)' }}>
                        {privacyToggles.private_account ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>
                    <div className="prof-settings-row">
                      <span className="prof-settings-lbl" style={{ fontSize: '0.78rem' }}>Direct Messages</span>
                      <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                        {privacyToggles.allow_messages}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            /* ── MAIN PROFILE DETAIL TABS VIEWS ── */
            <div className="prof-detail-pane">
              
              {/* Profile Main Header card */}
              <div className="prof-header-panel">
                <div style={{ position: 'relative' }}>
                  <img 
                    src={formFields.cover_url || FALLBACK_COVER} 
                    alt="cover" 
                    style={{ width: '100%', height: 200, objectFit: 'cover' }}
                    onError={e => e.target.src = FALLBACK_COVER}
                  />
                </div>

                <div className="prof-header-content">
                  <div className="prof-header-avatar-wrap">
                    <img 
                      src={formFields.photo_url || FALLBACK_AVATAR} 
                      alt="avatar" 
                      className="prof-header-avatar"
                      onError={e => e.target.src = FALLBACK_AVATAR}
                    />
                  </div>

                  <div className="prof-header-info">
                    <div className="prof-name-verified-row">
                      <h2 className="prof-display-name">{formFields.name || formFields.username}</h2>
                      <span className="prof-verified-badge" title="Verified Cinephile">✓</span>
                      <span style={{ fontSize: '0.75rem', background: 'rgba(255,200,0,0.15)', color: '#ffd700', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,200,0,0.3)', marginLeft: '4px', fontWeight: 700 }}>
                        Premium
                      </span>
                    </div>
                    <span className="prof-handle-text">@{formFields.username}</span>
                    <p className="prof-bio-text">{formFields.bio || 'Movie Lover | Reviews | Series Addict 🎬'}</p>
                    
                    <div className="prof-meta-row">
                      {formFields.location && <span className="prof-meta-item">📍 {formFields.location}</span>}
                      {formFields.website && (
                        <a href={formFields.website} target="_blank" rel="noreferrer" className="prof-meta-item" style={{ color: 'var(--accent-color)', textDecoration: 'none' }}>
                          🔗 {formFields.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                      <span className="prof-meta-item">📅 Joined May 2026</span>
                    </div>
                  </div>

                  {/* Header Stats and action */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div className="prof-header-stats">
                      <div className="prof-header-stat" onClick={() => { setModalType('followers'); setFollowSearchQuery(''); }}>
                        <span className="prof-header-stat-val">{profileData.followers_count || 0}</span>
                        <span className="prof-header-stat-lbl">Followers</span>
                      </div>
                      <div className="prof-header-stat" onClick={() => { setModalType('following'); setFollowSearchQuery(''); }}>
                        <span className="prof-header-stat-val">{profileData.following_count || 0}</span>
                        <span className="prof-header-stat-lbl">Following</span>
                      </div>
                      <div className="prof-header-stat" onClick={() => setActiveTab('favorites')}>
                        <span className="prof-header-stat-val">{profileData.favorite_list?.length || 0}</span>
                        <span className="prof-header-stat-lbl">Favorites</span>
                      </div>
                    </div>
                    <button className="prof-header-action-btn" onClick={() => setActiveTab('edit_profile')}>
                      ✏️ Edit Profile
                    </button>
                  </div>
                </div>

                {/* Profile tabs navigation bar */}
                <div className="prof-tab-bar">
                  <button className={`prof-tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                    Overview
                  </button>
                  <button className={`prof-tab-btn ${activeTab === 'movie_dna' ? 'active' : ''}`} onClick={() => setActiveTab('movie_dna')}>
                    Movie DNA
                  </button>
                  <button className={`prof-tab-btn ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
                    Activity
                  </button>
                  <button className={`prof-tab-btn ${activeTab === 'wishlist' ? 'active' : ''}`} onClick={() => setActiveTab('wishlist')}>
                    Watchlist <span className="prof-tab-count">{profileData.wishlist?.length || 0}</span>
                  </button>
                  <button className={`prof-tab-btn ${activeTab === 'watched' ? 'active' : ''}`} onClick={() => setActiveTab('watched')}>
                    Watched <span className="prof-tab-count">{profileData.watched_list?.length || 0}</span>
                  </button>
                  <button className={`prof-tab-btn ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>
                    Favorites <span className="prof-tab-count">{profileData.favorite_list?.length || 0}</span>
                  </button>
                  <button className={`prof-tab-btn ${activeTab === 'ratings' ? 'active' : ''}`} onClick={() => setActiveTab('ratings')}>
                    Ratings <span className="prof-tab-count">{profileData.ratings?.length || 0}</span>
                  </button>
                  <button className={`prof-tab-btn ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
                    Reviews
                  </button>
                </div>
              </div>

              {/* RENDER THE ACTIVE SUB-PANEL VIEW */}
              <div className="prof-tab-content-panel">
                
                {/* 0. TAB: MOVIE DNA */}
                {activeTab === 'movie_dna' && renderMovieDNAPanel()}

                {/* 1. TAB: OVERVIEW */}
                {activeTab === 'overview' && (
                  <div className="prof-overview-container">
                    {/* Favorite Movies */}
                    {profileData.favorite_list?.length > 0 && (
                      <div>
                        <div className="prof-section-heading">
                          <span>⭐ Favorite Movies</span>
                          <button className="prof-section-link" onClick={() => setActiveTab('favorites')}>View All</button>
                        </div>
                        <div className="prof-movies-scroll-row">
                          {profileData.favorite_list.map((m, i) => (
                            <MovieThumb key={i} title={m} onClick={() => navigate(`/movie?title=${encodeURIComponent(m)}`)} />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="prof-overview-columns">
                      {/* About me */}
                      <div>
                        <div className="prof-section-heading">
                          <span>🧑 About Me</span>
                        </div>
                        <div className="prof-about-box">
                          <p>{formFields.bio || 'Movie reviewer and explorer. I watch movies so you don\'t have to. Rating what\'s worth your time.'}</p>
                          {formFields.location && <div className="prof-about-row-data">📍 Lives in {formFields.location}</div>}
                          {formFields.birthday && <div className="prof-about-row-data">🎂 Birthday: {formFields.birthday}</div>}
                          <div className="prof-about-row-data"> Cinephile Level: {cinephileLevel}</div>
                        </div>
                      </div>

                      {/* Favorite Genres progress overview */}
                      <div>
                        <div className="prof-section-heading">
                          <span>🎭 Favorite Genres</span>
                        </div>
                        <div className="prof-about-box" style={{ gap: '0.85rem' }}>
                          {genres.length === 0 ? (
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)' }}>No favorite genres selected. Go edit your profile to add some!</p>
                          ) : (
                            genres.map((g, idx) => (
                              <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700 }}>
                                  <span>{g}</span>
                                  <span>{85 - idx * 8}%</span>
                                </div>
                                <div className="prof-widget-bar-track" style={{ height: '4px' }}>
                                  <div className="prof-widget-bar-fill" style={{ width: `${85 - idx * 8}%`, background: 'var(--accent-color)' }}></div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. TAB: ACTIVITY */}
                {activeTab === 'activity' && (
                  <ActivityTab />
                )}

                {/* 3. TAB: WISHLIST */}
                {activeTab === 'wishlist' && (
                  <MovieGrid titles={profileData.wishlist} emptyMsg="No movies in your watchlist." onMovieClick={(t) => navigate(`/movie?title=${encodeURIComponent(t)}`)} />
                )}

                {/* 4. TAB: WATCHED */}
                {activeTab === 'watched' && (
                  <MovieGrid titles={profileData.watched_list} emptyMsg="No watched movies yet." onMovieClick={(t) => navigate(`/movie?title=${encodeURIComponent(t)}`)} />
                )}

                {/* 5. TAB: FAVORITES */}
                {activeTab === 'favorites' && (
                  <MovieGrid titles={profileData.favorite_list} emptyMsg="No favorite movies added." onMovieClick={(t) => navigate(`/movie?title=${encodeURIComponent(t)}`)} />
                )}

                {/* 6. TAB: REVIEWS (List user's own interactions that contain reviews) */}
                {activeTab === 'reviews' && (
                  <ReviewsList interactions={profileData.interactions} onMovieClick={(t) => navigate(`/movie?title=${encodeURIComponent(t)}`)} />
                )}

                {/* TAB: RATINGS */}
                {activeTab === 'ratings' && (
                  <RatingsTab ratings={profileData.ratings} onMovieClick={(t) => navigate(`/movie?title=${encodeURIComponent(t)}`)} />
                )}

                {/* 7. TAB: FOLLOWERS / FOLLOWING */}
                {(activeTab === 'followers' || activeTab === 'following') && (
                  <div className="prof-users-grid">
                    {/* Return mock lists because real lists might be empty, or render real ones if available */}
                    {activeTab === 'followers' ? (
                      /* Mock followers */
                      <>
                        <UserCard username="alex_morgan" name="Alex Morgan" img="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80" onClick={() => navigate('/user/alex_morgan')} />
                        <UserCard username="sarah_k" name="Sarah Khan" img="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80" onClick={() => navigate('/user/sarah_k')} />
                        <UserCard username="daniel_m" name="Daniel M" img="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80" onClick={() => navigate('/user/daniel_m')} />
                      </>
                    ) : (
                      /* Mock following */
                      <>
                        <UserCard username="alex_morgan" name="Alex Morgan" img="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80" onClick={() => navigate('/user/alex_morgan')} />
                        <UserCard username="isifraan.14" name="Isifraan" img="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80" onClick={() => navigate('/user/isifraan.14')} />
                      </>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

        </div>
      </div>

      {/* Upload Image Modal */}
      <ImageUploadModal 
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUpload={handleImageUpload}
        type={uploadType}
      />

      {/* Instagram-style followers/following popup modal */}
      {renderInstaModal()}
    </div>
  )

  function renderInstaModal() {
    if (!modalType) return null

    const title = modalType === 'followers' ? 'Followers' : 'Following'
    const sourceList = modalType === 'followers' ? profileData.followers : profileData.following

    const defaultList = modalType === 'followers' ? [
      { username: 'alex_morgan', name: 'Alex Morgan', photo_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80' },
      { username: 'sarah_k', name: 'Sarah Khan', photo_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80' },
      { username: 'daniel_m', name: 'Daniel M', photo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80' }
    ] : [
      { username: 'alex_morgan', name: 'Alex Morgan', photo_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80' },
      { username: 'isifraan.14', name: 'Isifraan', photo_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80' }
    ]

    const displayList = (sourceList && sourceList.length > 0) ? sourceList : defaultList

    const filteredList = displayList.filter(u =>
      u.username.toLowerCase().includes(followSearchQuery.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(followSearchQuery.toLowerCase()))
    )

    const handleFollowClick = async (targetUsername) => {
      const isCurrentlyFollowing = profileData.following?.some(f => f.username === targetUsername) || false
      try {
        if (isCurrentlyFollowing) {
          await api.delete(`/users/${encodeURIComponent(targetUsername)}/follow`)
          setProfileData(prev => ({
            ...prev,
            following_count: Math.max(0, prev.following_count - 1),
            following: prev.following.filter(f => f.username !== targetUsername)
          }))
        } else {
          await api.post(`/users/${encodeURIComponent(targetUsername)}/follow`)
          const userObj = displayList.find(u => u.username === targetUsername) || { username: targetUsername, name: targetUsername }
          setProfileData(prev => ({
            ...prev,
            following_count: prev.following_count + 1,
            following: [...(prev.following || []), userObj]
          }))
        }
      } catch (err) {
        console.error(err)
      }
    }

    return (
      <div className="insta-modal-overlay" onClick={() => setModalType(null)}>
        <div className="insta-modal" onClick={e => e.stopPropagation()}>
          <div className="insta-modal-header">
            <h3 className="insta-modal-title">{title}</h3>
            <button className="insta-close-btn" onClick={() => setModalType(null)}>&times;</button>
          </div>

          <div className="insta-search-container">
            <input
              type="text"
              className="insta-search-input"
              placeholder={`Search ${title.toLowerCase()}...`}
              value={followSearchQuery}
              onChange={e => setFollowSearchQuery(e.target.value)}
            />
          </div>

          <div className="insta-modal-body">
            {filteredList.length > 0 ? filteredList.map(u => {
              const isFollowingUser = profileData.following?.some(f => f.username === u.username) || false
              const isMe = u.username === user?.username

              return (
                <div key={u.username} className="insta-user-item">
                  <div className="insta-user-info" onClick={() => { setModalType(null); navigate(`/user/${u.username}`); }}>
                    <img
                      src={u.photo_url || "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"}
                      alt={u.username}
                      onError={e => e.target.src = "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"}
                    />
                    <div className="insta-user-details">
                      <span className="insta-user-name">{u.name || u.username}</span>
                      <span className="insta-user-username">@{u.username}</span>
                    </div>
                  </div>
                  {!isMe && (
                    <button
                      className={`insta-follow-btn ${isFollowingUser ? 'following' : 'follow'}`}
                      onClick={() => handleFollowClick(u.username)}
                    >
                      {isFollowingUser ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
              )
            }) : <p className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>No users found.</p>}
          </div>
        </div>
      </div>
    )
  }


  function renderMovieDNAPanel() {
    const dna = activityStats?.movie_dna || {}
    const badgesList = gamification?.badges || []

    return (
      <div className="prof-movie-dna-tab-container fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Movie DNA Card */}
        <div className="glass-panel" style={{ padding: '2rem', borderRadius: '18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📊 Genre Breakdown
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {dna.genres?.map((g, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700 }}>
                    <span>{g.genre}</span>
                    <span>{g.pct}%</span>
                  </div>
                  <div className="prof-widget-bar-track" style={{ height: '6px' }}>
                    <div className="prof-widget-bar-fill" style={{ width: `${g.pct}%`, background: 'var(--accent-color)' }}></div>
                  </div>
                </div>
              ))}
              {(!dna.genres || dna.genres.length === 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem', margin: 0 }}>Watch movies to build your DNA profile!</p>
                  {['Action', 'Drama', 'Sci-Fi', 'Thriller', 'Comedy'].map((g, idx) => (
                    <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: '4px', opacity: 0.35 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700 }}>
                        <span>{g}</span><span>{40 - idx * 8}%</span>
                      </div>
                      <div className="prof-widget-bar-track" style={{ height: '6px' }}>
                        <div className="prof-widget-bar-fill" style={{ width: `${40 - idx * 8}%`, background: 'var(--accent-color)' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', justifyContent: 'center', paddingLeft: '1rem', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700 }}>Favorite Director</span>
              <h4 style={{ fontSize: '1.2rem', margin: '4px 0 0', color: '#fff' }}>🎬 {dna.favorite_director || 'N/A'}</h4>
            </div>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700 }}>Watch Time</span>
              <h4 style={{ fontSize: '1.2rem', margin: '4px 0 0', color: '#fff' }}>⏱️ {dna.watch_time || 0} Hours</h4>
            </div>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700 }}>Movie Personality</span>
              <h4 style={{ fontSize: '1.2rem', margin: '4px 0 0', color: 'var(--accent-color)' }}>{dna.personality || 'Cinephile Pioneer 🎬'}</h4>
            </div>
          </div>
        </div>

        {/* Level and XP Bar */}
        <div className="glass-panel" style={{ padding: '2rem', borderRadius: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #7b61ff, #ff61d2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', color: '#fff' }}>
                {cinephileLevel}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Level {cinephileLevel} Movie Addict</h4>
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)' }}>{500 - levelXpProgress} XP to Level {cinephileLevel + 1}</span>
              </div>
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-color)' }}>{xp} Total XP</span>
          </div>
          <div className="prof-widget-bar-track" style={{ height: '8px' }}>
            <div className="prof-widget-bar-fill" style={{ width: `${(levelXpProgress / 500) * 100}%` }}></div>
          </div>
        </div>

        {/* Badges and Achievements */}
        <div className="glass-panel" style={{ padding: '2rem', borderRadius: '18px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.5rem' }}>
            🏆 Badges &amp; Achievements
          </h3>
          {badgesList.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem' }}>
              Watch movies, write reviews, and follow users to earn badges!
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem' }}>
              {badgesList.map((badge, idx) => (
                <div key={idx} className="badge-item-card" style={{
                  background: badge.completed ? 'rgba(123, 97, 255, 0.08)' : 'rgba(255,255,255,0.01)',
                  border: badge.completed ? '1px solid rgba(123, 97, 255, 0.3)' : '1px solid rgba(255,255,255,0.04)',
                  borderRadius: '12px',
                  padding: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'transform 0.2s'
                }}>
                  <div style={{
                    fontSize: '2rem',
                    filter: badge.completed ? 'none' : 'grayscale(100%) opacity(40%)'
                  }}>
                    {badge.id === 'explorer' && '🍿'}
                    {badge.id === 'scifi' && '🚀'}
                    {badge.id === 'horror' && '💀'}
                    {badge.id === 'nolan' && '🧠'}
                    {badge.id === 'reviewer' && '📝'}
                    {badge.id === 'critic' && '🎭'}
                    {badge.id === 'col_master' && '📂'}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: badge.completed ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                        {badge.name}
                      </span>
                      <span style={{ fontSize: '0.72rem', background: badge.completed ? 'rgba(46,213,115,0.2)' : 'rgba(255,255,255,0.08)', color: badge.completed ? '#2ed573' : 'rgba(255,255,255,0.45)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        {badge.completed ? 'Unlocked' : `${badge.current}/${badge.target}`}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{badge.desc}</span>
                    {!badge.completed && (
                      <div className="prof-widget-bar-track" style={{ height: '3px', marginTop: '4px' }}>
                        <div className="prof-widget-bar-fill" style={{ width: `${Math.min(100, (badge.current / badge.target) * 100)}%` }}></div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    )
  }
}

// ── Secondary Components ──


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

function RatingsTab({ ratings, onMovieClick }) {
  const ratedMovies = ratings || []

  // Calculate average rating
  const avgRating = ratedMovies.length > 0 
    ? (ratedMovies.reduce((acc, curr) => acc + curr.rating, 0) / ratedMovies.length).toFixed(1)
    : 'N/A'

  if (ratedMovies.length === 0) {
    return <div className="at-empty-state">You haven't rated any movies yet.</div>
  }

  return (
    <div className="prof-ratings-tab-container">
      {/* Average rating card */}
      <div className="profile-avg-rating-banner glass">
        <span className="avg-rating-icon">🟣</span>
        <div className="avg-rating-details">
          <span className="avg-rating-num">{avgRating}</span>
          <span className="avg-rating-lbl">NovaFlix Average Rating</span>
        </div>
      </div>

      <div className="prof-ratings-list">
        {ratedMovies.map((m, idx) => (
          <div key={idx} className="prof-rating-card glass">
            <span className="prof-rating-movie-title" style={{ cursor: 'pointer' }} onClick={() => onMovieClick(m.title)}>
              {m.title}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#c084fc', fontWeight: '800' }}>🟣 {m.rating}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>- {m.rating_text || RATING_MEANINGS[m.rating] || 'Rated'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MovieThumb({ title, onClick }) {
  const [poster, setPoster] = useState(FALLBACK_AVATAR)

  useEffect(() => {
    api.get(`/movies/details?title=${encodeURIComponent(title)}`)
      .then(r => setPoster(r.data.poster || FALLBACK_AVATAR))
      .catch(() => {})
  }, [title])

  return (
    <div className="prof-movie-thumb-card" onClick={onClick}>
      <img src={poster} alt={title} onError={e => e.target.src = FALLBACK_AVATAR} />
    </div>
  )
}

function MovieGrid({ titles, emptyMsg, onMovieClick }) {
  if (!titles || titles.length === 0) {
    return <div className="at-empty-state">{emptyMsg}</div>
  }

  return (
    <div className="prof-movies-grid">
      {titles.map(title => (
        <MovieGridCard key={title} title={title} onClick={() => onMovieClick(title)} />
      ))}
    </div>
  )
}

function MovieGridCard({ title, onClick }) {
  const [movie, setMovie] = useState(null)

  useEffect(() => {
    api.get(`/movies/details?title=${encodeURIComponent(title)}`)
      .then(r => setMovie(r.data))
      .catch(() => {})
  }, [title])

  if (!movie) {
    return (
      <div className="prof-grid-movie-card" onClick={onClick}>
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)' }}>
          <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="prof-grid-movie-card" onClick={onClick}>
      <img src={movie.poster || FALLBACK_AVATAR} alt={movie.title} onError={e => e.target.src = FALLBACK_AVATAR} />
      <div className="prof-grid-movie-info">
        <span className="prof-grid-movie-title">{movie.title}</span>
        <span className="prof-grid-movie-year">{movie.year}</span>
        {movie.rating && movie.rating !== 'N/A' && (
          <span className="prof-grid-movie-rating">⭐ {movie.rating}</span>
        )}
      </div>
    </div>
  )
}

function ReviewsList({ interactions, onMovieClick }) {
  const reviews = []
  if (interactions) {
    Object.keys(interactions).forEach(movieTitle => {
      const data = interactions[movieTitle]
      if (data.review || data.rating) {
        reviews.push({
          title: movieTitle,
          review: data.review || 'No written review.',
          rating: data.rating,
          timestamp: data.watch_timestamp
        })
      }
    })
  }

  if (reviews.length === 0) {
    return <div className="at-empty-state">You haven't reviewed any movies yet.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {reviews.map((rev, index) => (
        <div key={index} className="glass-panel" style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', padding: '1.2rem' }}>
          <MovieThumb title={rev.title} onClick={() => onMovieClick(rev.title)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: '#fff', cursor: 'pointer' }} onClick={() => onMovieClick(rev.title)}>
                {rev.title}
              </h4>
              {rev.rating && <span style={{ color: '#ffd700', fontSize: '0.85rem', fontWeight: 800 }}>⭐ {rev.rating} / 10</span>}
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
              "{rev.review}"
            </p>
            {rev.timestamp > 0 && (
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>
                Reviewed on {new Date(rev.timestamp * 1000).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function UserCard({ username, name, img, onClick }) {
  return (
    <div className="prof-user-card" onClick={onClick}>
      <div className="prof-user-details-wrap">
        <img src={img} alt={username} className="prof-user-img" />
        <div className="prof-user-names">
          <span className="prof-user-display">{name}</span>
          <span className="prof-user-username">@{username}</span>
        </div>
      </div>
      <button className="prof-select" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}>View</button>
    </div>
  )
}
