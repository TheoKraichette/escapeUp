import { useEffect, useState } from 'react';
import type { ClientRoomView } from '@escapeup/engine';
import { getDailyLeaderboard, type DailyLeaderboard } from '../api';
import { Confetti } from './Confetti';

/** Compte-à-rebours montant (0 → cible, easeOutCubic) pour les stats. */
function useCountUp(target: number, ms = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = -1;
    const step = (now: number) => {
      if (start < 0) start = now;
      const k = Math.min((now - start) / ms, 1);
      setValue(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export interface RunStats {
  /** durée de la partie en secondes (depuis le début ou la reprise) */
  seconds: number;
  /** nombre d'actions envoyées au serveur */
  actions: number;
  /** nombre d'indices demandés */
  hints: number;
  seed: string;
  difficulty: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

interface Props {
  view: ClientRoomView;
  stats: RunStats;
  /** session serveur (null en démo hors-ligne) */
  sessionId: string | null;
  /** true si la partie jouée est la salle du jour → classement affiché */
  isDaily: boolean;
  /** thème choisi EXPLICITEMENT à la création (undefined = auto) : repris par le défi */
  chosenTheme?: string;
  onReplay: () => void;
}

export function Victory({ view, stats, sessionId, isDaily, chosenTheme, onReplay }: Props) {
  const [copied, setCopied] = useState(false);
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [board, setBoard] = useState<DailyLeaderboard | null>(null);
  const [boardLoading, setBoardLoading] = useState(isDaily && Boolean(sessionId));

  const shownSeconds = useCountUp(stats.seconds);
  const shownActions = useCountUp(stats.actions);
  const shownHints = useCountUp(stats.hints);

  // Classement du jour (temps AUTORITAIRE serveur) — seulement pour la daily.
  useEffect(() => {
    if (!isDaily || !sessionId) return;
    let cancelled = false;
    getDailyLeaderboard(sessionId)
      .then((b) => {
        if (!cancelled) setBoard(b);
      })
      .catch(() => undefined) // le classement est un bonus : silencieux si absent
      .finally(() => {
        if (!cancelled) setBoardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDaily, sessionId]);

  const yourRank = board?.entries.find((e) => e.you)?.rank;

  const copySeed = () => {
    void navigator.clipboard
      ?.writeText(stats.seed)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => undefined);
  };

  // Lien de défi : la même salle exactement (seed + difficulté + thème choisi).
  const copyChallenge = () => {
    const qs = new URLSearchParams({ seed: stats.seed, difficulty: stats.difficulty });
    if (chosenTheme) qs.set('theme', chosenTheme);
    const url = `${window.location.origin}${window.location.pathname}?${qs.toString()}`;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setChallengeCopied(true);
        window.setTimeout(() => setChallengeCopied(false), 1800);
      })
      .catch(() => undefined);
  };

  return (
    <div className="overlay">
      <Confetti />
      <div className="panel-lg win-panel">
        <div className="win-badge">Évasion réussie</div>
        <h1 style={{ marginTop: 12 }}>{view.title}</h1>
        <div className="epilogue">{view.epilogue ?? 'Vous êtes libre.'}</div>

        <div className="stats-row">
          <div className="stat">
            <div className="stat-value">{formatDuration(shownSeconds)}</div>
            <div className="stat-label">Temps</div>
          </div>
          <div className="stat">
            <div className="stat-value">{Math.round(shownActions)}</div>
            <div className="stat-label">Actions</div>
          </div>
          <div className="stat">
            <div className="stat-value">{Math.round(shownHints)}</div>
            <div className="stat-label">Indices</div>
          </div>
        </div>

        {boardLoading && <div className="spinner">Chargement du classement…</div>}
        {board && board.entries.length > 0 && (
          <div className="lb">
            <div className="lb-title">
              Classement du jour{yourRank ? ` — vous êtes ${yourRank === 1 ? '1ᵉʳ' : `${yourRank}ᵉ`} sur ${board.total}` : ''}
            </div>
            {yourRank === 1 && (
              <div className="lb-compare">
                <span className="trophy">🏆</span> Vous signez le meilleur temps du jour !
              </div>
            )}
            {yourRank !== undefined && yourRank > 1 && board.entries[0] && (
              <div className="lb-compare">
                Meilleur temps : {formatDuration(board.entries[0].durationMs / 1000)} — le vôtre :{' '}
                {formatDuration((board.entries.find((e) => e.you)?.durationMs ?? 0) / 1000)}
              </div>
            )}
            {board.entries.map((e, i) => (
              <div
                key={e.rank}
                className={`lb-row ${e.you ? 'you' : ''}`}
                style={{ animationDelay: `${600 + i * 90}ms` }}
              >
                <span className="lb-rank">{e.rank}</span>
                <span className="lb-name">{e.player ?? 'Anonyme'}</span>
                <span className="lb-time">{formatDuration(e.durationMs / 1000)}</span>
                <span className="lb-hints">{e.hintsUsed > 0 ? `${e.hintsUsed} indice${e.hintsUsed > 1 ? 's' : ''}` : 'sans indice'}</span>
              </div>
            ))}
          </div>
        )}

        <div className="seed-line">
          Seed <code>{stats.seed}</code> · {stats.difficulty} · {view.theme}
          <button className="chip" onClick={copySeed} style={{ marginLeft: 8 }}>
            {copied ? 'Copié !' : 'Copier la seed'}
          </button>
        </div>

        <div className="cta-row">
          <button className="primary" onClick={onReplay}>
            Nouvelle salle
          </button>
          <button onClick={copyChallenge}>
            {challengeCopied ? 'Lien copié !' : 'Défier un ami'}
          </button>
        </div>
      </div>
    </div>
  );
}
