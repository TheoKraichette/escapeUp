# EscapeUp

Moteur de génération d'**escape rooms infinies**, jouables en ligne. Chaque salle est produite depuis une graine (*seed*) : narration implicite, objets, puzzles et codes sont générés — jamais scriptés — et la solvabilité est **garantie par construction** puis prouvée par un solveur automatique.

## Idée centrale

> On ne cache pas des indices en espérant que la salle soit solvable.
> On génère d'abord le **graphe de solution** (un DAG de dépendances), puis on le déguise en salle.

Pipeline : `seed → scénario → squelette de zones → graphe de solution (à rebours depuis l'objectif) → habillage thématique → placement → validation (solveur + lints de fairness) → JSON`.

## Documentation

| Document | Contenu |
|----------|---------|
| [docs/01-GDD.md](docs/01-GDD.md) | **Phase 1 — Game Design Document** : core loop, piliers, taxonomie des 10 templates de puzzles, système d'objets, Règles d'or de fairness, difficulté, hints, anti-frustration |
| [docs/02-ARCHITECTURE.md](docs/02-ARCHITECTURE.md) | **Phase 2 — Architecture technique** : moteur pur déterministe, modèle de données TypeScript, algorithme de génération à rebours, validateur (solveur + 9 lints), theme packs, API serveur autoritaire, couche IA future |
| [docs/03-EXEMPLE-SALLE.md](docs/03-EXEMPLE-SALLE.md) | **Phase 3 — Exemple complet** : salle « Protocole P-7 » (seed `LAB-7C42`), graphe, objets, dérivations des 6 puzzles, trace du solveur et walkthrough |
| [examples/salle-labo-7C42.json](examples/salle-labo-7C42.json) | Le `RoomSpec` machine complet de la salle exemple, conforme au schéma de la Phase 2 |

## Monorepo

| Package | Rôle |
|---------|------|
| `packages/engine` | Moteur pur et déterministe : génération, validation, runtime (zéro dépendance) |
| `packages/server` | API Fastify autoritaire + sessions Postgres (Drizzle) |
| `packages/web` | Client 3D — React + Three.js / React Three Fiber (salles procédurales) |

## Démarrage

Prérequis : Node ≥ 22, pnpm, Docker.

```bash
pnpm install        # dépendances (déjà fait si node_modules présent)
pnpm setup          # démarre Postgres (Docker) + applique les migrations
pnpm dev            # serveur (:3000) + client 3D (:5173) en parallèle
# → ouvrir http://localhost:5173
```

`DATABASE_URL` a un défaut local (`postgres://escapeup:escapeup@localhost:5432/escapeup`),
donc rien à configurer pour jouer en local.

Autres commandes :

```bash
pnpm test           # tous les tests (moteur 58 · serveur 9)
pnpm typecheck      # typecheck des 3 packages
pnpm db:up          # juste Postgres
pnpm docker:up      # stack entièrement conteneurisée (web sur :8080)
```

> Astuce Windows : `pnpm` peut être lent (Defender). Pour un run direct :
> `node_modules/.bin/vitest run packages/engine` ou `node_modules/.bin/tsc --noEmit -p packages/<pkg>/tsconfig.json`.

## État du projet

**Stack complète implémentée, testée et intégrée de bout en bout.**

- ✅ **Moteur** — génération procédurale déterministe, validation (solveur + 9 lints
  de fairness *durcis en filet indépendant*), runtime autoritaire. **Les 10 templates
  de puzzles sont câblés** (dont `tool_reveal` et `combine_items` : assemblage d'objets
  et outil révélateur). **4 theme packs** : laboratoire, navire, manoir, bunker.
  58 tests ; fuzz de 1500 salles (500 × easy/medium/hard) 100 % solvables ;
  déterminisme octet-pour-octet ; aucune fuite de solution. Vérifié de façon adversariale.
- ✅ **Lisibilité joueur (playtest humain)** — **noms d'objets uniques par salle**
  (tirage sans remise + qualificatif de secours), **clés étiquetées par couleur**
  reprise sur la plaque de leur porte (association clé ↔ serrure sans essai-erreur),
  composants d'assemblage toujours distincts, **textes de découverte variés**
  (registres, ouvertures de mécanismes…), mécanisme final visiblement **relié au
  verrou de la sortie**, vocabulaires enrichis (16 POI et 9 documents par thème).
  Outil de design : `npx tsx packages/engine/scripts/playtest.ts <seed> <diff> [theme]`
  rejoue une salle et affiche tout ce que le joueur lit.
- ✅ **Vraies énigmes (medium/hard)** — le déchiffrement, la déduction logique et
  l'observation ne « donnent » plus la réponse : **message en glyphes + table à
  appliquer soi-même**, **candidats + contraintes éliminatoires réelles**,
  **anagramme guidée par périphrase** (easy garde des formes douces). Un
  **filet de dérivabilité** (value-presence-check étendu) REJOUE mécaniquement
  chaque déduction et refuse toute salle dont les indices ne reconstruisent pas
  la solution. 8 mots + périphrases par thème.
- ✅ **Expérience de jeu** — les **notes du carnet pertinentes s'affichent à côté
  du pavé de saisie** (fini l'aller-retour carnet ↔ verrou), **progression
  « Énigmes x/y »**, mini-tutoriel de première partie, aide d'usage par objet
  (« pièce à assembler », « s'utilise sur… »), suggestion d'indice après 3 échecs.
  **Ambiance sonore procédurale par thème** (drone + tic-tac/houle/ventilation,
  zéro asset), **silhouettes de mécanismes différenciées** (porte à battant,
  boîtier à clavier, console à barillets, pupitre, panneau à révéler), habillage
  3D identitaire par thème (néons, hublots, lambris, bandes de danger).
  **Compétition** : chrono sur la salle du jour, **lien « Défier un ami »**
  (relance exactement la même salle), comparaison au meilleur temps du jour.
- ✅ **Équilibrage (retour joueur)** — medium enrichi en largeur (7-8 puzzles,
  profondeur 6-7, deux variantes structurelles : assemblage de composants 2/3,
  outil révélateur 1/3) ; hard moins punitif (profondeur critique fixe à 8 au
  lieu de 8-10, richesse reportée sur 10 puzzles et 3 branches parallèles).
- ✅ **Serveur** — Fastify + Drizzle + Postgres, API conforme à [docs/04-API.md](docs/04-API.md),
  redaction systématique via `deriveClientView`. **Classement de la salle du jour**
  (durée autoritaire serveur, pseudo optionnel, `GET /api/daily/leaderboard`,
  aucun sessionId exposé). 12 tests sur Postgres réel.
- ✅ **Client 3D** — React + Three.js / React Three Fiber : salles 3D procédurales
  navigables, objets interactifs par famille, HUD (objectif/inventaire/carnet/indices),
  **audio procédural Web Audio** (zéro asset, bouton mute persistant), **poussière
  volumétrique**, **porte physique verrouillée** visible au bout de la dernière zone
  (battant fermé + plaque du nom de la zone suivante) qui s'ouvre avec un **flash
  lumineux** au déverrouillage, **secousse du panneau** en cas de mauvais code,
  **choix du thème et pseudo** à la création, **statistiques de fin de partie**
  (temps, actions, indices, seed copiable) et **classement du jour** sur l'écran de
  victoire, **suggestion d'indice** après 3 échecs sur un même mécanisme.
  Code-splitting : l'écran d'accueil pèse ~29 kB ; Three.js/R3F sont des chunks
  séparés chargés au lancement d'une partie.
- ✅ **Intégration e2e** — harnais serveur *in-process* (`packages/server/scripts/e2e-local.ts`) :
  parcours complet via HTTP jusqu'à la sortie (y compris `combine` et `use_on` sur
  le fil) sur easy/medium×2/hard + salle du jour, anti-fuite vérifiée sur chaque
  réponse, classement du jour vérifié sur le fil.
