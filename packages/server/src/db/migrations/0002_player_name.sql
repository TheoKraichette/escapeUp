-- 0002_player_name — pseudo joueur facultatif (sessions + classement quotidien).
-- Idempotent : IF NOT EXISTS partout, re-jouable sans dommage.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS player_name text;
ALTER TABLE daily_leaderboard ADD COLUMN IF NOT EXISTS player_name text;
