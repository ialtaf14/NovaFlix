import { useState, useEffect } from 'react'
import './SeasonEpisodeViewer.css'

export default function SeasonEpisodeViewer({ title, totalSeasons, totalEpisodes, type = 'series' }) {
  const [seasons, setSeasons] = useState([])
  const [selectedSeason, setSelectedSeason] = useState(1)
  const [episodes, setEpisodes] = useState([])
  const [loading, setLoading] = useState(false)

  // Generate seasons array (1, 2, 3, etc.)
  useEffect(() => {
    const seasonArray = Array.from({ length: totalSeasons }, (_, i) => i + 1)
    setSeasons(seasonArray)
  }, [totalSeasons])

  // Fetch episodes for selected season
  useEffect(() => {
    if (!selectedSeason || !title) return
    
    fetchEpisodes()
  }, [selectedSeason, title])

  const fetchEpisodes = async () => {
    setLoading(true)
    try {
      const endpoint = type === 'anime' 
        ? `/anime/episodes?title=${encodeURIComponent(title)}&season=${selectedSeason}`
        : `/series/episodes?title=${encodeURIComponent(title)}&season=${selectedSeason}`
      
      const res = await fetch(`/api${endpoint}`)
      const data = await res.json()
      setEpisodes(data.episodes || [])
    } catch (err) {
      console.error('Error fetching episodes:', err)
      setEpisodes([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="season-episode-viewer glass-lg">
      <div className="sev-header">
        <h3 className="sev-title">
          Seasons & Episodes
          <span className="sev-stats">
            {totalSeasons} {totalSeasons === 1 ? 'Season' : 'Seasons'} • {totalEpisodes} Total Episodes
          </span>
        </h3>
      </div>

      {/* Seasons Tabs */}
      <div className="sev-seasons-container">
        <div className="sev-seasons-scroll">
          {seasons.map(season => (
            <button
              key={season}
              className={`sev-season-btn ${selectedSeason === season ? 'active' : ''}`}
              onClick={() => setSelectedSeason(season)}
            >
              S{season}
            </button>
          ))}
        </div>
      </div>

      {/* Episodes List */}
      <div className="sev-episodes-container">
        {loading ? (
          <div className="sev-loading">
            <div className="spinner"></div>
            <p>Loading Season {selectedSeason} episodes...</p>
          </div>
        ) : episodes.length > 0 ? (
          <div className="sev-episodes-list">
            {episodes.map((ep, idx) => (
              <div key={idx} className="sev-episode-item glass-sm">
                <div className="sev-ep-number">
                  {ep.episode_number || idx + 1}
                </div>
                <div className="sev-ep-info">
                  <h4 className="sev-ep-name">
                    {ep.name || `Episode ${ep.episode_number || idx + 1}`}
                  </h4>
                  {ep.air_date && (
                    <span className="sev-ep-date">🗓️ {ep.air_date}</span>
                  )}
                  {ep.overview && (
                    <p className="sev-ep-description">{ep.overview}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sev-no-episodes">
            <p>No episodes found for Season {selectedSeason}</p>
          </div>
        )}
      </div>
    </div>
  )
}
