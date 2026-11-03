// ============================================================================
// RUNTIME DE JEU (serveur autoritaire) — docs/02-ARCHITECTURE.md §6.
// ----------------------------------------------------------------------------
// applyAction et un pas du solveur partagent LA MÊME logique de résolution :
// tout passe par ../resolve (requires → effets). Ici on ne fait qu'aiguiller
// une action discrète vers fireReveal / applyPuzzleEffects, puis émettre des
// GameEvent et re-sérialiser l'état.
//
// REDACTION STRICTE (deriveClientView) : jamais de solution, dérivation, graphe,
// backstory, ni texte de reveal non découvert.
// ============================================================================

import type {
  Action,
  ActionResult,
  ClientObjectView,
  ClientRoomView,
  ClientZoneView,
  GameEvent,
  Hint,
  ObjectState,
  PlayerState,
  PuzzleInstance,
  RoomSpec,
} from '../types';
import {
  applyPuzzleEffects,
  buildIndex,
  deriveInventory,
  fireReveal,
  getObjectState,
  isObjectReachable,
  isZoneAccessible,
  requirementsMetFor,
  solvingAffordance,
  type ResolveState,
  type RoomIndex,
} from '../resolve';

// ————————————————————————————————— Conversions état —————————————————————————————————

function toResolveState(state: PlayerState): ResolveState {
  return {
    acquired: new Set(state.acquired),
    solved: new Set(state.solvedPuzzles),
    objectStates: new Map(Object.entries(state.objectStates)),
    notebook: state.notebook.map((e) => ({ ...e })),
  };
}

function writeBack(prev: PlayerState, rs: ResolveState, action: Action): PlayerState {
  const objectStates: Record<string, ObjectState> = {};
  for (const [k, v] of rs.objectStates) objectStates[k] = v;
  return {
    seed: prev.seed,
    acquired: [...rs.acquired],
    objectStates,
    solvedPuzzles: [...rs.solved],
    notebook: rs.notebook,
    hintsUsed: { ...prev.hintsUsed },
    actionLog: [...prev.actionLog, action],
  };
}

// ————————————————————————————————— État initial —————————————————————————————————

export function createInitialState(room: RoomSpec): PlayerState {
  return {
    seed: room.seed,
    acquired: [],
    objectStates: {},
    solvedPuzzles: [],
    notebook: [],
    hintsUsed: {},
    actionLog: [],
  };
}

// ————————————————————————————————— applyAction —————————————————————————————————

export function applyAction(room: RoomSpec, state: PlayerState, action: Action): ActionResult {
  const idx = buildIndex(room);
  const rs = toResolveState(state);
  const events: GameEvent[] = [];

  switch (action.type) {
    case 'inspect':
    case 'read':
      handleInteraction(idx, rs, events, action.objectId, action.type);
      break;
    case 'take':
      handleTake(idx, rs, events, action.objectId);
      break;
    case 'activate':
      // activate peut résoudre un puzzle-mécanisme (séquence) ou simplement récolter
      if (!tryActivateMechanism(idx, rs, events, action.objectId)) {
        handleInteraction(idx, rs, events, action.objectId, 'activate');
      }
      break;
    case 'enter_code':
      handleCode(idx, rs, events, action.objectId, action.code);
      break;
    case 'enter_sequence':
      handleSequence(idx, rs, events, action.objectId, action.steps);
      break;
    case 'use_on':
      handleUseOn(idx, rs, events, action.toolObjectId, action.targetObjectId);
      break;
    case 'combine':
      handleCombine(idx, rs, events, action.objectIds);
      break;
  }

  if (events.length === 0) {
    events.push({ type: 'noop', message: "Rien ne se produit." });
  }
  return { state: writeBack(state, rs, action), events };
}

// ————————————————————————————————— Handlers reveals —————————————————————————————————

function handleInteraction(
  idx: RoomIndex,
  rs: ResolveState,
  events: GameEvent[],
  objectId: string,
  affordance: 'inspect' | 'read' | 'activate',
): void {
  const obj = idx.objectsById.get(objectId);
  if (!obj || !isObjectReachable(idx, rs, objectId)) return;
  if (!obj.affordances.includes(affordance)) return;
  if (!requirementsMetFor(obj, rs, affordance)) return;

  for (const reveal of obj.reveals) {
    if (reveal.on !== affordance) continue;
    const out = fireReveal(idx, rs, obj, reveal);
    events.push({ type: 'text', objectId, text: reveal.text });
    for (const rid of out.revealedObjects) events.push({ type: 'object_revealed', objectId: rid });
    for (const n of out.gainedNodes) emitGain(idx, events, n, reveal.text);
  }
}

function handleTake(idx: RoomIndex, rs: ResolveState, events: GameEvent[], objectId: string): void {
  const obj = idx.objectsById.get(objectId);
  if (!obj || !isObjectReachable(idx, rs, objectId)) return;
  if (!obj.affordances.includes('take')) return;
  if (!requirementsMetFor(obj, rs, 'take')) return;
  if (getObjectState(idx, rs, objectId) === 'taken') return;

  for (const reveal of obj.reveals) {
    if (reveal.on !== 'take') continue;
    const out = fireReveal(idx, rs, obj, reveal);
    if (reveal.text.trim().length > 0) events.push({ type: 'text', objectId, text: reveal.text });
    for (const rid of out.revealedObjects) events.push({ type: 'object_revealed', objectId: rid });
  }
  rs.objectStates.set(objectId, 'taken');
  events.push({ type: 'item_taken', objectId });
}

// ————————————————————————————————— Handlers puzzles —————————————————————————————————

/** Trouve le puzzle attaché à ce mécanisme dont la solution correspond à l'affordance. */
function puzzleFor(
  idx: RoomIndex,
  objectId: string,
  kinds: PuzzleInstance['solution']['kind'][],
): PuzzleInstance | undefined {
  const list = idx.puzzlesByMechanism.get(objectId) ?? [];
  return list.find((p) => kinds.includes(p.solution.kind));
}

/** Vérifie que le mécanisme est manipulable pour l'affordance de résolution. */
function mechanismReachable(idx: RoomIndex, rs: ResolveState, p: PuzzleInstance): boolean {
  const mech = idx.objectsById.get(p.mechanismObjectId);
  if (!mech || !isObjectReachable(idx, rs, p.mechanismObjectId)) return false;
  return requirementsMetFor(mech, rs, solvingAffordance(p));
}

function solveAndEmit(
  idx: RoomIndex,
  rs: ResolveState,
  events: GameEvent[],
  p: PuzzleInstance,
): void {
  const outcome = applyPuzzleEffects(idx, rs, p);
  events.push({ type: 'puzzle_solved', puzzleId: p.id, unlocked: p.outputs });

  for (const zone of idx.room.zones) {
    if (zone.gate === p.id) events.push({ type: 'zone_unlocked', zoneId: zone.id });
  }
  for (const nodeId of outcome.gained) {
    const node = idx.nodesById.get(nodeId);
    if (!node) continue;
    if (node.type === 'STATE') events.push({ type: 'state_changed', nodeId, label: node.label });
    if (node.type === 'GOAL') events.push({ type: 'goal_reached', epilogue: idx.room.narrative.epilogue });
  }
  for (const ro of outcome.revealOutcomes) {
    if (ro.text.trim().length > 0) events.push({ type: 'text', objectId: ro.objectId, text: ro.text });
    for (const rid of ro.revealedObjects) events.push({ type: 'object_revealed', objectId: rid });
    for (const n of ro.gainedNodes) emitGain(idx, events, n, ro.text);
  }
}

function failure(idx: RoomIndex, events: GameEvent[], objectId: string): void {
  const controls = idx.objectsById.get(objectId)?.controls;
  const label = controls && 'label' in controls ? controls.label : undefined;
  const message = label
    ? `Mécanisme refusé : ce contrôle attend « ${label} ».`
    : `Mécanisme refusé : entrée incorrecte.`;
  events.push({ type: 'failure', objectId, message });
}

function handleCode(
  idx: RoomIndex,
  rs: ResolveState,
  events: GameEvent[],
  objectId: string,
  code: string,
): void {
  const p = puzzleFor(idx, objectId, ['code']);
  if (!p || p.solution.kind !== 'code') return;
  if (rs.solved.has(p.id) || !mechanismReachable(idx, rs, p)) return;
  if (code === p.solution.value) solveAndEmit(idx, rs, events, p);
  else failure(idx, events, objectId);
}

function handleSequence(
  idx: RoomIndex,
  rs: ResolveState,
  events: GameEvent[],
  objectId: string,
  steps: string[],
): void {
  const p = puzzleFor(idx, objectId, ['sequence']);
  if (!p || p.solution.kind !== 'sequence') return;
  if (rs.solved.has(p.id) || !mechanismReachable(idx, rs, p)) return;
  if (arraysEqual(steps, p.solution.steps)) solveAndEmit(idx, rs, events, p);
  else failure(idx, events, objectId);
}

function tryActivateMechanism(
  idx: RoomIndex,
  rs: ResolveState,
  events: GameEvent[],
  objectId: string,
): boolean {
  const list = idx.puzzlesByMechanism.get(objectId) ?? [];
  const p = list.find((q) => solvingAffordance(q) === 'activate');
  if (!p) return false;
  if (rs.solved.has(p.id) || !mechanismReachable(idx, rs, p)) return true;
  solveAndEmit(idx, rs, events, p);
  return true;
}

function handleUseOn(
  idx: RoomIndex,
  rs: ResolveState,
  events: GameEvent[],
  toolObjectId: string,
  targetObjectId: string,
): void {
  const p = puzzleFor(idx, targetObjectId, ['use_on', 'key']);
  if (!p || (p.solution.kind !== 'use_on' && p.solution.kind !== 'key')) return;
  if (rs.solved.has(p.id) || !mechanismReachable(idx, rs, p)) return;

  const toolNodeId = p.solution.kind === 'key' ? p.solution.itemNodeId : p.solution.toolNodeId;
  const expectedCarrier = idx.nodesById.get(toolNodeId)?.carrier;
  const toolHeld = rs.acquired.has(toolNodeId);
  const targetOk = p.solution.kind === 'key' ? true : p.solution.targetObjectId === targetObjectId;

  if (toolHeld && expectedCarrier === toolObjectId && targetOk) solveAndEmit(idx, rs, events, p);
  else failure(idx, events, targetObjectId);
}

function handleCombine(
  idx: RoomIndex,
  rs: ResolveState,
  events: GameEvent[],
  objectIds: string[],
): void {
  // Le combine peut être déclaré sur n'importe lequel de ses composants comme mécanisme.
  const candidate = objectIds
    .flatMap((oid) => idx.puzzlesByMechanism.get(oid) ?? [])
    .find((p) => p.solution.kind === 'combine');
  if (!candidate || candidate.solution.kind !== 'combine') return;
  if (rs.solved.has(candidate.id) || !mechanismReachable(idx, rs, candidate)) return;

  const wantCarriers = candidate.solution.itemNodeIds
    .map((n) => idx.nodesById.get(n)?.carrier)
    .filter((c): c is string => Boolean(c))
    .sort();
  const allHeld = candidate.solution.itemNodeIds.every((n) => rs.acquired.has(n));
  const given = [...objectIds].sort();
  if (allHeld && arraysEqual(given, wantCarriers)) solveAndEmit(idx, rs, events, candidate);
  else failure(idx, events, candidate.mechanismObjectId);
}

// ————————————————————————————————— Émission d'événements —————————————————————————————————

function emitGain(idx: RoomIndex, events: GameEvent[], nodeId: string, text: string): void {
  const node = idx.nodesById.get(nodeId);
  if (!node) return;
  if (node.type === 'INFO') events.push({ type: 'info_gained', nodeId, text });
  else if (node.type === 'ITEM' && node.carrier) events.push({ type: 'item_taken', objectId: node.carrier });
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ————————————————————————————————— Vue client expurgée —————————————————————————————————

export function deriveClientView(room: RoomSpec, state: PlayerState): ClientRoomView {
  const idx = buildIndex(room);
  const rs = toResolveState(state);

  const zones: ClientZoneView[] = room.zones.map((z) => {
    const accessible = isZoneAccessible(idx, rs, z.id);
    return {
      id: z.id,
      name: z.name,
      accessible,
      // On ne divulgue pas la structure des zones encore verrouillées.
      pois: accessible ? z.pois : [],
    };
  });

  const objects: ClientObjectView[] = [];
  for (const obj of room.objects) {
    if (!isObjectReachable(idx, rs, obj.id)) continue;
    const view: ClientObjectView = {
      id: obj.id,
      name: obj.name,
      description: obj.description,
      family: obj.family,
      location: obj.location,
      state: getObjectState(idx, rs, obj.id),
      affordances: obj.affordances,
      // reveals, requires, narrativeFragment : JAMAIS exposés.
    };
    if (obj.controls) view.controls = obj.controls;
    objects.push(view);
  }

  const goalReached = rs.acquired.has(room.graph.goalId);
  const result: ClientRoomView = {
    seed: room.seed,
    theme: room.theme,
    title: room.narrative.title,
    playerObjective: room.narrative.playerObjective,
    zones,
    objects,
    inventory: deriveInventory(idx, rs),
    notebook: state.notebook,
    solvedPuzzles: [...rs.solved],
    puzzleCount: room.puzzles.length,
    goalReached,
  };
  if (goalReached) result.epilogue = room.narrative.epilogue;
  return result;
}

// ————————————————————————————————— Hints —————————————————————————————————

export function getHint(room: RoomSpec, state: PlayerState, puzzleId?: string): Hint {
  const idx = buildIndex(room);
  const rs = toResolveState(state);

  const target = puzzleId ? idx.puzzlesById.get(puzzleId) : pickFrontierPuzzle(idx, rs);
  if (!target) {
    throw new Error(`getHint : aucun puzzle courant (puzzleId=${puzzleId ?? 'auto'})`);
  }
  const used = state.hintsUsed[target.id] ?? 0;
  const level = Math.min(4, used + 1) as 1 | 2 | 3 | 4;
  const text = target.hints[level - 1] ?? target.hints[3];
  return { puzzleId: target.id, level, text };
}

/**
 * Frontière courante : premier puzzle non résolu dont tous les inputs sont acquis
 * (immédiatement solvable) ; à défaut, le puzzle non résolu le plus « proche »
 * (le plus d'inputs déjà acquis).
 */
function pickFrontierPuzzle(idx: RoomIndex, rs: ResolveState): PuzzleInstance | undefined {
  const unsolved = idx.room.puzzles.filter((p) => !rs.solved.has(p.id));
  const ready = unsolved.find((p) => p.inputs.every((n) => rs.acquired.has(n)));
  if (ready) return ready;
  let best: PuzzleInstance | undefined;
  let bestScore = -1;
  for (const p of unsolved) {
    const score = p.inputs.filter((n) => rs.acquired.has(n)).length;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}
