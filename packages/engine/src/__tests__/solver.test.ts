import { describe, it, expect } from 'vitest';
import { solveRoom } from '../validate/solver';
import { makeLabRoom } from '../__fixtures__/labRoom';

const sorted = (a: string[]) => [...a].sort();

describe('solveRoom — joueur parfait', () => {
  it('résout la salle et produit la trace canonique en 3 passes', () => {
    const res = solveRoom(makeLabRoom());
    expect(res.solvable).toBe(true);
    if (!res.solvable) return;

    expect(res.trace).toHaveLength(3);

    const [p1, p2, p3] = res.trace;
    expect(p1!.pass).toBe(1);
    expect(sorted(p1!.harvested)).toEqual(['info.badge', 'info.memo']);
    expect(p1!.solved).toEqual(['p_code']);
    expect(p1!.gained).toEqual(['item.cle']);

    expect(p2!.solved).toEqual(['p_key']);
    expect(p2!.gained).toEqual(['access.z2']);

    expect(p3!.harvested).toEqual(['info.annee']);
    expect(p3!.solved).toEqual(['p_dial']);
    expect(p3!.gained).toEqual(['goal.sortie']);
  });

  it('détecte une salle insoluble et remonte la frontière manquante', () => {
    const room = makeLabRoom();
    // On coupe la révélation du badge : info.badge ne peut plus être récolté.
    const comptoir = room.objects.find((o) => o.id === 'obj.comptoir')!;
    comptoir.reveals = [];

    const res = solveRoom(room);
    expect(res.solvable).toBe(false);
    if (res.solvable) return;
    expect(res.missing).toContain('info.badge');
    // le GOAL n'est jamais atteint
    expect(res.trace.some((p) => p.gained.includes('goal.sortie'))).toBe(false);
  });
});
