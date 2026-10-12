# Frontend features

Every `*.js` file in this folder is loaded by `main.js`, so a feature can be added without editing
`main.js`, `index.html` or `style.css` (import a CSS file from the feature instead).

- Top-level code runs before `main.js`, which is useful for restoring state into the inputs.
- The default export, if any, is called just before the socket connects, with a context:
  `{ socket, serverUrl, elements, getRoom, getName, getUserId, showNotice, decorateMessage }`.
- `decorateMessage((row, message) => { ... })` is called each time a message is drawn.
