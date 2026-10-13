# Connection feedback

The sidebar shows the connection state:

| State | Shown as | When |
|---|---|---|
| connecting | Connecting | Starting up, or after pressing Retry |
| connected | Connected | Linked to the server |
| reconnecting | Reconnecting (attempt n)… | The connection dropped, or the first connection failed; socket.io keeps retrying |
| reconnected | Reconnected (for 3 seconds) | Back online after a drop |
| disconnected | Disconnected | Retrying gave up, or the server closed the connection |

When the state is disconnected, a **Retry** button appears. Retry reconnects straight away.
Messages sent while offline are queued and sent when the connection returns, and the notice explains
why. A failed connection says which server it tried to reach.

Implemented in `frontend/src/features/connection.js`. It reads socket.io's own events, so the
existing connection code in `main.js` is unchanged.
