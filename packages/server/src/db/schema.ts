// Schéma Drizzle — miroir typé des tables décrites dans docs/04-API.md §"Schéma de base".
// drizzle-kit n'est PAS utilisé : le DDL réel vit dans db/migrations/*.sql. Ce schéma
// sert au typage des requêtes (db.insert/select) côté serveur.

import { pgTable, uuid, text, jsonb, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';
import type { Difficulty, PlayerState } from '@escapeup/engine';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  seed: text('seed').notNull(),
  difficulty: text('difficulty').$type<Difficulty>().notNull(),
  theme: text('theme'), // nullable : NULL = thème auto-résolu à la génération depuis la seed
  playerName: text('player_name'), // nullable : NULL = joueur anonyme
  playerState: jsonb('player_state').$type<PlayerState>().notNull(),
  goalReached: boolean('goal_reached').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dailyLeaderboard = pgTable(
  'daily_leaderboard',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seed: text('seed').notNull(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    playerName: text('player_name'), // nullable : NULL = joueur anonyme
    durationMs: integer('duration_ms').notNull(),
    hintsUsed: integer('hints_used').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('daily_leaderboard_seed_duration_idx').on(t.seed, t.durationMs)],
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type LeaderboardRow = typeof dailyLeaderboard.$inferSelect;
