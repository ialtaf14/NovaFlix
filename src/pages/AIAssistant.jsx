import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import './AIAssistant.css'

export default function AIAssistant() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()

  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'ai',
      text: "👋 Hello! I'm Nova, your AI Movie Assistant. Ask me anything like:\n\n• 'Show me a mind-bending thriller similar to Inception'\n• 'Sci-Fi space movies with less emotion'\n• 'Recommend a fast-paced action movie'",
      timestamp: Date.now()
    }
  ])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!inputText.trim() || loading) return

    const userText = inputText.trim()
    const msgId = Math.random().toString(36).substr(2, 9)

    // Append user message
    const userMsg = {
      id: `user-${msgId}`,
      sender: 'user',
      text: userText,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, userMsg])
    setInputText('')
    setLoading(true)

    try {
      const { data } = await api.post('/social/ai/chat', { message: userText })
      
      const aiMsg = {
        id: `ai-${msgId}`,
        sender: 'ai',
        text: data.reply,
        suggestions: data.suggestions || [],
        timestamp: Date.now()
      }
      
      setMessages(prev => [...prev, aiMsg])
    } catch (err) {
      const errorMsg = {
        id: `ai-err-${msgId}`,
        sender: 'ai',
        text: "Sorry, I ran into an error processing your query. Please try again.",
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleAddWishlist = async (title) => {
    try {
      const { data } = await api.post('/users/wishlist', { title })
      updateUser({ wishlist: data.wishlist })
      alert(`💖 Added "${title}" to your Wishlist!`)
    } catch (_) {}
  }

  return (
    <div className="page ai-assistant-page fade-up">
      <div className="container" style={{ maxWidth: 850 }}>
        
        <div className="ai-header glass">
          <div className="ai-header-profile">
            <span className="ai-avatar-circle">🟣</span>
            <div>
              <h2>Nova AI Movie Guide</h2>
              <span className="ai-status-indicator">● Online • Offline NLP Enabled</span>
            </div>
          </div>
        </div>

        <div className="ai-chat-container glass">
          <div className="ai-chat-messages">
            {messages.map(msg => (
              <div key={msg.id} className={`ai-message-wrapper ${msg.sender}`}>
                <div className="ai-message-bubble">
                  <p className="message-text" style={{ whiteSpace: 'pre-line' }}>{msg.text}</p>
                  
                  {/* Suggestions Carousel */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="ai-movie-suggestions">
                      {msg.suggestions.map(movie => (
                        <div key={movie.title} className="ai-movie-sugg-card glass">
                          <img src={movie.poster} alt={movie.title}
                            onError={e => e.target.src = "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg"} />
                          <div className="sugg-card-details">
                            <span className="sugg-title">{movie.title} ({movie.year})</span>
                            <div className="sugg-ratings">
                              <span className="sugg-badge">⭐ {movie.rating}</span>
                              <span className="sugg-badge purple">🟣 {movie.novaflix_rating || 'N/A'}</span>
                            </div>
                            <div className="sugg-actions">
                              <button className="btn-sugg-action primary" onClick={() => navigate(`/movie?title=${encodeURIComponent(movie.title)}`)}>
                                Details
                              </button>
                              {user && !user.wishlist?.includes(movie.title) && (
                                <button className="btn-sugg-action" onClick={() => handleAddWishlist(movie.title)}>
                                  + Wishlist
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="ai-message-wrapper ai">
                <div className="ai-message-bubble loading-bubble">
                  <div className="dots-bounce">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="ai-chat-input-bar">
            <input
              type="text"
              className="input"
              placeholder="Ask Nova for movie recommendations..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn btn-primary" disabled={loading || !inputText.trim()}>
              Ask
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
