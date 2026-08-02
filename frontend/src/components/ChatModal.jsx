import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import { useAuthStore } from '../store/useAuthStore'
import { io } from 'socket.io-client'

export default function ChatModal({ targetUsername, targetPhoto, targetName, onClose }) {
  const { user, token } = useAuthStore()
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!user || !targetUsername) return

    // 1. Fetch chat history
    setLoading(true)
    api.get(`/chat/${targetUsername}`)
      .then(res => setMessages(res.data.messages || []))
      .catch(err => console.error("Failed to load chat history", err))
      .finally(() => setLoading(false))

    // 2. Setup Socket.IO connection
    // We connect to the same server, but we must pass our token so backend knows who we are.
    // In main.py, auth_data is the third parameter to connect event, or we can use auth payload.
    const socketUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || ''
    const socket = io(socketUrl, {
      path: '/ws/socket.io',
      auth: { token: token, username: user.username },
      transports: ['websocket', 'polling']
    })
    
    socket.on('connect', () => {
      console.log('Chat socket connected')
    })

    socket.on('receive_message', (msg) => {
      // If the message is from/to the current target, add it
      if (
        (msg.sender === targetUsername && msg.receiver === user.username) ||
        (msg.sender === user.username && msg.receiver === targetUsername)
      ) {
        setMessages(prev => [...prev, msg])
      }
    })

    socketRef.current = socket

    return () => {
      socket.disconnect()
    }
  }, [user, token, targetUsername])

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSend = (e) => {
    e.preventDefault()
    if (!inputText.trim() || !socketRef.current) return

    const msgData = {
      sender: user.username,
      receiver: targetUsername,
      content: inputText.trim(),
      timestamp: Date.now()
    }

    // Optimistically update UI
    setMessages(prev => [...prev, msgData])
    
    // Send to backend
    socketRef.current.emit('send_message', msgData)
    
    setInputText('')
  }

  return (
    <div className="chat-modal-overlay" onClick={onClose}>
      <div className="chat-modal glass" onClick={e => e.stopPropagation()}>
        <div className="chat-header">
          <div className="chat-header-user">
            <img src={targetPhoto || 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'} alt={targetUsername} />
            <div>
              <div className="chat-name">{targetName}</div>
              <div className="chat-username">@{targetUsername}</div>
            </div>
          </div>
          <button className="chat-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="chat-body">
          {loading ? (
            <div className="spinner"></div>
          ) : messages.length === 0 ? (
            <div className="empty-chat">Say hi to @{targetUsername}! 👋</div>
          ) : (
            messages.map((m, idx) => {
              const isMine = m.sender === user.username
              return (
                <div key={idx} className={`chat-bubble-wrapper ${isMine ? 'mine' : 'theirs'}`}>
                  <div className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`}>
                    {m.content}
                  </div>
                  <div className="chat-timestamp">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-footer" onSubmit={handleSend}>
          <input 
            type="text" 
            className="input chat-input" 
            placeholder="Type a message..." 
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-primary chat-send-btn" disabled={!inputText.trim()}>Send</button>
        </form>
      </div>
    </div>
  )
}
