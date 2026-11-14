// Authoritative mission rules. The host owns every shared value (plan, credits, crates,
// tasks, steering answers) so players can never disagree about what happened.
// Pure logic: randomness and time are passed in, which keeps the tests deterministic.

export const STAGES = ['lobby', 'plan', 'earth', 'launch', 'flight', 'drone', 'report'];

// Which feature switch allows each stage. A stage whose switch is off is skipped.
export const STAGE_SWITCH = {
  plan: 'mission_planning',
  earth: 'earth_quest',
  launch: 'launch_sequence',
  flight: 'flight_tasks',
  drone: 'drone_recovery',
  report: 'mission_report',
};

export const LIMITS = { mass: 200, budget: 120 };
export const START_CREDITS = 120;
export const LAUNCH_FEE = 100;
export const REWARD_FIND_TANK = 60;
export const REWARD_ATTACH_TANK = 40;
export const CRATE_COUNT = 5;
export const APPROACH_STEPS = 3;
export const WIRE_COLORS = ['cyan', 'emerald', 'orange', 'violet'];
export const COMMS_CHANNELS = 9;
export const POWER_NEEDS = Object.freeze({ navigation: 10, communications: 12, life_support: 18, repair: 15 });

// ---- The 2D world. Players walk around; the host knows where everything is and checks
// that a player is close enough before an action counts.
export const MAPS = { earth: { w: 2400, h: 1350, top: 330 }, ship: { w: 1600, h: 900, top: 210 } };
export const REACH = 190;
export const SPOTS = {
  console: { x: 1560, y: 800 },
  table: { x: 620, y: 720 },
  rocket: { x: 1900, y: 700 },
  bay: { x: 1400, y: 520 },
  power: { x: 260, y: 760 },
};
// Places a crate can be. Five are picked at random for each mission.
export const CRATE_SPOTS = [
  { x: 240, y: 470 }, { x: 420, y: 1200 }, { x: 980, y: 450 }, { x: 1100, y: 1180 }, { x: 1500, y: 1240 },
  { x: 2200, y: 1180 }, { x: 2250, y: 470 }, { x: 160, y: 900 }, { x: 860, y: 1010 }, { x: 1330, y: 460 },
];
export const TERMINAL_SPOTS = [
  { x: 260, y: 330 }, { x: 260, y: 760 }, { x: 640, y: 280 }, { x: 700, y: 800 }, { x: 1040, y: 290 }, { x: 1080, y: 790 },
];

export function mapOf(stage) {
  return stage === 'flight' || stage === 'drone' ? 'ship' : 'earth';
}

export function spawnPoint(map, slot) {
  return map === 'ship' ? { x: 560 + slot * 90, y: 540 } : { x: 1300 + slot * 90, y: 940 };
}

export function clampToMap(map, x, y) {
  const m = MAPS[map];
  return { x: Math.min(m.w - 40, Math.max(40, x)), y: Math.min(m.h - 30, Math.max(m.top, y)) };
}

function near(ctx, spot) {
  return !!ctx.pos && !!spot && Math.hypot(ctx.pos.x - spot.x, ctx.pos.y - spot.y) <= REACH;
}

// Every option trades one resource for another. Numbers are game values, not real hardware.
export const PLAN_OPTIONS = {
  drone: {
    light: { mass: 40, cost: 30, power: 20, towSteps: 4 },
    strong: { mass: 80, cost: 50, power: 40, towSteps: 2 },
  },
  antenna: {
    small: { mass: 10, cost: 10, power: 10, data: 1, commsTasks: 2 },
    large: { mass: 30, cost: 30, power: 25, data: 3, commsTasks: 1 },
  },
  solar: {
    small: { mass: 15, cost: 15, supply: 60 },
    large: { mass: 35, cost: 30, supply: 100 },
  },
  fuel: {
    standard: { mass: 60, cost: 20, courseSteps: 5 },
    extra: { mass: 95, cost: 35, courseSteps: 3 },
  },
};

export const DEFAULT_PLAN = { drone: 'light', antenna: 'small', solar: 'small', fuel: 'standard' };

export function planSummary(plan) {
  const d = PLAN_OPTIONS.drone[plan.drone];
  const a = PLAN_OPTIONS.antenna[plan.antenna];
  const s = PLAN_OPTIONS.solar[plan.solar];
  const f = PLAN_OPTIONS.fuel[plan.fuel];
  const mass = d.mass + a.mass + s.mass + f.mass;
  const cost = d.cost + a.cost + s.cost + f.cost;
  const powerUse = d.power + a.power;
  const out = {
    mass, cost, power_use: powerUse, power_supply: s.supply, data: a.data,
    comms_tasks: a.commsTasks, time: f.courseSteps + APPROACH_STEPS + d.towSteps,
    mass_ok: mass <= LIMITS.mass, budget_ok: cost <= LIMITS.budget, power_ok: powerUse <= s.supply,
  };
  out.ready = out.mass_ok && out.budget_ok && out.power_ok;
  return out;
}

function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let questionSeq = 1;

export function newQuestion(rng) {
  const minus = rng(2) === 1;
  let a = 2 + rng(19);
  let b = 2 + rng(19);
  if (minus && b > a) [a, b] = [b, a];
  const answer = minus ? a - b : a + b;
  const choices = new Set([answer]);
  for (const delta of shuffled([1, -1, 2, -2, 10, -10, 3], rng)) {
    if (choices.size >= 4) break;
    if (answer + delta >= 0) choices.add(answer + delta);
  }
  return { id: questionSeq++, a, b, op: minus ? '-' : '+', answer, choices: shuffled([...choices], rng) };
}

function newTasks(kinds, rng) {
  const spots = shuffled(TERMINAL_SPOTS, rng);
  return kinds.map((kind, i) => {
    const task = { id: i + 1, kind, done: false, by: null, x: spots[i % spots.length].x, y: spots[i % spots.length].y };
    if (kind === 'wires') {
      let right = shuffled(WIRE_COLORS, rng);
      if (right.every((c, k) => c === WIRE_COLORS[k])) right = [...right.slice(1), right[0]];
      task.right = right;
    } else {
      task.target = 1 + rng(COMMS_CHANNELS);
    }
    return task;
  });
}

function taskSolved(task, answer) {
  if (task.kind === 'wires') {
    return Array.isArray(answer) && answer.length === WIRE_COLORS.length &&
      answer.every((v, i) => Number.isInteger(v) && task.right[v] === WIRE_COLORS[i]);
  }
  return Number.isInteger(answer) && answer === task.target;
}

function enter(room, stage, ctx) {
  const m = room.mission;
  room.stage = stage;
  const on = ctx.features;
  switch (stage) {
    case 'lobby':
      room.mission = null;
      break;
    case 'plan':
      break;
    case 'earth':
      m.earth = {
        opened: Array(CRATE_COUNT).fill(false), tankAt: ctx.rng(CRATE_COUNT), tank: 'hidden', carrier: null,
        spots: shuffled(CRATE_SPOTS, ctx.rng).slice(0, CRATE_COUNT),
      };
      break;
    case 'launch':
      m.launch = { ready: [] };
      break;
    case 'flight': {
      const s = planSummary(m.plan);
      const goal = on.steering_questions ? 1 : 0;
      m.flight = {
        tasks: newTasks(['wires', 'wires', ...Array(s.comms_tasks).fill('comms')], ctx.rng),
        course: 0, goal, question: goal > 0 ? newQuestion(ctx.rng) : null,
        power: on.power_balancing ? { available: s.power_supply, needs: POWER_NEEDS, allocation: {}, status: 'unbalanced' } : null,
      };
      break;
    }
    case 'drone':
      m.drone = {
        tasks: newTasks(['wires', 'comms'], ctx.rng), phase: 'prep', steps: 0,
        approachGoal: 0,
        towGoal: 0,
        question: null,
      };
      break;
    case 'report':
      m.stats.ended = ctx.now;
      break;
    default:
      break;
  }
}

/** Moves to the next stage whose switch is on (after `from`). */
function advance(room, ctx) {
  let i = STAGES.indexOf(room.stage) + 1;
  while (i < STAGES.length && !ctx.features[STAGE_SWITCH[STAGES[i]]]) {
    // A skipped stage still has to leave the mission in a sensible state.
    const skipped = STAGES[i];
    if (skipped === 'plan') { /* default plan stays */ }
    if (skipped === 'earth') room.mission.credits += REWARD_FIND_TANK + REWARD_ATTACH_TANK;
    if (skipped === 'launch') room.mission.credits -= LAUNCH_FEE;
    i += 1;
  }
  if (room.stage === 'lobby' || room.stage === 'plan') {
    // Hardware is paid for once planning is over (or skipped).
    const past = STAGES.indexOf('plan');
    if (i > past && !room.mission.paid) {
      room.mission.credits -= planSummary(room.mission.plan).cost;
      room.mission.paid = true;
    }
  }
  if (i >= STAGES.length) enter(room, 'lobby', ctx);
  else enter(room, STAGES[i], ctx);
  if (room.mission && room.mission.stats.started === 0 && ['flight', 'drone', 'report'].includes(room.stage)) {
    room.mission.stats.started = ctx.now;
  }
}

function checkLaunch(room, ctx, playerIds) {
  const ready = room.mission.launch.ready.filter((id) => playerIds.includes(id));
  room.mission.launch.ready = ready;
  if (playerIds.length > 0 && ready.length === playerIds.length) {
    room.mission.credits -= LAUNCH_FEE;
    advance(room, ctx);
    return true;
  }
  return false;
}

function flightDone(f) {
  return f.tasks.every((t) => t.done) && f.course >= f.goal && (!f.power || f.power.status === 'balanced');
}

function validPowerAllocation(power, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const keys = Object.keys(POWER_NEEDS);
  if (Object.keys(raw).some((key) => !keys.includes(key))) return false;
  const allocation = {};
  let total = 0;
  for (const key of keys) {
    const value = raw[key];
    if (!Number.isInteger(value) || value < POWER_NEEDS[key]) return false;
    allocation[key] = value;
    total += value;
  }
  return total <= power.available ? allocation : false;
}

/**
 * Applies one player action. Returns { ok: true, event? } or { ok: false, error }.
 * ctx = { rng(n) -> 0..n-1, now (ms), features, playerIds, nickname }.
 */
export function act(room, playerId, msg, ctx) {
  const m = room.mission;
  const fail = (error = 'not_now') => ({ ok: false, error });
  switch (msg.t) {
    case 'start': {
      if (room.stage !== 'lobby') return fail();
      if (!near(ctx, SPOTS.console)) return fail('too_far');
      room.mission = {
        plan: { ...DEFAULT_PLAN }, credits: START_CREDITS, paid: false,
        earth: null, launch: null, flight: null, drone: null,
        stats: { tasks: 0, right: 0, wrong: 0, power_wrong: 0, started: 0, ended: 0 },
      };
      advance(room, ctx);
      return { ok: true };
    }
    case 'plan_set': {
      if (room.stage !== 'plan') return fail();
      if (!near(ctx, SPOTS.table)) return fail('too_far');
      const options = Object.hasOwn(PLAN_OPTIONS, msg.key) ? PLAN_OPTIONS[msg.key] : null;
      if (!options || typeof msg.value !== 'string' || !Object.hasOwn(options, msg.value)) return fail('bad_request');
      m.plan[msg.key] = msg.value;
      return { ok: true };
    }
    case 'plan_confirm': {
      if (room.stage !== 'plan') return fail();
      if (!near(ctx, SPOTS.table)) return fail('too_far');
      if (!planSummary(m.plan).ready) return fail('not_ready');
      advance(room, ctx);
      return { ok: true };
    }
    case 'open_crate': {
      if (room.stage !== 'earth') return fail();
      const i = msg.i;
      if (!Number.isInteger(i) || i < 0 || i >= CRATE_COUNT) return fail('bad_request');
      if (m.earth.opened[i] || m.earth.tank !== 'hidden') return fail();
      if (!near(ctx, m.earth.spots[i])) return fail('too_far');
      m.earth.opened[i] = true;
      if (i === m.earth.tankAt) {
        m.earth.tank = 'found';
        m.credits += REWARD_FIND_TANK;
        return { ok: true, event: { kind: 'tank_found', by: ctx.nickname } };
      }
      return { ok: true, event: { kind: 'crate_empty', by: ctx.nickname } };
    }
    case 'pickup': {
      if (room.stage !== 'earth' || m.earth.tank !== 'found') return fail();
      if (!near(ctx, m.earth.spots[m.earth.tankAt])) return fail('too_far');
      m.earth.tank = 'carried';
      m.earth.carrier = playerId;
      return { ok: true, event: { kind: 'tank_picked', by: ctx.nickname } };
    }
    case 'attach_tank': {
      if (room.stage !== 'earth' || m.earth.tank !== 'carried' || m.earth.carrier !== playerId) return fail();
      if (!near(ctx, SPOTS.rocket)) return fail('too_far');
      m.earth.tank = 'attached';
      m.earth.carrier = null;
      m.credits += REWARD_ATTACH_TANK;
      advance(room, ctx);
      return { ok: true, event: { kind: 'tank_attached', by: ctx.nickname } };
    }
    case 'ready': {
      if (room.stage !== 'launch') return fail();
      if (!near(ctx, SPOTS.rocket)) return fail('too_far');
      if (!m.launch.ready.includes(playerId)) m.launch.ready.push(playerId);
      const launched = checkLaunch(room, ctx, ctx.playerIds);
      return launched ? { ok: true, event: { kind: 'liftoff' } } : { ok: true };
    }
    case 'task': {
      const part = room.stage === 'flight' ? m.flight : room.stage === 'drone' && m.drone.phase === 'prep' ? m.drone : null;
      if (!part) return fail();
      const task = part.tasks.find((t) => t.id === msg.id);
      if (!task || task.done) return fail('bad_request');
      if (!near(ctx, task)) return fail('too_far');
      if (!taskSolved(task, msg.answer)) return { ok: true, event: { kind: 'task_wrong', by: ctx.nickname } };
      task.done = true;
      task.by = ctx.nickname;
      m.stats.tasks += 1;
      if (room.stage === 'flight') {
        if (flightDone(m.flight)) advance(room, ctx);
      } else if (part.tasks.every((t) => t.done)) {
        part.phase = 'ready';
      }
      return { ok: true, event: { kind: 'task_done', by: ctx.nickname } };
    }
    case 'power_set': {
      if (room.stage !== 'flight' || !m.flight.power) return fail();
      if (!near(ctx, SPOTS.power)) return fail('too_far');
      const allocation = validPowerAllocation(m.flight.power, msg.allocation);
      if (!allocation) {
        m.stats.power_wrong += 1;
        return { ok: true, event: { kind: 'power_wrong', by: ctx.nickname } };
      }
      m.flight.power.allocation = allocation;
      m.flight.power.status = 'balanced';
      if (flightDone(m.flight)) advance(room, ctx);
      return { ok: true, event: { kind: 'power_balanced', by: ctx.nickname } };
    }
    case 'answer': {
      const part = room.stage === 'flight' ? m.flight : room.stage === 'drone' ? m.drone : null;
      if (!part || !part.question) return fail();
      if (!Number.isInteger(msg.value) || msg.id !== part.question.id) return fail('bad_request');
      if (msg.value !== part.question.answer) {
        m.stats.wrong += 1;
        return { ok: true, event: { kind: 'answer_wrong', by: ctx.nickname } };
      }
      m.stats.right += 1;
      if (room.stage === 'flight') {
        part.course += 1;
        part.question = part.course < part.goal ? newQuestion(ctx.rng) : null;
        if (flightDone(part)) advance(room, ctx);
      } else {
        part.steps += 1;
        if (part.phase === 'approach') {
          if (part.steps >= part.approachGoal) { part.phase = 'at_debris'; part.question = null; } else part.question = newQuestion(ctx.rng);
        } else if (part.steps >= part.towGoal) {
          part.phase = 'home';
          part.question = null;
          advance(room, ctx);
        } else {
          part.question = newQuestion(ctx.rng);
        }
      }
      return { ok: true, event: { kind: 'answer_right', by: ctx.nickname } };
    }
    case 'release': {
      if (room.stage !== 'drone' || m.drone.phase !== 'ready') return fail();
      if (!near(ctx, SPOTS.bay)) return fail('too_far');
      m.drone.steps = 0;
      if (m.drone.approachGoal > 0) { m.drone.phase = 'approach'; m.drone.question = newQuestion(ctx.rng); } else m.drone.phase = 'at_debris';
      return { ok: true, event: { kind: 'drone_released', by: ctx.nickname } };
    }
    case 'grab': {
      if (room.stage !== 'drone' || m.drone.phase !== 'at_debris') return fail();
      if (!near(ctx, SPOTS.bay)) return fail('too_far');
      m.drone.steps = 0;
      if (m.drone.towGoal > 0) { m.drone.phase = 'tow'; m.drone.question = newQuestion(ctx.rng); } else { m.drone.phase = 'home'; advance(room, ctx); }
      return { ok: true, event: { kind: 'debris_grabbed', by: ctx.nickname } };
    }
    case 'again': {
      if (room.stage !== 'report') return fail();
      enter(room, 'lobby', ctx);
      return { ok: true };
    }
    default:
      return fail('bad_request');
  }
}

/** Call when someone leaves, so a launch is not stuck waiting for them. */
export function playerLeft(room, ctx) {
  const earth = room.mission && room.mission.earth;
  if (room.stage === 'earth' && earth && earth.tank === 'carried' && !ctx.playerIds.includes(earth.carrier)) {
    earth.tank = 'found'; // the tank goes back to where it was found
    earth.carrier = null;
  }
  if (room.stage === 'launch' && room.mission) return checkLaunch(room, ctx, ctx.playerIds);
  return false;
}

export const ACTION_TYPES = ['start', 'plan_set', 'plan_confirm', 'open_crate', 'pickup', 'attach_tank', 'ready', 'task', 'power_set', 'answer', 'release', 'grab', 'again'];

/** What clients are allowed to see: no hidden tank position, no steering answers. */
export function publicMission(room) {
  const m = room.mission;
  if (!m) return null;
  const q = (question) => (question ? { id: question.id, a: question.a, b: question.b, op: question.op, choices: question.choices } : null);
  const out = { plan: m.plan, summary: planSummary(m.plan), limits: LIMITS, credits: m.credits, launch_fee: LAUNCH_FEE, stats: m.stats };
  if (room.stage === 'plan') out.options = PLAN_OPTIONS;
  if (m.earth) {
    out.earth = {
      tank: m.earth.tank, carrier: m.earth.carrier, spots: m.earth.spots,
      crates: m.earth.opened.map((open, i) => (!open ? 'closed' : i === m.earth.tankAt ? 'tank' : 'empty')),
    };
  }
  if (m.launch) out.launch = { ready: m.launch.ready };
  if (m.flight) out.flight = { tasks: m.flight.tasks, course: m.flight.course, goal: m.flight.goal, question: q(m.flight.question), power: m.flight.power };
  if (m.drone) {
    out.drone = {
      tasks: m.drone.tasks, phase: m.drone.phase, steps: m.drone.steps,
      approach_goal: m.drone.approachGoal, tow_goal: m.drone.towGoal, question: q(m.drone.question),
    };
  }
  if (room.stage === 'report') {
    const wrong = m.stats.wrong;
    const powerWrong = m.stats.power_wrong || 0;
    const cleanRun = wrong === 0 && powerWrong === 0;
    const powerSafe = !m.flight || !m.flight.power || m.flight.power.status === 'balanced';
    const carefulCrew = wrong <= 2 && powerWrong === 0;
    out.report = {
      seconds: Math.max(0, Math.round((m.stats.ended - m.stats.started) / 1000)),
      stars: cleanRun ? 3 : wrong + powerWrong <= 3 ? 2 : 1,
      objectives: { clean_run: cleanRun, power_safe: powerSafe, careful_crew: carefulCrew },
    };
  }
  return out;
}
