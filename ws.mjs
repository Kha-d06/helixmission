import { startServer } from './server_flat.mjs';

// Vercel's Node function owns the WebSocket upgrade at /ws. The room host is
// intentionally public here because the browser client is served publicly.
const runtime = startServer({
  listen: false,
  host: '0.0.0.0',
  webDir: process.cwd(),
  isAllowedAddress: () => true,
  allowedOrigins: ['kha-d06.github.io'],
  heartbeatMs: 20000,
  log: () => {},
});

export default runtime.server;
