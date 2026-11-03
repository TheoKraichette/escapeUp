// END-TO-END runner (TEST ONLY): drives the real HTTP API and verifies anti-leak.
// It regenerates the SAME room locally with generateRoom to compute the exact
// action trace (the server never receives the solution — only Actions).

import {
  generateRoom,
  createInitialState,
  applyAction,
  validateRoom,
  type Action,
  type Affordance,
  type GenerationConfig,
  type PlayerState,
  type PuzzleInstance,
  type RoomSpec,
  type GameEvent,
} from '@escapeup/engine';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:3000';

interface Problem {
  msg: string;
}
const problems: Problem[] = [];
function fail(msg: string): void {
  problems.push({ msg });
  console.log('PROBLEM: ' + msg);
}

// ————————————————————————— HTTP helpers —————————————————————————

interface HttpResult {
  status: number;
  json: unknown;
  raw: string;
}
async function http(method: string, path: string, body?: unknown): Promise<HttpResult> {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json: unknown = undefined;
  try {
    json = raw.length ? JSON.parse(raw) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, json, raw };
}

// ————————————————————————— Local solver → Action[] —————————————————————————

function carrierOf(room: RoomSpec, nodeId: string): string | undefined {
  return room.graph.nodes.find((n) => n.id === nodeId)?.carrier;
}

function actionForPuzzle(room: RoomSpec, p: PuzzleInstance): Action | undefined {
  const sol = p.solution;
  switch (sol.kind) {
    case 'code':
      return { type: 'enter_code', objectId: p.mechanismObjectId, code: sol.value };
    case 'sequence':
      return { type: 'enter_sequence', objectId: p.mechanismObjectId, steps: sol.steps };
    case 'combine': {
      const carriers = sol.itemNodeIds
        .map((n) => carrierOf(room, n))
        .filter((c): c is string => Boolean(c));
      return { type: 'combine', objectIds: carriers };
    }
    case 'key': {
      const tool = carrierOf(room, sol.itemNodeId);
      if (!tool) return undefined;
      return { type: 'use_on', toolObjectId: tool, targetObjectId: p.mechanismObjectId };
    }
    case 'use_on': {
      const tool = carrierOf(room, sol.toolNodeId);
      if (!tool) return undefined;
      return { type: 'use_on', toolObjectId: tool, targetObjectId: sol.targetObjectId };
    }
  }
}

function snapshot(s: PlayerState): string {
  return JSON.stringify([
    [...s.acquired].sort(),
    [...s.solvedPuzzles].sort(),
    Object.entries(s.objectStates).sort(),
  ]);
}

/** Simulate a perfect player locally to produce an ordered Action[] that reaches goal. */
function planActions(room: RoomSpec): { actions: Action[]; reachedGoal: boolean } {
  let state = createInitialState(room);
  const actions: Action[] = [];
  const goalId = room.graph.goalId;
  const harvestAffs: Affordance[] = ['inspect', 'read', 'take'];
  const maxPasses = room.puzzles.length + room.objects.length + 12;

  let pass = 0;
  let progressed = true;
  while (progressed && !state.acquired.includes(goalId) && pass < maxPasses) {
    pass++;
    progressed = false;

    // Harvest reveals (inspect/read/take) to fixpoint across passes.
    for (const obj of room.objects) {
      for (const aff of harvestAffs) {
        if (!obj.affordances.includes(aff)) continue;
        const action = { type: aff, objectId: obj.id } as Action;
        const before = snapshot(state);
        const { state: next } = applyAction(room, state, action);
        if (snapshot(next) !== before) {
          actions.push(action);
          state = next;
          progressed = true;
        }
      }
    }

    // Solve every puzzle whose inputs are satisfied.
    for (const p of room.puzzles) {
      if (state.solvedPuzzles.includes(p.id)) continue;
      if (!p.inputs.every((n) => state.acquired.includes(n))) continue;
      const action = actionForPuzzle(room, p);
      if (!action) continue;
      const before = snapshot(state);
      const { state: next } = applyAction(room, state, action);
      if (next.solvedPuzzles.includes(p.id) && snapshot(next) !== before) {
        actions.push(action);
        state = next;
        progressed = true;
      }
    }
  }

  return { actions, reachedGoal: state.acquired.includes(goalId) };
}

// ————————————————————————— Anti-leak —————————————————————————

const FORBIDDEN_KEYS = [
  'solution',
  'graph',
  'derivation',
  'reveals',
  'requires',
  'narrativeFragment',
  'hints',
  'metrics',
  'backstory',
];

function deepFindForbiddenKeys(value: unknown): string[] {
  const found: string[] = [];
  const stack: unknown[] = [value];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.includes(k)) found.push(k);
      stack.push(v);
    }
  }
  return found;
}

interface Secrets {
  backstory: string;
  codeValues: string[];
  sequenceOrders: string[][];
  revealTexts: string[];
}
function extractSecrets(room: RoomSpec): Secrets {
  const codeValues: string[] = [];
  const sequenceOrders: string[][] = [];
  for (const p of room.puzzles) {
    if (p.solution.kind === 'code') codeValues.push(p.solution.value);
    if (p.solution.kind === 'sequence') sequenceOrders.push(p.solution.steps);
  }
  const revealTexts: string[] = [];
  for (const o of room.objects) for (const r of o.reveals) if (r.text.trim()) revealTexts.push(r.text);
  return { backstory: room.narrative.backstory, codeValues, sequenceOrders, revealTexts };
}

/**
 * Check one HTTP response for leaks.
 * @param discoveredTexts reveal texts the player has legitimately discovered so far
 *        (allowed to appear in notebook); everything else must NOT appear.
 */
function checkLeak(label: string, res: HttpResult, secrets: Secrets, discoveredTexts: Set<string>): void {
  const keys = deepFindForbiddenKeys(res.json);
  if (keys.length) fail(`${label}: forbidden keys leaked over the wire: ${[...new Set(keys)].join(', ')}`);

  const raw = res.raw;

  // Backstory must never cross the wire.
  if (secrets.backstory.trim() && raw.includes(secrets.backstory)) {
    fail(`${label}: narrative.backstory leaked in response`);
  }

  // Sequence solution ORDER must not appear as the literal ordered steps array.
  // NOTE: controls.options (the button set, as {id,label} objects) is PUBLIC by
  // design (engine antileak.audit contract) — the option array order is an
  // INDEPENDENT shuffle from the solution, so it carries no answer info. The only
  // real secret is the literal ordered steps array; that is what we assert absent.
  for (const order of secrets.sequenceOrders) {
    if (raw.includes(JSON.stringify(order))) {
      fail(`${label}: sequence solution steps ${JSON.stringify(order)} appear as JSON substring`);
    }
  }

  // Undiscovered reveal texts must not appear.
  for (const t of secrets.revealTexts) {
    if (discoveredTexts.has(t)) continue;
    if (raw.includes(t)) fail(`${label}: undiscovered reveal text leaked: "${t.slice(0, 60)}..."`);
  }

  // Code solution.value must never cross the wire, EXCEPT inside a reveal text the
  // player has legitimately discovered (the clue that lets them deduce it).
  const discoveredBlob = [...discoveredTexts].join('');
  for (const v of secrets.codeValues) {
    if (!raw.includes(v)) continue;
    if (discoveredBlob.includes(v)) continue; // appears only within an earned clue
    fail(`${label}: code solution.value "${v}" leaked over the wire (not via a discovered clue)`);
  }
}

// ————————————————————————— Runner —————————————————————————

function collectDiscoveredTexts(events: GameEvent[], acc: Set<string>): void {
  for (const e of events) {
    if (e.type === 'text' || e.type === 'info_gained') acc.add(e.text);
  }
}

async function main(): Promise<void> {
  const seed = process.env.E2E_SEED ?? 'E2E-EASY-1';
  const difficulty = (process.env.E2E_DIFF ?? 'easy') as GenerationConfig['difficulty'];
  const config: GenerationConfig = { difficulty };

  // Local room (mirror of what the server derives). Not sent over the wire.
  const room = generateRoom(seed, config);
  const validation = validateRoom(room);
  console.log(
    `Local room seed=${seed} theme=${room.theme} puzzles=${room.puzzles.length} objects=${room.objects.length} solvable=${validation.solvable}`,
  );
  if (!validation.solvable) fail('Local generated room is NOT solvable (engine sanity)');
  const secrets = extractSecrets(room);
  const discovered = new Set<string>();

  // 1) POST /api/rooms
  const created = await http('POST', '/api/rooms', { seed, difficulty });
  console.log(`POST /api/rooms -> ${created.status}`);
  if (created.status !== 201) {
    fail(`POST /api/rooms expected 201, got ${created.status}: ${created.raw.slice(0, 200)}`);
    return finish();
  }
  const createdBody = created.json as {
    sessionId: string;
    seed: string;
    config: { difficulty: string; theme: string };
    view: { objects: { id: string }[]; goalReached: boolean; epilogue?: string };
  };
  const sessionId = createdBody.sessionId;
  console.log(`  sessionId=${sessionId} theme=${createdBody.config.theme}`);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) fail('sessionId is not a UUID');
  if (createdBody.view.goalReached) fail('fresh room already goalReached');
  if (createdBody.view.epilogue !== undefined) fail('fresh room leaks epilogue');
  // Strict anti-leak on the fresh view (nothing discovered yet).
  checkLeak('POST /api/rooms', created, secrets, discovered);

  // 2) GET /api/sessions/:id (resume) — before playing.
  const resume0 = await http('GET', `/api/sessions/${sessionId}`);
  console.log(`GET /api/sessions/:id (resume) -> ${resume0.status}`);
  if (resume0.status !== 200) fail(`resume expected 200, got ${resume0.status}`);
  checkLeak('GET /api/sessions/:id', resume0, secrets, discovered);

  // 3) Full solve via real HTTP actions.
  const { actions, reachedGoal: localReached } = planActions(room);
  console.log(`Planned ${actions.length} actions locally (localReachedGoal=${localReached})`);
  if (!localReached) fail('Local planner failed to reach goal (cannot drive API to goal)');

  let apiGoalReached = false;
  let lastView: unknown = null;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    const res = await http('POST', `/api/sessions/${sessionId}/actions`, action);
    if (res.status !== 200) {
      fail(`action #${i} ${JSON.stringify(action)} -> ${res.status}: ${res.raw.slice(0, 160)}`);
      break;
    }
    const body = res.json as { events: GameEvent[]; view: unknown };
    collectDiscoveredTexts(body.events, discovered);
    checkLeak(`action #${i} (${action.type})`, res, secrets, discovered);
    lastView = body.view;
    if (body.events.some((e) => e.type === 'goal_reached')) {
      apiGoalReached = true;
      console.log(`  goal_reached emitted by API at action #${i} (${action.type})`);
    }
  }

  const finalView = lastView as { goalReached?: boolean; epilogue?: string } | null;
  console.log(`API goal_reached event seen=${apiGoalReached}; finalView.goalReached=${finalView?.goalReached}`);
  if (!apiGoalReached) fail('API never emitted goal_reached during the full playthrough');
  if (apiGoalReached && finalView && finalView.goalReached !== true) {
    fail('goal_reached emitted but final view.goalReached is not true');
  }

  // 4) Resume after solving — should reflect goalReached + epilogue.
  const resume1 = await http('GET', `/api/sessions/${sessionId}`);
  console.log(`GET /api/sessions/:id (post-solve) -> ${resume1.status}`);
  const rb1 = resume1.json as { view: { goalReached: boolean; epilogue?: string } };
  if (resume1.status === 200) {
    if (apiGoalReached && !rb1.view.goalReached) fail('post-solve resume does not persist goalReached');
    checkLeak('GET /api/sessions/:id (post-solve)', resume1, secrets, discovered);
  } else {
    fail(`post-solve resume expected 200, got ${resume1.status}`);
  }

  // 5) Hint increment — on a FRESH session so level starts at 1.
  const hintCreated = await http('POST', '/api/rooms', { seed: seed + '-HINT', difficulty });
  const hintSession = (hintCreated.json as { sessionId: string }).sessionId;
  const h1 = await http('POST', `/api/sessions/${hintSession}/hint`, {});
  const h1b = h1.json as { puzzleId: string; level: number; text: string };
  console.log(`hint#1 -> status ${h1.status} level ${h1b?.level} puzzle ${h1b?.puzzleId}`);
  if (h1.status !== 200 || h1b.level !== 1) fail(`hint #1 expected level 1, got ${JSON.stringify(h1b)}`);
  const h2 = await http('POST', `/api/sessions/${hintSession}/hint`, { puzzleId: h1b.puzzleId });
  const h2b = h2.json as { puzzleId: string; level: number };
  console.log(`hint#2 -> status ${h2.status} level ${h2b?.level} puzzle ${h2b?.puzzleId}`);
  if (h2.status !== 200 || h2b.level !== 2 || h2b.puzzleId !== h1b.puzzleId) {
    fail(`hint #2 expected same puzzle level 2, got ${JSON.stringify(h2b)}`);
  }

  // 6) GET /api/daily
  const daily = await http('GET', '/api/daily');
  const db = daily.json as { seed: string; difficulty: string; date: string };
  console.log(`GET /api/daily -> ${daily.status} ${JSON.stringify(db)}`);
  if (daily.status !== 200) fail(`daily expected 200, got ${daily.status}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(db.date)) fail('daily date malformed');
  if (db.seed !== `daily-${db.date}`) fail('daily seed not derived from date');

  // 7) Error contract checks (bonus): 404 + 400.
  const notFound = await http('GET', '/api/sessions/00000000-0000-0000-0000-000000000000');
  if (notFound.status !== 404 || (notFound.json as { error?: { code?: string } })?.error?.code !== 'SESSION_NOT_FOUND') {
    fail(`unknown session expected 404 SESSION_NOT_FOUND, got ${notFound.status}`);
  }
  const badAction = await http('POST', `/api/sessions/${sessionId}/actions`, { type: 'inspect' });
  if (badAction.status !== 400 || (badAction.json as { error?: { code?: string } })?.error?.code !== 'VALIDATION_ERROR') {
    fail(`malformed action expected 400 VALIDATION_ERROR, got ${badAction.status}`);
  }

  finish({ apiGoalReached, actions: actions.length, theme: createdBody.config.theme });
}

function finish(extra?: Record<string, unknown>): void {
  const summary = {
    RESULT: problems.length === 0 ? 'GREEN' : 'ISSUES',
    problems: problems.map((p) => p.msg),
    ...extra,
  };
  console.log('\n===E2E_SUMMARY_JSON===');
  console.log(JSON.stringify(summary));
  console.log('===END===');
}

main().catch((err) => {
  fail('runner threw: ' + (err as Error).message + '\n' + (err as Error).stack);
  finish();
});
