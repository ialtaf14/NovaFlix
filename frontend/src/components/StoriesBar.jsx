import React from 'react';
import { useNavigate } from 'react-router-dom';
import './StoriesBar.css';

const FALLBACK = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png';

export default function StoriesBar({ stories, currentUser, onAddStory }) {
  const navigate = useNavigate();

  // Find if current user has an active story
  const currentUserStory = stories.find(g => g.username === currentUser?.username);

  // Exclude current user from the main list so we can pin them to the front
  const otherStories = stories.filter(g => g.username !== currentUser?.username);

  const handleStoryClick = (username) => {
    navigate(`/story-viewer?user=${username}`);
  };

  return (
    <div className="stories-bar-container">
      {/* 1. Logged-in User's "Your Story" Badge */}
      <div
        className="story-circle-wrapper"
        onClick={() => {
          if (currentUserStory) {
            handleStoryClick(currentUser.username);
          } else {
            onAddStory();
          }
        }}
        onContextMenu={(e) => { e.preventDefault(); onAddStory(); }}
        title={currentUserStory ? 'View your story (right-click to add more)' : 'Add a story'}
      >
        <div className={`story-circle-outer ${currentUserStory ? (currentUserStory.all_seen ? 'viewed' : 'unviewed') : 'none'}`}>
          <div className="story-circle-inner">
            <img
              src={currentUser?.photo_url || currentUser?.avatar || FALLBACK}
              alt="Your Story"
              className="story-circle-img"
              onError={(e) => { e.target.src = FALLBACK }}
            />
          </div>
          {/* Show the '+' — add more stories anytime (IG behaviour) */}
          <div className="story-add-badge" onClick={(e) => { e.stopPropagation(); onAddStory(); }}>
            +
          </div>
          {currentUserStory?.stories?.length > 1 && (
            <span className="story-count-badge">{currentUserStory.stories.length}</span>
          )}
        </div>
        <span className="story-username">Your story</span>
      </div>

      {/* 2. Other Users' Stories */}
      {otherStories.map(group => {
        const isUnviewed = group.all_seen === undefined ? group.has_new !== false : !group.all_seen;
        return (
          <div
            key={group.username}
            className="story-circle-wrapper"
            onClick={() => handleStoryClick(group.username)}
          >
            <div className={`story-circle-outer ${isUnviewed ? 'unviewed' : 'viewed'}`}>
              <div className="story-circle-inner">
                <img
                  src={group.photo_url || group.avatar || FALLBACK}
                  alt={group.username}
                  className="story-circle-img"
                  onError={(e) => { e.target.src = FALLBACK }}
                />
              </div>
              {group.stories?.length > 1 && (
                <span className="story-count-badge">{group.stories.length}</span>
              )}
            </div>
            <span className="story-username">
              {group.username.length > 10 ? group.username.slice(0, 9) + '…' : group.username}
            </span>
          </div>
        );
      })}

      {otherStories.length === 0 && !currentUserStory && (
        <div className="stories-empty-hint">
          Follow people to see their stories here ✨
        </div>
      )}
    </div>
  );
}
