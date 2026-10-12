// Remembers the last joined room across reloads, per account, using local storage. The login
// session itself is already persisted by the app (`gather-session`).
const sessionKey = 'gather-session';
const roomKeyPrefix = 'gather-room:';

const roomInput = document.querySelector('#room-input');
const roomTitle = document.querySelector('#room-title');

function sessionUserId() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey))?.user?.id || '';
  } catch {
    return '';
  }
}

// A saved value is re-checked against the input limit, since it can be edited by hand.
function readStoredRoom(userId) {
  if (!userId) return '';
  return (localStorage.getItem(roomKeyPrefix + userId) || '').trim().slice(0, roomInput.maxLength);
}

// Runs before main.js reads the room input, so the saved room is the one that gets joined.
const savedRoom = readStoredRoom(sessionUserId());
if (savedRoom) {
  roomInput.value = savedRoom;
  roomTitle.textContent = savedRoom;
}

export default function initPersist({ socket, getRoom, getUserId }) {
  // Every join reconnects the socket, so this also covers the first room after logging in.
  socket.on('connect', () => {
    const userId = getUserId();
    const room = getRoom();
    if (userId && room) localStorage.setItem(roomKeyPrefix + userId, room);
  });
}
