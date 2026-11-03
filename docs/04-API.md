# EscapeUp — Contrat d'API HTTP

> Contrat gelé entre `packages/server` (autoritaire) et `packages/web` (client 3D).
> Les types référencés (`ClientRoomView`, `Action`, `GameEvent`, `Hint`, `Difficulty`)
> viennent de `@escapeup/engine` — les deux packages les importent, aucune redéfinition.

## Principes

- **Serveur autoritaire** : le client n'envoie que des *actions* ; le serveur valide,
  applique via `applyAction` du moteur, persiste l'état, et renvoie des *événements* +
  la vue expurgée (`ClientRoomView`). Le client ne reçoit jamais solution/graphe/backstory.
- **Salles re-générables** : une salle n'est pas stockée ; on persiste `(seed, config)`
  et l'état joueur. `generateRoom(seed, config)` étant déterministe, le serveur re-dérive
  la `RoomSpec` à la volée (ou via un cache mémoire LRU par `seed+config`).
- **Sessions** : chaque partie = une ligne `sessions` (id, seed, config, playerState jsonb,
  timestamps). Pas d'auth en V1 : le `sessionId` (UUID) fait office de jeton de reprise.

## Format d'erreur commun

```jsonc
// HTTP 4xx/5xx
{ "error": { "code": "SESSION_NOT_FOUND", "message": "…" } }
```
Codes : `VALIDATION_ERROR` (400), `SESSION_NOT_FOUND` (404), `ROOM_GENERATION_FAILED` (500),
`INTERNAL` (500).

---

## Endpoints

### `POST /api/rooms` — créer une partie
Génère (ou re-dérive) une salle et ouvre une session.

**Requête** (toutes les clés optionnelles) :
```jsonc
{ "seed": "LAB-7C42", "difficulty": "medium", "theme": "laboratoire", "player": "Théo" }
```
- `seed` absent → seed aléatoire dérivée côté serveur (une fois, à la création, puis figée).
- `difficulty` ∈ `"easy" | "medium" | "hard"` (défaut `"medium"`).
- `theme` absent → choisi par le générateur depuis la seed.
- `player` : pseudo affiché au classement (1–24 caractères après trim ; vide → 400) ;
  absent → joueur anonyme (`null`).

**Réponse `201`** :
```jsonc
{
  "sessionId": "uuid",
  "seed": "LAB-7C42",
  "config": { "difficulty": "medium", "theme": "laboratoire" },
  "view": { /* ClientRoomView */ }
}
```

### `GET /api/sessions/:id` — reprendre une partie
**Réponse `200`** : `{ "sessionId", "seed", "config", "view": ClientRoomView }`
`404` si inconnue.

### `POST /api/sessions/:id/actions` — jouer une action
**Requête** : un `Action` du moteur, tel quel. Exemples :
```jsonc
{ "type": "inspect", "objectId": "obj.comptoir" }
{ "type": "read", "objectId": "obj.badge" }
{ "type": "take", "objectId": "obj.cle" }
{ "type": "use_on", "toolObjectId": "obj.lampe_uv", "targetObjectId": "obj.tableau" }
{ "type": "combine", "objectIds": ["obj.manche", "obj.tete"] }
{ "type": "enter_code", "objectId": "obj.casier", "code": "418" }
{ "type": "enter_sequence", "objectId": "obj.panneau", "steps": ["press_triangle","press_circle"] }
{ "type": "activate", "objectId": "obj.levier" }
```

**Réponse `200`** :
```jsonc
{
  "events": [ /* GameEvent[] — résultat de cette action */ ],
  "view": { /* ClientRoomView — état à jour */ }
}
```
Le client anime les `events` (révélation, ouverture, `failure` informatif, `goal_reached`)
puis réconcilie l'affichage sur `view`. `400 VALIDATION_ERROR` si l'action est malformée
ou porte sur un objet inexistant/non-interactif dans l'état courant.

### `POST /api/sessions/:id/hint` — indice progressif
**Requête** : `{ "puzzleId": "p3" }` (optionnel ; sinon le serveur choisit un puzzle de la
frontière courante via le graphe).

**Réponse `200`** : un `Hint` `{ "puzzleId", "level": 1|2|3|4, "text" }`. Le niveau
s'incrémente à chaque appel pour un même puzzle (persisté dans `playerState.hintsUsed`).

### `GET /api/daily` — salle du jour
**Réponse `200`** : `{ "seed", "difficulty", "date": "YYYY-MM-DD" }`.
La seed du jour est **dérivée de la date** (ex. `daily-2026-07-03`), identique pour tous.
Le client enchaîne avec `POST /api/rooms { seed, difficulty }`.

### `GET /api/daily/leaderboard` — classement du jour
**Query** (optionnelle) : `?sessionId=uuid` — marque l'entrée de cette session avec
`"you": true` (valeur non-UUID ignorée silencieusement).

**Réponse `200`** :
```jsonc
{
  "date": "2026-07-07",
  "seed": "daily-2026-07-07",
  "entries": [
    { "rank": 1, "player": "Théo", "durationMs": 183042, "hintsUsed": 1, "you": false }
    // … top 10, trié par durationMs croissant puis ancienneté (created_at)
  ],
  "total": 42
}
```
- `player` peut être `null` (joueur anonyme). Aucun `sessionId` n'est exposé sur le fil.
- Si la session appelante est classée mais **hors** du top 10, son entrée est ajoutée en
  fin de liste avec son vrai `rank` et `"you": true`.
- `total` = nombre total d'entrées du jour (toutes, pas seulement le top).

### `GET /api/health` — sonde
`200 { "status": "ok", "db": "up" | "down" }`.

---

## Schéma de base (Drizzle / Postgres)

```
table sessions
  id           uuid  primary key default gen_random_uuid()
  seed         text  not null
  difficulty   text  not null                 -- 'easy'|'medium'|'hard'
  theme        text                            -- nullable (résolu à la génération)
  player_name  text                            -- nullable (pseudo pour le classement)
  player_state jsonb not null                  -- PlayerState sérialisé
  goal_reached boolean not null default false
  created_at   timestamptz not null default now()
  updated_at   timestamptz not null default now()

table daily_leaderboard        -- V1 minimal, alimenté à goal_reached
  id           uuid primary key default gen_random_uuid()
  seed         text not null
  session_id   uuid not null references sessions(id)
  player_name  text                            -- nullable (copié de la session)
  duration_ms  integer not null
  hints_used   integer not null
  created_at   timestamptz not null default now()
  index (seed, duration_ms)
```

Migrations SQL versionnées dans `packages/server/src/db/migrations/`, appliquées par
`pnpm --filter @escapeup/server db:migrate` (script `src/db/migrate.ts`).

## Notes d'implémentation serveur

- Valider les corps de requête avec **Zod** aux frontières ; l'`Action` reçue est
  re-vérifiée par `applyAction` de toute façon (défense en profondeur).
- Cache mémoire `Map<string, RoomSpec>` clé = `seed|difficulty|theme` pour éviter de
  re-générer à chaque action (la génération est pure, donc sûr à mettre en cache).
- CORS ouvert en dev (`@fastify/cors`) pour le front Vite sur `:5173`.
