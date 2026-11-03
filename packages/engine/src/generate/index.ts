// ============================================================================
// GÉNÉRATION — POINT D'ENTRÉE : generateRoom (docs/02-ARCHITECTURE.md §3).
// ----------------------------------------------------------------------------
// Pipeline : scénario → squelette → graphe (à rebours) → habillage → placement
// → VALIDATION (boucle de rejet). Fonction pure et déterministe : même
// (seed, config) → même RoomSpec, octet pour octet.
//
// Boucle de rejet : si validateRoom échoue, on réessaie avec une seed dérivée
// `${seed}#retry${n}` (n = 1..MAX-1) ; au-delà, on lève. Les invariants étant
// structurels, la boucle est une simple assurance (elle ne devrait pas tourner).
// ============================================================================

import type { GenerationConfig, RoomSpec } from '../types';
import { createRng } from '../rng';
import { validateRoom, computeMetrics } from '../validate/index';
import { resolveTheme } from '../content/themes/index';
import { BUDGETS } from './budget';
import { createBlueprint, type Blueprint } from './blueprint';
import { buildSkeleton } from './skeleton';
import { buildScenario } from './scenario';
import { buildGraph, type GraphCtx } from './graph';
import { decorateRoom } from './place';

const MAX_ATTEMPTS = 10;

/** Assemble le RoomSpec final depuis le blueprint (métriques calculées). */
function assemble(bp: Blueprint): RoomSpec {
  const room: RoomSpec = {
    version: 1,
    seed: bp.seed,
    config: bp.config,
    theme: bp.themeId,
    narrative: bp.narrative,
    zones: bp.zones,
    objects: bp.objects,
    puzzles: bp.puzzles,
    graph: { nodes: bp.nodes, edges: bp.edges, goalId: bp.goalId },
    metrics: {
      criticalPathDepth: 0,
      parallelBranches: 0,
      multiZoneJoinPuzzles: 0,
      maxInferenceSteps: 0,
      zoneCount: 0,
      estimatedMinutes: 0,
      decoyCount: 0,
    },
  };
  room.metrics = computeMetrics(room);
  return room;
}

/** Une tentative de génération complète pour une seed effective donnée. */
function buildOnce(effectiveSeed: string, publicSeed: string, config: GenerationConfig): RoomSpec {
  const rng = createRng(effectiveSeed);
  const theme = resolveTheme(rng, config.theme);
  const budget = BUDGETS[config.difficulty];

  const bp = createBlueprint(publicSeed, config, rng, theme.id);
  const scenario = buildScenario(rng, theme);
  bp.narrative = scenario.narrative;

  buildSkeleton(bp, theme, budget);

  const ctx: GraphCtx = { bp, theme, scenario, budget };
  buildGraph(ctx);
  decorateRoom(ctx);

  return assemble(bp);
}

/**
 * Génère une salle jouable, cohérente et prouvée solvable.
 * @param seed graine publique (identité de la salle ; « salle du jour »)
 * @param config difficulté + thème optionnel
 */
export function generateRoom(seed: string, config: GenerationConfig): RoomSpec {
  let lastReason = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const effectiveSeed = attempt === 0 ? seed : `${seed}#retry${attempt}`;
    const room = buildOnce(effectiveSeed, seed, config);
    const res = validateRoom(room);
    if (res.solvable && res.lints.pass) return room;
    const firstError = res.lints.findings.find((f) => f.level === 'error');
    lastReason = res.solvable
      ? `lint ${firstError?.lint}: ${firstError?.message}`
      : `insolvable: ${res.solve.solvable ? '' : res.solve.reason}`;
  }
  throw new Error(
    `generateRoom : échec après ${MAX_ATTEMPTS} tentatives (seed=${seed}, ` +
      `difficulté=${config.difficulty}). Dernière cause : ${lastReason}`,
  );
}
