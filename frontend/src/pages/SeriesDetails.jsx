import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SkeletonCard from "../components/SkeletonCard";
import SeasonEpisodeViewer from "../components/SeasonEpisodeViewer";
import "./SeriesDetails.css";

function SeriesDetails() {
  const { title } = useParams();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trailerId, setTrailerId] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/series/details?title=${encodeURIComponent(title)}`)
      .then(res => res.json())
      .then(data => {
        setDetails(data);
        setLoading(false);
        
        // Fetch trailer
        fetch(`/api/movies/trailer?title=${encodeURIComponent(title + " series")}`)
          .then(res => res.json())
          .then(td => setTrailerId(td.video_id))
          .catch(e => console.error("Trailer err", e));
      })
      .catch(err => {
        console.error("Error fetching series details:", err);
        setLoading(false);
      });
  }, [title]);

  if (loading) {
    return (
      <div className="series-details-page loading-state">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="series-details-page error-state">
        <h2>Series not found</h2>
        <Link to="/series" className="back-link">Back to Series</Link>
      </div>
    );
  }

  return (
    <div className="series-details-page animate-fade-in">
      <div className="series-backdrop" style={{ backgroundImage: `url(${details.poster})` }}>
        <div className="backdrop-overlay"></div>
      </div>

      <div className="series-content">
        <div className="series-poster-container">
          <img src={details.poster} alt={details.title} className="series-poster-large" />
          {details.providers && (
            <div className="provider-info">
              <span>Streaming on</span>
              <img src={details.providers.logo} alt={details.providers.name} title={details.providers.name} />
            </div>
          )}
        </div>

        <div className="series-info">
          <h1 className="series-title">{details.title}</h1>
          
          <div className="series-meta-bar">
            <span className="year">{details.year}</span>
            <span className="rating"><i className="fas fa-star text-warning"></i> {details.rating}</span>
            <span className="seasons">{details.seasons} Seasons ({details.episodes} Episodes)</span>
            <span className="status badge-status">{details.status}</span>
          </div>

          <div className="genres">
            {details.genre !== "N/A" && details.genre.split(", ").map((g, i) => (
              <span key={i} className="genre-tag">{g}</span>
            ))}
          </div>

          <p className="plot">{details.plot}</p>

          <div className="cast-crew-grid">
            <div className="crew-section">
              <h3>Creators</h3>
              <p>{Array.isArray(details.creators) ? details.creators.join(", ") : details.creators}</p>
            </div>
            <div className="cast-section">
              <h3>Top Cast</h3>
              <div className="cast-list">
                {Array.isArray(details.cast) ? details.cast.map((actor, i) => (
                  <Link to={`/actor?name=${encodeURIComponent(actor)}`} key={i} className="actor-link">
                    {actor}
                  </Link>
                )) : details.cast}
              </div>
            </div>
          </div>
          
          {trailerId && (
            <div className="trailer-section">
              <h3>Trailer</h3>
              <div className="video-container">
                <iframe
                  src={`https://www.youtube.com/embed/${trailerId}`}
                  title={`${details.title} Trailer`}
                  frameBorder="0"
                  allowFullScreen
                ></iframe>
              </div>
            </div>
          )}

          {/* Seasons & Episodes Viewer */}
          {details.seasons && details.episodes && (
            <SeasonEpisodeViewer 
              title={details.title}
              totalSeasons={details.seasons}
              totalEpisodes={details.episodes}
              type="series"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default SeriesDetails;
