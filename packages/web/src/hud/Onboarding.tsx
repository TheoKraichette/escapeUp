// Onboarding interactif de première partie : overlay de bienvenue (schéma des
// contrôles en CSS pur) puis checklist dont chaque étape se valide PAR L'ACTION
// du joueur (bouger → regarder → cliquer un objet). Une fois complété, plus
// jamais montré (localStorage). L'aide reste accessible à tout moment (bouton
// « ? », touche ? ou F1).
import { useEffect, useRef, useState } from 'react';
import { playSound } from '../audio';

const KEY = 'escapeup.onboarding';

function seen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'v1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(KEY, 'v1');
  } catch {
    /* stockage indisponible : le tutoriel reviendra, sans conséquence */
  }
}

/** Schéma clavier/souris en CSS pur — partagé entre l'overlay de bienvenue et
 *  l'aide persistante. */
export function ControlsCard() {
  return (
    <div className="controls-card">
      <div className="ctrl">
        <div className="keys-grid">
          <kbd>Z</kbd>
          <div className="keys-row">
            <kbd>Q</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
          </div>
        </div>
        <div className="ctrl-lbl">
          Se déplacer
          <span>ou WASD / flèches</span>
        </div>
      </div>
      <div className="ctrl">
        <div className="mouse">
          <div className="mouse-wheel" />
          <div className="mouse-arrows">⟷</div>
        </div>
        <div className="ctrl-lbl">
          Regarder
          <span>cliquer-glisser</span>
        </div>
      </div>
      <div className="ctrl">
        <div className="mouse click">
          <div className="mouse-wheel" />
        </div>
        <div className="ctrl-lbl">
          Interagir
          <span>clic sur un objet</span>
        </div>
      </div>
    </div>
  );
}

/** Touches de déplacement — mêmes touches que FirstPersonControls (Scene). */
const MOVE_KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'z',
  'q',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
]);

type Phase = 'welcome' | 'checklist' | 'done' | 'hidden';

interface Props {
  /** objectif de la salle (affiché dans l'overlay de bienvenue) */
  objective: string;
  /** true dès que le joueur a sélectionné un objet ou envoyé une action */
  interacted: boolean;
}

export function Onboarding({ objective, interacted }: Props) {
  const [phase, setPhase] = useState<Phase>(() => (seen() ? 'hidden' : 'welcome'));
  const [moved, setMoved] = useState(false);
  const [looked, setLooked] = useState(false);

  // Étape ① « déplacez-vous » : écouteur ADDITIF, sans preventDefault — aucun
  // conflit possible avec le contrôleur première personne.
  useEffect(() => {
    if (phase !== 'checklist' || moved) return;
    const down = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.key.toLowerCase())) setMoved(true);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [phase, moved]);

  // Étape ② « regardez autour » : cumul de glissement pointeur ≥ 40 px.
  useEffect(() => {
    if (phase !== 'checklist' || looked) return;
    let last: { x: number; y: number } | null = null;
    let total = 0;
    const onDown = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!last) return;
      total += Math.hypot(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      if (total >= 40) setLooked(true);
    };
    const onUp = () => {
      last = null;
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [phase, looked]);

  // Son à chaque validation ; fin de tutoriel quand tout est coché.
  const prevDone = useRef(0);
  useEffect(() => {
    if (phase !== 'checklist') return;
    const done = (moved ? 1 : 0) + (looked ? 1 : 0) + (interacted ? 1 : 0);
    if (done > prevDone.current) {
      prevDone.current = done;
      playSound('click');
    }
    if (moved && looked && interacted) {
      markSeen();
      setPhase('done');
    }
  }, [phase, moved, looked, interacted]);

  // La pastille « terminé » s'efface seule après 2,2 s.
  useEffect(() => {
    if (phase !== 'done') return;
    const t = window.setTimeout(() => setPhase('hidden'), 2200);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === 'hidden') return null;

  if (phase === 'welcome') {
    return (
      <div className="onboarding-overlay">
        <div className="onboarding-panel">
          <h2>Bienvenue</h2>
          <p className="ob-objective">{objective}</p>
          <ControlsCard />
          <div className="cta-row">
            <button className="primary" onClick={() => setPhase('checklist')}>
              C&rsquo;est parti
            </button>
            <button
              className="ghost"
              onClick={() => {
                markSeen();
                setPhase('hidden');
              }}
            >
              Passer le tutoriel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-steps">
      {phase === 'done' ? (
        <div className="ob-step ok">Tutoriel terminé ✓</div>
      ) : (
        <>
          <div className={`ob-step ${moved ? 'ok' : ''}`}>
            {moved ? '✓' : '①'} Déplacez-vous — <kbd>Z</kbd>
            <kbd>Q</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
          </div>
          {moved && (
            <div className={`ob-step ${looked ? 'ok' : ''}`}>
              {looked ? '✓' : '②'} Regardez autour — cliquer-glisser
            </div>
          )}
          {moved && looked && (
            <div className={`ob-step ${interacted ? 'ok' : ''}`}>
              {interacted ? '✓' : '③'} Approchez-vous d&rsquo;un objet : quand l&rsquo;anneau
              s&rsquo;allume, cliquez
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Bouton d'aide persistant (coin bas-droit) + overlay des contrôles.
 *  Raccourcis : « ? » ou F1 pour ouvrir/fermer, Échap pour fermer. */
export function HelpButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true)
      );
    };
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (isTyping()) return;
      if (e.key === '?' || e.key === 'F1') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  return (
    <>
      <button title="Aide — contrôles (touche ?)" onClick={() => setOpen((o) => !o)}>
        ?
      </button>
      {open && (
        <div className="help-overlay" onClick={() => setOpen(false)}>
          <div className="onboarding-panel" onClick={(e) => e.stopPropagation()}>
            <h2>Contrôles</h2>
            <ControlsCard />
            <div className="cta-row">
              <button className="primary" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
