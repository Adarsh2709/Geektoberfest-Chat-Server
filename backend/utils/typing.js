const MAX_ROOM_LENGTH = 32;
const MAX_NAME_LENGTH = 24;
const MAX_ID_LENGTH = 64;

// Minimum gap between "started typing" events from one socket; clients are
// expected to throttle too, this just stops a misbehaving client flooding a room.
export const TYPING_MIN_INTERVAL_MS = 1000;

// Returns the cleaned typing event, or null if the payload is malformed.
export function parseTypingEvent(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  if (typeof data.typing !== 'boolean') return null;

  const room = typeof data.room === 'string' ? data.room.trim().slice(0, MAX_ROOM_LENGTH) : '';
  const sender = typeof data.sender === 'string' ? data.sender.trim().slice(0, MAX_NAME_LENGTH) : '';
  const senderId = typeof data.senderId === 'string' ? data.senderId.slice(0, MAX_ID_LENGTH) : '';
  if (!room || !sender || !senderId) return null;

  // Set by the server so a client can recognise its own echo even when several
  // tabs share one senderId.
  const socketId = typeof data.socketId === 'string' ? data.socketId.slice(0, MAX_ID_LENGTH) : '';
  return { room, sender, senderId, socketId, typing: data.typing };
}

export function shouldRelayTyping(lastRelayedAt, now = Date.now()) {
  return !lastRelayedAt || now - lastRelayedAt >= TYPING_MIN_INTERVAL_MS;
}
