// ============================================================================
// GÉNÉRATION — ÉTAPE 5 : PLACEMENT / AMBIANCE (docs/02-ARCHITECTURE.md §3, §5).
// Ajoute le décor d'ambiance et, en difficulté élevée, les LEURRES narratifs
// (règle d'or n°8 : thématiquement justifiés, jamais bloquants, et SANS aucune
// valeur candidate — d'où des textes strictement dépourvus de nombres).
// ============================================================================

import type { GraphCtx } from './graph';
import { addObject, nextId, pickNameDesc, pickPoi } from './blueprint';
import { ambientLine } from './dress';
import type { NameDesc } from '../content/themes/index';

export function decorateRoom(g: GraphCtx): void {
  const bp = g.bp;
  const theme = g.theme;

  // 1 décor muet par zone (ambiance, ne compte pas comme leurre : reveals vides).
  for (const zone of bp.zones) {
    const d: NameDesc = pickNameDesc(bp, theme.vocab.decor);
    addObject(bp, {
      id: nextId(bp, 'obj'),
      name: d.name,
      description: d.desc,
      family: 'decor',
      location: { zoneId: zone.id, poiId: pickPoi(bp, zone.id) },
      initialState: 'visible',
      affordances: ['inspect'],
      reveals: [],
      requires: [],
    });
  }

  // Leurres (difficulté élevée) : décor PORTEUR d'un fragment narratif, mais
  // dont le texte ne contient aucun nombre → decoy-check satisfait.
  const nonStartZones = bp.zones.filter((z) => z.layer > 0);
  for (let i = 0; i < g.budget.decoys; i++) {
    const zone = nonStartZones.length > 0 ? bp.rng.pick(nonStartZones) : bp.zones[0]!;
    const d: NameDesc = pickNameDesc(bp, theme.vocab.decor);
    const motif = bp.rng.pick(g.scenario.motifs);
    addObject(bp, {
      id: nextId(bp, 'obj'),
      name: d.name,
      description: d.desc,
      family: 'decor',
      location: { zoneId: zone.id, poiId: pickPoi(bp, zone.id) },
      initialState: 'visible',
      affordances: ['inspect'],
      reveals: [{ on: 'inspect', nodeIds: [], text: ambientLine(motif) }],
      requires: [],
      narrativeFragment: motif,
    });
  }
}
