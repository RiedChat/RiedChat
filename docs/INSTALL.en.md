# Installation

RiedChat is a static client (built into `dist/`), it only needs an XMPP
server with support for the required XEPs (see the list in
[SERVER_SETUP.en.md](./SERVER_SETUP.en.md#supported-xeps)). RiedChat doesn't
run the server itself - server requirements and a sample Prosody config are
there too.

## Building the client

```bash
npm install
npm run build     # production build into dist/
npm run preview   # local preview of dist/
```

`dist/` is plain static content: serve it from any web server (Nginx,
Apache, Caddy, etc.) over HTTPS. No backend other than the XMPP server is
required.

## How the client finds the XMPP server

The user enters the WebSocket endpoint domain/address on the login screen
(`ui/login-screen.js`); the last used address is remembered in
`localStorage` under the `riedchatLastWsUrl` key for autofill on the next
login. No separate config file needs to be set at build time.

## Development

The rest of the npm scripts (dev server, tests, lint, format) are in
[package.json](../package.json). The `?debug=1` query flag enables the debug
panel (`src/core/env.js`).
