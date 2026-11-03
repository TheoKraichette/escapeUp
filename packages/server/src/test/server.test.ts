// Tests d'intégration via app.inject (pas de socket réseau).
// Ces tests TOUCHENT VRAIMENT Postgres : beforeAll applique les migrations sur
// le conteneur (DATABASE_URL, défaut postgres://escapeup:escapeup@localhost:5432/escapeup),
// et chaque création/reprise/hint fait un aller-retour SQL réel (insert/select/update).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  applyAction,
  createInitialState,
  generateRoom,
  type Action,
  type Affordance,
  type PlayerState,
  type PuzzleInstance,
  type RoomSpec,
} from '@escapeup/engine';
import { buildApp } from '../app';
import { closeDb, db } from '../db/client';
import { dailyLeaderboard } from '../db/schema';
import { applyMigrations } from '../db/migrate';
import { clearRoomCache } from '../rooms';
import { dailySeed, todayISO } from '../routes/daily';

let app: FastifyInstance;

beforeAll(async () => {
  await applyMigrations(); // schéma prêt sur le vrai Postgres
  clearRoomCache();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

/** Vérifie récursivement qu'aucune clé interne n'a fuité dans la vue client. */
const FORBIDDEN_KEYS = [
  'solution',
  'graph',
  'backstory',
  'derivation',
  'reveals',
  'requires',
  'narrativeFragment',
  'hints',
  'metrics',
];
function assertNoForbiddenKeys(value: unknown): void {
  const stack: unknown[] = [value];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      expect(FORBIDDEN_KEYS, `clé interne "${k}" ne doit pas fuiter au client`).not.toContain(k);
      stack.push(v);
    }
  }
}

async function createRoom(body: Record<string, unknown>) {
  const res = await app.inject({ method: 'POST', url: '/api/rooms', payload: body });
  expect(res.statusCode).toBe(201);
  return res.json();
}

// ————— Planificateur local minimal (recopié de src/e2e/run.ts) —————
// Simule un joueur parfait sur la salle re-générée localement pour produire la
// trace d'actions exacte menant au goal — le serveur ne reçoit que des Actions.

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

    // Récolte des reveals (inspect/read/take) jusqu'au point fixe.
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

    // Résout chaque puzzle dont les entrées sont satisfaites.
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

/** Rejoue la trace calculée localement via l'API réelle jusqu'à goal_reached. */
async function solveViaApi(sessionId: string, seed: string): Promise<void> {
  const room = generateRoom(seed, { difficulty: 'easy' });
  const { actions, reachedGoal } = planActions(room);
  expect(reachedGoal, `planificateur local doit atteindre le goal (seed=${seed})`).toBe(true);

  let goalSeen = false;
  for (const action of actions) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/actions`,
      payload: action,
    });
    expect(res.statusCode).toBe(200);
    const events = res.json().events as { type: string }[];
    if (events.some((e) => e.type === 'goal_reached')) goalSeen = true;
  }
  expect(goalSeen, 'l API doit émettre goal_reached pendant la partie').toBe(true);
}

describe('GET /api/health', () => {
  it('renvoie status ok et db up (Postgres joignable)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'up' });
  });
});

describe('POST /api/rooms', () => {
  it('crée une session et renvoie une vue expurgée (aucune solution/graph/backstory)', async () => {
    const created = await createRoom({ seed: 'API-TEST-1', difficulty: 'medium' });

    expect(created.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(created.seed).toBe('API-TEST-1');
    expect(created.config.difficulty).toBe('medium');
    expect(typeof created.config.theme).toBe('string'); // thème résolu exposé
    expect(created.view.seed).toBe('API-TEST-1');
    expect(created.view.goalReached).toBe(false);
    expect(Array.isArray(created.view.objects)).toBe(true);
    expect(created.view.objects.length).toBeGreaterThan(0);
    expect(created.view.epilogue).toBeUndefined(); // pas de spoiler de fin

    // Redaction stricte, sur toute la réponse (view + config).
    assertNoForbiddenKeys(created);
  });

  it('rejette une difficulté invalide en 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { difficulty: 'impossible' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/sessions/:id/actions', () => {
  it('applique une action inspect et renvoie events + view expurgée', async () => {
    const created = await createRoom({ seed: 'API-TEST-2', difficulty: 'medium' });
    const inspectable = created.view.objects.find((o: { affordances: string[] }) =>
      o.affordances.includes('inspect'),
    );
    expect(inspectable).toBeDefined();

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.sessionId}/actions`,
      payload: { type: 'inspect', objectId: inspectable.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.view.seed).toBe('API-TEST-2');
    assertNoForbiddenKeys(body);
  });

  it('rejette une action malformée en 400', async () => {
    const created = await createRoom({ seed: 'API-TEST-2b', difficulty: 'easy' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.sessionId}/actions`,
      payload: { type: 'inspect' }, // objectId manquant
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/sessions/:id — reprise', () => {
  it('recharge l état persisté et re-dérive la même salle', async () => {
    const created = await createRoom({ seed: 'API-TEST-3', difficulty: 'medium' });

    const res = await app.inject({ method: 'GET', url: `/api/sessions/${created.sessionId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessionId).toBe(created.sessionId);
    expect(body.seed).toBe('API-TEST-3');
    expect(body.config.theme).toBe(created.config.theme);
    // Salle re-dérivée à l identique : même ensemble d objets visibles au départ.
    expect(body.view.objects.map((o: { id: string }) => o.id).sort()).toEqual(
      created.view.objects.map((o: { id: string }) => o.id).sort(),
    );
    assertNoForbiddenKeys(body);
  });

  it('renvoie 404 SESSION_NOT_FOUND pour un id inconnu', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('POST /api/sessions/:id/hint', () => {
  it('renvoie un hint et escalade le niveau à chaque appel (persisté en base)', async () => {
    const created = await createRoom({ seed: 'API-TEST-4', difficulty: 'medium' });

    const h1 = await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.sessionId}/hint`,
      payload: {},
    });
    expect(h1.statusCode).toBe(200);
    const hint1 = h1.json();
    expect(hint1.level).toBe(1);
    expect(typeof hint1.puzzleId).toBe('string');
    expect(typeof hint1.text).toBe('string');

    const h2 = await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.sessionId}/hint`,
      payload: { puzzleId: hint1.puzzleId },
    });
    expect(h2.statusCode).toBe(200);
    const hint2 = h2.json();
    expect(hint2.puzzleId).toBe(hint1.puzzleId);
    expect(hint2.level).toBe(2); // incrément persisté entre deux requêtes
  });
});

describe('GET /api/daily', () => {
  it('renvoie une seed dérivée de la date du jour', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/daily' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.seed).toBe(`daily-${body.date}`);
    expect(body.difficulty).toBe('medium');
  });
});

describe('GET /api/daily/leaderboard', () => {
  it("n'inclut pas une partie gagnée sur une autre seed que celle du jour", async () => {
    const created = await createRoom({ seed: 'API-LB-OFFDAY', difficulty: 'easy', player: 'Théo' });
    await solveViaApi(created.sessionId, 'API-LB-OFFDAY');

    const res = await app.inject({
      method: 'GET',
      url: `/api/daily/leaderboard?sessionId=${created.sessionId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // La seed jouée n'est pas la seed du jour : aucune entrée ne doit être « you ».
    expect(body.entries.every((e: { you: boolean }) => e.you === false)).toBe(true);
  });

  it("classe la partie du jour avec le pseudo, rank 1, sans exposer de sessionId", async () => {
    const date = todayISO();
    const seed = dailySeed(date);
    // Base propre : purge le classement du jour (runs précédents, autres tests).
    await db.delete(dailyLeaderboard).where(eq(dailyLeaderboard.seed, seed));

    const created = await createRoom({ seed, difficulty: 'easy', player: 'Théo' });
    await solveViaApi(created.sessionId, seed);

    const res = await app.inject({
      method: 'GET',
      url: `/api/daily/leaderboard?sessionId=${created.sessionId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.date).toBe(date);
    expect(body.seed).toBe(seed);
    expect(body.total).toBe(1);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toEqual({
      rank: 1,
      player: 'Théo',
      durationMs: expect.any(Number),
      hintsUsed: 0,
      you: true,
    });
    expect(body.entries[0].durationMs).toBeGreaterThanOrEqual(0);
    // Aucun sessionId ne doit partir sur le fil dans les entrées.
    for (const entry of body.entries) {
      expect(Object.keys(entry)).not.toContain('sessionId');
    }
  });

  it("rejette un pseudo composé d'espaces en 400 VALIDATION_ERROR", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { player: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
