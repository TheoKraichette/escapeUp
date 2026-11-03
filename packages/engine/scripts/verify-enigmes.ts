// Vérification adversariale des « vraies énigmes » — indépendante des lints.
//
//   npx tsx packages/engine/scripts/verify-enigmes.ts [nbSeedsParDiff]
//
// Sur N seeds × 3 difficultés :
//  1. medium/hard : les 3 templates à lettres utilisent la FORME RÉELLE
//     (aucun fallback doux silencieux) ; easy : jamais de forme réelle.
//  2. La dérivation (deriveCipher/deriveLogic/deriveAnagramLetters) reproduit
//     exactement solution.value depuis les textes sources.
//  3. FUITE : aucune valeur de verrou à lettres n'apparaît dans un nom ou une
//     description d'objet (visibles côté client dès l'affichage).
//  4. Statique : wordHints complets, sans mots de `words` ; aucun mot de
//     `words` dans les ancres/vocab/POI/zones de son thème.

import { generateRoom } from '../src/generate/index';
import {
  deriveAnagramLetters,
  deriveCipher,
  deriveLogic,
} from '../src/content/templates/index';
import { THEMES } from '../src/content/themes/index';
import type { Difficulty, RoomSpec } from '../src/types';

const N = Number(process.argv[2] ?? 300);
const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

// ————————————————— 4. vérifications statiques des theme packs —————————————————

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

for (const theme of Object.values(THEMES)) {
  const vocabTexts: string[] = [
    ...theme.zoneNames,
    ...theme.poiNames,
    ...theme.anchors.year,
    ...theme.anchors.digits,
    ...theme.anchors.letters,
    ...Object.values(theme.vocab).flatMap((list) => list.flatMap((nd) => [nd.name, nd.desc])),
  ].map(norm);

  for (const word of theme.words) {
    const w = norm(word);
    const hint = theme.wordHints[word];
    if (!hint) fail(`[${theme.id}] wordHints manquant pour ${word}`);
    else {
      for (const other of theme.words) {
        if (norm(hint).includes(norm(other)))
          fail(`[${theme.id}] la périphrase de ${word} contient le mot ${other}`);
      }
      if (/\d/.test(hint)) fail(`[${theme.id}] la périphrase de ${word} contient un chiffre`);
    }
    const leak = vocabTexts.find((t) => t.includes(w));
    if (leak) fail(`[${theme.id}] le mot ${word} fuit dans un texte du thème : « ${leak} »`);
  }
}

// ————————————————— 1-3. balayage de salles générées —————————————————

function sourceTexts(room: RoomSpec, clueIds: string[]): string[] {
  const texts: string[] = [];
  for (const cid of clueIds) {
    const carrier = room.graph.nodes.find((n) => n.id === cid)?.carrier;
    const obj = room.objects.find((o) => o.id === carrier);
    if (obj) for (const r of obj.reveals) texts.push(r.text);
  }
  return texts;
}

const stats = { realCipher: 0, realLogic: 0, realAnagram: 0, soft: 0, letters: 0 };

for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
  for (let i = 0; i < N; i++) {
    const seed = `verify-${diff}-${i}`;
    const room = generateRoom(seed, { difficulty: diff });

    for (const p of room.puzzles) {
      if (p.solution.kind !== 'code') continue;
      const mech = room.objects.find((o) => o.id === p.mechanismObjectId);
      const isLetters = mech?.controls?.kind === 'code' && mech.controls.alphabet === 'letters';
      if (!isLetters) continue;
      stats.letters++;
      const value = p.solution.value;
      const texts = sourceTexts(room, p.derivation.sourceClueIds);

      // Forme détectée + dérivation exacte.
      let real = false;
      if (p.template === 'cipher_substitution') {
        const d = deriveCipher(texts);
        if (d !== null) {
          real = true;
          stats.realCipher++;
          if (d !== value) fail(`${seed}/${p.id} cipher dérive « ${d} » ≠ « ${value} »`);
        }
      } else if (p.template === 'logic_deduction') {
        const d = deriveLogic(texts);
        if (d !== null) {
          real = true;
          stats.realLogic++;
          if (d !== value) fail(`${seed}/${p.id} logic dérive « ${d} » ≠ « ${value} »`);
        }
      } else if (p.template === 'spatial_observation') {
        const letters = deriveAnagramLetters(texts);
        if (letters !== null) {
          real = true;
          stats.realAnagram++;
          if ([...letters].sort().join('') !== [...value].sort().join(''))
            fail(`${seed}/${p.id} anagramme ${letters.join('')} ≠ lettres de ${value}`);
        }
      }
      if (!real) stats.soft++;

      // Dosage par difficulté.
      if (diff === 'easy' && real) fail(`${seed}/${p.id} : forme RÉELLE en easy (${p.template})`);
      if (diff !== 'easy' && !real)
        fail(`${seed}/${p.id} : fallback DOUX en ${diff} (${p.template})`);

      // Fuite : la valeur dans un nom/desc d'objet (affichés dès le départ).
      for (const o of room.objects) {
        if (norm(o.name).includes(norm(value)) || norm(o.description).includes(norm(value))) {
          fail(`${seed}/${p.id} : la valeur ${value} fuit dans l'objet « ${o.name} »`);
        }
      }
    }
  }
}

console.log(
  `Analysé : ${N}×3 salles — verrous lettres: ${stats.letters} ` +
    `(cipher réels: ${stats.realCipher}, logic réels: ${stats.realLogic}, ` +
    `anagrammes: ${stats.realAnagram}, formes douces: ${stats.soft})`,
);
if (problems.length === 0) {
  console.log('=== VERIFY: ALL GREEN ===');
} else {
  console.log(`=== VERIFY: ${problems.length} PROBLÈME(S) ===`);
  for (const p of problems.slice(0, 30)) console.log(' - ' + p);
  process.exit(1);
}
