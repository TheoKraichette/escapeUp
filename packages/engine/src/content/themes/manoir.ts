// ============================================================================
// THEME PACK — MANOIR (domaine Valcourt). Vocabulaire digit-free : les valeurs
// numériques des verrous sont injectées par les gadgets, jamais par le thème.
// ============================================================================

import type { ThemePack } from './types';

export const MANOIR: ThemePack = {
  id: 'manoir',
  displayName: 'Manoir Valcourt',
  narrative: {
    titles: [
      'Le testament Valcourt',
      'La dernière veillée',
      'L’héritier absent',
      'Les volets clos du domaine',
    ],
    backstories: [
      "Le notaire n'est jamais revenu ; la maison a été scellée avec tous ses secrets dedans.",
      "La famille s'est déchirée en une nuit d'orage ; chacun a caché sa part de vérité.",
      "Le dernier maître des lieux a verrouillé pièce après pièce avant de disparaître.",
    ],
    objectives: [
      'Percez les secrets du manoir et trouvez la sortie.',
      'Retrouvez ce que la famille a scellé, et quittez le domaine.',
      'Remontez la trace du testament et forcez la porte du parc.',
    ],
    epilogues: [
      'La grande porte pivote enfin : l’air du parc entre à flots.',
      'Le verrou du vestibule cède ; derrière, la nuit, la grille, la liberté.',
      'Les gonds gémissent une dernière fois. Le manoir vous laisse partir.',
    ],
    motifs: [
      'héritage disputé',
      'domestique congédié',
      'lettre jamais postée',
      'chambre condamnée',
      'portrait retourné',
    ],
  },
  zoneNames: [
    'Vestibule',
    'Grand salon',
    'Bibliothèque',
    'Fumoir',
    'Chambre du maître',
  ],
  // ≥ 16 entrées : une salle hard (4 zones × 4 POI) se sert SANS remise.
  poiNames: [
    'Guéridon d’entrée',
    'Cheminée de marbre',
    'Secrétaire en acajou',
    'Bibliothèque vitrée',
    'Piano à queue',
    'Coiffeuse ancienne',
    'Vitrine aux porcelaines',
    'Bureau du notaire',
    'Lit à baldaquin',
    'Console de l’escalier',
    'Office des domestiques',
    'Escalier de service',
    'Alcôve aux rideaux',
    'Cabinet de curiosités',
    'Penderie du maître',
    'Table de jeu',
  ],
  anchors: {
    year: ['ANNÉE DE CONSTRUCTION', 'ANNÉE DU MARIAGE', 'ANNÉE DE LA SUCCESSION'],
    digits: ['NUMÉRO DU COFFRE', 'CODE DU CELLIER', 'NUMÉRO D’INVENTAIRE', 'RÉFÉRENCE DU LOT'],
    // >= 5 ancres distinctes (unicité [W4]) ; AUCUNE ne contient un mot de `words`.
    letters: [
      'NOM DE FAMILLE',
      'DEVISE DU BLASON',
      'TITRE DU LIVRE',
      'NOM DU DOMAINE',
      'INSCRIPTION DU MÉDAILLON',
      'NOM DE BAPTÊME',
    ],
  },
  vocab: {
    codeLock: [
      { name: 'Coffre-fort mural', desc: 'Un coffre dissimulé derrière un cadre, à clavier discret.' },
      { name: 'Cassette du notaire', desc: 'Une cassette de voyage ceinte d’un cadenas à molettes.' },
      { name: 'Tiroir du secrétaire', desc: 'Un tiroir à secret dont la serrure réclame un code.' },
      { name: 'Coffret à courrier', desc: 'Un coffret d’entrée à serrure chiffrée.' },
    ],
    dialPanel: [
      { name: 'Horloge comtoise', desc: 'Une comtoise arrêtée, dont les aiguilles se règlent à la main.' },
      { name: 'Calendrier mécanique', desc: 'Un calendrier de bureau à molettes de laiton.' },
      { name: 'Baromètre de vestibule', desc: 'Un baromètre à aiguille que l’on peut recaler.' },
    ],
    door: [
      { name: 'Porte capitonnée', desc: 'Une porte lourde au capiton usé, à serrure ancienne.' },
      { name: 'Grille du passage', desc: 'Une grille en fer forgé fermée d’une serrure ouvragée.' },
      { name: 'Porte de l’office', desc: 'Une porte de service à la peinture écaillée.' },
    ],
    keyItem: [
      { name: 'Clé de chambranle', desc: 'Une longue clé ancienne à panneton ouvragé.' },
      { name: 'Clé du régisseur', desc: 'Une clé lourde pendue à un ruban fané.' },
      { name: 'Clé du cellier', desc: 'Une petite clé au panneton simple, encore huilée.' },
    ],
    document: [
      { name: 'Lettre cachetée', desc: 'Une lettre décachetée à la hâte, relue cent fois.' },
      { name: 'Journal intime', desc: 'Un carnet à fermoir, ouvert sur une page datée.' },
      { name: 'Registre du domaine', desc: 'Un grand registre relié de cuir craquelé.' },
      { name: 'Faire-part encadré', desc: 'Un faire-part jauni sous verre.' },
      { name: 'Carnet du majordome', desc: 'Un calepin strict, aux colonnes impeccables.' },
      { name: 'Inventaire notarié', desc: 'Un inventaire à la plume, colonnes serrées.' },
      { name: 'Carte de visite annotée', desc: 'Une carte cornée, griffée d’une main pressée.' },
      { name: 'Menu de réception', desc: 'Un menu calligraphié pour un dîner sans invités.' },
      { name: 'Coupure de journal', desc: 'Une coupure jaunie glissée sous un sous-main.' },
    ],
    tool: [
      { name: 'Lampe à pétrole', desc: 'Une lampe au verre noirci, encore chaude de mèche.' },
      { name: 'Monocle du notaire', desc: 'Un monocle à monture d’écaille, étrangement teinté.' },
    ],
    support: [
      { name: 'Miroir piqué', desc: 'Un miroir au tain rongé, comme voilé par endroits.' },
      { name: 'Tapisserie passée', desc: 'Une tapisserie dont les motifs semblent inachevés.' },
    ],
    leverPanel: [
      { name: 'Rangée de tirettes', desc: 'Des tirettes de sonnette alignées près de l’office.' },
      { name: 'Mécanisme de la pendule', desc: 'Une rangée de leviers sous le cadran de la pendule.' },
    ],
    symbolPanel: [
      { name: 'Coffret héraldique', desc: 'Un coffret dont les boutons portent des blasons.' },
      { name: 'Serrure à rosaces', desc: 'Une serrure d’apparat aux boutons gravés de motifs.' },
    ],
    component: [
      { name: 'Manche d’ivoire', desc: 'Un manche sculpté, privé de sa lame.' },
      { name: 'Panneton descellé', desc: 'Un panneton de clé, détaché de sa tige.' },
      { name: 'Ressort de pendule', desc: 'Un ressort spiralé, soigneusement rangé.' },
    ],
    workbench: [
      { name: 'Table de l’horloger', desc: 'Une petite table à outils fins et étau de précision.' },
    ],
    letterLock: [
      { name: 'Cadenas à lettres', desc: 'Un cadenas de malle à barillets alphabétiques.' },
      { name: 'Serrure à devise', desc: 'Une serrure de cabinet réclamant un mot exact.' },
      { name: 'Écritoire à secret', desc: 'Un écritoire dont le fermoir épelle un mot.' },
      { name: 'Verrou du reliquaire', desc: 'Un verrou fin à bagues de lettres dorées.' },
    ],
    decor: [
      { name: 'Portrait d’aïeul', desc: 'Un portrait sévère au regard qui suit.' },
      { name: 'Chandelier terni', desc: 'Un chandelier d’argent noirci par les ans.' },
      { name: 'Fauteuil drapé', desc: 'Un fauteuil couvert d’un drap blanc.' },
      { name: 'Vase de Chine', desc: 'Un grand vase au vernis craquelé.' },
      { name: 'Pendule arrêtée', desc: 'Une pendule de cheminée figée sur son quart.' },
      { name: 'Paravent brodé', desc: 'Un paravent aux scènes de chasse pâlies.' },
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
  colors: ['POURPRE', 'IVOIRE', 'CARMIN', 'SABLE', 'INDIGO'],
  symbols: ['LYS', 'CORBEAU', 'COURONNE', 'ROSACE', 'CERF'],
  // Mots-lettres >= 7 lettres, jamais contenus dans une ancre (anti-fuite).
  // ≥ 8 mots : logic_deduction (hard) consomme 1 valeur + 2 leurres.
  // NB : pas de PORTRAIT ici — le décor « Portrait d'aïeul » l'afficherait
  // en clair dans la salle (fuite détectée par scripts/verify-enigmes.ts).
  words: [
    'HERITAGE',
    'MASCARADE',
    'VERANDA',
    'CANDELABRE',
    'SILENCE',
    'GRIMOIRE',
    'ORANGERIE',
    'CALECHE',
  ],
  // Périphrases d'anagramme (sans chiffre, sans mot de `words`).
  wordHints: {
    HERITAGE: 'ce que les morts laissent aux vivants',
    MASCARADE: 'le bal où chacun cache son visage',
    VERANDA: 'la pièce vitrée ouverte sur le parc',
    CANDELABRE: 'le grand porte-bougies à branches',
    SILENCE: 'ce qui règne quand tout le monde se tait',
    GRIMOIRE: 'le livre des formules anciennes',
    ORANGERIE: 'la serre où hivernent les agrumes',
    CALECHE: 'la voiture que tirent les chevaux',
  },
};
