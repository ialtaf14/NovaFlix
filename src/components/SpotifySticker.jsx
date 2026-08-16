import React from 'react';
import './SpotifySticker.css';

export default function SpotifySticker({ music }) {
  if (!music) return null;

  return (
    <div className="spotify-sticker">
      <div className="ss-album-art">
        <img src={music.albumArt} alt="Album Art" />
        <div className="ss-equalizer">
          <span className="bar bar1"></span>
          <span className="bar bar2"></span>
          <span className="bar bar3"></span>
          <span className="bar bar4"></span>
        </div>
      </div>
      <div className="ss-info">
        <div className="ss-title">{music.name}</div>
        <div className="ss-artist">{music.artist}</div>
      </div>
      <div className="ss-logo">
        <img src="https://storage.googleapis.com/pr-newsroom-wp/1/2018/11/Spotify_Logo_RGB_White.png" alt="Spotify" />
      </div>
    </div>
  );
}
