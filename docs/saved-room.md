# Saved room

The last room you joined is saved in the browser's local storage (`gather-room:<user id>`, one entry
per account) and restored on reload, so you land back in the room you left. The login session is
already persisted by the app (`gather-session`), which covers the profile.

- The room is saved each time the socket connects, which happens on every join.
- A saved value is re-checked against the room input's length limit (32 characters), and a blank or
  missing value falls back to `general`.
- Nothing is stored on the server.

Implemented in `frontend/src/features/persist.js`.
