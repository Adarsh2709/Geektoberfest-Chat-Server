import './connection.css';

// Shows the connection state in the sidebar: connecting, connected, reconnecting, reconnected or
// disconnected. Once reconnecting gives up, a Retry button appears and the notice says why.
const RECONNECTED_MS = 3000;
// socket.io retries forever by default, so give up after this many attempts and offer Retry.
const MAX_RECONNECT_ATTEMPTS = 10;

export default function initConnection({ socket, serverUrl, showNotice }) {
  const label = document.querySelector('#connection-label');
  const dot = document.querySelector('.online-dot');
  const rail = document.querySelector('.rail-bottom');

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.id = 'retry-connection';
  retry.className = 'message-action retry-connection';
  retry.textContent = 'Retry';
  retry.hidden = true;
  rail.append(retry);

  label.setAttribute('role', 'status');
  socket.io.reconnectionAttempts(MAX_RECONNECT_ATTEMPTS);
  let reconnectedTimer;

  function setState(state, text, { connected = false, showRetry = false } = {}) {
    window.clearTimeout(reconnectedTimer);
    label.textContent = text;
    label.dataset.state = state;
    dot.classList.toggle('is-connected', connected);
    retry.hidden = !showRetry;
  }

  socket.on('connect', () => {
    setState('connected', 'Connected', { connected: true });
  });

  // socket.io retries after a dropped connection and after a failed first connection alike.
  socket.io.on('reconnect_attempt', (attempt) => {
    setState('reconnecting', `Reconnecting (attempt ${attempt})…`);
  });

  socket.io.on('reconnect', () => {
    setState('reconnected', 'Reconnected', { connected: true });
    reconnectedTimer = window.setTimeout(() => setState('connected', 'Connected', { connected: true }), RECONNECTED_MS);
  });

  socket.io.on('reconnect_error', (error) => {
    setState('reconnecting', 'Still reconnecting…');
    console.warn(`Reconnect attempt failed: ${error.message}`);
  });

  socket.io.on('reconnect_failed', () => {
    setState('disconnected', 'Disconnected', { showRetry: true });
    showNotice(`Couldn't reach the chat server at ${serverUrl}. Check that it is running, then press Retry.`);
  });

  // A server-side close is reconnected by main.js right away, so show that rather than giving up.
  socket.on('disconnect', (reason) => {
    if (reason !== 'io client disconnect') setState('reconnecting', 'Reconnecting…');
  });

  retry.addEventListener('click', () => {
    setState('connecting', 'Connecting…');
    socket.connect();
  });
}
