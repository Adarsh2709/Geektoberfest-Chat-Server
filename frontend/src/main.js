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

// Messages sent but not yet acknowledged, oldest first.
const outbox = [];
// Every clientId already on screen, so a re-delivered message is not drawn twice.
const seenClientIds = new Set();
// Our own unacknowledged bubbles, so an ack can un-dim the right one.
const pendingRows = new Map();
// Keeps repeated reconnect failures from stomping every other notice.
let reportedOffline = false;
// How long to wait for an acknowledgement before queueing the message again.
const ACK_TIMEOUT_MS = 10000;

function setConnectionState(connected) {
  connectionLabel.textContent = connected ? 'Connected' : (reportedOffline ? 'Offline' : 'Connecting');
  document.querySelector('.online-dot').classList.toggle('is-connected', connected);
}

setConnectionState(false);

function clearMessages() {
  messageList.replaceChildren();
  seenClientIds.clear();
  pendingRows.clear();
}

function setPendingLabel(clientId, text) {
  const label = pendingRows.get(clientId)?.querySelector('.message-status');
  if (label) label.textContent = text;
}

function requeueOutbox() {
  for (const message of outbox) {
    message.inFlight = false;
    setPendingLabel(message.clientId, 'Queued — offline');
  }
}

function markDelivered(clientId) {
  const queued = outbox.findIndex((message) => message.clientId === clientId);
  if (queued !== -1) outbox.splice(queued, 1);

  const row = pendingRows.get(clientId);
  if (row) {
    row.classList.remove('is-pending');
    row.querySelector('.message-status')?.remove();
    pendingRows.delete(clientId);
  }
}

function discardQueued(clientId) {
  const queued = outbox.findIndex((message) => message.clientId === clientId);
  if (queued !== -1) outbox.splice(queued, 1);

  const row = pendingRows.get(clientId);
  if (row) {
    row.remove();
    pendingRows.delete(clientId);
  }
  seenClientIds.delete(clientId);
}

function flushOutbox() {
  if (!socket.connected) return;

  for (const message of outbox) {
    if (message.inFlight) continue;
    message.inFlight = true;

    const { clientId, room, sender, senderId, text } = message;
    setPendingLabel(clientId, 'Sending…');
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'send_message',
      { clientId, room, sender, senderId, text },
      (timedOut, response) => {
        message.inFlight = false;

        if (timedOut) {
          // No answer came back. Stay queued; the server deduplicates on
          // clientId, so resending later cannot create a second copy.
          setPendingLabel(clientId, 'Queued — retrying');
          return;
        }

        if (response?.ok) {
          markDelivered(clientId);
          return;
        }

        // A rejected message will not succeed on retry, so hand the text back.
        discardQueued(clientId);
        if (!messageInput.value.trim()) messageInput.value = text;
        showNotice(response?.error || 'Could not send your message.');
      },
    );
  }
}

function renderMessage(message, { pending = false } = {}) {
  const clientId = typeof message.clientId === 'string' ? message.clientId : '';
  if (clientId && seenClientIds.has(clientId)) {
    // Already drawn. The echo is itself proof the server stored it.
    markDelivered(clientId);
    return;
  }
  if (clientId) seenClientIds.add(clientId);

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
  if (pending && clientId) {
    row.classList.add('is-pending');
    const status = document.createElement('span');
    status.className = 'message-status';
    status.textContent = socket.connected ? 'Sending…' : 'Queued — offline';
    meta.append(status);
    pendingRows.set(clientId, row);
  }
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
  clearMessages();
  if (socket.connected) {
    socket.disconnect();
  }
  socket.connect();
}

socket.on('connect', () => {
  reportedOffline = false;
  setConnectionState(true);
  socket.emit('join_room', currentRoom);
  flushOutbox();
});

socket.on('disconnect', () => {
  setConnectionState(false);
  requeueOutbox();
});
socket.on('connect_error', () => {
  setConnectionState(false);
  requeueOutbox();
  if (reportedOffline) return;
  reportedOffline = true;
  showNotice(`Can't reach the chat server at ${serverUrl}.`);
});
socket.on('chat_history', (history) => {
  clearMessages();
  if (Array.isArray(history)) history.forEach((message) => renderMessage(message));

  // Queued messages are not in history yet, so put them back on screen. Any
  // that the server did store are deduped and marked delivered instead.
  for (const message of [...outbox]) {
    if (message.room === currentRoom) renderMessage(message, { pending: true });
  }
});
socket.on('receive_message', renderMessage);
socket.on('chat_error', showNotice);

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  const sender = nameInput.value.trim() || 'You';
  if (!text) return;

  const queued = {
    clientId: crypto.randomUUID(),
    room: currentRoom,
    sender,
    senderId,
    text,
    timestamp: new Date().toISOString(),
  };

  outbox.push(queued);
  renderMessage(queued, { pending: true });
  messageInput.value = '';
  messageInput.focus();

  if (socket.connected) flushOutbox();
  else showNotice('Offline. This will send when the connection is back.');
});

document.querySelector('#join-button').addEventListener('click', joinRoom);
roomInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});

socket.connect();
