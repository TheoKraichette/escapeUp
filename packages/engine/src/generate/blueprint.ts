// ============================================================================
// GÉNÉRATION — ACCUMULATEUR DE SALLE (« Blueprint »).
// ----------------------------------------------------------------------------
// Structure mutable que les gadgets de graph.ts remplissent (zones, objets,
// puzzles, nœuds, arêtes). Fournit l'allocation déterministe d'identifiants et
// de VALEURS de code, en garantissant l'unicité de catégorie sémantique
// numérique (au plus un verrou par longueur de chiffres, au plus un « année »)
// → ambiguity-check satisfait par construction.
// ============================================================================

import type { Rng } from '../rng';
import type {
  GameObject,
  GenerationConfig,
  MechanismControls,
  Narrative,
  NodeType,
  PuzzleInstance,
  SolutionEdge,
  SolutionNode,
  Zone,
} from '../types';
import type { CodeCategory } from '../content/templates/index';
import type { NameDesc } from '../content/themes/index';

export interface Blueprint {
  seed: string;
  config: GenerationConfig;
  rng: Rng;
  themeId: string;
  narrative: Narrative;
  zones: Zone[];
  objects: GameObject[];
  puzzles: PuzzleInstance[];
  nodes: SolutionNode[];
  edges: SolutionEdge[];
  goalId: string;
  /** longueurs de chiffres déjà attribuées (unicité de catégorie numérique) */
  usedDigitLengths: Set<number>;
  yearUsed: boolean;
  /** mots-lettres déjà utilisés (évite deux verrous à lettres identiques) */
  usedWords: Set<string>;
  /** ancres de verrous à lettres déjà utilisées (unicité d'ancre — [W4]) */
  usedLetterAnchors: Set<string>;
  /** noms d'objets déjà attribués : deux objets d'une salle ne partagent JAMAIS
   *  un nom (un joueur ne peut pas distinguer deux « Armoire forte ») */
  usedObjectNames: Set<string>;
  /** couleurs d'étiquette déjà portées par une clé (une clé = une porte) */
  usedKeyColors: Set<string>;
  /** nodeId d'ITEM-clé → couleur de son étiquette (lue par keyLock) */
  keyColorByNode: Map<string, string>;
  counters: Record<string, number>;
}

export function createBlueprint(
  seed: string,
  config: GenerationConfig,
  rng: Rng,
  themeId: string,
): Blueprint {
  return {
    seed,
    config,
    rng,
    themeId,
    narrative: { title: '', backstory: '', playerObjective: '', epilogue: '' },
    zones: [],
    objects: [],
    puzzles: [],
    nodes: [],
    edges: [],
    goalId: '',
    usedDigitLengths: new Set(),
    yearUsed: false,
    usedWords: new Set(),
    usedLetterAnchors: new Set(),
    usedObjectNames: new Set(),
    usedKeyColors: new Set(),
    keyColorByNode: new Map(),
    counters: {},
  };
}

// ————————————————————————————————— Noms d'objets uniques —————————————————————————————————

/** Qualificatifs invariables (sans chiffre → decoy-check sauf), tous thèmes. */
const NAME_QUALIFIERS = ['nord', 'sud', 'est', 'ouest', 'bis'];

/**
 * Tire un NameDesc dont le NOM n'a pas encore servi dans la salle. Pool épuisé :
 * on qualifie le nom d'un repère invariable — « Note de service (ouest) » — pour
 * que le joueur, ses indices et ses hints désignent toujours un objet unique.
 */
export function pickNameDesc(bp: Blueprint, pool: readonly NameDesc[]): NameDesc {
  const fresh = pool.filter((nd) => !bp.usedObjectNames.has(nd.name));
  if (fresh.length > 0) {
    const chosen = bp.rng.pick(fresh);
    bp.usedObjectNames.add(chosen.name);
    return chosen;
  }
  const base = bp.rng.pick(pool);
  for (const q of NAME_QUALIFIERS) {
    const name = `${base.name} (${q})`;
    if (!bp.usedObjectNames.has(name)) {
      bp.usedObjectNames.add(name);
      return { name, desc: base.desc };
    }
  }
  let name = `${base.name} (bis)`;
  while (bp.usedObjectNames.has(name)) name = `${name} (bis)`;
  bp.usedObjectNames.add(name);
  return { name, desc: base.desc };
}

/** Réserve une couleur d'étiquette de clé, unique par salle tant que le pool suffit. */
export function pickKeyColor(bp: Blueprint, colors: readonly string[]): string {
  const fresh = colors.filter((c) => !bp.usedKeyColors.has(c));
  const chosen = bp.rng.pick(fresh.length > 0 ? fresh : [...colors]);
  bp.usedKeyColors.add(chosen);
  return chosen;
}

export function nextId(bp: Blueprint, prefix: string): string {
  const n = (bp.counters[prefix] ?? 0) + 1;
  bp.counters[prefix] = n;
  return `${prefix}.${n}`;
}

// ————————————————————————————————— Nœuds / arêtes —————————————————————————————————

export function addNode(
  bp: Blueprint,
  node: { type: NodeType; layer: number; producedBy?: string; carrier?: string; label: string },
): string {
  const id = nextId(bp, `node.${node.type.toLowerCase()}`);
  const full: SolutionNode = { id, type: node.type, layer: node.layer, label: node.label };
  if (node.producedBy !== undefined) full.producedBy = node.producedBy;
  if (node.carrier !== undefined) full.carrier = node.carrier;
  bp.nodes.push(full);
  return id;
}

export function addEdge(bp: Blueprint, from: string, to: string): void {
  bp.edges.push({ from, to });
}

// ————————————————————————————————— Objets —————————————————————————————————

export type NewObject = Omit<GameObject, 'id'> & { id?: string };

export function addObject(bp: Blueprint, obj: NewObject): string {
  const id = obj.id ?? nextId(bp, 'obj');
  bp.objects.push({ ...obj, id });
  return id;
}

// ————————————————————————————————— Puzzles —————————————————————————————————

export function addPuzzle(bp: Blueprint, p: Omit<PuzzleInstance, 'id'> & { id?: string }): string {
  const id = p.id ?? nextId(bp, 'p');
  bp.puzzles.push({ ...p, id });
  // arêtes redondantes node → puzzle (auditées par dag-check)
  for (const input of p.inputs) addEdge(bp, input, id);
  return id;
}

// ————————————————————————————————— Zones / POI —————————————————————————————————

export function zoneByLayer(bp: Blueprint, layer: number): Zone | undefined {
  return bp.zones.find((z) => z.layer === layer);
}

/** Choisit un POI de la zone, en évitant de préférence ceux déjà pris (jointure). */
export function pickPoi(bp: Blueprint, zoneId: string, avoid: Set<string> = new Set()): string {
  const zone = bp.zones.find((z) => z.id === zoneId);
  if (!zone || zone.pois.length === 0) return `${zoneId}.poi`;
  const free = zone.pois.filter((p) => !avoid.has(p.id));
  const pool = free.length > 0 ? free : zone.pois;
  const chosen = bp.rng.pick(pool);
  avoid.add(chosen.id);
  return chosen.id;
}

// ————————————————————————————————— Valeurs de code —————————————————————————————————

export interface CodeValue {
  value: string;
  length: number;
  alphabet: 'digits' | 'letters';
}

/** Un entier à N chiffres sans zéro initial, déterministe. */
function nDigits(rng: Rng, n: number): string {
  let s = String(rng.int(1, 9));
  for (let i = 1; i < n; i++) s += String(rng.int(0, 9));
  return s;
}

/**
 * Alloue une valeur de code respectant l'unicité de catégorie sémantique :
 *  - 'year'   : un seul par salle, valeur 19xx/20xx (regex année) ;
 *  - 'digits' : longueur inutilisée parmi [3, 5, 6] (jamais 4 → réservé année) ;
 *  - 'letters': mot du thème (exempt d'ambiguïté numérique).
 */
export function allocCode(
  bp: Blueprint,
  category: CodeCategory,
  words: readonly string[],
): CodeValue {
  const rng = bp.rng;
  if (category === 'year') {
    bp.yearUsed = true;
    const y = rng.int(0, 1) === 0 ? rng.int(1901, 1999) : rng.int(2000, 2099);
    return { value: String(y), length: 4, alphabet: 'digits' };
  }
  if (category === 'letters') {
    const pool = words.filter((w) => !bp.usedWords.has(w));
    const chosen = (pool.length > 0 ? rng.pick(pool) : rng.pick(words)).toUpperCase();
    bp.usedWords.add(chosen);
    return { value: chosen, length: chosen.length, alphabet: 'letters' };
  }
  // digits : longueur unique parmi 3, 5, 6
  const candidates = [3, 5, 6].filter((n) => !bp.usedDigitLengths.has(n));
  const len = candidates.length > 0 ? candidates[0]! : 3;
  bp.usedDigitLengths.add(len);
  return { value: nDigits(rng, len), length: len, alphabet: 'digits' };
}

// ————————————————————————————————— Contrôles de mécanisme —————————————————————————————————

export function codeControls(code: CodeValue, label: string): MechanismControls {
  return { kind: 'code', length: code.length, label, alphabet: code.alphabet };
}
