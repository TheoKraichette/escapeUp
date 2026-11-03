// ============================================================================
// GÉNÉRATION — BUDGET DE DIFFICULTÉ (GDD §9).
// Le générateur DÉPENSE ce budget : profondeur de chaîne, branches parallèles,
// puzzles de jointure multi-zones, zones, leurres. Les valeurs visent le cœur
// des fourchettes du GDD pour garantir des métriques dans la cible.
// ============================================================================

import type { Difficulty } from '../types';

export interface DifficultyBudget {
  /** nombre de zones (GDD : 2 / 3 / 4-5) */
  zoneCount: number;
  /** profondeur de la chaîne critique de puzzles (GDD : 3-4 / 5-7 / 8-10) */
  depth: number;
  /** branches parallèles cibles (GDD : 1 / 2 / 2-3) */
  branches: number;
  /** puzzles de jointure T7/T8 (GDD : 0 / 1 / 2) */
  joins: number;
  /** pas d'inférence max autorisé (GDD : 1-2 / 2 / 3) */
  maxInfer: number;
  /** leurres narratifs (GDD : 0 / 0 / 1-2) */
  decoys: number;
}

// NB : seuls `zoneCount` (skeleton.ts) et `decoys` (place.ts) sont CONSOMMÉS ;
// depth/branches/joins/maxInfer documentent les cibles que les scaffolds de
// graph.ts réalisent par construction et que generate.test.ts verrouille.
// Rééquilibrage (retour joueur : easy/medium trop simples, hard trop dur) :
//   - medium : +2 puzzles via l'assemblage (combine_items) en largeur,
//     profondeur 6-7 (dans la fourchette GDD 5-7) ;
//   - hard : profondeur critique FIXE à 8 (l'ancien pic 9-10 était punitif),
//     compensée par 10 puzzles et 3 branches parallèles (largeur, pas longueur) ;
//   - leurres : medium 1, hard 1 (inchangé).
export const BUDGETS: Record<Difficulty, DifficultyBudget> = {
  easy: { zoneCount: 2, depth: 3, branches: 1, joins: 0, maxInfer: 2, decoys: 0 },
  medium: { zoneCount: 3, depth: 6, branches: 2, joins: 1, maxInfer: 2, decoys: 1 },
  hard: { zoneCount: 4, depth: 8, branches: 3, joins: 2, maxInfer: 3, decoys: 1 },
};
