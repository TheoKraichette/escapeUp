// Shim de compatibilité zustand.
// L'install de cet environnement fournit zustand v5 (export nommé `create`, sans
// export par défaut), or @react-three/fiber v8 fait `import create from 'zustand'`
// (export par défaut, façon zustand v4). On ne peut PAS réinstaller ici, donc on
// alias le specifier nu `zustand` vers ce module (voir vite.config.ts) qui :
//   - ré-exporte toute l'API nommée de zustand v5 (react + vanilla) ;
//   - ajoute l'export par défaut `create` attendu par fiber ;
//   - garantit une méthode `destroy()` sur le store (retirée en v5) pour éviter
//     un crash si un chemin fiber l'appelle.
// Les subpaths ('zustand/react', 'zustand/vanilla') ne sont PAS aliasés : ils
// résolvent le vrai paquet, donc aucune boucle.

import { create as createV5 } from 'zustand/react';

export * from 'zustand/react';
export * from 'zustand/vanilla';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => any;

function withDestroy<T>(store: T): T {
  const s = store as unknown as { destroy?: AnyFn };
  if (s && typeof s.destroy !== 'function') s.destroy = () => {};
  return store;
}

// Reproduit le `create` par défaut de zustand v4 (forme directe et curryfiée).
const create = ((createState?: AnyFn) => {
  if (createState === undefined) {
    return (cs: AnyFn) => withDestroy((createV5 as unknown as AnyFn)(cs));
  }
  return withDestroy((createV5 as unknown as AnyFn)(createState));
}) as typeof createV5;

export { create };
export default create;
