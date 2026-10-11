import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import http from 'node:http';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { Message } from './models/user.js';
import { parseTypingEvent, shouldRelayTyping } from './utils/typing.js';

const REDIS_CHAT_CHANNEL = 'CHAT_ROOMS';
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const redisOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt) => (attempt <= 3 ? 500 : null),
};
const pubClient = new Redis(redisUrl, redisOptions);
const subClient = new Redis(redisUrl, redisOptions);

for (const [name, client] of [['publisher', pubClient], ['subscriber', subClient]]) {
  client.on('error', (error) => console.error(`Redis ${name} error: ${error.message}`));
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

subClient.on('message', (channel, message) => {
  if (channel !== REDIS_CHAT_CHANNEL) return;

  try {
    const payload = JSON.parse(message);
    if (payload.type === 'typing') {
      const event = parseTypingEvent(payload);
      if (event) io.to(event.room).emit('typing', event);
      return;
    }

    const { room, sender, senderId, text, timestamp } = payload;
    if (room && typeof sender === 'string' && typeof text === 'string') {
      io.to(room).emit('receive_message', { sender, senderId, text, timestamp });
    }
  } catch (error) {
    console.error(`Invalid Redis chat payload: ${error.message}`);
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_room', async (roomName) => {
    if (typeof roomName !== 'string' || !roomName.trim()) return;
    const room = roomName.trim().slice(0, 32);
    socket.join(room);

    try {
      const chatHistory = await Message.find({ room }).sort({ createdAt: 1 }).limit(20).lean();
      socket.emit('chat_history', chatHistory);
    } catch (error) {
      console.error(`Failed to fetch chat history: ${error.message}`);
      socket.emit('chat_error', 'Could not load chat history.');
    }
  });

  socket.on('send_message', async (data) => {
    const room = typeof data?.room === 'string' ? data.room.trim().slice(0, 32) : '';
    const sender = typeof data?.sender === 'string' ? data.sender.trim().slice(0, 24) : '';
    const senderId = typeof data?.senderId === 'string' ? data.senderId.slice(0, 64) : '';
    const text = typeof data?.text === 'string' ? data.text.trim().slice(0, 1000) : '';
    if (!room || !sender || !text) return;

    try {
      const newMessage = await Message.create({ room, sender, senderId, text });
      await pubClient.publish(REDIS_CHAT_CHANNEL, JSON.stringify({
        room,
        sender,
        senderId,
        text,
        timestamp: newMessage.timestamp,
      }));
    } catch (error) {
      console.error(`Failed to save or broadcast message: ${error.message}`);
      socket.emit('chat_error', 'Could not send your message.');
    }
  });

  // Only sockets that joined the room may announce typing in it. Typing is
  // relayed through Redis so users on other backend instances see it too.
  function publishTyping(event) {
    return pubClient.publish(REDIS_CHAT_CHANNEL, JSON.stringify({ type: 'typing', ...event }))
      .catch((error) => console.error(`Failed to broadcast typing state: ${error.message}`));
  }

  socket.on('typing', (data) => {
    const event = parseTypingEvent(data);
    if (!event || !socket.rooms.has(event.room)) return;

    if (event.typing) {
      const now = Date.now();
      if (!shouldRelayTyping(socket.data.lastTypingAt, now)) return;
      socket.data.lastTypingAt = now;
      socket.data.typing = event;
    } else {
      socket.data.lastTypingAt = 0;
      socket.data.typing = null;
    }
    publishTyping({ ...event, socketId: socket.id });
  });

  socket.on('disconnect', () => {
    // Don't leave a ghost "is typing" behind if the user drops mid-sentence.
    if (socket.data.typing) publishTyping({ ...socket.data.typing, socketId: socket.id, typing: false });
    console.log(`User disconnected: ${socket.id}`);
  });
});

app.get('/health', (_req, res) => {
  const healthy = mongoose.connection.readyState === 1
    && pubClient.status === 'ready'
    && subClient.status === 'ready';
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'OK' : 'Unavailable' });
});

async function start() {
  try {
    await connectDB();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    await subClient.subscribe(REDIS_CHAT_CHANNEL);

    const port = Number(process.env.PORT || 5000);
    server.listen(port, '0.0.0.0', () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error(`Backend startup failed: ${error.message}`);
    pubClient.disconnect();
    subClient.disconnect();
    await mongoose.disconnect();
    process.exitCode = 1;
  }
}

start();
