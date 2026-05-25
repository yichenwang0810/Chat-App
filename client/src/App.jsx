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
  const [message, setMessage] = useState('');
  const [snapMode, setSnapMode] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [status, setStatus] = useState('Welcome to SnapChat-WhatsApp chat!');
  const inputRef = useRef(null);

  useEffect(() => {
    socket.on('user-list', setUsers);
    socket.on('typing-users', setTypingUsers);
    socket.on('new-message', (message) => {
      setMessages((prev) => [...prev, message]);
    });
    socket.on('delete-message', (id) => {
      setMessages((prev) => prev.filter((message) => message.id !== id));
    });

    return () => {
      socket.off('user-list');
      socket.off('typing-users');
      socket.off('new-message');
      socket.off('delete-message');
    };
  }, []);

  useEffect(() => {
    if (joined) {
      socket.emit('typing', false);
    }
  }, [joined]);

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

  const handleTyping = (value) => {
    setMessage(value);
    socket.emit('typing', value.trim().length > 0);
  };

  const joinChat = () => {
    if (!username.trim()) return;
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
              {messages.map((message) => (
                <div key={message.id} className="message-card">
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
                </div>
              ))}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <div className="composer-row">
                <textarea
                  ref={inputRef}
                  placeholder="Type a message or select an image…"
                  value={message}
                  onChange={(e) => handleTyping(e.target.value)}
                />
              </div>
              <div className="composer-row actions-row">
                <label className="file-input">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
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
