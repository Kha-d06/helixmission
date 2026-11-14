// Reads the same config/game_features.json the game reads, so the host refuses
// what a switch turns off. Mirrors scripts/feature_rules.gd.
import fs from 'node:fs';

export const MAX_BYTES = 16384;

export const DEFAULTS = Object.freeze({
  player_setup_screen: true,
  nickname_editing: true,
  suit_color_selection: true,
  local_profile_saving: true,
  astro_helper: true,
  sound_effects: true,
  touch_controls: true,
  lan_networking: true,
  room_creation: true,
  room_code_joining: true,
  room_code_display: true,
  connected_player_count: true,
  connected_player_avatars: true,
  earth_sky: true,
  grass_ground: true,
  mission_planning: true,
  earth_quest: true,
  launch_sequence: true,
  flight_tasks: true,
  cockpit_status_states: true,
  power_balancing: true,
  steering_questions: true,
  drone_recovery: true,
  mission_report: true,
});

/** Always returns a complete set of booleans. */
export function parseFeatures(text) {
  const out = { ...DEFAULTS };
  if (typeof text !== 'string' || text.length > MAX_BYTES) return out;
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return out;
  }
  const raw = data && typeof data === 'object' && !Array.isArray(data) ? data.features : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  return out;
}

export function loadFeatures(file) {
  try {
    if (fs.statSync(file).size > MAX_BYTES) return { ...DEFAULTS };
    return parseFeatures(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ...DEFAULTS };
  }
}
