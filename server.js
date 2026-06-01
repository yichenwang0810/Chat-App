const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : ['http://localhost:5173'],
    methods: ['GET', 'POST', 'DELETE']
  }
});

const dataDirectory = path.join(__dirname, 'data');
const messageStorePath = path.join(dataDirectory, 'messages.json');

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client', 'dist')));

const users = new Map();
const typingUsers = new Set();
const messages = [];
const MESSAGE_LIMIT = 200;
let messageId = 1;

function saveMessages() {
  fs.writeFileSync(messageStorePath, JSON.stringify(messages, null, 2), 'utf8');
}

function loadMessages() {
  if (!fs.existsSync(messageStorePath)) return;
  try {
    const stored = JSON.parse(fs.readFileSync(messageStorePath, 'utf8'));
    if (Array.isArray(stored)) {
      stored.forEach((message) => messages.push(message));
      const maxId = messages.reduce((max, message) => Math.max(max, message.id || 0), 0);
      messageId = maxId + 1;
    }
  } catch (error) {
    console.error('Failed to load stored messages:', error);
  }
}

loadMessages();

function broadcastUsers() {
  io.emit('user-list', Array.from(users.values()));
}

function sendHistory(socket) {
  socket.emit('message-history', messages);
}

function addMessage(message) {
  messages.push(message);
  if (messages.length > MESSAGE_LIMIT) {
    messages.splice(0, messages.length - MESSAGE_LIMIT);
  }
  saveMessages();
}

function scheduleExpiry(message) {
  if (!message.disappearAt) return;
  const delay = Math.max(0, message.disappearAt - Date.now());
  setTimeout(() => {
    const index = messages.findIndex((item) => item.id === message.id);
    if (index !== -1) {
      messages.splice(index, 1);
      saveMessages();
      io.emit('delete-message', message.id);
    }
  }, delay);
}

function broadcastSystemMessage(text) {
  const message = {
    id: messageId++,
    author: { id: 'system', username: 'System', color: '#64748b' },
    text,
    image: null,
    snap: false,
    createdAt: Date.now(),
    disappearAt: null,
    likeCount: 0,
    likedBy: []
  };
  addMessage(message);
  io.emit('new-message', message);
}

io.on('connection', (socket) => {
  socket.on('join', ({ username, color }) => {
    users.set(socket.id, { id: socket.id, username, color });
    sendHistory(socket);
    broadcastUsers();
    broadcastSystemMessage(`${username} joined the chat`);
  });

  socket.on('send-message', ({ text, image, snap }) => {
    const author = users.get(socket.id);
    if (!author || (!text && !image)) return;

    const message = {
      id: messageId++,
      author,
      text: text || null,
      image: image || null,
      snap: Boolean(snap),
      createdAt: Date.now(),
      disappearAt: snap ? Date.now() + 30000 : null,
      likeCount: 0,
      likedBy: []
    };

    addMessage(message);
    io.emit('new-message', message);
    scheduleExpiry(message);
  });

  socket.on('request-delete-message', (messageIdToDelete) => {
    const message = messages.find((item) => item.id === messageIdToDelete);
    const user = users.get(socket.id);
    if (!message || !user) return;

    const isAuthor = message.author?.id === socket.id;
    if (!isAuthor) return;

    const index = messages.findIndex((item) => item.id === messageIdToDelete);
    if (index !== -1) {
      messages.splice(index, 1);
      saveMessages();
      io.emit('delete-message', messageIdToDelete);
    }
  });

  socket.on('like-message', (messageIdToLike) => {
    const message = messages.find((item) => item.id === messageIdToLike);
    const user = users.get(socket.id);
    if (!message || !user) return;

    const alreadyLiked = message.likedBy.includes(user.username);
    if (alreadyLiked) {
      message.likedBy = message.likedBy.filter((name) => name !== user.username);
    } else {
      message.likedBy.push(user.username);
    }
    message.likeCount = message.likedBy.length;
    saveMessages();
    io.emit('message-updated', message);
  });

  socket.on('typing', (isTyping) => {
    const user = users.get(socket.id);
    if (!user) return;
    if (isTyping) {
      typingUsers.add(user.username);
    } else {
      typingUsers.delete(user.username);
    }
    io.emit('typing-users', Array.from(typingUsers));
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      typingUsers.delete(user.username);
      users.delete(socket.id);
      broadcastUsers();
      io.emit('typing-users', Array.from(typingUsers));
      broadcastSystemMessage(`${user.username} left the chat`);
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/users', (req, res) => {
  res.json(Array.from(users.values()));
});

app.get('/api/messages', (req, res) => {
  res.json(messages);
});

app.post('/api/messages', (req, res) => {
  const { author, text, image, snap } = req.body;
  if (!author || !author.username || !author.color || (!text && !image)) {
    return res.status(400).json({ error: 'author, text or image, and color are required' });
  }

  const message = {
    id: messageId++,
    author,
    text: text || null,
    image: image || null,
    snap: Boolean(snap),
    createdAt: Date.now(),
    disappearAt: snap ? Date.now() + 30000 : null,
    likeCount: 0,
    likedBy: []
  };

  addMessage(message);
  io.emit('new-message', message);
  scheduleExpiry(message);
  res.status(201).json(message);
});

app.post('/api/messages/:id/like', (req, res) => {
  const messageIdToLike = Number(req.params.id);
  const { username } = req.body;
  const message = messages.find((item) => item.id === messageIdToLike);
  if (!message || !username) {
    return res.status(400).json({ error: 'message not found or username missing' });
  }

  const alreadyLiked = message.likedBy.includes(username);
  if (alreadyLiked) {
    message.likedBy = message.likedBy.filter((name) => name !== username);
  } else {
    message.likedBy.push(username);
  }
  message.likeCount = message.likedBy.length;
  saveMessages();
  io.emit('message-updated', message);
  res.json(message);
});

app.delete('/api/messages/:id', (req, res) => {
  const messageIdToDelete = Number(req.params.id);
  const { authorId } = req.body;
  const message = messages.find((item) => item.id === messageIdToDelete);
  if (!message || !authorId || message.author?.id !== authorId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const index = messages.findIndex((item) => item.id === messageIdToDelete);
  if (index !== -1) {
    messages.splice(index, 1);
    saveMessages();
    io.emit('delete-message', messageIdToDelete);
    return res.status(204).send();
  }

  res.status(404).json({ error: 'message not found' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
