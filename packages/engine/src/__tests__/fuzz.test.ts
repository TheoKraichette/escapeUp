// ============================================================================
// HARNESS DE FUZZ — génère >= 500 salles par difficulté avec des seeds variés
// et ASSERTE pour chacune : validateRoom → solvable ET 0 lint 'error'.
// Toute salle qui échoue est un bug de génération. Le fuzz doit finir VERT.
// Les statistiques de métriques par difficulté sont journalisées.
// ============================================================================

import { describe, it, expect } from 'vitest';
import type { Difficulty, DifficultyMetrics } from '../types';
import { generateRoom } from '../generate/index';
import { validateRoom } from '../validate/index';

const N_PER_DIFFICULTY = 500;

interface Stat {
  min: number;
  max: number;
  sum: number;
  n: number;
}
const stat = (): Stat => ({ min: Infinity, max: -Infinity, sum: 0, n: 0 });
const push = (s: Stat, v: number) => {
  s.min = Math.min(s.min, v);
  s.max = Math.max(s.max, v);
  s.sum += v;
  s.n += 1;
};
const fmt = (s: Stat) => `min=${s.min} max=${s.max} moy=${(s.sum / s.n).toFixed(1)}`;

/** Seeds variés et déterministes (chiffres, lettres, symboles, longueurs). */
function fuzzSeed(i: number): string {
  const tags = ['daily', 'zeta', 'A7', 'x', 'seed_', 'salle-du-jour', 'q'];
  return `${tags[i % tags.length]}-${i}-${(i * 2654435761) >>> 0}`;
}

describe('FUZZ — solvabilité & fairness par construction', () => {
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    it(
      `${N_PER_DIFFICULTY} salles (${diff}) : toutes solvables, 0 lint error`,
      () => {
        const keys: (keyof DifficultyMetrics)[] = [
          'criticalPathDepth',
          'parallelBranches',
          'multiZoneJoinPuzzles',
          'maxInferenceSteps',
          'zoneCount',
          'estimatedMinutes',
          'decoyCount',
        ];
        const stats: Record<string, Stat> = {};
        for (const k of keys) stats[k] = stat();
        let objectsTotal = stat();
        let puzzlesTotal = stat();
        const failures: string[] = [];

        for (let i = 0; i < N_PER_DIFFICULTY; i++) {
          const seed = fuzzSeed(i);
          let room;
          try {
            room = generateRoom(seed, { difficulty: diff });
          } catch (e) {
            failures.push(`seed=${seed} THROW ${(e as Error).message}`);
            continue;
          }
          const res = validateRoom(room);
          if (!res.solvable || !res.lints.pass) {
            const errs = res.lints.findings
              .filter((f) => f.level === 'error')
              .map((f) => `${f.lint}:${f.message}`)
              .join(' | ');
            failures.push(
              `seed=${seed} solvable=${res.solvable} lints=[${errs}]` +
                (res.solve.solvable ? '' : ` missing=${res.solve.missing.join(',')}`),
            );
          }
          for (const k of keys) push(stats[k]!, room.metrics[k]);
          push(objectsTotal, room.objects.length);
          push(puzzlesTotal, room.puzzles.length);
        }

        // eslint-disable-next-line no-console
        console.log(
          `\n[FUZZ ${diff}] ${N_PER_DIFFICULTY} salles — échecs: ${failures.length}\n` +
            keys.map((k) => `  ${k}: ${fmt(stats[k]!)}`).join('\n') +
            `\n  objects: ${fmt(objectsTotal)}\n  puzzles: ${fmt(puzzlesTotal)}`,
        );
        if (failures.length > 0) {
          // eslint-disable-next-line no-console
          console.error(`[FUZZ ${diff}] premiers échecs:\n` + failures.slice(0, 10).join('\n'));
        }

        expect(failures).toEqual([]);
      },
      120_000,
    );
  }
});

describe('FUZZ — déterminisme sur échantillon', () => {
  it('50 seeds régénérés à l’identique (toutes difficultés)', () => {
    for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
      for (let i = 0; i < 50; i++) {
        const seed = fuzzSeed(i * 7 + 3);
        const a = generateRoom(seed, { difficulty: diff });
        const b = generateRoom(seed, { difficulty: diff });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    }
  });
});
