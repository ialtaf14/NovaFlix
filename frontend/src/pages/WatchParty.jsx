import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { getSocket } from '../services/socket'
import api from '../services/api'
import './WatchParty.css'

export default function WatchParty() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [params] = useSearchParams()
  const urlMovie = params.get('movie')

  const [roomCode, setRoomCode] = useState('')
  const [inRoom, setInRoom] = useState(false)
  const [party, setParty] = useState(null)
  
  // Create / Select fields
  const [movieTitle, setMovieTitle] = useState(urlMovie || '')
  const [chatMessage, setChatMessage] = useState('')
  const [chatList, setChatList] = useState([])
  const [activeMembers, setActiveMembers] = useState([])
  const [floatingEmojis, setFloatingEmojis] = useState([]) // [{id, emoji}]

  // Player Sync State
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [roomError, setRoomError] = useState('')
  
  const socketRef = useRef(null)
  const playTimerRef = useRef(null)
  const isSyncingRef = useRef(false) // Lock to prevent circular loops

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
  }, [user])

  const fetchPartyRoomDetails = useCallback(async (code) => {
    try {
      const { data } = await api.get(`/social/party/${code}`)
      setParty(data)
      setChatList(data.chat || [])
      setActiveMembers(data.members || [])
      setProgress(data.playback_state?.progress || 0)
      setIsPlaying(data.playback_state?.is_playing || false)
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    // If room is active, configure sockets
    if (inRoom && roomCode) {
      const socket = getSocket()
      socketRef.current = socket

      // Join room channel
      socket.emit('join_party', { room_code: roomCode })

      // Sockets listening
      socket.on('party_user_joined', () => {
        // Refresh party room state
        fetchPartyRoomDetails(roomCode)
      })

      socket.on('party_control_sync', (data) => {
        isSyncingRef.current = true
        if (data.action === 'play') {
          setIsPlaying(true)
          setProgress(data.progress)
        } else if (data.action === 'pause') {
          setIsPlaying(false)
          setProgress(data.progress)
        } else if (data.action === 'seek') {
          setProgress(data.progress)
        }
        setTimeout(() => { isSyncingRef.current = false }, 200)
      })

      socket.on('party_chat_message', (msgObj) => {
        setChatList(prev => [...prev, msgObj])
      })

      socket.on('party_reaction_burst', (data) => {
        const id = Math.random().toString(36).substr(2, 9)
        setFloatingEmojis(prev => [...prev, { id, emoji: data.emoji }])
        setTimeout(() => {
          setFloatingEmojis(prev => prev.filter(e => e.id !== id))
        }, 3000)
      })

      return () => {
        socket.off('party_user_joined')
        socket.off('party_control_sync')
        socket.off('party_chat_message')
        socket.off('party_reaction_burst')
      }
    }
  }, [inRoom, roomCode, fetchPartyRoomDetails])

  // Play ticker simulation
  useEffect(() => {
    if (isPlaying && inRoom) {
      playTimerRef.current = setInterval(() => {
        setProgress(prev => {
          const nextVal = Math.min(100, prev + 1)
          if (nextVal >= 100) {
            setIsPlaying(false)
            clearInterval(playTimerRef.current)
          }
          return nextVal
        })
      }, 2000)
    } else {
      clearInterval(playTimerRef.current)
    }
    return () => clearInterval(playTimerRef.current)
  }, [isPlaying, inRoom])


  const handleCreateRoom = async () => {
    if (!movieTitle.trim()) {
      alert("Please select a movie title to watch")
      return
    }
    try {
      const { data } = await api.post('/social/party/create', { movie_title: movieTitle.trim() })
      setParty(data)
      setRoomCode(data.code)
      setInRoom(true)
      setActiveMembers(data.members)
      setChatList(data.chat || [])
      setRoomError('')
    } catch (err) {
      alert("Failed to create Watch Party room")
    }
  }

  const handleJoinRoom = async (e) => {
    e.preventDefault()
    if (!roomCode.trim()) return
    try {
      const codeUpper = roomCode.trim().toUpperCase()
      const { data } = await api.post('/social/party/join', { room_code: codeUpper })
      setParty(data)
      setRoomCode(codeUpper)
      setInRoom(true)
      setActiveMembers(data.members || [])
      setChatList(data.chat || [])
      setProgress(data.playback_state?.progress || 0)
      setIsPlaying(data.playback_state?.is_playing || false)
      setRoomError('')
    } catch (err) {
      setRoomError(err.response?.data?.detail || "Invalid room code.")
    }
  }

  const handleTogglePlay = () => {
    if (isSyncingRef.current) return
    const nextPlaying = !isPlaying
    setIsPlaying(nextPlaying)
    
    if (socketRef.current) {
      socketRef.current.emit('party_control', {
        room_code: roomCode,
        action: nextPlaying ? 'play' : 'pause',
        progress: progress
      })
    }
  }

  const handleScrubberChange = (e) => {
    if (isSyncingRef.current) return
    const nextVal = parseInt(e.target.value)
    setProgress(nextVal)
    
    if (socketRef.current) {
      socketRef.current.emit('party_control', {
        room_code: roomCode,
        action: 'seek',
        progress: nextVal
      })
    }
  }

  const handleSendChat = (e) => {
    e.preventDefault()
    if (!chatMessage.trim()) return
    
    if (socketRef.current) {
      socketRef.current.emit('party_chat_send', {
        room_code: roomCode,
        text: chatMessage.trim()
      })
    }
    setChatMessage('')
  }

  const emitReaction = (emoji) => {
    if (socketRef.current) {
      socketRef.current.emit('party_reaction_send', {
        room_code: roomCode,
        emoji
      })
    }
  }

  const handleLeaveRoom = () => {
    setInRoom(false)
    setParty(null)
    setRoomCode('')
    setIsPlaying(false)
    setProgress(0)
    setChatList([])
  }

  if (!inRoom) {
    return (
      <div className="page watch-party-setup fade-up">
        <div className="container" style={{ maxWidth: 500 }}>
          <button className="back-arrow-btn" onClick={() => navigate(-1)}>←</button>
          
          <div className="glass setup-card">
            <h2>👥 Watch Together</h2>
            <p className="subtitle">Invite friends to sync movie playback, chat, and react in real-time rooms.</p>

            <div className="setup-divider" />

            <div className="join-section">
              <h3>Join Watch Party</h3>
              <form onSubmit={handleJoinRoom}>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter 6-digit Room Code"
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value)}
                  maxLength={6}
                />
                {roomError && <p className="error-text">❌ {roomError}</p>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.8rem' }}>
                  Join Room
                </button>
              </form>
            </div>

            <div className="setup-or"><span>OR</span></div>

            <div className="create-section">
              <h3>Create Party Room</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Interstellar"
                  value={movieTitle}
                  onChange={e => setMovieTitle(e.target.value)}
                />
                <button className="btn btn-ghost" onClick={handleCreateRoom} style={{ width: '100%' }}>
                  Create Room
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page watch-party-room fade-up">
      <div className="container party-grid">
        
        {/* Left Side: Sync Player */}
        <div className="party-player-column">
          <div className="party-room-header">
            <button className="btn-leave-party" onClick={handleLeaveRoom}>← Leave Room</button>
            <div className="party-movie-meta">
              <h2>Watching {party?.movie_title}</h2>
              <span className="party-code-badge">🚪 Room Code: <strong>{roomCode}</strong></span>
            </div>
          </div>

          <div className="party-player-wrapper glass">
            {/* Floating emojis overlay */}
            <div className="floating-emojis-container">
              {floatingEmojis.map(e => (
                <span key={e.id} className="floating-emoji-item">{e.emoji}</span>
              ))}
            </div>

            <div className="simulated-player-screen">
              {isPlaying ? (
                <div className="playback-pulse">
                  🎬 <span>Sync Active • Playback Synced</span>
                </div>
              ) : (
                <div className="playback-pulse paused">
                  ⏸ <span>Room Paused</span>
                </div>
              )}
              
              <div className="playback-prog-counter">{progress}%</div>
            </div>

            <div className="party-controls-bar">
              <input
                type="range"
                min="0"
                max="100"
                className="party-timeline-slider"
                value={progress}
                onChange={handleScrubberChange}
              />
              
              <div className="party-playback-actions">
                <button className="btn-party-play" onClick={handleTogglePlay}>
                  {isPlaying ? '⏸ Pause room' : '▶ Play room'}
                </button>
                <div className="party-reaction-bar">
                  {['❤️', '😂', '😮', '😱', '🔥', '👏'].map(emoji => (
                    <button key={emoji} className="party-react-emoji-btn" onClick={() => emitReaction(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Members, Chat & Invites */}
        <div className="party-sidebar-column">
          <div className="glass party-sidebar-tabs">
            
            {/* Members Section */}
            <div className="sidebar-section">
              <h3>Active Members ({activeMembers.length})</h3>
              <div className="party-members-list">
                {activeMembers.map(m => (
                  <div key={m.username} className="party-member-item">
                    <img src={m.photo_url} alt={m.username} className="member-avatar" />
                    <div className="member-names">
                      <span className="member-name">{m.name || m.username}</span>
                      <span className="member-handle">@{m.username}</span>
                    </div>
                    <span className="voice-mic-status" title="Voice Room Enabled">
                      🎙️ Connected
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat Room */}
            <div className="sidebar-section chat-section">
              <h3>Live Room Chat</h3>
              <div className="chat-messages-container">
                {chatList.length === 0 ? (
                  <div className="empty-chat">Say hello in room chat! 👋</div>
                ) : (
                  chatList.map(msg => (
                    <div key={msg.id} className="party-chat-msg-item">
                      <img src={msg.photo_url} alt={msg.username} className="chat-avatar" />
                      <div className="chat-msg-body">
                        <span className="chat-msg-user"><strong>{msg.name || msg.username}</strong></span>
                        <p className="chat-msg-text">{msg.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendChat} className="party-chat-input-form">
                <input
                  type="text"
                  className="input"
                  placeholder="Send room chat..."
                  value={chatMessage}
                  onChange={e => setChatMessage(e.target.value)}
                />
                <button type="submit" className="btn-chat-send">Send</button>
              </form>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
