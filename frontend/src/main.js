import { io } from 'socket.io-client';
import './style.css';

const serverUrl = import.meta.env.VITE_CHAT_SERVER_URL
  || (import.meta.env.PROD ? 'https://chat-server-2-fzyd.onrender.com' : 'http://localhost:5000');
const socket = io(serverUrl, { autoConnect: false, transports: ['websocket'] });
// Private identity secret: only the server-derived public ID is ever shown to others.
const secretKey = 'gather-secret';
const secret = localStorage.getItem(secretKey) || `${crypto.randomUUID()}${crypto.randomUUID()}`;
localStorage.setItem(secretKey, secret);

const shortUserId = (id) => (typeof id === 'string' && id ? `#${id.replace(/-/g, '').slice(0, 4)}` : '');

const messageList = document.querySelector('#message-list');
const messageForm = document.querySelector('#message-form');
const messageInput = document.querySelector('#message-input');
const nameInput = document.querySelector('#name-input');
const roomInput = document.querySelector('#room-input');
const roomTitle = document.querySelector('#room-title');
const connectionLabel = document.querySelector('#connection-label');
const roleLabel = document.querySelector('#role-label');
const reportsPanel = document.querySelector('#reports-panel');
const reportsCount = document.querySelector('#reports-count');
const reportsList = document.querySelector('#reports-list');
const notice = document.querySelector('#notice');
const typingIndicator = document.querySelector('#typing-indicator');

const TYPING_REFRESH_MS = 2000;
const TYPING_IDLE_MS = 3000;
const TYPING_EXPIRY_MS = 5000;

const remoteTypers = new Map();
let isTyping = false;
let lastTypingSentAt = 0;
let typingIdleId;
const myIdTag = document.querySelector('#my-user-id');

let currentRoom = roomInput.value.trim() || 'general';
let isConnected = false;
let isRemoved = false;
let myUserId = '';
let roomState = { ownerId: '', moderators: [], mutedIds: [] };

function roleOf(userId) {
  if (!userId) return 'member';
  if (roomState.ownerId === userId) return 'owner';
  if (roomState.moderators.includes(userId)) return 'moderator';
  return 'member';
}

function isStaff() {
  return roleOf(myUserId) !== 'member';
}

function isMuted(userId) {
  return Boolean(userId) && roomState.mutedIds.includes(userId);
}

// Mirrors the server's rules: owners act on anyone, moderators only on members.
function canModerate(targetId) {
  if (!myUserId || targetId === myUserId) return false;
  const myRole = roleOf(myUserId);
  return myRole === 'owner' || (myRole === 'moderator' && roleOf(targetId) === 'member');
}

function updateComposer() {
  const muted = isMuted(myUserId);
  messageInput.disabled = !isConnected || isRemoved || muted;
  messageInput.placeholder = isRemoved
    ? 'You were removed from this room'
    : muted ? 'You are muted in this room' : 'Write a message...';
}

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
  isConnected = connected;
  connectionLabel.textContent = connected ? 'Connected' : 'Connecting';
  document.querySelector('.online-dot').classList.toggle('is-connected', connected);
  updateComposer();
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

function actionButton(action, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'message-action';
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function refreshRow(row) {
  const authorId = row.dataset.senderId;
  const isMine = Boolean(authorId) && authorId === myUserId;
  row.classList.toggle('is-mine', isMine);

  const role = roleOf(authorId);
  const badges = [];
  if (role !== 'member') badges.push(role);
  if (isMuted(authorId)) badges.push('muted');
  row.querySelector('.message-badge').textContent = badges.join(' · ');

  const actions = row.querySelector('.message-actions');
  actions.replaceChildren();
  if (row.dataset.deleted === 'true' || !row.dataset.messageId) return;

  if (!isMine) actions.append(actionButton('report', 'Report'));
  if (canModerate(authorId)) {
    actions.append(actionButton('delete', 'Delete'));
    if (authorId) {
      actions.append(actionButton(isMuted(authorId) ? 'unmute' : 'mute', isMuted(authorId) ? 'Unmute' : 'Mute'));
      actions.append(actionButton('remove', 'Remove user'));
    }
  }
  if (roleOf(myUserId) === 'owner' && authorId && !isMine) {
    actions.append(actionButton(role === 'moderator' ? 'demote' : 'promote', role === 'moderator' ? 'Remove mod' : 'Make mod'));
  }
}

function refreshAllRows() {
  messageList.querySelectorAll('.message-row').forEach(refreshRow);
  const roleText = { owner: 'You are the owner', moderator: 'You are a moderator' }[roleOf(myUserId)] || '';
  roleLabel.textContent = roleText;
  updateComposer();
  reportsPanel.hidden = !isStaff();
}

function markDeleted(row) {
  row.dataset.deleted = 'true';
  const bubble = row.querySelector('.message-bubble');
  bubble.textContent = 'Message removed by a moderator';
  bubble.classList.add('is-removed');
  refreshRow(row);
}

function flushOutbox() {
  if (!socket.connected) return;

  for (const message of outbox) {
    if (message.inFlight) continue;
    message.inFlight = true;

    const { clientId, room, sender, text } = message;
    setPendingLabel(clientId, 'Sending…');
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'send_message',
      { clientId, room, sender, text },
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
  const row = document.createElement('article');
  row.className = 'message-row';
  row.dataset.messageId = message.id || '';
  row.dataset.senderId = message.senderId || '';

  const avatar = document.createElement('span');
  avatar.className = 'message-avatar';
  avatar.textContent = sender.slice(0, 1).toUpperCase();

  const content = document.createElement('div');
  content.className = 'message-content';
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const senderName = document.createElement('strong');
  senderName.textContent = sender;
  const badge = document.createElement('span');
  badge.className = 'message-badge';
  const time = document.createElement('time');
  const date = new Date(message.timestamp || message.createdAt || Date.now());
  time.textContent = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const userId = document.createElement('span');
  userId.className = 'message-user-id';
  userId.textContent = shortUserId(message.senderId);
  userId.title = message.senderId ? `User ID: ${message.senderId}` : '';
  meta.append(senderName, userId, badge, time);

  const bubble = document.createElement('p');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  content.append(meta, bubble, actions);
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

  if (message.deleted) markDeleted(row);
  else refreshRow(row);
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
  socket.emit('typing', { room: currentRoom, sender: nameInput.value.trim() || 'You', typing });
}

function stopTyping() {
  window.clearTimeout(typingIdleId);
  if (!isTyping) return;
  isTyping = false;
  sendTyping(false);
}

function renderReports(reports) {
  reportsCount.textContent = reports.length;
  reportsList.replaceChildren();

  reports.forEach((report) => {
    const item = document.createElement('li');
    item.className = 'report-item';
    item.dataset.reportId = report.id;
    item.dataset.messageId = report.messageId;

    const text = document.createElement('p');
    text.className = 'report-text';
    text.textContent = report.text || '(message removed)';
    const reason = document.createElement('p');
    reason.className = 'report-reason';
    reason.textContent = report.reason ? `Reason: ${report.reason}` : 'No reason given';
    const actions = document.createElement('div');
    actions.className = 'message-actions is-visible';
    if (canModerate(report.reportedId)) actions.append(actionButton('delete-reported', 'Delete message'));
    actions.append(actionButton('dismiss', 'Dismiss'));
    item.append(text, reason, actions);
    reportsList.append(item);
  });
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
  roomState = { ownerId: '', moderators: [], mutedIds: [] };
  isRemoved = false;
  stopTyping();
  clearRemoteTypers();
  clearMessages();
  renderReports([]);
  refreshAllRows();
  if (socket.connected) {
    socket.disconnect();
  }
  socket.connect();
}

socket.on('connect', () => {
  reportedOffline = false;
  setConnectionState(true);
  socket.emit('join_room', { room: currentRoom, secret });
  flushOutbox();
});

socket.on('disconnect', () => {
  setConnectionState(false);
  window.clearTimeout(typingIdleId);
  isTyping = false;
  clearRemoteTypers();
  requeueOutbox();
});
socket.on('connect_error', () => {
  setConnectionState(false);
  requeueOutbox();
  if (reportedOffline) return;
  reportedOffline = true;
  showNotice(`Can't reach the chat server at ${serverUrl}.`);
});
socket.on('identity', ({ userId }) => {
  myUserId = userId;
  myIdTag.textContent = shortUserId(userId);
  myIdTag.title = `Your user ID: ${userId}`;
  refreshAllRows();
});
socket.on('room_state', (state) => {
  if (state.room !== currentRoom) return;
  roomState = state;
  refreshAllRows();
  if (isStaff()) socket.emit('list_reports', { room: currentRoom });
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
socket.on('receive_message', (message) => {
  setRemoteTyping(message.senderId, '', false);
  renderMessage(message);
});
socket.on('typing', ({ room, sender, senderId: typerId, socketId, typing }) => {
  if (room !== currentRoom || socketId === socket.id) return;
  setRemoteTyping(typerId, String(sender || 'Someone'), typing);
});
socket.on('message_deleted', ({ messageId }) => {
  messageList.querySelectorAll('.message-row').forEach((row) => {
    if (row.dataset.messageId === messageId) markDeleted(row);
  });
});
socket.on('removed_from_room', ({ room }) => {
  if (room !== currentRoom) return;
  isRemoved = true;
  clearMessages();
  updateComposer();
  showNotice('You were removed from this room by a moderator.');
});
socket.on('reports_changed', () => {
  if (isStaff()) socket.emit('list_reports', { room: currentRoom });
});
socket.on('reports', (reports) => renderReports(Array.isArray(reports) ? reports : []));
socket.on('chat_notice', showNotice);
socket.on('chat_error', showNotice);

messageList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('.message-row');
  const { senderId: targetId, messageId } = row.dataset;
  const room = currentRoom;

  switch (button.dataset.action) {
    case 'report': {
      const reason = window.prompt('Why are you reporting this message? (optional)');
      if (reason !== null) socket.emit('report_message', { room, messageId, reason });
      break;
    }
    case 'delete':
      if (window.confirm('Remove this message for everyone?')) socket.emit('delete_message', { room, messageId });
      break;
    case 'mute':
      socket.emit('mute_user', { room, targetId });
      break;
    case 'unmute':
      socket.emit('unmute_user', { room, targetId });
      break;
    case 'remove':
      if (window.confirm('Remove this user from the room? They will not be able to rejoin.')) {
        socket.emit('remove_user', { room, targetId });
      }
      break;
    case 'promote':
      socket.emit('set_moderator', { room, targetId, value: true });
      break;
    case 'demote':
      socket.emit('set_moderator', { room, targetId, value: false });
      break;
    default:
  }
});

reportsList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { reportId, messageId } = button.closest('.report-item').dataset;

  if (button.dataset.action === 'dismiss') {
    socket.emit('dismiss_report', { room: currentRoom, reportId });
  } else if (button.dataset.action === 'delete-reported' && window.confirm('Remove this message for everyone?')) {
    socket.emit('delete_message', { room: currentRoom, messageId });
    socket.emit('dismiss_report', { room: currentRoom, reportId });
  }
});

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  const sender = nameInput.value.trim() || defaultName;
  if (!text) return;

  stopTyping();
  const queued = {
    clientId: crypto.randomUUID(),
    room: currentRoom,
    sender,
    senderId: myUserId,
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
