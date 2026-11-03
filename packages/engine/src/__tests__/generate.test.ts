import { describe, it, expect } from 'vitest';
import type { Action, Difficulty, PlayerState, RoomSpec, SolutionNode } from '../types';
import { generateRoom } from '../generate/index';
import { validateRoom, solveRoom } from '../validate/index';
import { applyAction, createInitialState, deriveClientView } from '../runtime/index';
import { BUDGETS } from '../generate/budget';
import { TEMPLATES, ALL_TEMPLATE_IDS } from '../content/templates/index';
import { THEMES, THEME_IDS } from '../content/themes/index';

const carrierOf = (room: RoomSpec, nodeId: string): string => {
  const n = room.graph.nodes.find((x: SolutionNode) => x.id === nodeId);
  if (!n?.carrier) throw new Error(`nœud ${nodeId} sans carrier`);
  return n.carrier;
};

/** Traduit un puzzle en action de résolution (comme le ferait un joueur parfait). */
function actionForPuzzle(room: RoomSpec, puzzleId: string): Action {
  const p = room.puzzles.find((q) => q.id === puzzleId)!;
  switch (p.solution.kind) {
    case 'code':
      return { type: 'enter_code', objectId: p.mechanismObjectId, code: p.solution.value };
    case 'sequence':
      return { type: 'enter_sequence', objectId: p.mechanismObjectId, steps: p.solution.steps };
    case 'key':
      return {
        type: 'use_on',
        toolObjectId: carrierOf(room, p.solution.itemNodeId),
        targetObjectId: p.mechanismObjectId,
      };
    case 'use_on':
      return {
        type: 'use_on',
        toolObjectId: carrierOf(room, p.solution.toolNodeId),
        targetObjectId: p.solution.targetObjectId,
      };
    case 'combine':
      return {
        type: 'combine',
        objectIds: p.solution.itemNodeIds.map((n) => carrierOf(room, n)),
      };
  }
}

describe('generateRoom — déterminisme', () => {
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    it(`même (seed, config) → RoomSpec identique octet pour octet (${diff})`, () => {
      const a = generateRoom(`det-${diff}`, { difficulty: diff });
      const b = generateRoom(`det-${diff}`, { difficulty: diff });
      expect(a).toEqual(b);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  }

  it('seeds différentes → salles différentes', () => {
    const a = generateRoom('alpha', { difficulty: 'medium' });
    const b = generateRoom('beta', { difficulty: 'medium' });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('un thème imposé est respecté', () => {
    const room = generateRoom('themed', { difficulty: 'easy', theme: 'navire' });
    expect(room.theme).toBe('navire');
  });
});

describe('generateRoom — budget de difficulté (GDD §9)', () => {
  const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

  it('easy : profondeur 3-4, 1 branche, 0 jointure, 2 zones, 0 leurre', () => {
    const m = generateRoom('budget-easy', { difficulty: 'easy' }).metrics;
    expect(inRange(m.criticalPathDepth, 3, 4)).toBe(true);
    expect(m.parallelBranches).toBe(1);
    expect(m.multiZoneJoinPuzzles).toBe(0);
    expect(m.zoneCount).toBe(2);
    expect(inRange(m.maxInferenceSteps, 1, 2)).toBe(true);
    expect(m.decoyCount).toBe(0);
  });

  it('medium : profondeur 6-7 (fourchette GDD 5-7), 2 branches, 1 jointure, 3 zones', () => {
    const m = generateRoom('budget-medium', { difficulty: 'medium' }).metrics;
    expect(inRange(m.criticalPathDepth, 6, 7)).toBe(true);
    expect(m.parallelBranches).toBe(2);
    expect(m.multiZoneJoinPuzzles).toBe(1);
    expect(m.zoneCount).toBe(3);
    expect(inRange(m.maxInferenceSteps, 1, 2)).toBe(true);
  });

  // Rééquilibrage (retour joueur) : le pic de profondeur 9-10 du hard était
  // punitif — profondeur critique FIXE à 8, richesse reportée en largeur
  // (10 puzzles, 3 branches parallèles, assemblage + outil révélateur).
  it('hard : profondeur 8 exacte, 3 branches, 2 jointures, 4-5 zones, inférence 3, 1-2 leurres', () => {
    const m = generateRoom('budget-hard', { difficulty: 'hard' }).metrics;
    expect(m.criticalPathDepth).toBe(8);
    expect(m.parallelBranches).toBe(3);
    expect(m.multiZoneJoinPuzzles).toBe(2);
    expect(inRange(m.zoneCount, 4, 5)).toBe(true);
    expect(m.maxInferenceSteps).toBe(3);
    expect(inRange(m.decoyCount, 1, 2)).toBe(true);
  });
});

describe('generateRoom — parcours de bout en bout (applyAction jusqu’au GOAL)', () => {
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    it(`un joueur suivant la trace du solveur atteint le GOAL (${diff})`, () => {
      const room = generateRoom(`e2e-${diff}`, { difficulty: diff });
      const solve = solveRoom(room);
      expect(solve.solvable).toBe(true);
      if (!solve.solvable) return;

      let state: PlayerState = createInitialState(room);
      for (const pass of solve.trace) {
        for (const puzzleId of pass.solved) {
          const res = applyAction(room, state, actionForPuzzle(room, puzzleId));
          state = res.state;
          expect(res.events.some((e) => e.type === 'failure')).toBe(false);
          expect(state.solvedPuzzles).toContain(puzzleId);
        }
      }

      expect(state.acquired).toContain(room.graph.goalId);
      const view = deriveClientView(room, state);
      expect(view.goalReached).toBe(true);
      expect(view.epilogue).toBe(room.narrative.epilogue);
    });
  }
});

describe('generateRoom — vue client expurgée (anti-fuite)', () => {
  it('ne divulgue aucune solution ni structure interne au départ', () => {
    const room = generateRoom('leak', { difficulty: 'hard' });
    const view = deriveClientView(room, createInitialState(room));
    const json = JSON.stringify(view);
    for (const p of room.puzzles) {
      if (p.solution.kind === 'code') expect(json).not.toContain(p.solution.value);
    }
    expect(json).not.toContain('derivation');
    expect(json).not.toContain('"graph"');
    expect(json).not.toContain(room.narrative.backstory);
  });
});

/** Vérifie qu'aucune valeur solution n'apparaît en dur dans le budget (garde-fou). */
describe('BUDGETS — cohérence des cibles', () => {
  it('les trois profils existent', () => {
    expect(Object.keys(BUDGETS).sort()).toEqual(['easy', 'hard', 'medium']);
  });
});

describe('contenu — templates & thèmes déclarés (donnée)', () => {
  it('les 10 templates du GDD §5 sont déclarés avec clueSpec + 4 hints', () => {
    expect(ALL_TEMPLATE_IDS.sort()).toEqual(
      [
        'cipher_substitution',
        'code_from_document',
        'combine_items',
        'key_lock',
        'labeled_dial_code',
        'logic_deduction',
        'mapping_sequence',
        'mechanism_sequence',
        'spatial_observation',
        'tool_reveal',
      ].sort(),
    );
    for (const id of ALL_TEMPLATE_IDS) {
      const t = TEMPLATES[id];
      expect(t.clueSpec.length).toBeGreaterThan(0);
      expect(t.hintGabarits).toHaveLength(4);
      expect(t.fairnessRules.length).toBeGreaterThan(0);
    }
  });

  it('au moins 2 theme packs complets avec matrice de compatibilité', () => {
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(2);
    for (const id of THEME_IDS) {
      const th = THEMES[id]!;
      expect(th.vocab.codeLock.length).toBeGreaterThan(0);
      expect(th.vocab.document.length).toBeGreaterThan(0);
      expect(Object.keys(th.compatibility).length).toBe(ALL_TEMPLATE_IDS.length);
      expect(th.words.every((w) => w.length >= 7)).toBe(true);
    }
  });

  it('la génération instancie les 10 templates (couverture totale)', () => {
    const used = new Set<string>();
    for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
      for (let i = 0; i < 40; i++) {
        const room = generateRoom(`cover-${diff}-${i}`, { difficulty: diff });
        for (const p of room.puzzles) used.add(p.template);
      }
    }
    // tool_reveal et combine_items sont désormais câblés : couverture 10/10.
    expect([...used].sort()).toEqual([...ALL_TEMPLATE_IDS].sort());
  });
});
