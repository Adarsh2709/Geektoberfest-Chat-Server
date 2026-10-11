export const SEARCH_PAGE_SIZE = 20;
const MAX_QUERY_LENGTH = 100;
const MAX_ROOM_LENGTH = 32;
const MAX_USER_LENGTH = 24;

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readText(value, field, maxLength) {
  if (value === undefined || value === '') return { value: '' };
  if (typeof value !== 'string') return { error: `${field} must be text.` };
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return { error: `${field} must be ${maxLength} characters or fewer.` };
  return { value: trimmed };
}

// Turns raw query-string values into a safe Mongo filter. Returns { error } on bad input.
export function buildSearchFilter({ room, q, user, before }) {
  const roomName = readText(room, 'Room', MAX_ROOM_LENGTH);
  if (roomName.error || !roomName.value) return { error: roomName.error || 'Room is required.' };

  const keyword = readText(q, 'Search text', MAX_QUERY_LENGTH);
  if (keyword.error) return { error: keyword.error };
  const sender = readText(user, 'User', MAX_USER_LENGTH);
  if (sender.error) return { error: sender.error };
  if (!keyword.value && !sender.value) return { error: 'Enter a keyword or a user to search for.' };

  const filter = { room: roomName.value };
  if (keyword.value) filter.text = { $regex: escapeRegex(keyword.value), $options: 'i' };
  if (sender.value) filter.sender = { $regex: `^${escapeRegex(sender.value)}$`, $options: 'i' };

  if (before !== undefined && before !== '') {
    const cursor = typeof before === 'string' ? new Date(before) : new Date(NaN);
    if (Number.isNaN(cursor.getTime())) return { error: 'Invalid paging cursor.' };
    filter.createdAt = { $lt: cursor };
  }

  return { filter };
}
