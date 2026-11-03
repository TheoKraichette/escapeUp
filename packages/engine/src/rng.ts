// PRNG déterministe seedé (xmur3 + mulberry32).
// Toute la génération passe par ce module : jamais Math.random ni Date.now.

export interface Rng {
  /** flottant dans [0, 1) */
  next(): number;
  /** entier dans [min, max] inclus */
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  chance(p: number): boolean;
  /** sous-générateur stable par label : deux forks du même label sont identiques */
  fork(label: string): Rng;
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const next = mulberry32(xmur3(seed)());
  return {
    next,
    int(min, max) {
      if (max < min) throw new Error(`int(${min}, ${max}) : bornes inversées`);
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(arr) {
      if (arr.length === 0) throw new Error('pick() sur tableau vide');
      return arr[Math.floor(next() * arr.length)]!;
    },
    shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a;
    },
    chance(p) {
      return next() < p;
    },
    fork(label) {
      return createRng(`${seed}/${label}`);
    },
  };
}
