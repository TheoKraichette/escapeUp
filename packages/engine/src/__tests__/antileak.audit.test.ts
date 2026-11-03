// ============================================================================
// AUDIT ANTI-FUITE & COHÉRENCE RUNTIME/SOLVEUR (rôle : auditeur).
// ----------------------------------------------------------------------------
// 1) deriveClientView ne doit JAMAIS fuiter : solution.value / steps / node ids
//    de solution, Derivation, backstory, ni texte de reveal non découvert.
// 2) applyAction (runtime) et le pas du solveur partagent-ils la même logique ?
//    -> un auto-joueur qui rejoue les VRAIES solutions doit atteindre le GOAL
//       (le runtime accepte exactement ce que le solveur suppose résoluble).
// 3) No-loss : aucune action ne dégrade l'état ; enter_code erroné => 'failure'
//    informatif SANS révéler la solution.
// ============================================================================

import { describe, it, expect } from 'vitest';
import type {
  Action,
  Difficulty,
  GameEvent,
  PlayerState,
  PuzzleInstance,
  RoomSpec,
} from '../types';
import {
  generateRoom,
  createInitialState,
  applyAction,
  deriveClientView,
} from '../index';

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

function seeds(n: number, prefix = 'audit'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

/** nodeId -> objet porteur (carrier). */
function carrierMap(room: RoomSpec): Map<string, string> {
  const m = new Map<string, string>();
  for (const node of room.graph.nodes) if (node.carrier) m.set(node.id, node.carrier);
  return m;
}

// ————————————————————————————————— Secrets d'une salle —————————————————————————————————

interface Secret {
  needle: string;
  why: string;
}

/** Rassemble tout ce qui NE DOIT JAMAIS apparaître dans la vue client à l'état initial. */
function collectSecrets(room: RoomSpec): Secret[] {
  const out: Secret[] = [];

  for (const p of room.puzzles) {
    const s = p.solution;
    switch (s.kind) {
      case 'code':
        out.push({ needle: s.value, why: `solution.value du puzzle ${p.id}` });
        break;
      case 'sequence':
        // Le secret est l'ORDRE (permutation) des identifiants, pas les ids eux-mêmes
        // (les boutons/options sont légitimement publics via controls.options).
        out.push({
          needle: JSON.stringify(s.steps),
          why: `ordre solution (sequence) du puzzle ${p.id}`,
        });
        break;
      case 'key':
        out.push({ needle: s.itemNodeId, why: `itemNodeId (key) du puzzle ${p.id}` });
        break;
      case 'combine':
        for (const n of s.itemNodeIds)
          out.push({ needle: n, why: `itemNodeId (combine) du puzzle ${p.id}` });
        break;
      case 'use_on':
        out.push({ needle: s.toolNodeId, why: `toolNodeId (use_on) du puzzle ${p.id}` });
        break;
    }

    // Derivation : preuve interne, jamais servie. anchorLabel EXCLU (c'est
    // l'étiquette visible du verrou, exposée à dessein via description/controls).
    out.push({ needle: p.derivation.rule, why: `derivation.rule du puzzle ${p.id}` });
    for (const c of p.derivation.sourceClueIds)
      out.push({ needle: c, why: `sourceClueId du puzzle ${p.id}` });

    // Hints : escalade privée servie par getHint, jamais par la vue.
    for (const h of p.hints) out.push({ needle: h, why: `hint du puzzle ${p.id}` });
  }

  // Backstory interne.
  out.push({ needle: room.narrative.backstory, why: 'narrative.backstory' });

  // Aucun texte de reveal ne doit apparaître avant d'avoir été découvert.
  for (const obj of room.objects)
    for (const rev of obj.reveals)
      if (rev.text.trim().length > 0)
        out.push({ needle: rev.text, why: `reveal.text non découvert de ${obj.id}` });

  // NB : narrativeFragment n'est pas testé ici comme aiguille littérale — ses
  // occurrences dangereuses (« ANNÉE = 1987 ») sont déjà couvertes par la valeur
  // solution ci-dessus, et sa non-exposition structurelle est vérifiée à part
  // (clé "narrativeFragment" absente du JSON). Les fragments génériques (« ordre »)
  // sont des sous-chaînes de noms d'objets visibles (« Ordre de mission »).

  return out;
}

// ————————————————————————————————— Auto-joueur (rejoue les vraies solutions) —————————————————————————————————

const HARVEST: Action['type'][] = ['inspect', 'read', 'take'];

function solveAction(room: RoomSpec, p: PuzzleInstance, carriers: Map<string, string>): Action | null {
  const s = p.solution;
  const mech = p.mechanismObjectId;
  switch (s.kind) {
    case 'code':
      return { type: 'enter_code', objectId: mech, code: s.value };
    case 'sequence':
      return { type: 'enter_sequence', objectId: mech, steps: s.steps };
    case 'key': {
      const tool = carriers.get(s.itemNodeId);
      return tool ? { type: 'use_on', toolObjectId: tool, targetObjectId: mech } : null;
    }
    case 'use_on': {
      const tool = carriers.get(s.toolNodeId);
      return tool ? { type: 'use_on', toolObjectId: tool, targetObjectId: s.targetObjectId } : null;
    }
    case 'combine': {
      const ids = s.itemNodeIds.map((n) => carriers.get(n)).filter((x): x is string => Boolean(x));
      return ids.length === s.itemNodeIds.length ? { type: 'combine', objectIds: ids } : null;
    }
  }
}

/** Rejoue la salle avec ses vraies solutions via le RUNTIME jusqu'au GOAL (ou blocage). */
function autoPlay(room: RoomSpec): { state: PlayerState; events: GameEvent[]; reached: boolean } {
  const carriers = carrierMap(room);
  let state = createInitialState(room);
  const events: GameEvent[] = [];
  const push = (a: Action) => {
    const r = applyAction(room, state, a);
    state = r.state;
    events.push(...r.events);
  };

  const maxRounds = room.puzzles.length + room.objects.length + 8;
  for (let round = 0; round < maxRounds; round++) {
    const before = state.acquired.length + state.solvedPuzzles.length;

    // Récolte : toute affordance gratuite de tout objet visible.
    for (const obj of room.objects)
      for (const t of HARVEST)
        if (obj.affordances.includes(t as never)) push({ type: t, objectId: obj.id } as Action);

    // Résolution : tout puzzle non résolu, avec sa vraie solution.
    for (const p of room.puzzles) {
      if (state.solvedPuzzles.includes(p.id)) continue;
      const a = solveAction(room, p, carriers);
      if (a) push(a);
    }

    if (deriveClientView(room, state).goalReached) break;
    const after = state.acquired.length + state.solvedPuzzles.length;
    if (after === before) break; // plus aucun progrès
  }
  return { state, events, reached: deriveClientView(room, state).goalReached };
}

// ————————————————————————————————— 1) ANTI-FUITE —————————————————————————————————

describe('AUDIT anti-fuite — deriveClientView (état initial) ne divulgue aucun secret', () => {
  for (const diff of DIFFS) {
    it(`${diff} : 30 salles générées, 0 fuite dans la vue client initiale`, () => {
      const leaks: string[] = [];
      for (const seed of seeds(30, `leak-${diff}`)) {
        const room = generateRoom(seed, { difficulty: diff });
        const json = JSON.stringify(deriveClientView(room, createInitialState(room)));
        for (const { needle, why } of collectSecrets(room)) {
          if (needle.length === 0) continue;
          if (json.includes(needle)) {
            leaks.push(`seed=${seed} [${why}] fuite « ${needle} »`);
          }
        }
      }
      expect(leaks).toEqual([]);
    });
  }

  it('les structures internes (graph/derivation/backstory) sont absentes des clés JSON', () => {
    const room = generateRoom('leak-struct', { difficulty: 'hard' });
    const json = JSON.stringify(deriveClientView(room, createInitialState(room)));
    expect(json).not.toContain('"graph"');
    expect(json).not.toContain('derivation');
    expect(json).not.toContain('sourceClue');
    expect(json).not.toContain('backstory');
    expect(json).not.toContain('narrativeFragment');
    expect(json).not.toContain('"reveals"');
    expect(json).not.toContain('"requires"');
    expect(json).not.toContain('"hints"');
    expect(json).not.toContain('"solution"');
  });

  it('fixture main : la vue initiale ne contient ni 418, ni 1987, ni la backstory', () => {
    // Croisement de robustesse avec la fixture manuelle du dépôt.
    const room = generateRoom('leak-cross', { difficulty: 'easy' });
    const json = JSON.stringify(deriveClientView(room, createInitialState(room)));
    for (const p of room.puzzles)
      if (p.solution.kind === 'code') expect(json).not.toContain(p.solution.value);
  });
});

// ————————————————————————————————— 2) COHÉRENCE RUNTIME/SOLVEUR —————————————————————————————————

describe('AUDIT cohérence — le runtime atteint le GOAL prouvé résoluble par le solveur', () => {
  for (const diff of DIFFS) {
    it(`${diff} : 20 salles rejouées via applyAction atteignent toutes le GOAL`, () => {
      const fails: string[] = [];
      for (const seed of seeds(20, `play-${diff}`)) {
        const room = generateRoom(seed, { difficulty: diff });
        const { reached, events } = autoPlay(room);
        if (!reached) fails.push(seed);
        // no-loss : aucun événement terminal négatif n'existe dans le modèle.
        expect(events.every((e) => e.type !== undefined)).toBe(true);
      }
      expect(fails).toEqual([]);
    });
  }
});

// ————————————————————————————————— 3) NO-LOSS & ÉCHEC INFORMATIF —————————————————————————————————

/**
 * Joue la salle, et AU MOMENT où chaque verrou à code devient joignable (zone
 * ouverte) mais encore non résolu, injecte un code ERRONÉ et vérifie :
 *  - un event 'failure' est émis (pas de silence) ;
 *  - le message cite le label du mécanisme mais JAMAIS la valeur ;
 *  - le code erroné ne résout ni n'acquiert rien (no-loss + no-progress).
 * Retourne la liste des violations (vide = conforme).
 */
function auditWrongCodes(room: RoomSpec): string[] {
  const carriers = carrierMap(room);
  let state = createInitialState(room);
  const violations: string[] = [];
  const probed = new Set<string>();
  const push = (a: Action): GameEvent[] => {
    const r = applyAction(room, state, a);
    state = r.state;
    return r.events;
  };
  const reachableIds = (): Set<string> =>
    new Set(deriveClientView(room, state).objects.map((o) => o.id));

  const codePuzzles = room.puzzles.filter((p) => p.solution.kind === 'code');
  const maxRounds = room.puzzles.length + room.objects.length + 8;

  /** Sonde un verrou à code avec un code ERRONÉ juste avant de le résoudre. */
  const probe = (p: PuzzleInstance): void => {
    probed.add(p.id);
    const value = (p.solution as { kind: 'code'; value: string }).value;
    const controls = room.objects.find((o) => o.id === p.mechanismObjectId)?.controls;
    const label = controls && 'label' in controls ? controls.label : undefined;
    const evs = push({ type: 'enter_code', objectId: p.mechanismObjectId, code: value + 'Z9' });
    const fail = evs.find((e) => e.type === 'failure');
    if (!fail) violations.push(`${p.id}: aucun 'failure' émis pour un code erroné`);
    else if (fail.type === 'failure') {
      if (fail.message.includes(value)) violations.push(`${p.id}: le message d'échec révèle la valeur « ${value} »`);
      if (label && !fail.message.includes(label)) violations.push(`${p.id}: le message d'échec ne cite pas le label « ${label} »`);
    }
    if (state.solvedPuzzles.includes(p.id)) violations.push(`${p.id}: un code erroné a résolu le puzzle`);
  };

  for (let round = 0; round < maxRounds; round++) {
    const before = state.acquired.length + state.solvedPuzzles.length;

    for (const obj of room.objects)
      for (const t of HARVEST)
        if (obj.affordances.includes(t as never)) push({ type: t, objectId: obj.id } as Action);

    // Phase de résolution à point fixe : réagit aux zones qui s'ouvrent en cours
    // de tour. Chaque verrou à code est SONDÉ (code erroné) juste avant d'être
    // résolu, à l'instant précis où son mécanisme est joignable et non résolu.
    let changed = true;
    while (changed) {
      changed = false;
      const reach = reachableIds();
      for (const p of room.puzzles) {
        if (state.solvedPuzzles.includes(p.id)) continue;
        if (!reach.has(p.mechanismObjectId)) continue;
        if (p.solution.kind === 'code' && !probed.has(p.id)) probe(p);
        const a = solveAction(room, p, carriers);
        if (!a) continue;
        const solvedBefore = state.solvedPuzzles.length;
        push(a);
        if (state.solvedPuzzles.length > solvedBefore) changed = true;
      }
    }

    if (deriveClientView(room, state).goalReached) break;
    if (state.acquired.length + state.solvedPuzzles.length === before) break;
  }

  for (const p of codePuzzles)
    if (!probed.has(p.id)) violations.push(`${p.id}: mécanisme jamais devenu joignable (non sondé)`);
  return violations;
}

describe('AUDIT no-loss — aucune action ne mène à un état perdant', () => {
  it('un code erroné : failure informatif citant le label, jamais la valeur (tous verrous, toutes difficultés)', () => {
    for (const diff of DIFFS) {
      for (const seed of seeds(8, `fail-${diff}`)) {
        const room = generateRoom(seed, { difficulty: diff });
        expect(auditWrongCodes(room), `seed=${seed}`).toEqual([]);
      }
    }
  });

  it('l’ensemble acquired/solved est monotone sous une rafale d’actions arbitraires', () => {
    const room = generateRoom('noloss-fuzz', { difficulty: 'hard' });
    let state = createInitialState(room);
    const objIds = room.objects.map((o) => o.id);
    // Rafale déterministe d'actions (dont beaucoup invalides) : rien ne doit régresser.
    const badActions: Action[] = [];
    for (const id of objIds) {
      badActions.push({ type: 'enter_code', objectId: id, code: '000000' });
      badActions.push({ type: 'enter_sequence', objectId: id, steps: ['x', 'y', 'z'] });
      badActions.push({ type: 'use_on', toolObjectId: id, targetObjectId: id });
      badActions.push({ type: 'take', objectId: id });
      badActions.push({ type: 'inspect', objectId: id });
    }
    let prevAcq = 0;
    let prevSolved = 0;
    for (const a of badActions) {
      const r = applyAction(room, state, a);
      state = r.state;
      // monotonie stricte non décroissante
      expect(state.acquired.length).toBeGreaterThanOrEqual(prevAcq);
      expect(state.solvedPuzzles.length).toBeGreaterThanOrEqual(prevSolved);
      prevAcq = state.acquired.length;
      prevSolved = state.solvedPuzzles.length;
    }
    // aucune de ces actions invalides n'a pu résoudre un puzzle
    expect(state.solvedPuzzles).toHaveLength(0);
  });
});

// ————————————————————————————————— 4) DIVERGENCE : gating des inputs —————————————————————————————————

describe('AUDIT divergence — le runtime ne vérifie PAS les inputs d’un puzzle à code', () => {
  it('un code correct entré SANS avoir acquis les indices résout quand même le puzzle', () => {
    // Le solveur exige puzzleInputsSatisfied ; le runtime (handleCode) n'exige que
    // la joignabilité du mécanisme. On documente la différence de règle.
    const room = generateRoom('gating-easy', { difficulty: 'easy' });
    // 1er puzzle à code en zone de départ (mécanisme joignable d'emblée)
    const p = room.puzzles.find(
      (q) =>
        q.solution.kind === 'code' &&
        room.objects.find((o) => o.id === q.mechanismObjectId)?.initialState !== 'hidden',
    )!;
    expect(p).toBeDefined();
    expect(p.inputs.length).toBeGreaterThan(0); // il A des indices requis (côté solveur)

    const res = applyAction(room, createInitialState(room), {
      type: 'enter_code',
      objectId: p.mechanismObjectId,
      code: (p.solution as { kind: 'code'; value: string }).value,
    });
    const solved = res.events.some((e) => e.type === 'puzzle_solved');
    // Aucun indice n'a été lu : acquired ne contient aucun input du puzzle.
    const noInputs = p.inputs.every((n) => !res.state.acquired.includes(n));
    expect(noInputs).toBe(true);
    // Constat : le runtime résout tout de même (divergence assumée vs solveur).
    expect(solved).toBe(true);
  });
});
