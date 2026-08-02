import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import './MessagesModal.css'

const REACTIONS = ['❤️', '🔥', '😂', '👍', '😮', '😢']
const FALLBACK = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return new Date(ts).toLocaleDateString()
}

function formatMsgTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessagesModal({ onClose }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [convs, setConvs] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [otherUser, setOtherUser] = useState(null)
  const [msgText, setMsgText] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [convSearch, setConvSearch] = useState('')
  const [showReactions, setShowReactions] = useState(null) // msg id
  const [replyTo, setReplyTo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const overlayRef = useRef(null)

  useEffect(() => { fetchConversations() }, [])
  useEffect(() => { if (activeConv) fetchMessages(activeConv) }, [activeConv])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function fetchConversations() {
    try {
      const { data } = await api.get('/chat/conversations')
      setConvs(data.conversations)
      if (data.conversations.length > 0 && !activeConv) {
        setActiveConv(data.conversations[0].username)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function fetchMessages(username) {
    try {
      const { data } = await api.get(`/chat/${username}`)
      setMessages(data.messages)
      setOtherUser(data.other_user)
    } catch (e) { console.error(e) }
  }

  async function sendMessage(e) {
    e?.preventDefault()
    if (!msgText.trim() || !activeConv || sending) return
    setSending(true)
    try {
      const { data } = await api.post(`/chat/${activeConv}/send`, {
        content: msgText.trim(),
        type: 'text',
        reply_to: replyTo?.id || null
      })
      setMessages(prev => [...prev, data.message])
      setMsgText('')
      setReplyTo(null)
      // Refresh conv list
      fetchConversations()
    } catch (e) { console.error(e) }
    finally { setSending(false) }
  }

  async function sendMovieCard(movie) {
    if (!activeConv) return
    await api.post(`/chat/${activeConv}/send`, {
      content: `Shared: ${movie.title}`,
      type: 'movie',
      movie_data: movie
    })
    fetchMessages(activeConv)
    fetchConversations()
  }

  async function reactToMsg(msgId, emoji) {
    if (!activeConv) return
    await api.post(`/chat/${activeConv}/react/${msgId}`, { emoji })
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      const newReactions = { ...m.reactions }
      if (newReactions[user.username] === emoji) delete newReactions[user.username]
      else newReactions[user.username] = emoji
      return { ...m, reactions: newReactions }
    }))
    setShowReactions(null)
  }

  async function deleteMsg(msgId) {
    if (!activeConv) return
    await api.delete(`/chat/${activeConv}/message/${msgId}`)
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted: true, content: 'This message was deleted' } : m))
    setShowReactions(null)
  }

  const visibleConvs = convs.filter(c =>
    !convSearch || c.name?.toLowerCase().includes(convSearch.toLowerCase()) ||
    c.username.toLowerCase().includes(convSearch.toLowerCase())
  )

  const visibleMsgs = messages.filter(m =>
    !searchQ || m.content?.toLowerCase().includes(searchQ.toLowerCase())
  )

  // Group messages by date
  function groupByDate(msgs) {
    const groups = {}
    msgs.forEach(m => {
      const d = new Date(m.timestamp).toDateString()
      if (!groups[d]) groups[d] = []
      groups[d].push(m)
    })
    return groups
  }

  const msgGroups = groupByDate(visibleMsgs)

  return (
    <div className="mm-overlay" ref={overlayRef} onClick={e => e.target === overlayRef.current && onClose()}>
      <div className="mm-panel fade-up">
        {/* Left: Conversations */}
        <div className="mm-left">
          <div className="mm-left-header">
            <span className="mm-title">Messages</span>
            <button className="mm-icon-btn" title="New Message">✏️</button>
          </div>
          <div className="mm-conv-search-wrap">
            <span>🔍</span>
            <input className="mm-conv-search" placeholder="Search messages..."
              value={convSearch} onChange={e => setConvSearch(e.target.value)} />
          </div>
          <div className="mm-conv-list">
            {loading ? (
              <div className="mm-empty"><div className="spinner" style={{ width: 24, height: 24 }}></div></div>
            ) : visibleConvs.length === 0 ? (
              <div className="mm-empty">No conversations yet</div>
            ) : (
              visibleConvs.map(c => (
                <div key={c.username}
                  className={`mm-conv-item ${activeConv === c.username ? 'active' : ''}`}
                  onClick={() => setActiveConv(c.username)}>
                  <div className="mm-conv-avatar-wrap">
                    <img src={c.photo_url || FALLBACK} alt={c.name}
                      onError={e => { e.target.src = FALLBACK }} />
                    {c.online && <span className="mm-online-dot"></span>}
                  </div>
                  <div className="mm-conv-info">
                    <div className="mm-conv-top">
                      <span className="mm-conv-name">{c.name || c.username}</span>
                      <span className="mm-conv-time">
                        {c.last_message ? timeAgo(c.last_message.timestamp) : ''}
                      </span>
                    </div>
                    <div className="mm-conv-bottom">
                      <span className="mm-conv-preview">
                        {c.last_message?.deleted ? 'Message deleted' :
                          c.last_message?.type === 'movie' ? `🎬 ${c.last_message.movie_data?.title || 'Movie'}` :
                          c.last_message?.content || ''}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="mm-unread-badge">{c.unread_count}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Chat */}
        <div className="mm-right">
          {!activeConv || !otherUser ? (
            <div className="mm-no-conv">
              <span style={{ fontSize: '3rem' }}>💬</span>
              <p>Select a conversation to start chatting</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="mm-chat-header">
                <button className="mm-back-btn" onClick={() => setActiveConv(null)}>←</button>
                <img src={otherUser.photo_url || FALLBACK} alt={otherUser.name}
                  className="mm-chat-avatar"
                  onClick={() => navigate(`/user/${otherUser.username}`)}
                  onError={e => { e.target.src = FALLBACK }} />
                <div className="mm-chat-user-info" onClick={() => navigate(`/user/${otherUser.username}`)}>
                  <span className="mm-chat-name">{otherUser.name || otherUser.username}</span>
                  <span className="mm-chat-status">{otherUser.online ? '🟢 Active now' : 'Offline'}</span>
                </div>
                <div className="mm-chat-actions">
                  <button className="mm-icon-btn" title="Voice Call">📞</button>
                  <button className="mm-icon-btn" title="Video Call">📹</button>
                  <div className="mm-chat-search-wrap">
                    <input className="mm-chat-search" placeholder="Search in chat..."
                      value={searchQ} onChange={e => setSearchQ(e.target.value)} />
                  </div>
                  <button className="mm-icon-btn" title="More">⋮</button>
                </div>
              </div>

              {/* Messages */}
              <div className="mm-messages">
                {Object.entries(msgGroups).map(([date, msgs]) => (
                  <div key={date}>
                    <div className="mm-date-separator"><span>{date === new Date().toDateString() ? 'Today' : date}</span></div>
                    {msgs.map(m => {
                      const isMe = m.sender === user?.username
                      const reactions = Object.entries(m.reactions || {})
                      return (
                        <div key={m.id} className={`mm-msg-wrap ${isMe ? 'me' : 'them'}`}>
                          {/* Reply indicator */}
                          {m.reply_to && (
                            <div className="mm-reply-preview">↩️ Reply to message</div>
                          )}

                          <div className="mm-bubble-group"
                            onMouseLeave={() => setShowReactions(null)}>
                            {!isMe && (
                              <img src={otherUser.photo_url || FALLBACK} alt=""
                                className="mm-msg-avatar"
                                onError={e => { e.target.src = FALLBACK }} />
                            )}
                            <div className="mm-bubble-col">
                              {/* Movie card */}
                              {m.type === 'movie' && m.movie_data && !m.deleted ? (
                                <MovieCard movie={m.movie_data} isMe={isMe} />
                              ) : (
                                <div className={`mm-bubble ${isMe ? 'me' : 'them'} ${m.deleted ? 'deleted' : ''}`}
                                  onContextMenu={e => { e.preventDefault(); setShowReactions(m.id) }}>
                                  {m.content}
                                </div>
                              )}

                              {/* Seen + time */}
                              <div className={`mm-meta ${isMe ? 'me' : 'them'}`}>
                                <span className="mm-msg-time">{formatMsgTime(m.timestamp)}</span>
                                {isMe && m.seen && <span className="mm-seen">✓✓</span>}
                              </div>

                              {/* Reaction bubbles */}
                              {reactions.length > 0 && (
                                <div className={`mm-reactions ${isMe ? 'me' : 'them'}`}>
                                  {reactions.map(([u, e]) => (
                                    <span key={u} title={u}>{e}</span>
                                  ))}
                                </div>
                              )}

                              {/* Reaction picker */}
                              {showReactions === m.id && (
                                <div className={`mm-reaction-picker ${isMe ? 'me' : 'them'}`}>
                                  {REACTIONS.map(e => (
                                    <button key={e} onClick={() => reactToMsg(m.id, e)}>{e}</button>
                                  ))}
                                  <button onClick={() => setReplyTo(m)} title="Reply">↩️</button>
                                  {isMe && !m.deleted && (
                                    <button onClick={() => deleteMsg(m.id)} title="Delete" style={{ color: '#ff4b2b' }}>🗑️</button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Long-press / hover reaction trigger */}
                            <button className="mm-react-trigger"
                              onClick={() => setShowReactions(showReactions === m.id ? null : m.id)}>😊</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div ref={bottomRef}></div>
              </div>

              {/* Reply banner */}
              {replyTo && (
                <div className="mm-reply-banner">
                  <span>↩️ Replying to: {replyTo.content?.slice(0, 40)}</span>
                  <button onClick={() => setReplyTo(null)}>✕</button>
                </div>
              )}

              {/* Input */}
              <form className="mm-input-row" onSubmit={sendMessage}>
                <button type="button" className="mm-icon-btn" title="Image">🖼️</button>
                <button type="button" className="mm-icon-btn" title="GIF">GIF</button>
                <input
                  ref={inputRef}
                  className="mm-input"
                  placeholder="Message..."
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(e)}
                />
                <button type="button" className="mm-icon-btn" title="Emoji">😊</button>
                <button type="button" className="mm-icon-btn" title="Voice">🎤</button>
                <button type="submit" className="mm-send-btn" disabled={!msgText.trim() || sending}>
                  {sending ? '...' : '➤'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MovieCard({ movie, isMe }) {
  const navigate = useNavigate()
  return (
    <div className={`mm-movie-card ${isMe ? 'me' : 'them'}`}>
      <img src={movie.poster || FALLBACK} alt={movie.title}
        onError={e => { e.target.src = FALLBACK }} />
      <div className="mm-movie-info">
        <span className="mm-movie-title">🎬 {movie.title}</span>
        <span className="mm-movie-meta">⭐ {movie.rating} • {movie.year}</span>
        <span className="mm-movie-genre">{movie.genre}</span>
        <div className="mm-movie-btns">
          <button onClick={() => navigate(`/movie?title=${encodeURIComponent(movie.title)}`)}>Watch</button>
          <button className="secondary">+ Wishlist</button>
        </div>
      </div>
    </div>
  )
}
