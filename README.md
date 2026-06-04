# Chat-App

A lightweight chat app inspired by WhatsApp and Snapchat.

## Features

- real-time messaging with Socket.IO
- user presence list and typing indicator
- image sharing inside chat
- "snap" mode messages that disappear after 30 seconds
- message history for new users and live join/leave system notifications
- message likes and author-only message deletion
- remembered username and avatar color in the browser
- auto-scroll to new messages and Enter-to-send support
- attachment preview and connection state display
- single-page React frontend with Vite

## Run locally

1. install dependencies:
   ```bash
   npm install
   npm --prefix client install
   ```
2. start the app:
   ```bash
   npm run dev
   ```
3. open the client at `http://localhost:5173`

### Production

- build the frontend once with `npm run build`
- start the server from the repository root with `npm start`
- optionally set a different port: `PORT=4000 npm start`

## Backend API

The server now exposes a REST API alongside Socket.IO:

- `GET /api/health` — check server health
- `GET /api/users` — list online users
- `GET /api/messages` — fetch stored message history
- `POST /api/messages` — send a message via HTTP
- `POST /api/messages/:id/like` — toggle like for a message
- `DELETE /api/messages/:id` — delete a message by its author
