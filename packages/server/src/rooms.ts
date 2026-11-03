// Service de salles : cache mémoire des RoomSpec re-dérivées.
// La salle n'est PAS stockée en base (seul l'état joueur l'est) ; comme
// generateRoom est pure et déterministe, on la re-génère à la demande et on
// la met en cache par (seed | difficulty | theme).
//
// ATTENTION déterminisme : passer un thème explicite ne produit PAS la même
// salle qu'un thème auto-résolu (le tirage du thème consomme le PRNG). Le
// serveur ne met donc `theme` dans la config QUE s'il a été fourni par le
// client ; sinon il reste `undefined` (auto), à la création comme à la reprise.

import { generateRoom, type GenerationConfig, type RoomSpec } from '@escapeup/engine';
import { errors } from './errors';

const cache = new Map<string, RoomSpec>();

export function roomCacheKey(seed: string, config: GenerationConfig): string {
  return `${seed}|${config.difficulty}|${config.theme ?? ''}`;
}

/** Retourne la salle en cache ou la (re)génère. Lève ROOM_GENERATION_FAILED si la génération échoue. */
export function getOrGenerate(seed: string, config: GenerationConfig): RoomSpec {
  const key = roomCacheKey(seed, config);
  const cached = cache.get(key);
  if (cached) return cached;

  let room: RoomSpec;
  try {
    room = generateRoom(seed, config);
  } catch (err) {
    throw errors.roomGeneration(
      `Génération impossible pour seed="${seed}" (${(err as Error).message})`,
    );
  }
  cache.set(key, room);
  return room;
}

/** À usage tests. */
export function clearRoomCache(): void {
  cache.clear();
}
