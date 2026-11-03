import type { FastifyInstance } from 'fastify';
import { applyAction, deriveClientView, getHint } from '@escapeup/engine';
import type { PlayerState } from '@escapeup/engine';
import { actionSchema, hintBodySchema } from '../validation';
import { errors } from '../errors';
import { generationConfig, roomForSession, totalHints } from '../game';
import {
  findSession,
  updateSessionState,
  recordLeaderboard,
  type SessionRecord,
} from '../db/repository';
import { getOrGenerate } from '../rooms';

interface IdParams {
  id: string;
}

async function loadSession(id: string): Promise<SessionRecord> {
  const record = await findSession(id);
  if (!record) throw errors.sessionNotFound();
  return record;
}

export function registerSessions(app: FastifyInstance): void {
  // GET /api/sessions/:id — reprendre une partie.
  app.get<{ Params: IdParams }>('/api/sessions/:id', async (req, reply) => {
    const record = await loadSession(req.params.id);
    const room = roomForSession(record);
    const view = deriveClientView(room, record.playerState);
    return reply.code(200).send({
      sessionId: record.id,
      seed: record.seed,
      config: { difficulty: record.difficulty, theme: room.theme },
      view,
    });
  });

  // POST /api/sessions/:id/actions — jouer une action.
  app.post<{ Params: IdParams }>('/api/sessions/:id/actions', async (req, reply) => {
    const record = await loadSession(req.params.id);
    const action = actionSchema.parse(req.body);

    const config = generationConfig(record.difficulty, record.theme);
    const room = getOrGenerate(record.seed, config);

    const { state, events } = applyAction(room, record.playerState, action);
    const goalReached = record.goalReached || state.acquired.includes(room.graph.goalId);

    await updateSessionState(record.id, state, goalReached);

    // Alimente le classement au premier passage à goalReached (V1 minimal).
    if (!record.goalReached && goalReached) {
      await recordLeaderboard({
        seed: record.seed,
        sessionId: record.id,
        playerName: record.playerName,
        durationMs: Date.now() - record.createdAt.getTime(),
        hintsUsed: totalHints(state.hintsUsed),
      });
    }

    const view = deriveClientView(room, state);
    return reply.code(200).send({ events, view });
  });

  // POST /api/sessions/:id/hint — indice progressif.
  app.post<{ Params: IdParams }>('/api/sessions/:id/hint', async (req, reply) => {
    const record = await loadSession(req.params.id);
    const body = hintBodySchema.parse(req.body ?? {});
    const room = roomForSession(record);

    let hint;
    try {
      hint = getHint(room, record.playerState, body.puzzleId);
    } catch {
      throw errors.validation('Aucun puzzle courant pour lequel fournir un indice.');
    }

    // Persiste l'incrément du niveau de hint pour ce puzzle.
    const nextState: PlayerState = {
      ...record.playerState,
      hintsUsed: { ...record.playerState.hintsUsed, [hint.puzzleId]: hint.level },
    };
    await updateSessionState(record.id, nextState, record.goalReached);

    return reply.code(200).send(hint);
  });
}
