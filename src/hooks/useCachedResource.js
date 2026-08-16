import { useState, useEffect, useRef, useCallback } from 'react'
import pageCache from '../services/pageCache'

/**
 * Fetch-once-per-session data hook.
 *
 *   - On mount, if `key` already has a value in the session cache, that value is
 *     returned synchronously - no loading state, no network request. This is what
 *     kills the "skeleton flash / reload" when you switch back to a tab.
 *   - Otherwise the fetcher runs once and the result is stored in the cache.
 *   - The cached value is reused for every later visit until the user does a full
 *     page refresh (which wipes the in-memory cache).
 *
 * @param {string}   key      Unique cache key. Include any params that change the data
 *                            (e.g. `movies:browse:${page}:${letter}:${year}`).
 * @param {Function} fetcher  async () => data
 * @param {object}   [opts]
 * @param {boolean}  [opts.enabled=true]  When false, no fetch runs (e.g. waiting for user).
 * @returns {{ data:any, loading:boolean, error:any, refresh:Function, setData:Function }}
 */
export function useCachedResource(key, fetcher, { enabled = true } = {}) {
  const [state, setState] = useState(() => ({
    key,
    data: pageCache.has(key) ? pageCache.get(key) : undefined,
    loading: enabled && !pageCache.has(key),
    error: null,
  }))
  const [reloadFlag, setReloadFlag] = useState(0)

  // Keep the latest fetcher without making it an effect dependency, so passing an
  // inline arrow function each render doesn't re-trigger fetches. Updated in an
  // effect (never during render).
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  // When the key changes, adjust state during render (React's recommended pattern
  // for deriving state from changing inputs). A cached key is surfaced instantly;
  // an uncached key drops to a loading state and the effect below fetches it.
  if (state.key !== key) {
    setState({
      key,
      data: pageCache.has(key) ? pageCache.get(key) : undefined,
      loading: enabled && !pageCache.has(key),
      error: null,
    })
  }

  useEffect(() => {
    if (!enabled) return
    if (pageCache.has(key)) return // already served from cache during render

    let cancelled = false
    Promise.resolve()
      .then(() => fetcherRef.current())
      .then((result) => {
        if (cancelled) return
        pageCache.set(key, result)
        setState({ key, data: result, loading: false, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err }))
      })

    return () => {
      cancelled = true
    }
    // reloadFlag lets refresh() force a re-run even when the key is unchanged.
  }, [key, enabled, reloadFlag])

  // Force a fresh network fetch and update the cache (e.g. after a mutation).
  const refresh = useCallback(() => {
    pageCache.delete(key)
    setState((s) => ({ ...s, loading: true }))
    setReloadFlag((f) => f + 1)
  }, [key])

  // Manually override the cached data (e.g. optimistic append for "Show More").
  const update = useCallback(
    (updater) => {
      setState((s) => {
        const next = typeof updater === 'function' ? updater(s.data) : updater
        pageCache.set(key, next)
        return { ...s, data: next }
      })
    },
    [key]
  )

  return { data: state.data, loading: state.loading, error: state.error, refresh, setData: update }
}

export default useCachedResource
