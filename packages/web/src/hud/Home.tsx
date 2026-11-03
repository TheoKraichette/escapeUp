import { useState, type CSSProperties } from 'react';
import type { Difficulty } from '@escapeup/engine';
import { themeSwatch } from '../theme';

interface Props {
  loading: boolean;
  error: string | null;
  resumable: boolean;
  onStart: (difficulty: Difficulty, seed?: string, theme?: string, player?: string) => void;
  onDaily: (difficulty: Difficulty, player?: string) => void;
  onDemo: () => void;
  onResume: () => void;
}

const PLAYER_KEY = 'escapeup.player';

function readPlayer(): string {
  try {
    return window.localStorage.getItem(PLAYER_KEY) ?? '';
  } catch {
    return '';
  }
}

function writePlayer(name: string): void {
  try {
    if (name) window.localStorage.setItem(PLAYER_KEY, name);
    else window.localStorage.removeItem(PLAYER_KEY);
  } catch {
    /* stockage indisponible : sans conséquence */
  }
}

const DIFFS: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Facile' },
  { id: 'medium', label: 'Moyen' },
  { id: 'hard', label: 'Difficile' },
];

/** Thèmes proposés (undefined = tiré de la seed) — alignés sur l'engine. */
const THEMES: { id: string | undefined; label: string }[] = [
  { id: undefined, label: 'Auto' },
  { id: 'laboratoire', label: 'Laboratoire' },
  { id: 'navire', label: 'Navire' },
  { id: 'manoir', label: 'Manoir' },
  { id: 'bunker', label: 'Bunker' },
];

/** Couleurs de fond quand aucun thème n'est choisi (« Auto »). */
const AUTO_SWATCH = { base: '#1d3a52', accent: '#6cd0ff' };

export function Home({ loading, error, resumable, onStart, onDaily, onDemo, onResume }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const [seed, setSeed] = useState('');
  const [player, setPlayer] = useState(() => readPlayer());
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Pseudo nettoyé (le serveur limite à 24 caractères) ; vide = anonyme.
  const cleanPlayer = player.trim().slice(0, 24) || undefined;
  const commitPlayer = () => writePlayer(player.trim().slice(0, 24));

  // Le fond de l'accueil se teinte du thème sélectionné : on VOIT l'ambiance
  // avant de lancer (transition douce via @property, voir styles.css).
  const swatch = theme ? themeSwatch(theme) : AUTO_SWATCH;
  const bgVars = { '--home-a': swatch.base, '--home-b': swatch.accent } as CSSProperties;

  return (
    <div className="overlay home-bg" style={bgVars}>
      <div className="home-dust" />
      <div className="panel-lg home-panel">
        <h1 className="home-title">
          Escape<span className="up">Up</span>
        </h1>
        <div className="sub">Salles d'évasion générées — explorez, déduisez, sortez.</div>

        <div className="field">
          <label>Difficulté</label>
          <div className="row">
            {DIFFS.map((d) => (
              <button
                key={d.id}
                className={`chip ${difficulty === d.id ? 'on' : ''}`}
                onClick={() => setDifficulty(d.id)}
                disabled={loading}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Thème</label>
          <div className="row">
            {THEMES.map((t) => {
              const sw = t.id ? themeSwatch(t.id) : null;
              return (
                <button
                  key={t.label}
                  className={`chip theme-chip ${theme === t.id ? 'on' : ''}`}
                  onClick={() => setTheme(t.id)}
                  disabled={loading}
                >
                  <span
                    className={`swatch ${sw ? '' : 'auto'}`}
                    style={
                      sw
                        ? { background: `linear-gradient(135deg, ${sw.base} 50%, ${sw.accent} 50%)` }
                        : undefined
                    }
                  />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <details
          className="advanced"
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>Options avancées</summary>
          <div className="field">
            <label>Pseudo (classement de la salle du jour)</label>
            <div className="row">
              <input
                type="text"
                value={player}
                maxLength={24}
                placeholder="Anonyme"
                onChange={(e) => setPlayer(e.target.value)}
                onBlur={commitPlayer}
                disabled={loading}
              />
            </div>
          </div>
          <div className="field">
            <label>Seed (optionnel)</label>
            <div className="row">
              <input
                type="text"
                value={seed}
                placeholder="ex. LAB-7C42 — vide = aléatoire"
                onChange={(e) => setSeed(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </details>

        <div className="cta-row">
          <button
            className="primary cta-main"
            disabled={loading}
            onClick={() => {
              commitPlayer();
              onStart(difficulty, seed.trim() || undefined, theme, cleanPlayer);
            }}
          >
            {loading ? 'Génération…' : 'Lancer la partie'}
          </button>
        </div>

        <div className="cta-row">
          <button
            disabled={loading}
            onClick={() => {
              commitPlayer();
              onDaily(difficulty, cleanPlayer);
            }}
          >
            ⏱ Salle du jour
          </button>
          {resumable && (
            <button className="ghost" disabled={loading} onClick={onResume}>
              Reprendre
            </button>
          )}
          <button className="ghost" disabled={loading} onClick={onDemo}>
            Démo hors-ligne
          </button>
        </div>

        <div className="err">{error ?? ''}</div>
      </div>
    </div>
  );
}
