// Point d'entrée public du moteur EscapeUp.
// Les signatures exportées ici sont le contrat consommé par le serveur et le client.

export * from './types';
export { createRng, type Rng } from './rng';

export { generateRoom } from './generate/index';
export { validateRoom, solveRoom, lintRoom, computeMetrics } from './validate/index';
export {
  createInitialState,
  applyAction,
  deriveClientView,
  getHint,
} from './runtime/index';
