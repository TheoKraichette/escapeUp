// Pool 'pg' partagé + instance Drizzle, lus depuis DATABASE_URL.
// Un seul Pool par processus (Fastify + tests le réutilisent).

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export const DEFAULT_DATABASE_URL = 'postgres://escapeup:escapeup@localhost:5432/escapeup';

export const connectionString = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

export const pool = new pg.Pool({ connectionString });

export const db = drizzle(pool, { schema });

/** Sonde de disponibilité utilisée par GET /api/health. */
export async function pingDb(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/** Ferme le pool (arrêt propre / fin des tests). */
export async function closeDb(): Promise<void> {
  await pool.end();
}
