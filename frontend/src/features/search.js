import './search.css';

const sessionKey = 'gather-session';

function sessionToken() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey))?.token || '';
  } catch {
    return '';
  }
}

export default function initSearch({ serverUrl, elements, getRoom, showNotice }) {
  const header = document.querySelector('.conversation-header');

  const form = document.createElement('form');
  form.className = 'search-form';
  form.setAttribute('role', 'search');
  form.innerHTML = `
    <label class="sr-only" for="search-input">Search messages by keyword</label>
    <input id="search-input" type="search" maxlength="100" placeholder="Search messages" autocomplete="off" />
    <label class="sr-only" for="search-user">Only messages from this user</label>
    <input id="search-user" type="search" maxlength="24" placeholder="From username" autocomplete="off" />
    <button class="search-button" type="submit" aria-label="Search" title="Search">⌕</button>
  `;
  header.insertBefore(form, header.querySelector('.people-count'));

  const results = document.createElement('section');
  results.className = 'search-results';
  results.setAttribute('aria-label', 'Search results');
  results.hidden = true;
  results.innerHTML = `
    <div class="search-results-header">
      <span class="search-summary"></span>
      <button class="message-action search-close" type="button">Close</button>
    </div>
    <ul class="search-list"></ul>
    <button class="message-action search-more" type="button" hidden>Show older results</button>
  `;
  header.after(results);

  const keywordInput = form.querySelector('#search-input');
  const userInput = form.querySelector('#search-user');
  const summary = results.querySelector('.search-summary');
  const list = results.querySelector('.search-list');
  const moreButton = results.querySelector('.search-more');
  let lastSearch = null;

  function close() {
    results.hidden = true;
    list.replaceChildren();
    lastSearch = null;
  }

  function renderResult(message) {
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
    list.append(item);
  }

  async function run({ more = false } = {}) {
    const query = more
      ? lastSearch
      : { room: getRoom(), q: keywordInput.value.trim(), user: userInput.value.trim() };
    if (!query.q && !query.user) {
      showNotice('Enter a keyword or a user to search for.');
      return;
    }

    const params = new URLSearchParams({ room: query.room, q: query.q, user: query.user });
    if (more && query.before) params.set('before', query.before);

    try {
      const response = await fetch(`${serverUrl}/api/search?${params}`, {
        headers: { Authorization: `Bearer ${sessionToken()}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Search failed.');

      if (!more) list.replaceChildren();
      body.messages.forEach(renderResult);
      const last = body.messages[body.messages.length - 1];
      lastSearch = { ...query, before: last ? last.createdAt : query.before };
      results.hidden = false;
      moreButton.hidden = !body.hasMore;
      summary.textContent = list.children.length
        ? `${list.children.length}${body.hasMore ? '+' : ''} result(s) in #${query.room}`
        : `No messages found in #${query.room}`;
    } catch (error) {
      showNotice(error instanceof TypeError ? `Can't reach the chat server at ${serverUrl}.` : error.message);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run();
  });
  moreButton.addEventListener('click', () => run({ more: true }));
  results.querySelector('.search-close').addEventListener('click', close);

  // Results belong to one room, so drop them when the room changes.
  new MutationObserver(close).observe(elements.roomTitle, { childList: true, characterData: true, subtree: true });
}
