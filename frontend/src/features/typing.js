import './typing.css';

const TYPING_REFRESH_MS = 2000;
const TYPING_IDLE_MS = 3000;
const TYPING_EXPIRY_MS = 5000;

export default function initTyping({ socket, elements, getRoom, getName }) {
  const { messageForm, messageInput } = elements;
  const indicator = document.createElement('div');
  indicator.id = 'typing-indicator';
  indicator.className = 'typing-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  messageForm.before(indicator);

  const remoteTypers = new Map();
  let isTyping = false;
  let lastSentAt = 0;
  let idleId;

  function render() {
    const names = [...remoteTypers.values()].map((typer) => typer.name);
    indicator.replaceChildren();
    if (!names.length) return;

    let text = 'Several people are typing';
    if (names.length === 1) text = `${names[0]} is typing`;
    else if (names.length === 2) text = `${names[0]} and ${names[1]} are typing`;

    const dots = document.createElement('span');
    dots.className = 'typing-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.append(...[0, 1, 2].map(() => document.createElement('span')));
    indicator.append(text, dots);
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
    render();
  }

  function clearRemoteTypers() {
    remoteTypers.forEach((typer) => window.clearTimeout(typer.timeoutId));
    remoteTypers.clear();
    render();
  }

  function sendTyping(typing) {
    if (socket.connected) socket.emit('typing', { room: getRoom(), sender: getName(), typing });
  }

  function stopTyping() {
    window.clearTimeout(idleId);
    if (!isTyping) return;
    isTyping = false;
    sendTyping(false);
  }

  messageInput.addEventListener('input', () => {
    if (!messageInput.value.trim()) {
      stopTyping();
      return;
    }

    const now = Date.now();
    if (!isTyping || now - lastSentAt >= TYPING_REFRESH_MS) {
      isTyping = true;
      lastSentAt = now;
      sendTyping(true);
    }
    window.clearTimeout(idleId);
    idleId = window.setTimeout(stopTyping, TYPING_IDLE_MS);
  });
  messageInput.addEventListener('blur', stopTyping);
  messageForm.addEventListener('submit', stopTyping);

  socket.on('typing', ({ room, sender, senderId, socketId, typing }) => {
    // Our own echo is recognised by socket, so tabs that share a user ID still see each other.
    if (room !== getRoom() || socketId === socket.id) return;
    setRemoteTyping(senderId, String(sender || 'Someone'), typing);
  });
  socket.on('receive_message', (message) => setRemoteTyping(message.senderId, '', false));

  // Switching rooms also disconnects, so this clears the state for the old room.
  socket.on('disconnect', () => {
    window.clearTimeout(idleId);
    isTyping = false;
    clearRemoteTypers();
  });
}
