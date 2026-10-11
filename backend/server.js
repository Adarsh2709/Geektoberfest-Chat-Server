import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import http from 'node:http';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { Message } from './models/user.js';
import { createRateLimiter } from './utils/rateLimiter.js';
import { validateMessage, validateRoom } from './utils/validation.js';

const REDIS_CHAT_CHANNEL = 'CHAT_ROOMS';
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const trustProxy = process.env.TRUST_PROXY === 'true';
const SHUTDOWN_TIMEOUT_MS = 10_000;
const MAX_PAYLOAD_BYTES = 16 * 1024;
const httpLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const connectionLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const messageLimiter = createRateLimiter({ windowMs: 10_000, max: 10 });
const joinLimiter = createRateLimiter({ windowMs: 10_000, max: 20 });
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
  maxHttpBufferSize: MAX_PAYLOAD_BYTES,
});
let shuttingDown = false;

// Behind a reverse proxy (e.g. Render) set TRUST_PROXY=true so the proxy-appended
// address is used instead of the proxy's own.
function getClientIp(req) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) return forwarded.split(',').pop().trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

app.use((req, res, next) => {
  const { allowed, retryAfterMs } = httpLimiter.consume(getClientIp(req));
  if (allowed) return next();
  res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
  res.status(429).json({ status: 'Too Many Requests' });
});

io.use((socket, next) => {
  if (shuttingDown) return next(new Error('Server is shutting down.'));
  const { allowed } = connectionLimiter.consume(getClientIp(socket.request));
  next(allowed ? undefined : new Error('Too many connection attempts. Try again shortly.'));
});

subClient.on('message', (channel, message) => {
  if (channel !== REDIS_CHAT_CHANNEL) return;

  try {
    const { room, sender, senderId, text, timestamp } = JSON.parse(message);
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
    if (!joinLimiter.consume(socket.id).allowed) {
      return socket.emit('chat_error', 'You are joining rooms too quickly.');
    }
    const validRoom = validateRoom(roomName);
    if (!validRoom.ok) return socket.emit('chat_error', validRoom.error);
    const room = validRoom.value;
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
    if (!messageLimiter.consume(socket.id).allowed) {
      return socket.emit('chat_error', 'You are sending messages too quickly. Slow down.');
    }
    const validated = validateMessage(data);
    if (!validated.ok) return socket.emit('chat_error', validated.error);
    const { room, sender, senderId, text } = validated.value;

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

  socket.on('disconnect', () => {
    messageLimiter.reset(socket.id);
    joinLimiter.reset(socket.id);
    console.log(`User disconnected: ${socket.id}`);
  });
});

app.get('/health', (_req, res) => {
  const healthy = !shuttingDown
    && mongoose.connection.readyState === 1
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

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully`);

  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    // Stops accepting connections and disconnects connected sockets.
    await new Promise((resolve) => io.close(resolve));
    await Promise.all([pubClient, subClient].map((client) => client.quit().catch(() => client.disconnect())));
    await mongoose.disconnect();
    for (const limiter of [httpLimiter, connectionLimiter, messageLimiter, joinLimiter]) limiter.stop();
    console.log('Shutdown complete');
  } catch (error) {
    console.error(`Error during shutdown: ${error.message}`);
    process.exitCode = 1;
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
