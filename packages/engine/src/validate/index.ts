// ============================================================================
// VALIDATEUR — agrégat solveur + lints + métriques (docs/02-ARCHITECTURE.md §4).
// Une salle est VALIDE si elle est solvable ET ne présente aucun lint 'error'.
// ============================================================================

import type { RoomSpec, ValidationResult } from '../types';
import { solveRoom } from './solver';
import { lintRoom } from './lints';
import { computeMetrics } from './metrics';

export { solveRoom } from './solver';
export { lintRoom } from './lints';
export { computeMetrics } from './metrics';

/** Agrège les trois familles de vérification en un seul rapport. */
export function validateRoom(room: RoomSpec): ValidationResult {
  const solve = solveRoom(room);
  const lints = lintRoom(room);
  const metrics = computeMetrics(room);
  return {
    solvable: solve.solvable,
    solve,
    lints,
    metrics,
  };
}
