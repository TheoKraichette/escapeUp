// ============================================================================
// LOGIQUE DE RÉSOLUTION PARTAGÉE (requires → effets)
// ----------------------------------------------------------------------------
// Ce module est LA SEULE implémentation des EFFETS d'une interaction (« comment
// l'état de jeu évolue quand une interaction aboutit »). Ces effets sont importés
// à la fois par :
//   - validate/solver.ts  (le joueur parfait : récolte tout, applique tout)
//   - runtime/index.ts     (le joueur réel : une action discrète à la fois)
// Les EFFETS sont donc unifiés : un puzzle résolu produit exactement les mêmes
// outputs/reveals des deux côtés (jamais deux versions divergentes de l'effet).
//
// EN REVANCHE, le GARDE D'APPLICABILITÉ diffère VOLONTAIREMENT (et légitimement,
// pour un escape game) :
//   - le solveur exige `puzzleInputsSatisfied` (indices acquis) : c'est le joueur
//     IDÉAL, input-gated, dont la trace sert de PREUVE de solvabilité déductive ;
//   - le runtime (handleCode/handleSequence) n'exige QUE la joignabilité du
//     mécanisme : il est PERMISSIF et autorise le brute-force (entrer le bon code
//     sans avoir lu les indices), comportement souhaité côté joueur réel.
// Cette divergence ne porte donc QUE sur la CONDITION de déclenchement, pas sur
// l'effet ; on ne force PAS l'input-gating côté runtime. Voir resolve.ts /
// runtime/index.ts et docs/02-ARCHITECTURE.md §6.
// ============================================================================

import type {
  Affordance,
  GameObject,
  NotebookEntry,
  ObjectState,
  PuzzleInstance,
  Requirement,
  Reveal,
  RoomSpec,
  SolutionNode,
  Zone,
} from './types';

// ————————————————————————————————— Index de salle —————————————————————————————————

/** Index précalculé d'une salle pour des accès O(1) pendant la résolution. */
export interface RoomIndex {
  room: RoomSpec;
  objectsById: Map<string, GameObject>;
  puzzlesById: Map<string, PuzzleInstance>;
  nodesById: Map<string, SolutionNode>;
  zonesById: Map<string, Zone>;
  /** mechanismObjectId → puzzles attachés (généralement 1). */
  puzzlesByMechanism: Map<string, PuzzleInstance[]>;
  /** objectId → id du nœud ITEM qu'il matérialise (carrier). */
  itemNodeByCarrier: Map<string, string>;
}

export function buildIndex(room: RoomSpec): RoomIndex {
  const objectsById = new Map<string, GameObject>();
  for (const o of room.objects) objectsById.set(o.id, o);

  const puzzlesById = new Map<string, PuzzleInstance>();
  const puzzlesByMechanism = new Map<string, PuzzleInstance[]>();
  for (const p of room.puzzles) {
    puzzlesById.set(p.id, p);
    const list = puzzlesByMechanism.get(p.mechanismObjectId) ?? [];
    list.push(p);
    puzzlesByMechanism.set(p.mechanismObjectId, list);
  }

  const nodesById = new Map<string, SolutionNode>();
  const itemNodeByCarrier = new Map<string, string>();
  for (const n of room.graph.nodes) {
    nodesById.set(n.id, n);
    if (n.type === 'ITEM' && n.carrier) itemNodeByCarrier.set(n.carrier, n.id);
  }

  const zonesById = new Map<string, Zone>();
  for (const z of room.zones) zonesById.set(z.id, z);

  return {
    room,
    objectsById,
    puzzlesById,
    nodesById,
    zonesById,
    puzzlesByMechanism,
    itemNodeByCarrier,
  };
}

// ————————————————————————————————— État de résolution —————————————————————————————————

/**
 * État mutable interne partagé par le solveur et le runtime. Les Set/Map
 * rendent la boucle du solveur efficace ; le runtime le convertit depuis /
 * vers le `PlayerState` sérialisable à chaque action.
 */
export interface ResolveState {
  acquired: Set<string>;
  solved: Set<string>;
  objectStates: Map<string, ObjectState>;
  notebook: NotebookEntry[];
}

export function emptyResolveState(): ResolveState {
  return {
    acquired: new Set(),
    solved: new Set(),
    objectStates: new Map(),
    notebook: [],
  };
}

// ————————————————————————————————— Prédicats (requires) —————————————————————————————————

export function getObjectState(idx: RoomIndex, state: ResolveState, objectId: string): ObjectState {
  const s = state.objectStates.get(objectId);
  if (s) return s;
  const o = idx.objectsById.get(objectId);
  return o ? o.initialState : 'hidden';
}

/** Une zone est accessible si elle n'a pas de porte, ou si sa porte est résolue. */
export function isZoneAccessible(idx: RoomIndex, state: ResolveState, zoneId: string): boolean {
  const zone = idx.zonesById.get(zoneId);
  if (!zone) return false;
  if (!zone.gate) return true;
  return state.solved.has(zone.gate);
}

/** Un objet est atteignable s'il est visible/actif et dans une zone accessible (ou en inventaire). */
export function isObjectReachable(idx: RoomIndex, state: ResolveState, objectId: string): boolean {
  const o = idx.objectsById.get(objectId);
  if (!o) return false;
  const st = getObjectState(idx, state, objectId);
  if (st === 'hidden') return false;
  if (st === 'taken') return true; // ramassé → en inventaire, toujours manipulable
  const loc = o.location;
  if (loc === 'inventory') return true;
  if (loc === 'hidden') return false;
  return isZoneAccessible(idx, state, loc.zoneId);
}

function requirementApplies(req: Requirement, affordance: Affordance): boolean {
  if (req.kind === 'puzzle') return true;
  if (req.for === undefined) return true;
  return req.for === affordance;
}

function requirementMet(state: ResolveState, req: Requirement): boolean {
  if (req.kind === 'puzzle') return state.solved.has(req.puzzleId);
  return state.acquired.has(req.nodeId);
}

/** Toutes les conditions de `object.requires` qui concernent cette affordance sont-elles remplies ? */
export function requirementsMetFor(
  object: GameObject,
  state: ResolveState,
  affordance: Affordance,
): boolean {
  return object.requires.every(
    (r) => !requirementApplies(r, affordance) || requirementMet(state, r),
  );
}

// ————————————————————————————————— Effets : reveals —————————————————————————————————

/** Ce qu'a produit le déclenchement d'un reveal (pour émettre des GameEvent en aval). */
export interface RevealOutcome {
  objectId: string;
  text: string;
  /** nœuds INFO/ITEM nouvellement acquis. */
  gainedNodes: string[];
  /** objets cachés nouvellement rendus visibles. */
  revealedObjects: string[];
}

/**
 * Applique un reveal (récolte). Idempotent : re-déclencher n'ajoute rien de
 * nouveau (les Set dédoublonnent, le carnet est gardé contre les doublons).
 */
export function fireReveal(
  idx: RoomIndex,
  state: ResolveState,
  object: GameObject,
  reveal: Reveal,
): RevealOutcome {
  const gainedNodes: string[] = [];
  const revealedObjects: string[] = [];

  for (const nodeId of reveal.nodeIds) {
    if (state.acquired.has(nodeId)) continue;
    state.acquired.add(nodeId);
    gainedNodes.push(nodeId);
    const node = idx.nodesById.get(nodeId);
    if (node && node.type === 'INFO' && !state.notebook.some((e) => e.nodeId === nodeId)) {
      state.notebook.push({ nodeId, objectId: object.id, text: reveal.text });
    }
  }

  for (const objId of reveal.objectIds ?? []) {
    if (getObjectState(idx, state, objId) === 'hidden') {
      state.objectStates.set(objId, 'visible');
      revealedObjects.push(objId);
    }
  }

  return { objectId: object.id, text: reveal.text, gainedNodes, revealedObjects };
}

// ————————————————————————————————— Effets : puzzles —————————————————————————————————

/** L'affordance par laquelle un puzzle se résout, dérivée du type de solution. */
export function solvingAffordance(puzzle: PuzzleInstance): Affordance {
  switch (puzzle.solution.kind) {
    case 'code':
      return 'enter_code';
    case 'sequence':
      return 'enter_sequence';
    case 'combine':
      return 'combine';
    case 'key':
    case 'use_on':
      return 'use_on';
  }
}

export interface PuzzleOutcome {
  puzzle: PuzzleInstance;
  /** outputs nouvellement acquis. */
  gained: string[];
  /** reveals du mécanisme déclenchés par la résolution. */
  revealOutcomes: RevealOutcome[];
  mechanismState: ObjectState;
}

/**
 * Applique les effets d'un puzzle résolu : outputs acquis, puzzle marqué résolu,
 * état du mécanisme changé, reveals du mécanisme (pour l'affordance de résolution)
 * déclenchés. C'est LE point de convergence solveur / runtime.
 */
export function applyPuzzleEffects(
  idx: RoomIndex,
  state: ResolveState,
  puzzle: PuzzleInstance,
): PuzzleOutcome {
  state.solved.add(puzzle.id);

  const gained: string[] = [];
  for (const nodeId of puzzle.outputs) {
    if (!state.acquired.has(nodeId)) {
      state.acquired.add(nodeId);
      gained.push(nodeId);
    }
  }

  const aff = solvingAffordance(puzzle);
  const mechanismState: ObjectState =
    aff === 'enter_sequence' || aff === 'activate' ? 'activated' : 'open';
  state.objectStates.set(puzzle.mechanismObjectId, mechanismState);

  const revealOutcomes: RevealOutcome[] = [];
  const mech = idx.objectsById.get(puzzle.mechanismObjectId);
  if (mech) {
    for (const reveal of mech.reveals) {
      if (reveal.on === aff) revealOutcomes.push(fireReveal(idx, state, mech, reveal));
    }
  }

  return { puzzle, gained, revealOutcomes, mechanismState };
}

/** Les inputs d'un puzzle sont-ils tous acquis (condition d'applicabilité du solveur) ? */
export function puzzleInputsSatisfied(state: ResolveState, puzzle: PuzzleInstance): boolean {
  return puzzle.inputs.every((n) => state.acquired.has(n));
}

// ————————————————————————————————— Dérivés —————————————————————————————————

/** Inventaire = objets porteurs des nœuds ITEM acquis (docs/types PlayerState). */
export function deriveInventory(idx: RoomIndex, state: ResolveState): string[] {
  const inv: string[] = [];
  for (const nodeId of state.acquired) {
    const node = idx.nodesById.get(nodeId);
    if (node && node.type === 'ITEM' && node.carrier) inv.push(node.carrier);
  }
  return inv;
}
