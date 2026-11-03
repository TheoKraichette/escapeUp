// ============================================================================
// CONTENU — REGISTRE DES THEME PACKS.
// ============================================================================

import type { Rng } from '../../rng';
import type { ThemePack } from './types';
import { LABORATOIRE } from './laboratoire';
import { NAVIRE } from './navire';
import { MANOIR } from './manoir';
import { BUNKER } from './bunker';

export type { ThemePack, ThemeVocab, NameDesc } from './types';

export const THEMES: Record<string, ThemePack> = {
  laboratoire: LABORATOIRE,
  navire: NAVIRE,
  manoir: MANOIR,
  bunker: BUNKER,
};

export const THEME_IDS = Object.keys(THEMES);

/** Résout le theme pack demandé, ou en tire un déterministe depuis la seed. */
export function resolveTheme(rng: Rng, requested?: string): ThemePack {
  if (requested && THEMES[requested]) return THEMES[requested]!;
  const id = rng.pick(THEME_IDS);
  return THEMES[id]!;
}
