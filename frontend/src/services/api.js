import axios from 'axios'
import { useAuthStore } from '../store/useAuthStore'

// In production (Netlify), use the Render backend URL
// In development, use the Vite proxy (/api)
const BASE_URL = '/api'
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000 // 10 second timeout
})

// ─── Request Deduplication Cache ─────────────────────────────────────────────
// Prevents duplicate GET requests within a short time window
const requestCache = new Map() // { cacheKey: { data, timestamp, promise } }
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Endpoints that must NEVER be cached — real-time / per-user critical data
const NO_CACHE_PATTERNS = [
  '/chat',           // conversations & message history (real-time)
  '/social/stories', // stories change constantly
  '/notifications',  // unread counts
  '/users/me',       // own profile
  '/social/activity',
]

// Only logout when these auth endpoints return 401/403
// (other endpoints returning 401 means "feature requires auth", not "session expired")
const AUTH_ENDPOINTS = [
  '/auth/me',
  '/auth/refresh-session',
]

const isNoCacheUrl = (url = '') =>
  NO_CACHE_PATTERNS.some(p => url.startsWith(p) || url.includes(p))

const isAuthEndpoint = (url = '') =>
  AUTH_ENDPOINTS.some(p => url === p || url.endsWith(p))

// Clear the whole request cache (called on login/logout so one user's
// data can never leak into another account's session)
export const clearApiCache = () => requestCache.clear()

const generateCacheKey = (config) => {
  // Cache GET requests only, and never for real-time endpoints
  if (config.method?.toUpperCase() === 'GET' && !isNoCacheUrl(config.url)) {
    // Scope the key to the logged-in user so accounts never share cache
    const username = useAuthStore.getState().user?.username || 'anon'
    return `${username}::${config.url}`
  }
  return null
}

const getCachedResponse = (cacheKey) => {
  if (!cacheKey || !requestCache.has(cacheKey)) return null

  const { data, timestamp } = requestCache.get(cacheKey)
  const now = Date.now()

  if (now - timestamp < CACHE_DURATION) {
    return data // Return cached data if still fresh
  } else {
    requestCache.delete(cacheKey) // Expired, remove from cache
    return null
  }
}

const setCachedResponse = (cacheKey, data) => {
  if (cacheKey) {
    requestCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    })
  }
}

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`

  // Check cache for GET requests
  const cacheKey = generateCacheKey(config)
  const cachedData = getCachedResponse(cacheKey)

  if (cachedData) {
    // Return cached response as a resolved promise
    return Promise.resolve({
      data: cachedData,
      status: 200,
      statusText: 'OK (cached)',
      headers: {},
      config
    })
  }

  return config
})

// Request retry logic for network failures
let isLoggingOut = false

// Enhanced response interceptor with better error handling and caching
api.interceptors.response.use(
  (res) => {
    // Cache successful GET responses
    if (res.config.method?.toUpperCase() === 'GET' && res.status === 200) {
      const cacheKey = generateCacheKey(res.config)
      setCachedResponse(cacheKey, res.data)
    }
    return res
  },
  (err) => {
    const config = err.config

    // Handle 401/403 — only logout if it's from an auth/session endpoint.
    // Other endpoints returning 401 (e.g. a protected feature) should NOT
    // cause a logout — they just mean "this action requires auth".
    if (err.response?.status === 401 || err.response?.status === 403) {
      const url = config?.url || ''
      
      if (isAuthEndpoint(url) && !isLoggingOut) {
        // Session token is invalid/expired — log user out
        isLoggingOut = true
        const authStore = useAuthStore.getState()
        console.warn('[API] Auth token expired or invalid, logging out', {
          url,
          status: err.response?.status,
          timestamp: new Date().toISOString()
        })
        authStore.logout()
        // Reset flag after a short delay so future auth failures still work
        setTimeout(() => { isLoggingOut = false }, 2000)
      } else if (!isAuthEndpoint(url)) {
        // Non-auth endpoint returned 401/403 — just log it, don't logout
        console.debug('[API] Protected endpoint requires auth (not logging out)', {
          url,
          status: err.response?.status
        })
      }
    } else if (!err.response) {
      // Network error or timeout - don't logout, let retry logic handle it
      console.warn('[API] Network error (no response)', {
        url: config?.url,
        code: err.code,
        timestamp: new Date().toISOString()
      })
    } else if (err.response?.status >= 500) {
      // Server error - don't logout
      console.error('[API] Server error', {
        status: err.response?.status,
        url: config?.url
      })
    }

    return Promise.reject(err)
  }
)

export default api
