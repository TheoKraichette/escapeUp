import { describe, it, expect } from 'vitest';
import type { Action, GameEvent, PlayerState } from '../types';
import { makeLabRoom } from '../__fixtures__/labRoom';
import {
  applyAction,
  createInitialState,
  deriveClientView,
  getHint,
} from '../runtime/index';

const room = makeLabRoom();

/** Rejoue une liste d'actions et renvoie l'état final + tous les événements. */
function run(state: PlayerState, actions: Action[]): { state: PlayerState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const res = applyAction(room, s, a);
    s = res.state;
    events.push(...res.events);
  }
  return { state: s, events };
}

describe('applyAction — parcours complet jusqu’au GOAL', () => {
  it('un joueur suivant la trace atteint la sortie', () => {
    const { state, events } = run(createInitialState(room), [
      { type: 'read', objectId: 'obj.memo' },
      { type: 'inspect', objectId: 'obj.comptoir' },
      { type: 'read', objectId: 'obj.badge' },
      { type: 'enter_code', objectId: 'obj.casier', code: '418' },
      { type: 'take', objectId: 'obj.cle' },
      { type: 'use_on', toolObjectId: 'obj.cle', targetObjectId: 'obj.porte' },
      { type: 'read', objectId: 'obj.rapport' },
      { type: 'enter_code', objectId: 'obj.panneau', code: '1987' },
    ]);

    const types = events.map((e) => e.type);
    expect(types).toContain('object_revealed'); // badge puis clé
    expect(types).toContain('zone_unlocked');
    expect(types).toContain('goal_reached');

    expect(state.solvedPuzzles.sort()).toEqual(['p_code', 'p_dial', 'p_key']);

    const view = deriveClientView(room, state);
    expect(view.goalReached).toBe(true);
    expect(view.epilogue).toBe(room.narrative.epilogue);
    expect(view.inventory).toContain('obj.cle');
  });

  it('un code erroné renvoie un échec informatif citant le label du mécanisme', () => {
    const res = applyAction(room, createInitialState(room), {
      type: 'enter_code',
      objectId: 'obj.casier',
      code: '000',
    });
    const failure = res.events.find((e) => e.type === 'failure');
    expect(failure).toBeDefined();
    expect(failure!.type).toBe('failure');
    if (failure!.type === 'failure') {
      expect(failure!.message).toContain("NUMERO D'EMPLOYE");
      // jamais la solution
      expect(failure!.message).not.toContain('418');
    }
    // l'état n'a pas avancé
    expect(res.state.solvedPuzzles).toHaveLength(0);
  });
});

describe('deriveClientView — rédaction stricte (anti-fuite)', () => {
  it('ne divulgue aucune solution, dérivation, graphe, backstory ni texte non découvert', () => {
    const view = deriveClientView(room, createInitialState(room));
    const json = JSON.stringify(view);

    // valeurs solutions
    expect(json).not.toContain('418');
    expect(json).not.toContain('1987');
    // backstory interne
    expect(json).not.toContain(room.narrative.backstory);
    // structures internes
    expect(json).not.toContain('derivation');
    expect(json).not.toContain('sourceClue');
    expect(json).not.toContain('"graph"');
    // aucun texte de reveal non découvert
    for (const obj of room.objects) {
      for (const reveal of obj.reveals) {
        if (reveal.text.trim().length > 0) expect(json).not.toContain(reveal.text);
      }
    }

    // la zone verrouillée n'expose ni ses POI ni ses objets
    const z2 = view.zones.find((z) => z.id === 'z2')!;
    expect(z2.accessible).toBe(false);
    expect(z2.pois).toHaveLength(0);
    expect(view.objects.some((o) => o.id === 'obj.panneau')).toBe(false);
    // les objets cachés (badge, clé) restent invisibles au départ
    expect(view.objects.some((o) => o.id === 'obj.badge')).toBe(false);
    expect(view.objects.some((o) => o.id === 'obj.cle')).toBe(false);
  });
});

describe('getHint — escalade dérivée du graphe', () => {
  it('cible la frontière et escalade de 1 à 4 sans dépasser', () => {
    const base = createInitialState(room);

    const h1 = getHint(room, base);
    expect(h1.puzzleId).toBe('p_code');
    expect(h1.level).toBe(1);
    expect(h1.text).toBe(room.puzzles[0]!.hints[0]);

    const s2: PlayerState = { ...base, hintsUsed: { p_code: 1 } };
    expect(getHint(room, s2).level).toBe(2);

    const s4: PlayerState = { ...base, hintsUsed: { p_code: 9 } };
    const h4 = getHint(room, s4);
    expect(h4.level).toBe(4);
    expect(h4.text).toBe(room.puzzles[0]!.hints[3]);
  });

  it('accepte un puzzleId explicite', () => {
    const h = getHint(room, createInitialState(room), 'p_dial');
    expect(h.puzzleId).toBe('p_dial');
    expect(h.level).toBe(1);
  });
});
