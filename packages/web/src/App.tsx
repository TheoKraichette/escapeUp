import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Action,
  ClientObjectView,
  ClientRoomView,
  Difficulty,
  GameEvent,
  Hint,
} from '@escapeup/engine';
import {
  ApiError,
  createRoom,
  getDaily,
  getHint,
  getSession,
  sendAction,
  type RoomConfig,
} from './api';
import { buildLayout } from './layout';
import { paletteFor, uiHueFor } from './theme';
import { MOCK_VIEW } from './mock';
import { isMuted, playForEvents, playSound, setMuted, startAmbience, stopAmbience } from './audio';
import type { CameraShake, ZonePulse } from './three/Scene';
import { Home } from './hud/Home';
import { Hud } from './hud/Hud';
import { InteractionPanel } from './hud/InteractionPanel';
import { HelpButton, Onboarding } from './hud/Onboarding';
import { Reticle } from './hud/Reticle';
import { Victory } from './hud/Victory';
import { EventLog, toastFromEvent, type Toast } from './hud/EventLog';

// Code-splitting : la scène 3D (Three.js + R3F, le gros du bundle) n'est
// chargée qu'au lancement d'une partie — l'écran d'accueil reste léger.
const Scene = lazy(() => import('./three/Scene').then((m) => ({ default: m.Scene })));

const STORAGE_KEY = 'escapeup.session';

interface Session {
  sessionId: string | null; // null = démo hors-ligne (pas de serveur)
  seed: string;
  config: RoomConfig;
  view: ClientRoomView;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [focusIndex, setFocusIndex] = useState(0);
  const [travel, setTravel] = useState<{ index: number; seq: number }>({ index: 0, seq: 0 });
  const [pulse, setPulse] = useState<ZonePulse>({ zoneId: '', seq: 0 });
  const [shake, setShake] = useState<CameraShake>({ seq: 0, force: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aimedId, setAimedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [combineSelection, setCombineSelection] = useState<string[]>([]);
  const [resumable] = useState(() => Boolean(readStored()));

  // Statistiques de partie (locales) + feedback d'échec.
  const startedAt = useRef(Date.now());
  /** instant de la victoire : fige le « Temps » affiché (null = en cours) */
  const finishedAt = useRef<number | null>(null);
  /** garde synchrone anti double-clic (busy est un state, donc asynchrone) */
  const inFlight = useRef(false);
  const [actionCount, setActionCount] = useState(0);
  const [hintCount, setHintCount] = useState(0);
  /** dernier échec : seq pour déclencher, objectId pour ne secouer QUE le bon panneau */
  const [fail, setFail] = useState<{ objectId: string; seq: number }>({ objectId: '', seq: 0 });

  // Anti-frustration : 3 échecs consécutifs sur le MÊME mécanisme → on suggère
  // l'indice (une seule fois par objet, pour ne pas harceler).
  const failStreak = useRef<{ objectId: string | null; count: number; nudged: Set<string> }>({
    objectId: null,
    count: 0,
    nudged: new Set(),
  });

  const toastSeq = useRef(0);
  const nextToastId = () => ++toastSeq.current;

  const pushEvents = useCallback((events: GameEvent[]) => {
    const fresh: Toast[] = [];
    for (const ev of events) {
      const t = toastFromEvent(ev, nextToastId);
      if (t) fresh.push(t);
    }
    if (fresh.length) setToasts((prev) => [...prev, ...fresh].slice(-6));
    playForEvents(events.map((e) => e.type));
  }, []);

  const expireToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ————————————————————————————— Démarrage de partie —————————————————————————————

  const beginSession = (s: Session) => {
    setSession(s);
    setFocusIndex(0);
    setTravel({ index: 0, seq: 0 });
    setPulse({ zoneId: '', seq: 0 });
    setShake({ seq: 0, force: 0 });
    setSelectedId(null);
    setHoveredId(null);
    setHint(null);
    setCombineSelection([]);
    setToasts([]);
    setError(null);
    startedAt.current = Date.now();
    finishedAt.current = s.view.goalReached ? Date.now() : null;
    setActionCount(0);
    setHintCount(0);
    setFail({ objectId: '', seq: 0 });
    failStreak.current = { objectId: null, count: 0, nudged: new Set() };
    if (s.sessionId) writeStored(s.sessionId);
    // Pas d'ambiance sous l'écran de victoire (reprise d'une partie gagnée).
    if (!s.view.goalReached) startAmbience(s.config.theme ?? s.view.theme);
  };

  /** Renvoie true en cas de succès (le lien de défi n'est nettoyé qu'alors). */
  const startRoom = async (
    difficulty: Difficulty,
    seed?: string,
    theme?: string,
    player?: string,
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const r = await createRoom({ difficulty, seed, theme, player });
      beginSession({ sessionId: r.sessionId, seed: r.seed, config: r.config, view: r.view });
      return true;
    } catch (e) {
      setError(describe(e));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const startDaily = async (fallback: Difficulty, player?: string) => {
    setLoading(true);
    setError(null);
    try {
      const daily = await getDaily();
      const r = await createRoom({ seed: daily.seed, difficulty: daily.difficulty ?? fallback, player });
      beginSession({ sessionId: r.sessionId, seed: r.seed, config: r.config, view: r.view });
    } catch (e) {
      setError(describe(e));
    } finally {
      setLoading(false);
    }
  };

  const resume = async () => {
    const id = readStored();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getSession(id);
      beginSession({ sessionId: r.sessionId, seed: r.seed, config: r.config, view: r.view });
    } catch (e) {
      clearStored();
      setError(describe(e));
    } finally {
      setLoading(false);
    }
  };

  // Lien de défi : ?seed=…&difficulty=…[&theme=…] pré-lance la même salle.
  const challengeBoot = useRef(false);
  useEffect(() => {
    if (challengeBoot.current) return;
    challengeBoot.current = true;
    const qs = new URLSearchParams(window.location.search);
    const qSeed = qs.get('seed');
    if (!qSeed) return;
    const qDiff =
      (['easy', 'medium', 'hard'] as const).find((d) => d === qs.get('difficulty')) ?? 'medium';
    const qTheme = qs.get('theme') ?? undefined;
    // L'URL n'est nettoyée qu'en cas de succès : si le serveur est injoignable,
    // un simple rechargement retente le défi.
    void startRoom(qDiff, qSeed, qTheme).then((ok) => {
      if (ok) window.history.replaceState(null, '', window.location.pathname);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDemo = () => {
    beginSession({
      sessionId: null,
      seed: MOCK_VIEW.seed,
      config: { difficulty: 'medium', theme: MOCK_VIEW.theme },
      view: MOCK_VIEW,
    });
  };

  const replay = () => {
    stopAmbience();
    setSession(null);
    setSelectedId(null);
    setHint(null);
    setToasts([]);
  };

  // ————————————————————————————— Actions de jeu —————————————————————————————

  const reconcile = useCallback(
    (view: ClientRoomView, events: GameEvent[]) => {
      pushEvents(events);
      setSession((prev) => (prev ? { ...prev, view } : prev));
      setCombineSelection([]);
      if (events.some((e) => e.type === 'goal_reached')) {
        stopAmbience();
        if (finishedAt.current === null) finishedAt.current = Date.now();
      }

      const failure = events.find((e) => e.type === 'failure');
      if (failure && failure.type === 'failure') {
        setFail((f) => ({ objectId: failure.objectId, seq: f.seq + 1 }));
        setShake((s) => ({ seq: s.seq + 1, force: 1 }));
        // Série d'échecs sur un même mécanisme → suggérer l'indice (1× / objet).
        const fs = failStreak.current;
        fs.count = fs.objectId === failure.objectId ? fs.count + 1 : 1;
        fs.objectId = failure.objectId;
        if (fs.count >= 3 && !fs.nudged.has(failure.objectId)) {
          fs.nudged.add(failure.objectId);
          setToasts((prev) =>
            [
              ...prev,
              {
                id: nextToastId(),
                kind: 'info' as const,
                text: 'Ce mécanisme résiste ? Le bouton « Indice » peut vous remettre sur la piste.',
              },
            ].slice(-6),
          );
        }
      } else if (events.some((e) => e.type === 'puzzle_solved')) {
        failStreak.current.objectId = null;
        failStreak.current.count = 0;
      }

      // Auto-focalisation + flash lumineux sur une zone nouvellement débloquée.
      const unlocked = events.find((e) => e.type === 'zone_unlocked');
      if (unlocked && unlocked.type === 'zone_unlocked') {
        const accessible = view.zones.filter((z) => z.accessible);
        const idx = accessible.findIndex((z) => z.id === unlocked.zoneId);
        if (idx >= 0) setFocusIndex(idx);
        setPulse((p) => ({ zoneId: unlocked.zoneId, seq: p.seq + 1 }));
        // « thump » léger : le déverrouillage se ressent physiquement
        setShake((s) => ({ seq: s.seq + 1, force: 0.5 }));
      }

      // Referme le panneau si l'objet sélectionné a disparu / rejoint l'inventaire.
      setSelectedId((cur) => {
        if (!cur) return cur;
        const still = view.objects.some((o) => o.id === cur) && !view.inventory.includes(cur);
        return still ? cur : null;
      });
    },
    [pushEvents],
  );

  const performAction = useCallback(
    async (action: Action) => {
      if (!session) return;
      if (!session.sessionId) {
        setToasts((prev) =>
          [
            ...prev,
            {
              id: nextToastId(),
              kind: 'info' as const,
              text: 'Mode démo : lancez le serveur pour jouer réellement.',
            },
          ].slice(-6),
        );
        return;
      }
      if (inFlight.current) return; // garde synchrone : un seul envoi à la fois
      inFlight.current = true;
      setBusy(true);
      try {
        const res = await sendAction(session.sessionId, action);
        setActionCount((n) => n + 1);
        reconcile(res.view, res.events);
      } catch (e) {
        setToasts((prev) =>
          [...prev, { id: nextToastId(), kind: 'bad' as const, text: describe(e) }].slice(-6),
        );
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [session, reconcile],
  );

  const requestHint = useCallback(async () => {
    if (!session?.sessionId) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const h = await getHint(session.sessionId);
      setHint(h);
      setHintCount((n) => n + 1);
    } catch (e) {
      setToasts((prev) =>
        [...prev, { id: nextToastId(), kind: 'bad' as const, text: describe(e) }].slice(-6),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [session]);

  const toggleCombine = (id: string) =>
    setCombineSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const doCombine = () => {
    if (combineSelection.length >= 2) void performAction({ type: 'combine', objectIds: combineSelection });
  };

  // ————————————————————————————— Rendu —————————————————————————————

  const view = session?.view;
  const theme = session?.config.theme ?? view?.theme ?? 'default';
  const seed = session?.seed ?? '';
  const layout = useMemo(() => (view ? buildLayout(view) : null), [view]);
  const palette = useMemo(() => paletteFor(theme, seed), [theme, seed]);

  // Teinte UI pilotée par la salle : posée sur <html>, tous les panneaux (HUD,
  // toasts, overlays) dérivent leur fond/bordure de --ui-h / --ui-accent.
  useEffect(() => {
    const root = document.documentElement;
    if (session) {
      root.style.setProperty('--ui-h', String(uiHueFor(theme, seed)));
      root.style.setProperty('--ui-accent', palette.accent);
    } else {
      root.style.removeProperty('--ui-h');
      root.style.removeProperty('--ui-accent');
    }
  }, [session, theme, seed, palette]);

  const inventoryObjects = useMemo<ClientObjectView[]>(() => {
    if (!view) return [];
    return view.inventory
      .map((id) => view.objects.find((o) => o.id === id))
      .filter((o): o is ClientObjectView => Boolean(o));
  }, [view]);

  const selectedObject = useMemo<ClientObjectView | null>(() => {
    if (!view || !selectedId) return null;
    return view.objects.find((o) => o.id === selectedId) ?? null;
  }, [view, selectedId]);

  const aimedObject = useMemo<ClientObjectView | null>(() => {
    if (!view || !aimedId) return null;
    return view.objects.find((o) => o.id === aimedId) ?? null;
  }, [view, aimedId]);

  if (!session || !view || !layout) {
    return (
      <Home
        loading={loading}
        error={error}
        resumable={resumable}
        onStart={startRoom}
        onDaily={startDaily}
        onDemo={startDemo}
        onResume={resume}
      />
    );
  }

  return (
    <>
      <Suspense fallback={<div className="scene-loading">Chargement de la salle 3D…</div>}>
        <Scene
          layout={layout}
          palette={palette}
          themeId={theme}
          focusIndex={focusIndex}
          hoveredId={hoveredId}
          selectedId={selectedId}
          travel={travel}
          pulse={pulse}
          shake={shake}
          onSelect={(o) => {
            playSound('click');
            // Un clic = l'action ÉVIDENTE (simplicité) :
            // objet ramassable → on le prend, document → on le lit tout de suite.
            if (o.family === 'instrument' && o.affordances.includes('take')) {
              void performAction({ type: 'take', objectId: o.id });
              return;
            }
            setSelectedId(o.id);
            if (o.affordances.includes('read')) {
              void performAction({ type: 'read', objectId: o.id });
            }
          }}
          onHover={setHoveredId}
          onDeselect={() => setSelectedId(null)}
          onEnterZone={setFocusIndex}
          onAim={setAimedId}
        />
      </Suspense>

      {!view.goalReached && <Reticle obj={aimedObject} />}

      <Hud
        view={view}
        theme={theme}
        focusIndex={focusIndex}
        onFocusZone={(i) => {
          setFocusIndex(i);
          setSelectedId(null);
          setTravel((t) => ({ index: i, seq: t.seq + 1 }));
        }}
        inventoryObjects={inventoryObjects}
        combineSelection={combineSelection}
        onToggleCombine={toggleCombine}
        onCombine={doCombine}
        onHint={requestHint}
        hint={hint}
        onDismissHint={() => setHint(null)}
        busy={busy}
        isDaily={seed.startsWith('daily-')}
        startedAtMs={startedAt.current}
      />

      {selectedObject && (
        <InteractionPanel
          // key : rejoue l'animation d'entrée et remet l'état interne à zéro
          // à chaque changement d'objet sélectionné
          key={selectedObject.id}
          obj={selectedObject}
          inventoryObjects={inventoryObjects}
          notebook={view.notebook}
          busy={busy}
          failSeq={fail.seq}
          failObjectId={fail.objectId}
          onAction={performAction}
          onClose={() => setSelectedId(null)}
        />
      )}

      <EventLog toasts={toasts} onExpire={expireToast} />

      {!view.goalReached && (
        <Onboarding
          objective={view.playerObjective}
          interacted={selectedId !== null || actionCount > 0}
        />
      )}

      <div className="corner-buttons">
        <HelpButton />
        <MuteButton />
      </div>

      {view.goalReached && (
        <Victory
          view={view}
          stats={{
            // Figé à l'instant de la victoire (sinon il dériverait à chaque re-render).
            seconds: ((finishedAt.current ?? Date.now()) - startedAt.current) / 1000,
            actions: actionCount,
            hints: hintCount,
            seed: seed,
            difficulty: session.config.difficulty,
          }}
          sessionId={session.sessionId}
          isDaily={seed.startsWith('daily-')}
          chosenTheme={session.config.theme}
          onReplay={replay}
        />
      )}
    </>
  );
}

/** Coupe/rétablit les sons procéduraux (préférence persistée). */
function MuteButton() {
  const [muted, setLocalMuted] = useState(() => isMuted());
  return (
    <button
      title={muted ? 'Rétablir le son' : 'Couper le son'}
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setLocalMuted(next);
        if (!next) playSound('click');
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

// ————————————————————————————— Utilitaires —————————————————————————————

function describe(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Erreur inattendue.';
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* stockage indisponible : sans conséquence */
  }
}
function clearStored(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
