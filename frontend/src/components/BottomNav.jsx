import { NavLink } from 'react-router-dom'
import './BottomNav.css'

export default function BottomNav({ visible }) {
  return (
    <div className={`bottom-nav-container ${visible ? '' : 'hidden'}`}>
      <nav className="bottom-nav">
        <NavLink 
          to="/discover" 
          className={({ isActive }) => isActive ? 'bottom-nav-link active' : 'bottom-nav-link'}
        >
          <span className="icon">🧭</span> Discover
        </NavLink>
        <NavLink 
          to="/movies" 
          className={({ isActive }) => isActive ? 'bottom-nav-link active' : 'bottom-nav-link'}
        >
          <span className="icon">🎬</span> Movies
        </NavLink>
        <NavLink 
          to="/series" 
          className={({ isActive }) => isActive ? 'bottom-nav-link active' : 'bottom-nav-link'}
        >
          <span className="icon">📺</span> Series
        </NavLink>
        <NavLink 
          to="/anime" 
          className={({ isActive }) => isActive ? 'bottom-nav-link active' : 'bottom-nav-link'}
        >
          <span className="icon">🗡️</span> Anime
        </NavLink>
        <NavLink 
          to="/recommended" 
          className={({ isActive }) => isActive ? 'bottom-nav-link active' : 'bottom-nav-link'}
        >
          <span className="icon">✨</span> Recommended
        </NavLink>
      </nav>
    </div>
  )
}


