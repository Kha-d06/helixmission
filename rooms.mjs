// Authoritative room state. No sockets here: a "member" is any object used as a key.
// Rooms live in memory only and vanish when the host stops.
import crypto from 'node:crypto';
import { CODE_ALPHABET, CODE_LEN } from './validate.mjs';
import { mapOf, spawnPoint } from './mission.mjs';

export class RoomManager {
  constructor({ maxPlayers = 4, maxRooms = 16, randomInt = crypto.randomInt } = {}) {
    this.maxPlayers = maxPlayers;
    this.maxRooms = maxRooms;
    this.randomInt = randomInt;
    this.rooms = new Map();      // code -> room
    this.memberRoom = new Map(); // member -> room
    this.nextId = 1;
  }

  roomOf(member) {
    return this.memberRoom.get(member) || null;
  }

  create(member, nickname, color) {
    if (this.memberRoom.has(member)) return { ok: false, error: 'already_in_room' };
    if (this.rooms.size >= this.maxRooms) return { ok: false, error: 'server_full' };
    const room = { code: this.#newCode(), players: new Map(), stage: 'lobby', mission: null };
    this.rooms.set(room.code, room);
    this.#seat(room, member, nickname, color);
    return { ok: true, room };
  }

  join(member, code, nickname, color) {
    if (this.memberRoom.has(member)) return { ok: false, error: 'already_in_room' };
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'room_not_found' };
    if (room.players.size >= this.maxPlayers) return { ok: false, error: 'room_full' };
    const wanted = nickname.toLowerCase();
    for (const p of room.players.values()) {
      if (p.nickname.toLowerCase() === wanted) return { ok: false, error: 'name_taken' };
    }
    this.#seat(room, member, nickname, color);
    return { ok: true, room };
  }

  /** Removes the member. Returns the room they were in (already deleted if now empty), or null. */
  leave(member) {
    const room = this.memberRoom.get(member);
    if (!room) return null;
    room.players.delete(member);
    this.memberRoom.delete(member);
    if (room.players.size === 0) this.rooms.delete(room.code);
    return room;
  }

  /** Plain data safe to send to clients. */
  snapshot(room) {
    return [...room.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({ id: p.id, nickname: p.nickname, color: p.color, slot: p.slot, x: p.x, y: p.y }));
  }

  #seat(room, member, nickname, color) {
    const used = new Set([...room.players.values()].map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot += 1;
    const at = spawnPoint(mapOf(room.stage), slot);
    room.players.set(member, { id: this.nextId++, nickname, color, slot, x: at.x, y: at.y });
    this.memberRoom.set(member, room);
  }

  #newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LEN; i += 1) code += CODE_ALPHABET[this.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}
