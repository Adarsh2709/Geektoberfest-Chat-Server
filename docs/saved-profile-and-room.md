# Saved profile and room

The display name and the last room you joined are saved in the browser's local storage
(`gather-display-name`, `gather-room`) and restored on reload, and the saved room is rejoined
automatically. The avatar initial follows the display name.

- The name is saved as it is typed; the room is saved when it is joined.
- Clearing the name falls back to "You".
- Saved values are re-checked against the input length limits (24 and 32 characters), so blank,
  oversized or hand-edited values fall back to the defaults.
- Nothing is stored on the server.

Implemented in `frontend/src/features/persist.js`.
