// ============================================================================
// SOLVEUR — simulation d'un joueur PARFAIT (docs/02-ARCHITECTURE.md §4.1)
// ----------------------------------------------------------------------------
// Boucle de passes : à chaque passe on « récolte » (jusqu'à point fixe) toutes
// les interactions inspect/read/take dont les requires sont satisfaits, puis on
// applique tous les puzzles dont les inputs sont acquis. On s'arrête quand plus
// rien ne progresse : SOLVABLE si le GOAL est acquis, sinon UNSOLVABLE avec la
// frontière manquante. La logique d'effets vient de resolve.ts (partagée avec
// le runtime).
// ============================================================================

import type { PuzzleInstance, RoomSpec, SolveResult, SolverPass } from '../types';
import {
  applyPuzzleEffects,
  buildIndex,
  emptyResolveState,
  fireReveal,
  isObjectReachable,
  puzzleInputsSatisfied,
  requirementsMetFor,
  solvingAffordance,
  type ResolveState,
  type RoomIndex,
} from '../resolve';

/** Affordances « gratuites » que le joueur parfait déclenche par simple récolte. */
const HARVEST_AFFORDANCES = new Set(['inspect', 'read', 'take']);

/** Données riches produites par la simulation, réutilisées par les lints. */
export interface SolverRun {
  result: SolveResult;
  /** pass (1-based) où chaque puzzle a été résolu. */
  passOfPuzzle: Map<string, number>;
  /** pass (1-based) où chaque nœud a été acquis pour la première fois. */
  passOfNode: Map<string, number>;
  /** textes de reveal déclenchés à chaque passe (index = pass-1). */
  textsByPass: string[][];
  finalState: ResolveState;
}

/**
 * Récolte jusqu'au point fixe : re-scanne tant qu'un reveal a exposé un nouvel
 * objet ou acquis un nouveau nœud (ex. fouiller le comptoir → badge visible →
 * lire le badge, le tout dans la même passe).
 */
function harvest(
  idx: RoomIndex,
  state: ResolveState,
  fired: Set<string>,
  outTexts: string[],
): string[] {
  const gained: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const obj of idx.room.objects) {
      if (!isObjectReachable(idx, state, obj.id)) continue;
      for (let i = 0; i < obj.reveals.length; i++) {
        const reveal = obj.reveals[i]!;
        if (!HARVEST_AFFORDANCES.has(reveal.on)) continue;
        if (!obj.affordances.includes(reveal.on)) continue;
        const key = `${obj.id}#${i}`;
        if (fired.has(key)) continue;
        if (!requirementsMetFor(obj, state, reveal.on)) continue;
        const out = fireReveal(idx, state, obj, reveal);
        fired.add(key);
        outTexts.push(out.text);
        if (out.gainedNodes.length > 0 || out.revealedObjects.length > 0) changed = true;
        gained.push(...out.gainedNodes);
      }
    }
  }
  return gained;
}

/** Diagnostic : nœuds requis (inputs de puzzles / goal) jamais acquis. */
function computeMissing(idx: RoomIndex, state: ResolveState, room: RoomSpec): string[] {
  const missing = new Set<string>();
  for (const p of room.puzzles) {
    if (state.solved.has(p.id)) continue;
    for (const input of p.inputs) if (!state.acquired.has(input)) missing.add(input);
  }
  if (!state.acquired.has(room.graph.goalId)) {
    // si aucun puzzle bloqué ne référence le goal, signaler le goal lui-même
    const producers = room.puzzles.filter((p) => p.outputs.includes(room.graph.goalId));
    if (producers.length === 0) missing.add(room.graph.goalId);
  }
  return [...missing].sort();
}

/** Cœur instrumenté : produit la trace + les métadonnées par passe. */
export function runSolver(room: RoomSpec): SolverRun {
  const idx = buildIndex(room);
  const state = emptyResolveState();
  const trace: SolverPass[] = [];
  const passOfPuzzle = new Map<string, number>();
  const passOfNode = new Map<string, number>();
  const textsByPass: string[][] = [];
  const fired = new Set<string>();

  const maxPasses = room.puzzles.length + room.objects.length + 4;
  let passNum = 0;

  while (passNum < maxPasses) {
    passNum++;
    const passTexts: string[] = [];
    const harvested = harvest(idx, state, fired, passTexts);

    const solved: string[] = [];
    const gained: string[] = [];
    // On fige la liste des applicables au début du pas (comme le pseudo-code §4.1).
    const applicable = room.puzzles.filter(
      (p) =>
        !state.solved.has(p.id) &&
        puzzleInputsSatisfied(state, p) &&
        isObjectReachable(idx, state, p.mechanismObjectId) &&
        mechanismReady(idx, state, p),
    );
    for (const p of applicable) {
      if (state.solved.has(p.id)) continue;
      const outcome = applyPuzzleEffects(idx, state, p);
      solved.push(p.id);
      passOfPuzzle.set(p.id, passNum);
      gained.push(...outcome.gained);
      for (const ro of outcome.revealOutcomes) passTexts.push(ro.text);
    }

    for (const n of harvested) if (!passOfNode.has(n)) passOfNode.set(n, passNum);
    for (const n of gained) if (!passOfNode.has(n)) passOfNode.set(n, passNum);

    if (harvested.length === 0 && solved.length === 0) break;

    trace.push({ pass: passNum, harvested, solved, gained });
    textsByPass.push(passTexts);
  }

  const solvable = state.acquired.has(room.graph.goalId);
  const result: SolveResult = solvable
    ? { solvable: true, trace }
    : {
        solvable: false,
        trace,
        missing: computeMissing(idx, state, room),
        reason: 'GOAL non atteint : la frontière listée dans `missing` reste inaccessible.',
      };

  return { result, passOfPuzzle, passOfNode, textsByPass, finalState: state };
}

function mechanismReady(idx: RoomIndex, state: ResolveState, p: PuzzleInstance): boolean {
  const mech = idx.objectsById.get(p.mechanismObjectId);
  if (!mech) return true;
  return requirementsMetFor(mech, state, solvingAffordance(p));
}

/** API publique : simule un joueur parfait et renvoie la trace canonique. */
export function solveRoom(room: RoomSpec): SolveResult {
  return runSolver(room).result;
}
