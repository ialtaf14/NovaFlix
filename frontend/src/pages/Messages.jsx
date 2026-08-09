import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import './Messages.css'

const FALLBACK_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png'

const MOCK_GIFS = [
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3hicDcybmszdXJ2ZHB6M2g0Y2U4aHFycGg5cnFwbjZ6b3ozNmV4eSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/L5aC2b3jA0880/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2F3OXFvYXpxeDV6bmF5bTF4N3Iyb2RseGV0dG9hNmN2dm15YWg3MSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/y3x9rGLRSa4fe/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOW1hNDk3MXM2eG1oNnIxbHppOXJubm55MGJmczdzZHZudzhzMHZyeiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/d10DmiIQotRtS/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMjR6ZnF2azJqdnpia3Ixa3d3NWZ5MmNocWppZ3VibHR0MHpyam83OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/A8t748BfH69QA/giphy.gif"
]

// "Just now" / "5m" / "2h" / "3d" — Instagram-style compact time
const timeAgo = (ts) => {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

const lastSeenLabel = (lastSeen) => {
  if (!lastSeen) return 'Offline'
  const diff = Date.now() - lastSeen * 1000
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Active just now'
  if (m < 60) return `Active ${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `Active ${h}h ago`
  return `Active ${Math.floor(h / 24)}d ago`
}

export default function Messages() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()

  const [conversations, setConversations] = useState([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [convError, setConvError] = useState('')
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [inputText, setInputText] = useState('')
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [shareMovieTitle, setShareMovieTitle] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)

  // New-chat composer (Instagram style)
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatQuery, setNewChatQuery] = useState('')
  const [newChatResults, setNewChatResults] = useState([])
  const [searchingUsers, setSearchingUsers] = useState(false)

  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)
  const activeConvRef = useRef(null)   // keeps socket handlers in sync without reconnecting
  const typingTimerRef = useRef(null)
  const lastTypingEmitRef = useRef(0)

  useEffect(() => { activeConvRef.current = activeConv }, [activeConv])

  // Parse query parameters for direct conversation / movie share
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const shareUser = params.get('user')
    if (shareUser) {
      api.get(`/users/public/${shareUser}`).then(r => {
        setActiveConv({
          username: r.data.username,
          name: r.data.name,
          photo_url: r.data.photo_url
        })
      }).catch(err => console.error("Load share user error:", err))
    }
    const movieParam = params.get('share_movie')
    setShareMovieTitle(movieParam || '')
  }, [location.search])

  // Socket connection — ONE stable connection per login (not per active chat)
  useEffect(() => {
    if (!user) return

    const socketUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || ''
    const token = useAuthStore.getState().token
    const socket = io(socketUrl, {
      path: '/ws/socket.io',
      // SECURITY: authenticate the socket with the JWT — server derives the
      // username from the token, so no one can impersonate another account.
      auth: { token, username: user.username }
    })
    socketRef.current = socket

    socket.on('receive_message', (msg) => {
      const current = activeConvRef.current
      const isForActiveChat =
        (msg.sender === user.username && msg.receiver === current?.username) ||
        (msg.sender === current?.username && msg.receiver === user.username)

      if (isForActiveChat) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev
          if (msg.sender === user.username) {
            const withoutTemp = prev.filter(m => !(String(m.id).startsWith('temp-') && m.content === msg.content))
            return [...withoutTemp, msg]
          }
          return [...prev, msg]
        })
        if (msg.sender !== user.username) {
          socket.emit('mark_seen', { other: msg.sender })
        }
      }
      fetchConversations(false)
    })

    // Real-time Unsend event
    socket.on('message_unsent', ({ msg_id }) => {
      setMessages(prev => prev.filter(m => m.id !== msg_id))
      fetchConversations(false)
    })

    // Real-time Edit event
    socket.on('message_edited', ({ msg_id, new_content }) => {
      setMessages(prev => prev.map(m =>
        m.id === msg_id ? { ...m, content: new_content, edited: true } : m
      ))
      fetchConversations(false)
    })

    // Real-time Reaction event
    socket.on('message_reacted', ({ msg_id, emoji, username }) => {
      setMessages(prev => prev.map(m => {
        if (m.id === msg_id) {
          const reactions = { ...(m.reactions || {}) }
          const userList = reactions[emoji] || []
          if (userList.includes(username)) {
            reactions[emoji] = userList.filter(u => u !== username)
          } else {
            reactions[emoji] = [...userList, username]
          }
          return { ...m, reactions }
        }
        return m
      }))
    })

    // Other user opened our chat → flip our sent messages to "Seen" live
    socket.on('messages_seen', ({ by }) => {
      if (activeConvRef.current?.username === by) {
        setMessages(prev => prev.map(m =>
          m.sender === user.username ? { ...m, seen: true } : m
        ))
      }
    })

    socket.on('data_update', (data) => {
      if (data.type === 'typing' && data.sender === activeConvRef.current?.username) {
        setIsTyping(true)
        clearTimeout(typingTimerRef.current)
        typingTimerRef.current = setTimeout(() => setIsTyping(false), 2500)
      }
    })

    // Real-time online/offline status
    socket.on('presence_update', ({ username, online }) => {
      setConversations(prev => prev.map(c =>
        c.username === username ? { ...c, online, last_seen: online ? null : Math.floor(Date.now() / 1000) } : c
      ))
      setActiveConv(prev =>
        prev?.username === username ? { ...prev, online, last_seen: online ? null : Math.floor(Date.now() / 1000) } : prev
      )
    })

    return () => socket.disconnect()
  }, [user])

  // Re-fetch when the logged-in account changes (per-user isolation:
  // a new login must never see the previous account's conversations)
  useEffect(() => {
    setConversations([])
    setMessages([])
    setActiveConv(null)
    fetchConversations()
  }, [user?.username])

  useEffect(() => {
    if (activeConv) fetchMessages(activeConv.username)
  }, [activeConv?.username])

  useEffect(() => { scrollToBottom() }, [messages])

  const fetchConversations = async (showSpinner = true) => {
    if (showSpinner) setLoadingConvs(true)
    setConvError('')
    try {
      const { data } = await api.get('/chat/conversations')
      setConversations(data.conversations || [])
    } catch (err) {
      console.error("Load conversations failed:", err)
      setConvError('Could not load conversations. Make sure the backend is running.')
    } finally {
      if (showSpinner) setLoadingConvs(false)
    }
  }

  const fetchMessages = async (otherUser) => {
    setLoadingMessages(true)
    try {
      const { data } = await api.get(`/chat/${otherUser}`)
      setMessages(data.messages || [])
      // Live read-receipt via socket (falls back to REST)
      if (socketRef.current?.connected) {
        socketRef.current.emit('mark_seen', { other: otherUser })
      } else {
        await api.post(`/chat/mark-all-read/${otherUser}`).catch(() => {})
      }
      // Zero out unread badge locally
      setConversations(prev => prev.map(c =>
        c.username === otherUser ? { ...c, unread_count: 0 } : c
      ))
    } catch (err) {
      console.error("Load chat history failed:", err)
      setMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = (text = null, gifUrl = null) => {
    const content = text || gifUrl || inputText
    if (!content.trim() || !activeConv) return

    const msgPayload = {
      sender: user.username,
      receiver: activeConv.username,
      content: content.trim(),
      timestamp: Date.now(),
      reply_to: replyingTo ? replyingTo.id : null,
      type: gifUrl ? "gif" : "text"
    }

    if (socketRef.current?.connected) {
      socketRef.current.emit('send_message', msgPayload)
    } else {
      api.post(`/chat/${activeConv.username}/send`, {
        content: msgPayload.content,
        type: msgPayload.type,
        reply_to: msgPayload.reply_to
      }).then(({ data }) => {
        setMessages(prev => prev.map(m =>
          String(m.id).startsWith('temp-') && m.content === msgPayload.content ? data.message : m
        ))
        fetchConversations(false)
      }).catch(err => console.error('Send failed:', err))
    }

    setMessages(prev => [...prev, {
      ...msgPayload,
      id: 'temp-' + Date.now(),
      seen: false,
      reactions: {}
    }])

    setInputText('')
    setReplyingTo(null)
    setShowEmojiPicker(false)
    setShowGifPicker(false)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    } else {
      const now = Date.now()
      if (now - lastTypingEmitRef.current > 1500) {
        lastTypingEmitRef.current = now
        socketRef.current?.emit('user_action', {
          type: 'typing',
          sender: user.username,
          receiver: activeConv?.username
        })
      }
    }
  }

  const handleEmojiClick = (emoji) => setInputText(prev => prev + emoji)

  const handleAddReaction = async (msgId, emoji) => {
    if (!activeConv) return
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit('react_message', { msg_id: msgId, receiver: activeConv.username, emoji })
      } else {
        await api.post(`/chat/${activeConv.username}/react/${msgId}`, { emoji })
      }
      setMessages(prev => prev.map(m => {
        if (m.id === msgId) {
          const reactions = { ...(m.reactions || {}) }
          reactions[emoji] = [...(reactions[emoji] || [])]
          if (reactions[emoji].includes(user.username)) {
            reactions[emoji] = reactions[emoji].filter(u => u !== user.username)
          } else {
            reactions[emoji].push(user.username)
          }
          return { ...m, reactions }
        }
        return m
      }))
    } catch (err) {
      console.error("Reaction failed:", err)
    }
  }

  // Instagram-style "Unsend" (Delete for everyone)
  const handleUnsend = async (msgId) => {
    if (!activeConv) return
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit('unsend_message', { msg_id: msgId, receiver: activeConv.username })
      } else {
        await api.delete(`/chat/${activeConv.username}/message/${msgId}?for_everyone=true`)
      }
      setMessages(prev => prev.filter(m => m.id !== msgId))
      fetchConversations(false)
    } catch (err) {
      console.error("Unsend failed:", err)
    }
  }

  // Delete message for me
  const handleDeleteForMe = async (msgId) => {
    if (!activeConv) return
    try {
      await api.delete(`/chat/${activeConv.username}/message/${msgId}?for_everyone=false`)
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch (err) {
      console.error("Delete for me failed:", err)
    }
  }

  // Edit message
  const handleEditMessage = async (msgId, newContent) => {
    if (!activeConv || !newContent.trim()) return
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit('edit_message', { msg_id: msgId, receiver: activeConv.username, new_content: newContent.trim() })
      } else {
        await api.put(`/chat/${activeConv.username}/message/${msgId}`, { content: newContent.trim() })
      }
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, content: newContent.trim(), edited: true } : m
      ))
    } catch (err) {
      console.error("Edit message failed:", err)
    }
  }

  // Delete Entire Chat
  const handleDeleteChat = async () => {
    if (!activeConv) return
    if (!window.confirm(`Delete chat with @${activeConv.username}? This will remove the conversation from your inbox.`)) return
    try {
      await api.delete(`/chat/${activeConv.username}`)
      setConversations(prev => prev.filter(c => c.username !== activeConv.username))
      setActiveConv(null)
      setMessages([])
    } catch (err) {
      console.error("Delete chat failed:", err)
    }
  }


  // ── New chat composer ──
  useEffect(() => {
    if (!showNewChat || newChatQuery.trim().length < 2) {
      setNewChatResults([])
      return
    }
    const t = setTimeout(async () => {
      setSearchingUsers(true)
      try {
        const { data } = await api.get(`/users/search?q=${encodeURIComponent(newChatQuery.trim())}`)
        setNewChatResults((data.users || data.results || []).filter(u => u.username !== user.username))
      } catch { setNewChatResults([]) }
      finally { setSearchingUsers(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [newChatQuery, showNewChat])

  const startNewChat = (u) => {
    setActiveConv({
      username: u.username,
      name: u.name || u.username,
      photo_url: u.photo_url || u.avatar,
      online: false
    })
    setShowNewChat(false)
    setNewChatQuery('')
  }

  const filteredConversations = conversations.filter(c => {
    const q = chatSearchQuery.toLowerCase()
    return (c.name || '').toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q)
  })

  return (
    <div className="page messages-page-container fade-up">
      <div className="container messages-layout-box glass">

        {/* LEFT PANEL: Chats List */}
        <div className={`messages-left-panel ${activeConv ? 'mobile-hidden' : ''}`}>
          <div className="left-panel-header">
            <button className="msg-back-btn" onClick={() => navigate(-1)} title="Go Back">←</button>
            <h2>{user?.username}</h2>
            <button className="new-chat-btn" title="New Message" onClick={() => setShowNewChat(true)}>✏️</button>
          </div>

          <div className="chat-search-wrap">
            <input
              type="text"
              className="chat-search-input"
              placeholder="Search chats..."
              value={chatSearchQuery}
              onChange={e => setChatSearchQuery(e.target.value)}
            />
          </div>

          <div className="conversations-list">
            {loadingConvs ? (
              <div className="chat-loading-state">
                <div className="chat-loading-spinner" />
                <span className="chat-loading-text">Loading conversations...</span>
              </div>
            ) : convError ? (
              <div className="conversations-error">{convError}</div>
            ) : filteredConversations.length === 0 ? (
              <div className="no-chats-msg">
                No conversations yet.
                <button className="start-chat-cta" onClick={() => setShowNewChat(true)}>✏️ Start a new chat</button>
              </div>
            ) : (
              filteredConversations.map(conv => (
                <div
                  key={conv.username}
                  className={`conversation-item ${activeConv?.username === conv.username ? 'active' : ''}`}
                  onClick={() => setActiveConv(conv)}
                >
                  <div className="conv-avatar-wrap">
                    <img
                      src={conv.photo_url || FALLBACK_AVATAR}
                      alt={conv.name}
                      className="conv-avatar"
                      onError={e => e.target.src = FALLBACK_AVATAR}
                    />
                    {conv.online && <span className="online-dot" />}
                  </div>
                  <div className="conv-details">
                    <div className="conv-top-row">
                      <span className="conv-name">{conv.name || conv.username}</span>
                      <span className="conv-time">{timeAgo(conv.last_message_timestamp)}</span>
                    </div>
                    <div className="conv-bottom-row">
                      <p className={`conv-preview ${conv.unread_count > 0 ? 'unread' : ''}`}>
                        {conv.last_message || 'Start chatting!'}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="conv-unread-badge">{conv.unread_count}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Chat Conversation */}
        <div className={`messages-right-panel ${activeConv ? '' : 'mobile-hidden'}`}>
          {activeConv ? (
            <>
              <div className="active-chat-header">
                <button className="msg-back-btn mobile-only" onClick={() => setActiveConv(null)}>←</button>
                <div className="conv-avatar-wrap">
                  <img
                    src={activeConv.photo_url || FALLBACK_AVATAR}
                    alt={activeConv.name}
                    className="active-chat-avatar"
                    onError={e => e.target.src = FALLBACK_AVATAR}
                    onClick={() => navigate(`/user/${activeConv.username}`)}
                  />
                  {activeConv.online && <span className="online-dot" />}
                </div>
                <div className="active-chat-user-info" onClick={() => navigate(`/user/${activeConv.username}`)}>
                  <span className="active-chat-name">{activeConv.name || activeConv.username}</span>
                  <span className={`active-chat-status ${activeConv.online ? 'online' : 'offline'}`}>
                    {activeConv.online ? 'Active now' : lastSeenLabel(activeConv.last_seen)}
                  </span>
                </div>
                <div className="chat-header-actions">
                  <button className="chat-action-btn" title="View Profile" onClick={() => navigate(`/user/${activeConv.username}`)}>👤</button>
                  <button className="chat-action-btn delete-chat-btn" title="Delete Chat" onClick={handleDeleteChat}>🗑️</button>
                </div>
              </div>

              <div className="chat-messages-log">
                {loadingMessages ? (
                  <div className="chat-loading-state">
                    <div className="chat-loading-spinner" />
                    <span className="chat-loading-text">Loading messages...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-loading-state">
                    <img
                      src={activeConv.photo_url || FALLBACK_AVATAR}
                      className="empty-chat-avatar"
                      onError={e => e.target.src = FALLBACK_AVATAR}
                      alt=""
                    />
                    <h4 className="empty-chat-name">{activeConv.name || activeConv.username}</h4>
                    <span className="chat-loading-text">Say hello 👋 and start the conversation!</span>
                  </div>
                ) : messages.map((msg, i) => {
                  const prev = messages[i - 1]
                  const showDay = !prev || new Date(prev.timestamp).toDateString() !== new Date(msg.timestamp).toDateString()
                  const dayLabel = showDay ? (
                    new Date(msg.timestamp).toDateString() === new Date().toDateString()
                      ? 'Today'
                      : new Date(msg.timestamp).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
                  ) : null
                  return (
                    <React.Fragment key={msg.id}>
                      {showDay && <div className="chat-day-separator"><span>{dayLabel}</span></div>}
                      <MessageBubble
                        msg={msg}
                        currentUser={user.username}
                        otherAvatar={activeConv.photo_url}
                        showAvatar={msg.sender !== user.username && (messages[i + 1]?.sender !== msg.sender)}
                        messages={messages}
                        isLastMine={msg.sender === user.username && i === messages.length - 1}
                        onReact={(emoji) => handleAddReaction(msg.id, emoji)}
                        onReply={(m) => setReplyingTo(m)}
                        onUnsend={() => handleUnsend(msg.id)}
                        onEdit={(m, newContent) => handleEditMessage(m.id, newContent)}
                        onDeleteForMe={() => handleDeleteForMe(msg.id)}
                      />
                    </React.Fragment>
                  )
                })}
                {isTyping && (
                  <div className="typing-indicator-bubble">
                    <span className="typing-dot">.</span>
                    <span className="typing-dot">.</span>
                    <span className="typing-dot">.</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {shareMovieTitle && (
                <div className="chat-share-preview-bar animate-fade-in">
                  <span className="share-preview-text">
                    🎬 Share <strong>{shareMovieTitle}</strong> to this chat?
                  </span>
                  <div className="share-preview-actions">
                    <button
                      className="share-preview-btn send"
                      onClick={() => {
                        handleSendMessage(`[MOVIE_SHARE:${shareMovieTitle}]`)
                        navigate('/messages', { replace: true })
                      }}
                    >
                      Send Share
                    </button>
                    <button className="share-preview-btn cancel" onClick={() => navigate('/messages', { replace: true })}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {replyingTo && (
                <div className="chat-reply-preview-bar">
                  <div className="reply-preview-details">
                    <span className="reply-title">Replying to {replyingTo.sender === user.username ? 'yourself' : `@${replyingTo.sender}`}</span>
                    <p className="reply-text-preview">{replyingTo.content.startsWith('[MOVIE_SHARE:') ? '🎬 Movie Share' : replyingTo.content}</p>
                  </div>
                  <button className="reply-cancel-btn" onClick={() => setReplyingTo(null)}>&times;</button>
                </div>
              )}

              <div className="chat-footer-row">
                <button className="chat-plus-btn" title="Add GIF" onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }}>+</button>
                <button className="chat-emoji-btn" title="Add Emoji" onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }}>😊</button>
                <input
                  type="text"
                  className="chat-message-input"
                  placeholder="Message..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
                <button className="chat-send-btn" onClick={() => handleSendMessage()}>➔</button>

                {showEmojiPicker && (
                  <div className="emoji-picker-popover glass">
                    {['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎬', '🍿', '😮‍💨'].map(e => (
                      <span key={e} className="emoji-select-item" onClick={() => handleEmojiClick(e)}>{e}</span>
                    ))}
                  </div>
                )}

                {showGifPicker && (
                  <div className="gif-picker-popover glass">
                    {MOCK_GIFS.map((gif, index) => (
                      <img key={index} src={gif} alt="gif option" className="gif-select-item" onClick={() => handleSendMessage(null, gif)} />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="chat-unselected-state">
              {shareMovieTitle ? (
                <>
                  <span style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>🎬</span>
                  <h3>Share "{shareMovieTitle}"</h3>
                  <p style={{ color: '#ff61d2', fontWeight: 700, margin: '0 0 1.5rem 0' }}>Select a chat from the left panel to share this movie.</p>
                  <button className="share-preview-btn cancel" onClick={() => navigate('/messages', { replace: true })}>
                    Cancel Share
                  </button>
                </>
              ) : (
                <>
                  <div className="unselected-icon-ring">💬</div>
                  <h3>Your Messages</h3>
                  <p>Send private messages, movie shares and GIFs to friends.</p>
                  <button className="btn btn-primary" onClick={() => setShowNewChat(true)}>Send Message</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── New Chat Modal (Instagram style) ── */}
      {showNewChat && (
        <div className="insta-modal-overlay" onClick={() => setShowNewChat(false)}>
          <div className="insta-modal" onClick={e => e.stopPropagation()}>
            <div className="insta-modal-header">
              <span className="insta-modal-title">New Message</span>
              <button className="insta-close-btn" onClick={() => setShowNewChat(false)}>✕</button>
            </div>
            <div className="insta-search-container">
              <input
                autoFocus
                className="insta-search-input"
                placeholder="Search people..."
                value={newChatQuery}
                onChange={e => setNewChatQuery(e.target.value)}
              />
            </div>
            <div className="insta-modal-body">
              {searchingUsers ? (
                <div className="chat-loading-state"><div className="chat-loading-spinner" /></div>
              ) : newChatResults.length === 0 ? (
                <div className="no-chats-msg">
                  {newChatQuery.trim().length < 2 ? 'Type at least 2 characters to search users.' : 'No users found.'}
                </div>
              ) : (
                newChatResults.map(u => (
                  <div key={u.username} className="insta-user-item" onClick={() => startNewChat(u)}>
                    <div className="insta-user-info">
                      <img src={u.photo_url || u.avatar || FALLBACK_AVATAR} alt={u.username} onError={e => e.target.src = FALLBACK_AVATAR} />
                      <div className="insta-user-details">
                        <span className="insta-user-name">{u.name || u.username}</span>
                        <span className="insta-user-username">@{u.username}</span>
                      </div>
                    </div>
                    <button className="insta-follow-btn follow">Chat</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg, currentUser, otherAvatar, showAvatar, messages, isLastMine, onReact, onReply, onUnsend, onEdit, onDeleteForMe }) {
  const isMine = msg.sender === currentUser
  const [movieDetails, setMovieDetails] = useState(null)
  const [movieLoadError, setMovieLoadError] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(msg.content || '')
  const navigate = useNavigate()
  const isMovieShare = msg.content?.startsWith('[MOVIE_SHARE:')

  useEffect(() => {
    if (isMovieShare) {
      const match = msg.content.match(/\[MOVIE_SHARE:(.*?)\]/)
      if (match && match[1]) {
        api.get(`/movies/details?title=${encodeURIComponent(match[1])}`)
          .then(r => setMovieDetails(r.data))
          .catch(() => setMovieLoadError(true))
      }
    }
  }, [msg.content, isMovieShare])

  const handleAddWishlist = async (e, title) => {
    e.stopPropagation()
    try {
      await api.post('/users/wishlist', { title })
      alert(`${title} added to Wishlist!`)
    } catch (err) { console.error(err) }
  }

  const handleSaveEdit = () => {
    if (!editText.trim()) return
    onEdit(msg, editText.trim())
    setIsEditing(false)
  }

  const renderContent = () => {
    if (isEditing) {
      return (
        <div className="chat-edit-inline-wrap">
          <input
            type="text"
            className="chat-edit-inline-input"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setIsEditing(false); }}
            autoFocus
          />
          <div className="chat-edit-inline-actions">
            <button className="chat-edit-btn save" onClick={handleSaveEdit}>Save</button>
            <button className="chat-edit-btn cancel" onClick={() => { setIsEditing(false); setEditText(msg.content); }}>Cancel</button>
          </div>
        </div>
      )
    }

    if (isMovieShare) {
      if (movieLoadError) {
        return <div className="chat-movie-share-card glass" style={{ padding: '1rem', color: '#ff4b2b' }}>⚠️ Movie details unavailable</div>
      }
      if (!movieDetails) {
        return <div className="chat-movie-share-card glass" style={{ padding: '1rem' }}>Loading movie details...</div>
      }
      return (
        <div className="chat-movie-share-card glass">
          <img
            src={movieDetails.poster}
            alt={movieDetails.title}
            onError={e => e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg'}
            className="share-movie-poster"
          />
          <div className="share-movie-details">
            <span className="share-movie-title">🎬 {movieDetails.title}</span>
            <span className="share-movie-meta">{movieDetails.year} • {movieDetails.genre?.split(', ')[0]} • {movieDetails.runtime}</span>
            <div className="share-ratings-row">
              <span className="imdb-pill">★ {movieDetails.rating || 'N/A'} IMDb</span>
              <span className="novaflix-pill">🟣 NovaFlix {movieDetails.novaflix_rating || 'N/A'}</span>
            </div>
            <div className="share-card-actions">
              <button onClick={() => navigate(`/movie?title=${encodeURIComponent(movieDetails.title)}`)} className="share-card-btn view">View Details</button>
              <button onClick={(e) => handleAddWishlist(e, movieDetails.title)} className="share-card-btn wishlist">+ Wishlist</button>
            </div>
          </div>
        </div>
      )
    }

    if (msg.type === 'gif' || (msg.content.startsWith('http') && msg.content.includes('.gif'))) {
      return <img src={msg.content} alt="shared gif" className="chat-shared-gif" />
    }

    return <p className="chat-bubble-text">{msg.content}</p>
  }

  const reactionsList = Object.keys(msg.reactions || {}).filter(k => msg.reactions[k]?.length > 0)
  const repliedMsg = msg.reply_to ? messages?.find(m => m.id === msg.reply_to) : null

  return (
    <div className={`message-bubble-wrapper ${isMine ? 'mine' : 'theirs'}`}>
      {!isMine && (
        <img
          src={showAvatar ? (otherAvatar || FALLBACK_AVATAR) : undefined}
          className={`bubble-side-avatar ${showAvatar ? '' : 'ghost'}`}
          onError={e => e.target.src = FALLBACK_AVATAR}
          alt=""
        />
      )}
      <div className="bubble-body-container">

        {repliedMsg && (
          <div className="chat-msg-reply-quote">
            <span className="reply-quote-sender">
              {repliedMsg.sender === currentUser ? 'You' : `@${repliedMsg.sender}`}
            </span>
            <p className="reply-quote-body">
              {repliedMsg.content.startsWith('[MOVIE_SHARE:') ? '🎬 Movie Share' : repliedMsg.content}
            </p>
          </div>
        )}

        <div className={`message-bubble ${isMine ? 'mine' : 'theirs'}`}>
          {renderContent()}

          <div className="bubble-reaction-picker">
            {['❤️', '👍', '🔥', '😂', '😮', '😢'].map(emoji => (
              <span key={emoji} onClick={() => onReact(emoji)} className="reaction-trigger-emoji">{emoji}</span>
            ))}
            <span
              onClick={() => onReply(msg)}
              className="reaction-trigger-emoji reply-trigger"
              title="Reply"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: '6px', marginLeft: '2px' }}
            >
              ↩️
            </span>
            {isMine && !isMovieShare && !String(msg.id).startsWith('temp-') && (
              <span
                onClick={() => { setIsEditing(true); setEditText(msg.content); }}
                className="reaction-trigger-emoji edit-trigger"
                title="Edit message"
                style={{ borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: '6px', marginLeft: '2px' }}
              >
                ✏️
              </span>
            )}
            {isMine && !String(msg.id).startsWith('temp-') && (
              <span
                onClick={onUnsend}
                className="reaction-trigger-emoji unsend-trigger"
                title="Unsend for everyone"
                style={{ borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: '6px', marginLeft: '2px' }}
              >
                🗑️
              </span>
            )}
            <span
              onClick={onDeleteForMe}
              className="reaction-trigger-emoji delete-for-me-trigger"
              title="Delete for me"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: '6px', marginLeft: '2px' }}
            >
              ❌
            </span>
          </div>
        </div>

        {reactionsList.length > 0 && (
          <div className="bubble-reactions-row">
            {reactionsList.map(emoji => (
              <span key={emoji} className="bubble-reaction-badge" onClick={() => onReact(emoji)}>
                {emoji} <span className="react-count">{msg.reactions[emoji].length}</span>
              </span>
            ))}
          </div>
        )}

        <span className="message-timestamp">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {msg.edited ? ' • edited' : ''}
          {isLastMine && (
            <span className="seen-indicator">
              {String(msg.id).startsWith('temp-') ? ' • Sending…' : msg.seen ? ' • Seen' : ' • Delivered'}
            </span>
          )}
        </span>

      </div>
    </div>
  )
}

