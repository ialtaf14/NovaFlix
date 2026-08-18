import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './store/useAuthStore'
import api from './services/api'
import { SpeedInsights } from '@vercel/speed-insights/react'

import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import RecommendSidebar from './components/RecommendSidebar'
import BottomNav from './components/BottomNav'
import Series from './pages/Series';
import SeriesDetails from './pages/SeriesDetails';
import Anime from './pages/Anime';
import AnimeDetails from './pages/AnimeDetails';
import Login from './pages/Login'
import Discover from './pages/Discover'
import Recommended from './pages/Recommended'
import Movies from './pages/Movies'
import MovieDetails from './pages/MovieDetails'
import ActorDetails from './pages/ActorDetails'
import Profile from './pages/Profile'
import UserProfile from './pages/UserProfile'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Search from './pages/Search'
import Notifications from './pages/Notifications'
import Messages from './pages/Messages'
import WatchParty from './pages/WatchParty'
import Collections from './pages/Collections'
import ActivityFeed from './pages/ActivityFeed'

import InteractiveBackground from './components/InteractiveBackground'

function ProtectedLayout() {
  const [scrollDirection, setScrollDirection] = useState('up')
  const [isRecommendOpen, setIsRecommendOpen] = useState(false)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const handleOpen = () => {
      setIsRecommendOpen(true)
    }
    window.addEventListener('novaflix_open_recommendations', handleOpen)
    return () => window.removeEventListener('novaflix_open_recommendations', handleOpen)
  }, [])

  useEffect(() => {
    let lastScrollY = window.pageYOffset || document.documentElement.scrollTop
    let ticking = false

    const handleScroll = () => {
      const scrollY = window.pageYOffset || document.documentElement.scrollTop

      // Minimum scroll threshold to avoid jitter
      if (Math.abs(scrollY - lastScrollY) < 10) {
        ticking = false
        return
      }

      if (scrollY > lastScrollY && scrollY > 60) {
        setScrollDirection('down')
      } else {
        setScrollDirection('up')
      }
      lastScrollY = scrollY
      ticking = false
    }

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(handleScroll)
        ticking = true
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const hideBottomNav = ['/search', '/notifications', '/messages', '/profile', '/watch-party'].some(path =>
    location.pathname.startsWith(path)
  ) || location.pathname === '/movie'

  const isNavVisible = scrollDirection === 'up'

  return (
    <>
      <InteractiveBackground />
      <Navbar
        visible={isNavVisible}
        onToggleRecommend={() => setIsRecommendOpen(!isRecommendOpen)}
        onToggleNotif={() => setIsNotifOpen(!isNotifOpen)}
      />
      <RecommendSidebar isOpen={isRecommendOpen} onClose={() => setIsRecommendOpen(false)} />
      <Notifications isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
      <Routes>
        <Route path="/discover"      element={<Discover />} />
        <Route path="/movies"        element={<Movies />} />
        <Route path="/series" element={<Series />} />
        <Route path="/series/:title" element={<SeriesDetails />} />
        <Route path="/anime" element={<Anime />} />
        <Route path="/anime/:title" element={<AnimeDetails />} />
        <Route path="/recommended"   element={<Recommended />} />
        <Route path="/movie"         element={<MovieDetails />} />
        <Route path="/actor"         element={<ActorDetails />} />
        <Route path="/profile"       element={<Profile />} />
        <Route path="/user/:username" element={<UserProfile />} />
        <Route path="/privacy"       element={<PrivacyPolicy />} />
        <Route path="/search"        element={<Search />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/messages"      element={<Messages />} />
        <Route path="/watch-party"   element={<WatchParty />} />
        <Route path="/collections"   element={<Collections />} />
        <Route path="/activity-feed" element={<ActivityFeed />} />
        <Route path="/"             element={<Navigate to="/discover" replace />} />
        <Route path="*"             element={<Navigate to="/discover" replace />} />
      </Routes>
      {!hideBottomNav && <BottomNav visible={isNavVisible} />}
    </>
  )
}

export default function App() {
  const token = useAuthStore((s) => s.token)
  const [initialized, setInitialized] = useState(false)

  // On load: validate stored token with /api/auth/me
  useEffect(() => {
    if (!token) {
      setInitialized(true)
      return
    }

    let isMounted = true
    let validationAttempts = 0
    const maxRetries = 3

    const validateToken = async () => {
      try {
        const response = await api.get('/auth/me')
        if (isMounted) {
          // Update user data from /auth/me response
          useAuthStore.getState().setAuth(response.data, token)
          setInitialized(true)
        }
      } catch (err) {
        if (!isMounted) return

        const status = err.response?.status
        const isAuthFailure = status === 401 || status === 403
        const isNetworkError = !err.response || err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK'

        if (isNetworkError && validationAttempts < maxRetries) {
          validationAttempts++
          console.warn('[Auth] Network error validating token, retrying...', { attempt: validationAttempts })
          // Exponential backoff: 1s, 2s, 4s
          setTimeout(validateToken, 1000 * validationAttempts)
        } else if (isAuthFailure) {
          // Only logout on explicit auth failures (401/403) from /auth/me
          console.warn('[Auth] Token validation failed with status:', status)
          useAuthStore.getState().logout()
          setInitialized(true)
        } else {
          // Network fully down or server error — keep user logged in
          // The user is not truly unauthenticated, the server is just unavailable
          console.warn('[Auth] Could not validate token (server error/offline):', err.message, '— keeping session')
          setInitialized(true)
        }
      }
    }

    validateToken()

    return () => {
      isMounted = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Periodic session refresh to keep user logged in during inactivity
  // Only refresh when tab is visible
  useEffect(() => {
    if (!token) return

    // Track tab visibility
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.debug('[Auth] Tab hidden - pausing session refresh')
      } else {
        console.debug('[Auth] Tab visible - resuming session refresh')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Refresh session every 15 minutes, but only if tab is visible
    const refreshInterval = setInterval(() => {
      if (document.hidden) {
        console.debug('[Auth] Skipping refresh (tab hidden)')
        return
      }

      api.post('/auth/refresh-session')
        .then(() => {
          console.debug('[Auth] Session refreshed')
        })
        .catch((err) => {
          // Silently fail - next validation will catch if session is truly expired
          console.debug('[Auth] Session refresh failed:', err.response?.status)
        })
    }, 15 * 60 * 1000) // 15 minutes

    return () => {
      clearInterval(refreshInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [token])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected */}
        <Route path="/*" element={
          <ProtectedRoute>
            <ProtectedLayout />
          </ProtectedRoute>
        } />
      </Routes>
      <SpeedInsights />
    </BrowserRouter>
  )
}
