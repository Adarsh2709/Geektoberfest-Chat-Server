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
const typingIndicator = document.querySelector('#typing-indicator');

const TYPING_REFRESH_MS = 2000;
const TYPING_IDLE_MS = 3000;
const TYPING_EXPIRY_MS = 5000;

let currentRoom = roomInput.value.trim() || 'general';
const remoteTypers = new Map();
let isTyping = false;
let lastTypingSentAt = 0;
let typingIdleId;

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

function renderTypingIndicator() {
  const names = [...remoteTypers.values()].map((typer) => typer.name);
  typingIndicator.replaceChildren();
  if (!names.length) return;

  let text = 'Several people are typing';
  if (names.length === 1) text = `${names[0]} is typing`;
  else if (names.length === 2) text = `${names[0]} and ${names[1]} are typing`;

  const dots = document.createElement('span');
  dots.className = 'typing-dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.append(...[0, 1, 2].map(() => document.createElement('span')));
  typingIndicator.append(text, dots);
}

// Remote typers expire on their own, so a lost "stopped typing" event can't leave a stuck indicator.
function setRemoteTyping(typerId, name, typing) {
  window.clearTimeout(remoteTypers.get(typerId)?.timeoutId);
  if (typing) {
    const timeoutId = window.setTimeout(() => setRemoteTyping(typerId, name, false), TYPING_EXPIRY_MS);
    remoteTypers.set(typerId, { name, timeoutId });
  } else {
    remoteTypers.delete(typerId);
  }
  renderTypingIndicator();
}

function clearRemoteTypers() {
  remoteTypers.forEach((typer) => window.clearTimeout(typer.timeoutId));
  remoteTypers.clear();
  renderTypingIndicator();
}

function sendTyping(typing) {
  if (!socket.connected) return;
  socket.emit('typing', { room: currentRoom, sender: nameInput.value.trim() || 'You', senderId, typing });
}

function stopTyping() {
  window.clearTimeout(typingIdleId);
  if (!isTyping) return;
  isTyping = false;
  sendTyping(false);
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
  stopTyping();
  clearRemoteTypers();
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

socket.on('disconnect', () => {
  setConnectionState(false);
  window.clearTimeout(typingIdleId);
  isTyping = false;
  clearRemoteTypers();
});
socket.on('connect_error', () => {
  setConnectionState(false);
  showNotice(`Can't reach the chat server at ${serverUrl}.`);
});
socket.on('chat_history', (history) => {
  clearMessages();
  if (Array.isArray(history)) history.forEach(renderMessage);
});
socket.on('receive_message', (message) => {
  setRemoteTyping(message.senderId, '', false);
  renderMessage(message);
});
socket.on('typing', ({ room, sender, senderId: typerId, socketId, typing }) => {
  if (room !== currentRoom || socketId === socket.id) return;
  setRemoteTyping(typerId, String(sender || 'Someone'), typing);
});
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

  stopTyping();
  socket.emit('send_message', { room: currentRoom, sender, senderId, text });
  messageInput.value = '';
  messageInput.focus();
});

messageInput.addEventListener('input', () => {
  if (!messageInput.value.trim()) {
    stopTyping();
    return;
  }

  const now = Date.now();
  if (!isTyping || now - lastTypingSentAt >= TYPING_REFRESH_MS) {
    isTyping = true;
    lastTypingSentAt = now;
    sendTyping(true);
  }
  window.clearTimeout(typingIdleId);
  typingIdleId = window.setTimeout(stopTyping, TYPING_IDLE_MS);
});
messageInput.addEventListener('blur', stopTyping);

document.querySelector('#join-button').addEventListener('click', joinRoom);
roomInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});

socket.connect();
