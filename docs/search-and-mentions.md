# Search and mentions

## Search

`GET /api/search?room=<room>&q=<keyword>&user=<display name>` returns up to 20 messages per page,
newest first, as `{ messages, hasMore }`. `q` is a case-insensitive substring match and `user` an
exact, case-insensitive display-name match; at least one is required. Pass
`before=<createdAt of the last result>` to load older pages. Removed messages are not returned.
The UI exposes this as the search box in the room header.

Search is a regex scan within one room, backed by `{ room, createdAt }` and
`{ room, sender, createdAt }` indexes; it is not full-text search.

## Mentions

Mentions are detected in the browser (`@name`, with spaces in display names removed and case
ignored: `@harshavitank`). Mentioned users see the message highlighted and a notice; if the tab is
in the background the page title shows an unread count, and desktop notifications are shown once
enabled from the sidebar button. Each message from someone else has a Reply button that inserts
`@name` into the composer. Mentions match display names, which are not unique or verified.

Implemented in `backend/features/search.js`, `frontend/src/features/search.js` and
`frontend/src/features/mentions.js`. Run the tests with `npm test` in `backend/` and `frontend/`.
