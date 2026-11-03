// ============================================================================
// THEME PACK — BUNKER (poste de commandement K-Ouest). Vocabulaire digit-free :
// les valeurs des verrous sont injectées par les gadgets, jamais par le thème.
// ============================================================================

import type { ThemePack } from './types';

export const BUNKER: ThemePack = {
  id: 'bunker',
  displayName: 'Bunker K-Ouest',
  narrative: {
    titles: [
      'Silence sous la dalle',
      'Le poste K-Ouest ne répond plus',
      'Consigne de verrouillage',
      'Dernière relève',
    ],
    backstories: [
      "L'exercice a tourné court ; la garnison est remontée en surface sans lever les consignes.",
      "Le poste a été muré de l'intérieur ; les procédures, elles, tournent encore.",
      "Le dernier opérateur a coupé la radio, verrouillé les sas, et n'a laissé que ses routines.",
    ],
    objectives: [
      'Réactivez les systèmes du poste et déverrouillez le sas de surface.',
      'Percez les consignes de verrouillage et rejoignez la surface.',
      'Suivez les procédures de l’opérateur disparu jusqu’à la sortie.',
    ],
    epilogues: [
      'Le sas de surface tourne sur ses gonds : l’air froid du dehors tombe dans l’escalier.',
      'Les voyants passent au vert ; la dalle coulisse et découvre le ciel.',
      'Le dernier verrou claque. Au-dessus, la nuit — et plus aucun mur.',
    ],
    motifs: [
      'exercice interrompu',
      'consigne de silence radio',
      'relève jamais venue',
      'rationnement strict',
      'procédure de double clé',
    ],
  },
  zoneNames: [
    'Sas d’entrée',
    'Salle des opérations',
    'Dortoir de la garnison',
    'Salle des machines',
    'Réserve profonde',
  ],
  // ≥ 16 entrées : une salle hard (4 zones × 4 POI) se sert SANS remise.
  poiNames: [
    'Pupitre de garde',
    'Rack de transmissions',
    'Armoire d’intendance',
    'Couchettes superposées',
    'Groupe électrogène',
    'Panneau de ventilation',
    'Casiers de la garnison',
    'Table des cartes',
    'Poste radio',
    'Râtelier vide',
    'Infirmerie de campagne',
    'Sas de décontamination',
    'Alcôve du planton',
    'Atelier de maintenance',
    'Cuve à eau',
    'Galerie technique',
  ],
  anchors: {
    year: ['ANNÉE DE CONSTRUCTION', 'ANNÉE DE L’EXERCICE', 'ANNÉE DE FERMETURE'],
    digits: ['NUMÉRO DE SECTEUR', 'CODE D’ALERTE', 'NUMÉRO DE CASIER', 'RÉFÉRENCE DE DOTATION'],
    // >= 5 ancres distinctes (unicité [W4]) ; AUCUNE ne contient un mot de `words`.
    letters: [
      'NOM DE L’OPÉRATION',
      'INDICATIF RADIO',
      'MOT D’ORDRE',
      'NOM DU COMMANDANT',
      'DÉSIGNATION DU POSTE',
      'NOM DE LA RELÈVE',
    ],
  },
  vocab: {
    codeLock: [
      { name: 'Armoire forte', desc: 'Une armoire blindée à clavier mécanique.' },
      { name: 'Caisson de dotation', desc: 'Un caisson scellé par une serrure à combinaison.' },
      { name: 'Casier de l’armurier', desc: 'Un casier renforcé, clavier sous volet d’acier.' },
      { name: 'Coffre de transmissions', desc: 'Un coffre d’acier à combinaison, riveté au mur.' },
    ],
    dialPanel: [
      { name: 'Compteur de consigne', desc: 'Un compteur à molettes fixé au pupitre.' },
      { name: 'Horloge de quart', desc: 'Une horloge de service réglable à la couronne.' },
      { name: 'Manomètre de ventilation', desc: 'Un manomètre à molette de tarage.' },
    ],
    door: [
      { name: 'Sas blindé', desc: 'Une porte étanche à volant et serrure de sûreté.' },
      { name: 'Porte coupe-feu', desc: 'Une porte d’acier gris à serrure mécanique.' },
      { name: 'Grille de la réserve', desc: 'Une grille d’acier fermée d’un gros cadenas.' },
    ],
    keyItem: [
      { name: 'Clé de consigne', desc: 'Une clé d’acier frappée d’un poinçon militaire.' },
      { name: 'Clé de l’opérateur', desc: 'Une clé plate reliée à une chaînette de service.' },
      { name: 'Clé du groupe', desc: 'Une clé carrée pour armoire électrique.' },
    ],
    document: [
      { name: 'Cahier de quart', desc: 'Un cahier réglementaire aux pages tamponnées.' },
      { name: 'Ordre de mission', desc: 'Un feuillet dactylographié, plié en quatre.' },
      { name: 'Affiche de consignes', desc: 'Une affiche placardée près du sas.' },
      { name: 'Carnet de l’opérateur', desc: 'Un carnet écorné, rempli d’une écriture serrée.' },
      { name: 'Bordereau d’intendance', desc: 'Un bordereau à souches, à moitié rempli.' },
      { name: 'Registre des rondes', desc: 'Un registre ligné aux heures cochées.' },
      { name: 'Feuillet quadrillé', desc: 'Un feuillet quadrillé glissé sous plastique.' },
      { name: 'Note de l’intendant', desc: 'Une note sèche, écrite au crayon gras.' },
      { name: 'Tableau des relèves', desc: 'Un tableau d’affectation à croix et initiales.' },
    ],
    tool: [
      { name: 'Lampe de dotation', desc: 'Une lampe coudée à filtre singulier.' },
      { name: 'Lunette de visée', desc: 'Une lunette démontée de son rail, au traitement étrange.' },
    ],
    support: [
      { name: 'Carte plastifiée', desc: 'Une carte murale au vernis mat, presque vierge.' },
      { name: 'Cloison peinte', desc: 'Un pan de cloison repeint à la hâte.' },
    ],
    leverPanel: [
      { name: 'Tableau de disjoncteurs', desc: 'Une rangée de disjoncteurs à bascule.' },
      { name: 'Rampe de vannes', desc: 'Des vannes de circuit alignées sous un manomètre.' },
    ],
    symbolPanel: [
      { name: 'Console de transmissions', desc: 'Une console dont les touches portent des insignes.' },
      { name: 'Sélecteur de fréquences', desc: 'Un sélecteur rotatif à positions marquées.' },
    ],
    component: [
      { name: 'Manivelle démontée', desc: 'Une manivelle sans son axe.' },
      { name: 'Axe de volant', desc: 'Un axe usiné, soigneusement graissé.' },
      { name: 'Fusible de rechange', desc: 'Un gros fusible en céramique.' },
    ],
    workbench: [
      { name: 'Établi de maintenance', desc: 'Un établi d’atelier à étau et tiroirs plats.' },
    ],
    letterLock: [
      { name: 'Serrure à mot d’ordre', desc: 'Une serrure à barillets alphabétiques.' },
      { name: 'Terminal d’authentification', desc: 'Un terminal réclamant un mot en toutes lettres.' },
      { name: 'Verrou de consigne', desc: 'Un verrou à bagues de lettres frappées.' },
      { name: 'Clavier du central', desc: 'Un clavier mural qui n’accepte que des lettres.' },
    ],
    decor: [
      { name: 'Masque à gaz pendu', desc: 'Un masque à gaz au caoutchouc craquelé.' },
      { name: 'Bidon de réserve', desc: 'Un bidon cabossé, vide depuis longtemps.' },
      { name: 'Affiche de propagande', desc: 'Une affiche délavée aux slogans fatigués.' },
      { name: 'Couverture pliée', desc: 'Une couverture de laine au carré parfait.' },
      { name: 'Casque bosselé', desc: 'Un casque d’acier posé sur une patère.' },
      { name: 'Caisse de rations', desc: 'Une caisse de bois aux poignées de corde.' },
    ],
  },
  compatibility: {
    key_lock: true,
    code_from_document: true,
    labeled_dial_code: true,
    tool_reveal: true,
    combine_items: true,
    mechanism_sequence: true,
    mapping_sequence: true,
    logic_deduction: true,
    cipher_substitution: true,
    spatial_observation: true,
  },
  colors: ['ROUGE', 'OLIVE', 'GRIS', 'NOIR', 'AMBRE'],
  symbols: ['ÉTOILE', 'ÉCLAIR', 'AIGLE', 'FLÈCHE', 'BOUCLIER'],
  // Mots-lettres >= 7 lettres, jamais contenus dans une ancre (anti-fuite).
  // ≥ 8 mots : logic_deduction (hard) consomme 1 valeur + 2 leurres.
  words: [
    'PERISCOPE',
    'BLINDAGE',
    'MUNITIONS',
    'SENTINELLE',
    'ANTENNE',
    'GENERATEUR',
    'CASEMATE',
    'BARBELES',
  ],
  // Périphrases d'anagramme (sans chiffre, sans mot de `words`).
  wordHints: {
    PERISCOPE: 'l’œil qui regarde par-dessus le sol',
    BLINDAGE: 'l’acier qui arrête les éclats',
    MUNITIONS: 'ce que réclament les armes',
    SENTINELLE: 'celle qui veille quand tout dort',
    ANTENNE: 'la tige qui capte les ondes',
    GENERATEUR: 'la machine qui fabrique le courant',
    CASEMATE: 'l’abri de béton des tireurs',
    BARBELES: 'le fil qui griffe autour du camp',
  },
};
