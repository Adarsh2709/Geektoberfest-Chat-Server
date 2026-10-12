# Production hardening

## Rate limits (per backend instance)

- HTTP requests: 120/min per IP, answered with `429` and `Retry-After`.
- New socket connections: 30/min per IP.
- Messages: 10 per 10s per socket. Room joins: 20 per 10s per socket.

A client that goes over a socket limit gets a `chat_error`, or `{ ok: false, error }` through the
acknowledgement callback when it sent one. Set `TRUST_PROXY=true` behind a reverse proxy such as
Render so limits use the real client address instead of the proxy's.

## Payload validation

`join_room` and `send_message` payloads are checked for type, length and control characters
(room 32, display name 24, message 1000, optional `clientId` 64 and alphanumeric) and rejected with
a message instead of being silently truncated. The sender's user ID is never taken from the client.
Socket payloads over 16 KB are refused by the transport.

## Graceful shutdown

On `SIGTERM` or `SIGINT` the server stops accepting connections, disconnects sockets, closes Redis
and MongoDB, and exits (forced after 10s). `/health` returns `503` while shutting down.

Implemented in `backend/features/hardening.js`, which checks events with Socket.IO packet
middleware so the existing handlers are untouched. Run the tests with `npm test` in `backend/`.
