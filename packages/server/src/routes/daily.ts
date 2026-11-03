import type { FastifyInstance } from 'fastify';
import type { Difficulty } from '@escapeup/engine';
import { countLeaderboard, leaderboardEntryWithRank, topLeaderboard } from '../db/repository';

/** Date du jour (horloge serveur) au format AAAA-MM-JJ, UTC. */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Seed du jour, identique pour tous : dérivée de la date. */
export function dailySeed(date: string): string {
  return `daily-${date}`;
}

export const DAILY_DIFFICULTY: Difficulty = 'medium';

/** Taille du top exposé par GET /api/daily/leaderboard. */
const LEADERBOARD_TOP = 10;

/** Entrée publique du classement — AUCUN sessionId ne part sur le fil. */
interface PublicLeaderboardEntry {
  rank: number;
  player: string | null;
  durationMs: number;
  hintsUsed: number;
  you: boolean;
}

export function registerDaily(app: FastifyInstance): void {
  // GET /api/daily — salle du jour (le serveur PEUT lire l'horloge).
  app.get('/api/daily', async (_req, reply) => {
    const date = todayISO();
    return reply
      .code(200)
      .send({ seed: dailySeed(date), difficulty: DAILY_DIFFICULTY, date });
  });

  // GET /api/daily/leaderboard — top 10 du jour (+ rang de l'appelant si hors top).
  app.get<{ Querystring: { sessionId?: string } }>('/api/daily/leaderboard', async (req, reply) => {
    const date = todayISO();
    const seed = dailySeed(date);
    // sessionId optionnel : sert uniquement à marquer « you » (non-UUID ignoré en aval).
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;

    const top = await topLeaderboard(seed, LEADERBOARD_TOP);
    const total = await countLeaderboard(seed);

    const entries: PublicLeaderboardEntry[] = top.map((entry, i) => ({
      rank: i + 1,
      player: entry.playerName,
      durationMs: entry.durationMs,
      hintsUsed: entry.hintsUsed,
      you: entry.sessionId === sessionId,
    }));

    // Session appelante classée mais hors top : on ajoute sa ligne avec son vrai rang.
    if (sessionId && !entries.some((e) => e.you)) {
      const own = await leaderboardEntryWithRank(seed, sessionId);
      if (own) {
        entries.push({
          rank: own.rank,
          player: own.playerName,
          durationMs: own.durationMs,
          hintsUsed: own.hintsUsed,
          you: true,
        });
      }
    }

    return reply.code(200).send({ date, seed, entries, total });
  });
}
