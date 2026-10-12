# Search and mentions

## Search

`GET /api/search?room=<room>&q=<keyword>&user=<username>` returns up to 20 messages per page,
newest first, as `{ messages, hasMore }`. `q` is a case-insensitive substring match and `user` an
exact, case-insensitive username match; at least one is required. The request needs the logged-in
user's token (`Authorization: Bearer <token>`). Pass
`before=<createdAt of the last result>` to load older pages. Removed messages are not returned.
The UI exposes this as the search box in the room header.

Search is a regex scan within one room, backed by `{ room, createdAt }` and
`{ room, sender, createdAt }` indexes; it is not full-text search.

## Mentions

Mentions are detected in the browser (`@username`, case ignored: `@harshavi`). Mentioned users see the message highlighted and a notice; if the tab is
in the background the page title shows an unread count, and desktop notifications are shown once
enabled from the sidebar button. Each message from someone else has a Reply button that inserts
`@name` into the composer. Mentions match account usernames, which are unique.

Implemented in `backend/features/search.js`, `frontend/src/features/search.js` and
`frontend/src/features/mentions.js`. Run the tests with `npm test` in `backend/`.
