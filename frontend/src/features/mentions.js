import './mentions.css';
import { extractMentions, normalizeName } from '../lib/mentions.js';

export default function initMentions({ socket, elements, getRoom, getName, getUserId, showNotice, decorateMessage }) {
  const baseTitle = document.title;
  let unreadMentions = 0;

  // A message mentions the current user if it names their display name and was sent by someone else.
  function isMentionOfMe(message) {
    const mine = Boolean(message.senderId) && message.senderId === getUserId();
    return !mine && extractMentions(message.text).includes(normalizeName(getName()));
  }

  // Highlights mentions and adds a Reply button to every message from someone else.
  decorateMessage((row, message) => {
    if (message.deleted) return;
    const bubble = row.querySelector('.message-bubble');
    const mentions = extractMentions(message.text);

    if (mentions.length) {
      bubble.replaceChildren();
      String(message.text || '').split(/(@[\w.-]+)/g).forEach((part) => {
        if (part.startsWith('@') && mentions.includes(part.slice(1).replace(/[.-]+$/, '').toLowerCase())) {
          const mention = document.createElement('span');
          mention.className = 'mention';
          mention.textContent = part;
          bubble.append(mention);
        } else if (part) {
          bubble.append(part);
        }
      });
    }
    row.classList.toggle('is-mention', isMentionOfMe(message));

    if (message.senderId && message.senderId === getUserId()) return;
    const sender = String(message.sender || 'Someone');
    const reply = document.createElement('button');
    reply.type = 'button';
    reply.className = 'message-action message-reply';
    reply.textContent = 'Reply';
    reply.setAttribute('aria-label', `Reply to ${sender}`);
    reply.addEventListener('click', () => {
      elements.messageInput.value = `@${normalizeName(sender)} ${elements.messageInput.value}`;
      elements.messageInput.focus();
    });
    row.querySelector('.message-meta').append(reply);
  });

  // Live mentions: a notice, then an unread count in the page title and a desktop notification
  // when the tab is in the background.
  socket.on('receive_message', (message) => {
    if (!isMentionOfMe(message)) return;

    const sender = String(message.sender || 'Someone');
    showNotice(`${sender} mentioned you.`);
    if (!document.hidden) return;

    unreadMentions += 1;
    document.title = `(${unreadMentions}) ${baseTitle}`;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`${sender} mentioned you in #${getRoom()}`, { body: String(message.text || '').slice(0, 120) });
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    unreadMentions = 0;
    document.title = baseTitle;
  });

  if ('Notification' in window && Notification.permission === 'default') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'message-action alerts-button';
    button.textContent = 'Enable desktop alerts';
    button.addEventListener('click', async () => {
      await Notification.requestPermission();
      button.hidden = true;
    });
    document.querySelector('.room-hint').after(button);
  }
}
