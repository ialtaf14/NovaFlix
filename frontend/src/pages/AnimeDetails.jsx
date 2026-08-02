import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SeasonEpisodeViewer from '../components/SeasonEpisodeViewer';
import './AnimeDetails.css';

const API_BASE_URL = "/api";

const AnimeDetails = () => {
  const { title } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [trailerUrl, setTrailerUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDetails();
  }, [title]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/anime/details?title=${encodeURIComponent(title)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
          navigate('/anime');
        } else {
          setDetails(data);
          fetchTrailer(data.title);
        }
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const fetchTrailer = async (animeTitle) => {
    try {
      const res = await fetch(`${API_BASE_URL}/movies/trailer?title=${encodeURIComponent(animeTitle + " anime")}`);
      if (res.ok) {
        const data = await res.json();
        if (data.trailer_url) {
          let videoId = null;
          if (data.trailer_url.includes("youtube.com/watch?v=")) {
            videoId = data.trailer_url.split("v=")[1].split("&")[0];
          } else if (data.trailer_url.includes("youtu.be/")) {
            videoId = data.trailer_url.split("youtu.be/")[1].split("?")[0];
          }
          if (videoId) {
            setTrailerUrl(`https://www.youtube.com/embed/${videoId}?autoplay=0`);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="loading-spinner">Loading Anime Details...</div>;
  if (!details) return null;

  return (
    <div className="anime-details-page">
      <div 
        className="anime-backdrop" 
        style={{ backgroundImage: `url(${details.poster})` }}
      >
        <div className="backdrop-overlay"></div>
      </div>

      <div className="anime-content-container">
        <button className="back-btn" onClick={() => navigate(-1)}>
          &larr; Back
        </button>

        <div className="anime-main-info">
          <div className="anime-poster">
            <img src={details.poster} alt={details.title} />
          </div>
          
          <div className="anime-meta">
            <h1>{details.title}</h1>
            <div className="meta-tags">
              <span className="tag rating">⭐ {details.rating}</span>
              <span className="tag year">{details.year}</span>
              <span className="tag runtime">{details.runtime}</span>
              <span className="tag status">{details.status}</span>
            </div>
            
            <div className="anime-stats">
              <div className="stat">
                <span className="label">Seasons</span>
                <span className="value">{details.seasons}</span>
              </div>
              <div className="stat">
                <span className="label">Episodes</span>
                <span className="value">{details.episodes}</span>
              </div>
            </div>

            <p className="anime-plot">{details.plot}</p>

            <div className="anime-crew">
              <p><strong>Genre:</strong> {details.genre}</p>
              <p><strong>Cast:</strong> {Array.isArray(details.cast) ? details.cast.join(', ') : details.cast}</p>
              <p><strong>Creators:</strong> {Array.isArray(details.creators) ? details.creators.join(', ') : details.creators}</p>
            </div>
          </div>
        </div>

        {trailerUrl && (
          <div className="anime-trailer-section">
            <h2>Trailer</h2>
            <div className="video-responsive">
              <iframe
                src={trailerUrl}
                title="Trailer"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        )}

        {details.seasons && details.episodes && (
          <div className="anime-episodes-section" style={{ marginTop: '3rem', paddingBottom: '2rem' }}>
            <SeasonEpisodeViewer 
              title={details.title} 
              totalSeasons={details.seasons} 
              totalEpisodes={details.episodes}
              type="anime"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AnimeDetails;
