# Typing indicators

Clients emit `typing` with `{ room, sender, typing }` while the user types. The server only accepts
it from sockets that joined the room, attributes it to the verified user ID (never one the client
claims), throttles "started typing" events to one per second per socket, ignores malformed payloads,
relays it through Redis so every backend instance reaches its clients, and announces "stopped
typing" if the user disconnects mid-sentence. Typing events are not stored.

The UI shows "X is typing", "X and Y are typing" or "Several people are typing" above the composer.
Typing stops after 3 seconds without keystrokes, on send, or when the input loses focus, and an
indicator the client stops hearing about expires after 5 seconds. A client recognises its own echo
by socket id, so tabs that share a user ID still see each other.

Implemented in `backend/features/typing.js` and `frontend/src/features/typing.js`. Run the backend
tests with `npm test` in `backend/`.
