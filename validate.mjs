// Input rules. These mirror scripts/profile_rules.gd and scripts/lobby_rules.gd in the game;
// test/rules.test.mjs checks that the two sides agree.

export const NICK_MIN = 3;
export const NICK_MAX = 12;
export const COLOR_IDS = ['white', 'cyan', 'emerald', 'orange', 'violet', 'yellow'];
export const CODE_LEN = 6;
// No 0/O or 1/I, so codes are easy to read aloud.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const NICK_RE = /^[A-Za-z0-9 _-]+$/;

/** Returns the cleaned nickname, or null when it is not allowed. */
export function cleanNickname(raw) {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const s = raw.trim().replace(/ {2,}/g, ' ');
  if (s.length < NICK_MIN || s.length > NICK_MAX || !NICK_RE.test(s)) return null;
  return s;
}

export function isColor(id) {
  return typeof id === 'string' && COLOR_IDS.includes(id);
}

/** Returns the room code in canonical form, or null when it is not a valid code. */
export function cleanCode(raw) {
  if (typeof raw !== 'string' || raw.length > 16) return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_LEN) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}
