import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:4000');
const avatarColors = ['#4f46e5', '#16a34a', '#dc2626', '#d97706', '#0f172a'];

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function App() {
  const [username, setUsername] = useState('');
  const [color, setColor] = useState(avatarColors[0]);
  const [joined, setJoined] = useState(false);
  const [userId, setUserId] = useState(null);
  const [message, setMessage] = useState('');
  const [snapMode, setSnapMode] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [status, setStatus] = useState('Welcome to SnapChat-WhatsApp chat!');
  const [connectionState, setConnectionState] = useState('connecting');
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const savedUsername = localStorage.getItem('chat-app-username');
    const savedColor = localStorage.getItem('chat-app-color');
    if (savedUsername) setUsername(savedUsername);
    if (savedColor && avatarColors.includes(savedColor)) setColor(savedColor);
  }, []);

  useEffect(() => {
    socket.on('connect', () => {
      setUserId(socket.id);
      setConnectionState('connected');
      setStatus('Connected');
    });
    socket.on('disconnect', () => {
      setConnectionState('disconnected');
      setStatus('Disconnected from server');
    });
    socket.on('reconnect_attempt', () => {
      setConnectionState('reconnecting');
      setStatus('Reconnecting...');
    });
    socket.on('user-list', setUsers);
    socket.on('typing-users', setTypingUsers);
    socket.on('message-history', (history) => setMessages(history));
    socket.on('new-message', (message) => {
      setMessages((prev) => [...prev, message]);
      setStatus('New message received');
    });
    socket.on('message-updated', (updatedMessage) => {
      setMessages((prev) => prev.map((message) => (message.id === updatedMessage.id ? updatedMessage : message)));
    });
    socket.on('delete-message', (id) => {
      setMessages((prev) => prev.filter((message) => message.id !== id));
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect_attempt');
      socket.off('user-list');
      socket.off('typing-users');
      socket.off('message-history');
      socket.off('new-message');
      socket.off('message-updated');
      socket.off('delete-message');
    };
  }, []);

  useEffect(() => {
    if (joined) {
      socket.emit('typing', false);
    }
  }, [joined]);

  useEffect(() => {
    const previewUrl = imageFile ? URL.createObjectURL(imageFile) : null;
    setImagePreview(previewUrl);
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [imageFile]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const typingNotice = useMemo(() => {
    const others = typingUsers.filter((name) => name !== username);
    if (others.length === 0) return null;
    if (others.length === 1) return `${others[0]} is typing…`;
    return `${others.join(', ')} are typing…`;
  }, [typingUsers, username]);

  const sendMessage = async (event) => {
    event?.preventDefault();
    if (!message.trim() && !imageFile) return;

    let imageData = null;
    if (imageFile) {
      imageData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(imageFile);
      });
    }

    socket.emit('send-message', {
      text: message.trim(),
      image: imageData,
      snap: snapMode
    });
    setMessage('');
    setImageFile(null);
    setSnapMode(false);
    setStatus('Message sent');
    inputRef.current?.focus();
    socket.emit('typing', false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleTyping = (value) => {
    setMessage(value);
    socket.emit('typing', value.trim().length > 0);
  };

  const handleImageChange = (file) => {
    setImageFile(file);
  };

  const clearAttachment = () => {
    setImageFile(null);
  };

  const handleLike = (messageId) => {
    socket.emit('like-message', messageId);
  };

  const handleDelete = (messageId) => {
    socket.emit('request-delete-message', messageId);
  };

  const joinChat = () => {
    if (!username.trim()) return;
    localStorage.setItem('chat-app-username', username.trim());
    localStorage.setItem('chat-app-color', color);
    setJoined(true);
    socket.emit('join', { username: username.trim(), color });
    setStatus(`Joined as ${username.trim()}`);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Chat App</div>
        <div className="panel">
          <h3>Users online</h3>
          <ul className="user-list">
            {users.map((user) => (
              <li key={user.id} className="user-item">
                <span className="avatar" style={{ background: user.color }} />
                {user.username}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel status-panel">
          <h3>Status</h3>
          <p>{status}</p>
          <p className="connection-state">Connection: {connectionState}</p>
          <p>Users online: {users.length}</p>
          <p>Messages: {messages.length}</p>
          {typingNotice && <p className="typing">{typingNotice}</p>}
        </div>
      </aside>

      <main className="chat-container">
        {!joined ? (
          <div className="join-card">
            <h2>Enter your name</h2>
            <input
              type="text"
              placeholder="Your display name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <div className="color-picker">
              {avatarColors.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={item === color ? 'color active' : 'color'}
                  style={{ background: item }}
                  onClick={() => setColor(item)}
                />
              ))}
            </div>
            <button className="primary" onClick={joinChat}>
              Join chat
            </button>
          </div>
        ) : (
          <>
            <div className="message-list">
              {messages.map((message) => {
                const isSystem = message.author?.id === 'system';
                const canDelete = message.author?.id === userId && !message.snap;
                const liked = message.likedBy?.includes(username);

                return (
                  <div key={message.id} className={`message-card ${isSystem ? 'system' : ''}`}>
                    <div className="message-meta">
                      <span className="message-avatar" style={{ background: message.author.color }} />
                      <div>
                        <strong>{message.author.username}</strong>
                        <span>{formatTime(message.createdAt)}</span>
                      </div>
                      {message.snap && <span className="snap-badge">Snap</span>}
                    </div>
                    {message.text && <p>{message.text}</p>}
                    {message.image && <img src={message.image} alt="shared" />}
                    {!isSystem && (
                      <div className="message-actions">
                        <button
                          type="button"
                          className={`action-button ${liked ? 'liked' : ''}`}
                          onClick={() => handleLike(message.id)}
                        >
                          {liked ? 'Unlike' : 'Like'} {message.likeCount ? `(${message.likeCount})` : ''}
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className="action-button delete"
                            onClick={() => handleDelete(message.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={scrollRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <div className="composer-row">
                <textarea
                  ref={inputRef}
                  placeholder="Type a message or select an image…"
                  value={message}
                  onChange={(e) => handleTyping(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
              <div className="composer-row actions-row">
                <label className="file-input">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                  />
                  {imageFile ? 'Image selected' : 'Attach image'}
                </label>
                <label className="snap-toggle">
                  <input
                    type="checkbox"
                    checked={snapMode}
                    onChange={(e) => setSnapMode(e.target.checked)}
                  />
                  disappear in 30s
                </label>
              </div>
              {imagePreview && (
                <div className="image-preview">
                  <img src={imagePreview} alt="attachment preview" />
                  <button type="button" className="secondary" onClick={clearAttachment}>
                    Remove attachment
                  </button>
                </div>
              )}
              <button type="submit" className="primary">
                Send
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
