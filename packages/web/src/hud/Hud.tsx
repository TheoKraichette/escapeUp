import { useEffect, useRef, useState } from 'react';
import type { ClientObjectView, ClientRoomView, Hint } from '@escapeup/engine';
import { FAMILY_GLYPH } from './affordances';

/**
 * Astuce une-fois : s'affiche 6 s au premier déclenchement (persisté en
 * localStorage — jamais re-montrée aux parties suivantes).
 */
function useOneTimeTip(key: string, trigger: boolean): boolean {
  const [show, setShow] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    if (!trigger || done.current) return;
    done.current = true;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, '1');
    } catch {
      /* stockage indisponible : astuce quand même montrée cette fois */
    }
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 6000);
    return () => window.clearTimeout(t);
  }, [trigger, key]);
  return show;
}

/** Rôle affiché sous un objet d'inventaire : dit ce qu'on peut EN FAIRE. */
function inventoryRole(o: ClientObjectView): string | null {
  if (o.affordances.includes('combine')) return 'à assembler';
  if (o.affordances.includes('use_on')) return 's’utilise sur…';
  return null;
}

/**
 * Objets restant à traiter dans une zone : mécanismes non résolus + objets
 * ramassables encore posés. Les documents sont EXCLUS (leur lecture ne change
 * pas leur état : le compteur ne redescendrait jamais). Données 100 % issues
 * de la client view — rien de plus que ce que le serveur expose.
 */
function remainingInZone(view: ClientRoomView, zoneId: string): number {
  return view.objects.filter((o) => {
    const loc = o.location;
    if (typeof loc !== 'object' || loc === null || !('zoneId' in loc)) return false;
    if (loc.zoneId !== zoneId) return false;
    if (o.family === 'mechanism') return o.state !== 'open' && o.state !== 'activated';
    return o.family === 'instrument'; // encore posé = pas encore pris
  }).length;
}

interface Props {
  view: ClientRoomView;
  theme: string;
  focusIndex: number;
  onFocusZone: (index: number) => void;
  inventoryObjects: ClientObjectView[];
  combineSelection: string[];
  onToggleCombine: (id: string) => void;
  onCombine: () => void;
  onHint: () => void;
  hint: Hint | null;
  onDismissHint: () => void;
  busy: boolean;
  /** salle du jour : affiche le chronomètre (le temps du classement) */
  isDaily: boolean;
  /** début de la partie côté client (informatif ; le classement fait foi serveur) */
  startedAtMs: number;
}

/** Chronomètre discret (m:ss), rafraîchi à la seconde. */
function Chrono({ startedAtMs }: { startedAtMs: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  return (
    <span className="progress-badge" title="Temps de la salle du jour">
      ⏱ {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

export function Hud({
  view,
  theme,
  focusIndex,
  onFocusZone,
  inventoryObjects,
  combineSelection,
  onToggleCombine,
  onCombine,
  onHint,
  hint,
  onDismissHint,
  busy,
  isDaily,
  startedAtMs,
}: Props) {
  const accessibleZones = view.zones.filter((z) => z.accessible);
  const tipInventory = useOneTimeTip('escapeup.tip.inventaire', inventoryObjects.length > 0);
  const tipNotebook = useOneTimeTip('escapeup.tip.carnet', view.notebook.length > 0);

  return (
    <div className="hud">
      <div className="topbar">
        <div className="objective">
          <div className="theme">{theme}</div>
          <div className="title">{view.title}</div>
          <div className="goal">{view.playerObjective}</div>
        </div>

        <div className="topbar-right">
          <div className="zonebar">
            {accessibleZones.map((z, i) => {
              const remaining = remainingInZone(view, z.id);
              return (
                <button
                  key={z.id}
                  className={`chip ${i === focusIndex ? 'on' : ''}`}
                  onClick={() => onFocusZone(i)}
                  title="Mécanismes et objets restants dans cette zone"
                >
                  {z.name}
                  {remaining > 0 ? (
                    <span className="count"> · {remaining}</span>
                  ) : (
                    <span className="count done"> ✓</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="hint-btn">
            {isDaily && <Chrono startedAtMs={startedAtMs} />}
            <span className="progress-badge">
              Énigmes {view.solvedPuzzles.length}/{view.puzzleCount}
            </span>
            <button onClick={onHint} disabled={busy}>
              Indice
            </button>
          </div>
        </div>
      </div>

      {/* L'indice vit dans sa PROPRE couche (au-dessus de tous les panneaux) :
          dans la topbar, il finissait recouvert par la sidebar de droite. */}
      {hint && (
        <div className="hint-banner">
          <span className="hint-level">Indice {hint.level}/4</span>
          <span className="hint-text">{hint.text}</span>
          <button className="close" onClick={onDismissHint} aria-label="Fermer l’indice">
            ×
          </button>
        </div>
      )}

      <div className="sidebar">
        <div className={`card ${tipInventory ? 'flash' : ''}`} style={{ flex: '0 0 auto', maxHeight: '46%' }}>
          <h3>Inventaire</h3>
          {tipInventory && (
            <div className="tip-callout">
              Vos trouvailles se rangent ici — certaines pièces s&rsquo;assemblent.
            </div>
          )}
          <div className="body">
            {inventoryObjects.length === 0 ? (
              <div className="empty">Vide — fouillez la salle.</div>
            ) : (
              <>
                <div className="inv-grid">
                  {inventoryObjects.map((o) => {
                    const role = inventoryRole(o);
                    return (
                      <div
                        key={o.id}
                        className={`inv-item ${combineSelection.includes(o.id) ? 'sel' : ''}`}
                        onClick={() => onToggleCombine(o.id)}
                        title={o.description}
                      >
                        <span className="glyph">{FAMILY_GLYPH[o.family]}</span>
                        <span>{o.name}</span>
                        {role && <span className="role">{role}</span>}
                      </div>
                    );
                  })}
                </div>
                {combineSelection.length === 1 && (
                  <div className="combine-help">
                    Sélectionnez une seconde pièce pour les assembler.
                  </div>
                )}
                {combineSelection.length >= 2 && (
                  <button
                    className="primary"
                    style={{ width: '100%', marginTop: 10 }}
                    disabled={busy}
                    onClick={onCombine}
                  >
                    Combiner ({combineSelection.length})
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className={`card ${tipNotebook ? 'flash' : ''}`} style={{ flex: '1 1 auto', minHeight: 0 }}>
          <h3>Carnet</h3>
          {tipNotebook && (
            <div className="tip-callout">Tout ce que vous lisez est consigné ici.</div>
          )}
          <div className="body">
            {view.notebook.length === 0 ? (
              <div className="empty">Aucune note. Lisez, examinez, déduisez.</div>
            ) : (
              view.notebook.map((n, i) => (
                <div className="note" key={`${n.nodeId}-${i}`}>
                  <div className="src">Indice</div>
                  {n.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="controls-hint">
        <kbd>Z</kbd>
        <kbd>Q</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd>
        <span>se déplacer&nbsp;•&nbsp;<b>glisser</b> : regarder&nbsp;•&nbsp;<b>clic</b> : interagir</span>
      </div>
    </div>
  );
}
