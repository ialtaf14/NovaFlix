import React, { useEffect, useRef, useState } from 'react'
import './CallScreen.css'

export default function CallScreen({ 
  callType, // 'audio' | 'video'
  peerName,
  peerAvatar,
  isIncoming,
  isActive,
  onAccept,
  onDecline,
  onEndCall,
  localStream,
  remoteStream 
}) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled)
      setIsMuted(!isMuted)
    }
  }

  const toggleVideo = () => {
    if (localStream && callType === 'video') {
      localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled)
      setIsVideoOff(!isVideoOff)
    }
  }

  return (
    <div className={`call-screen-overlay ${isIncoming && !isActive ? 'incoming' : 'active'}`}>
      {/* Background blur */}
      <div className="call-bg-blur" style={{ backgroundImage: `url(${peerAvatar})` }} />
      
      <div className="call-content">
        {/* Header */}
        <div className="call-header">
          <img src={peerAvatar} alt={peerName} className="call-avatar-large pulse-glow" />
          <h2 className="call-peer-name">{peerName}</h2>
          <p className="call-status">
            {isIncoming && !isActive ? `Incoming ${callType} call...` : `Ongoing ${callType} call`}
          </p>
        </div>

        {/* Video Streams */}
        {callType === 'video' && isActive && (
          <div className="call-video-container">
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              className="remote-video"
            />
            <div className="local-video-pip">
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className="local-video"
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="call-actions">
          {isIncoming && !isActive ? (
            <>
              <button className="call-btn decline" onClick={onDecline}>
                <span className="material-icons">call_end</span>
              </button>
              <button className="call-btn accept bounce" onClick={onAccept}>
                <span className="material-icons">call</span>
              </button>
            </>
          ) : (
            <>
              <button className={`call-btn control ${isMuted ? 'off' : ''}`} onClick={toggleMute}>
                <span className="material-icons">{isMuted ? 'mic_off' : 'mic'}</span>
              </button>
              {callType === 'video' && (
                <button className={`call-btn control ${isVideoOff ? 'off' : ''}`} onClick={toggleVideo}>
                  <span className="material-icons">{isVideoOff ? 'videocam_off' : 'videocam'}</span>
                </button>
              )}
              <button className="call-btn end" onClick={onEndCall}>
                <span className="material-icons">call_end</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
