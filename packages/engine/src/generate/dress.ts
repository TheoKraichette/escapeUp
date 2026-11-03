// ============================================================================
// GÉNÉRATION — ÉTAPE 4 : HABILLAGE (docs/02-ARCHITECTURE.md §3, étape 4).
// Fonctions pures d'assemblage de texte. Les substrings critiques pour les
// lints (anchorLabel, valeur du code) sont placés ici de façon garantie :
//   - la description du mécanisme et le texte de l'indice portent l'ancre ;
//   - le texte de l'indice porte la valeur (seul nombre de sa catégorie).
// ============================================================================

import type { PuzzleTemplateId } from '../types';
import { TEMPLATES, fill, type Gabarit } from '../content/templates/index';

/** Description de mécanisme à code : la plaque grave l'ancre (anchor-check). */
export function mechanismDescription(baseDesc: string, anchor: string): string {
  return `${baseDesc} Une plaque gravée indique « ${anchor} ».`;
}

/** Instancie les 4 hints d'un template avec le contexte concret. */
export function buildHints(
  template: PuzzleTemplateId,
  ctx: Record<string, string>,
): [string, string, string, string] {
  const g = TEMPLATES[template].hintGabarits;
  return [fill(g[0], ctx), fill(g[1], ctx), fill(g[2], ctx), fill(g[3], ctx)];
}

/** Instancie un gabarit d'indice du template (indice n° i). */
export function clueGabarit(
  template: PuzzleTemplateId,
  index: number,
  ctx: Record<string, string>,
): string {
  const gabs = TEMPLATES[template].clueGabarits;
  const g: Gabarit = gabs[index % gabs.length] ?? gabs[0]!;
  return fill(g, ctx);
}

/** Une phrase d'ambiance narrative SANS aucun nombre (sûre pour decoy-check). */
export function ambientLine(motif: string): string {
  return `Ici, tout rappelle « ${motif} » : quelqu'un est parti sans se retourner.`;
}
