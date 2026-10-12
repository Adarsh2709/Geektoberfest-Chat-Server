# Testing

Run `npm test` in `backend/` and in `frontend/`. CI runs both on every push and pull request
(`.github/workflows/test.yml`).

## Backend (`backend/`)

- **Integration tests (Jest)** in `__tests__/*.test.cjs` start the real server against an in-memory
  MongoDB (`mongodb-memory-server`) and a small in-process Redis (`__tests__/helpers/redisStub.cjs`),
  then drive it over HTTP and Socket.IO the way a client does. They cover health, registration,
  login and logout, token revocation, messaging and acknowledgements, duplicate suppression, room
  isolation, history, and every moderation action (roles, mute, delete, remove, reports).
  The first run downloads a MongoDB binary, which is cached afterwards.
- **Unit tests (`node:test`)** in `test/*.test.js` cover pure modules such as the permission rules.

`npm test` runs both. Use `npm run test:integration` or `npm run test:unit` for one at a time.

## Frontend (`frontend/`)

Jest with jsdom loads the real `index.html` and `src/main.js` against a fake `socket.io-client`
(`__tests__/helpers/`), so the tests exercise the actual UI code: login, connecting, history,
sending and acknowledgements, offline queueing, duplicate suppression, XSS-safe rendering, roles,
moderation controls, muting, removal and the reports panel.

## Adding tests

Put new backend integration tests in `backend/__tests__/` as `*.test.cjs` and use the helpers in
`helpers/client.cjs` (`register`, `joinRoom`, `connect`). Put new frontend tests in
`frontend/__tests__/` and use `loadApp`, `openChat` and `message` from `helpers/loadApp.js`.
