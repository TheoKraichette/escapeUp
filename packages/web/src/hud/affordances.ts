// Vocabulaire partagé des affordances et familles d'objets — pur TS, SANS
// import Three : ce module est consommé à la fois par le HUD (chunk principal)
// et par la scène 3D (chunk lazy). Ne rien y importer de lourd.
import type { ClientObjectView } from '@escapeup/engine';

/** Verbe principal d'un objet : ce que le clic évident fera. */
export function primaryVerb(obj: ClientObjectView): string {
  if (obj.state === 'open' || obj.state === 'activated') return 'ouvert';
  if (obj.affordances.includes('enter_code')) return 'code';
  if (obj.affordances.includes('enter_sequence')) return 'séquence';
  if (obj.affordances.includes('read')) return 'lire';
  if (obj.affordances.includes('take')) return 'prendre';
  if (obj.affordances.includes('use_on')) return 'utiliser';
  if (obj.affordances.includes('activate')) return 'activer';
  return 'examiner';
}

export const FAMILY_GLYPH: Record<ClientObjectView['family'], string> = {
  mechanism: '⛭',
  info_carrier: '▤',
  instrument: '◆',
  decor: '○',
};

export const FAMILY_LABEL: Record<ClientObjectView['family'], string> = {
  mechanism: 'Mécanisme',
  info_carrier: 'Document',
  instrument: 'Objet',
  decor: 'Décor',
};
