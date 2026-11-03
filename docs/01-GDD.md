# EscapeUp — Game Design Document

> **Phase 1** — Moteur de génération d'escape rooms infinies, jouable en ligne.
> Chaque partie est unique, cohérente et solvable **par construction**.

---

## 1. Vision & pitch

EscapeUp n'est pas un jeu avec des niveaux : c'est un **moteur** qui fabrique des escape rooms.
Chaque salle est générée à partir d'une graine (*seed*) : même graine → même salle (partageable, rejouable, « salle du jour »), graine différente → salle différente.

Le cœur du système est une inversion du processus habituel de level design :

> **On ne cache pas des indices en espérant que le puzzle soit solvable.
> On génère d'abord la solution (un graphe de dépendances), puis on la déguise en salle.**

Conséquence : la solvabilité, la cohérence des indices et l'absence d'impasse ne sont pas des propriétés espérées — ce sont des **invariants structurels**, re-vérifiés par un solveur automatique avant que la salle ne soit servie au joueur.

---

## 2. Core loop

```
   ┌──────────────────────────────────────────────────────┐
   │                                                      │
   ▼                                                      │
OBSERVER ──► FOUILLER ──► DÉDUIRE ──► AGIR ──► DÉBLOQUER ─┘
(scène,      (objets,     (croiser    (code,   (zone, objet
 zones)       détails)     indices)    clé,     ou info
                                       combo)   nouvelle)
```

1. Le joueur entre dans la salle, lit le contexte (objectif + ambiance).
2. Il **observe** les zones accessibles et **fouille** les points d'intérêt.
3. Il **collecte** des objets et des informations.
4. Il **croise** les indices pour déduire un code, un ordre, une association.
5. Il **agit** : entre un code, utilise une clé, combine des objets, actionne un mécanisme.
6. Chaque action réussie **débloque** obligatoirement au moins l'un des trois : une zone, un objet, une information.
7. En progressant, il reconstitue l'**histoire implicite** de la salle.
8. Il atteint l'objectif final et sort.

**Boucle de 30 secondes** : observer → tenter → apprendre quelque chose.
**Boucle de 5 minutes** : résoudre un puzzle complet → ouverture visible (porte, coffre, mécanisme).
**Boucle de session (30–45 min)** : comprendre l'histoire → sortir.

---

## 3. Piliers de design

### Pilier 1 — Cohérence totale
Tout élément a une raison d'exister dans le monde :
- une clé ouvre **une** serrure, logiquement située ;
- un code provient **toujours** d'un indice existant dans la salle ;
- une information n'apparaît **jamais** sans source matérielle (document, inscription, objet) ;
- l'histoire implicite **justifie** chaque puzzle (le code du cadenas est une date parce que quelqu'un, dans l'histoire, a choisi cette date).

### Pilier 2 — Génération avant gameplay
Ordre strict du pipeline : **scénario → contraintes logiques → placement → validation**. Le gameplay ne commence que sur une salle prouvée solvable.

### Pilier 3 — Zéro hasard dans la résolution
Aucun puzzle ne se résout en devinant. Toute solution est déductible par : observation, combinaison, logique de code, logique spatiale ou logique narrative. Le brute-force est inutile par design (les indices donnent toujours un chemin plus court que l'essai-erreur).

### Pilier 4 — Aucune impasse
À tout instant, il existe au moins une action utile disponible. Le graphe de dépendances est acyclique et connexe : le joueur ne peut pas se mettre dans un état non gagnant.

---

## 4. Anatomie d'une salle

```
SALLE
├── CONTEXTE
│   ├── Thème            (laboratoire, bunker, hôtel, navire, appartement, …)
│   ├── Histoire implicite (ce qui s'est passé — jamais racontée frontalement)
│   └── Objectif joueur  (sortir / découvrir la vérité / activer un système)
│
├── ZONES (2 à 5)
│   ├── Zone de départ (toujours accessible)
│   └── Zones verrouillées (chaque déverrouillage = jalon de progression)
│
├── POINTS D'INTÉRÊT (par zone)
│   └── Meubles, machines, affichages… contiennent objets et indices
│
├── OBJETS (voir §6)
│
└── PUZZLES (voir §5) — instances de templates paramétrés
```

### L'histoire implicite (narration environnementale)
L'histoire n'est jamais exposée par un narrateur. Elle est **reconstituée** par le joueur à travers les indices, qui ont une double fonction :
1. **fonction ludique** : donner la matière d'un puzzle (une date, un nom, un ordre) ;
2. **fonction narrative** : révéler un fragment de ce qui s'est passé.

Exemple : un rapport d'incident donne à la fois la **date** (code du cadenas) et le **pourquoi** de l'abandon du lieu. C'est cette double fonction qui rend la salle cohérente : l'indice existe parce que l'histoire l'a produit.

---

## 5. Taxonomie des puzzles

Chaque puzzle est un **template paramétrable**. Le générateur choisit un template, le paramètre (valeurs, objets, textes), et le template **produit lui-même ses indices** — c'est ce qui garantit qu'aucun code n'existe sans source.

| # | Template | Principe | Entrées requises | Ce qu'il produit |
|---|----------|----------|------------------|------------------|
| T1 | `key_lock` | Clé physique → serrure | 1 objet clé (placé en amont) | Accès (porte, coffre, tiroir) |
| T2 | `code_from_document` | Un nombre lisible dans un document est le code | 1–2 indices textuels | Ouverture d'un cadenas/coffre à code |
| T3 | `labeled_dial_code` | Le cadran du verrou est **étiqueté** (« ANNÉE », « CHAMBRE N° ») ; l'indice contient la valeur correspondante | 1 indice + 1 étiquette | Ouverture, sans ambiguïté d'interprétation |
| T4 | `tool_reveal` | Un outil révèle une info invisible (lampe UV, loupe, aimant, eau) | 1 outil + 1 support marqué | Information cachée |
| T5 | `combine_items` | Assembler 2–3 objets pour créer l'objet utile (manche + tête d'outil, pile + télécommande) | 2–3 objets | 1 objet fonctionnel |
| T6 | `mechanism_sequence` | Actionner un mécanisme dans un ordre précis (fusibles, leviers, vannes) | 1 indice d'ordre (+ éventuel composant manquant) | Changement d'état du monde (courant, pression…) |
| T7 | `mapping_sequence` | Jointure de 2 indices : l'un donne un **ordre** en termes abstraits, l'autre le **mapping** termes → symboles/valeurs | 2 indices complémentaires | Séquence à entrer sur un panneau |
| T8 | `logic_deduction` | Mini-grille de déduction (3–4 entités × 2 attributs) : « le casier de Marc n'est pas le 2, celui du 3 contient… » | 2–3 indices textuels | Une association (n° de casier, nom, code) |
| T9 | `cipher_substitution` | Message chiffré + table de correspondance présente dans la salle | 1 message + 1 table | Information en clair |
| T10 | `spatial_observation` | La disposition physique encode l'info (nombre d'objets rouges, ordre des tableaux, position des aiguilles) | La scène elle-même + 1 indice de lecture | Un code court |

**Règles de composition** :
- T7 et T8 sont des puzzles « de jointure » : ils exigent des indices situés dans **des zones différentes** → ils créent la convergence en fin de partie.
- T4 et T5 introduisent des **outils** : l'outil est toujours obtenu **avant** (couche strictement antérieure) le support sur lequel il s'applique n'est requis.
- Chaque template déclare formellement : `inputs` (indices/objets consommés), `output` (ce qu'il débloque), `clueSpec` (comment générer ses indices), `fairnessRules` (contraintes d'anti-ambiguïté).

### Extension de contenu
Ajouter un type de puzzle = ajouter un template (données + règles), **sans toucher au moteur**. Idem pour les thèmes (voir *theme packs*, doc d'architecture §5).

---

## 6. Système d'objets

Chaque objet est décrit par :

| Champ | Rôle |
|-------|------|
| `id`, `name`, `description` | Identité et texte affiché |
| `location` | Zone + point d'intérêt (ou `inventory`) |
| `state` | `hidden`, `visible`, `locked`, `taken`, `used`, `broken`… |
| `affordances` | Ce que le joueur peut en faire : `inspect`, `take`, `read`, `use_on`, `combine`, `enter_code`, `activate` |
| `reveals` | Informations ou objets exposés quand on interagit |
| `requires` | Conditions pour interagir (objet en main, état du monde, info connue) |
| `narrativeRole` | Fragment d'histoire que l'objet porte (peut être vide pour le décor) |

**Trois familles fonctionnelles** :
1. **Porteurs d'information** (journal, note, étiquette, affiche, inscription) → produisent des nœuds INFO ;
2. **Instruments** (clé, outil, composant, carte) → produisent des nœuds ITEM ;
3. **Mécanismes** (serrure, cadenas, panneau, tableau électrique, coffre) → consomment des entrées, produisent des ACCÈS ou des ÉTATS.

Le **décor** (objets sans rôle ludique) est autorisé mais **étiqueté comme tel en interne** : le validateur le distingue des indices, et l'UI garantit qu'il ne « brille » pas comme un élément interactif clé (anti pixel-hunting).

---

## 7. Structure de génération (résumé — détail en Phase 2)

```
Seed ──► 1. SCÉNARIO      thème + histoire implicite + objectif
     ──► 2. SQUELETTE     zones en couches (L0 = départ, L1, L2…) + portes entre couches
     ──► 3. GRAPHE        génération À REBOURS depuis l'objectif :
     │                    chaque verrou reçoit un template de puzzle,
     │                    chaque template exige des indices → placés en couche antérieure
     ──► 4. HABILLAGE     nœuds abstraits → objets/textes concrets du thème
     ──► 5. PLACEMENT     distribution dans les zones et points d'intérêt
     ──► 6. VALIDATION    solveur automatique + lints d'ambiguïté
     └──► 7. SÉRIALISATION  JSON de salle (version serveur + version client expurgée)
```

Le point clé : à l'étape 3, un indice requis par un puzzle de la couche N est **toujours placé dans une zone accessible en couche < N** (ou N, si le puzzle est interne à la zone). L'acyclicité est donc garantie **par construction**, pas seulement testée.

---

## 8. Solvabilité & fairness — les Règles d'or

Invariants **durs** (une salle qui en viole un est rejetée et régénérée) :

1. **Toute info a une source** : aucun code, nom, ordre ou association n'est demandé au joueur sans qu'un objet de la salle ne le contienne ou ne permette de le déduire.
2. **Aucun verrou ne garde sa propre clé** : le graphe de dépendances est un DAG (acyclique), vérifié par tri topologique.
3. **Étiquetage anti-ambiguïté** : tout code numérique est ancré par un **label commun** au verrou et à l'indice (le cadran dit « ANNÉE », l'indice contient une année et une seule). Un indice-date ne peut pas alimenter un cadran non étiqueté à 4 chiffres (1987 ? 1203 ? 0312 ?).
4. **Unicité de la solution** : le lint d'ambiguïté vérifie qu'aucune autre valeur plausible du même type n'existe dans les zones accessibles au moment du puzzle (pas deux « années » candidates).
5. **Outil avant usage** : tout outil est obtenable strictement avant que son usage ne soit requis sur le chemin critique.
6. **Progression garantie** : chaque puzzle résolu débloque zone, objet ou info. Jamais de récompense purement cosmétique sur le chemin critique.
7. **Pas d'état perdant** : aucune action ne consomme définitivement une ressource nécessaire ; on ne peut ni casser ni perdre un objet critique.
8. **Faux indices contrôlés** : les leurres (difficulté ≥ élevée uniquement) sont thématiquement justifiés, jamais bloquants, et ne peuvent **pas** produire une valeur candidate pour un verrou actif (ils violeraient la règle 4).

---

## 9. Difficulté

La difficulté est un **budget** que le générateur dépense, mesuré par des métriques calculées sur le graphe :

| Métrique | Facile | Moyen | Difficile |
|----------|--------|-------|-----------|
| Profondeur du graphe (chaîne critique) | 3–4 | 6–7 | 8 |
| Branches parallèles | 1 | 2 | 3 |
| Puzzles de jointure (T7/T8, indices multi-zones) | 0 | 1 | 2 |
| Pas d'inférence max par puzzle (indice → solution) | 1 | 2 | 3 |
| Zones | 2 | 3 | 4–5 |
| Leurres narratifs | 0 | 1 | 1–2 |
| Durée cible | ~15 min | ~40 min | ~60 min |

> **Révision (retour joueur)** : la difficulté du mode Difficile vient désormais de la
> **largeur** (10 puzzles, 3 branches parallèles, assemblage d'objets et outil
> révélateur), non plus d'un pic de profondeur 9–10 jugé punitif — la chaîne
> critique est fixée à 8. Le mode Moyen a gagné en matière (7–8 puzzles dont un
> assemblage de deux composants obtenus en parallèle) sans pic de profondeur.

Le « pas d'inférence » d'un puzzle = nombre de transformations mentales entre l'indice brut et l'action (lire un nombre = 1 ; croiser deux documents = 2 ; croiser + transformer = 3).

---

## 10. Système d'indices progressifs (hints)

Le graphe de solution rend les hints **gratuits à produire** : à tout instant, le moteur connaît la *frontière* (les nœuds atteignables non résolus). Un hint se dérive mécaniquement, en 4 niveaux d'escalade :

1. **Orientation** — « Il reste quelque chose à découvrir dans le bureau d'accueil. »
2. **Focalisation** — « Le tableau d'affichage mérite une lecture attentive. »
3. **Connexion** — « Le mémo parle d'un code de casier ; qui d'autre mentionne un numéro ? »
4. **Solution** — la réponse exacte (avec pénalité de score).

Aucun texte de hint n'est écrit à la main : chaque template de puzzle fournit ses 4 gabarits de hint, instanciés avec les objets concrets de la salle.

## 11. Anti-frustration

- **Pas de pixel-hunting** : tout point d'intérêt interactif est visuellement identifiable ; la fouille est une décision, pas un balayage de pixels.
- **Journal de bord automatique** : indices découverts et codes lus sont consignés dans un carnet consultable (pas de prise de notes obligatoire hors jeu).
- **Feedback d'échec informatif** : un mauvais code → le verrou indique son label (« ce cadran attend une ANNÉE ») plutôt qu'un simple refus.
- **Pas de compte à rebours punitif par défaut** : le chrono mesure la performance (score, classement de la salle du jour), il ne fait pas échouer.

---

## 12. Progression joueur (méta)

- **Salle du jour** : même seed pour tous, classement au temps.
- **Seed libre** : générer, partager, défier un ami sur la même salle.
- **Difficulté croissante** : profils de génération débloqués (facile → expert).
- **Collection narrative** : chaque thème a des fragments d'univers ; finir des salles d'un thème révèle sa méta-histoire (couche optionnelle, hors chemin critique).
