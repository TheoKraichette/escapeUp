# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Le dépôt (code, docs, commentaires) est entièrement en français.

## Projet

EscapeUp génère des escape rooms infinies jouables en ligne. Principe fondateur : on ne cache pas des indices en espérant que la salle soit solvable — on génère d'abord le **graphe de solution** (DAG de dépendances, construit **à rebours depuis l'objectif**), puis on le déguise en salle. La solvabilité est garantie par construction et prouvée par un solveur automatique.

Les specs font foi : `docs/01-GDD.md` (game design), `docs/02-ARCHITECTURE.md` (moteur, modèle de données, pipeline), `docs/03-EXEMPLE-SALLE.md` (salle exemple complète), `docs/04-API.md` (contrat API que le serveur doit respecter, y compris le format d'erreur).

## Commandes

Prérequis : Node ≥ 22, pnpm 11, Docker (pour Postgres).

```bash
pnpm setup          # démarre Postgres (Docker) + applique les migrations
pnpm dev            # serveur Fastify (:3000) + client Vite (:5173) en parallèle
pnpm test           # tous les tests (les tests serveur exigent Postgres démarré)
pnpm typecheck      # tsc --noEmit sur les 3 packages
pnpm db:up          # juste Postgres (docker compose up -d postgres)
pnpm db:migrate     # migrations seules
pnpm docker:up      # stack entièrement conteneurisée (web sur :8090 — 8080 est pris par un autre projet)
```

`DATABASE_URL` a un défaut local (`postgres://escapeup:escapeup@localhost:5432/escapeup`) : rien à configurer en local.

**Windows / Defender** : `pnpm` peut être très lent (filtre temps réel). Préférer les binaires directs depuis la racine (layout `node-linker=hoisted`, imposé par `.npmrc` pour contourner des EPERM de rename — ne pas le retirer) :

```bash
node_modules/.bin/vitest run packages/engine                                  # tests d'un package
node_modules/.bin/vitest run packages/engine/src/__tests__/solver.test.ts     # un seul fichier de test
node_modules/.bin/vitest run packages/engine -t "nom du test"                 # un seul test
node_modules/.bin/tsc --noEmit -p packages/engine/tsconfig.json               # typecheck d'un package
```

Outillage de design et d'intégration :

```bash
npx tsx packages/engine/scripts/playtest.ts <seed> <easy|medium|hard> [theme]  # rejoue une salle, affiche tout ce que le joueur lit
npx tsx packages/engine/scripts/verify-enigmes.ts                              # vérifie la dérivabilité des énigmes
node_modules/.bin/tsx packages/server/scripts/e2e-local.ts                     # e2e complet in-process (port 3100, Postgres requis)
```

## Architecture

Monorepo pnpm à 3 packages. `@escapeup/engine` est consommé **en source TypeScript** (`main: src/index.ts`, aucun build) : le serveur l'exécute via `tsx`, le web le bundle via Vite.

### `packages/engine` — moteur pur et déterministe (zéro dépendance runtime)

Contrat public dans `src/index.ts` : `generateRoom`, `validateRoom`/`solveRoom`/`lintRoom`/`computeMetrics`, et le runtime `createInitialState`/`applyAction`/`deriveClientView`/`getHint`.

- **Génération** (`src/generate/`) : pipeline `scénario → squelette de zones → graphe (à rebours depuis l'objectif) → habillage thématique → placement → validation`, avec boucle de rejet sur seed dérivée (`${seed}#retryN`). Fonction pure : même `(seed, config)` → même `RoomSpec`, **octet pour octet**. Ne jamais introduire de `Date.now()`, `Math.random()` ou d'itération non déterministe — tout aléa passe par le `Rng` seedé (`src/rng.ts`).
- **Validation** (`src/validate/`) : le solveur simule un joueur parfait ; les lints de fairness sont un **filet indépendant** de la construction (dont le value-presence-check qui rejoue mécaniquement chaque déduction pour garantir que les indices reconstruisent la solution). Un fuzz (`__tests__/fuzz.test.ts`) génère des centaines de salles par difficulté : toute modification de la génération doit le laisser 100 % vert.
- **Contenu comme donnée** (`src/content/`) : 10 templates de puzzles (`templates/`) et 4 theme packs (`themes/` : laboratoire, navire, manoir, bunker — vocabulaires, POI, périphrases). Ajouter du contenu = enrichir ces données, pas la logique.
- **Runtime** : machine à états autoritaire. `deriveClientView` expurge tout ce que le joueur n'a pas encore découvert — **aucune solution ne doit jamais transiter vers le client** ; `__tests__/antileak.audit.test.ts` l'audite.

### `packages/server` — API Fastify autoritaire

`src/app.ts` construit l'app (séparé du bootstrap `src/index.ts` pour l'injection en test). Routes dans `src/routes/` (rooms, sessions, daily + leaderboard), persistance Drizzle/Postgres dans `src/db/`, erreurs au format commun de `docs/04-API.md` via `src/errors.ts`. Toute réponse contenant l'état d'une salle passe par `deriveClientView` — c'est l'invariant anti-fuite côté API. Les tests (`src/test/server.test.ts`) tournent sur un vrai Postgres.

### `packages/web` — client 3D React + React Three Fiber

Rendu 3D procédural (`src/three/`), HUD (`src/hud/`), audio procédural Web Audio sans asset (`src/audio.ts`), état zustand. Code-splitting volontaire : l'accueil reste léger, Three/R3F sont des chunks chargés au lancement d'une partie — ne pas importer Three dans l'écran d'accueil.

**Piège** : `src/shims/zustand.ts` aliasé sur le specifier `zustand` dans `vite.config.ts` — compatibilité entre zustand v5 (installé) et @react-three/fiber v8 qui attend l'API v4 (export par défaut + `destroy()`). Ne pas supprimer ni « simplifier » cet alias.

## Pièges d'environnement

- `pnpm-workspace.yaml` : `allowBuilds: esbuild` est requis (pnpm 11 bloque les scripts de build des dépendances) — sans lui, `docker build` échoue.
- Le harnais e2e écoute sur :3100 par défaut pour coexister avec la stack Docker qui publie :3000.
