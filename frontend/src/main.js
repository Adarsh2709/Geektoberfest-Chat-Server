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
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const searchUserInput = document.querySelector('#search-user');
const searchResults = document.querySelector('#search-results');
const searchSummary = document.querySelector('#search-summary');
const searchList = document.querySelector('#search-list');
const searchMore = document.querySelector('#search-more');
const alertsButton = document.querySelector('#alerts-button');
const baseTitle = document.title;

let currentRoom = roomInput.value.trim() || 'general';
let unreadMentions = 0;
let lastSearch = null;

// Mentions ignore spaces and case: "Harshavi Tank" is mentioned as @harshavitank.
const normalizeName = (name) => name.replace(/\s+/g, '').toLowerCase();

function isMentioned(message) {
  const me = normalizeName(nameInput.value.trim() || 'You');
  return message.senderId !== senderId
    && Array.isArray(message.mentions)
    && message.mentions.includes(me);
}

function appendMessageText(element, text, mentions) {
  const tokens = Array.isArray(mentions) ? mentions : [];
  text.split(/(@[\w.-]+)/g).forEach((part) => {
    if (part.startsWith('@') && tokens.includes(part.slice(1).replace(/[.-]+$/, '').toLowerCase())) {
      const mention = document.createElement('span');
      mention.className = 'mention';
      mention.textContent = part;
      element.append(mention);
    } else if (part) {
      element.append(part);
    }
  });
}

function notifyMention(message) {
  const sender = String(message.sender || 'Someone');
  showNotice(`${sender} mentioned you.`);
  if (!document.hidden) return;

  unreadMentions += 1;
  document.title = `(${unreadMentions}) ${baseTitle}`;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`${sender} mentioned you in #${currentRoom}`, { body: String(message.text || '').slice(0, 120) });
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  unreadMentions = 0;
  document.title = baseTitle;
});

if ('Notification' in window && Notification.permission === 'default') {
  alertsButton.hidden = false;
  alertsButton.addEventListener('click', async () => {
    await Notification.requestPermission();
    alertsButton.hidden = true;
  });
}

function setConnectionState(connected) {
  connectionLabel.textContent = connected ? 'Connected' : 'Connecting';
  document.querySelector('.online-dot').classList.toggle('is-connected', connected);
  messageInput.disabled = !connected;
}

setConnectionState(false);

function clearMessages() {
  messageList.replaceChildren();
}

function renderMessage(message, { live = false } = {}) {
  const sender = String(message.sender || 'Someone');
  const text = String(message.text || '');
  const isMine = message.senderId === senderId;
  const mentioned = isMentioned(message);
  const row = document.createElement('article');
  row.className = `message-row${isMine ? ' is-mine' : ''}${mentioned ? ' is-mention' : ''}`;

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
  if (!isMine) {
    const reply = document.createElement('button');
    reply.type = 'button';
    reply.className = 'message-action message-reply';
    reply.textContent = 'Reply';
    reply.setAttribute('aria-label', `Reply to ${sender}`);
    reply.addEventListener('click', () => {
      messageInput.value = `@${normalizeName(sender)} ${messageInput.value}`;
      messageInput.focus();
    });
    meta.append(reply);
  }

  const bubble = document.createElement('p');
  bubble.className = 'message-bubble';
  appendMessageText(bubble, text, message.mentions);
  content.append(meta, bubble);
  row.append(avatar, content);
  messageList.append(row);
  messageList.scrollTop = messageList.scrollHeight;

  if (live && mentioned) notifyMention(message);
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
  closeSearch();
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
  if (Array.isArray(history)) history.forEach((message) => renderMessage(message));
});
socket.on('receive_message', (message) => renderMessage(message, { live: true }));
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

function closeSearch() {
  searchResults.hidden = true;
  searchList.replaceChildren();
  lastSearch = null;
}

function renderSearchResult(message) {
  const item = document.createElement('li');
  item.className = 'search-item';
  const meta = document.createElement('div');
  meta.className = 'search-item-meta';
  const name = document.createElement('strong');
  name.textContent = String(message.sender || 'Someone');
  const time = document.createElement('time');
  const date = new Date(message.timestamp || message.createdAt);
  time.textContent = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  meta.append(name, time);
  const text = document.createElement('p');
  text.textContent = String(message.text || '');
  item.append(meta, text);
  searchList.append(item);
}

async function runSearch({ more = false } = {}) {
  const query = more
    ? lastSearch
    : { room: currentRoom, q: searchInput.value.trim(), user: searchUserInput.value.trim() };
  if (!query.q && !query.user) {
    showNotice('Enter a keyword or a user to search for.');
    return;
  }

  const params = new URLSearchParams({ room: query.room, q: query.q, user: query.user });
  if (more && query.before) params.set('before', query.before);

  try {
    const response = await fetch(`${serverUrl}/api/search?${params}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Search failed.');

    if (!more) searchList.replaceChildren();
    body.messages.forEach(renderSearchResult);
    const last = body.messages[body.messages.length - 1];
    lastSearch = { ...query, before: last ? last.createdAt : query.before };
    searchResults.hidden = false;
    searchMore.hidden = !body.hasMore;
    searchSummary.textContent = searchList.children.length
      ? `${searchList.children.length}${body.hasMore ? '+' : ''} result(s) in #${query.room}`
      : `No messages found in #${query.room}`;
  } catch (error) {
    showNotice(error instanceof TypeError ? `Can't reach the chat server at ${serverUrl}.` : error.message);
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  runSearch();
});
searchMore.addEventListener('click', () => runSearch({ more: true }));
document.querySelector('#search-close').addEventListener('click', closeSearch);

document.querySelector('#join-button').addEventListener('click', joinRoom);
roomInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});

socket.connect();
