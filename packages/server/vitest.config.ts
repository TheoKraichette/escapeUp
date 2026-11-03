import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// @escapeup/engine est un package workspace en TypeScript pur (main = src/index.ts).
// On l'alias vers sa source pour que Vite le transforme au lieu de l'externaliser
// comme une dépendance node_modules.
export default defineConfig({
  resolve: {
    alias: {
      '@escapeup/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
