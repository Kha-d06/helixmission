# HELIX: Orbital Recovery

Latest playable web build, including the multiplayer WebSocket server configuration.

## 🚀 [PLAY THE GAME](https://kha-d06.github.io/helixmission/)

Use the link above to launch the latest browser build, or [TEST THE GAME](https://kha-d06.github.io/helixmission/) directly.

GitHub Pages deployment is enabled for this repository. The game client includes party networking; a public WebSocket host is required for players on different computers because GitHub Pages only serves static files.

Playable site: https://helixmission.vercel.app/

## Run locally

```powershell
npm install
npm start
```

Then open http://localhost:3000/. The local launcher serves the current folder and enables the same room/WebSocket logic for local testing.

The Vercel deployment uses `ws.mjs` and `vercel.json` for the shared party server route.
