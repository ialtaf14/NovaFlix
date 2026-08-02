import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ImageUploadModal from './ImageUploadModal';
import api from '../services/api';
import BGMPlayer from '../services/BGMPlayer';
import { useAuthStore } from '../store/useAuthStore';
import SpotifyPicker from './SpotifyPicker';
import SpotifySticker from './SpotifySticker';
import './StoryEditor.css';

const BG_GRADIENTS = [
  'linear-gradient(135deg, #1f1c2c, #928dab)',
  'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
  'linear-gradient(135deg, #8a2be2, #4b0082, #000000)',
  'linear-gradient(135deg, #ff4b2b, #ff416c)',
  'linear-gradient(135deg, #11998e, #38ef7d)',
  'linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)',
  '#0d0818',
  '#000000'
];

const PRESET_PHOTOS = [
  'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&q=80',
  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80',
  'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&q=80',
  'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600&q=80',
  'https://images.unsplash.com/photo-1478720143022-90994770db42?w=600&q=80',
  'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=600&q=80'
];

const EMOJIS = ['❤️', '🔥', '😂', '😮', '😱', '👏', '🍿', '🎬', '✨', '🤩', '💀', '💩', '🎉', '💡', '🤖', '👾'];

const FONT_STYLES = [
  { id: 'modern', name: 'Modern', style: { fontFamily: '"Inter", sans-serif' } },
  { id: 'classic', name: 'Classic', style: { fontFamily: '"Playfair Display", serif' } },
  { id: 'neon', name: 'Neon', style: { fontFamily: '"Comfortaa", sans-serif', textShadow: '0 0 10px rgba(255,97,210,0.8)' } },
  { id: 'handwriting', name: 'Handwriting', style: { fontFamily: '"Caveat", cursive' } }
];

const COLORS = ['#ffffff', '#000000', '#ff4b2b', '#ff416c', '#ffd700', '#2ed573', '#0984e3', '#00bec4', '#ff61d2', '#a29bfe'];

export default function StoryEditor({ isOpen, onClose, onSuccess }) {
  const [bgImage, setBgImage] = useState(null);
  const [gradientIdx, setGradientIdx] = useState(0);
  const [overlays, setOverlays] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // Bottom Select / Recents view
  const [showRecentGrid, setShowRecentGrid] = useState(true);
  const [showCropModal, setShowCropModal] = useState(false);

  // Edit Overlay modals/states
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textBg, setTextBg] = useState(true);
  const [textFont, setTextFont] = useState('modern');

  // Emojis, Music & Movie search state
  const [showEmojiDrawer, setShowEmojiDrawer] = useState(false);
  const [showMovieSearch, setShowMovieSearch] = useState(false);
  const [showMentionModal, setShowMentionModal] = useState(false);
  const [mentionDraft, setMentionDraft] = useState('');
  const [showMusicSearch, setShowMusicSearch] = useState(false);
  const [movieQuery, setMovieQuery] = useState('');
  const [movieSuggestions, setMovieSuggestions] = useState([]);

  // Upload/Share loader
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const searchTimeoutRef = useRef(null);
  const workspaceRef = useRef(null);
  const dragInfo = useRef({ activeId: null, startX: 0, startY: 0, initialX: 0, initialY: 0 });

  useEffect(() => {
    if (!isOpen) {
      setBgImage(null);
      setGradientIdx(0);
      setOverlays([]);
      setSelectedId(null);
      setShowRecentGrid(true);
      setShowCropModal(false);
      setShowTextEditor(false);
      setShowEmojiDrawer(false);
      setShowMovieSearch(false);
      setShowMusicSearch(false);
      setShowMentionModal(false);
      setMentionDraft('');
      setUploading(false);
      setUploadProgress(0);
      BGMPlayer.stop();
      document.body.style.overflow = '';
    } else {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Background control
  const cycleGradient = () => {
    setGradientIdx((gradientIdx + 1) % BG_GRADIENTS.length);
  };

  const handleSelectPreset = (url) => {
    setBgImage(url);
    setShowRecentGrid(false);
  };

  // Add text overlay
  const openTextEditor = (existingId = null) => {
    if (existingId) {
      const over = overlays.find(o => o.id === existingId);
      if (over) {
        setSelectedId(existingId);
        setTextDraft(over.text);
        setTextColor(over.color);
        setTextBg(over.hasBg);
        setTextFont(over.fontStyle);
        setShowTextEditor(true);
      }
    } else {
      setSelectedId(null);
      setTextDraft('');
      setTextColor('#ffffff');
      setTextBg(true);
      setTextFont('modern');
      setShowTextEditor(true);
    }
  };

  const saveTextOverlay = (e) => {
    e.preventDefault();
    if (!textDraft.trim()) return;

    if (selectedId) {
      // Edit existing
      setOverlays(prev => prev.map(o => o.id === selectedId ? {
        ...o,
        text: textDraft,
        color: textColor,
        hasBg: textBg,
        fontStyle: textFont
      } : o));
    } else {
      // Add new in center
      const newOverlay = {
        id: `text_${Date.now()}`,
        type: 'text',
        text: textDraft,
        x: 225, // center of 450px wide card
        y: 350,
        scale: 1,
        rotation: 0,
        color: textColor,
        hasBg: textBg,
        fontStyle: textFont
      };
      setOverlays(prev => [...prev, newOverlay]);
      setSelectedId(newOverlay.id);
    }
    setShowTextEditor(false);
  };

  // Add emoji overlay
  const addEmojiOverlay = (emoji) => {
    const newOverlay = {
      id: `emoji_${Date.now()}`,
      type: 'emoji',
      emoji,
      x: 225,
      y: 400,
      scale: 1.5,
      rotation: 0
    };
    setOverlays(prev => [...prev, newOverlay]);
    setSelectedId(newOverlay.id);
    setShowEmojiDrawer(false);
  };

  // Movie search
  const handleMovieSearch = (query) => {
    setMovieQuery(query);
    if (!query || query.length < 2) {
      setMovieSuggestions([]);
      return;
    }
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/movies/search?q=${encodeURIComponent(query)}`);
        setMovieSuggestions(data.results || []);
      } catch (err) {}
    }, 300);
  };

  const addMovieOverlay = async (movieTitle) => {
    try {
      const { data } = await api.get(`/movies/details?title=${encodeURIComponent(movieTitle)}`);
      const newOverlay = {
        id: `movie_${Date.now()}`,
        type: 'movie',
        movie: {
          title: data.title,
          poster: data.poster || 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg',
          year: data.year || (data.release_date ? data.release_date.slice(0, 4) : 'N/A'),
          imdbRating: data.rating || 'N/A',
          novaRating: data.novaflix_rating || 'N/A',
          genres: data.genre ? data.genre.split(', ').slice(0, 2) : []
        },
        x: 225,
        y: 280,
        scale: 1,
        rotation: 0
      };
      setOverlays(prev => [...prev, newOverlay]);
      setSelectedId(newOverlay.id);
      setShowMovieSearch(false);
      setMovieQuery('');
      setMovieSuggestions([]);
      BGMPlayer.play(data.title);
    } catch (_) {
      alert('Failed to load movie details');
    }
  };

  // Delete active overlay
  const deleteSelectedOverlay = () => {
    if (selectedId) {
      const item = overlays.find(o => o.id === selectedId);
      if (item && item.type === 'movie') {
        BGMPlayer.stop();
      }
      setOverlays(prev => prev.filter(o => o.id !== selectedId));
      setSelectedId(null);
    }
  };

  const addMentionOverlay = (username) => {
    if (!username.trim()) return;
    const cleanUname = username.replace(/^@/, '').trim();
    const newOverlay = {
      id: `mention_${Date.now()}`,
      type: 'mention',
      username: cleanUname,
      x: 225,
      y: 350,
      scale: 1.2,
      rotation: 0
    };
    setOverlays(prev => [...prev, newOverlay]);
    setSelectedId(newOverlay.id);
    setShowMentionModal(false);
    setMentionDraft('');
  };

  // Drag handlers
  const handlePointerDown = (e, id) => {
    e.stopPropagation();
    setSelectedId(id);
    const item = overlays.find(o => o.id === id);
    if (!item) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    dragInfo.current = {
      activeId: id,
      startX: clientX,
      startY: clientY,
      initialX: item.x,
      initialY: item.y
    };
    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
    document.addEventListener('touchmove', handlePointerMove, { passive: false });
    document.addEventListener('touchend', handlePointerUp);
  };

  const handlePointerMove = (e) => {
    const { activeId, startX, startY, initialX, initialY } = dragInfo.current;
    if (!activeId || !workspaceRef.current) return;

    if (e.cancelable) e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = workspaceRef.current.getBoundingClientRect();
    // Scale delta according to visual canvas size mapping
    const deltaX = ((clientX - startX) / rect.width) * 450;
    const deltaY = ((clientY - startY) / rect.height) * 800;

    setOverlays(prev => prev.map(o => o.id === activeId ? {
      ...o,
      x: Math.max(20, Math.min(430, initialX + deltaX)),
      y: Math.max(20, Math.min(780, initialY + deltaY))
    } : o));
  };

  const handlePointerUp = () => {
    dragInfo.current.activeId = null;
    document.removeEventListener('mousemove', handlePointerMove);
    document.removeEventListener('mouseup', handlePointerUp);
    document.removeEventListener('touchmove', handlePointerMove);
    document.removeEventListener('touchend', handlePointerUp);
  };

  // Selected Overlay property modifiers (scale & rotate)
  const updateSelectedProperty = (key, val) => {
    if (selectedId) {
      setOverlays(prev => prev.map(o => o.id === selectedId ? { ...o, [key]: val } : o));
    }
  };

  const selectedItem = overlays.find(o => o.id === selectedId);

  // Submit / Share story
  const handleShareStory = async () => {
    setUploading(true);
    setUploadProgress(10);
    const interval = setInterval(() => {
      setUploadProgress(p => {
        if (p >= 90) {
          clearInterval(interval);
          return 90;
        }
        return p + 20;
      });
    }, 150);

    try {
      const mentionsArr = overlays
        .filter(o => o.type === 'text')
        .flatMap(o => (o.text.match(/@\w+/g) || []).map(m => m.replace(/^@/, '')));
      const hashtagsArr = overlays
        .filter(o => o.type === 'text')
        .flatMap(o => (o.text.match(/#\w+/g) || []).map(h => h.replace(/^#/, '')));

      const movieTitles = overlays
        .filter(o => o.type === 'movie')
        .map(o => o.movie.title);

      await api.post('/social/stories', {
        type: 'custom_editor',
        content: bgImage || '',
        background_color: bgImage ? '' : BG_GRADIENTS[gradientIdx],
        movie_title: movieTitles.length > 0 ? movieTitles[0] : undefined,
        text: overlays.filter(o => o.type === 'text').map(o => o.text).join(' | '),
        emoji: overlays.filter(o => o.type === 'emoji').map(o => o.emoji).join(''),
        mentions: mentionsArr,
        hashtags: hashtagsArr,
        overlays
      });

      setUploadProgress(100);
      setTimeout(() => {
        clearInterval(interval);
        onSuccess();
        onClose();
        alert('Story shared successfully!');
      }, 300);
    } catch (err) {
      clearInterval(interval);
      setUploading(false);
      alert('Failed to publish story');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div 
        className={`recommend-sidebar-overlay ${isOpen ? 'open' : ''}`} 
        onClick={onClose} 
        style={{ zIndex: 9998 }}
      />
      <div className={`recommend-sidebar story-sidebar ${isOpen ? 'open' : ''}`} style={{ zIndex: 9999, padding: 0, overflowY: 'auto' }}>
      
      {/* 1. Recents Selection Grid bottom panel (first thing user sees) */}
      {showRecentGrid && (
        <div className="se-recents-grid-container">
          <div className="recommend-sidebar-header">
            <h2>✨ <span>Add to</span> Story</h2>
            <button className="recommend-close-btn" onClick={onClose} title="Close">
              &times;
            </button>
          </div>
          <div className="se-recents-grid">
            <div className="se-recent-card camera-card" onClick={() => setShowCropModal(true)}>
              <span>📷</span>
              <p>Camera</p>
            </div>
            <div className="se-recent-card gallery-card" onClick={() => setShowCropModal(true)}>
              <span>🖼️</span>
              <p>Gallery</p>
            </div>
            <div className="se-recent-card create-card" onClick={() => { setBgImage(null); setShowRecentGrid(false); }}>
              <span style={{ color: '#ff61d2', fontWeight: 'bold' }}>Aa</span>
              <p>Create</p>
            </div>
            {PRESET_PHOTOS.map((p, idx) => (
              <div key={idx} className="se-recent-card" onClick={() => handleSelectPreset(p)}>
                <img src={p} alt="Preset scene" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Full screen Story Canvas (hidden when selecting files first) */}
      {!showRecentGrid && (
        <div className="se-editor-main">
          
          {/* Top Panel Buttons */}
          <div className="se-top-actions">
            <button className="se-action-circle" onClick={() => setShowRecentGrid(true)} title="Back to Gallery">
              &larr;
            </button>
            
            <div className="se-center-top-tools">
              <button className="se-tool-btn" onClick={() => openTextEditor()} title="Add Text">Aa</button>
              <button className="se-tool-btn" onClick={() => setShowMentionModal(true)} title="Add Mention">@</button>
              <button className="se-tool-btn" onClick={() => setShowMusicSearch(true)} title="Add Music">🎵</button>
              <button className="se-tool-btn" onClick={() => setShowEmojiDrawer(true)} title="Add Emojis">😊</button>
              <button className="se-tool-btn" onClick={() => setShowMovieSearch(true)} title="Add Movie">🎬</button>
              <button className="se-tool-btn" onClick={cycleGradient} title="Cycle Background">🎨</button>
            </div>

            <button className="se-action-circle close-btn" onClick={onClose} title="Cancel">
              &times;
            </button>
          </div>

          {/* Active Canvas Workspace (Aspect Ratio 9:16) */}
          <div className="se-canvas-wrapper">
            <div 
              ref={workspaceRef}
              className="se-workspace-canvas"
              style={{
                background: bgImage ? 'transparent' : BG_GRADIENTS[gradientIdx]
              }}
              onClick={() => setSelectedId(null)}
            >
              {bgImage && (
                (bgImage.includes('video/') || bgImage.includes('.mp4') || bgImage.includes('.mov') || bgImage.includes('.webm') || bgImage.includes('.ogg') || bgImage.startsWith('data:video/')) ? (
                  <video 
                    src={bgImage} 
                    autoPlay 
                    loop 
                    muted 
                    playsInline 
                    className="se-canvas-bg-img" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
                  />
                ) : (
                  <img src={bgImage} alt="Story Background" className="se-canvas-bg-img" />
                )
              )}

              {/* Render Draggable Overlays */}
              {overlays.map(overlay => {
                const isActive = overlay.id === selectedId;
                
                if (overlay.type === 'text') {
                  const font = FONT_STYLES.find(f => f.id === overlay.fontStyle);
                  return (
                    <div
                      key={overlay.id}
                      onPointerDown={(e) => handlePointerDown(e, overlay.id)}
                      onDoubleClick={() => openTextEditor(overlay.id)}
                      className={`se-overlay-item text-item ${isActive ? 'active' : ''}`}
                      style={{
                        left: `${overlay.x}px`,
                        top: `${overlay.y}px`,
                        transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
                        color: overlay.color || '#fff',
                        fontFamily: font ? font.style.fontFamily : 'inherit',
                        textShadow: font ? font.style.textShadow : 'none',
                        background: overlay.hasBg ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                        backdropFilter: overlay.hasBg ? 'blur(16px)' : 'none',
                        WebkitBackdropFilter: overlay.hasBg ? 'blur(16px)' : 'none',
                        border: overlay.hasBg ? '1px solid rgba(255, 255, 255, 0.2)' : '1.5px dashed transparent',
                        boxShadow: overlay.hasBg ? '0 8px 32px 0 rgba(0, 0, 0, 0.3)' : 'none',
                        padding: overlay.hasBg ? '8px 14px' : '0',
                        borderRadius: '8px'
                      }}
                    >
                      {overlay.text}
                    </div>
                  );
                }

                if (overlay.type === 'mention') {
                  return (
                    <div
                      key={overlay.id}
                      onPointerDown={(e) => handlePointerDown(e, overlay.id)}
                      className={`se-overlay-item mention-sticker-item ${isActive ? 'active' : ''}`}
                      style={{
                        left: `${overlay.x}px`,
                        top: `${overlay.y}px`,
                        transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`
                      }}
                    >
                      @{overlay.username}
                    </div>
                  );
                }

                if (overlay.type === 'emoji') {
                  return (
                    <div
                      key={overlay.id}
                      onPointerDown={(e) => handlePointerDown(e, overlay.id)}
                      className={`se-overlay-item emoji-item ${isActive ? 'active' : ''}`}
                      style={{
                        left: `${overlay.x}px`,
                        top: `${overlay.y}px`,
                        transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`
                      }}
                    >
                      {overlay.emoji}
                    </div>
                  );
                }

                if (overlay.type === 'movie') {
                  const m = overlay.movie;
                  return (
                    <div
                      key={overlay.id}
                      onPointerDown={(e) => handlePointerDown(e, overlay.id)}
                      className={`se-overlay-item movie-card-item glass ${isActive ? 'active' : ''}`}
                      style={{
                        left: `${overlay.x}px`,
                        top: `${overlay.y}px`,
                        transform: `translate(-50%, -50%) scale(${overlay.scale || 1}) rotate(${overlay.rotation || 0}deg)`
                      }}
                    >
                      <img src={m.poster} alt={m.title} />
                      <div className="se-card-details">
                        <span className="se-card-title">🎬 {m.title}</span>
                        <span className="se-card-subtitle">{m.year} • {m.genres.join(', ') || 'N/A'}</span>
                        <div className="se-card-ratings">
                          <span className="rating-imdb">⭐ IMDb {m.imdbRating}</span>
                          <span className="rating-nova">🟣 Nova {m.novaRating}</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* Scale & Rotation Sliders for selected items */}
            {selectedItem && (
              <div className="se-overlay-adjustments">
                <div className="adjustment-slider">
                  <span>↕️ Size</span>
                  <input 
                    type="range" 
                    min="0.4" 
                    max="2.5" 
                    step="0.05"
                    value={selectedItem.scale || 1} 
                    onChange={e => updateSelectedProperty('scale', parseFloat(e.target.value))}
                  />
                </div>
                <div className="adjustment-slider">
                  <span>🔄 Rotation</span>
                  <input 
                    type="range" 
                    min="-180" 
                    max="180"
                    value={selectedItem.rotation || 0} 
                    onChange={e => updateSelectedProperty('rotation', parseInt(e.target.value))}
                  />
                </div>
                <button className="se-overlay-delete-btn" onClick={deleteSelectedOverlay}>
                  🗑️ Remove Element
                </button>
              </div>
            )}
          </div>

          {/* Bottom Section Controls */}
          <div className="se-bottom-actions">
            <button className="se-footer-pill">
              👥 Close Friends
            </button>
            <button className="se-share-circle-btn" onClick={handleShareStory} disabled={uploading}>
              {uploading ? <div className="spinner mini"></div> : '➔'}
            </button>
          </div>
        </div>
      )}

      {/* 3. Text Overlay Editor Dialog */}
      {showTextEditor && (
        <div className="se-text-edit-modal-overlay">
          <form onSubmit={saveTextOverlay} className="se-text-edit-modal">
            <div className="se-text-header">
              <button 
                type="button" 
                className={`se-text-bg-toggle ${textBg ? 'active' : ''}`}
                onClick={() => setTextBg(!textBg)}
              >
                A
              </button>
              <div className="se-font-selector">
                {FONT_STYLES.map(f => (
                  <button 
                    key={f.id}
                    type="button" 
                    className={`se-font-btn ${textFont === f.id ? 'active' : ''}`}
                    onClick={() => setTextFont(f.id)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
            <textarea 
              autoFocus
              className="se-text-textarea"
              style={{
                color: textColor,
                fontFamily: FONT_STYLES.find(f => f.id === textFont)?.style.fontFamily,
                textShadow: FONT_STYLES.find(f => f.id === textFont)?.style.textShadow,
                background: textBg ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                backdropFilter: textBg ? 'blur(16px)' : 'none',
                WebkitBackdropFilter: textBg ? 'blur(16px)' : 'none',
                border: textBg ? '1px solid rgba(255, 255, 255, 0.2)' : 'none',
                borderRadius: '12px',
                padding: '16px'
              }}
              value={textDraft}
              onChange={e => setTextDraft(e.target.value)}
              placeholder="Start typing..."
              maxLength={120}
            />
            <div className="se-color-palette">
              {COLORS.map(c => (
                <div 
                  key={c} 
                  className={`se-color-dot ${textColor === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setTextColor(c)}
                />
              ))}
            </div>
            <div className="se-text-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowTextEditor(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Done
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Emoji Drawer Modal */}
      {showEmojiDrawer && (
        <div className="se-drawer-overlay" onClick={() => setShowEmojiDrawer(false)}>
          <div className="se-drawer-content" onClick={e => e.stopPropagation()}>
            <div className="se-drawer-header">
              <h4>Select Emoji Sticker</h4>
              <button className="se-drawer-close-btn" onClick={() => setShowEmojiDrawer(false)}>&times;</button>
            </div>
            <div className="se-emoji-picker-grid">
              {EMOJIS.map(emoji => (
                <div key={emoji} className="se-emoji-item-grid" onClick={() => addEmojiOverlay(emoji)}>
                  {emoji}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. Movie Search Modal */}
      {showMovieSearch && (
        <div className="se-drawer-overlay" onClick={() => setShowMovieSearch(false)}>
          <div className="se-drawer-content" onClick={e => e.stopPropagation()}>
            <div className="se-drawer-header">
              <h4>🎬 Select Movie Widget</h4>
              <button className="se-drawer-close-btn" onClick={() => setShowMovieSearch(false)}>&times;</button>
            </div>
            <div style={{ padding: '0 1rem 1rem' }}>
              <input 
                type="text"
                autoFocus
                className="input"
                placeholder="Search movies..."
                value={movieQuery}
                onChange={e => handleMovieSearch(e.target.value)}
              />
              <div className="se-movie-results-list">
                {movieSuggestions.map(s => (
                  <div 
                    key={s.title} 
                    className="se-movie-result-row"
                    onClick={() => addMovieOverlay(s.title)}
                  >
                    <img src={s.poster} alt={s.title} />
                    <div>
                      <h5>{s.title}</h5>
                      <p>{s.year} • ⭐ {s.rating}</p>
                    </div>
                  </div>
                ))}
                {movieQuery.length >= 2 && movieSuggestions.length === 0 && (
                  <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: '1.5rem' }}>
                    No results found
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Integration with Device Photo Upload & Crop */}
      <ImageUploadModal 
        isOpen={showCropModal}
        onClose={() => setShowCropModal(false)}
        type="story"
        onUpload={async (base64) => {
          try {
            const res = await api.post('/users/upload', { image_base64: base64, type: 'story' });
            setBgImage(res.data.url);
            setShowRecentGrid(false);
            setShowCropModal(false);
          } catch (err) {
            console.error("Image upload failed:", err);
            alert("Failed to upload image. Please check that the image size is under 10MB and format is supported.");
          }
        }}
      />

      {/* 7. Uploading progress HUD */}
      {uploading && (
        <div className="se-uploading-hud">
          <div className="se-hud-card">
            <h4>Uploading Story...</h4>
            <div className="se-progress-bar-track">
              <div className="se-progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Mention Input Popup */}
      {showMentionModal && (
        <div className="se-text-edit-modal-overlay" onClick={() => setShowMentionModal(false)}>
          <div className="se-text-edit-modal" onClick={e => e.stopPropagation()}>
            <h4 style={{ textAlign: 'center', margin: '0 0 10px 0' }}>Mention User</h4>
            <input 
              type="text" 
              autoFocus
              className="se-text-textarea"
              style={{ fontSize: '1.8rem', borderBottom: '1px solid rgba(255,255,255,0.2)', height: '60px' }}
              value={mentionDraft}
              onChange={e => setMentionDraft(e.target.value)}
              placeholder="username"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addMentionOverlay(mentionDraft);
                }
              }}
            />
            <div className="se-text-footer" style={{ marginTop: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowMentionModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => addMentionOverlay(mentionDraft)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Music Search Modal */}
      <SpotifyPicker 
        isOpen={showMusicSearch}
        onClose={() => setShowMusicSearch(false)}
        onSelect={(music) => {
          setOverlays(prev => [
            ...prev,
            {
              id: `music_${Date.now()}`,
              type: 'music',
              music,
              x: 100, y: 100, scale: 1, rotation: 0
            }
          ]);
        }}
      />

      </div>
    </>,
    document.body
  );
}
