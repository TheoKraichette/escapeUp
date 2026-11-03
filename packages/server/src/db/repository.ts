// Accès données : sessions + classement quotidien. Toute la logique de jeu est
// dans le moteur ; ici on ne fait que persister/relire l'état joueur (jsonb).

import { and, asc, count, eq, lt, or } from 'drizzle-orm';
import type { Difficulty, PlayerState } from '@escapeup/engine';
import { db } from './client';
import { sessions, dailyLeaderboard } from './schema';

export interface SessionRecord {
  id: string;
  seed: string;
  difficulty: Difficulty;
  /** null = thème auto-résolu (voir rooms.ts) */
  theme: string | null;
  /** null = joueur anonyme */
  playerName: string | null;
  playerState: PlayerState;
  goalReached: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewSession {
  seed: string;
  difficulty: Difficulty;
  theme: string | null;
  playerName: string | null;
  playerState: PlayerState;
}

function toRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    seed: row.seed,
    difficulty: row.difficulty,
    theme: row.theme ?? null,
    playerName: row.playerName ?? null,
    playerState: row.playerState,
    goalReached: row.goalReached,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function insertSession(input: NewSession): Promise<SessionRecord> {
  const [row] = await db
    .insert(sessions)
    .values({
      seed: input.seed,
      difficulty: input.difficulty,
      theme: input.theme,
      playerName: input.playerName,
      playerState: input.playerState,
      goalReached: false,
    })
    .returning();
  if (!row) throw new Error('insertSession: aucune ligne retournée');
  return toRecord(row);
}

export async function findSession(id: string): Promise<SessionRecord | null> {
  // Un id non-UUID ne peut pas exister (et ferait échouer la requête pg) → null.
  if (!UUID_RE.test(id)) return null;
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return row ? toRecord(row) : null;
}

export async function updateSessionState(
  id: string,
  playerState: PlayerState,
  goalReached: boolean,
): Promise<void> {
  await db
    .update(sessions)
    .set({ playerState, goalReached, updatedAt: new Date() })
    .where(eq(sessions.id, id));
}

export async function recordLeaderboard(input: {
  seed: string;
  sessionId: string;
  playerName: string | null;
  durationMs: number;
  hintsUsed: number;
}): Promise<void> {
  await db.insert(dailyLeaderboard).values({
    seed: input.seed,
    sessionId: input.sessionId,
    playerName: input.playerName,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    hintsUsed: Math.max(0, Math.round(input.hintsUsed)),
  });
}

/**
 * Entrée de classement côté serveur. Le sessionId ne sert qu'à marquer « you »
 * dans la route — il ne doit JAMAIS partir sur le fil.
 */
export interface LeaderboardEntry {
  sessionId: string;
  playerName: string | null;
  durationMs: number;
  hintsUsed: number;
}

/** Tri du classement : durée croissante, puis ancienneté (le premier arrivé gagne l'égalité). */
const leaderboardOrder = [asc(dailyLeaderboard.durationMs), asc(dailyLeaderboard.createdAt)];

/** Meilleures entrées d'une seed (top `limit`). */
export async function topLeaderboard(seed: string, limit: number): Promise<LeaderboardEntry[]> {
  return db
    .select({
      sessionId: dailyLeaderboard.sessionId,
      playerName: dailyLeaderboard.playerName,
      durationMs: dailyLeaderboard.durationMs,
      hintsUsed: dailyLeaderboard.hintsUsed,
    })
    .from(dailyLeaderboard)
    .where(eq(dailyLeaderboard.seed, seed))
    .orderBy(...leaderboardOrder)
    .limit(limit);
}

/** Nombre total d'entrées du classement pour une seed. */
export async function countLeaderboard(seed: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(dailyLeaderboard)
    .where(eq(dailyLeaderboard.seed, seed));
  return row?.value ?? 0;
}

/**
 * Entrée + rang (1-based) d'une session dans le classement d'une seed, ou null
 * si elle n'y figure pas. Le rang = 1 + nombre d'entrées strictement meilleures
 * dans le tri (durée, puis ancienneté).
 */
export async function leaderboardEntryWithRank(
  seed: string,
  sessionId: string,
): Promise<(LeaderboardEntry & { rank: number }) | null> {
  // Un id non-UUID ne peut pas exister (et ferait échouer la requête pg) → null.
  if (!UUID_RE.test(sessionId)) return null;
  const [row] = await db
    .select()
    .from(dailyLeaderboard)
    .where(and(eq(dailyLeaderboard.seed, seed), eq(dailyLeaderboard.sessionId, sessionId)))
    .orderBy(...leaderboardOrder)
    .limit(1);
  if (!row) return null;

  const [better] = await db
    .select({ value: count() })
    .from(dailyLeaderboard)
    .where(
      and(
        eq(dailyLeaderboard.seed, seed),
        or(
          lt(dailyLeaderboard.durationMs, row.durationMs),
          and(eq(dailyLeaderboard.durationMs, row.durationMs), lt(dailyLeaderboard.createdAt, row.createdAt)),
        ),
      ),
    );

  return {
    sessionId: row.sessionId,
    playerName: row.playerName ?? null,
    durationMs: row.durationMs,
    hintsUsed: row.hintsUsed,
    rank: (better?.value ?? 0) + 1,
  };
}
