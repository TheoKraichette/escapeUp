-- 0001_init — tables sessions & daily_leaderboard (docs/04-API.md).
-- Idempotent : IF NOT EXISTS partout, re-jouable sans dommage.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed         text NOT NULL,
  difficulty   text NOT NULL,                 -- 'easy' | 'medium' | 'hard'
  theme        text,                          -- NULL = thème auto-résolu depuis la seed
  player_state jsonb NOT NULL,                 -- PlayerState sérialisé
  goal_reached boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_leaderboard (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed        text NOT NULL,
  session_id  uuid NOT NULL REFERENCES sessions(id),
  duration_ms integer NOT NULL,
  hints_used  integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_leaderboard_seed_duration_idx
  ON daily_leaderboard (seed, duration_ms);
