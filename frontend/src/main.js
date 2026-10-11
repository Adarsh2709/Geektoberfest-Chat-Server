import { io } from 'socket.io-client';
import './style.css';

const serverUrl = import.meta.env.VITE_CHAT_SERVER_URL
  || (import.meta.env.PROD ? 'https://chat-server-2-fzyd.onrender.com' : 'http://localhost:5000');
const socket = io(serverUrl, { autoConnect: false, transports: ['websocket'] });
const nameKey = 'gather-display-name';
const roomKey = 'gather-room';
const senderIdKey = 'gather-sender-id';
const senderId = localStorage.getItem(senderIdKey) || crypto.randomUUID();
localStorage.setItem(senderIdKey, senderId);

const messageList = document.querySelector('#message-list');
const messageForm = document.querySelector('#message-form');
const messageInput = document.querySelector('#message-input');
const nameInput = document.querySelector('#name-input');
const roomInput = document.querySelector('#room-input');
const roomTitle = document.querySelector('#room-title');
const connectionLabel = document.querySelector('#connection-label');
const notice = document.querySelector('#notice');

// Restore the saved profile and room. Stored values are re-checked against the
// input limits, since they can be edited or come from an older version.
function readStored(key, maxLength) {
  const value = (localStorage.getItem(key) || '').trim().slice(0, maxLength);
  return value || null;
}

const identityDot = document.querySelector('.identity-dot');

function updateIdentityDot() {
  identityDot.textContent = (nameInput.value.trim() || 'You').slice(0, 1).toUpperCase();
}

nameInput.value = readStored(nameKey, nameInput.maxLength) || nameInput.value;
roomInput.value = readStored(roomKey, roomInput.maxLength) || roomInput.value;
roomTitle.textContent = roomInput.value.trim() || roomTitle.textContent;
updateIdentityDot();

let currentRoom = roomInput.value.trim() || 'general';

function setConnectionState(connected) {
  connectionLabel.textContent = connected ? 'Connected' : 'Connecting';
  document.querySelector('.online-dot').classList.toggle('is-connected', connected);
  messageInput.disabled = !connected;
}

setConnectionState(false);

function clearMessages() {
  messageList.replaceChildren();
}

function renderMessage(message) {
  const sender = String(message.sender || 'Someone');
  const text = String(message.text || '');
  const isMine = message.senderId === senderId;
  const row = document.createElement('article');
  row.className = `message-row${isMine ? ' is-mine' : ''}`;

  const avatar = document.createElement('span');
  avatar.className = 'message-avatar';
  avatar.textContent = sender.slice(0, 1).toUpperCase();

  const content = document.createElement('div');
  content.className = 'message-content';
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const senderName = document.createElement('strong');
  senderName.textContent = sender;
  const time = document.createElement('time');
  const date = new Date(message.timestamp || message.createdAt || Date.now());
  time.textContent = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  meta.append(senderName, time);

  const bubble = document.createElement('p');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  content.append(meta, bubble);
  row.append(avatar, content);
  messageList.append(row);
  messageList.scrollTop = messageList.scrollHeight;
}

function showNotice(text) {
  notice.textContent = text;
  window.clearTimeout(showNotice.timeoutId);
  showNotice.timeoutId = window.setTimeout(() => {
    notice.textContent = '';
  }, 3500);
}

function joinRoom() {
  const nextRoom = roomInput.value.trim();
  if (!nextRoom) {
    showNotice('Enter a room name first.');
    roomInput.focus();
    return;
  }

  currentRoom = nextRoom;
  localStorage.setItem(roomKey, nextRoom);
  roomInput.value = nextRoom;
  roomTitle.textContent = nextRoom;
  clearMessages();
  if (socket.connected) {
    socket.disconnect();
  }
  socket.connect();
}

socket.on('connect', () => {
  setConnectionState(true);
  socket.emit('join_room', currentRoom);
});

socket.on('disconnect', () => setConnectionState(false));
socket.on('connect_error', () => {
  setConnectionState(false);
  showNotice(`Can't reach the chat server at ${serverUrl}.`);
});
socket.on('chat_history', (history) => {
  clearMessages();
  if (Array.isArray(history)) history.forEach(renderMessage);
});
socket.on('receive_message', renderMessage);
socket.on('chat_error', showNotice);

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  const sender = nameInput.value.trim() || 'You';
  if (!text) return;
  if (!socket.connected) {
    showNotice('Wait for the server connection before sending.');
    return;
  }

  socket.emit('send_message', { room: currentRoom, sender, senderId, text });
  messageInput.value = '';
  messageInput.focus();
});

nameInput.addEventListener('input', () => {
  const name = nameInput.value.trim();
  if (name) localStorage.setItem(nameKey, name);
  else localStorage.removeItem(nameKey);
  updateIdentityDot();
});

document.querySelector('#join-button').addEventListener('click', joinRoom);
roomInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});

socket.connect();
