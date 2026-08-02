import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import pageCache from '../services/pageCache'

// Wipe every per-user cache layer (axios request cache + page cache).
// Imported lazily to avoid a circular import with services/api.js.
const wipeCaches = () => {
  pageCache.clear()
  import('../services/api').then(m => m.clearApiCache?.()).catch(() => {})
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      currentPage: 'discover',

      setAuth: (user, token) => {
        // New identity logging in — flush any cached data from the
        // previous account so users never see each other's data.
        wipeCaches()
        set({ user, token })
      },

      updateUser: (partial) =>
        set((state) => ({ user: { ...state.user, ...partial } })),

      setPage: (page) => set({ currentPage: page }),

      logout: () => {
        wipeCaches()
        set({ user: null, token: null, currentPage: 'discover' })
      },

      isAuthenticated: () => !!get().token && !!get().user,
    }),
    {
      name: 'nf-auth',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
