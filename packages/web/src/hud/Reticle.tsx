import type { ClientObjectView } from '@escapeup/engine';
import { primaryVerb } from './affordances';

interface Props {
  /** objet interactif actuellement devant le joueur (sonde de visée), sinon null */
  obj: ClientObjectView | null;
}

/**
 * Réticule central : point discret au repos ; l'anneau s'ouvre et s'étiquette
 * (« lire — Registre du port ») quand un objet interactif est devant le
 * joueur. C'est un indicateur d'ORIENTATION — le clic, lui, se fait au curseur.
 */
export function Reticle({ obj }: Props) {
  const solved = obj?.state === 'open' || obj?.state === 'activated';
  return (
    <div className={`reticle ${obj ? 'active' : ''} ${solved ? 'solved' : ''}`}>
      <div className="dot" />
      <div className="ring" />
      {obj && (
        <div className="tag">
          <span className="verb">{primaryVerb(obj)}</span> — {obj.name}
        </div>
      )}
    </div>
  );
}
