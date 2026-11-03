// Palettes procédurales : n'importe quel `theme` généré donne une ambiance
// cohérente et déterministe (aucun asset externe, tout est teinté au runtime).

export interface Palette {
  wall: string;
  floor: string;
  ceiling: string;
  accent: string;
  fog: string;
  ambient: number; // intensité lumière ambiante
  key: number; // intensité lumière principale
  /** teinte de la lampe des pièces (identité du thème : froid clinique, bougie…) */
  lamp: string;
}

/** Hash déterministe d'une chaîne (FNV-1a 32 bits). */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Convertit HSL (0..360, 0..1, 0..1) en hex `#rrggbb`. */
export function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Teinte de base identitaire par thème (le reste est varié par la seed).
 *  Teintes ÉLOIGNÉES les unes des autres : l'identité doit se voir au premier
 *  coup d'œil (manoir 32 ≈ navire 28 se confondaient — retour joueur). */
const THEME_HUE: Record<string, number> = {
  laboratoire: 190, // teal clinique
  navire: 215, // acier marine / coque bleutée
  manoir: 345, // bordeaux feutré
  vaisseau: 260,
  temple: 45,
  bunker: 90, // olive militaire
};

/** Lumière des pièces par thème (blanc froid, lanterne, bougie, sodium…). */
const THEME_LAMP: Record<string, string> = {
  laboratoire: '#eaf6ff', // néon froid
  navire: '#ffd9a8', // lanterne de bord
  manoir: '#ffc98f', // bougie / âtre
  bunker: '#f2e8c8', // ampoule nue jaunie
};

/** Un flottant 0..1 déterministe extrait d'un octet du hash. */
function unit(h: number, shift: number): number {
  return ((h >>> shift) & 0xff) / 255;
}

/**
 * Palette procédurale. La teinte de BASE vient du thème (identité), mais chaque
 * SALLE (via sa seed) reçoit son propre décalage de teinte, sa saturation, sa
 * clarté et son ambiance lumineuse → deux salles du même thème ne se ressemblent
 * plus. Entièrement déterministe (aucun asset).
 */
/**
 * Teinte de base d'une SALLE : identité du thème, décalée de ±14° par la seed —
 * assez pour varier d'une salle à l'autre, jamais au point de brouiller le
 * thème. Réutilisée par l'UI (variable CSS --ui-h) pour teinter les panneaux.
 */
export function uiHueFor(theme: string, seed = ''): number {
  const baseHueTheme = THEME_HUE[theme.toLowerCase()] ?? hashString(theme) % 360;
  const sh = hashString(`${theme}|${seed}`);
  return (baseHueTheme + (unit(sh, 0) - 0.5) * 28 + 360) % 360;
}

/** Duo de couleurs représentatif d'un thème (pastilles/fond de l'accueil). */
export function themeSwatch(theme: string): { base: string; accent: string } {
  const hue = THEME_HUE[theme.toLowerCase()] ?? hashString(theme) % 360;
  return { base: hslHex(hue, 0.34, 0.3), accent: hslHex((hue + 42) % 360, 0.68, 0.62) };
}

export function paletteFor(theme: string, seed = ''): Palette {
  const sh = hashString(`${theme}|${seed}`); // variation propre à la salle
  const baseHue = uiHueFor(theme, seed);

  // Luminosités relevées (retour joueur : rendu terne et noirâtre) — le
  // contraste vient des lumières et du post-processing, pas de murs charbon.
  const wallS = 0.22 + unit(sh, 8) * 0.12; // 0.22..0.34
  const wallL = 0.24 + unit(sh, 16) * 0.08; // 0.24..0.32
  const wall = hslHex(baseHue, wallS, wallL);
  const floor = hslHex((baseHue + 12) % 360, wallS * 0.85, wallL * 0.75);
  const ceiling = hslHex(baseHue, wallS * 0.8, wallL * 0.6);

  // Accent coloré dérivé de la teinte de la salle → chaque salle a sa couleur clé.
  const accentHue = (baseHue + 42 + (unit(sh, 24) - 0.5) * 40 + 360) % 360;
  const accent = hslHex(accentHue, 0.68, 0.62);

  // Fog teinté un peu plus clair : la profondeur reste lisible en enfilade.
  const fog = hslHex(baseHue, 0.3, 0.09 + unit(sh, 4) * 0.03);
  const ambient = 0.52 + unit(sh, 12) * 0.22; // 0.52..0.74
  const key = 0.9 + unit(sh, 20) * 0.4; // 0.90..1.30
  const lamp = THEME_LAMP[theme.toLowerCase()] ?? '#fff5e6';

  return { wall, floor, ceiling, accent, fog, ambient, key, lamp };
}

/** Couleurs par famille d'objet (matériaux procéduraux). */
export const FAMILY_COLORS = {
  mechanism: { base: '#586b7d', panel: '#2f3d4c', metal: '#8fa2b3' },
  info_carrier: { paper: '#e8e2cf', screen: '#16303f', ink: '#2a2a2a' },
  instrument: { base: '#c9a24b' },
  decor: { base: '#3a4550' },
} as const;
