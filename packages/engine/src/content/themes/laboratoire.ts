// ============================================================================
// THEME PACK — LABORATOIRE (Helios Labs). Vocabulaire digit-free : les valeurs
// numériques des verrous sont injectées par les gadgets, jamais par le thème.
// ============================================================================

import type { ThemePack } from './types';

export const LABORATOIRE: ThemePack = {
  id: 'laboratoire',
  displayName: 'Laboratoire Helios',
  narrative: {
    titles: [
      'Le confinement Helios',
      'Protocole de quarantaine',
      'Salle blanche abandonnée',
      'L’incident du secteur Helios',
    ],
    backstories: [
      "Le confinement n'a jamais été levé ; le dernier technicien a fui en laissant tout derrière lui.",
      "Une fuite a vidé le laboratoire en une nuit ; les protocoles d'urgence n'ont servi à personne.",
      "L'équipe de recherche a disparu après l'incident ; ne restent que ses traces méthodiques.",
    ],
    objectives: [
      'Trouvez comment quitter le laboratoire Helios, et sortez.',
      'Rétablissez les systèmes et forcez le sas de sécurité.',
      'Percez le protocole de confinement et évadez-vous.',
    ],
    epilogues: [
      'Le sas de secours cède. Vous êtes dehors — enfin.',
      'Les portes blindées coulissent ; l’air libre, pour la première fois.',
      'Le dernier verrou lâche. Le laboratoire vous relâche.',
    ],
    motifs: [
      'employé négligent',
      'protocole d’urgence',
      'incident daté',
      'chaîne de sécurité',
      'quarantaine hâtive',
    ],
  },
  zoneNames: [
    'Bureau d’accueil',
    'Salle des machines',
    'Laboratoire humide',
    'Salle de contrôle',
    'Sas de décontamination',
  ],
  // ≥ 16 entrées : une salle hard (4 zones × 4 POI) se sert SANS remise.
  poiNames: [
    'Comptoir d’accueil',
    'Casiers du personnel',
    'Paillasse principale',
    'Armoire réfrigérée',
    'Tableau électrique',
    'Poste de contrôle',
    'Étagère à réactifs',
    'Sas de secours',
    'Bureau du chef d’équipe',
    'Chariot d’instruments',
    'Hotte aspirante',
    'Vestiaire du personnel',
    'Local technique',
    'Baie de serveurs',
    'Douche de sécurité',
    'Réserve de consommables',
  ],
  anchors: {
    year: ['ANNÉE DE L’INCIDENT', 'ANNÉE DE MISE EN SERVICE', 'ANNÉE DU CONFINEMENT'],
    digits: ['NUMÉRO D’EMPLOYÉ', 'NUMÉRO DE SÉRIE', 'CODE DE PAILLASSE', 'RÉFÉRENCE ÉCHANTILLON'],
    // >= 5 ancres distinctes : une salle « hard » peut aligner jusqu'à 5 verrous
    // à lettres co-atteignables ; l'unicité d'ancre ([W4]) exige un pool suffisant.
    // AUCUNE ancre ne doit CONTENIR un mot de `words` (sinon l'ancre, exposée au
    // client, ferait « fuiter » la valeur d'un verrou — cf. antileak.audit).
    letters: [
      'NOM DE CODE',
      'MOT DE PASSE',
      'IDENTIFIANT PROJET',
      'NOM DE DOSSIER',
      'INTITULÉ DE SÉRIE',
      'NOM DE PROCÉDURE',
    ],
  },
  vocab: {
    codeLock: [
      { name: 'Casier du personnel', desc: 'Un casier métallique fermé par un cadenas à molettes.' },
      { name: 'Coffre à réactifs', desc: 'Un petit coffre ignifugé à clavier numérique.' },
      { name: 'Tiroir sécurisé', desc: 'Un tiroir blindé sous la paillasse, verrouillé par un code.' },
      { name: 'Armoire à archives', desc: 'Une armoire à dossiers dont le volet exige un code.' },
    ],
    dialPanel: [
      { name: 'Panneau de secours', desc: 'Un panneau à molettes gravé, relié au sas.' },
      { name: 'Horloge de confinement', desc: 'Un cadran mécanique figé, réglable à la main.' },
      { name: 'Minuteur d’étuve', desc: 'Un minuteur gradué à molette, resté armé.' },
    ],
    door: [
      { name: 'Porte des machines', desc: 'Une porte à serrure mécanique et plaque gravée.' },
      { name: 'Sas intérieur', desc: 'Un sas coulissant à serrure de sûreté.' },
      { name: 'Porte de service', desc: 'Une porte discrète à serrure affleurante.' },
    ],
    keyItem: [
      { name: 'Clé de service', desc: 'Une clé plate à l’étiquette usée.' },
      { name: 'Passe technicien', desc: 'Un passe métallique au fermoir cassé.' },
      { name: 'Clé d’armoire froide', desc: 'Une clé courte au manche gainé de plastique.' },
    ],
    document: [
      { name: 'Note de service', desc: 'Une note jaunie punaisée au mur.' },
      { name: 'Rapport d’incident', desc: 'Une planchette à pince oubliée là.' },
      { name: 'Registre du personnel', desc: 'Un cahier ouvert à une page cornée.' },
      { name: 'Étiquette d’échantillon', desc: 'Une étiquette collée sur un flacon vide.' },
      { name: 'Mémo de direction', desc: 'Un mémo tamponné, à demi déchiré.' },
      { name: 'Feuille de paillasse', desc: 'Une feuille quadrillée couverte d’annotations.' },
      { name: 'Courrier interne', desc: 'Une enveloppe kraft frappée du tampon du service.' },
      { name: 'Fiche de sécurité', desc: 'Une fiche plastifiée accrochée par une chaînette.' },
      { name: 'Bon de commande', desc: 'Un bon de commande en triple exemplaire.' },
    ],
    tool: [
      { name: 'Lampe UV', desc: 'Une lampe à ultraviolets encore chargée.' },
      { name: 'Loupe de laboratoire', desc: 'Une loupe montée sur pied articulé.' },
    ],
    support: [
      { name: 'Cahier de manip', desc: 'Un cahier dont une page semble vierge.' },
      { name: 'Plaque de verre', desc: 'Une plaque de verre couverte d’un film mat.' },
    ],
    leverPanel: [
      { name: 'Tableau électrique', desc: 'Un tableau de disjoncteurs à basculer.' },
      { name: 'Rampe de vannes', desc: 'Une rampe de vannes de circuit à ouvrir.' },
    ],
    symbolPanel: [
      { name: 'Console à symboles', desc: 'Une console dont les touches portent des glyphes.' },
      { name: 'Pupitre de séquence', desc: 'Un pupitre à boutons marqués de signes.' },
    ],
    component: [
      { name: 'Manche d’outil', desc: 'Un manche isolé, sans tête.' },
      { name: 'Tête de clé dynamométrique', desc: 'Un embout métallique orphelin.' },
      { name: 'Cellule de rechange', desc: 'Une cellule d’alimentation neuve.' },
    ],
    workbench: [
      { name: 'Établi d’assemblage', desc: 'Un établi avec un étau et des attaches.' },
    ],
    letterLock: [
      { name: 'Terminal à mot de passe', desc: 'Un terminal réclamant un mot en toutes lettres.' },
      { name: 'Cadenas à lettres', desc: 'Un cadenas à barillets alphabétiques.' },
      { name: 'Clavier de la salle blanche', desc: 'Un clavier mural qui n’accepte que des lettres.' },
      { name: 'Verrou alphabétique', desc: 'Un verrou à bagues de lettres gravées.' },
    ],
    decor: [
      { name: 'Plante desséchée', desc: 'Un ficus mort depuis longtemps.' },
      { name: 'Combinaison hazmat', desc: 'Une combinaison intégrale pendue à un crochet.' },
      { name: 'Extincteur', desc: 'Un extincteur rouge à la pression tombée.' },
      { name: 'Affiche de sécurité', desc: 'Une affiche défraîchie sur les gestes d’urgence.' },
      { name: 'Tabouret de laboratoire', desc: 'Un tabouret réglable au vérin fatigué.' },
      { name: 'Portoir de tubes', desc: 'Un portoir où sèchent des tubes vides.' },
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
  colors: ['ROUGE', 'VERT', 'BLEU', 'JAUNE', 'BLANC'],
  symbols: ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'OMEGA'],
  // Mots-lettres de longueur >= 7 : leur catégorie sémantique (\d{longueur})
  // ne peut collisionner avec aucun code numérique (longueurs 3/4/5/6).
  // ≥ 8 mots : logic_deduction (hard) consomme 1 valeur + 2 leurres.
  // AUCUN mot n'apparaît dans une ancre, un nom/desc du vocab ni un poiName.
  words: [
    'QUARANTINE',
    'PROTOCOLE',
    'CATALYSE',
    'VECTEUR',
    'REACTEUR',
    'MICROSCOPE',
    'CENTRIFUGE',
    'PIPETTE',
  ],
  // Périphrases d'anagramme (sans chiffre, sans mot de `words`).
  wordHints: {
    QUARANTINE: 'l’isolement imposé aux contaminés',
    PROTOCOLE: 'la marche à suivre officielle',
    CATALYSE: 'l’accélération d’une réaction',
    VECTEUR: 'ce qui transporte l’agent',
    REACTEUR: 'la cuve où la réaction gronde',
    MICROSCOPE: 'l’instrument qui grossit l’invisible',
    CENTRIFUGE: 'la machine qui sépare en tournant',
    PIPETTE: 'le tube qui prélève goutte à goutte',
  },
};
