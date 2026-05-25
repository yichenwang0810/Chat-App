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
let messageId = 1;

function broadcastUsers() {
  io.emit('user-list', Array.from(users.values()));
}

function scheduleExpiry(message) {
  if (!message.disappearAt) return;
  const delay = Math.max(0, message.disappearAt - Date.now());
  setTimeout(() => {
    io.emit('delete-message', message.id);
  }, delay);
}

io.on('connection', (socket) => {
  socket.on('join', ({ username, color }) => {
    users.set(socket.id, { id: socket.id, username, color });
    broadcastUsers();
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
      disappearAt: snap ? Date.now() + 30000 : null
    };

    io.emit('new-message', message);
    scheduleExpiry(message);
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
    typingUsers.delete(users.get(socket.id)?.username);
    users.delete(socket.id);
    broadcastUsers();
    io.emit('typing-users', Array.from(typingUsers));
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
