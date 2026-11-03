// ============================================================================
// THEME PACK — NAVIRE (cargo à la dérive). Vocabulaire digit-free.
// ============================================================================

import type { ThemePack } from './types';

export const NAVIRE: ThemePack = {
  id: 'navire',
  displayName: 'Cargo à la dérive',
  narrative: {
    titles: [
      'Le cargo fantôme',
      'Avarie en mer profonde',
      'Le dernier quart',
      'Abandon en haute mer',
    ],
    backstories: [
      "L'équipage a évacué dans la nuit ; la passerelle est restée verrouillée de l'intérieur.",
      "Une voie d'eau a condamné les cales ; le bord de mer a tout figé.",
      "Le commandant a scellé les compartiments avant de disparaître, ne laissant que ses ordres.",
    ],
    objectives: [
      'Rejoignez le canot de sauvetage et quittez le navire.',
      'Rétablissez la pression et ouvrez le sabord de secours.',
      'Forcez la passerelle et lancez le signal de détresse.',
    ],
    epilogues: [
      'Le sabord s’ouvre sur l’écume. Vous êtes libre.',
      'Le canot touche l’eau ; le cargo s’efface derrière vous.',
      'La dernière écoutille cède. La mer vous reprend, vivant.',
    ],
    motifs: [
      'quart négligé',
      'ordre du commandant',
      'avarie datée',
      'chaîne de commandement',
      'évacuation précipitée',
    ],
  },
  zoneNames: [
    'Coursive d’embarquement',
    'Salle des machines',
    'Cambuse',
    'Passerelle de navigation',
    'Pont supérieur',
  ],
  // ≥ 16 entrées : une salle hard (4 zones × 4 POI) se sert SANS remise.
  poiNames: [
    'Poste de garde',
    'Rangée de coffres',
    'Établi de mécanicien',
    'Chambre froide',
    'Tableau de bord',
    'Barre de navigation',
    'Soute à vivres',
    'Sabord de secours',
    'Cabine du commandant',
    'Râtelier d’outils',
    'Carré de l’équipage',
    'Atelier de bord',
    'Local des pompes',
    'Coqueron avant',
    'Passavant tribord',
    'Armoire à pavillons',
  ],
  anchors: {
    year: ['ANNÉE DE L’AVARIE', 'ANNÉE DE LANCEMENT', 'ANNÉE DU DERNIER QUART'],
    digits: ['NUMÉRO DE CABINE', 'NUMÉRO DE COQUE', 'CODE DE SOUTE', 'MATRICULE DE BORD'],
    // >= 5 ancres distinctes : cf. laboratoire.ts (unicité d'ancre [W4]).
    // AUCUNE ancre ne CONTIENT un mot de `words` (sinon fuite via l'ancre exposée).
    letters: [
      'INDICATIF',
      'MOT DE PASSE',
      'NOM DE BAPTÊME',
      'NOM DE CODE',
      'INTITULÉ DE REGISTRE',
      'RÉFÉRENCE DE MANIFESTE',
    ],
  },
  vocab: {
    codeLock: [
      { name: 'Coffre de marin', desc: 'Un coffre de bord cadenassé par des molettes.' },
      { name: 'Casier d’équipage', desc: 'Un casier d’acier fermé par un cadenas à code.' },
      { name: 'Caisson étanche', desc: 'Un caisson à clavier scellé contre l’eau.' },
      { name: 'Armoire de passerelle', desc: 'Une armoire d’instruments verrouillée par un clavier.' },
    ],
    dialPanel: [
      { name: 'Manomètre gradué', desc: 'Un cadran à aiguille bloqué, réglable à la main.' },
      { name: 'Panneau de ballast', desc: 'Un panneau à molettes relié aux vannes de sabord.' },
      { name: 'Loch enregistreur', desc: 'Un cadran de loch à molettes de réglage.' },
    ],
    door: [
      { name: 'Porte étanche', desc: 'Une porte de compartiment à volant et serrure.' },
      { name: 'Écoutille de coursive', desc: 'Une écoutille à serrure de sûreté.' },
      { name: 'Porte de cambuse', desc: 'Une porte à hublot fermée d’une serrure simple.' },
    ],
    keyItem: [
      { name: 'Clé de maître', desc: 'Une clé de bord à l’étiquette rongée de sel.' },
      { name: 'Passe d’officier', desc: 'Un passe de laiton au cordon usé.' },
      { name: 'Clé de cale', desc: 'Une clé trapue maculée de graisse.' },
    ],
    document: [
      { name: 'Ordre de mission', desc: 'Un ordre punaisé au-dessus d’une couchette.' },
      { name: 'Livre de bord', desc: 'Un journal de bord ouvert, gondolé par l’humidité.' },
      { name: 'Rôle d’équipage', desc: 'Une liste d’équipage clouée à la cloison.' },
      { name: 'Étiquette de soute', desc: 'Une étiquette manuscrite sur une caisse.' },
      { name: 'Note du commandant', desc: 'Une note pliée, tachée d’eau de mer.' },
      { name: 'Manifeste de cargaison', desc: 'Un manifeste tamponné par la capitainerie.' },
      { name: 'Bulletin météo', desc: 'Un bulletin déchiré au bas de la feuille.' },
      { name: 'Carnet du second', desc: 'Un carnet de poche gonflé d’humidité.' },
      { name: 'Avis à l’équipage', desc: 'Un avis punaisé au carré, corné aux angles.' },
    ],
    tool: [
      { name: 'Lampe de quart', desc: 'Une lampe torche étanche encore vive.' },
      { name: 'Loupe de cartographe', desc: 'Une loupe rangée près des cartes.' },
    ],
    support: [
      { name: 'Carte marine', desc: 'Une carte dont une marge paraît vierge.' },
      { name: 'Ardoise de quart', desc: 'Une ardoise couverte d’un voile terne.' },
    ],
    leverPanel: [
      { name: 'Pupitre des ballasts', desc: 'Un pupitre de leviers de ballast à manœuvrer.' },
      { name: 'Coffret de disjoncteurs', desc: 'Un coffret d’interrupteurs de bord.' },
    ],
    symbolPanel: [
      { name: 'Console des signaux', desc: 'Une console dont les touches portent des pavillons.' },
      { name: 'Répétiteur à glyphes', desc: 'Un répétiteur à boutons marqués de signes.' },
    ],
    component: [
      { name: 'Manche de gaffe', desc: 'Un manche de bois sans crochet.' },
      { name: 'Crochet de gaffe', desc: 'Un crochet d’acier détaché.' },
      { name: 'Pile de secours', desc: 'Une pile étanche neuve.' },
    ],
    workbench: [
      { name: 'Établi de mécanicien', desc: 'Un établi de bord avec étau et serre-joints.' },
    ],
    letterLock: [
      { name: 'Coffre à indicatif', desc: 'Un coffre réclamant un mot en toutes lettres.' },
      { name: 'Cadenas alphabétique', desc: 'Un cadenas à barillets de lettres.' },
      { name: 'Serrure du carré', desc: 'Une serrure à bagues de lettres polies par l’usage.' },
      { name: 'Verrou de la passerelle', desc: 'Un verrou qui n’accepte qu’un mot exact.' },
    ],
    decor: [
      { name: 'Filet de pêche', desc: 'Un filet emmêlé jeté dans un coin.' },
      { name: 'Ciré jaune', desc: 'Un ciré de quart pendu à une patère.' },
      { name: 'Bouée de sauvetage', desc: 'Une bouée décolorée accrochée à la cloison.' },
      { name: 'Affiche de consignes', desc: 'Une affiche d’évacuation gondolée par le sel.' },
      { name: 'Caisse arrimée', desc: 'Une caisse sanglée contre le roulis.' },
      { name: 'Chaîne d’amarrage', desc: 'Une chaîne lovée en huit sur le pont.' },
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
  colors: ['ROUGE', 'VERT', 'BLEU', 'NOIR', 'BLANC'],
  symbols: ['ANCRE', 'ETOILE', 'VAGUE', 'CROIX', 'LOSANGE'],
  // Mots-lettres de longueur >= 7 (voir laboratoire.ts pour la raison).
  // ≥ 8 mots : logic_deduction (hard) consomme 1 valeur + 2 leurres.
  words: [
    'NEPTUNE',
    'TEMPETE',
    'BOUSSOLE',
    'NAUFRAGE',
    'ALBATROS',
    'HORIZON',
    'SEXTANT',
    'GOELETTE',
  ],
  // Périphrases d'anagramme (sans chiffre, sans mot de `words`).
  wordHints: {
    NEPTUNE: 'le dieu qui règne sous la houle',
    TEMPETE: 'le gros temps qui brise les mâts',
    BOUSSOLE: 'l’aiguille qui cherche le nord',
    NAUFRAGE: 'la fin brutale d’un navire',
    ALBATROS: 'le grand oiseau des mers australes',
    HORIZON: 'la ligne où mer et ciel se touchent',
    SEXTANT: 'l’instrument qui vise les étoiles',
    GOELETTE: 'un voilier fin à deux mâts',
  },
};
