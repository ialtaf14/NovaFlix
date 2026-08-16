import React, { useEffect } from 'react';
import './InteractiveBackground.css';

const InteractiveBackground = () => {
  useEffect(() => {
    const blob = document.getElementById("blob");
    let animationFrameId;

    const handleMouseMove = (e) => {
      if (blob) {
        blob.animate({
          left: `${e.clientX}px`,
          top: `${e.clientY}px`
        }, { duration: 3000, fill: "forwards" });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="interactive-bg-container">
      <div id="blob"></div>
      <div id="blur-layer"></div>
    </div>
  );
};

export default InteractiveBackground;
