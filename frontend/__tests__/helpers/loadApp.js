const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');

const user = { id: 'u-me', username: 'alice' };

// Loads the real index.html and src/main.js into a fresh jsdom page and returns the fake socket.
// Pass { session: null } to start logged out.
function loadApp({ session = { token: 'tok', user } } = {}) {
  document.body.innerHTML = body;
  document.title = 'Gather | Chat';
  localStorage.clear();
  if (session) localStorage.setItem('gather-session', JSON.stringify(session));

  let socket;
  jest.isolateModules(() => {
    require('../../src/main.js');
    socket = require('socket.io-client').FakeSocket.last;
  });
  return socket;
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// Brings the socket up and finishes the join, as the server would.
function openChat(socket, { userId = user.id, state } = {}) {
  socket.open();
  socket.serverEmit('identity', { userId });
  if (state) socket.serverEmit('room_state', { room: 'general', ownerId: '', moderators: [], mutedIds: [], ...state });
}

const message = (overrides = {}) => ({
  id: `m-${Math.random().toString(36).slice(2)}`,
  sender: 'bob',
  senderId: 'u-bob',
  text: 'hi',
  timestamp: new Date().toISOString(),
  ...overrides,
});

module.exports = { loadApp, openChat, message, $, $$, user };
