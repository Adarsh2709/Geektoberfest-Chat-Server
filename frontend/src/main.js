import { io } from 'socket.io-client';
import './style.css';

const serverUrl = import.meta.env.VITE_CHAT_SERVER_URL
  || (import.meta.env.PROD ? 'https://chat-server-2-fzyd.onrender.com' : 'http://localhost:5000');
const socket = io(serverUrl, { autoConnect: false, transports: ['websocket'] });
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

function showPlaceholder(title, detail, loading = false) {
  const note = document.createElement('div');
  note.className = `welcome-note${loading ? ' is-loading' : ''}`;
  note.dataset.placeholder = 'true';

  const spark = document.createElement('span');
  spark.className = 'welcome-spark';
  spark.setAttribute('aria-hidden', 'true');
  spark.textContent = '✳';

  const heading = document.createElement('div');
  heading.className = 'welcome-title';
  heading.textContent = title;

  const body = document.createElement('p');
  body.textContent = detail;

  note.append(spark, heading, body);
  messageList.replaceChildren(note);
}

function showLoadingState(room) {
  showPlaceholder('Loading messages', `Fetching the conversation in #${room}.`, true);
}

function showEmptyState(room) {
  showPlaceholder('No messages yet', `Say hello to start the conversation in #${room}.`);
}

function removePlaceholder() {
  const placeholder = messageList.querySelector('[data-placeholder]');
  if (placeholder) placeholder.remove();
}

function renderMessage(message) {
  removePlaceholder();
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
  roomInput.value = nextRoom;
  roomTitle.textContent = nextRoom;
  showLoadingState(nextRoom);
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
  const messages = Array.isArray(history) ? history : [];
  if (!messages.length) {
    showEmptyState(currentRoom);
    return;
  }

  clearMessages();
  messages.forEach(renderMessage);
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

document.querySelector('#join-button').addEventListener('click', joinRoom);
roomInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});

socket.connect();
