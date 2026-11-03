import { describe, it, expect } from 'vitest';
import type { GameObject, PuzzleInstance, PuzzleTemplateId, RoomSpec, SolutionNode } from '../types';
import { lintRoom } from '../validate/lints';
import type { LintId } from '../types';
import {
  CIPHER_GLYPHS,
  formatAnagram,
  formatCandidates,
  formatCipherMessage,
  formatCipherTable,
  formatExclusion,
} from '../content/templates/index';
import { makeLabRoom } from '../__fixtures__/labRoom';

const puzzle = (room: RoomSpec, id: string): PuzzleInstance =>
  room.puzzles.find((p) => p.id === id)!;
const object = (room: RoomSpec, id: string): GameObject =>
  room.objects.find((o) => o.id === id)!;
const hasLint = (room: RoomSpec, lint: LintId): boolean =>
  lintRoom(room).findings.some((f) => f.lint === lint && f.level === 'error');

describe('lintRoom — la salle de référence est saine', () => {
  it('passe les 9 lints sans erreur', () => {
    const report = lintRoom(makeLabRoom());
    expect(report.pass).toBe(true);
    expect(report.findings.filter((f) => f.level === 'error')).toHaveLength(0);
  });
});

describe('chaque lint attrape sa violation', () => {
  it('dag-check : cycle dans le graphe', () => {
    const room = makeLabRoom();
    // p_key requiert son propre output → cycle access.z2 ↔ p_key
    puzzle(room, 'p_key').inputs.push('access.z2');
    expect(hasLint(room, 'dag-check')).toBe(true);
  });

  it('source-check : indice source non atteignable avant le puzzle', () => {
    const room = makeLabRoom();
    // info.annee n'est lisible qu'en z2 (passe 3), or p_code se résout passe 1
    puzzle(room, 'p_code').derivation.sourceClueIds.push('info.annee');
    expect(hasLint(room, 'source-check')).toBe(true);
  });

  it('anchor-check : ancre absente du verrou et de l’indice', () => {
    const room = makeLabRoom();
    puzzle(room, 'p_dial').derivation.anchorLabel = 'INEXISTANT';
    expect(hasLint(room, 'anchor-check')).toBe(true);
  });

  it('ambiguity-check : deuxième année plausible atteignable', () => {
    const room = makeLabRoom();
    const rapport = object(room, 'obj.rapport');
    rapport.reveals[0]!.text += ' (voir aussi les archives de 1990).';
    expect(hasLint(room, 'ambiguity-check')).toBe(true);
  });

  it('tool-order-check [W6] : outil obtenu à une passe ≥ celle de la résolution (reachability réelle)', () => {
    const room = withLateTool(makeLabRoom());
    expect(hasLint(room, 'tool-order-check')).toBe(true);
  });

  it('progress-check : puzzle dont l’output n’est jamais consommé', () => {
    const room = withOrphanTool(makeLabRoom());
    expect(hasLint(room, 'progress-check')).toBe(true);
  });

  it('no-loss-check : composant consommé par un combine mais requis ailleurs', () => {
    const room = withBadCombine(makeLabRoom());
    expect(hasLint(room, 'no-loss-check')).toBe(true);
  });

  it('decoy-check : un décor expose une valeur candidate pour un verrou', () => {
    const room = makeLabRoom();
    object(room, 'obj.plante').description = 'Un ficus, etiquette « lot 555 ».';
    expect(hasLint(room, 'decoy-check')).toBe(true);
  });

  it('dead-object-check : objet non-décor absent du graphe', () => {
    const room = makeLabRoom();
    room.objects.push({
      id: 'obj.orphan',
      name: 'Presse-papier inutile',
      description: 'Un objet sans role ludique, mais pas etiquete decor.',
      family: 'instrument',
      location: { zoneId: 'z1', poiId: 'poi.comptoir' },
      initialState: 'visible',
      affordances: ['inspect'],
      reveals: [],
      requires: [],
    });
    expect(hasLint(room, 'dead-object-check')).toBe(true);
  });
});

// —————————————————————————————— fabriques de salles cassées ——————————————————————————————

/** Ajoute un tool_reveal dont l'outil (item.cle, couche 0) agit sur un support couche 0
 *  et dont l'output n'est consommé par personne → tool-order + progress. */
function withOrphanTool(room: RoomSpec): RoomSpec {
  const wall: GameObject = {
    id: 'obj.wall',
    name: 'Mur marque',
    description: 'Une inscription invisible attend le bon eclairage.',
    family: 'mechanism',
    location: { zoneId: 'z1', poiId: 'poi.porte' },
    initialState: 'visible',
    affordances: ['inspect', 'use_on'],
    reveals: [{ on: 'use_on', nodeIds: ['info.hidden'], text: 'Une inscription apparait.' }],
    requires: [],
  };
  const hiddenNode: SolutionNode = {
    id: 'info.hidden',
    type: 'INFO',
    layer: 0,
    producedBy: 'p_tool',
    carrier: 'obj.wall',
    label: 'Inscription revelee',
  };
  const pTool: PuzzleInstance = {
    id: 'p_tool',
    template: 'tool_reveal',
    mechanismObjectId: 'obj.wall',
    inputs: ['item.cle'],
    outputs: ['info.hidden'],
    solution: { kind: 'use_on', toolNodeId: 'item.cle', targetObjectId: 'obj.wall' },
    derivation: { sourceClueIds: [], rule: 'cle-lampe revele le mur', inferenceSteps: 1 },
    hints: ['a', 'b', 'c', 'd'],
  };
  room.objects.push(wall);
  room.graph.nodes.push(hiddenNode);
  room.puzzles.push(pTool);
  return room;
}

/** Ajoute un combine_items qui consomme item.cle — or item.cle est requis par p_key. */
function withBadCombine(room: RoomSpec): RoomSpec {
  const bench: GameObject = {
    id: 'obj.bench',
    name: 'Etabli',
    description: 'Un etabli pour assembler des pieces.',
    family: 'mechanism',
    location: { zoneId: 'z1', poiId: 'poi.casiers' },
    initialState: 'visible',
    affordances: ['inspect', 'combine'],
    reveals: [],
    requires: [],
  };
  const madeNode: SolutionNode = {
    id: 'state.made',
    type: 'STATE',
    layer: 0,
    producedBy: 'p_combine',
    label: 'Piece assemblee',
  };
  const pCombine: PuzzleInstance = {
    id: 'p_combine',
    template: 'combine_items',
    mechanismObjectId: 'obj.bench',
    inputs: ['item.cle'],
    outputs: ['state.made'],
    solution: { kind: 'combine', itemNodeIds: ['item.cle'] },
    derivation: { sourceClueIds: [], rule: 'assemble la cle', inferenceSteps: 1 },
    hints: ['a', 'b', 'c', 'd'],
  };
  room.objects.push(bench);
  room.graph.nodes.push(madeNode);
  room.puzzles.push(pCombine);
  return room;
}

/** [W6] Un tool_reveal dont l'outil (item.cle, obtenu passe 1) n'est PAS un input :
 *  le solveur résout le puzzle dès la passe 1, donc l'outil n'est pas obtenu
 *  STRICTEMENT avant → tool-order-check (reachability réelle). */
function withLateTool(room: RoomSpec): RoomSpec {
  const wall: GameObject = {
    id: 'obj.wall2',
    name: 'Paroi marquee',
    description: 'Une inscription attend le bon revelateur.',
    family: 'mechanism',
    location: { zoneId: 'z1', poiId: 'poi.porte' },
    initialState: 'visible',
    affordances: ['inspect', 'use_on'],
    reveals: [{ on: 'use_on', nodeIds: ['info.late'], text: 'Une inscription apparait.' }],
    requires: [],
  };
  const node: SolutionNode = {
    id: 'info.late',
    type: 'INFO',
    layer: 0,
    producedBy: 'p_late',
    carrier: 'obj.wall2',
    label: 'Inscription tardive',
  };
  const pLate: PuzzleInstance = {
    id: 'p_late',
    template: 'tool_reveal',
    mechanismObjectId: 'obj.wall2',
    inputs: [], // aucun input → résolu passe 1, avant/au même pas que l'outil
    outputs: ['info.late'],
    solution: { kind: 'use_on', toolNodeId: 'item.cle', targetObjectId: 'obj.wall2' },
    derivation: { sourceClueIds: [], rule: 'revelateur non garanti', inferenceSteps: 1 },
    hints: ['a', 'b', 'c', 'd'],
  };
  room.objects.push(wall);
  room.graph.nodes.push(node);
  room.puzzles.push(pLate);
  return room;
}

// —————————————————————————————— durcissement des lints (audit adversarial) ——————————————————————————————

/** [E3] HOLE A : un verrou (p_hole) en zone accessible dont l'UNIQUE source du
 *  code est un document DANS la zone (z3) que ce verrou ouvre → cycle réel, mais
 *  le GOAL reste atteint par l'autre chaîne (solveur = solvable). */
function withGatedSelfLock(room: RoomSpec): RoomSpec {
  room.zones.push({
    id: 'z3',
    name: 'Chambre forte',
    layer: 2,
    gate: 'p_hole',
    pois: [{ id: 'poi.forte', name: 'Coffre-fort' }],
  });
  room.objects.push({
    id: 'obj.doc_hole',
    name: 'Consigne scellee',
    description: 'Un feuillet range dans la chambre forte.',
    family: 'info_carrier',
    location: { zoneId: 'z3', poiId: 'poi.forte' },
    initialState: 'visible',
    affordances: ['read'],
    reveals: [{ on: 'read', nodeIds: ['info.hole'], text: 'Registre — CODE FORTE : 731.' }],
    requires: [],
  });
  room.objects.push({
    id: 'obj.lock_hole',
    name: 'Cadenas de la chambre forte',
    description: 'Un cadenas a 3 chiffres. Plaque gravee « CODE FORTE ».',
    family: 'mechanism',
    location: { zoneId: 'z2', poiId: 'poi.paillasse' },
    initialState: 'locked',
    affordances: ['inspect', 'enter_code'],
    controls: { kind: 'code', length: 3, label: 'CODE FORTE', alphabet: 'digits' },
    reveals: [{ on: 'enter_code', nodeIds: [], text: 'La chambre forte s ouvre.' }],
    requires: [],
  });
  room.graph.nodes.push(
    { id: 'info.hole', type: 'INFO', layer: 2, carrier: 'obj.doc_hole', label: 'Code forte' },
    { id: 'access.z3', type: 'ACCESS', layer: 2, producedBy: 'p_hole', label: 'Chambre forte accessible' },
  );
  room.puzzles.push({
    id: 'p_hole',
    template: 'code_from_document',
    mechanismObjectId: 'obj.lock_hole',
    inputs: ['info.hole'],
    outputs: ['access.z3'],
    solution: { kind: 'code', value: '731' },
    derivation: {
      sourceClueIds: ['info.hole'],
      rule: 'code forte lu dans la chambre forte',
      anchorLabel: 'CODE FORTE',
      inferenceSteps: 1,
    },
    hints: ['a', 'b', 'c', 'd'],
  });
  return room;
}

/** Ajoute un verrou à lettres résoluble en z1 (accessible d'emblée). */
function addLetterLock(
  room: RoomSpec,
  suffix: string,
  anchor: string,
  value: string,
  poiId: string,
): void {
  const nodeId = `info.let_${suffix}`;
  room.objects.push({
    id: `obj.letdoc_${suffix}`,
    name: 'Feuille de consigne',
    description: 'Une consigne affichee.',
    family: 'info_carrier',
    location: { zoneId: 'z1', poiId },
    initialState: 'visible',
    affordances: ['read'],
    reveals: [{ on: 'read', nodeIds: [nodeId], text: `L association « ${anchor} » designe le mot « ${value} ».` }],
    requires: [],
  });
  room.objects.push({
    id: `obj.letlock_${suffix}`,
    name: 'Cadenas a lettres',
    description: `Un cadenas alphabetique. Plaque gravee « ${anchor} ».`,
    family: 'mechanism',
    location: { zoneId: 'z1', poiId },
    initialState: 'locked',
    affordances: ['inspect', 'enter_code'],
    controls: { kind: 'code', length: value.length, label: anchor, alphabet: 'letters' },
    reveals: [{ on: 'enter_code', nodeIds: [], text: 'Declic.' }],
    requires: [],
  });
  room.graph.nodes.push({ id: nodeId, type: 'INFO', layer: 0, carrier: `obj.letdoc_${suffix}`, label: `${anchor} = ${value}` });
  room.puzzles.push({
    id: `p_let_${suffix}`,
    template: 'logic_deduction',
    mechanismObjectId: `obj.letlock_${suffix}`,
    inputs: [nodeId],
    outputs: [],
    solution: { kind: 'code', value },
    derivation: { sourceClueIds: [nodeId], rule: 'deduction ancree', anchorLabel: anchor, inferenceSteps: 3 },
    hints: ['a', 'b', 'c', 'd'],
  });
}

/** [W5] Un 2e verrou à chiffres 3 positions d'ANCRE DIFFÉRENTE, sur le chemin
 *  (sa sortie STATE alimente p_dial) → salle qui doit rester VALIDE. */
function withTwoDigitAnchors(room: RoomSpec): RoomSpec {
  room.objects.push({
    id: 'obj.doc_salle',
    name: 'Pancarte de salle',
    description: 'Une pancarte murale.',
    family: 'info_carrier',
    location: { zoneId: 'z1', poiId: 'poi.comptoir' },
    initialState: 'visible',
    affordances: ['read'],
    reveals: [{ on: 'read', nodeIds: ['info.salle'], text: 'Registre — NUMERO DE SALLE : 207.' }],
    requires: [],
  });
  room.objects.push({
    id: 'obj.coffret',
    name: 'Coffret de salle',
    description: 'Un coffret a 3 chiffres. Plaque gravee « NUMERO DE SALLE ».',
    family: 'mechanism',
    location: { zoneId: 'z1', poiId: 'poi.casiers' },
    initialState: 'locked',
    affordances: ['inspect', 'enter_code'],
    controls: { kind: 'code', length: 3, label: 'NUMERO DE SALLE', alphabet: 'digits' },
    reveals: [{ on: 'enter_code', nodeIds: [], text: 'Le coffret s ouvre.' }],
    requires: [],
  });
  room.graph.nodes.push(
    { id: 'info.salle', type: 'INFO', layer: 0, carrier: 'obj.doc_salle', label: 'NUMERO DE SALLE = 207' },
    { id: 'state.salle', type: 'STATE', layer: 0, producedBy: 'p_salle', label: 'Coffret de salle ouvert' },
  );
  room.puzzles.push({
    id: 'p_salle',
    template: 'code_from_document',
    mechanismObjectId: 'obj.coffret',
    inputs: ['info.salle'],
    outputs: ['state.salle'],
    solution: { kind: 'code', value: '207' },
    derivation: {
      sourceClueIds: ['info.salle'],
      rule: 'numero de salle lu sur la pancarte',
      anchorLabel: 'NUMERO DE SALLE',
      inferenceSteps: 2,
    },
    hints: ['a', 'b', 'c', 'd'],
  });
  // La sortie du 2e verrou devient un prérequis du puzzle final (chaîne saine).
  puzzle(room, 'p_dial').inputs.push('state.salle');
  room.graph.edges.push({ from: 'state.salle', to: 'p_dial' });
  return room;
}

describe('durcissement des lints (audit adversarial)', () => {
  it('[E1] value-presence-check : la valeur-solution absente de toute source atteignable est rejetée', () => {
    const room = makeLabRoom();
    // p_dial.solution reste 1987, mais le rapport ne mentionne plus « 1987 ».
    object(room, 'obj.rapport').reveals[0]!.text =
      "Rapport : l'incident majeur reste classifie. Le panneau de secours utilise cette ANNEE.";
    expect(hasLint(room, 'value-presence-check')).toBe(true);
  });

  it('[E1] value-presence-check : la salle de référence garde ses valeurs lisibles', () => {
    expect(hasLint(makeLabRoom(), 'value-presence-check')).toBe(false);
  });

  it('[E2] ambiguity-check : une 2e année plausible hors 1900-2099 (1789) est bien détectée', () => {
    const room = makeLabRoom();
    object(room, 'obj.rapport').reveals[0]!.text += ' (fondation du site en 1789).';
    expect(hasLint(room, 'ambiguity-check')).toBe(true);
  });

  it('[E3] dag-check : un verrou gardant sa propre clé (source enfermée dans sa zone) referme un cycle', () => {
    expect(hasLint(withGatedSelfLock(makeLabRoom()), 'dag-check')).toBe(true);
  });

  it('[E3] unreachable-mechanism-check : le verrou mort (jamais applicable) est signalé', () => {
    expect(hasLint(withGatedSelfLock(makeLabRoom()), 'unreachable-mechanism-check')).toBe(true);
  });

  it('[W4] ambiguity-check : deux verrous à lettres de même ancre co-atteignables sont détectés', () => {
    const room = makeLabRoom();
    addLetterLock(room, 'a', 'NOM DE CODE', 'NEPTUNE', 'poi.comptoir');
    addLetterLock(room, 'b', 'NOM DE CODE', 'ALBATROS', 'poi.casiers');
    expect(hasLint(room, 'ambiguity-check')).toBe(true);
  });

  it('[W4] ambiguity-check : deux verrous à lettres d’ANCRES DIFFÉRENTES ne se signalent pas', () => {
    const room = makeLabRoom();
    addLetterLock(room, 'a', 'NOM DE CODE', 'NEPTUNE', 'poi.comptoir');
    addLetterLock(room, 'b', 'MOT DE PASSE', 'ALBATROS', 'poi.casiers');
    expect(hasLint(room, 'ambiguity-check')).toBe(false);
  });

  it('[W5] ambiguity-check : deux verrous à chiffres de même longueur mais d’ANCRES différentes restent valides', () => {
    const room = withTwoDigitAnchors(makeLabRoom());
    const report = lintRoom(room);
    expect(report.findings.filter((x) => x.level === 'error')).toHaveLength(0);
    expect(report.pass).toBe(true);
  });
});

// ————————————————————————————————— Dérivabilité (vraies énigmes) —————————————————————————————————
// Formes medium/hard : la valeur n'est plus en clair, le lint doit PROUVER que
// les indices la reconstruisent (et rejeter toute salle où ce n'est plus vrai).

/** Pose un puzzle à lettres en z1 dont les indices sont les `texts` donnés. */
function addRealLetterPuzzle(
  room: RoomSpec,
  template: PuzzleTemplateId,
  anchor: string,
  value: string,
  texts: string[],
): void {
  const nodeIds: string[] = [];
  texts.forEach((text, i) => {
    const nodeId = `info.real_${template}_${i}`;
    nodeIds.push(nodeId);
    room.objects.push({
      id: `obj.realdoc_${template}_${i}`,
      name: `Feuillet d’énigme ${template} ${i}`,
      description: 'Un feuillet manuscrit.',
      family: 'info_carrier',
      location: { zoneId: 'z1', poiId: 'poi.comptoir' },
      initialState: 'visible',
      affordances: ['read'],
      reveals: [{ on: 'read', nodeIds: [nodeId], text }],
      requires: [],
    });
    room.graph.nodes.push({
      id: nodeId,
      type: 'INFO',
      layer: 0,
      carrier: `obj.realdoc_${template}_${i}`,
      label: `indice ${i}`,
    } as SolutionNode);
  });
  room.objects.push({
    id: `obj.reallock_${template}`,
    name: `Verrou d’énigme ${template}`,
    description: `Un verrou alphabetique. Plaque gravee « ${anchor} ».`,
    family: 'mechanism',
    location: { zoneId: 'z1', poiId: 'poi.comptoir' },
    initialState: 'locked',
    affordances: ['inspect', 'enter_code'],
    controls: { kind: 'code', length: value.length, label: anchor, alphabet: 'letters' },
    reveals: [{ on: 'enter_code', nodeIds: [], text: 'Déclic.' }],
    requires: [],
  });
  room.puzzles.push({
    id: `p_real_${template}`,
    template,
    mechanismObjectId: `obj.reallock_${template}`,
    inputs: nodeIds,
    outputs: [],
    solution: { kind: 'code', value },
    derivation: { sourceClueIds: nodeIds, rule: 'vraie énigme', anchorLabel: anchor, inferenceSteps: 2 },
    hints: ['a', 'b', 'c', 'd'],
  });
}

describe('dérivabilité des vraies énigmes (value-presence-check étendu)', () => {
  const cipherTexts = (value: string, corrupt = false): string[] => {
    const distinct = [...new Set(value.split(''))];
    const glyphs = CIPHER_GLYPHS.slice(0, distinct.length);
    const glyphOf = new Map(distinct.map((l, i) => [l, glyphs[i]!]));
    const pairs = distinct.map((l) => [glyphOf.get(l)!, l] as [string, string]);
    // Corruption : la première paire pointe une lettre fausse → le déchiffrement dévie.
    if (corrupt) pairs[0] = [pairs[0]![0], pairs[0]![1] === 'Z' ? 'Q' : 'Z'];
    return [
      formatCipherMessage(value.split('').map((l) => glyphOf.get(l)!)),
      formatCipherTable('NOM SECRET', pairs),
    ];
  };

  it('cipher réel cohérent : aucune erreur (la valeur se dérive, jamais en clair)', () => {
    const room = makeLabRoom();
    addRealLetterPuzzle(room, 'cipher_substitution', 'NOM SECRET', 'MISTRAL', cipherTexts('MISTRAL'));
    expect(hasLint(room, 'value-presence-check')).toBe(false);
  });

  it('cipher réel : une table corrompue est rejetée', () => {
    const room = makeLabRoom();
    addRealLetterPuzzle(
      room,
      'cipher_substitution',
      'NOM SECRET',
      'MISTRAL',
      cipherTexts('MISTRAL', true),
    );
    expect(hasLint(room, 'value-presence-check')).toBe(true);
  });

  it('logique réelle cohérente : les contraintes laissent un unique survivant', () => {
    const room = makeLabRoom();
    addRealLetterPuzzle(room, 'logic_deduction', 'MOT CACHE', 'ORAGEUX', [
      formatCandidates('MOT CACHE', ['NUAGEUX', 'ORAGEUX', 'PLUVIEUX']),
      formatExclusion('MOT CACHE', 'contains', 'N'), // élimine NUAGEUX
      formatExclusion('MOT CACHE', 'contains', 'P'), // élimine PLUVIEUX
    ]);
    expect(hasLint(room, 'value-presence-check')).toBe(false);
  });

  it('logique réelle : une contrainte qui élimine la solution est rejetée', () => {
    const room = makeLabRoom();
    addRealLetterPuzzle(room, 'logic_deduction', 'MOT CACHE', 'ORAGEUX', [
      formatCandidates('MOT CACHE', ['NUAGEUX', 'ORAGEUX', 'PLUVIEUX']),
      formatExclusion('MOT CACHE', 'contains', 'O'), // élimine TOUT (dont la solution)
      formatExclusion('MOT CACHE', 'contains', 'P'),
    ]);
    expect(hasLint(room, 'value-presence-check')).toBe(true);
  });

  it('anagramme réelle cohérente : les lettres relevées recomposent la valeur', () => {
    const room = makeLabRoom();
    addRealLetterPuzzle(room, 'spatial_observation', 'MOT RELEVE', 'CYCLONES', [
      formatAnagram('MOT RELEVE', 'SENOLCYC'.split(''), 'le vent qui tourne en spirale'),
    ]);
    expect(hasLint(room, 'value-presence-check')).toBe(false);
  });

  it('anagramme réelle : des lettres fausses sont rejetées', () => {
    const room = makeLabRoom();
    addRealLetterPuzzle(room, 'spatial_observation', 'MOT RELEVE', 'CYCLONES', [
      formatAnagram('MOT RELEVE', 'SENOLCYZ'.split(''), 'le vent qui tourne en spirale'),
    ]);
    expect(hasLint(room, 'value-presence-check')).toBe(true);
  });
});
