import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import MovieCard from '../components/MovieCard'
import SkeletonCard from '../components/SkeletonCard'
import api from '../services/api'
import { useCachedResource } from '../hooks/useCachedResource'
import { useCachedState } from '../hooks/useCachedState'
import useDragScroll from '../hooks/useDragScroll'

function DraggableRow({ style, children }) {
  const ref = useDragScroll()
  return <div className="movie-row" ref={ref} style={style}>{children}</div>
}

const LETTERS = ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

export default function Movies() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useCachedState('movies:searchQuery', '')
  const [searchResults, setSearchResults] = useCachedState('movies:searchResults', null)
  const [searching, setSearching] = useState(false)
  const [letter, setLetter] = useCachedState('movies:letter', 'All')
  const [year, setYear] = useCachedState('movies:year', '')
  const [page, setPage] = useCachedState('movies:page', 1)

  // Fetched once per session, then served instantly from cache on tab switches.
  const { data: latestData } = useCachedResource('movies:latest', () =>
    api.get('/movies/latest').then(r => r.data.movies))
  const latest = latestData || []

  const { data: defaultRecsData } = useCachedResource('movies:defaultRecs', () =>
    api.get('/movies/trending/daily').then(r => r.data.movies.slice(0, 20)))
  const defaultRecs = defaultRecsData || []

  // Keyed by the active filters so each page/letter/year view is cached
  // separately — returning to a previous view is instant, no refetch.
  const { data: browseData, loading: browseLoading } = useCachedResource(
    `movies:browse:${page}:${letter}:${year}`,
    () => api.get(`/movies/browse?page=${page}&letter=${letter}&year=${year}`).then(r => r.data)
  )

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true); setSearchResults(null)
    try {
      const { data } = await api.get(`/movies/search?q=${encodeURIComponent(searchQuery)}`)
      setSearchResults(data.results)
    } catch (_) { setSearchResults([]) }
    finally { setSearching(false) }
  }

  return (
    <div className="page">
      <div className="container">
        <h1 className="section-title" style={{ fontSize: '2rem' }}>🎬 Browse Movies</h1>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', maxWidth: 560, marginBottom: '2rem' }}>
          <input className="input" placeholder="Search any movie…" value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults(null) }} />
          <button className="btn btn-primary" type="submit" disabled={searching}>
            {searching ? '…' : '🔍'}
          </button>
        </form>

        {/* Search results */}
        {searchResults && (
          <>
            <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.85rem' }}>
              {searchResults.length} results for "{searchQuery}"
            </p>
            <div className="movie-grid" style={{ marginBottom: '2rem' }}>
              {searchResults.map((m, idx) => (
                <MovieCard key={m.imdbID || m.title || idx} {...m} />
              ))}
            </div>
            <hr style={{ borderColor: 'var(--border)', marginBottom: '2rem' }} />
          </>
        )}

        {/* Default Recommendations before search */}
        {!searchResults && (
          <>
            <h2 className="section-title">✨ Recommended for You</h2>
            <div className="movie-grid" style={{ marginBottom: '3rem' }}>
              {defaultRecs.length === 0
                ? Array(20).fill(0).map((_, i) => <SkeletonCard key={i} />)
                : defaultRecs.map((m, idx) => <MovieCard key={m.title || idx} {...m} />)
              }
            </div>

            <h2 className="section-title">🔥 Latest Releases</h2>
            <DraggableRow style={{ marginBottom: '2.5rem' }}>
              {latest.length === 0
                ? Array(8).fill(0).map((_, i) => <SkeletonCard key={i} />)
                : latest.map((m, idx) => <MovieCard key={m.imdbID || m.title || idx} {...m} />)
              }
            </DraggableRow>
          </>
        )}

        {/* Classic Library */}
        <h2 className="section-title">📚 Classic Library</h2>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <input className="input" placeholder="Filter by year (e.g. 2012)" value={year}
            style={{ maxWidth: 200 }} maxLength={4}
            onChange={e => { setYear(e.target.value); setPage(1) }} />
          <select className="input" style={{ maxWidth: 150, cursor: 'pointer' }}
            value={letter} onChange={e => { setLetter(e.target.value); setPage(1) }}>
            {LETTERS.map(l => <option key={l} value={l}>{l === 'All' ? 'All Letters' : l}</option>)}
          </select>
        </div>

        {/* Grid */}
        <div className="movie-grid">
          {browseLoading
            ? Array(20).fill(0).map((_, i) => <SkeletonCard key={i} />)
            : browseData?.movies.map(m => <MovieCard key={m.title} {...m} />)
          }
        </div>

        {/* Pagination */}
        {browseData && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '2rem' }}>
            <button className="btn btn-ghost" onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
            <span style={{ padding: '0.6rem 1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
              Page {browseData.page} / {browseData.total_pages}
            </span>
            <button className="btn btn-ghost" onClick={() => setPage(p => p + 1)} disabled={page >= browseData.total_pages}>Next →</button>
          </div>
        )}
      </div>
    </div>
  )
}
