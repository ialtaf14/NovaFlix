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
  timeout: 60000 // 60 second timeout for all API requests
})

// Export clearApiCache for useAuthStore compatibility
export const clearApiCache = () => {}

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, (error) => {
  return Promise.reject(error)
})

let isLoggingOut = false

// Enhanced response interceptor with clean error handling
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const config = err.config

    // Handle 401 — only logout when /auth/me itself rejects our token.
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
        console.debug('[API] 401 on non-auth endpoint (session auto-restoring):', url)
      }
    } else if (err.response?.status === 403) {
      console.debug('[API] Forbidden:', config?.url)
    } else if (!err.response) {
      console.warn('[API] Network error (no response)', {
        url: config?.url,
        code: err.code,
        timestamp: new Date().toISOString()
      })
    } else if (err.response?.status >= 500) {
      console.error('[API] Server error', {
        status: err.response?.status,
        url: config?.url
      })
    }

    return Promise.reject(err)
  }
)

export default api
