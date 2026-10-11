export const LIMITS = {
  room: 32,
  sender: 24,
  senderId: 64,
  text: 1000,
};

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const SENDER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value, field, maxLength) {
  if (typeof value !== 'string') return { error: `${field} must be text.` };
  const trimmed = value.trim();
  if (!trimmed) return { error: `${field} is required.` };
  if (trimmed.length > maxLength) return { error: `${field} must be ${maxLength} characters or fewer.` };
  if (CONTROL_CHARS.test(trimmed)) return { error: `${field} contains invalid characters.` };
  return { value: trimmed };
}

export function validateRoom(roomName) {
  const result = cleanString(roomName, 'Room name', LIMITS.room);
  return result.error ? { ok: false, error: result.error } : { ok: true, value: result.value };
}

export function validateMessage(data) {
  if (!isPlainObject(data)) return { ok: false, error: 'Invalid message.' };

  const room = validateRoom(data.room);
  if (!room.ok) return room;

  const sender = cleanString(data.sender, 'Display name', LIMITS.sender);
  if (sender.error) return { ok: false, error: sender.error };

  const text = cleanString(data.text, 'Message', LIMITS.text);
  if (text.error) return { ok: false, error: text.error };

  let senderId = '';
  if (data.senderId !== undefined && data.senderId !== null && data.senderId !== '') {
    if (
      typeof data.senderId !== 'string'
      || data.senderId.length > LIMITS.senderId
      || !SENDER_ID_PATTERN.test(data.senderId)
    ) {
      return { ok: false, error: 'Invalid user ID.' };
    }
    senderId = data.senderId;
  }

  return { ok: true, value: { room: room.value, sender: sender.value, senderId, text: text.value } };
}
