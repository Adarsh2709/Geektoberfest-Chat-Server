import { parseTypingEvent, shouldRelayTyping } from '../utils/typing.js';

let io;

export function setup(context) {
  io = context.io;
}

// A socket announces typing in a room it joined; the event is relayed through Redis so every
// backend instance reaches its own clients, and nothing is stored.
export function onConnection(socket, { publishEvent }) {
  const state = { lastRelayedAt: 0, active: null };

  const relay = (event) => publishEvent('typing', { ...event, socketId: socket.id })
    .catch((error) => console.error(`Failed to broadcast typing state: ${error.message}`));

  socket.on('typing', (data) => {
    // Typing is attributed to the authenticated account, never to a name the client claims.
    const event = parseTypingEvent({
      room: data?.room,
      typing: data?.typing,
      sender: socket.data.user.username,
      senderId: socket.data.userId,
    });
    if (!event || !socket.rooms.has(event.room)) return;

    if (event.typing) {
      const now = Date.now();
      if (!shouldRelayTyping(state.lastRelayedAt, now)) return;
      state.lastRelayedAt = now;
      state.active = event;
    } else {
      state.lastRelayedAt = 0;
      state.active = null;
    }
    relay(event);
  });

  socket.on('disconnect', () => {
    // Don't leave a ghost "is typing" behind if the user drops mid-sentence.
    if (state.active) relay({ ...state.active, typing: false });
  });
}

export function onRedisMessage(payload) {
  if (payload.type !== 'typing') return false;

  const event = parseTypingEvent(payload);
  if (event) io.to(event.room).emit('typing', event);
  return true;
}
