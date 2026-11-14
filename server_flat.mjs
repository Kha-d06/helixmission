// HELIX: Orbital Recovery - LAN host.
// Serves the Web game and the room service from one address, for players on the same
// private network. It refuses connections from public addresses. Do not port-forward it.
//
//   node server.mjs [--port 8080] [--local-only]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.mjs';
import { cleanNickname, isColor, cleanCode } from './validate.mjs';
import { loadFeatures } from './features.mjs';
import { isPrivateAddress, lanAddresses } from './net.mjs';
import crypto from 'node:crypto';
import { act, playerLeft, publicMission, ACTION_TYPES, mapOf, spawnPoint, clampToMap, SPOTS, MAPS } from './mission.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROTOCOL_VERSION = 1;
const MAX_PLAYERS = 4;
const MAX_MESSAGE_BYTES = 1024;
const MAX_CONNECTIONS = 32;
const RATE_WINDOW_MS = 5000;
const RATE_MAX_MESSAGES = 30;
const RATE_MAX_MOVES = 150;       // position updates, counted separately
const POSITION_BROADCAST_MS = 100;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pck': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const ERROR_TEXT = {
  bad_request: 'That message was not understood.',
  bad_nickname: 'That callsign is not allowed.',
  bad_color: 'That suit color is not allowed.',
  bad_code: 'Room codes have 6 letters or numbers.',
  room_not_found: 'No room has that code.',
  room_full: 'That room already has 4 players.',
  name_taken: 'Someone in that room already uses that callsign.',
  already_in_room: 'You are already in a room.',
  not_in_room: 'You are not in a room.',
  server_full: 'The host cannot open more rooms right now.',
  feature_off: 'That is turned off in this game\'s settings.',
  not_now: 'That cannot be done at this point in the mission.',
  not_ready: 'The mission plan is not ready yet.',
  too_far: 'Walk closer first.',
};

export function findWebDir() {
  const candidates = [process.env.HELIX_WEB_DIR, path.join(HERE, '..', 'web'), path.join(HERE, '..', 'build', 'web')];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'index.html'))) return path.resolve(dir);
  }
  return null;
}

/**
 * Starts the host. Resolves to { port, close, rooms }.
 * Options exist mainly so tests can run it on a spare port with a fast heartbeat.
 */
export function startServer({
  port = 8080,
  host = '0.0.0.0',
  webDir = findWebDir(),
  heartbeatMs = 10000,
  isAllowedAddress = isPrivateAddress,
  allowedOrigins = [],
  rng = (n) => crypto.randomInt(n),
  log = () => {},
  listen = true,
} = {}) {
  const rooms = new RoomManager({ maxPlayers: MAX_PLAYERS });
  const configFile = webDir ? path.join(webDir, 'config', 'game_features.json') : null;
  const features = () => loadFeatures(configFile || '');

  const server = http.createServer((req, res) => {
    if (!isAllowedAddress(req.socket.remoteAddress)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('This host only serves the local network.');
      return;
    }
    serveStatic(req, res, webDir);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on('upgrade', (req, socket, head) => {
    const reject = (status) => {
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    let pathname = '';
    try {
      pathname = new URL(req.url, 'http://x').pathname;
    } catch { /* handled below */ }
    if (pathname !== '/ws') return reject('404 Not Found');
    if (!isAllowedAddress(req.socket.remoteAddress)) return reject('403 Forbidden');
    // A browser always sends Origin. It must be this host, so another website cannot
    // open rooms through a player's browser.
    const origin = req.headers.origin;
    if (origin !== undefined) {
      let originHost = null;
      try {
        originHost = new URL(origin).host;
      } catch { /* invalid origin */ }
      const allowedOriginHosts = new Set([req.headers.host, ...allowedOrigins]);
      if (!originHost || !allowedOriginHosts.has(originHost)) return reject('403 Forbidden');
    }
    if (wss.clients.size >= MAX_CONNECTIONS) return reject('503 Service Unavailable');
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const send = (ws, obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };
  const sendError = (ws, code) => send(ws, { t: 'error', code, message: ERROR_TEXT[code] || ERROR_TEXT.bad_request });
  const broadcastRoom = (room) => {
    const players = rooms.snapshot(room);
    const mission = publicMission(room);
    for (const [member, player] of room.players) {
      send(member, { t: 'room', code: room.code, you: player.id, max_players: MAX_PLAYERS, players, stage: room.stage, map: mapOf(room.stage), world: MAPS[mapOf(room.stage)], spots: SPOTS, mission });
    }
  };
  const missionContext = (room, ws) => ({
    rng,
    now: Date.now(),
    features: features(),
    playerIds: [...room.players.values()].map((p) => p.id),
    nickname: ws && room.players.get(ws) ? room.players.get(ws).nickname : '',
    pos: ws && room.players.get(ws) ? { x: room.players.get(ws).x, y: room.players.get(ws).y } : null,
  });
  const removeFromRoom = (ws) => {
    const room = rooms.leave(ws);
    if (room && room.players.size > 0) {
      playerLeft(room, missionContext(room, null));
      broadcastRoom(room);
    }
    return room;
  };

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.stamps = [];
    ws.moves = [];
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {});
    ws.on('close', () => removeFromRoom(ws));
    ws.on('message', (data, isBinary) => {
      const now = Date.now();
      if (isBinary) return sendError(ws, 'bad_request');
      let msg;
      try {
        msg = JSON.parse(data.toString('utf8'));
      } catch {
        msg = null;
      }
      const isMove = !!msg && msg.t === 'pos';
      const bucket = isMove ? 'moves' : 'stamps';
      ws[bucket] = ws[bucket].filter((t) => now - t < RATE_WINDOW_MS);
      ws[bucket].push(now);
      if (ws[bucket].length > (isMove ? RATE_MAX_MOVES : RATE_MAX_MESSAGES)) return ws.close(1008, 'rate limit');
      if (msg === null) return sendError(ws, 'bad_request');
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') {
        return sendError(ws, 'bad_request');
      }
      handle(ws, msg);
    });
    send(ws, { t: 'hello', v: PROTOCOL_VERSION, max_players: MAX_PLAYERS });
  });

  function handle(ws, msg) {
    switch (msg.t) {
      case 'ping':
        return send(ws, { t: 'pong' });
      case 'pos': {
        // Where this player is standing. Kept inside the map; sent on to the room in batches.
        const room = rooms.roomOf(ws);
        if (!room || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return undefined;
        const player = room.players.get(ws);
        const at = clampToMap(mapOf(room.stage), msg.x, msg.y);
        player.x = Math.round(at.x);
        player.y = Math.round(at.y);
        room.moved = true;
        return undefined;
      }
      case 'create':
      case 'join': {
        const on = features();
        const allowed = on.lan_networking && (msg.t === 'create' ? on.room_creation : on.room_code_joining);
        if (!allowed) return sendError(ws, 'feature_off');
        const nickname = cleanNickname(msg.nickname);
        if (nickname === null) return sendError(ws, 'bad_nickname');
        if (!isColor(msg.color)) return sendError(ws, 'bad_color');
        let result;
        if (msg.t === 'create') {
          result = rooms.create(ws, nickname, msg.color);
        } else {
          const code = cleanCode(msg.code);
          if (code === null) return sendError(ws, 'bad_code');
          result = rooms.join(ws, code, nickname, msg.color);
        }
        if (!result.ok) return sendError(ws, result.error);
        log(`${msg.t === 'create' ? 'Room opened' : 'Player joined'}: ${result.room.code} (${result.room.players.size}/${MAX_PLAYERS})`);
        return broadcastRoom(result.room);
      }
      case 'leave': {
        const room = removeFromRoom(ws);
        if (!room) return sendError(ws, 'not_in_room');
        return send(ws, { t: 'left' });
      }
      default: {
        if (!ACTION_TYPES.includes(msg.t)) return sendError(ws, 'bad_request');
        const room = rooms.roomOf(ws);
        if (!room) return sendError(ws, 'not_in_room');
        const mapBefore = mapOf(room.stage);
        const result = act(room, room.players.get(ws).id, msg, missionContext(room, ws));
        if (!result.ok) return sendError(ws, result.error);
        if (mapOf(room.stage) !== mapBefore || (msg.t === 'again')) {
          // New place (Earth <-> ship): everyone starts at that map's arrival point.
          for (const p of room.players.values()) Object.assign(p, spawnPoint(mapOf(room.stage), p.slot));
        }
        if (result.event) {
          for (const member of room.players.keys()) send(member, { t: 'event', ...result.event });
        }
        return broadcastRoom(room);
      }
    }
  }

  const positions = setInterval(() => {
    for (const room of rooms.rooms.values()) {
      if (!room.moved) continue;
      room.moved = false;
      const p = [...room.players.values()].map((pl) => [pl.id, pl.x, pl.y]);
      for (const member of room.players.keys()) send(member, { t: 'pos', p });
    }
  }, POSITION_BROADCAST_MS);

  // Heartbeat: a connection that does not answer a ping by the next round is dropped,
  // which removes that player from their room for everyone.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatMs);

  const runtime = {
    server,
    rooms,
    webDir,
    close: () => new Promise((done) => {
      clearInterval(heartbeat);
      clearInterval(positions);
      for (const ws of wss.clients) ws.terminate();
      wss.close(() => {
        if (server.listening) server.close(() => done());
        else done();
      });
      server.closeAllConnections?.();
    }),
  };
  if (!listen) return runtime;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve({ ...runtime, port: server.address().port }));
  });
}

function serveStatic(req, res, webDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  if (!webDir) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Game files were not found next to the host.');
    return;
  }
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(webDir, '.' + rel);
  if (rel.includes('\0') || (file !== webDir && !file.startsWith(webDir + path.sep))) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      // Always re-check, so an edited config or a new build shows up on refresh.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

// ---- run directly: node server.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const portArg = args.indexOf('--port');
  const port = Number(portArg !== -1 ? args[portArg + 1] : process.env.PORT) || 8080;
  const localOnly = args.includes('--local-only');
  const webDir = findWebDir();
  if (!webDir) {
    console.error('Could not find the game files (a "web" folder with index.html next to the "host" folder).');
    process.exit(1);
  }
  startServer({ port, host: localOnly ? '127.0.0.1' : '0.0.0.0', webDir, log: (line) => console.log(line) })
    .then(({ port: actual }) => {
      console.log('');
      console.log('HELIX: Orbital Recovery - LAN host is running.');
      console.log('');
      console.log(`  On this computer:   http://localhost:${actual}`);
      const addresses = localOnly ? [] : lanAddresses();
      for (const ip of addresses) console.log(`  Other players open: http://${ip}:${actual}`);
      if (localOnly) console.log('  Local-only mode: other devices cannot connect.');
      else if (addresses.length === 0) console.log('  No Wi-Fi/LAN address found. Connect this computer to your network and restart.');
      console.log('');
      console.log('  Everyone must be on the same Wi-Fi. Rooms are temporary and are lost when this window closes.');
      console.log('  Do not set up router port-forwarding for this host. Press Ctrl+C to stop.');
      console.log('');
    })
    .catch((err) => {
      if (err && err.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Try: node server.mjs --port ${port + 1}`);
      else console.error('The host could not start:', err && err.message);
      process.exit(1);
    });
}
