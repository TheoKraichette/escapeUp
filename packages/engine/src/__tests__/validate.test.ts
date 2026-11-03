import { describe, it, expect } from 'vitest';
import { validateRoom } from '../validate/index';
import { makeLabRoom } from '../__fixtures__/labRoom';

describe('validateRoom — agrégat solveur + lints + métriques', () => {
  it('déclare la salle de référence valide (solvable, 0 lint error)', () => {
    const res = validateRoom(makeLabRoom());
    expect(res.solvable).toBe(true);
    expect(res.lints.pass).toBe(true);
    const valid = res.solvable && res.lints.pass;
    expect(valid).toBe(true);
  });

  it('calcule des métriques cohérentes avec le graphe', () => {
    const { metrics } = validateRoom(makeLabRoom());
    expect(metrics.criticalPathDepth).toBe(3);
    expect(metrics.zoneCount).toBe(2);
    expect(metrics.parallelBranches).toBe(1);
    expect(metrics.multiZoneJoinPuzzles).toBe(0);
    expect(metrics.maxInferenceSteps).toBe(2);
    expect(metrics.decoyCount).toBe(0);
    expect(metrics.estimatedMinutes).toBeGreaterThan(0);
  });
});
