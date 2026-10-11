import { io } from 'socket.io-client';
import './style.css';

const serverUrl = import.meta.env.VITE_CHAT_SERVER_URL
  || (import.meta.env.PROD ? 'https://chat-server-2-fzyd.onrender.com' : 'http://localhost:5000');
const sessionKey = 'gather-session';
let session = readSession();
function readSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey));
  } catch {
    return null;
  }
}
const socket = io(serverUrl, {
  autoConnect: false,
  transports: ['websocket'],
  auth: (callback) => callback({ token: session?.token }),
});

const messageList = document.querySelector('#message-list');
const messageForm = document.querySelector('#message-form');
const messageInput = document.querySelector('#message-input');
const roomInput = document.querySelector('#room-input');
const roomTitle = document.querySelector('#room-title');
const connectionLabel = document.querySelector('#connection-label');
const notice = document.querySelector('#notice');
const chatView = document.querySelector('#chat-view');
const identity = document.querySelector('#identity');
const authView = document.querySelector('#auth-view');
const authForm = document.querySelector('#auth-form');
const authUsername = document.querySelector('#auth-username');
const authPassword = document.querySelector('#auth-password');
const authSubmit = document.querySelector('#auth-submit');
const authSwitch = document.querySelector('#auth-switch');
const authNotice = document.querySelector('#auth-notice');

let currentRoom = roomInput.value.trim() || 'general';
let authMode = 'login';

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
  const isMine = message.senderId === session?.user.id;
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
  clearMessages();
  if (socket.connected) {
    socket.disconnect();
  }
  socket.connect();
}

async function requestAuth(path, { body, token } = {}) {
  let response;
  try {
    response = await fetch(`${serverUrl}/api/auth/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error(`Can't reach the chat server at ${serverUrl}.`);
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
  return data;
}

function showChat() {
  const { username } = session.user;
  identity.querySelector('#identity-dot').textContent = username.slice(0, 1).toUpperCase();
  identity.querySelector('#identity-name').textContent = username;
  authView.hidden = true;
  identity.hidden = false;
  chatView.hidden = false;
  clearMessages();
  socket.connect();
  messageInput.focus();
}

function showAuth(message = '') {
  session = null;
  localStorage.removeItem(sessionKey);
  socket.disconnect();
  chatView.hidden = true;
  identity.hidden = true;
  authView.hidden = false;
  authNotice.textContent = message;
  authUsername.focus();
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  document.querySelector('#auth-eyebrow').textContent = registering ? 'NEW HERE' : 'WELCOME BACK';
  document.querySelector('#auth-title').textContent = registering ? 'Create your account' : 'Log in to gather';
  document.querySelector('#auth-switch-text').textContent = registering ? 'Already have an account?' : 'New here?';
  authSwitch.textContent = registering ? 'Log in' : 'Create an account';
  authSubmit.textContent = registering ? 'Create account' : 'Log in';
  authPassword.autocomplete = registering ? 'new-password' : 'current-password';
  authNotice.textContent = '';
}

async function logOut() {
  const token = session?.token;
  showAuth();
  // Revoke the token server-side; the local session is already gone either way.
  await requestAuth('logout', { token }).catch(() => {});
}

socket.on('connect', () => {
  setConnectionState(true);
  socket.emit('join_room', currentRoom);
});

socket.on('disconnect', (reason) => {
  setConnectionState(false);
  // The server drops sockets when the user logs out elsewhere; reconnecting re-checks the token.
  if (reason === 'io server disconnect' && session) socket.connect();
});
socket.on('connect_error', (error) => {
  setConnectionState(false);
  if (error.message === 'Unauthorized') {
    showAuth('Your session has ended. Please log in again.');
    return;
  }
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
  if (!text) return;
  if (!socket.connected) {
    showNotice('Wait for the server connection before sending.');
    return;
  }

  socket.emit('send_message', { room: currentRoom, text });
  messageInput.value = '';
  messageInput.focus();
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  authNotice.textContent = '';

  try {
    session = await requestAuth(authMode, {
      body: { username: authUsername.value, password: authPassword.value },
    });
    localStorage.setItem(sessionKey, JSON.stringify(session));
    authPassword.value = '';
    showChat();
  } catch (error) {
    authNotice.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

authSwitch.addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
document.querySelector('#logout-button').addEventListener('click', logOut);
document.querySelector('#join-button').addEventListener('click', joinRoom);
roomInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});

if (session?.token && session.user) {
  showChat();
} else {
  showAuth();
}
