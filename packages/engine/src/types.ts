// ============================================================================
// CONTRAT DE TYPES DU MOTEUR ESCAPEUP
// Ce fichier est la vérité partagée entre génération, validation, runtime,
// serveur et client. Il matérialise le modèle de docs/02-ARCHITECTURE.md §2.
// NE PAS MODIFIER sans mettre à jour la doc et tous les consommateurs.
// ============================================================================

// ————————————————————————————————— Configuration —————————————————————————————————

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GenerationConfig {
  difficulty: Difficulty;
  /** id du theme pack ; tiré au sort depuis la seed si absent */
  theme?: string;
}

// ————————————————————————————————— Graphe de solution —————————————————————————————————

export type NodeType = 'ACCESS' | 'ITEM' | 'INFO' | 'STATE' | 'GOAL';

export interface SolutionNode {
  id: string;
  type: NodeType;
  /** couche de progression (0 = accessible au départ) */
  layer: number;
  /** id du puzzle qui produit ce nœud (absent si donné au départ / simple récolte) */
  producedBy?: string;
  /** id de l'objet qui matérialise ce nœud (source d'une INFO, l'objet d'un ITEM…) */
  carrier?: string;
  /** description interne, pour debug et hints */
  label: string;
}

export interface SolutionEdge {
  /** nœud requis */
  from: string;
  /** id du puzzle qui le consomme */
  to: string;
}

export interface SolutionGraph {
  nodes: SolutionNode[];
  edges: SolutionEdge[];
  goalId: string;
}

// ————————————————————————————————— Puzzles —————————————————————————————————

export type PuzzleTemplateId =
  | 'key_lock'
  | 'code_from_document'
  | 'labeled_dial_code'
  | 'tool_reveal'
  | 'combine_items'
  | 'mechanism_sequence'
  | 'mapping_sequence'
  | 'logic_deduction'
  | 'cipher_substitution'
  | 'spatial_observation';

export type PuzzleSolution =
  | { kind: 'code'; value: string }
  | { kind: 'key'; itemNodeId: string }
  | { kind: 'sequence'; steps: string[] }
  | { kind: 'combine'; itemNodeIds: string[] }
  | { kind: 'use_on'; toolNodeId: string; targetObjectId: string };

/**
 * Trace de fabrication de la solution : la preuve interne qu'elle est
 * déductible des indices déclarés. Auditée par les lints.
 */
export interface Derivation {
  /** les INFO qui permettent de déduire la solution */
  sourceClueIds: string[];
  /** ex: "code = valeur étiquetée ANNÉE dans info.date_incident" */
  rule: string;
  /** le label commun verrou/indice (Règle d'or n°3) */
  anchorLabel?: string;
  /** nombre de transformations mentales indice → action (difficulté) */
  inferenceSteps: number;
}

export interface PuzzleInstance {
  id: string;
  template: PuzzleTemplateId;
  /** l'objet-mécanisme (cadenas, panneau, porte…) */
  mechanismObjectId: string;
  /** ids de nœuds requis (INFO / ITEM / STATE / ACCESS) */
  inputs: string[];
  /** ids de nœuds produits (ACCESS / ITEM / INFO / STATE / GOAL) */
  outputs: string[];
  /** JAMAIS envoyé au client */
  solution: PuzzleSolution;
  derivation: Derivation;
  /** 4 niveaux d'escalade : orientation, focalisation, connexion, solution */
  hints: [string, string, string, string];
}

// ————————————————————————————————— Objets —————————————————————————————————

export type Affordance =
  | 'inspect'
  | 'read'
  | 'take'
  | 'use_on'
  | 'combine'
  | 'enter_code'
  | 'enter_sequence'
  | 'activate';

export type ObjectState = 'hidden' | 'visible' | 'locked' | 'taken' | 'open' | 'activated';

export type ObjectFamily = 'info_carrier' | 'instrument' | 'mechanism' | 'decor';

export type ObjectLocation = { zoneId: string; poiId: string } | 'inventory' | 'hidden';

/**
 * Spécification machine de l'interface d'un mécanisme, pour que le client
 * puisse rendre n'importe quel verrou généré sans code spécifique.
 */
export type MechanismControls =
  | { kind: 'code'; length: number; label?: string; alphabet: 'digits' | 'letters' }
  | { kind: 'sequence'; options: { id: string; label: string }[]; slots: number }
  | { kind: 'keyhole'; label?: string }
  | { kind: 'use_target' }
  | { kind: 'switch' };

export interface Reveal {
  /** quelle interaction déclenche la révélation */
  on: Affordance;
  /** nœuds INFO/ITEM acquis */
  nodeIds: string[];
  /** objets cachés qui deviennent visibles */
  objectIds?: string[];
  /** ce que le joueur lit/voit (contient l'indice, ancre comprise) */
  text: string;
}

export type Requirement =
  /** le puzzle doit être résolu (mécanismes verrouillés) */
  | { kind: 'puzzle'; puzzleId: string }
  /** un nœud du graphe doit être acquis ; `for` restreint à une affordance donnée */
  | { kind: 'node'; nodeId: string; for?: Affordance };

export interface GameObject {
  id: string;
  name: string;
  description: string;
  family: ObjectFamily;
  location: ObjectLocation;
  initialState: ObjectState;
  affordances: Affordance[];
  reveals: Reveal[];
  requires: Requirement[];
  controls?: MechanismControls;
  /** le bout d'histoire que cet objet porte (vide pour le pur décor) */
  narrativeFragment?: string;
}

// ————————————————————————————————— Zones —————————————————————————————————

export interface PointOfInterest {
  id: string;
  name: string;
  description?: string;
}

export interface Zone {
  id: string;
  name: string;
  /** 0 = accessible au départ */
  layer: number;
  /** id du puzzle qui verrouille cette zone (absent pour la couche 0) */
  gate?: string;
  pois: PointOfInterest[];
}

// ————————————————————————————————— Salle —————————————————————————————————

export interface Narrative {
  title: string;
  /** interne — jamais montré tel quel au joueur */
  backstory: string;
  /** montré au joueur à l'entrée */
  playerObjective: string;
  /** montré à la sortie */
  epilogue: string;
}

export interface DifficultyMetrics {
  criticalPathDepth: number;
  parallelBranches: number;
  multiZoneJoinPuzzles: number;
  maxInferenceSteps: number;
  zoneCount: number;
  estimatedMinutes: number;
  decoyCount: number;
}

export interface RoomSpec {
  version: 1;
  seed: string;
  config: GenerationConfig;
  theme: string;
  narrative: Narrative;
  zones: Zone[];
  objects: GameObject[];
  puzzles: PuzzleInstance[];
  graph: SolutionGraph;
  metrics: DifficultyMetrics;
}

// ————————————————————————————————— Runtime (état joueur) —————————————————————————————————

export interface NotebookEntry {
  nodeId: string;
  objectId: string;
  text: string;
}

/**
 * Sérialisable en JSON tel quel (stocké en jsonb côté serveur).
 * L'inventaire se dérive des nœuds ITEM acquis (carrier → objet).
 */
export interface PlayerState {
  seed: string;
  /** ids de nœuds du graphe obtenus (INFO/ITEM/ACCESS/STATE/GOAL) */
  acquired: string[];
  /** évolution des états d'objets par rapport à initialState */
  objectStates: Record<string, ObjectState>;
  solvedPuzzles: string[];
  notebook: NotebookEntry[];
  /** puzzleId → dernier niveau de hint consommé (1–4) */
  hintsUsed: Record<string, number>;
  actionLog: Action[];
}

export type Action =
  | { type: 'inspect'; objectId: string }
  | { type: 'read'; objectId: string }
  | { type: 'take'; objectId: string }
  | { type: 'use_on'; toolObjectId: string; targetObjectId: string }
  | { type: 'combine'; objectIds: string[] }
  | { type: 'enter_code'; objectId: string; code: string }
  | { type: 'enter_sequence'; objectId: string; steps: string[] }
  | { type: 'activate'; objectId: string };

export type GameEvent =
  | { type: 'text'; objectId: string; text: string }
  | { type: 'object_revealed'; objectId: string }
  | { type: 'item_taken'; objectId: string }
  | { type: 'info_gained'; nodeId: string; text: string }
  | { type: 'puzzle_solved'; puzzleId: string; unlocked: string[] }
  | { type: 'state_changed'; nodeId: string; label: string }
  | { type: 'zone_unlocked'; zoneId: string }
  | { type: 'goal_reached'; epilogue: string }
  /** échec informatif : le message cite l'ancre du verrou (GDD §11) */
  | { type: 'failure'; objectId: string; message: string }
  | { type: 'noop'; message: string };

export interface ActionResult {
  state: PlayerState;
  events: GameEvent[];
}

// ————————————————————————————————— Vue client (expurgée) —————————————————————————————————

export interface ClientObjectView {
  id: string;
  name: string;
  description: string;
  family: ObjectFamily;
  location: ObjectLocation;
  state: ObjectState;
  affordances: Affordance[];
  controls?: MechanismControls;
}

export interface ClientZoneView {
  id: string;
  name: string;
  accessible: boolean;
  pois: PointOfInterest[];
}

/**
 * Ce que le client reçoit : JAMAIS de solution, de dérivation, de graphe,
 * de backstory, ni de texte de reveal non découvert.
 */
export interface ClientRoomView {
  seed: string;
  theme: string;
  title: string;
  playerObjective: string;
  zones: ClientZoneView[];
  objects: ClientObjectView[];
  /** objectIds en inventaire */
  inventory: string[];
  notebook: NotebookEntry[];
  solvedPuzzles: string[];
  /** nombre total d'énigmes de la salle (progression x/y — donnée anodine) */
  puzzleCount: number;
  goalReached: boolean;
  /** présent uniquement quand goalReached */
  epilogue?: string;
}

// ————————————————————————————————— Validation —————————————————————————————————

export interface SolverPass {
  pass: number;
  /** nœuds récoltés gratuitement (reveals accessibles) */
  harvested: string[];
  /** puzzles résolus cette passe */
  solved: string[];
  /** nœuds produits par ces puzzles */
  gained: string[];
}

export type SolveResult =
  | { solvable: true; trace: SolverPass[] }
  | { solvable: false; trace: SolverPass[]; missing: string[]; reason: string };

export type LintId =
  | 'dag-check'
  | 'source-check'
  | 'anchor-check'
  | 'ambiguity-check'
  | 'tool-order-check'
  | 'progress-check'
  | 'no-loss-check'
  | 'decoy-check'
  | 'dead-object-check'
  | 'value-presence-check'
  | 'unreachable-mechanism-check';

export interface LintFinding {
  lint: LintId;
  level: 'error' | 'warning';
  message: string;
  subjectIds: string[];
}

export interface LintReport {
  /** true si aucun finding de niveau error */
  pass: boolean;
  findings: LintFinding[];
}

export interface ValidationResult {
  solvable: boolean;
  solve: SolveResult;
  lints: LintReport;
  metrics: DifficultyMetrics;
}

export interface Hint {
  puzzleId: string;
  level: 1 | 2 | 3 | 4;
  text: string;
}
