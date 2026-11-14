# HELIX: Orbital Recovery

Latest playable web build, including the multiplayer WebSocket server configuration.

GitHub Pages deployment is enabled for this repository. The Pages build is configured for judge-safe single-player play because GitHub Pages cannot host WebSockets; the multiplayer server remains available through the Vercel/local server files.

Playable site: https://helixmission.vercel.app/

## Run locally

```powershell
npm install
npm start
```

Then open http://localhost:3000/. The local launcher serves the current folder and enables the same room/WebSocket logic for local testing.

The Vercel deployment uses `ws.mjs` and `vercel.json` for the shared party server route.
