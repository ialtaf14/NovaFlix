// ─────────────────────────────────────────────────────────────────────────────
// Session-level in-memory cache.
//
// This Map lives for the lifetime of the loaded single-page app (i.e. the
// current browser tab session). It is wiped automatically on a full page
// refresh / hard reload, because the module is re-evaluated from scratch.
//
// That is exactly the behaviour we want for tab switching:
//   • Data fetched once is reused across in-app tab switches (Discover → Movies
//     → Series …) with no re-fetch and no loading skeleton flash.
//   • Data is only fetched again when the user actually refreshes the page.
// ─────────────────────────────────────────────────────────────────────────────

const store = new Map()

export const pageCache = {
  has: (key) => store.has(key),
  get: (key) => store.get(key),
  set: (key, value) => {
    store.set(key, value)
  },
  delete: (key) => {
    store.delete(key)
  },
  // Clear everything, or only keys starting with a given prefix.
  clear: (prefix) => {
    if (!prefix) {
      store.clear()
      return
    }
    for (const k of Array.from(store.keys())) {
      if (k.startsWith(prefix)) store.delete(k)
    }
  },
}

export default pageCache
