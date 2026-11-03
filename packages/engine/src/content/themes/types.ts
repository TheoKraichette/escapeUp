// ============================================================================
// CONTENU — TYPES DES THEME PACKS (docs/02-ARCHITECTURE.md §5).
// ----------------------------------------------------------------------------
// Un theme pack est de la DONNÉE : vocabulaire (zones, POI, noms), motifs
// narratifs, mapping « nœud abstrait → objet concret », et la matrice de
// compatibilité (template → habillage naturel). Aucun texte porteur de valeur
// ne contient de nombre à plusieurs chiffres : les valeurs numériques des
// verrous sont injectées par les gadgets (hygiène anti-ambiguïté).
// ============================================================================

import type { PuzzleTemplateId } from '../../types';

/** Un couple nom/description d'objet (description SANS nombre à ≥2 chiffres). */
export interface NameDesc {
  name: string;
  desc: string;
}

/** Vocabulaire concret indexé par ROLE abstrait de l'objet dans le graphe. */
export interface ThemeVocab {
  /** conteneur à code (casier, coffre) — mécanisme de verrou à code numérique */
  codeLock: NameDesc[];
  /** cadran étiqueté (panneau à molettes) */
  dialPanel: NameDesc[];
  /** porte / serrure mécanique */
  door: NameDesc[];
  /** clé physique (ITEM) */
  keyItem: NameDesc[];
  /** document porteur d'information (INFO) */
  document: NameDesc[];
  /** outil révélateur (ITEM) */
  tool: NameDesc[];
  /** support marqué sur lequel s'applique l'outil */
  support: NameDesc[];
  /** tableau de leviers / vannes (séquence) */
  leverPanel: NameDesc[];
  /** panneau à symboles (mapping) */
  symbolPanel: NameDesc[];
  /** composant à assembler (ITEM) */
  component: NameDesc[];
  /** établi / poste d'assemblage (mécanisme du combine) */
  workbench: NameDesc[];
  /** serrure à lettres (cipher / logique / spatial) */
  letterLock: NameDesc[];
  /** pur décor (peut porter un fragment narratif SANS nombre) */
  decor: NameDesc[];
}

export interface ThemeNarrative {
  titles: string[];
  backstories: string[];
  objectives: string[];
  epilogues: string[];
  /** motifs qui justifient les puzzles (employé négligent, protocole d'urgence…) */
  motifs: string[];
}

export interface ThemePack {
  id: string;
  displayName: string;
  narrative: ThemeNarrative;
  /** noms de zones par « profondeur » narrative (index 0 = zone de départ) */
  zoneNames: string[];
  /** noms de points d'intérêt (meubles, machines, murs…) */
  poiNames: string[];
  /** étiquettes-ancres par catégorie sémantique de verrou à code */
  anchors: { year: string[]; digits: string[]; letters: string[] };
  vocab: ThemeVocab;
  /** matrice de compatibilité : templates habillables naturellement dans ce thème */
  compatibility: Record<PuzzleTemplateId, boolean>;
  /** couleurs / repères pour les séquences (SANS chiffre) */
  colors: string[];
  /** symboles-lettres pour mapping / cipher */
  symbols: string[];
  /** mots (lettres) servant de valeurs aux verrous à lettres */
  words: string[];
  /**
   * Périphrase de chaque mot de `words` (indice d'anagramme, medium/hard).
   * SANS chiffre, sans le mot lui-même ni aucun autre mot de `words`.
   */
  wordHints: Record<string, string>;
}
