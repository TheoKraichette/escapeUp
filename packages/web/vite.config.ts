import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE compat : zustand v5 (installé) n'a pas d'export par défaut, mais
// @react-three/fiber v8 fait `import create from 'zustand'`. On redirige le
// specifier NU `zustand` vers un shim local (regex ancrée pour ne pas toucher
// aux subpaths `zustand/react` et `zustand/vanilla`). Voir src/shims/zustand.ts.
const zustandShim = fileURLToPath(new URL('./src/shims/zustand.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^zustand$/, replacement: zustandShim }],
  },
  build: {
    // Chunks vendeurs : three.js (le plus lourd), l'écosystème R3F, le
    // post-processing, et le reste. La Scene est en plus chargée paresseusement
    // (React.lazy).
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          postfx: ['@react-three/postprocessing', 'postprocessing'],
        },
      },
    },
    chunkSizeWarningLimit: 800, // three.js seul reste sous cette limite
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
