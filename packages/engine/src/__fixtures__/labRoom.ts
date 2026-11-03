// ============================================================================
// FIXTURE DE TEST — salle minimale MAIS conforme à types.ts (écrite à la main).
// 2 zones, 3 puzzles : code_from_document (casier) → key_lock (porte) →
// labeled_dial_code (panneau de sortie). Doit passer validateRoom :
// solvable + 0 lint 'error'. Sert de socle aux fixtures cassées des tests.
//
// NB : l'exemple docs/examples/salle-labo-7C42.json est ANTÉRIEUR aux types
// finaux (il utilise `state`, `{access:…}`, `itemId`…) — il n'est PAS conforme
// et ne sert que d'intuition. Cette fixture-ci, elle, respecte le contrat.
// ============================================================================

import type { RoomSpec } from '../types';

/** Construit une copie fraîche de la salle « MACHINES » (évite les mutations partagées). */
export function makeLabRoom(): RoomSpec {
  return {
    version: 1,
    seed: 'FIX-MACHINES',
    config: { difficulty: 'easy', theme: 'laboratoire' },
    theme: 'laboratoire',
    narrative: {
      title: 'Salle des machines',
      // Interne — jamais servi au client. Contient volontairement les valeurs
      // solutions pour prouver la rédaction (le test anti-fuite le vérifie).
      backstory:
        "Le confinement de 1987 n'a jamais ete leve ; l'employe 418 a fui en laissant sa cle.",
      playerObjective: 'Trouvez comment quitter le laboratoire Helios, et sortez.',
      epilogue: 'Le sas de secours cede. Vous êtes dehors — enfin.',
    },

    zones: [
      {
        id: 'z1',
        name: "Bureau d'accueil",
        layer: 0,
        pois: [
          { id: 'poi.comptoir', name: "Comptoir d'accueil" },
          { id: 'poi.casiers', name: 'Casiers du personnel' },
          { id: 'poi.porte', name: 'Porte des machines' },
        ],
      },
      {
        id: 'z2',
        name: 'Salle des machines',
        layer: 1,
        gate: 'p_key',
        pois: [
          { id: 'poi.paillasse', name: 'Paillasse' },
          { id: 'poi.sas', name: 'Sas de secours' },
        ],
      },
    ],

    objects: [
      {
        id: 'obj.comptoir',
        name: "Comptoir d'accueil",
        description: 'Un comptoir poussiereux ; quelque chose a glisse derriere.',
        family: 'info_carrier',
        location: { zoneId: 'z1', poiId: 'poi.comptoir' },
        initialState: 'visible',
        affordances: ['inspect'],
        reveals: [
          {
            on: 'inspect',
            nodeIds: [],
            objectIds: ['obj.badge'],
            text: 'En passant la main derriere le comptoir, vous delogez un badge tombe la.',
          },
        ],
        requires: [],
        narrativeFragment: "Le personnel est parti vite, en oubliant l'essentiel.",
      },
      {
        id: 'obj.memo',
        name: 'Note de service',
        description: 'Une note de service jaunie, punaisee pres du comptoir.',
        family: 'info_carrier',
        location: { zoneId: 'z1', poiId: 'poi.comptoir' },
        initialState: 'visible',
        affordances: ['read'],
        reveals: [
          {
            on: 'read',
            nodeIds: ['info.memo'],
            text: "Rappel : le code du casier de chaque agent est son numero d'employe. — La direction",
          },
        ],
        requires: [],
        narrativeFragment: 'La direction se mefiait des codes faibles.',
      },
      {
        id: 'obj.badge',
        name: 'Badge du personnel',
        description: 'Un badge au fermoir casse.',
        family: 'info_carrier',
        location: { zoneId: 'z1', poiId: 'poi.comptoir' },
        initialState: 'hidden',
        affordances: ['read'],
        reveals: [
          {
            on: 'read',
            nodeIds: ['info.badge'],
            text: "HELIOS LABS — employe n 418.",
          },
        ],
        requires: [],
        narrativeFragment: "418 : un matricule que son porteur aurait du changer.",
      },
      {
        id: 'obj.casier',
        name: 'Casier n 3',
        description:
          "Un casier ferme par un cadenas a 3 chiffres. Une etiquette rappelle : code = numero d'employe.",
        family: 'mechanism',
        location: { zoneId: 'z1', poiId: 'poi.casiers' },
        initialState: 'locked',
        affordances: ['inspect', 'enter_code'],
        controls: { kind: 'code', length: 3, label: "NUMERO D'EMPLOYE", alphabet: 'digits' },
        reveals: [
          {
            on: 'enter_code',
            nodeIds: [],
            objectIds: ['obj.cle'],
            text: 'Le cadenas cede ; a l’interieur, une cle etiquetee « MACHINES ».',
          },
        ],
        requires: [],
      },
      {
        id: 'obj.cle',
        name: 'Cle « MACHINES »',
        description: 'Une cle plate dont l’etiquette porte la mention MACHINES.',
        family: 'instrument',
        location: { zoneId: 'z1', poiId: 'poi.casiers' },
        initialState: 'hidden',
        affordances: ['take', 'use_on'],
        reveals: [
          {
            on: 'take',
            nodeIds: [],
            text: 'Vous empochez la cle « MACHINES ».',
          },
        ],
        requires: [],
      },
      {
        id: 'obj.porte',
        name: 'Porte « MACHINES »',
        description: 'Une porte a serrure mecanique ; la plaque indique MACHINES.',
        family: 'mechanism',
        location: { zoneId: 'z1', poiId: 'poi.porte' },
        initialState: 'locked',
        affordances: ['inspect', 'use_on'],
        controls: { kind: 'keyhole', label: 'MACHINES' },
        reveals: [
          {
            on: 'use_on',
            nodeIds: [],
            text: 'La serrure « MACHINES » tourne ; la salle des machines s’ouvre.',
          },
        ],
        requires: [],
      },
      {
        id: 'obj.rapport',
        name: "Rapport d'incident",
        description: 'Une planchette a pince abandonnee sur la paillasse.',
        family: 'info_carrier',
        location: { zoneId: 'z2', poiId: 'poi.paillasse' },
        initialState: 'visible',
        affordances: ['read'],
        reveals: [
          {
            on: 'read',
            nodeIds: ['info.annee'],
            text: "Rapport : l'incident majeur date de 1987. Le panneau de secours utilise cette ANNEE.",
          },
        ],
        requires: [],
        narrativeFragment: 'Le jour ou tout a bascule.',
      },
      {
        id: 'obj.panneau',
        name: 'Panneau de sortie de secours',
        description: 'Un panneau a molettes (4 chiffres) ; plaque gravee « ANNEE ».',
        family: 'mechanism',
        location: { zoneId: 'z2', poiId: 'poi.sas' },
        initialState: 'locked',
        affordances: ['inspect', 'enter_code'],
        controls: { kind: 'code', length: 4, label: 'ANNEE', alphabet: 'digits' },
        reveals: [
          {
            on: 'enter_code',
            nodeIds: [],
            text: 'Le panneau deverrouille le sas de secours. La sortie est ouverte.',
          },
        ],
        requires: [],
      },
      {
        id: 'obj.plante',
        name: 'Plante verte dessechee',
        description: 'Un ficus mort depuis des annees.',
        family: 'decor',
        location: { zoneId: 'z1', poiId: 'poi.comptoir' },
        initialState: 'visible',
        affordances: ['inspect'],
        reveals: [],
        requires: [],
      },
      {
        id: 'obj.combinaison',
        name: 'Combinaison hazmat',
        description: 'Une combinaison integrale pendue a son crochet.',
        family: 'decor',
        location: { zoneId: 'z2', poiId: 'poi.paillasse' },
        initialState: 'visible',
        affordances: ['inspect'],
        reveals: [],
        requires: [],
        narrativeFragment: 'Son proprietaire n’est jamais venu la chercher.',
      },
    ],

    puzzles: [
      {
        id: 'p_code',
        template: 'code_from_document',
        mechanismObjectId: 'obj.casier',
        inputs: ['info.memo', 'info.badge'],
        outputs: ['item.cle'],
        solution: { kind: 'code', value: '418' },
        derivation: {
          sourceClueIds: ['info.memo', 'info.badge'],
          rule: "code casier = numero d'employe (memo) ; le badge donne 418",
          anchorLabel: "numero d'employe",
          inferenceSteps: 2,
        },
        hints: [
          "Quelqu'un a l'accueil ne suivait pas les consignes de securite.",
          'Le comptoir et le tableau de notes meritent un second regard.',
          "Le memo dit que le code du casier est le numero d'employe : ou le lire ?",
          'Le badge derriere le comptoir : employe n 418. Le code est 418.',
        ],
      },
      {
        id: 'p_key',
        template: 'key_lock',
        mechanismObjectId: 'obj.porte',
        inputs: ['item.cle'],
        outputs: ['access.z2'],
        solution: { kind: 'key', itemNodeId: 'item.cle' },
        derivation: {
          sourceClueIds: [],
          rule: 'la cle etiquetee MACHINES ouvre la porte etiquetee MACHINES',
          anchorLabel: 'MACHINES',
          inferenceSteps: 1,
        },
        hints: [
          'Une porte de l’accueil attend une cle.',
          'L’etiquette de la cle du casier vous dit ou l’utiliser.',
          'MACHINES comme… la plaque d’une des portes.',
          'La cle « MACHINES » ouvre la porte de la salle des machines.',
        ],
      },
      {
        id: 'p_dial',
        template: 'labeled_dial_code',
        mechanismObjectId: 'obj.panneau',
        inputs: ['access.z2', 'info.annee'],
        outputs: ['goal.sortie'],
        solution: { kind: 'code', value: '1987' },
        derivation: {
          sourceClueIds: ['info.annee'],
          rule: 'cadran etiquete ANNEE ; le rapport date l’incident de 1987',
          anchorLabel: 'ANNEE',
          inferenceSteps: 1,
        },
        hints: [
          'Le panneau de secours n’attend pas n’importe quel nombre : lisez sa plaque.',
          'Un document de la salle des machines mentionne une date precise.',
          'Le rapport parle d’une ANNEE d’incident.',
          'Le rapport date l’incident de 1987. Le code est 1987.',
        ],
      },
    ],

    graph: {
      goalId: 'goal.sortie',
      nodes: [
        { id: 'info.memo', type: 'INFO', layer: 0, carrier: 'obj.memo', label: 'Code casier = numero d’employe' },
        { id: 'info.badge', type: 'INFO', layer: 0, carrier: 'obj.badge', label: 'Employe n 418' },
        { id: 'item.cle', type: 'ITEM', layer: 0, producedBy: 'p_code', carrier: 'obj.cle', label: 'Cle MACHINES' },
        { id: 'access.z2', type: 'ACCESS', layer: 1, producedBy: 'p_key', label: 'Salle des machines accessible' },
        { id: 'info.annee', type: 'INFO', layer: 1, carrier: 'obj.rapport', label: 'Incident de 1987' },
        { id: 'goal.sortie', type: 'GOAL', layer: 2, producedBy: 'p_dial', label: 'Sas de secours ouvert' },
      ],
      edges: [
        { from: 'info.memo', to: 'p_code' },
        { from: 'info.badge', to: 'p_code' },
        { from: 'item.cle', to: 'p_key' },
        { from: 'access.z2', to: 'p_dial' },
        { from: 'info.annee', to: 'p_dial' },
      ],
    },

    metrics: {
      criticalPathDepth: 3,
      parallelBranches: 1,
      multiZoneJoinPuzzles: 0,
      maxInferenceSteps: 2,
      zoneCount: 2,
      estimatedMinutes: 24,
      decoyCount: 0,
    },
  };
}
