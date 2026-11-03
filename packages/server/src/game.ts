// Ponts entre une session persistée et le moteur : reconstruire la config de
// génération et re-dériver la RoomSpec. Centralisé pour éviter toute divergence
// entre /rooms, /actions et /hint.

import { randomUUID } from 'node:crypto';
import type { GenerationConfig, RoomSpec } from '@escapeup/engine';
import { getOrGenerate } from './rooms';
import type { SessionRecord } from './db/repository';

/**
 * Config EXACTE ayant servi à générer la salle : on ne pose `theme` que s'il a
 * été explicitement fourni (sinon undefined = auto), sous peine de re-dériver
 * une salle différente (le tirage du thème consomme le PRNG).
 */
export function generationConfig(difficulty: SessionRecord['difficulty'], theme: string | null): GenerationConfig {
  const config: GenerationConfig = { difficulty };
  if (theme) config.theme = theme;
  return config;
}

export function roomForSession(record: SessionRecord): RoomSpec {
  return getOrGenerate(record.seed, generationConfig(record.difficulty, record.theme));
}

/** Seed serveur pour une partie sans seed fournie : figée à la création. */
export function randomSeed(): string {
  return `room-${randomUUID().slice(0, 8)}`;
}

export function totalHints(hintsUsed: Record<string, number>): number {
  return Object.values(hintsUsed).reduce((acc, n) => acc + n, 0);
}
