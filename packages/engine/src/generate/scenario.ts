// ============================================================================
// GÉNÉRATION — ÉTAPE 1 : SCÉNARIO (docs/02-ARCHITECTURE.md §3, étape 1).
// Tire dans le theme pack : titre, histoire implicite, objectif, motifs.
// ============================================================================

import type { Rng } from '../rng';
import type { Narrative } from '../types';
import type { ThemePack } from '../content/themes/index';

export interface Scenario {
  theme: ThemePack;
  narrative: Narrative;
  /** motifs narratifs disponibles pour justifier les puzzles */
  motifs: string[];
}

export function buildScenario(rng: Rng, theme: ThemePack): Scenario {
  const n = theme.narrative;
  const narrative: Narrative = {
    title: rng.pick(n.titles),
    backstory: rng.pick(n.backstories),
    playerObjective: rng.pick(n.objectives),
    epilogue: rng.pick(n.epilogues),
  };
  // sous-ensemble stable de motifs (au moins 2)
  const motifs = rng.shuffle(n.motifs).slice(0, Math.min(3, n.motifs.length));
  return { theme, narrative, motifs };
}
