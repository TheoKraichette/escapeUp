// ============================================================================
// LINTS DE FAIRNESS — les vérifications de docs/02-ARCHITECTURE.md §4.2
// (Règles d'or du GDD §8). Chaque lint renvoie des LintFinding ; `lintRoom`
// agrège. Une salle est refusée s'il reste un finding de niveau 'error'.
//
// DURCISSEMENT (audit adversarial) : les 9 lints d'origine étaient « masqués »
// par la discipline du générateur (ils passaient par construction mais ne
// faisaient pas RÉELLEMENT respecter les Règles d'or à une salle éditée/future).
// On les rend indépendants du générateur et on ajoute deux filets :
//   - value-presence-check        [E1] : la valeur-solution est réellement lisible.
//   - unreachable-mechanism-check [E3] : aucun verrou atteignable ne reste mort.
// dag-check [E3], semanticCategory [E2/W4/W5], ambiguity-check [W4/W5] et
// tool-order-check [W6] sont durcis in-place (voir commentaires locaux).
// ============================================================================

import type { LintFinding, LintReport, PuzzleInstance, RoomSpec } from '../types';
import { buildIndex, isObjectReachable, type RoomIndex } from '../resolve';
import {
  deriveAnagramLetters,
  deriveCipher,
  deriveLogic,
} from '../content/templates/index';
import { runSolver, type SolverRun } from './solver';

// ————————————————————————————————— Typage sémantique —————————————————————————————————
//
// Heuristique documentée reliant un puzzle à code à une catégorie de VALEUR et à
// un motif regex. Sert à ambiguity-check / decoy-check / value-presence-check.
//
// L'identité de catégorie dépend de l'ALPHABET du contrôle (chiffres/lettres),
// de l'ANCRE normalisée et — pour les chiffres — de la LONGUEUR, jamais d'un
// simple préfixe (corrige [E2] : les années < 1900 ; [W4]/[W5] : lettres et
// désambiguïsation par ancre). Concrètement :
//
//   « letters:<ancre> » : verrou à lettres → mots en MAJUSCULES (≥ 2 lettres).
//   « year »            : ancre ~ /ann[ée]e|year/ → toute année plausible 1000-2999.
//   « digits:<ancre>:N »: sinon, N = longueur → \b\d{N}\b, comparée à ancre+longueur.

export interface SemanticCategory {
  id: string;
  regex: RegExp;
}

/** Motif d'un « mot en majuscules » (valeur d'un verrou à lettres, accents inclus). */
const UPPER_WORD_SOURCE = '[A-ZÀ-ÖØ-Þ]{2,}';

/** Alphabet effectif d'un puzzle à code : déclaré par le contrôle, sinon inféré. */
export function codeAlphabet(idx: RoomIndex, p: PuzzleInstance): 'digits' | 'letters' {
  const controls = idx.objectsById.get(p.mechanismObjectId)?.controls;
  if (controls && controls.kind === 'code') return controls.alphabet;
  if (p.solution.kind === 'code') return /[A-Za-zÀ-ÿ]/.test(p.solution.value) ? 'letters' : 'digits';
  return 'digits';
}

export function semanticCategory(idx: RoomIndex, p: PuzzleInstance): SemanticCategory {
  const anchor = p.derivation.anchorLabel ?? '';
  const anchorNorm = normalizeText(anchor);
  const alphabet = codeAlphabet(idx, p);

  // Verrou à lettres : catégorie ancrée, valeurs = mots en majuscules ([W4]).
  if (alphabet === 'letters') {
    return { id: `letters:${anchorNorm}`, regex: new RegExp(UPPER_WORD_SOURCE, 'g') };
  }
  // Ancre « année » : toute année plausible à 4 chiffres, bornée 1000-2999 ([E2]),
  // et non plus le seul préfixe 19/20 (qui laissait fuir 1789, 1804…).
  if (/ann[eé]e|year/.test(anchor.toLowerCase())) {
    return { id: 'year', regex: /\b[12]\d{3}\b/g };
  }
  // Verrou à chiffres : identité = ancre + longueur ([W5]), pas la longueur seule.
  const controls = idx.objectsById.get(p.mechanismObjectId)?.controls;
  let length = 0;
  if (controls && controls.kind === 'code') length = controls.length;
  else if (p.solution.kind === 'code') length = p.solution.value.length;
  if (length <= 0) length = 1;
  return { id: `digits:${anchorNorm}:${length}`, regex: new RegExp(`\\b\\d{${length}}\\b`, 'g') };
}

/** Normalise un texte pour comparaison d'ancre : minuscules, sans accents ni ponctuation. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // supprime les diacritiques combinants
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function distinctMatches(texts: string[], regex: RegExp): string[] {
  const found = new Set<string>();
  for (const t of texts) {
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    for (const m of t.matchAll(re)) found.add(m[0]);
  }
  return [...found];
}

// ————————————————————————————————— Contexte partagé —————————————————————————————————

interface LintCtx {
  room: RoomSpec;
  idx: RoomIndex;
  run: SolverRun;
}

const isCodePuzzle = (p: PuzzleInstance) => p.solution.kind === 'code';

/** Textes atteignables (reveals déclenchés + descriptions des zones accessibles) au pass donné. */
function reachableTextsAt(ctx: LintCtx, pass: number): string[] {
  const texts: string[] = [];
  for (let i = 0; i < pass && i < ctx.run.textsByPass.length; i++) {
    texts.push(...ctx.run.textsByPass[i]!);
  }
  // descriptions des objets des zones accessibles à ce pass
  const solvedByPass = new Set<string>();
  for (const [pid, p] of ctx.run.passOfPuzzle) if (p <= pass) solvedByPass.add(pid);
  for (const obj of ctx.room.objects) {
    const loc = obj.location;
    if (loc === 'inventory' || loc === 'hidden') continue;
    const zone = ctx.idx.zonesById.get(loc.zoneId);
    if (!zone) continue;
    if (zone.gate && !solvedByPass.has(zone.gate)) continue;
    texts.push(obj.description, obj.name);
  }
  return texts;
}

// ————————————————————————————————— 1. dag-check —————————————————————————————————
// Tri topologique du graphe (nœuds + puzzles). Un cycle = violation Règle d'or n°2.

function lintDag(ctx: LintCtx): LintFinding[] {
  const { room } = ctx;
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  const vertices = new Set<string>();
  const touch = (v: string) => {
    vertices.add(v);
    if (!indeg.has(v)) indeg.set(v, 0);
    if (!adj.has(v)) adj.set(v, []);
  };
  const edge = (a: string, b: string) => {
    touch(a);
    touch(b);
    adj.get(a)!.push(b);
    indeg.set(b, (indeg.get(b) ?? 0) + 1);
  };

  for (const p of room.puzzles) {
    const pv = `puzzle:${p.id}`;
    for (const input of p.inputs) edge(`node:${input}`, pv);
    for (const output of p.outputs) edge(pv, `node:${output}`);
  }
  // Arêtes déclarées du graphe (node → puzzle) — redondantes mais auditées.
  for (const e of room.graph.edges) {
    if (room.puzzles.some((p) => p.id === e.to)) edge(`node:${e.from}`, `puzzle:${e.to}`);
  }

  // [E3] Arêtes IMPLICITES : portes de zone + reveals gardés. Sans elles, un
  // verrou pouvait garder sa propre clé (une source enfermée dans la zone que le
  // verrou ouvre) sans que dag-check ne bronche (le solveur restait « solvable »
  // via une autre chaîne). On modélise donc la contrainte d'atteignabilité réelle.
  const zoneOfObject = (objectId: string) => {
    const o = ctx.idx.objectsById.get(objectId);
    if (!o || o.location === 'inventory' || o.location === 'hidden') return undefined;
    return ctx.idx.zonesById.get(o.location.zoneId);
  };
  // (1) Le gardien de la zone d'un mécanisme précède le puzzle attaché à ce mécanisme.
  for (const p of room.puzzles) {
    const z = zoneOfObject(p.mechanismObjectId);
    if (z?.gate) edge(`puzzle:${z.gate}`, `puzzle:${p.id}`);
  }
  // (2) Un nœud INFO/ITEM porté dans une zone gardée n'est acquérable qu'APRÈS
  //     résolution du gardien : gate → node. Combiné à l'arête node → consommateur
  //     déjà posée, tout « verrou gardant sa propre clé » referme un cycle détecté.
  for (const n of room.graph.nodes) {
    if (n.type !== 'INFO' && n.type !== 'ITEM') continue;
    if (!n.carrier) continue;
    const z = zoneOfObject(n.carrier);
    if (z?.gate) edge(`puzzle:${z.gate}`, `node:${n.id}`);
  }

  const queue: string[] = [];
  for (const v of vertices) if ((indeg.get(v) ?? 0) === 0) queue.push(v);
  let visited = 0;
  while (queue.length > 0) {
    const v = queue.shift()!;
    visited++;
    for (const w of adj.get(v) ?? []) {
      indeg.set(w, (indeg.get(w) ?? 0) - 1);
      if ((indeg.get(w) ?? 0) === 0) queue.push(w);
    }
  }
  if (visited < vertices.size) {
    const inCycle = [...vertices].filter((v) => (indeg.get(v) ?? 0) > 0);
    return [
      {
        lint: 'dag-check',
        level: 'error',
        message: `Le graphe de solution contient un cycle (${inCycle.length} sommets non ordonnables).`,
        subjectIds: inCycle.map((v) => v.replace(/^(node|puzzle):/, '')),
      },
    ];
  }
  return [];
}

// ————————————————————————————————— 2. source-check —————————————————————————————————
// Chaque sourceClueId pointe vers une INFO portée par un objet réel, atteignable
// avant le puzzle (Règle d'or n°1).

function lintSource(ctx: LintCtx): LintFinding[] {
  const { room, idx, run } = ctx;
  const findings: LintFinding[] = [];
  for (const p of room.puzzles) {
    const solvePass = run.passOfPuzzle.get(p.id);
    for (const clue of p.derivation.sourceClueIds) {
      const node = idx.nodesById.get(clue);
      if (!node) {
        findings.push(f('source-check', `Indice source « ${clue} » du puzzle ${p.id} n'existe pas dans le graphe.`, [p.id, clue]));
        continue;
      }
      if (node.type !== 'INFO') {
        findings.push(f('source-check', `Indice source « ${clue} » (${p.id}) n'est pas une INFO.`, [p.id, clue]));
        continue;
      }
      if (!node.carrier || !idx.objectsById.has(node.carrier)) {
        findings.push(f('source-check', `INFO « ${clue} » n'est portée par aucun objet placé (${p.id}).`, [p.id, clue]));
        continue;
      }
      const cluePass = run.passOfNode.get(clue);
      if (solvePass !== undefined && (cluePass === undefined || cluePass > solvePass)) {
        findings.push(f('source-check', `INFO « ${clue} » n'est pas atteignable avant le puzzle ${p.id}.`, [p.id, clue]));
      }
    }
  }
  return findings;
}

// ————————————————————————————————— 3. anchor-check —————————————————————————————————
// Tout puzzle à code a un anchorLabel présent dans le texte du verrou ET dans
// celui de l'indice source (Règle d'or n°3).

function lintAnchor(ctx: LintCtx): LintFinding[] {
  const { room, idx } = ctx;
  const findings: LintFinding[] = [];
  for (const p of room.puzzles) {
    if (!isCodePuzzle(p)) continue;
    const anchor = p.derivation.anchorLabel;
    if (!anchor) {
      findings.push(f('anchor-check', `Puzzle à code ${p.id} sans anchorLabel (Règle d'or n°3).`, [p.id]));
      continue;
    }
    const na = normalizeText(anchor);
    const mech = idx.objectsById.get(p.mechanismObjectId);
    const mechText = normalizeText(
      [mech?.name, mech?.description, mech?.controls?.kind === 'code' ? mech.controls.label : '']
        .filter(Boolean)
        .join(' '),
    );
    if (!mechText.includes(na)) {
      findings.push(f('anchor-check', `Ancre « ${anchor} » absente du verrou ${p.mechanismObjectId} (${p.id}).`, [p.id, p.mechanismObjectId]));
    }
    const clueText = normalizeText(
      p.derivation.sourceClueIds
        .map((c) => idx.nodesById.get(c)?.carrier)
        .filter((id): id is string => Boolean(id))
        .flatMap((id) => idx.objectsById.get(id)?.reveals.map((r) => r.text) ?? [])
        .join(' '),
    );
    if (!clueText.includes(na)) {
      findings.push(f('anchor-check', `Ancre « ${anchor} » absente des indices sources de ${p.id}.`, [p.id]));
    }
  }
  return findings;
}

// ————————————————————————————————— 4. ambiguity-check —————————————————————————————————
// Au moment où un puzzle à code devient résoluble, aucune AUTRE valeur du même
// type sémantique n'apparaît dans les textes atteignables (Règle d'or n°4).

function lintAmbiguity(ctx: LintCtx): LintFinding[] {
  const { room, idx, run } = ctx;
  const findings: LintFinding[] = [];

  // Valeurs légitimes des verrous à code ATTEIGNABLES, indexées par catégorie
  // (ancre+longueur pour les chiffres, ancre pour les lettres). Sert à distinguer
  // une vraie valeur parasite d'un simple homonyme d'une AUTRE catégorie ([W5]).
  const reachableCode = room.puzzles.filter(
    (p) => p.solution.kind === 'code' && run.passOfPuzzle.get(p.id) !== undefined,
  );
  const legitByCat = new Map<string, Set<string>>();
  const catsOfValue = new Map<string, Set<string>>();
  for (const q of reachableCode) {
    if (q.solution.kind !== 'code') continue;
    const cid = semanticCategory(idx, q).id;
    (legitByCat.get(cid) ?? legitByCat.set(cid, new Set()).get(cid)!).add(q.solution.value);
    (catsOfValue.get(q.solution.value) ?? catsOfValue.set(q.solution.value, new Set()).get(q.solution.value)!).add(cid);
  }

  for (const p of reachableCode) {
    if (p.solution.kind !== 'code') continue;
    const solutionValue = p.solution.value;
    const solvePass = run.passOfPuzzle.get(p.id)!;
    const cat = semanticCategory(idx, p);
    const alphabet = codeAlphabet(idx, p);

    if (alphabet === 'letters') {
      // [W4] Verrous à lettres : on compare les valeurs LITTÉRALES des autres
      // verrous de MÊME ancre effectivement visibles au moment du puzzle
      // (les regex de mots majuscules attraperaient sinon les ancres elles-mêmes).
      const joined = normalizeText(reachableTextsAt(ctx, solvePass).join(' '));
      const sameCat = [...(legitByCat.get(cat.id) ?? [])].filter((v) => v !== solutionValue);
      const others = sameCat.filter((v) => joined.includes(normalizeText(v)));
      if (others.length > 0) {
        findings.push(
          f(
            'ambiguity-check',
            `Verrou à lettres ${p.id} (${cat.id}) ambigu : valeur(s) parasite(s) de même ancre [${others.join(', ')}] visibles avec la solution ${solutionValue}.`,
            [p.id],
          ),
        );
      }
      continue;
    }

    // Chiffres / année : on scanne les textes atteignables ; une valeur ≠ solution
    // est parasite SAUF si elle n'est légitime que d'une AUTRE catégorie ([W5]).
    const texts = reachableTextsAt(ctx, solvePass);
    const values = distinctMatches(texts, cat.regex);
    const others = values.filter((v) => {
      if (v === solutionValue) return false;
      const cats = catsOfValue.get(v);
      if (cats && !cats.has(cat.id)) return false; // homonyme d'une autre catégorie ancre+longueur
      return true;
    });
    if (others.length > 0) {
      findings.push(
        f(
          'ambiguity-check',
          `Puzzle ${p.id} (${cat.id}) ambigu : valeur(s) parasite(s) [${others.join(', ')}] visibles en même temps que la solution ${solutionValue}.`,
          [p.id],
        ),
      );
    }
  }
  return findings;
}

// ————————————————————————————————— value-presence-check —————————————————————————————————
// [E1] La VALEUR-solution doit réellement apparaître dans une source atteignable
// (Règle d'or n°1). Sans ce lint, un puzzle code=1987 dont « 1987 » n'apparaît
// dans AUCUN texte passait les 9 lints (le solveur traite l'info en jeton abstrait).

/** Textes des reveals des objets porteurs des indices sources d'un puzzle. */
function sourceClueTexts(idx: RoomIndex, p: PuzzleInstance): string[] {
  const texts: string[] = [];
  for (const clueId of p.derivation.sourceClueIds) {
    const carrier = idx.nodesById.get(clueId)?.carrier;
    if (!carrier) continue;
    const obj = idx.objectsById.get(carrier);
    if (!obj) continue;
    for (const r of obj.reveals) texts.push(r.text);
  }
  return texts;
}

/** Étiquettes lisibles des étapes d'une séquence (options du mécanisme). */
function sequenceStepLabels(idx: RoomIndex, p: PuzzleInstance): string[] {
  if (p.solution.kind !== 'sequence') return [];
  const controls = idx.objectsById.get(p.mechanismObjectId)?.controls;
  const options = controls && controls.kind === 'sequence' ? controls.options : [];
  const labels: string[] = [];
  for (const stepId of p.solution.steps) {
    const label = options.find((o) => o.id === stepId)?.label;
    if (label !== undefined) labels.push(label);
  }
  return labels;
}

/**
 * Formes « vraie énigme » (medium/hard) : au lieu d'exiger la valeur en clair,
 * on REJOUE la dérivation depuis les textes sources (mêmes formats/parseurs
 * que le générateur — content/templates) et on exige qu'elle produise la
 * solution. Renvoie null si la forme n'est pas détectée (→ check littéral).
 */
function derivabilityFinding(p: PuzzleInstance, value: string, texts: string[]): LintFinding | null | 'literal' {
  if (p.template === 'cipher_substitution') {
    const derived = deriveCipher(texts);
    if (derived === null) return 'literal';
    return derived === value
      ? null
      : f(
          'value-presence-check',
          `Le déchiffrement des indices de ${p.id} produit « ${derived} », pas la solution « ${value} » (dérivabilité).`,
          [p.id],
        );
  }
  if (p.template === 'logic_deduction') {
    const derived = deriveLogic(texts);
    if (derived === null) return 'literal';
    return derived === value
      ? null
      : f(
          'value-presence-check',
          derived === ''
            ? `L'élimination logique de ${p.id} ne laisse pas un survivant unique (dérivabilité).`
            : `L'élimination logique de ${p.id} désigne « ${derived} », pas la solution « ${value} » (dérivabilité).`,
          [p.id],
        );
  }
  if (p.template === 'spatial_observation') {
    const letters = deriveAnagramLetters(texts);
    if (letters === null) return 'literal';
    const sortedRelevé = [...letters].sort().join('');
    const sortedValue = [...value].sort().join('');
    return sortedRelevé === sortedValue
      ? null
      : f(
          'value-presence-check',
          `Les lettres relevées de ${p.id} (${letters.join('')}) ne recomposent pas la solution « ${value} » (dérivabilité).`,
          [p.id],
        );
  }
  return 'literal';
}

function lintValuePresence(ctx: LintCtx): LintFinding[] {
  const { room, idx, run } = ctx;
  const findings: LintFinding[] = [];
  for (const p of room.puzzles) {
    if (run.passOfPuzzle.get(p.id) === undefined) continue; // puzzle inatteignable : hors périmètre

    if (p.solution.kind === 'code') {
      const value = p.solution.value;
      const texts = sourceClueTexts(idx, p);

      // Vraie énigme détectée → preuve de dérivabilité, pas de valeur en clair.
      const derivability = derivabilityFinding(p, value, texts);
      if (derivability !== 'literal') {
        if (derivability) findings.push(derivability);
        continue;
      }

      const cat = semanticCategory(idx, p);
      const matches = distinctMatches(texts, cat.regex);
      if (!matches.includes(value)) {
        findings.push(
          f(
            'value-presence-check',
            `Valeur-solution « ${value} » de ${p.id} (${cat.id}) absente des indices sources atteignables : rien à lire pour la déduire (Règle d'or n°1).`,
            [p.id],
          ),
        );
      }
    } else if (p.solution.kind === 'sequence') {
      // Chaque composant/étape de la séquence doit être lisible dans un indice.
      const joined = normalizeText(sourceClueTexts(idx, p).join(' '));
      for (const label of sequenceStepLabels(idx, p)) {
        if (!joined.includes(normalizeText(label))) {
          findings.push(
            f(
              'value-presence-check',
              `Étape « ${label} » de la séquence ${p.id} illisible dans les indices sources atteignables (Règle d'or n°1).`,
              [p.id],
            ),
          );
        }
      }
    }
  }
  return findings;
}

// ————————————————————————————————— 5. tool-order-check —————————————————————————————————
// Pour les puzzles à outil (tool_reveal, combine_items) : couche d'obtention de
// l'outil < couche du support (Règle d'or n°5).

function lintToolOrder(ctx: LintCtx): LintFinding[] {
  const { room, run } = ctx;
  const findings: LintFinding[] = [];
  for (const p of room.puzzles) {
    // [W6] Tout puzzle qui CONSOMME un outil (dont key_lock, dont la clé EST un
    // outil), et non plus les seuls tool_reveal/combine_items.
    const toolNodes = toolNodeIds(p);
    if (toolNodes.length === 0) continue;
    const solvePass = run.passOfPuzzle.get(p.id);
    if (solvePass === undefined) continue; // puzzle jamais résolu : hors périmètre
    for (const tn of toolNodes) {
      // [W6] On se fie à la reachability RÉELLE du solveur, pas aux couches
      // déclarées : l'outil doit être obtenu STRICTEMENT avant la résolution.
      const toolPass = run.passOfNode.get(tn);
      if (toolPass === undefined || toolPass >= solvePass) {
        findings.push(
          f(
            'tool-order-check',
            `Outil « ${tn} » (obtenu passe ${toolPass ?? '∞'}) n'est pas acquis strictement avant la résolution de ${p.id} (passe ${solvePass}) — Règle d'or n°5.`,
            [p.id, tn],
          ),
        );
      }
    }
  }
  return findings;
}

function toolNodeIds(p: PuzzleInstance): string[] {
  if (p.solution.kind === 'use_on') return [p.solution.toolNodeId];
  if (p.solution.kind === 'combine') return p.solution.itemNodeIds;
  if (p.solution.kind === 'key') return [p.solution.itemNodeId];
  return [];
}

// ————————————————————————————————— unreachable-mechanism-check —————————————————————————————————
// [E3, ceinture+bretelles] Tout mécanisme ATTEIGNABLE dont le puzzle ne devient
// JAMAIS applicable (absent de la trace du solveur) = verrou mort / clé enfermée.

function lintUnreachableMechanism(ctx: LintCtx): LintFinding[] {
  const { room, idx, run } = ctx;
  const findings: LintFinding[] = [];
  for (const p of room.puzzles) {
    if (run.passOfPuzzle.has(p.id)) continue; // résolu par le joueur parfait → OK
    if (isObjectReachable(idx, run.finalState, p.mechanismObjectId)) {
      findings.push(
        f(
          'unreachable-mechanism-check',
          `Mécanisme « ${p.mechanismObjectId} » de ${p.id} est atteignable mais le puzzle n'est jamais applicable (verrou mort / source enfermée).`,
          [p.id, p.mechanismObjectId],
        ),
      );
    }
  }
  return findings;
}

// ————————————————————————————————— 6. progress-check —————————————————————————————————
// Chaque puzzle atteignable a ≥ 1 output consommé en aval (input d'un autre
// puzzle) ou = GOAL (Règle d'or n°6 : jamais de récompense cosmétique).

function lintProgress(ctx: LintCtx): LintFinding[] {
  const { room, run } = ctx;
  const consumed = new Set<string>([room.graph.goalId]);
  for (const p of room.puzzles) for (const input of p.inputs) consumed.add(input);
  const findings: LintFinding[] = [];
  for (const p of room.puzzles) {
    if (!run.passOfPuzzle.has(p.id)) continue; // hors chemin atteignable
    if (!p.outputs.some((o) => consumed.has(o))) {
      findings.push(f('progress-check', `Puzzle ${p.id} ne débloque rien de consommé en aval (progression cosmétique).`, [p.id]));
    }
  }
  return findings;
}

// ————————————————————————————————— 7. no-loss-check —————————————————————————————————
// Convention : un combine_items consomme ses composants. Aucun composant ainsi
// consommé ne doit être requis par un autre puzzle en aval (Règle d'or n°7).

function lintNoLoss(ctx: LintCtx): LintFinding[] {
  const { room } = ctx;
  const findings: LintFinding[] = [];
  for (const p of room.puzzles) {
    if (p.solution.kind !== 'combine') continue;
    const consumedItems = new Set(p.solution.itemNodeIds);
    for (const other of room.puzzles) {
      if (other.id === p.id) continue;
      for (const input of other.inputs) {
        if (consumedItems.has(input)) {
          findings.push(
            f(
              'no-loss-check',
              `Objet critique « ${input} » consommé par le combine ${p.id} mais requis aussi par ${other.id}.`,
              [p.id, other.id, input],
            ),
          );
        }
      }
    }
  }
  return findings;
}

// ————————————————————————————————— 8. decoy-check —————————————————————————————————
// Un leurre (objet décor porteur de texte) ne doit produire aucune valeur
// candidate pour un verrou à code actif (Règle d'or n°8).

function lintDecoy(ctx: LintCtx): LintFinding[] {
  const { room, idx } = ctx;
  const findings: LintFinding[] = [];
  const codePuzzles = room.puzzles.filter((p) => p.solution.kind === 'code');
  for (const obj of room.objects) {
    if (obj.family !== 'decor') continue;
    const decoyText = [obj.description, obj.name, ...obj.reveals.map((r) => r.text)].join(' ');
    for (const p of codePuzzles) {
      if (p.solution.kind !== 'code') continue;
      const solutionValue = p.solution.value;
      const cat = semanticCategory(idx, p);
      const vals = distinctMatches([decoyText], cat.regex).filter((v) => v !== solutionValue);
      if (vals.length > 0) {
        findings.push(
          f(
            'decoy-check',
            `Le décor « ${obj.id} » expose une valeur candidate [${vals.join(', ')}] pour le verrou ${p.id} (${cat.id}).`,
            [obj.id, p.id],
          ),
        );
      }
    }
  }
  return findings;
}

// ————————————————————————————————— 9. dead-object-check —————————————————————————————————
// Tout objet non-décor participe au graphe (carrier, mécanisme, ou reveal
// producteur). Sinon → à reclasser décor.

function lintDeadObject(ctx: LintCtx): LintFinding[] {
  const { room, idx } = ctx;
  const carriers = new Set<string>();
  for (const n of room.graph.nodes) if (n.carrier) carriers.add(n.carrier);
  const mechanisms = new Set(room.puzzles.map((p) => p.mechanismObjectId));
  const findings: LintFinding[] = [];
  for (const obj of room.objects) {
    if (obj.family === 'decor') continue;
    const isCarrier = carriers.has(obj.id);
    const isMechanism = mechanisms.has(obj.id);
    const produces = obj.reveals.some(
      (r) => r.nodeIds.length > 0 || (r.objectIds?.length ?? 0) > 0,
    );
    if (!isCarrier && !isMechanism && !produces) {
      findings.push(
        f('dead-object-check', `Objet « ${obj.id} » (famille ${obj.family}) n'apparaît pas dans le graphe : reclasser en décor ou rejeter.`, [obj.id]),
      );
    }
  }
  return findings;
}

// ————————————————————————————————— Agrégation —————————————————————————————————

function f(lint: LintFinding['lint'], message: string, subjectIds: string[]): LintFinding {
  return { lint, level: 'error', message, subjectIds };
}

export function lintRoom(room: RoomSpec): LintReport {
  const ctx: LintCtx = { room, idx: buildIndex(room), run: runSolver(room) };
  const findings: LintFinding[] = [
    ...lintDag(ctx),
    ...lintSource(ctx),
    ...lintAnchor(ctx),
    ...lintAmbiguity(ctx),
    ...lintValuePresence(ctx),
    ...lintToolOrder(ctx),
    ...lintUnreachableMechanism(ctx),
    ...lintProgress(ctx),
    ...lintNoLoss(ctx),
    ...lintDecoy(ctx),
    ...lintDeadObject(ctx),
  ];
  return { pass: findings.every((x) => x.level !== 'error'), findings };
}
