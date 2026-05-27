const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'client', 'dist')));

const users = new Map();
const typingUsers = new Set();
const messages = [];
const MESSAGE_LIMIT = 200;
let messageId = 1;

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
}

function scheduleExpiry(message) {
  if (!message.disappearAt) return;
  const delay = Math.max(0, message.disappearAt - Date.now());
  setTimeout(() => {
    const index = messages.findIndex((item) => item.id === message.id);
    if (index !== -1) {
      messages.splice(index, 1);
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
