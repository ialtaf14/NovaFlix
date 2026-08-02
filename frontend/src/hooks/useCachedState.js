import { useState, useCallback } from 'react'
import pageCache from '../services/pageCache'

/**
 * Drop-in replacement for useState that persists its value in the session cache
 * (see pageCache). On remount within the same session the last value is restored,
 * so UI state — filters, current page, active mood, search text — survives in-app
 * tab switches and is only reset on a real page refresh.
 *
 * @param {string} key      Unique cache key.
 * @param {*}      initial  Initial value (or a lazy initializer function).
 */
export function useCachedState(key, initial) {
  const [value, setValue] = useState(() => {
    if (pageCache.has(key)) return pageCache.get(key)
    return typeof initial === 'function' ? initial() : initial
  })

  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        pageCache.set(key, resolved)
        return resolved
      })
    },
    [key]
  )

  return [value, set]
}

export default useCachedState
