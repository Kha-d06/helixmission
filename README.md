# HELIX: Orbital Recovery

Latest playable web build, including the multiplayer WebSocket server configuration.

## 🚀 [PLAY THE GAME — MULTIPLAYER](https://nearest-merry-fruit-understanding.trycloudflare.com/)

Use the link above to launch the multiplayer-ready build. The [GitHub Pages mirror](https://kha-d06.github.io/helixmission/) is also available, but the Cloudflare link is the correct address for party play. The project owner’s device must keep the HELIX server and tunnel running.

## Host the party server

Run `npm start` in one terminal, then run `cloudflared tunnel --url http://127.0.0.1:3000` in another. If the tunnel URL changes, update the `partyServer` URL in `index.html` and push the change.

GitHub Pages deployment is enabled for this repository. The game client includes party networking; a public WebSocket host is required for players on different computers because GitHub Pages only serves static files.

## Run locally

```powershell
npm install
npm start
```

Then open http://localhost:3000/. The local launcher serves the current folder and enables the same room/WebSocket logic for local testing.

