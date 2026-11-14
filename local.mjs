import { startServer } from './server_flat.mjs';

const port = Number(process.env.PORT) || 3000;
const runtime = await startServer({
  port,
  host: '127.0.0.1',
  webDir: process.cwd(),
  isAllowedAddress: () => true,
  log: console.log,
});

console.log(`HELIX is running at http://localhost:${runtime.port}/`);
