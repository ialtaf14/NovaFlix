import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import './SpotifyPicker.css';

const QUICK_SEARCHES = [
  { label: '🔥 Trending', q: 'Top Hits 2024' },
  { label: '✨ New Releases', q: 'New Music 2025' },
  { label: '🎬 Soundtracks', q: 'Movie Soundtrack OST' },
  { label: '🎌 Anime OSTs', q: 'Anime Opening Song' },
  { label: '💜 Bollywood', q: 'Bollywood Hits 2024' },
];

export default function SpotifyPicker({ isOpen, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [activeCategory, setActiveCategory] = useState(0);
  const audioRef = useRef(null);
  const debounceRef = useRef(null);

  // Load trending when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      doSearch(QUICK_SEARCHES[0].q);
    } else {
      stopAudio();
      setResults([]);
    }
  }, [isOpen]);

  // Debounced search on query change
  useEffect(() => {
    if (!isOpen) return;
    if (!query.trim()) {
      doSearch(QUICK_SEARCHES[activeCategory].q);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query);
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const doSearch = async (q) => {
    setLoading(true);
    try {
      const res = await api.get(`/spotify/search?q=${encodeURIComponent(q)}&type=track&limit=30`);
      const tracks = res.data?.tracks?.items || [];
      setResults(tracks);
    } catch (err) {
      console.error('Spotify search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = (idx) => {
    setActiveCategory(idx);
    setQuery('');
    doSearch(QUICK_SEARCHES[idx].q);
  };

  const togglePlay = (e, track) => {
    e.stopPropagation();
    if (!track.preview_url) return;

    if (playingId === track.id) {
      stopAudio();
    } else {
      stopAudio();
      setPlayingId(track.id);
      const audio = new Audio(track.preview_url);
      audioRef.current = audio;
      audio.volume = 0.7;
      audio.play().catch(console.error);
      audio.onended = () => setPlayingId(null);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  };

  const handleSelect = (track) => {
    stopAudio();
    const albumArt = track.album?.images?.[0]?.url || track.album?.images?.[1]?.url || null;
    onSelect({
      id: track.id,
      name: track.name,
      artist: track.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
      albumArt,
      previewUrl: track.preview_url || null,
      durationMs: track.duration_ms,
    });
    onClose();
  };

  const formatDuration = (ms) => {
    if (!ms) return '';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="spotify-picker-overlay" onClick={onClose}>
      <div className="spotify-picker-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sp-header">
          <button className="sp-close-btn" onClick={onClose}>✕</button>
          <h3>🎵 Add Music</h3>
          <div style={{ width: 28 }} />
        </div>

        {/* Search */}
        <div className="sp-search-bar">
          <span className="sp-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search songs, artists, soundtracks..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button className="sp-clear-btn" onClick={() => setQuery('')}>✕</button>
          )}
        </div>

        {/* Categories */}
        <div className="sp-categories">
          {QUICK_SEARCHES.map((cat, idx) => (
            <button
              key={idx}
              className={`sp-category-btn ${activeCategory === idx && !query ? 'active' : ''}`}
              onClick={() => handleCategoryClick(idx)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="sp-results-list">
          {loading ? (
            <div className="sp-loading">
              <div className="sp-spinner" />
              <span>Searching Spotify...</span>
            </div>
          ) : results.length > 0 ? (
            results.map(track => {
              const artSmall = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url;
              const isPlaying = playingId === track.id;
              const hasPreview = !!track.preview_url;
              return (
                <div
                  key={track.id}
                  className="sp-track-item"
                  onClick={() => handleSelect(track)}
                >
                  {/* Album Art */}
                  <div className="sp-track-art">
                    {artSmall ? (
                      <img src={artSmall} alt={track.album?.name || ''} />
                    ) : (
                      <div className="sp-art-placeholder">🎵</div>
                    )}
                    {hasPreview && (
                      <button
                        className={`sp-play-btn ${isPlaying ? 'playing' : ''}`}
                        onClick={(e) => togglePlay(e, track)}
                      >
                        {isPlaying ? '⏸' : '▶'}
                      </button>
                    )}
                  </div>

                  {/* Info */}
                  <div className="sp-track-info">
                    <h4 className="sp-track-name">{track.name}</h4>
                    <p className="sp-track-artist">
                      {track.artists?.map(a => a.name).join(', ')}
                    </p>
                    <p className="sp-track-album">{track.album?.name}</p>
                  </div>

                  {/* Duration */}
                  <span className="sp-track-duration">{formatDuration(track.duration_ms)}</span>
                </div>
              );
            })
          ) : (
            <div className="sp-empty">
              <span>🎵</span>
              <p>No results found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
