# HELIX: Orbital Recovery

Latest playable web build, including the multiplayer WebSocket server configuration.

## 🚀 [PLAY THE GAME](https://kha-d06.github.io/helixmission/)

Use the link above to launch the latest browser build, or [TEST THE GAME](https://kha-d06.github.io/helixmission/) directly. Multiplayer is routed through the temporary Cloudflare Tunnel hosted by the project owner’s device. The device must keep the HELIX server and tunnel running.

## Host the party server

Run `npm start` in one terminal, then run `cloudflared tunnel --url http://127.0.0.1:3000` in another. If the tunnel URL changes, update the `partyServer` URL in `index.html` and push the change.

GitHub Pages deployment is enabled for this repository. The game client includes party networking; a public WebSocket host is required for players on different computers because GitHub Pages only serves static files.

Playable site: https://helixmission.vercel.app/

## Run locally

```powershell
npm install
npm start
```

Then open http://localhost:3000/. The local launcher serves the current folder and enables the same room/WebSocket logic for local testing.

The Vercel deployment uses `ws.mjs` and `vercel.json` for the shared party server route.
