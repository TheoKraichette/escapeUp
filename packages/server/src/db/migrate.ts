// Runner de migrations SQL brut (drizzle-kit indisponible).
// Lit db/migrations/*.sql dans l'ordre lexicographique, exécute chaque fichier
// non encore appliqué dans une transaction, et trace l'application dans _migrations.
//
// Usage : DATABASE_URL=... tsx src/db/migrate.ts   (ou `pnpm --filter @escapeup/server db:migrate`)

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DEFAULT_DATABASE_URL } from './client';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/** Applique toutes les migrations en attente. Réutilisable par les tests. */
export async function applyMigrations(connectionString?: string): Promise<MigrationResult> {
  const url = connectionString ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const pool = new pg.Pool({ connectionString: url });
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const { rowCount } = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
      if (rowCount && rowCount > 0) {
        result.skipped.push(file);
        continue;
      }
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql); // fichier multi-instructions (protocole simple, sans params)
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        result.applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
  return result;
}

/** Détecte l'exécution directe (node/tsx src/db/migrate.ts) vs import. */
function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  applyMigrations()
    .then((r) => {
      console.log(
        `[migrate] appliquées: ${r.applied.join(', ') || '(aucune)'} | déjà présentes: ${
          r.skipped.join(', ') || '(aucune)'
        }`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] échec:', err);
      process.exit(1);
    });
}
