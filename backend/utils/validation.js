export const LIMITS = {
  room: 32,
  sender: 24,
  clientId: 64,
  text: 1000,
};

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

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

// The sender's user ID is never taken from the client, so it is not validated here.
export function validateMessage(data) {
  if (!isPlainObject(data)) return { ok: false, error: 'Invalid message.' };

  const room = validateRoom(data.room);
  if (!room.ok) return room;

  const sender = cleanString(data.sender, 'Display name', LIMITS.sender);
  if (sender.error) return { ok: false, error: sender.error };

  const text = cleanString(data.text, 'Message', LIMITS.text);
  if (text.error) return { ok: false, error: text.error };

  const value = { room: room.value, sender: sender.value, text: text.value };

  // Optional: lets the sender retry a message without it being stored twice.
  if (data.clientId !== undefined && data.clientId !== null && data.clientId !== '') {
    if (
      typeof data.clientId !== 'string'
      || data.clientId.length > LIMITS.clientId
      || !CLIENT_ID_PATTERN.test(data.clientId)
    ) {
      return { ok: false, error: 'Invalid message ID.' };
    }
    value.clientId = data.clientId;
  }

  return { ok: true, value };
}
