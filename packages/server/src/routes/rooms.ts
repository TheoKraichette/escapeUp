import type { FastifyInstance } from 'fastify';
import { createInitialState, deriveClientView } from '@escapeup/engine';
import { createRoomBodySchema } from '../validation';
import { getOrGenerate } from '../rooms';
import { generationConfig, randomSeed } from '../game';
import { insertSession } from '../db/repository';

export function registerRooms(app: FastifyInstance): void {
  // POST /api/rooms — créer une partie (génère/re-dérive + ouvre une session).
  app.post('/api/rooms', async (req, reply) => {
    const body = createRoomBodySchema.parse(req.body ?? {});
    const difficulty = body.difficulty ?? 'medium';
    const seed = body.seed ?? randomSeed();
    const theme = body.theme ?? null; // null = auto (figé pour cette session)
    const playerName = body.player ?? null; // null = joueur anonyme

    const room = getOrGenerate(seed, generationConfig(difficulty, theme));
    const state = createInitialState(room);

    const record = await insertSession({ seed, difficulty, theme, playerName, playerState: state });
    const view = deriveClientView(room, state);

    // config renvoyée : thème RÉSOLU (room.theme) pour l'affichage client.
    return reply
      .code(201)
      .send({ sessionId: record.id, seed, config: { difficulty, theme: room.theme }, view });
  });
}
