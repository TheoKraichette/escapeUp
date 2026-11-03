// ============================================================================
// GÉNÉRATION — ÉTAPE 2 : SQUELETTE (docs/02-ARCHITECTURE.md §3, étape 2).
// Crée les zones en couches (L0 = départ, L1, L2…) et leurs points d'intérêt.
// Les portes (gate) sont posées ensuite par graph.ts (le puzzle qui verrouille).
// ============================================================================

import type { Blueprint } from './blueprint';
import type { ThemePack } from '../content/themes/index';
import type { DifficultyBudget } from './budget';

/** POI par zone (assez pour séparer les indices de jointure). */
const POIS_PER_ZONE = 4;

export function buildSkeleton(bp: Blueprint, theme: ThemePack, budget: DifficultyBudget): void {
  const zoneNames = theme.zoneNames;
  // Mélange déterministe puis distribution SANS remise : deux zones ne partagent
  // un nom de POI que si le pool du thème est plus petit que zones × POI.
  const poiNames = bp.rng.shuffle([...theme.poiNames]);
  let poiCursor = 0;

  for (let layer = 0; layer < budget.zoneCount; layer++) {
    const zoneId = `z${layer}`;
    const name = zoneNames[layer % zoneNames.length]!;
    const pois = [];
    for (let i = 0; i < POIS_PER_ZONE; i++) {
      const poiName = poiNames[poiCursor % poiNames.length]!;
      poiCursor++;
      pois.push({ id: `${zoneId}.poi${i}`, name: poiName });
    }
    bp.zones.push({ id: zoneId, name, layer, pois });
  }
}
