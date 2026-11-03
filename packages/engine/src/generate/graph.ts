// ============================================================================
// GÉNÉRATION — ÉTAPE 3 : GRAPHE (docs/02-ARCHITECTURE.md §3, étape 3).
// ----------------------------------------------------------------------------
// Génération À REBOURS depuis le GOAL : on pose une chaîne de puzzles où chaque
// verrou consomme le « jeton » (ITEM/ACCESS/INFO) produit par le précédent, et
// ses indices sont posés en couche antérieure (acyclicité par construction).
// Chaque gadget instancie un template : mécanisme + nœuds + objets + indices,
// en injectant de façon GARANTIE l'ancre (anchor-check) et l'unique valeur de
// sa catégorie sémantique (ambiguity-check).
// ============================================================================

import type { Affordance, NodeType } from '../types';
import {
  CIPHER_GLYPHS,
  TEMPLATES,
  formatAnagram,
  formatCandidates,
  formatCipherMessage,
  formatCipherTable,
  formatExclusion,
  type ExclusionKind,
} from '../content/templates/index';
import type { ThemePack, NameDesc } from '../content/themes/index';
import type { Scenario } from './scenario';
import type { DifficultyBudget } from './budget';
import {
  addNode,
  addObject,
  addPuzzle,
  allocCode,
  codeControls,
  nextId,
  pickKeyColor,
  pickNameDesc,
  pickPoi,
  type Blueprint,
} from './blueprint';
import { buildHints, mechanismDescription } from './dress';

export interface GraphCtx {
  bp: Blueprint;
  theme: ThemePack;
  scenario: Scenario;
  budget: DifficultyBudget;
}

interface Produced {
  nodeId: string;
  type: NodeType;
}

type OutputKind = 'item' | 'access' | 'goal' | 'info' | 'state';

/** Pool de vocabulaire pour matérialiser un ITEM produit (clé, outil, pièce). */
type ItemVocab = 'keyItem' | 'tool' | 'component';

interface OutputSpec {
  kind: OutputKind;
  /** couche de la zone verrouillée (pour un ACCESS de porte) */
  gateZoneLayer?: number;
  /** vocabulaire de l'objet ITEM produit (défaut : keyItem) */
  itemVocab?: ItemVocab;
}

// ————————————————————————————————— Helpers —————————————————————————————————

function layerOf(bp: Blueprint, zoneId: string): number {
  return bp.zones.find((z) => z.id === zoneId)?.layer ?? 0;
}

function zoneName(bp: Blueprint, zoneId: string): string {
  return bp.zones.find((z) => z.id === zoneId)?.name ?? zoneId;
}

/** Un objet porteur d'INFO (document) visible, lisible, dans la zone donnée. */
function clueDoc(g: GraphCtx, zoneId: string, text: string, label: string): string {
  const bp = g.bp;
  const objId = nextId(bp, 'obj');
  const nodeId = addNode(bp, {
    type: 'INFO',
    layer: layerOf(bp, zoneId),
    carrier: objId,
    label,
  });
  const doc: NameDesc = pickNameDesc(bp, g.theme.vocab.document);
  addObject(bp, {
    id: objId,
    name: doc.name,
    description: doc.desc,
    family: 'info_carrier',
    location: { zoneId, poiId: pickPoi(bp, zoneId) },
    initialState: 'visible',
    affordances: ['read'],
    reveals: [{ on: 'read', nodeIds: [nodeId], text }],
    requires: [],
    narrativeFragment: label,
  });
  return nodeId;
}

/**
 * Crée le nœud « jeton » de sortie d'un puzzle + l'éventuel objet matérialisant
 * (clé cachée, note cachée) que le mécanisme révèle.
 */
function makeToken(
  g: GraphCtx,
  zoneId: string,
  pid: string,
  out: OutputSpec,
): { node: Produced; revealObjectIds: string[] } {
  const bp = g.bp;
  switch (out.kind) {
    case 'item': {
      const keyObjId = nextId(bp, 'obj');
      const vocabKey: ItemVocab = out.itemVocab ?? 'keyItem';
      const nodeId = addNode(bp, {
        type: 'ITEM',
        layer: layerOf(bp, zoneId),
        producedBy: pid,
        carrier: keyObjId,
        label: 'objet à récupérer',
      });
      const key: NameDesc = pickNameDesc(bp, g.theme.vocab[vocabKey]);
      // Une CLÉ porte une étiquette de couleur dès sa création : la porte
      // qu'elle ouvre (keyLock) reprendra la MÊME mention sur sa plaque, et le
      // joueur peut associer clé ↔ serrure sans essai-erreur.
      let name = key.name;
      let description = key.desc;
      if (vocabKey === 'keyItem') {
        const color = pickKeyColor(bp, g.theme.colors);
        name = `${key.name} (${color})`;
        description = `${key.desc} Une étiquette indique « ${color} ».`;
        bp.keyColorByNode.set(nodeId, color);
        bp.usedObjectNames.add(name);
      }
      // Un composant s'assemble (combine) ; clé et outil s'emploient (use_on).
      const affordances: Affordance[] =
        vocabKey === 'component' ? ['take', 'combine'] : ['take', 'use_on'];
      addObject(bp, {
        id: keyObjId,
        name,
        description,
        family: 'instrument',
        location: { zoneId, poiId: pickPoi(bp, zoneId) },
        initialState: 'hidden',
        affordances,
        reveals: [
          {
            on: 'take',
            nodeIds: [],
            text: bp.rng.pick([
              `Vous empochez « ${name} ».`,
              `« ${name} » rejoint votre inventaire.`,
              `Vous récupérez « ${name} » avec précaution.`,
            ]),
          },
        ],
        requires: [],
      });
      return { node: { nodeId, type: 'ITEM' }, revealObjectIds: [keyObjId] };
    }
    case 'info': {
      const noteObjId = nextId(bp, 'obj');
      const nodeId = addNode(bp, {
        type: 'INFO',
        layer: layerOf(bp, zoneId),
        producedBy: pid,
        carrier: noteObjId,
        label: 'information révélée',
      });
      const doc: NameDesc = pickNameDesc(bp, g.theme.vocab.document);
      addObject(bp, {
        id: noteObjId,
        name: doc.name,
        description: doc.desc,
        family: 'info_carrier',
        location: { zoneId, poiId: pickPoi(bp, zoneId) },
        initialState: 'hidden',
        affordances: ['read'],
        reveals: [{ on: 'read', nodeIds: [], text: 'Le document confirme ce que le mécanisme a livré.' }],
        requires: [],
      });
      return { node: { nodeId, type: 'INFO' }, revealObjectIds: [noteObjId] };
    }
    case 'access': {
      const nodeId = addNode(bp, {
        type: 'ACCESS',
        layer: out.gateZoneLayer ?? layerOf(bp, zoneId) + 1,
        producedBy: pid,
        label: 'zone déverrouillée',
      });
      if (out.gateZoneLayer !== undefined) {
        const gated = bp.zones.find((z) => z.layer === out.gateZoneLayer);
        if (gated) gated.gate = pid;
      }
      return { node: { nodeId, type: 'ACCESS' }, revealObjectIds: [] };
    }
    case 'goal': {
      const nodeId = addNode(bp, {
        type: 'GOAL',
        layer: layerOf(bp, zoneId),
        producedBy: pid,
        label: 'objectif atteint',
      });
      bp.goalId = nodeId;
      return { node: { nodeId, type: 'GOAL' }, revealObjectIds: [] };
    }
    case 'state': {
      const nodeId = addNode(bp, {
        type: 'STATE',
        layer: layerOf(bp, zoneId),
        producedBy: pid,
        label: 'état du monde modifié',
      });
      return { node: { nodeId, type: 'STATE' }, revealObjectIds: [] };
    }
  }
}

// ————————————————————————————————— Gadget : verrou à code numérique —————————————————————————————————

interface NumericOpts {
  template: 'code_from_document' | 'labeled_dial_code';
  category: 'digits' | 'year';
  zoneId: string;
  extraInputs: string[];
  output: OutputSpec;
  /** zones où placer les documents d'indice (défaut : la zone du mécanisme) */
  ruleZoneId?: string;
  valueZoneId?: string;
}

function numericCode(g: GraphCtx, o: NumericOpts): Produced {
  const bp = g.bp;
  const pid = nextId(bp, 'p');
  const tmpl = TEMPLATES[o.template];
  const code = allocCode(bp, o.category, g.theme.words);
  const anchorPool = o.category === 'year' ? g.theme.anchors.year : g.theme.anchors.digits;
  const anchor = bp.rng.pick(anchorPool);
  const mechVocab: NameDesc = pickNameDesc(
    bp,
    o.template === 'labeled_dial_code' ? g.theme.vocab.dialPanel : g.theme.vocab.codeLock,
  );
  const motif = bp.rng.pick(g.scenario.motifs);

  // Indices : (règle facultative, sans valeur) + (valeur, avec ancre).
  // Chaque variante conserve ancre + valeur en clair (anchor/value-presence-check).
  const clueNodes: string[] = [];
  if (o.template === 'code_from_document') {
    clueNodes.push(
      clueDoc(
        g,
        o.ruleZoneId ?? o.zoneId,
        bp.rng.pick([
          `Consigne : le code de « ${mechVocab.name} » est la valeur « ${anchor} ». — ${motif}.`,
          `Note épinglée : pour ouvrir « ${mechVocab.name} », composer la valeur « ${anchor} » (${motif}).`,
          `Rappel de service — ${motif} : « ${mechVocab.name} » s'arme avec la valeur « ${anchor} ».`,
        ]),
        `règle : ${anchor}`,
      ),
    );
  }
  clueNodes.push(
    clueDoc(
      g,
      o.valueZoneId ?? o.zoneId,
      bp.rng.pick([
        `Registre officiel — ${anchor} : ${code.value}.`,
        `Extrait d'inventaire, souligné à l'encre : ${anchor} = ${code.value}.`,
        `Au bas de la page, une mention tamponnée : « ${anchor} : ${code.value} ».`,
      ]),
      `${anchor} = ${code.value}`,
    ),
  );

  const { node, revealObjectIds } = makeToken(g, o.zoneId, pid, o.output);

  const mechObjId = nextId(bp, 'obj');
  addObject(bp, {
    id: mechObjId,
    name: mechVocab.name,
    description: mechanismDescription(mechVocab.desc, anchor) + goalSuffix(o.output.kind),
    family: 'mechanism',
    location: { zoneId: o.zoneId, poiId: pickPoi(bp, o.zoneId) },
    initialState: 'locked',
    affordances: ['inspect', 'enter_code'],
    controls: codeControls(code, anchor),
    reveals: [
      {
        on: 'enter_code',
        nodeIds: [],
        objectIds: revealObjectIds,
        text: openingText(bp, o.output.kind),
      },
    ],
    requires: [],
  });

  const inputs = [...o.extraInputs, ...clueNodes];
  addPuzzle(bp, {
    id: pid,
    template: o.template,
    mechanismObjectId: mechObjId,
    inputs,
    outputs: [node.nodeId],
    solution: { kind: 'code', value: code.value },
    derivation: {
      sourceClueIds: clueNodes,
      rule: tmpl.clueSpec,
      anchorLabel: anchor,
      inferenceSteps: tmpl.inferenceSteps,
    },
    hints: buildHints(o.template, {
      zone: zoneName(bp, o.zoneId),
      mechanism: mechVocab.name,
      anchor,
      value: code.value,
      a: motif,
    }),
  });
  return node;
}

// ————————————————————————————————— Gadget : verrou à clé —————————————————————————————————

interface KeyLockOpts {
  zoneId: string;
  keyNode: string;
  output: OutputSpec;
}

function keyLock(g: GraphCtx, o: KeyLockOpts): Produced {
  const bp = g.bp;
  const pid = nextId(bp, 'p');
  const doorVocab: NameDesc = pickNameDesc(bp, g.theme.vocab.door);
  // La plaque de la porte reprend l'étiquette de SA clé (posée à la création de
  // l'ITEM) : le joueur associe clé ↔ serrure à la lecture, sans essai-erreur.
  const label = bp.keyColorByNode.get(o.keyNode) ?? pickKeyColor(bp, g.theme.colors);

  const { node, revealObjectIds } = makeToken(g, o.zoneId, pid, o.output);

  const doorObjId = nextId(bp, 'obj');
  addObject(bp, {
    id: doorObjId,
    name: doorVocab.name,
    description: `${doorVocab.desc} La plaque porte la mention « ${label} ».` + goalSuffix(o.output.kind),
    family: 'mechanism',
    location: { zoneId: o.zoneId, poiId: pickPoi(bp, o.zoneId) },
    initialState: 'locked',
    affordances: ['inspect', 'use_on'],
    controls: { kind: 'keyhole', label },
    reveals: [{ on: 'use_on', nodeIds: [], objectIds: revealObjectIds, text: openingText(bp, o.output.kind) }],
    requires: [],
  });

  addPuzzle(bp, {
    id: pid,
    template: 'key_lock',
    mechanismObjectId: doorObjId,
    inputs: [o.keyNode],
    outputs: [node.nodeId],
    solution: { kind: 'key', itemNodeId: o.keyNode },
    derivation: {
      sourceClueIds: [],
      rule: 'la clé étiquetée ouvre la serrure homonyme',
      anchorLabel: label,
      inferenceSteps: 1,
    },
    hints: buildHints('key_lock', {
      zone: zoneName(bp, o.zoneId),
      mechanism: doorVocab.name,
      anchor: label,
    }),
  });
  return node;
}

// ————————————————————————————————— Gadget : verrou à lettres —————————————————————————————————
// (logic_deduction, cipher_substitution, spatial_observation)

interface LetterOpts {
  template: 'logic_deduction' | 'cipher_substitution' | 'spatial_observation';
  zoneId: string;
  extraInputs: string[];
  output: OutputSpec;
  /** zones supplémentaires pour disperser les indices (jointure) */
  clueZoneIds?: string[];
}

function letterCode(g: GraphCtx, o: LetterOpts): Produced {
  const bp = g.bp;
  const pid = nextId(bp, 'p');
  const tmpl = TEMPLATES[o.template];
  const code = allocCode(bp, 'letters', g.theme.words);
  const value = code.value;
  // [W4] Unicité de l'ancre parmi les verrous à lettres (même logique que
  // usedWords/usedDigitLengths) : deux verrous à lettres co-atteignables ne
  // partagent jamais d'anchorLabel, sinon ambiguity-check les signalerait.
  const anchorPoolFull = g.theme.anchors.letters;
  const anchorPool = anchorPoolFull.filter((a) => !bp.usedLetterAnchors.has(a));
  const anchor = bp.rng.pick(anchorPool.length > 0 ? anchorPool : anchorPoolFull);
  bp.usedLetterAnchors.add(anchor);
  const mechVocab: NameDesc = pickNameDesc(bp, g.theme.vocab.letterLock);
  const zA = o.clueZoneIds?.[0] ?? o.zoneId;
  const zB = o.clueZoneIds?.[1] ?? o.zoneId;

  // FORMES DOSÉES PAR DIFFICULTÉ (GDD : easy doux, medium/hard déduisent) :
  //  - easy : la note contient la réponse en clair (formes historiques) ;
  //  - medium/hard : VRAIE énigme — la réponse se dérive (le lint de
  //    dérivabilité rejoue la déduction, cf. validate/lints.ts).
  // Chaque forme conserve l'ancre dans ses sources (anchor-check).
  const real = bp.config.difficulty !== 'easy';
  const clueNodes: string[] = [];
  if (o.template === 'spatial_observation') {
    const wordHint = g.theme.wordHints[value];
    if (real && wordHint) {
      // Anagramme guidée : lettres en désordre (jamais l'ordre du mot) + périphrase.
      let letters = bp.rng.shuffle(value.split(''));
      if (letters.join('') === value) letters = [...letters].reverse();
      clueNodes.push(
        clueDoc(g, o.zoneId, formatAnagram(anchor, letters, wordHint), `${anchor} → anagramme`),
      );
    } else {
      clueNodes.push(
        clueDoc(
          g,
          o.zoneId,
          bp.rng.pick([
            `Règle de lecture « ${anchor} » : en suivant la disposition, on épelle « ${value} ».`,
            `Croquis annoté « ${anchor} » : lu dans l'ordre du plan, cela épelle « ${value} ».`,
          ]),
          `${anchor} → ${value}`,
        ),
      );
    }
  } else if (o.template === 'cipher_substitution') {
    if (real) {
      // Vrai chiffre : message en glyphes + table glyphe→lettre à appliquer.
      const distinct = [...new Set(value.split(''))];
      const glyphs = bp.rng.shuffle([...CIPHER_GLYPHS]).slice(0, distinct.length);
      const glyphOf = new Map(distinct.map((l, i) => [l, glyphs[i]!]));
      const message = value.split('').map((l) => glyphOf.get(l)!);
      // Paires mélangées : l'ordre de la table ne trahit pas celui du mot.
      const pairs = bp.rng.shuffle(
        distinct.map((l) => [glyphOf.get(l)!, l] as [string, string]),
      );
      clueNodes.push(clueDoc(g, zA, formatCipherMessage(message), 'message chiffré'));
      clueNodes.push(clueDoc(g, zB, formatCipherTable(anchor, pairs), `table ${anchor}`));
    } else {
      clueNodes.push(
        clueDoc(
          g,
          zA,
          `Message chiffré gravé : une suite de glyphes indéchiffrable sans la table.`,
          'message chiffré',
        ),
      );
      clueNodes.push(
        clueDoc(
          g,
          zB,
          bp.rng.pick([
            `Table de substitution « ${anchor} » : chaque glyphe se traduit ; le clair donne « ${value} ».`,
            `Grille de déchiffrement « ${anchor} » : symbole après symbole, on obtient « ${value} ».`,
          ]),
          `table ${anchor}`,
        ),
      );
    }
  } else {
    // logic_deduction : candidats + contraintes qui éliminent VRAIMENT les leurres.
    const exclusions = real ? buildExclusions(g, value) : null;
    if (exclusions) {
      clueNodes.push(
        clueDoc(g, zA, formatCandidates(anchor, exclusions.candidates), `candidats ${anchor}`),
      );
      clueNodes.push(
        clueDoc(
          g,
          zB,
          formatExclusion(anchor, exclusions.rules[0]!.kind, exclusions.rules[0]!.letter),
          'contrainte 1',
        ),
      );
      clueNodes.push(
        clueDoc(
          g,
          o.zoneId,
          formatExclusion(anchor, exclusions.rules[1]!.kind, exclusions.rules[1]!.letter),
          'contrainte 2',
        ),
      );
    } else {
      // Forme douce (easy, ou pool de leurres épuisé) : conclusion en clair.
      clueNodes.push(
        clueDoc(g, zA, `Le dossier du responsable n'est ni à gauche ni au centre du meuble.`, 'contrainte 1'),
      );
      clueNodes.push(
        clueDoc(g, zB, `Celui rangé à droite n'appartient pas au dernier arrivé.`, 'contrainte 2'),
      );
      clueNodes.push(
        clueDoc(
          g,
          o.zoneId,
          bp.rng.pick([
            `Après élimination, l'association « ${anchor} » désigne le mot « ${value} ».`,
            `Une seule possibilité résiste aux notes : « ${anchor} » = « ${value} ».`,
          ]),
          `${anchor} = ${value}`,
        ),
      );
    }
  }

  const { node, revealObjectIds } = makeToken(g, o.zoneId, pid, o.output);

  const mechObjId = nextId(bp, 'obj');
  addObject(bp, {
    id: mechObjId,
    name: mechVocab.name,
    description: mechanismDescription(mechVocab.desc, anchor) + goalSuffix(o.output.kind),
    family: 'mechanism',
    location: { zoneId: o.zoneId, poiId: pickPoi(bp, o.zoneId) },
    initialState: 'locked',
    affordances: ['inspect', 'enter_code'],
    controls: codeControls(code, anchor),
    reveals: [{ on: 'enter_code', nodeIds: [], objectIds: revealObjectIds, text: openingText(bp, o.output.kind) }],
    requires: [],
  });

  addPuzzle(bp, {
    id: pid,
    template: o.template,
    mechanismObjectId: mechObjId,
    inputs: [...o.extraInputs, ...clueNodes],
    outputs: [node.nodeId],
    solution: { kind: 'code', value },
    derivation: {
      sourceClueIds: clueNodes,
      rule: tmpl.clueSpec,
      anchorLabel: anchor,
      inferenceSteps: tmpl.inferenceSteps,
    },
    hints: buildHints(o.template, {
      zone: zoneName(bp, o.zoneId),
      mechanism: mechVocab.name,
      anchor,
      value,
    }),
  });
  return node;
}

/**
 * Prépare une VRAIE déduction logique : 2 leurres tirés du pool `words` du
 * thème + une contrainte par leurre qui l'élimine SANS jamais éliminer la
 * solution. Les leurres sont réservés (`usedWords`) : ils ne seront la valeur
 * d'aucun autre verrou → ambiguity-check sûr par construction. Renvoie null
 * si le pool est épuisé ou un leurre indiscernable (fallback forme douce).
 */
function buildExclusions(
  g: GraphCtx,
  value: string,
): { candidates: string[]; rules: { kind: ExclusionKind; letter: string }[] } | null {
  const bp = g.bp;
  const pool = g.theme.words.filter((w) => w !== value && !bp.usedWords.has(w));
  if (pool.length < 2) return null;
  const decoys = bp.rng.shuffle(pool).slice(0, 2);

  const rules: { kind: ExclusionKind; letter: string }[] = [];
  for (const d of decoys) {
    const rule = exclusionFor(d, value);
    if (!rule) return null;
    rules.push(rule);
  }
  for (const d of decoys) bp.usedWords.add(d);
  // Candidats mélangés : la position dans la liste ne trahit rien.
  const candidates = bp.rng.shuffle([value, ...decoys]);
  return { candidates, rules };
}

/** Une contrainte vraie pour la solution et fausse pour le leurre. */
function exclusionFor(
  decoy: string,
  value: string,
): { kind: ExclusionKind; letter: string } | null {
  const extra = [...new Set(decoy.split(''))].filter((l) => !value.includes(l));
  if (extra.length > 0) return { kind: 'contains', letter: extra[0]! };
  if (decoy[0] !== value[0]) return { kind: 'starts', letter: decoy[0]! };
  const dLast = decoy[decoy.length - 1]!;
  if (dLast !== value[value.length - 1]) return { kind: 'ends', letter: dLast };
  return null; // anagramme parfaite de même initiale/finale : indiscernable
}

// ————————————————————————————————— Gadget : séquence —————————————————————————————————
// (mechanism_sequence, mapping_sequence)

interface SequenceOpts {
  template: 'mechanism_sequence' | 'mapping_sequence';
  zoneId: string;
  extraInputs: string[];
  output: OutputSpec;
  clueZoneIds?: string[];
}

function sequenceGadget(g: GraphCtx, o: SequenceOpts): Produced {
  const bp = g.bp;
  const pid = nextId(bp, 'p');
  const tmpl = TEMPLATES[o.template];
  const K = 3;
  const zA = o.clueZoneIds?.[0] ?? o.zoneId;
  const zB = o.clueZoneIds?.[1] ?? o.zoneId;

  const clueNodes: string[] = [];
  let options: { id: string; label: string }[];
  let steps: string[];
  let orderText: string;
  let mapText = '';

  if (o.template === 'mechanism_sequence') {
    const cols = bp.rng.shuffle(g.theme.colors).slice(0, K);
    options = cols.map((c, i) => ({ id: `${pid}.opt${i}`, label: c }));
    const order = bp.rng.shuffle(options);
    steps = order.map((op) => op.id);
    orderText = order.map((op) => op.label).join(', puis ');
    clueNodes.push(clueDoc(g, zA, `Procédure d'amorçage : ${orderText}.`, 'ordre d’amorçage'));
  } else {
    const terms = bp.rng.shuffle(g.theme.colors).slice(0, K);
    const syms = bp.rng.shuffle(g.theme.symbols).slice(0, K);
    options = syms.map((s, i) => ({ id: `${pid}.opt${i}`, label: s }));
    const order = bp.rng.shuffle(terms.map((t, i) => ({ t, i })));
    steps = order.map((it) => options[it.i]!.id);
    orderText = order.map((it) => it.t).join(', puis ');
    mapText = terms.map((t, i) => `${t} → ${options[i]!.label}`).join(' ; ');
    clueNodes.push(clueDoc(g, zA, `Ordre rituel : ${orderText}.`, 'ordre'));
    clueNodes.push(clueDoc(g, zB, `Correspondance : ${mapText}.`, 'correspondance'));
  }

  const { node, revealObjectIds } = makeToken(g, o.zoneId, pid, o.output);
  const mechVocab: NameDesc = pickNameDesc(
    bp,
    o.template === 'mechanism_sequence' ? g.theme.vocab.leverPanel : g.theme.vocab.symbolPanel,
  );

  const mechObjId = nextId(bp, 'obj');
  addObject(bp, {
    id: mechObjId,
    name: mechVocab.name,
    description: mechVocab.desc + goalSuffix(o.output.kind),
    family: 'mechanism',
    location: { zoneId: o.zoneId, poiId: pickPoi(bp, o.zoneId) },
    initialState: 'locked',
    affordances: ['inspect', 'enter_sequence'],
    controls: { kind: 'sequence', options, slots: K },
    reveals: [{ on: 'enter_sequence', nodeIds: [], objectIds: revealObjectIds, text: openingText(bp, o.output.kind) }],
    requires: [],
  });

  addPuzzle(bp, {
    id: pid,
    template: o.template,
    mechanismObjectId: mechObjId,
    inputs: [...o.extraInputs, ...clueNodes],
    outputs: [node.nodeId],
    solution: { kind: 'sequence', steps },
    derivation: {
      sourceClueIds: clueNodes,
      rule: tmpl.clueSpec,
      inferenceSteps: tmpl.inferenceSteps,
    },
    hints: buildHints(o.template, {
      zone: zoneName(bp, o.zoneId),
      mechanism: mechVocab.name,
      order: orderText,
      mapping: mapText,
    }),
  });
  return node;
}

// ————————————————————————————————— Gadget : outil révélateur (T4) —————————————————————————————————
// L'outil (nœud ITEM produit par un puzzle AMONT — jamais une simple récolte,
// sinon tool-order-check verrait outil et usage à la même passe) s'emploie sur
// un support marqué ; la cache révélée matérialise l'output. Zéro indice
// textuel : la découverte est interactive (inferenceSteps 1, GDD §5 T4).

interface ToolRevealOpts {
  zoneId: string;
  /** nœud ITEM de l'outil, output d'un puzzle strictement antérieur */
  toolNodeId: string;
  output: OutputSpec;
}

function toolReveal(g: GraphCtx, o: ToolRevealOpts): Produced {
  const bp = g.bp;
  const pid = nextId(bp, 'p');
  const tmpl = TEMPLATES['tool_reveal'];
  const supportVocab: NameDesc = pickNameDesc(bp, g.theme.vocab.support);
  const toolCarrier = bp.nodes.find((n) => n.id === o.toolNodeId)?.carrier;
  const toolName = bp.objects.find((x) => x.id === toolCarrier)?.name ?? 'l’outil';

  const { node, revealObjectIds } = makeToken(g, o.zoneId, pid, o.output);

  const supportObjId = nextId(bp, 'obj');
  addObject(bp, {
    id: supportObjId,
    name: supportVocab.name,
    description: `${supportVocab.desc} À l’œil nu, rien — mais la surface semble traitée.`,
    family: 'mechanism',
    location: { zoneId: o.zoneId, poiId: pickPoi(bp, o.zoneId) },
    initialState: 'visible',
    affordances: ['inspect', 'use_on'],
    controls: { kind: 'use_target' },
    reveals: [
      {
        on: 'use_on',
        nodeIds: [],
        objectIds: revealObjectIds,
        text: bp.rng.pick([
          `Sous « ${toolName} », des marques invisibles apparaissent : une cache se dévoile.`,
          `« ${toolName} » balaie la surface — un motif caché surgit et découvre une cache.`,
        ]),
      },
    ],
    requires: [],
  });

  addPuzzle(bp, {
    id: pid,
    template: 'tool_reveal',
    mechanismObjectId: supportObjId,
    inputs: [o.toolNodeId],
    outputs: [node.nodeId],
    solution: { kind: 'use_on', toolNodeId: o.toolNodeId, targetObjectId: supportObjId },
    derivation: {
      sourceClueIds: [],
      rule: `${toolName} révèle la marque de ${supportVocab.name}`,
      inferenceSteps: tmpl.inferenceSteps,
    },
    hints: buildHints('tool_reveal', {
      zone: zoneName(bp, o.zoneId),
      tool: toolName,
      support: supportVocab.name,
    }),
  });
  return node;
}

// ————————————————————————————————— Gadget : assemblage d'objets (T5) —————————————————————————————————
// Les composants (nœuds ITEM produits par des puzzles AMONT) s'assemblent en un
// objet fonctionnel. Convention runtime : le mécanisme du puzzle est le PREMIER
// composant (handleCombine ne retrouve le puzzle que via ses composants).
// no-loss-check : les composants ne doivent alimenter AUCUN autre puzzle.

interface CombineOpts {
  zoneId: string;
  /** nœuds ITEM des composants (outputs de puzzles strictement antérieurs) */
  componentNodeIds: string[];
  output: OutputSpec;
}

function combineItems(g: GraphCtx, o: CombineOpts): Produced {
  const bp = g.bp;
  const pid = nextId(bp, 'p');
  const tmpl = TEMPLATES['combine_items'];

  const carriers = o.componentNodeIds.map(
    (nid) => bp.nodes.find((n) => n.id === nid)?.carrier ?? '',
  );
  const names = carriers.map((cid) => bp.objects.find((x) => x.id === cid)?.name ?? 'une pièce');

  const { node, revealObjectIds } = makeToken(g, o.zoneId, pid, o.output);
  const resultName =
    bp.objects.find((x) => x.id === bp.nodes.find((n) => n.id === node.nodeId)?.carrier)?.name ??
    'l’objet assemblé';

  // Le premier composant porte le reveal d'assemblage (c'est lui le « mécanisme »).
  const anchorObj = bp.objects.find((x) => x.id === carriers[0]);
  anchorObj?.reveals.push({
    on: 'combine',
    nodeIds: [],
    objectIds: revealObjectIds,
    text: bp.rng.pick([
      `Les pièces s’emboîtent parfaitement : « ${resultName} » prend forme.`,
      `Un ajustement, un déclic : « ${resultName} » est enfin complet.`,
    ]),
  });

  addPuzzle(bp, {
    id: pid,
    template: 'combine_items',
    mechanismObjectId: carriers[0]!,
    inputs: [...o.componentNodeIds],
    outputs: [node.nodeId],
    solution: { kind: 'combine', itemNodeIds: [...o.componentNodeIds] },
    derivation: {
      sourceClueIds: [],
      rule: `assemblage : ${names.join(' + ')}`,
      inferenceSteps: tmpl.inferenceSteps,
    },
    hints: buildHints('combine_items', {
      zone: zoneName(bp, o.zoneId),
      a: names[0] ?? 'la première pièce',
      b: names[1] ?? 'la seconde pièce',
    }),
  });
  return node;
}

// ————————————————————————————————— Producteurs interchangeables —————————————————————————————————

/** Producteur parallèle (branche) résolu au 1er pas en z0. */
function sideProducer(g: GraphCtx, output: OutputSpec): Produced {
  if (g.bp.rng.chance(0.5)) {
    return sequenceGadget(g, {
      template: 'mechanism_sequence',
      zoneId: 'z0',
      extraInputs: [],
      output,
    });
  }
  return letterCode(g, {
    template: 'spatial_observation',
    zoneId: 'z0',
    extraInputs: [],
    output,
  });
}

type ProducerKind = 'code' | 'dial' | 'sequence' | 'spatial' | 'cipher';

/**
 * Producteur de jeton INTERCHANGEABLE : même topologie (un puzzle, indices
 * locaux à la zone), gadget VARIÉ par tirage — casse la monotonie
 * « code → clé → cadran » ressentie de salle en salle (retour joueur).
 * NB : au plus UN 'dial' (année) par salle — l'appelant garantit qu'un seul
 * maillon de la salle a 'dial' dans son pool (unicité de catégorie année).
 */
function variantProducer(
  g: GraphCtx,
  o: { zoneId: string; extraInputs: string[]; output: OutputSpec; pool: ProducerKind[] },
): Produced {
  const kind = g.bp.rng.pick(o.pool);
  switch (kind) {
    case 'code':
      return numericCode(g, {
        template: 'code_from_document',
        category: 'digits',
        zoneId: o.zoneId,
        extraInputs: o.extraInputs,
        output: o.output,
      });
    case 'dial':
      return numericCode(g, {
        template: 'labeled_dial_code',
        category: 'year',
        zoneId: o.zoneId,
        extraInputs: o.extraInputs,
        output: o.output,
      });
    case 'sequence':
      return sequenceGadget(g, {
        template: 'mechanism_sequence',
        zoneId: o.zoneId,
        extraInputs: o.extraInputs,
        output: o.output,
      });
    case 'spatial':
      return letterCode(g, {
        template: 'spatial_observation',
        zoneId: o.zoneId,
        extraInputs: o.extraInputs,
        output: o.output,
      });
    case 'cipher':
      return letterCode(g, {
        template: 'cipher_substitution',
        zoneId: o.zoneId,
        extraInputs: o.extraInputs,
        output: o.output,
        clueZoneIds: [o.zoneId, o.zoneId],
      });
  }
}

/** Maillon de rallonge (fait varier la profondeur dans la fourchette du GDD). */
function relayLink(g: GraphCtx, zoneId: string, token: string, allowLogic: boolean): Produced {
  const pool: LetterOpts['template'][] = allowLogic
    ? ['spatial_observation', 'cipher_substitution', 'logic_deduction']
    : ['spatial_observation', 'cipher_substitution'];
  const template = g.bp.rng.pick(pool);
  return letterCode(g, {
    template,
    zoneId,
    extraInputs: [token],
    output: { kind: 'item' },
    clueZoneIds: [zoneId, zoneId],
  });
}

/** Texte d'ouverture d'un mécanisme, varié par tirage (sans chiffre ni valeur). */
function openingText(bp: Blueprint, kind: OutputKind): string {
  switch (kind) {
    case 'item':
      return bp.rng.pick([
        'Le mécanisme cède ; à l’intérieur, un objet apparaît.',
        'Un déclic sec — le compartiment s’ouvre sur un objet.',
        'La façade pivote et découvre un objet resté à l’abri.',
      ]);
    case 'access':
      return bp.rng.pick([
        'Le verrou lâche ; un passage s’ouvre vers la zone suivante.',
        'Les gonds cèdent enfin : la voie est libre.',
      ]);
    case 'goal':
      return 'Le dernier verrou cède. La voie de sortie s’ouvre enfin.';
    case 'info':
      return bp.rng.pick([
        'Le mécanisme s’ouvre sur un document resté caché.',
        'Derrière le panneau, un document attendait.',
      ]);
    case 'state':
      return 'Un déclic : l’installation change d’état.';
  }
}

/** Rattache visiblement le DERNIER mécanisme à la sortie (cohérence narrative). */
function goalSuffix(kind: OutputKind): string {
  return kind === 'goal'
    ? ' Un faisceau de câbles court d’ici jusqu’au verrou de la sortie.'
    : '';
}

// ————————————————————————————————— Assemblage par difficulté —————————————————————————————————

export function buildGraph(g: GraphCtx): void {
  switch (g.bp.config.difficulty) {
    case 'easy':
      buildEasy(g);
      break;
    case 'medium':
      buildMedium(g);
      break;
    case 'hard':
      buildHard(g);
      break;
  }
}

/**
 * easy : 3-4 puzzles, 2 zones, 1 branche, 0 jointure, profondeur 3-4.
 * Trois variantes : directe (3), relais lettres (4), outil révélateur (4).
 */
function buildEasy(g: GraphCtx): void {
  const variant = g.bp.rng.int(0, 2);

  if (variant === 2) {
    // P1 (code → lampe/loupe) → T2 (outil sur support → clé cachée) → K3 → GOAL
    const tool = numericCode(g, {
      template: 'code_from_document',
      category: 'digits',
      zoneId: 'z0',
      extraInputs: [],
      output: { kind: 'item', itemVocab: 'tool' },
    });
    const key = toolReveal(g, { zoneId: 'z0', toolNodeId: tool.nodeId, output: { kind: 'item' } });
    const a1 = keyLock(g, { zoneId: 'z0', keyNode: key.nodeId, output: { kind: 'access', gateZoneLayer: 1 } });
    numericCode(g, {
      template: 'labeled_dial_code',
      category: 'year',
      zoneId: 'z1',
      extraInputs: [a1.nodeId],
      output: { kind: 'goal' },
    });
    return;
  }

  const key1 = numericCode(g, {
    template: 'code_from_document',
    category: 'digits',
    zoneId: 'z0',
    extraInputs: [],
    output: { kind: 'item' },
  });
  const a1 = keyLock(g, { zoneId: 'z0', keyNode: key1.nodeId, output: { kind: 'access', gateZoneLayer: 1 } });
  let tok = a1.nodeId;
  if (variant === 1) tok = relayLink(g, 'z1', tok, false).nodeId; // profondeur 4
  numericCode(g, {
    template: 'labeled_dial_code',
    category: 'year',
    zoneId: 'z1',
    extraInputs: [tok],
    output: { kind: 'goal' },
  });
}

/**
 * medium : 7-8 puzzles, 3 zones, 2 branches (P1 // S), 1 jointure multi-zones,
 * profondeur 6-7. Deux variantes pour la clé de la 1re porte (rejouabilité) :
 *   - assemblage (2/3) : deux composants parallèles se combinent ;
 *   - outil (1/3)      : un outil révélé par code dévoile la clé cachée.
 * Dans les deux cas : plus de matière sans pic de profondeur (retour joueur).
 */
function buildMedium(g: GraphCtx): void {
  const useTool = g.bp.rng.chance(1 / 3);
  // producteur parallèle (branche) : résolu au même pas que P1. INFO consommée
  // par la jointure finale en variante outil ; composant du combine sinon.
  const side = sideProducer(
    g,
    useTool ? { kind: 'info' } : { kind: 'item', itemVocab: 'component' },
  );

  let gateKey: Produced;
  if (useTool) {
    // Producteur d'outil varié : code chiffré OU vrai déchiffrement.
    const tool = variantProducer(g, {
      zoneId: 'z0',
      extraInputs: [],
      output: { kind: 'item', itemVocab: 'tool' },
      pool: ['code', 'cipher'],
    });
    gateKey = toolReveal(g, { zoneId: 'z0', toolNodeId: tool.nodeId, output: { kind: 'item' } });
  } else {
    const compA = variantProducer(g, {
      zoneId: 'z0',
      extraInputs: [],
      output: { kind: 'item', itemVocab: 'component' },
      pool: ['code', 'cipher'],
    });
    gateKey = combineItems(g, {
      zoneId: 'z0',
      componentNodeIds: [compA.nodeId, side.nodeId],
      output: { kind: 'item' },
    });
  }

  const a1 = keyLock(g, { zoneId: 'z0', keyNode: gateKey.nodeId, output: { kind: 'access', gateZoneLayer: 1 } });
  // Clé de z2 : cadran-année, séquence de leviers ou observation — le milieu
  // de salle ne se répète plus (seul maillon avec 'dial' → unicité année).
  const key4 = variantProducer(g, {
    zoneId: 'z1',
    extraInputs: [a1.nodeId],
    output: { kind: 'item' },
    pool: ['dial', 'sequence', 'spatial'],
  });
  const a2 = keyLock(g, { zoneId: 'z1', keyNode: key4.nodeId, output: { kind: 'access', gateZoneLayer: 2 } });
  let tok = a2.nodeId;
  const extra = g.bp.rng.int(0, 1); // profondeur 6 ou 7
  for (let i = 0; i < extra; i++) tok = relayLink(g, 'z2', tok, false).nodeId;
  // Jointure finale VARIÉE (indices z0 + z2 dans les trois cas → jointure
  // multi-zones préservée). En variante outil, l'INFO parallèle de z0 s'y
  // consomme aussi (progress-check).
  const finalInputs = useTool ? [tok, side.nodeId] : [tok];
  const finale = g.bp.rng.pick(['code', 'cipher', 'mapping'] as const);
  if (finale === 'code') {
    numericCode(g, {
      template: 'code_from_document',
      category: 'digits',
      zoneId: 'z2',
      extraInputs: finalInputs,
      output: { kind: 'goal' },
      ruleZoneId: 'z0',
      valueZoneId: 'z2',
    });
  } else if (finale === 'cipher') {
    letterCode(g, {
      template: 'cipher_substitution',
      zoneId: 'z2',
      extraInputs: finalInputs,
      output: { kind: 'goal' },
      clueZoneIds: ['z0', 'z2'],
    });
  } else {
    sequenceGadget(g, {
      template: 'mapping_sequence',
      zoneId: 'z2',
      extraInputs: finalInputs,
      output: { kind: 'goal' },
      clueZoneIds: ['z0', 'z2'],
    });
  }
}

/**
 * hard : 10 puzzles, 4 zones, 3 branches parallèles, 2 jointures multi-zones,
 * inférence 3, profondeur critique FIXE à 8 (le pic 9-10 de l'ancien scaffold
 * était punitif — retour joueur). La richesse vient de la LARGEUR (assemblage,
 * outil révélateur, 3 branches au départ), plus d'une chaîne plus longue.
 */
function buildHard(g: GraphCtx): void {
  // passe 1 — trois branches en z0 (producteur A varié : code OU déchiffrement)
  const compA = variantProducer(g, {
    zoneId: 'z0',
    extraInputs: [],
    output: { kind: 'item', itemVocab: 'component' },
    pool: ['code', 'cipher'],
  });
  const side = sideProducer(g, { kind: 'info' }); // INFO consommée par la jointure #1
  const compB = letterCode(g, {
    template: 'spatial_observation',
    zoneId: 'z0',
    extraInputs: [],
    output: { kind: 'item', itemVocab: 'component' },
  });
  // passe 2-3 — assemblage → clé → z1
  const assembled = combineItems(g, {
    zoneId: 'z0',
    componentNodeIds: [compA.nodeId, compB.nodeId],
    output: { kind: 'item' },
  });
  const a1 = keyLock(g, { zoneId: 'z0', keyNode: assembled.nodeId, output: { kind: 'access', gateZoneLayer: 1 } });
  // passes 4-6 — z1 : un mécanisme varié livre l'OUTIL, l'outil révèle la clé
  // de z2 (seul maillon avec 'dial' → unicité de la catégorie année).
  const tool = variantProducer(g, {
    zoneId: 'z1',
    extraInputs: [a1.nodeId],
    output: { kind: 'item', itemVocab: 'tool' },
    pool: ['dial', 'sequence'],
  });
  const key2 = toolReveal(g, { zoneId: 'z1', toolNodeId: tool.nodeId, output: { kind: 'item' } });
  const a2 = keyLock(g, { zoneId: 'z1', keyNode: key2.nodeId, output: { kind: 'access', gateZoneLayer: 2 } });
  // passe 7 — jointure #1 : logic_deduction (inférence 3), indices z2 + info z0,
  // qui OUVRE DIRECTEMENT z3 (pas de keyLock intermédiaire : -2 de profondeur)
  const a3 = letterCode(g, {
    template: 'logic_deduction',
    zoneId: 'z2',
    extraInputs: [a2.nodeId, side.nodeId],
    output: { kind: 'access', gateZoneLayer: 3 },
    clueZoneIds: ['z2', 'z2'],
  });
  // passe 8 — jointure #2 finale : chiffre OU mapping (indices z3 + z1) → GOAL
  if (g.bp.rng.chance(0.5)) {
    letterCode(g, {
      template: 'cipher_substitution',
      zoneId: 'z3',
      extraInputs: [a3.nodeId],
      output: { kind: 'goal' },
      clueZoneIds: ['z3', 'z1'],
    });
  } else {
    sequenceGadget(g, {
      template: 'mapping_sequence',
      zoneId: 'z3',
      extraInputs: [a3.nodeId],
      output: { kind: 'goal' },
      clueZoneIds: ['z3', 'z1'],
    });
  }
}
