# Private rooms and invites

A room can be made private by its owner. Only the owner, moderators and invited users can join a
private room; anyone else gets "This room is private. Ask the owner for an invite." Rooms that are
not private stay open to everyone.

## Socket events

| Event | Payload | Who | Effect |
|---|---|---|---|
| `set_private` | `{ room, value }` | owner | Makes the room private (`value: true`) or public (`false`). |
| `invite_user` | `{ room, username, value? }` | owner, moderators | Invites a user to a private room. `value: false` removes the invite. |

Both events reply through the acknowledgement callback when the client sends one, and otherwise
emit `chat_notice` or `chat_error`.

## Implementation

- `backend/utils/privateRooms.js` holds the permission rules as pure functions.
- `backend/features/privateRooms.js` checks `join_room` before the join handler runs and handles the
  two events. Privacy and invites are stored in their own `RoomAccess` collection, so the `Room`
  model and the rest of the server are unchanged.

Run the tests with `npm test` in `backend/`.
