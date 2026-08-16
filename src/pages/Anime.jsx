import { useNavigate } from 'react-router-dom';
import SeriesAnimeCard from '../components/SeriesAnimeCard';
import SkeletonCard from '../components/SkeletonCard';
import { useCachedResource } from '../hooks/useCachedResource';
import { useCachedState } from '../hooks/useCachedState';
import './Anime.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const Anime = () => {
  const navigate = useNavigate();

  // Filters (persisted for the session so returning to the tab keeps your place)
  const [selectedLetter, setSelectedLetter] = useCachedState('anime:letter', 'All');
  const [selectedGenre, setSelectedGenre] = useCachedState('anime:genre', 'All');
  const [page, setPage] = useCachedState('anime:page', 1);

  const letters = ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  const genres = ['All', 'Action', 'Drama', 'Comedy', 'Sci-Fi', 'Fantasy', 'Romance', 'Thriller', 'Animation'];

  // Fetched once per filter combination, then served instantly from cache.
  const { data, loading } = useCachedResource(
    `anime:browse:${page}:${selectedLetter}:${selectedGenre}`,
    async () => {
      const res = await fetch(`${API_BASE_URL}/anime/browse?page=${page}&letter=${selectedLetter}&genre=${selectedGenre}`);
      if (!res.ok) return { anime: [], total_pages: 1 };
      const d = await res.json();
      return { anime: d.anime || [], total_pages: d.total_pages || 1 };
    }
  );
  const animeList = data?.anime || [];
  const totalPages = data?.total_pages || 1;

  return (
    <div className="anime-page">
      <div className="anime-header">
        <h1>Anime Collection</h1>
        <p>Explore the best anime movies and series.</p>
      </div>

      <div className="anime-filters">
        <div className="filter-group">
          <label>Alphabetical:</label>
          <div className="animated-input-box">
            <input 
              type="text" 
              maxLength="1" 
              placeholder="Type A-Z..."
              value={selectedLetter === 'All' ? '' : selectedLetter}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                if (/^[A-Z]$/.test(val)) {
                  setSelectedLetter(val);
                } else {
                  setSelectedLetter('All');
                }
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="filter-group">
          <label>Genre:</label>
          <div className="animated-select-box">
            <select 
              value={selectedGenre} 
              onChange={(e) => { setSelectedGenre(e.target.value); setPage(1); }}
            >
              {genres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="anime-grid">
          {Array.from({ length: 15 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className="anime-grid">
            {animeList.length > 0 ? (
              animeList.map((anime, idx) => (
                <SeriesAnimeCard
                  key={idx}
                  {...anime}
                  type="anime"
                />
              ))
            ) : (
              <div className="no-results">No anime found matching your criteria.</div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Anime;
