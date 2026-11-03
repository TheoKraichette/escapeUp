// Bootstrap : construit l'app et écoute. PORT (défaut 3000), host 0.0.0.0.
// La logique de jeu vit dans @escapeup/engine ; ce serveur est autoritaire et fin.

import { buildApp } from './app';
import { closeDb } from './db/client';
import { applyMigrations } from './db/migrate';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Codes d'erreur « transitoires » : Postgres pas encore prêt à accepter des
 * connexions. On ne réessaie QUE sur ceux-là (ou une erreur sans SQLSTATE, donc
 * probablement réseau). Une erreur portant un autre SQLSTATE (SQL invalide,
 * droits insuffisants…) est PERMANENTE : la réessayer 10× ne fait que masquer
 * le vrai problème pendant ~13 s.
 */
const TRANSIENT_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  '57P03', // cannot_connect_now : le SGBD démarre
  '08000',
  '08001',
  '08003',
  '08004',
  '08006', // classe 08 : connection_exception
  '53300', // too_many_connections
]);

function isTransient(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return true; // pas de SQLSTATE → souci de connexion probable
  return TRANSIENT_CODES.has(code);
}

/**
 * Applique les migrations au démarrage pour que le conteneur soit autonome.
 * Postgres peut refuser les connexions quelques instants après `pg_isready` :
 * on réessaie avec un léger back-off, mais UNIQUEMENT sur une erreur de
 * connexion — une erreur permanente est propagée immédiatement.
 */
async function migrateWithRetry(attempts = 10, delayMs = 1500): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await applyMigrations();
      const applied = r.applied.join(', ') || '(aucune)';
      console.log(`[migrate] appliquées: ${applied} | déjà présentes: ${r.skipped.length}`);
      return;
    } catch (err) {
      if (!isTransient(err)) throw err; // erreur permanente : échouer vite
      if (i === attempts) throw err;
      console.warn(
        `[migrate] Postgres injoignable (tentative ${i}/${attempts}), nouvel essai dans ${delayMs}ms…`,
      );
      await sleep(delayMs);
    }
  }
}

async function main(): Promise<void> {
  await migrateWithRetry();
  const app = await buildApp({ logger: true });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Signal ${signal} reçu, arrêt…`);
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port, host });
    app.log.info(`EscapeUp server à l'écoute sur http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Tout échec de démarrage (migration définitivement en échec, buildApp, écoute)
// → log clair + fermeture propre du pool + sortie 1, plutôt qu'un rejet de
// promesse non géré. Symétrique avec le try/catch autour de `app.listen`.
main().catch(async (err) => {
  console.error('[server] échec au démarrage :', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
