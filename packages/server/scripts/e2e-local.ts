// Harnais e2e LOCAL : monte le serveur IN-PROCESS sur :3000 (aucun process
// détaché → aucun zombie possible sous Windows), rejoue les parcours complets
// de src/e2e/run.ts en processus enfants, vérifie le classement du jour sur le
// fil, puis ferme proprement (app.close + pool pg).
//
//   node_modules/.bin/tsx packages/server/scripts/e2e-local.ts

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app';
import { applyMigrations } from '../src/db/migrate';
import { closeDb } from '../src/db/client';
import { dailySeed, todayISO } from '../src/routes/daily';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const RUN = path.join(ROOT, 'packages', 'server', 'src', 'e2e', 'run.ts');
// 3100 par défaut : coexiste avec la stack Docker qui publie déjà :3000.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;

interface Case {
  label: string;
  seed: string;
  diff: 'easy' | 'medium' | 'hard';
}

const CASES: Case[] = [
  { label: 'easy', seed: 'E2E-V3-EASY', diff: 'easy' },
  { label: 'medium-a', seed: 'E2E-V3-MED-A', diff: 'medium' },
  { label: 'medium-b', seed: 'E2E-V3-MED-B', diff: 'medium' },
  { label: 'hard', seed: 'E2E-V3-HARD', diff: 'hard' },
  // La salle du jour, pour alimenter puis vérifier le classement sur le fil.
  { label: 'daily', seed: dailySeed(todayISO()), diff: 'medium' },
];

function runCase(c: Case): Promise<{ label: string; green: boolean; summary: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TSX_CLI, RUN], {
      cwd: ROOT,
      env: { ...process.env, E2E_SEED: c.seed, E2E_DIFF: c.diff, E2E_BASE: BASE },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('close', () => {
      const m = out.match(/===E2E_SUMMARY_JSON===\s*\n(.*)\n===END===/);
      const summary = m?.[1] ?? '(pas de résumé : ' + out.slice(-300) + ')';
      resolve({ label: c.label, green: summary.includes('"RESULT":"GREEN"'), summary });
    });
  });
}

async function main(): Promise<void> {
  await applyMigrations();
  const app = await buildApp({ logger: false });
  await app.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`[harness] serveur in-process sur :${PORT}`);

  let allGreen = true;
  try {
    for (const c of CASES) {
      const r = await runCase(c);
      allGreen = allGreen && r.green;
      console.log(`[${r.green ? 'GREEN' : 'ISSUES'}] ${r.label} — ${r.summary}`);
    }

    // Classement du jour sur le fil : le cas « daily » vient d'être résolu.
    const res = await fetch(`${BASE}/api/daily/leaderboard`);
    const body = (await res.json()) as {
      date: string;
      entries: { rank: number; player: string | null; durationMs: number; you: boolean }[];
      total: number;
    };
    const lbOk =
      res.status === 200 &&
      Array.isArray(body.entries) &&
      body.entries.length >= 1 &&
      body.entries[0]!.rank === 1 &&
      typeof body.entries[0]!.durationMs === 'number' &&
      !JSON.stringify(body.entries).includes('sessionId');
    allGreen = allGreen && lbOk;
    console.log(
      `[${lbOk ? 'GREEN' : 'ISSUES'}] leaderboard — ${body.entries.length} entrée(s) du ${body.date}, total=${body.total}`,
    );
  } finally {
    await app.close();
    await closeDb();
  }

  console.log(allGreen ? '\n=== E2E: ALL GREEN ===' : '\n=== E2E: ISSUES ===');
  process.exit(allGreen ? 0 : 1);
}

main().catch((err) => {
  console.error('[harness] échec :', err);
  process.exit(1);
});
