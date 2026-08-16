import axios from 'axios'
import { useAuthStore } from '../store/useAuthStore'

let rawBase = import.meta.env.VITE_API_URL || '/api'
if (rawBase.endsWith('/')) rawBase = rawBase.slice(0, -1)
if (!rawBase.endsWith('/api') && rawBase.startsWith('http')) {
  rawBase = rawBase + '/api'
}
const BASE_URL = rawBase

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000 // 15 second timeout
})

// ─── Request Deduplication Cache ─────────────────────────────────────────────
// Prevents duplicate GET requests within a short time window
const requestCache = new Map() // { cacheKey: { data, timestamp, promise } }
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Endpoints that must NEVER be cached — real-time / per-user critical data
const NO_CACHE_PATTERNS = [
  '/chat',           // conversations & message history (real-time)
  '/notifications',  // unread counts
  '/users/me',       // own profile
  '/social/activity',
]

// These endpoints use 401 as a business logic response (not session expiry)
// — all other 401s mean the token is expired and the user should be logged out
const NON_SESSION_401_PATTERNS = [
  // none currently — all 401s indicate expired/invalid token
]

const isNoCacheUrl = (url = '') =>
  NO_CACHE_PATTERNS.some(p => url.startsWith(p) || url.includes(p))

// eslint-disable-next-line no-unused-vars
const isNonSession401 = (url = '') =>
  NON_SESSION_401_PATTERNS.some(p => url.includes(p))

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

    // Handle 401 — only logout when /auth/me itself rejects our token.
    // Other endpoints returning 401 (e.g. during a brief backend restart) should
    // NOT trigger logout; the session is auto-restored on the next valid request.
    if (err.response?.status === 401) {
      const url = config?.url || ''
      const isAuthMe = url.includes('/auth/me') || url.includes('/auth/refresh-session')

      if (isAuthMe && !isLoggingOut) {
        isLoggingOut = true
        const authStore = useAuthStore.getState()
        console.warn('[API] /auth/me returned 401 — token truly invalid, logging out', {
          url,
          status: err.response?.status,
          timestamp: new Date().toISOString()
        })
        authStore.logout()
        setTimeout(() => { isLoggingOut = false }, 2000)
      } else if (!isAuthMe) {
        // Non-auth endpoint 401 — just log it, the backend will auto-restore the session
        console.debug('[API] 401 on non-auth endpoint (session auto-restoring):', url)
      }
    } else if (err.response?.status === 403) {
      console.debug('[API] Forbidden:', config?.url)
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
