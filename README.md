# Gather Chat

Realtime chat app with a Vite frontend and an Express/Socket.IO backend. MongoDB stores message history and Redis Pub/Sub broadcasts messages between backend instances.

## Local development

1. Copy `backend/.env.example` to `backend/.env` and fill in `MONGO_URL` and `REDIS_URL`.
2. In `backend/`, run `npm ci` and then `npm run dev`.
3. Copy `frontend/.env.example` to `frontend/.env` if the backend is not at `http://localhost:5000`.
4. In `frontend/`, run `npm ci` and then `npm run dev`.

## Deploy

### Render backend

The root `render.yaml` defines a Node web service rooted at `backend/`. Create a Render Blueprint from this repository and provide `MONGO_URL`, `REDIS_URL`, and `FRONTEND_ORIGIN` when prompted. Render supplies `PORT`; the backend binds to it and exposes `/health` for health checks.

### Vercel services

Create a Vercel project from this repository with the repository root as its Root Directory. The root `vercel.json` builds `frontend/` and `backend/` as separate services. Requests to `/socket.io/` are routed to the backend; all other paths go to the frontend. The frontend connects to the same Vercel origin in production, so leave `VITE_CHAT_SERVER_URL` unset for this deployment. The existing `frontend/vercel.json` remains available when deploying the frontend as a separate Vercel project.

Set `MONGO_URL` and `REDIS_URL` in the Vercel project environment. Set `FRONTEND_ORIGIN` to the deployed Vercel origin (for example, `https://your-project.vercel.app`, without a trailing slash); include any preview origins that need access, separated by commas. Vercel service bindings are not needed because the browser uses the public same-origin Socket.IO rewrite and the backend does not call another Vercel service.

Keep credentials in Render/Vercel environment settings. Do not commit `.env` files.

## Issues for contributors

These are proposed improvements, not current deployment blockers. Pick one, open an issue describing the approach, and submit a focused pull request. Keep secrets out of commits and include screenshots for UI changes.

### Good first issues

- [ ] **Remember the display name:** Store the chosen display name in local storage and restore it on reload.
- [ ] **Improve connection feedback:** Show clear connecting, connected, reconnecting, and disconnected states; let users retry after an error.
- [ ] **Empty and loading states:** Add useful UI while chat history loads and when a room has no messages.
- [ ] **Room navigation:** Show recently joined rooms and make switching rooms easier on mobile.
- [ ] **Message history paging:** Load older messages on demand instead of limiting the room to the latest 20.
- [ ] **Accessibility pass:** Check keyboard navigation, focus states, and screen-reader labels across the chat UI.

### Major upgrades

- [ ] **User accounts and authentication:** Add registration, login, logout, secure password hashing, and a session or token strategy. Protect Socket.IO connections and ensure clients can only send messages as the authenticated user.
- [ ] **User profiles:** Persist a unique display name and optional avatar; add profile editing and show profile details beside messages. Do not trust sender names supplied by the browser once authentication exists.
- [ ] **Room membership and permissions:** Add room creation, public/private rooms, invitations, and server-side checks before joining or sending messages.
- [ ] **Message controls:** Add edit/delete support with ownership checks, plus clear edited/deleted states in history and live updates.
- [ ] **Reliable message delivery:** Acknowledge successful sends, retain unsent messages during disconnects, and avoid duplicate messages after reconnecting.
- [ ] **Production hardening:** Add request and message rate limits, stricter payload validation, graceful shutdown, structured logs, and health checks that report dependency status.
- [ ] **Automated coverage:** Add backend tests for authentication, permissions, message persistence, and Socket.IO events, plus frontend tests for chat and connection states.

### Stretch ideas

- [ ] Add direct messages, typing indicators, reactions, and online presence.
- [ ] Add image/file attachments with type and size limits and external object storage.
- [ ] Add message search and notifications for mentions or replies.
- [ ] Add moderation tools such as reporting, muting, and room administrators.
