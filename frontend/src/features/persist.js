// Remembers the display name and the last joined room across reloads, using local storage.
const nameKey = 'gather-display-name';
const roomKey = 'gather-room';

const nameInput = document.querySelector('#name-input');
const roomInput = document.querySelector('#room-input');
const roomTitle = document.querySelector('#room-title');
const identityDot = document.querySelector('.identity-dot');

// Stored values are re-checked against the input limits, since they can be edited by hand
// or come from an older version.
function readStored(key, maxLength) {
  const value = (localStorage.getItem(key) || '').trim().slice(0, maxLength);
  return value || null;
}

function updateIdentityDot() {
  identityDot.textContent = (nameInput.value.trim() || 'You').slice(0, 1).toUpperCase();
}

function saveRoom() {
  const room = roomInput.value.trim();
  if (room) localStorage.setItem(roomKey, room);
}

// Runs before main.js reads the inputs, so the saved room is the one that gets joined.
nameInput.value = readStored(nameKey, nameInput.maxLength) || nameInput.value;
roomInput.value = readStored(roomKey, roomInput.maxLength) || roomInput.value;
roomTitle.textContent = roomInput.value.trim() || roomTitle.textContent;
updateIdentityDot();

nameInput.addEventListener('input', () => {
  const name = nameInput.value.trim();
  if (name) localStorage.setItem(nameKey, name);
  else localStorage.removeItem(nameKey);
  updateIdentityDot();
});

document.querySelector('#join-button').addEventListener('click', saveRoom);
roomInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') saveRoom();
});
