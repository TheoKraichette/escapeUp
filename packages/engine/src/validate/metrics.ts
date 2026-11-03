// ============================================================================
// MÉTRIQUES DE DIFFICULTÉ — docs/02-ARCHITECTURE.md §4.3, GDD §9.
// Calculées depuis le graphe + la trace du solveur (fonction pure).
// ============================================================================

import type { DifficultyMetrics, PuzzleInstance, RoomSpec } from '../types';
import { buildIndex, type RoomIndex } from '../resolve';
import { runSolver } from './solver';

/** Coûts de base (minutes) par template pour l'estimation de durée. */
const TEMPLATE_BASE_MINUTES: Record<string, number> = {
  key_lock: 2,
  code_from_document: 4,
  labeled_dial_code: 4,
  tool_reveal: 3,
  combine_items: 3,
  mechanism_sequence: 5,
  mapping_sequence: 6,
  logic_deduction: 6,
  cipher_substitution: 6,
  spatial_observation: 5,
};
const INFERENCE_MINUTES = 2;
const NAVIGATION_MINUTES_PER_ZONE = 3;

/** Puzzles prédécesseurs : ceux dont un output alimente un input de `p`. */
function predecessors(room: RoomSpec, p: PuzzleInstance): PuzzleInstance[] {
  return room.puzzles.filter(
    (q) => q.id !== p.id && q.outputs.some((o) => p.inputs.includes(o)),
  );
}

/** Longueur de la plus longue chaîne de puzzles se terminant à `p` (mémoïsée, sûre en cas de cycle). */
function chainDepth(
  room: RoomSpec,
  p: PuzzleInstance,
  memo: Map<string, number>,
  stack: Set<string>,
): number {
  const cached = memo.get(p.id);
  if (cached !== undefined) return cached;
  if (stack.has(p.id)) return 0; // garde-fou anti-cycle
  stack.add(p.id);
  let best = 0;
  for (const pred of predecessors(room, p)) {
    best = Math.max(best, chainDepth(room, pred, memo, stack));
  }
  stack.delete(p.id);
  const depth = best + 1;
  memo.set(p.id, depth);
  return depth;
}

/** Nombre de zones distinctes d'où proviennent les inputs d'un puzzle (jointure multi-zones). */
function inputZoneCount(idx: RoomIndex, p: PuzzleInstance): number {
  const zones = new Set<string>();
  for (const input of p.inputs) {
    const carrier = idx.nodesById.get(input)?.carrier;
    if (!carrier) continue;
    const obj = idx.objectsById.get(carrier);
    if (obj && obj.location !== 'inventory' && obj.location !== 'hidden') {
      zones.add(obj.location.zoneId);
    }
  }
  return zones.size;
}

export function computeMetrics(room: RoomSpec): DifficultyMetrics {
  const idx = buildIndex(room);
  const run = runSolver(room);

  const goalPuzzle = room.puzzles.find((p) => p.outputs.includes(room.graph.goalId));
  const memo = new Map<string, number>();
  const criticalPathDepth = goalPuzzle
    ? chainDepth(room, goalPuzzle, memo, new Set())
    : 0;

  let parallelBranches = 1;
  for (const pass of run.result.trace) {
    parallelBranches = Math.max(parallelBranches, pass.solved.length);
  }

  let multiZoneJoinPuzzles = 0;
  let maxInferenceSteps = 0;
  let estimatedMinutes = 0;
  for (const p of room.puzzles) {
    if (inputZoneCount(idx, p) >= 2) multiZoneJoinPuzzles++;
    maxInferenceSteps = Math.max(maxInferenceSteps, p.derivation.inferenceSteps);
    if (run.passOfPuzzle.has(p.id)) {
      const base = TEMPLATE_BASE_MINUTES[p.template] ?? 4;
      estimatedMinutes += base + INFERENCE_MINUTES * p.derivation.inferenceSteps;
    }
  }
  estimatedMinutes += NAVIGATION_MINUTES_PER_ZONE * room.zones.length;

  const decoyCount = room.objects.filter(
    (o) => o.family === 'decor' && o.reveals.some((r) => r.text.trim().length > 0),
  ).length;

  return {
    criticalPathDepth,
    parallelBranches,
    multiZoneJoinPuzzles,
    maxInferenceSteps,
    zoneCount: room.zones.length,
    estimatedMinutes,
    decoyCount,
  };
}
