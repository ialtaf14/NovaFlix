import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import './MovieCard.css'

export default function SeriesAnimeCard({ title, poster, rating, year, provider, type = 'series', novaflix_rating }) {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()

  const wishlist = user?.wishlist || []
  const watched = user?.watched_list || []
  const favorites = user?.favorite_list || []
  const isWishlisted = wishlist.includes(title)
  const isWatched = watched.includes(title)
  const isFavorite = favorites.includes(title)

  const handleWishlistClick = async (e) => {
    e.stopPropagation()
    try {
      if (isWishlisted) {
        const { data } = await api.delete(`/users/wishlist/${encodeURIComponent(title)}`)
        updateUser({ wishlist: data.wishlist })
      } else {
        const { data } = await api.post('/users/wishlist', { title })
        updateUser({ wishlist: data.wishlist })
      }
    } catch (_) {}
  }

  const handleWatchedClick = async (e) => {
    e.stopPropagation()
    try {
      if (isWatched) {
        const { data } = await api.delete(`/users/watched/${encodeURIComponent(title)}`)
        updateUser({ watched_list: data.watched_list })
      } else {
        const { data } = await api.post('/users/watched', { title })
        updateUser({ 
          watched_list: data.watched_list, 
          wishlist: wishlist.filter(t => t !== title) 
        })
      }
    } catch (_) {}
  }

  const handleFavoriteClick = async (e) => {
    e.stopPropagation()
    try {
      if (isFavorite) {
        const { data } = await api.delete(`/users/favorites/${encodeURIComponent(title)}`)
        updateUser({ favorite_list: data.favorite_list })
      } else {
        const { data } = await api.post('/users/favorites', { title })
        updateUser({ favorite_list: data.favorite_list })
      }
    } catch (_) {}
  }

  const detailsRoute = type === 'anime' ? `/anime/${encodeURIComponent(title)}` : `/series/${encodeURIComponent(title)}`

  return (
    <div className="movie-card" onClick={() => navigate(detailsRoute)}>
      <div className="movie-card-poster">
        <img
          src={poster || 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg'}
          alt={title}
          onError={(e) => { e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg' }}
        />
        {provider && (
          <img className="provider-badge" src={provider.logo} alt={provider.name} title={`Watch on ${provider.name}`} />
        )}

        <div className={`novaflix-rating-badge ${!novaflix_rating || novaflix_rating === 'N/A' ? 'nf-no-rating' : ''}`} title="NovaFlix Rating">
          <span className="nf-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="12" fill="url(#nfGrad)"/>
              <defs><linearGradient id="nfGrad" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stopColor="#a855f7"/><stop offset="100%" stopColor="#7c3aed"/></linearGradient></defs>
              <text x="12" y="16.5" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="900" fontFamily="Arial,sans-serif">NF</text>
            </svg>
          </span>
          <span className="nf-score">{novaflix_rating && novaflix_rating !== 'N/A' ? novaflix_rating : 'N/R'}</span>
        </div>
        
        {/* Floating Quick Action Buttons */}
        {user && (
          <div className="movie-card-actions">
            <button className={`card-action-btn btn-fav-heart ${isFavorite ? 'active' : ''}`} 
              onClick={handleFavoriteClick} title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}>
              {isFavorite ? '❤️' : '♡'}
            </button>
            <button className={`card-action-btn ${isWishlisted ? 'active' : ''}`} 
              onClick={handleWishlistClick} title={isWishlisted ? "Remove from Wishlist" : "Add to Wishlist"}>
              {isWishlisted ? '💖' : '🤍'}
            </button>
            <button className={`card-action-btn ${isWatched ? 'active' : ''}`} 
              onClick={handleWatchedClick} title={isWatched ? "Remove from Watched" : "Mark as Watched"}>
              {isWatched ? '✅' : '👁'}
            </button>
          </div>
        )}

        <div className="movie-card-overlay">
          <span className="movie-card-rating">⭐ {rating !== 'N/A' ? rating : '?'}</span>
          <span className="movie-card-year">📅 {year}</span>
        </div>
      </div>
      <p className="movie-card-title">{title}</p>
    </div>
  )
}
