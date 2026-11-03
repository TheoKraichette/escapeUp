// ============================================================================
// CONTENU — LES 10 TEMPLATES DE PUZZLES (GDD §5), sous forme de DONNÉE typée.
// ----------------------------------------------------------------------------
// Un template déclare : le type de solution qu'il produit, sa catégorie
// sémantique (pour les verrous à code), ses entrées/sorties, sa `clueSpec`
// (comment fabriquer ses indices + l'anchorLabel), ses gabarits de textes
// d'indices à trous et ses 4 gabarits de hints.
//
// Les substrings critiques pour les lints (anchor, valeur) sont injectés par
// les gadgets de `generate/graph.ts` ; les gabarits ci-dessous portent surtout
// le HABILLAGE et les HINTS. Ainsi la conformité anchor-check/ambiguity-check
// est garantie par construction, indépendamment de la formulation.
//
// ────────────────────────────────────────────────────────────────────────────
// NOTE : les 10 templates sont désormais TOUS émis par le générateur.
// `tool_reveal` (solution `use_on`) et `combine_items` (solution `combine`)
// sont câblés via les gadgets toolReveal / combineItems de generate/graph.ts :
//   • easy   : variante « outil révélateur » (1 seed sur 3) ;
//   • medium : assemblage de 2 composants parallèles → clé de la 1re porte ;
//   • hard   : assemblage (z0) + outil révélateur (z1) à chaque salle.
// Invariants respectés par construction (et re-vérifiés par les lints en filet) :
//   - tool-order-check [W6] : outil/composants = OUTPUTS de puzzles amont,
//     donc acquis à une passe STRICTEMENT antérieure à leur consommation ;
//   - no-loss-check : les composants d'un combine n'alimentent aucun autre puzzle ;
//   - handleCombine (runtime) retrouve le puzzle via ses composants → le
//     mechanismObjectId d'un combine est son PREMIER composant.
// ────────────────────────────────────────────────────────────────────────────
// ============================================================================

import type { PuzzleSolution, PuzzleTemplateId } from '../../types';

/** Catégorie sémantique d'un verrou à code (voir validate/lints.ts). */
export type CodeCategory = 'year' | 'digits' | 'letters';

/** Un gabarit à trous. Les {placeholders} sont remplis à l'instanciation. */
export type Gabarit = string;

export interface TemplateDescriptor {
  id: PuzzleTemplateId;
  /** libellé humain */
  title: string;
  /** principe (doc) */
  principle: string;
  /** type de solution produit à l'instanciation */
  solutionKind: PuzzleSolution['kind'];
  /** catégorie sémantique si verrou à code (sinon undefined) */
  codeCategory?: CodeCategory;
  /** nombre d'indices INFO requis */
  clueCount: number;
  /** pas d'inférence indice → action (GDD §9) */
  inferenceSteps: number;
  /** puzzle de jointure (T7/T8) : indices multi-zones */
  isJoin: boolean;
  /** introduit un outil (T4/T5) : contrainte outil-avant-usage */
  usesTool: boolean;
  /** DOC : entrées requises */
  inputsSpec: string;
  /** DOC : ce que le template produit */
  outputsSpec: string;
  /** DOC : comment le template fabrique ses indices + ancre */
  clueSpec: string;
  /** DOC : contraintes d'anti-ambiguïté (règles d'or) */
  fairnessRules: string[];
  /**
   * Gabarits de texte d'indice à trous. Placeholders possibles :
   * {anchor} {value} {order} {mapping} {tool} {support} {a} {b} {c}.
   */
  clueGabarits: Gabarit[];
  /** 4 gabarits de hints (orientation, focalisation, connexion, solution). */
  hintGabarits: [Gabarit, Gabarit, Gabarit, Gabarit];
}

// ————————————————————————————————— Les 10 templates —————————————————————————————————

export const TEMPLATES: Record<PuzzleTemplateId, TemplateDescriptor> = {
  key_lock: {
    id: 'key_lock',
    title: 'Clé physique → serrure',
    principle: 'Une clé placée en amont ouvre une serrure logiquement située.',
    solutionKind: 'key',
    clueCount: 0,
    inferenceSteps: 1,
    isJoin: false,
    usesTool: false,
    inputsSpec: '1 objet clé (nœud ITEM, placé en couche antérieure)',
    outputsSpec: '1 ACCÈS (porte, coffre, tiroir) ou le GOAL',
    clueSpec: "L'étiquette de la clé et la plaque de la serrure partagent le même mot-ancre.",
    fairnessRules: ['La clé est obtenable strictement avant que la serrure ne soit requise.'],
    clueGabarits: ['La clé porte l’étiquette « {anchor} ».'],
    hintGabarits: [
      'Une ouverture de {zone} attend encore d’être forcée.',
      'Regardez ce que vous transportez : une clé cherche sa serrure.',
      'L’étiquette de votre clé désigne {mechanism}.',
      'Utilisez la clé « {anchor} » sur {mechanism}.',
    ],
  },

  code_from_document: {
    id: 'code_from_document',
    title: 'Code lu dans un document',
    principle: 'Un nombre lisible dans un document est le code du verrou.',
    solutionKind: 'code',
    codeCategory: 'digits',
    clueCount: 2,
    inferenceSteps: 2,
    isJoin: false,
    usesTool: false,
    inputsSpec: '1 à 2 indices textuels (nœuds INFO)',
    outputsSpec: 'ouverture d’un cadenas/coffre à code → ITEM ou ACCÈS',
    clueSpec:
      'Un document énonce la règle (« le code est le {anchor} ») ; un second porte la valeur.',
    fairnessRules: [
      'Le mot-ancre relie le document au cadran (règle d’or n°3).',
      'Aucune autre valeur du même type n’est visible au moment du puzzle (n°4).',
    ],
    clueGabarits: [
      'Consigne : le code de {mechanism} est la valeur « {anchor} ». — {a}',
      'Registre — {anchor} : {value}.',
    ],
    hintGabarits: [
      'Il reste des documents à lire dans {zone}.',
      'Deux papiers se répondent : une règle et une valeur.',
      'La consigne relie le code à « {anchor} » : où lire cette valeur ?',
      'La valeur « {anchor} » est {value}. Entrez {value}.',
    ],
  },

  labeled_dial_code: {
    id: 'labeled_dial_code',
    title: 'Cadran étiqueté',
    principle: 'Le cadran est étiqueté (« ANNÉE ») ; l’indice contient la valeur.',
    solutionKind: 'code',
    codeCategory: 'year',
    clueCount: 1,
    inferenceSteps: 1,
    isJoin: false,
    usesTool: false,
    inputsSpec: '1 indice + 1 étiquette',
    outputsSpec: 'ouverture sans ambiguïté d’interprétation → ACCÈS/ITEM/GOAL',
    clueSpec: 'L’étiquette du cadran (« {anchor} ») nomme exactement le type de la valeur.',
    fairnessRules: [
      'L’étiquette lève l’ambiguïté d’interprétation (règle d’or n°3).',
      'Une seule valeur de ce type est atteignable (n°4).',
    ],
    clueGabarits: ['{a} — {anchor} : {value}.'],
    hintGabarits: [
      'Un cadran étiqueté attend une valeur précise dans {zone}.',
      'Lisez ce que réclame la plaque du cadran.',
      'Le cadran veut une valeur de type « {anchor} ».',
      'La valeur « {anchor} » est {value}. Entrez {value}.',
    ],
  },

  tool_reveal: {
    id: 'tool_reveal',
    title: 'Outil révélateur',
    principle: 'Un outil révèle une information invisible (lampe UV, loupe, aimant).',
    solutionKind: 'use_on',
    clueCount: 0,
    inferenceSteps: 1,
    isJoin: false,
    usesTool: true,
    inputsSpec: '1 outil (ITEM) + 1 support marqué',
    outputsSpec: '1 information cachée (nœud INFO)',
    clueSpec: 'Le support porte une marque « {support} » ; l’outil {tool} la révèle.',
    fairnessRules: ['L’outil est obtenu en couche strictement antérieure au support (n°5).'],
    clueGabarits: ['Sous {tool}, sur {support}, apparaît : {value}.'],
    hintGabarits: [
      'Un support de {zone} cache peut-être quelque chose.',
      'Vous possédez un instrument fait pour révéler l’invisible.',
      'Employez {tool} sur {support}.',
      'Passez {tool} sur {support} : l’inscription apparaît.',
    ],
  },

  combine_items: {
    id: 'combine_items',
    title: 'Assemblage d’objets',
    principle: 'Assembler 2–3 objets pour créer l’objet utile.',
    solutionKind: 'combine',
    clueCount: 0,
    inferenceSteps: 1,
    isJoin: false,
    usesTool: true,
    inputsSpec: '2 à 3 objets (nœuds ITEM)',
    outputsSpec: '1 objet fonctionnel (nœud ITEM)',
    clueSpec: 'Les composants s’emboîtent sur {mechanism}.',
    fairnessRules: [
      'Les composants sont obtenus avant l’assemblage (n°5).',
      'Un composant assemblé n’est requis par aucun autre puzzle (n°7).',
    ],
    clueGabarits: ['Les pièces s’assemblent : {a} + {b}.'],
    hintGabarits: [
      'Deux pièces éparses de {zone} semblent complémentaires.',
      'Rien ne s’ouvre seul : et si vous assembliez ?',
      'Rapprochez « {a} » de « {b} » : ils vont ensemble.',
      'Combinez « {a} » et « {b} » depuis l’inventaire pour former l’objet.',
    ],
  },

  mechanism_sequence: {
    id: 'mechanism_sequence',
    title: 'Séquence de mécanisme',
    principle: 'Actionner un mécanisme dans un ordre précis (fusibles, leviers, vannes).',
    solutionKind: 'sequence',
    clueCount: 1,
    inferenceSteps: 2,
    isJoin: false,
    usesTool: false,
    inputsSpec: '1 indice d’ordre',
    outputsSpec: 'changement d’état du monde (nœud STATE) ou ACCÈS',
    clueSpec: 'Un indice donne l’ordre en clair : {order}.',
    fairnessRules: ['L’ordre est entièrement déterminé par l’indice (aucun essai-erreur).'],
    clueGabarits: ['Procédure d’amorçage : {order}.'],
    hintGabarits: [
      'Un tableau de commandes de {zone} attend une manœuvre.',
      'L’ordre des actions est écrit quelque part.',
      'La procédure impose : {order}.',
      'Actionnez {mechanism} dans l’ordre : {order}.',
    ],
  },

  mapping_sequence: {
    id: 'mapping_sequence',
    title: 'Jointure ordre + correspondance',
    principle: 'Un indice donne l’ordre abstrait, l’autre le mapping termes → symboles.',
    solutionKind: 'sequence',
    clueCount: 2,
    inferenceSteps: 2,
    isJoin: true,
    usesTool: false,
    inputsSpec: '2 indices complémentaires (dans des zones différentes)',
    outputsSpec: 'séquence à entrer sur un panneau → ACCÈS/GOAL',
    clueSpec: 'Indice A : l’ordre ({order}). Indice B : la correspondance ({mapping}).',
    fairnessRules: [
      'Les deux indices sont dans des zones différentes (jointure T7).',
      'La séquence est déterminée sans ambiguïté par la paire d’indices.',
    ],
    clueGabarits: ['Ordre rituel : {order}.', 'Correspondance : {mapping}.'],
    hintGabarits: [
      'Un panneau à symboles de {zone} réclame une séquence.',
      'Deux notes se complètent : l’une dit l’ordre, l’autre le code des symboles.',
      'Croisez l’ordre {order} avec la correspondance {mapping}.',
      'Entrez la séquence déduite de {order} via {mapping}.',
    ],
  },

  logic_deduction: {
    id: 'logic_deduction',
    title: 'Déduction logique',
    principle: 'Mini-grille de déduction (entités × attributs).',
    solutionKind: 'code',
    codeCategory: 'letters',
    clueCount: 3,
    inferenceSteps: 3,
    isJoin: true,
    usesTool: false,
    inputsSpec: '2 à 3 indices textuels',
    outputsSpec: 'une association (code) → ITEM/ACCÈS',
    clueSpec: 'Trois contraintes éliminatoires désignent une unique association « {anchor} ».',
    fairnessRules: [
      'La grille a une solution unique (déduction pure, zéro devinette).',
      'Le mot-ancre relie la conclusion au verrou (n°3).',
    ],
    clueGabarits: ['{a}', '{b}', '{c}'],
    hintGabarits: [
      'Des notes de {zone} décrivent un petit casse-tête d’attribution.',
      'Recoupez les contraintes : chacune élimine une possibilité.',
      'Une seule combinaison « {anchor} » survit à toutes les contraintes.',
      'La déduction donne « {anchor} » = {value}.',
    ],
  },

  cipher_substitution: {
    id: 'cipher_substitution',
    title: 'Chiffre par substitution',
    principle: 'Message chiffré + table de correspondance présente dans la salle.',
    solutionKind: 'code',
    codeCategory: 'letters',
    clueCount: 2,
    inferenceSteps: 2,
    isJoin: true,
    usesTool: false,
    inputsSpec: '1 message + 1 table',
    outputsSpec: 'information en clair (code) → INFO/ACCÈS',
    clueSpec: 'Le message chiffré et la table de substitution donnent le mot « {anchor} ».',
    fairnessRules: [
      'La table est complète pour tout le message (déchiffrement déterministe).',
      'Le mot-ancre nomme le champ du verrou (n°3).',
    ],
    clueGabarits: ['Message chiffré : {a}.', 'Table de substitution : {mapping}.'],
    hintGabarits: [
      'Un message codé traîne dans {zone}.',
      'Cherchez la table qui traduit les symboles.',
      'Déchiffrez le message avec la table pour obtenir « {anchor} ».',
      'Le message déchiffré donne « {anchor} » = {value}.',
    ],
  },

  spatial_observation: {
    id: 'spatial_observation',
    title: 'Observation spatiale',
    principle: 'La disposition physique encode l’information.',
    solutionKind: 'code',
    codeCategory: 'letters',
    clueCount: 1,
    inferenceSteps: 2,
    isJoin: false,
    usesTool: false,
    inputsSpec: 'la scène + 1 indice de lecture',
    outputsSpec: 'un code court → ACCÈS/INFO',
    clueSpec: 'Un indice dit COMMENT lire la scène (« {anchor} »).',
    fairnessRules: [
      'La règle de lecture est explicite (pas de devinette sur la convention).',
      'La disposition est stable et non ambiguë.',
    ],
    clueGabarits: ['Lecture : {anchor}. Résultat : {value}.'],
    hintGabarits: [
      'Un relevé d’observation traîne dans {zone}.',
      'Une note « {anchor} » consigne ce que les lieux montrent.',
      'Toutes les lettres du mot sont dans le relevé « {anchor} ».',
      'La lecture « {anchor} » donne {value}.',
    ],
  },
};

/** Interpolation minimale d'un gabarit avec un contexte de valeurs. */
export function fill(gabarit: Gabarit, ctx: Record<string, string>): string {
  return gabarit.replace(/\{(\w+)\}/g, (_m, k: string) => ctx[k] ?? `{${k}}`);
}

export const ALL_TEMPLATE_IDS = Object.keys(TEMPLATES) as PuzzleTemplateId[];

// ============================================================================
// FORMES « VRAIE ÉNIGME » (medium/hard) — formats de texte + dérivation.
// ----------------------------------------------------------------------------
// La réponse n'est plus écrite en clair : elle se DÉRIVE des indices. Les
// fonctions format* (utilisées par generate/graph.ts) et derive* (utilisées
// par validate/lints.ts pour PROUVER la dérivabilité) vivent côte à côte :
// tout changement de format casse le lint, jamais silencieusement le joueur.
// Contraintes trans-lint : aucun chiffre (decoy/ambiguity digits), aucun mot
// TOUT-EN-MAJUSCULES parasite hors ancre/candidats (ambiguity letters).
// ============================================================================

/** Glyphes du chiffre par substitution (aucun chiffre, aucun caractère [A-Z]). */
export const CIPHER_GLYPHS = [
  '◆', '✦', '▲', '●', '■', '★', '◗', '✚', '❖', '▼', '◉', '✪',
] as const;

const CIPHER_MSG_PREFIX = 'Message chiffré, gravé avec soin : ';
const CIPHER_TABLE_MARK = 'Table de substitution «';
const ANAGRAM_MARK = 'lettres en désordre :';
const CANDIDATES_MARK = 'candidats relevés :';

/** Message chiffré : la suite de glyphes du mot, dans l'ordre. */
export function formatCipherMessage(glyphs: string[]): string {
  return `${CIPHER_MSG_PREFIX}${glyphs.join(' ')}.`;
}

/** Table glyphe → lettre (ordre des paires indépendant du mot — pas de fuite d'ordre). */
export function formatCipherTable(anchor: string, pairs: [string, string][]): string {
  return `${CIPHER_TABLE_MARK} ${anchor} » : ${pairs.map(([g, l]) => `${g} = ${l}`).join(' ; ')}.`;
}

/** Rejoue le déchiffrement depuis les textes sources ; null si forme absente. */
export function deriveCipher(texts: string[]): string | null {
  const msg = texts.find((t) => t.includes(CIPHER_MSG_PREFIX));
  const tab = texts.find((t) => t.includes(CIPHER_TABLE_MARK));
  if (!msg || !tab) return null;
  const map = new Map<string, string>();
  for (const m of tab.matchAll(/(\S) = ([A-Z])/gu)) map.set(m[1]!, m[2]!);
  const glyphSet = new Set<string>(CIPHER_GLYPHS);
  let out = '';
  for (const ch of msg.slice(msg.indexOf(CIPHER_MSG_PREFIX) + CIPHER_MSG_PREFIX.length)) {
    if (!glyphSet.has(ch)) continue;
    const letter = map.get(ch);
    if (!letter) return null; // table incomplète : dérivation impossible
    out += letter;
  }
  return out.length > 0 ? out : null;
}

/** Note listant les candidats (la valeur + les leurres), rattachée à l'ancre. */
export function formatCandidates(anchor: string, candidates: string[]): string {
  return `Registre « ${anchor} » — ${CANDIDATES_MARK} ${candidates.join(', ')}.`;
}

export type ExclusionKind = 'contains' | 'starts' | 'ends';

/** Contrainte éliminatoire (vraie : vérifiable lettre à lettre par le joueur). */
export function formatExclusion(anchor: string, kind: ExclusionKind, letter: string): string {
  switch (kind) {
    case 'contains':
      return `La valeur « ${anchor} » ne contient pas la lettre ${letter}.`;
    case 'starts':
      return `La valeur « ${anchor} » ne commence pas par la lettre ${letter}.`;
    case 'ends':
      return `La valeur « ${anchor} » ne se termine pas par la lettre ${letter}.`;
  }
}

/** Rejoue l'élimination logique ; null si forme absente, '' si non unique. */
export function deriveLogic(texts: string[]): string | null {
  const cand = texts.find((t) => t.includes(CANDIDATES_MARK));
  if (!cand) return null;
  const tail = cand.slice(cand.indexOf(CANDIDATES_MARK) + CANDIDATES_MARK.length);
  const candidates = [...tail.matchAll(/[A-Z]{2,}/g)].map((m) => m[0]);
  if (candidates.length < 2) return null;

  let pool = candidates;
  for (const t of texts) {
    const contains = t.match(/ne contient pas la lettre ([A-Z])/);
    if (contains) pool = pool.filter((w) => !w.includes(contains[1]!));
    const starts = t.match(/ne commence pas par la lettre ([A-Z])/);
    if (starts) pool = pool.filter((w) => !w.startsWith(starts[1]!));
    const ends = t.match(/ne se termine pas par la lettre ([A-Z])/);
    if (ends) pool = pool.filter((w) => !w.endsWith(ends[1]!));
  }
  return pool.length === 1 ? pool[0]! : '';
}

/** Anagramme guidée : lettres du mot en désordre + périphrase du sens. */
export function formatAnagram(anchor: string, letters: string[], hint: string): string {
  return `Relevé « ${anchor} » — ${ANAGRAM_MARK} ${letters.join('-')}. Indice : ${hint}.`;
}

/** Extrait les lettres relevées ; null si la forme anagramme est absente. */
export function deriveAnagramLetters(texts: string[]): string[] | null {
  const t = texts.find((x) => x.includes(ANAGRAM_MARK));
  if (!t) return null;
  const m = t.match(/lettres en désordre : ([A-Z](?:-[A-Z])*)/);
  return m ? m[1]!.split('-') : null;
}
