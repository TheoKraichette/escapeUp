# EscapeUp — Architecture technique

> **Phase 2** — Backend de génération, modèle de données, logique de validation.

---

## 1. Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                     packages/engine  (TypeScript pur)           │
│                                                                 │
│  seed ─► ScenarioGen ─► SkeletonGen ─► GraphGen ─► Dresser ─►   │
│          (thème,        (zones en     (DAG de     (habillage    │
│           histoire)      couches)      solution)   thématique)  │
│                                            │                    │
│                                            ▼                    │
│                        Placer ─► Validator ─► Serializer        │
│                        (objets    (solveur +   (RoomSpec JSON)  │
│                         → zones)   lints)                       │
└─────────────────────────────────────────────────────────────────┘
         │                                          │
         ▼                                          ▼
┌──────────────────────┐              ┌──────────────────────────┐
│  packages/server     │              │  packages/web            │
│  API + runtime de jeu│ ◄──actions── │  Client point-and-click  │
│  (état autoritaire,  │ ──events───► │  (vue expurgée : jamais  │
│   vue expurgée)      │              │   les solutions)         │
└──────────────────────┘              └──────────────────────────┘
```

**Principes d'architecture** :
- Le moteur de génération est une **fonction pure et déterministe** : `generate(seed, config) → RoomSpec`. Même seed → même salle. Zéro I/O, zéro `Date.now()`, PRNG seedé uniquement.
- Le **serveur est autoritaire** : le client ne reçoit jamais les solutions ni les infos non découvertes. Toute action est validée côté serveur.
- Le **contenu est de la donnée** : thèmes et templates de puzzles sont des fichiers déclaratifs. Ajouter du contenu ne modifie pas le code du moteur.

**Stack proposée** :

| Couche | Choix | Justification |
|--------|-------|---------------|
| Moteur | TypeScript pur, sans dépendance runtime (PRNG maison type mulberry32) | Testable, déterministe, portable (tourne aussi côté client pour le mode hors-ligne) |
| Serveur | Node.js + Fastify | Léger, mêmes types que le moteur |
| Persistance | SQLite (dev) / Postgres (prod) — sessions et classements ; les salles elles-mêmes n'ont pas besoin d'être stockées (re-générables depuis la seed) | La seed EST la base de données des salles |
| Client | React + **Three.js / React Three Fiber** (3D temps réel) | Salles 3D navigables construites procéduralement depuis le RoomSpec (géométries primitives + matériaux procéduraux — pas de pipeline d'assets) ; HUD et modales en DOM React par-dessus le canvas |

---

## 2. Modèle de données

### 2.1 Types du graphe de solution

Le graphe est la **vérité logique** de la salle. Tout le reste (objets, textes) en est l'habillage.

```ts
type NodeType =
  | 'ACCESS'   // une zone ou un contenant devient accessible
  | 'ITEM'     // un objet entre en possession du joueur
  | 'INFO'     // une information devient connue du joueur
  | 'STATE'    // l'état du monde change (courant rétabli, eau coupée…)
  | 'GOAL';    // l'objectif final

interface SolutionNode {
  id: string;             // ex: "info.incident_date"
  type: NodeType;
  layer: number;          // couche de progression (0 = accessible au départ)
  producedBy?: string;    // id du puzzle qui produit ce nœud (absent si donné au départ)
  carrier?: string;       // id de l'objet qui matérialise ce nœud (source de l'info, l'objet lui-même…)
  label: string;          // description interne, pour debug et hints
}

interface SolutionEdge {
  from: string;           // nœud requis
  to: string;             // puzzle ou nœud qui le consomme
}

interface SolutionGraph {
  nodes: SolutionNode[];
  edges: SolutionEdge[];
  goalId: string;
}
```

### 2.2 Puzzles

```ts
type PuzzleTemplateId =
  | 'key_lock' | 'code_from_document' | 'labeled_dial_code'
  | 'tool_reveal' | 'combine_items' | 'mechanism_sequence'
  | 'mapping_sequence' | 'logic_deduction' | 'cipher_substitution'
  | 'spatial_observation';

interface PuzzleInstance {
  id: string;
  template: PuzzleTemplateId;
  mechanismObjectId: string;        // l'objet-mécanisme (cadenas, panneau, porte…)
  inputs: string[];                 // ids de nœuds requis (INFO / ITEM / STATE)
  outputs: string[];                // ids de nœuds produits (ACCESS / ITEM / INFO / STATE)
  solution: PuzzleSolution;         // JAMAIS envoyé au client
  derivation: Derivation;           // trace de fabrication : d'où vient la solution
  hints: [string, string, string, string]; // 4 niveaux, instanciés à la génération
}

// La dérivation rend chaque solution AUDITABLE : le validateur peut
// re-vérifier que la solution est déductible des indices déclarés.
interface Derivation {
  sourceClueIds: string[];   // les INFO qui permettent de déduire la solution
  rule: string;              // ex: "code = valeur étiquetée ANNÉE dans info.incident_date"
  anchorLabel?: string;      // le label commun verrou/indice (règle d'or n°3)
  inferenceSteps: number;    // pour le calcul de difficulté
}

type PuzzleSolution =
  | { kind: 'code';     value: string }
  | { kind: 'key';      itemId: string }
  | { kind: 'sequence'; steps: string[] }          // ids de manipulations ordonnées
  | { kind: 'combine';  itemIds: string[] }
  | { kind: 'use_on';   toolId: string; targetId: string };
```

### 2.3 Objets et zones

```ts
interface GameObject {
  id: string;
  name: string;
  description: string;               // texte thématisé, généré à l'habillage
  family: 'info_carrier' | 'instrument' | 'mechanism' | 'decor';
  location: { zoneId: string; poiId: string } | 'inventory' | 'hidden';
  state: 'hidden' | 'visible' | 'locked' | 'taken' | 'used' | 'activated';
  affordances: Affordance[];         // inspect, take, read, use_on, enter_code, activate…
  reveals: Reveal[];                 // ce que l'interaction expose
  requires: Requirement[];           // conditions d'interaction
  narrativeFragment?: string;        // le bout d'histoire que cet objet porte
}

interface Reveal {
  on: Affordance;                    // quelle interaction déclenche
  nodeIds: string[];                 // nœuds INFO/ITEM révélés
  objectIds?: string[];              // objets cachés qui deviennent visibles
  text: string;                      // ce que le joueur lit/voit (contient l'indice)
}

interface Zone {
  id: string;
  name: string;
  layer: number;                     // 0 = accessible au départ
  pois: PointOfInterest[];           // meubles, machines, murs…
  gate?: string;                     // id du puzzle qui verrouille cette zone
}

interface RoomSpec {
  version: 1;
  seed: string;
  config: GenerationConfig;          // difficulté, thème demandé…
  theme: string;
  narrative: {
    title: string;
    backstory: string;               // interne — jamais montré tel quel au joueur
    playerObjective: string;         // montré au joueur à l'entrée
    epilogue: string;                // montré à la sortie
  };
  zones: Zone[];
  objects: GameObject[];
  puzzles: PuzzleInstance[];
  graph: SolutionGraph;
  metrics: DifficultyMetrics;        // profondeur, branches, inférence max…
}
```

### 2.4 Vue client expurgée

Le serveur dérive `ClientRoomView` de `RoomSpec` :
- `puzzles[].solution`, `puzzles[].derivation`, `graph` → **supprimés** ;
- `objects[]` filtrés : seuls les objets `visible` des zones accessibles, `reveals[].text` masqué tant que l'interaction n'a pas eu lieu ;
- `narrative.backstory` → supprimé (le joueur le reconstitue).

---

## 3. Pipeline de génération — détail

### Étape 1 — ScenarioGen
Tire dans le *theme pack* : un lieu, un **incident** (ce qui s'est passé), des personnages implicites (noms générés), un objectif final compatible (`sortir` / `révéler` / `activer`).
Sortie : `narrative` + un ensemble de **motifs narratifs** disponibles (ex : « incident daté », « employé négligent », « protocole d'urgence ») qui serviront de justification aux puzzles.

### Étape 2 — SkeletonGen
Choisit le nombre de zones selon le budget de difficulté et les assigne à des **couches** : `L0` (départ), `L1`, `L2`… Chaque zone de couche `N ≥ 1` reçoit une **porte** (gate) : un futur puzzle. Sortie : squelette spatial + liste de gates à pourvoir.

### Étape 3 — GraphGen (le cœur) : génération à rebours

```
function generateGraph(skeleton, budget):
  graph.goal = GOAL (ex: "porte de sortie ouverte")
  frontier = [goal]                       # nœuds dont on doit produire les prérequis

  # 3a. Le puzzle final est un puzzle de JOINTURE (T7/T8) si difficulté ≥ moyen :
  #     ses inputs seront répartis dans des zones de couches différentes.
  assignPuzzle(goal, pickTemplate(finalTemplates))

  # 3b. Pourvoir chaque gate de zone, de la couche la plus profonde vers L0 :
  for zone in zonesByLayerDesc:
    puzzle = pickTemplate(gateTemplates, budget)
    for input in puzzle.requiredInputs:
      # INVARIANT CENTRAL : tout input est placé en couche STRICTEMENT
      # inférieure à la zone gardée (ou même couche pour un puzzle interne).
      placeNode(input, layer < zone.layer)
      frontier.push(input)

  # 3c. Résoudre la frontière : chaque INFO/ITEM requis reçoit soit
  #     - un porteur direct (posé dans une zone de la bonne couche), soit
  #     - un sous-puzzle qui le produit (si budget de profondeur restant),
  #       dont les inputs repartent dans la frontière.
  while frontier not empty and depthBudget > 0:
    node = frontier.pop()
    if spendDepth(budget): attachSubPuzzle(node)   # récursion contrôlée
    else:                  attachCarrier(node)     # objet-source simple

  # 3d. Équilibrage : vérifier branches parallèles ≥ budget.branches
  #     (sinon dédoubler une chaîne en deux prérequis indépendants).
  return graph
```

Propriétés garanties par construction :
- **acyclicité** : un nœud ne peut requérir que des nœuds de couche ≤ la sienne, et jamais un nœud produit derrière son propre verrou ;
- **connexité** : tout nœud créé l'est parce qu'un consommateur l'exige — pas d'orphelin sur le chemin critique ;
- **budget respecté** : profondeur et branches pilotées par la difficulté.

### Étape 4 — Dresser (habillage thématique)
Chaque nœud abstrait est mappé sur le vocabulaire du thème via le *theme pack* :
`INFO "valeur ANNÉE"` → « rapport d'incident daté » ; `ITEM "outil de révélation"` → « lampe UV » (labo) ou « lanterne à filtre » (navire).
Les **textes d'indices sont générés par gabarits** : chaque template de puzzle fournit des gabarits à trous (`« Rappel : votre code de casier est votre numéro d'employé »`), remplis avec les valeurs tirées. Les motifs narratifs de l'étape 1 contraignent le choix (l'« employé négligent » justifie le mémo du casier).

### Étape 5 — Placer
Distribue les objets dans les points d'intérêt de leur zone assignée. Contraintes : densité max par POI, indices d'un même puzzle de jointure jamais dans le même POI, décor ajouté pour atteindre la densité cible de la zone.

### Étape 6 — Validator (voir §4)

### Étape 7 — Serializer
Émet le `RoomSpec` complet (serveur) et sait dériver la `ClientRoomView`.

**Boucle de rejet** : si la validation échoue (rare — les invariants sont structurels, mais l'habillage peut créer une collision, ex. deux années plausibles), le générateur ré-habille ou régénère avec `seed + retryCount`, en journalisant la cause.

---

## 4. Le validateur

Deux familles de vérifications : le **solveur** (preuve de solvabilité) et les **lints** (fairness).

### 4.1 Solveur — simulation d'un joueur parfait

```
function solve(room):
  state = {
    access:    zones de couche 0,
    inventory: ∅,
    knowledge: ∅,
    world:     états initiaux,
  }
  trace = []

  loop:
    # 1. Récolte gratuite : toute interaction dont les `requires`
    #    sont satisfaits ajoute ses `reveals` (INFO, ITEM) à l'état.
    harvest(state)

    # 2. Puzzles applicables : inputs ⊆ état courant.
    applicable = room.puzzles.filter(p => p.inputs ⊆ state)

    if applicable is empty:
      if GOAL ∈ state: return SOLVABLE(trace)
      else: return UNSOLVABLE(missing = frontière inatteignable)  # + diagnostic

    for p in applicable:
      apply(p, state); trace.push(p)
```

Le solveur produit la **trace de résolution canonique** — réutilisée pour : le walkthrough de debug, le calcul de durée estimée, et la vérification des hints.

### 4.2 Lints de fairness

| Lint | Vérifie | Règle d'or |
|------|---------|------------|
| `dag-check` | Tri topologique du graphe réussit | n°2 |
| `source-check` | Chaque `puzzle.derivation.sourceClueIds` pointe vers des INFO portées par des objets réellement placés et atteignables avant le puzzle (selon la trace du solveur) | n°1 |
| `anchor-check` | Tout puzzle à code a un `anchorLabel` présent à la fois dans le texte du verrou et dans le texte de l'indice source | n°3 |
| `ambiguity-check` | Aucune autre valeur du même type sémantique (année, n° de chambre…) n'apparaît dans les textes des zones atteignables au moment du puzzle | n°4 |
| `tool-order-check` | Couche d'obtention de l'outil < couche du support | n°5 |
| `progress-check` | Chaque puzzle du chemin critique a ≥ 1 output de type ACCESS/ITEM/INFO/STATE consommé en aval | n°6 |
| `no-loss-check` | Aucun objet du chemin critique n'a d'action destructrice/consommatrice non restaurable | n°7 |
| `decoy-check` | Les leurres ne produisent aucune valeur candidate pour un verrou actif | n°8 |
| `dead-object-check` | Tout objet non-décor apparaît dans le graphe (sinon → reclasser décor ou rejeter) | cohérence |

`ambiguity-check` est le lint le plus important : c'est lui qui attrape les collisions d'habillage (le générateur a placé « fondé en 1952 » dans un texte d'ambiance alors qu'un cadran ANNÉE est actif → rejet et ré-habillage).

### 4.3 Estimation de difficulté
Depuis la trace : `durée ≈ Σ (base_template + inferenceSteps × k) + coût_navigation(zones)`. Comparée à la cible du profil ; hors fourchette → ajustement (ajout/retrait d'un sous-puzzle) et re-validation.

---

## 5. Theme packs — le contenu comme donnée

```
content/
├── themes/
│   ├── laboratoire.theme.json    # vocabulaire : zones, POI, objets, noms,
│   ├── navire.theme.json         # motifs narratifs, gabarits de textes,
│   └── hotel.theme.json          # mappings nœud abstrait → objet concret
└── templates/
    ├── labeled_dial_code.tpl.json  # inputs requis, clueSpec, gabarits
    ├── mapping_sequence.tpl.json   # d'indices et de hints, fairnessRules
    └── …
```

Un theme pack déclare notamment la **matrice de compatibilité** : quels templates de puzzle sont naturels dans ce thème et avec quel habillage (`mechanism_sequence` → « tableau électrique » en labo, « vannes de ballast » en navire). Le générateur ne choisit que des paires (template, habillage) déclarées compatibles → la cohérence thématique est, elle aussi, structurelle.

---

## 6. Runtime de jeu (serveur autoritaire)

### État de session

```ts
interface PlayerState {
  roomSeed: string;
  access: Set<string>;      // zones/contenants ouverts
  inventory: Set<string>;
  knowledge: Set<string>;   // ids d'INFO découvertes (alimente le carnet)
  world: Record<string, string>;  // états des mécanismes
  solvedPuzzles: Set<string>;
  hintsUsed: Record<string, number>; // puzzleId → niveau atteint
  startedAt: string; log: ActionLog[];
}
```

### API

| Méthode | Route | Rôle |
|---------|-------|------|
| `POST` | `/api/rooms` | `{ seed?, difficulty?, theme? }` → génère (ou re-dérive), crée une session, renvoie `ClientRoomView` + `sessionId` |
| `GET` | `/api/sessions/:id` | État courant expurgé (reprise de partie) |
| `POST` | `/api/sessions/:id/actions` | `{ type: 'inspect'\|'take'\|'read'\|'use_on'\|'combine'\|'enter_code'\|'activate', … }` → validation serveur → liste d'événements (révélations, ouvertures, échecs informatifs) |
| `POST` | `/api/sessions/:id/hint` | `{ puzzleId? }` → hint du niveau suivant pour la frontière courante (dérivé du graphe) |
| `GET` | `/api/daily` | Seed du jour + classement |

Le traitement d'une action est le **même code que le solveur** (moteur partagé) appliqué à un pas : requirements → effets. Une seule implémentation de la logique = pas de divergence entre validation et gameplay.

---

## 7. Tests & outillage

- **Fuzzing de génération** : générer N=10 000 salles par profil en CI ; assert : 100 % solvables, 0 violation de lint, distribution des métriques dans les fourchettes.
- **Golden seeds** : quelques seeds fixés en test de non-régression (le RoomSpec sérialisé ne doit pas changer sans bump de version).
- **Replays** : le log d'actions d'une session rejoué contre le moteur reproduit l'état final (détection de triche + debug).
- **Visualiseur de graphe** (outil dev) : rendu du DAG avec couches, chemin critique surligné.

---

## 8. Couche IA (extension future — jamais dans la boucle logique)

Architecture prévue pour brancher un LLM **en aval de la logique**, jamais en amont :

| Usage | Entrée | Garde-fou |
|-------|--------|-----------|
| Réécriture des textes (descriptions, journaux) plus riches | RoomSpec validé + contraintes (`mustContain: ["1987", "ANNÉE"]`) | Re-passage des lints `anchor-check`/`ambiguity-check` sur le texte produit ; rejet si l'indice a été perdu ou si une valeur parasite est apparue |
| Narration dynamique (réactions contextuelles au joueur) | PlayerState expurgé | Le LLM ne connaît pas les solutions non découvertes → il ne peut pas les divulguer |
| Hints reformulés en langage naturel | Hint mécanique niveau N | Le contenu logique vient du graphe, le LLM ne fait que le formuler |
| Adaptation de difficulté | Métriques de session (temps, hints, échecs) | N'influence que le `GenerationConfig` de la **prochaine** salle |

Le déterminisme de la génération est préservé : les sorties LLM sont stockées avec la salle (cache par seed), pas régénérées à chaque partie.
