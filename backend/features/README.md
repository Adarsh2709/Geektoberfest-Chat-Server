# Backend features

Every `*.js` file in this folder is loaded at startup by `server.js`, so a feature can be added
without editing `server.js`. A feature module may export any of:

- `setup(context)` runs once after the database is connected (register routes, create indexes).
- `onConnection(socket, context)` runs for every new socket (register socket event handlers).
- `onRedisMessage(payload)` runs for every event on the chat channel; return `true` if handled.

`context` is `{ app, io, pubClient, allowedOrigins, publishEvent }`. To broadcast across backend
instances, call `publishEvent(type, payload)` and handle that `type` in `onRedisMessage`.
