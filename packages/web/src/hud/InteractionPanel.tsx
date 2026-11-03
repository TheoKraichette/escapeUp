import { useEffect, useState } from 'react';
import type { Action, ClientObjectView, MechanismControls, NotebookEntry } from '@escapeup/engine';
import { FAMILY_LABEL } from './affordances';

interface Props {
  obj: ClientObjectView;
  inventoryObjects: ClientObjectView[];
  /** carnet du joueur : les notes liées au verrou s'affichent près de la saisie */
  notebook: NotebookEntry[];
  busy: boolean;
  /** incrémenté à chaque échec d'action : secoue brièvement le panneau */
  failSeq?: number;
  /** objet concerné par le dernier échec : seul SON panneau tremble */
  failObjectId?: string;
  onAction: (action: Action) => void;
  onClose: () => void;
}

/** Normalisation pour rapprocher note ↔ ancre (casse + accents). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Notes du carnet qui mentionnent l'un des repères donnés (ancre, options…). */
function relevantNotes(notebook: NotebookEntry[], needles: string[]): NotebookEntry[] {
  const keys = needles.map(norm).filter((k) => k.length > 1);
  if (keys.length === 0) return [];
  return notebook.filter((n) => {
    const t = norm(n.text);
    return keys.some((k) => t.includes(k));
  });
}

/** Bloc « vos notes » affiché au-dessus d'un pavé de saisie. */
function NotesAside({ entries }: { entries: NotebookEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="notes-aside">
      <div className="lbl">Vos notes sur ce verrou</div>
      {entries.map((n, i) => (
        <div key={`${n.nodeId}-${i}`} className="note-line">
          {n.text}
        </div>
      ))}
    </div>
  );
}

type Mode = 'menu' | 'code' | 'sequence' | 'useon';

const AFF_LABEL: Record<string, string> = {
  inspect: 'Examiner',
  read: 'Lire',
  take: 'Prendre',
  activate: 'Activer',
  enter_code: 'Entrer un code',
  enter_sequence: 'Entrer une séquence',
  use_on: 'Utiliser un objet',
  combine: 'Combiner',
};

/** Phrase d'aide : À QUOI SERT cet objet (retour joueur : usages peu lisibles). */
function usageHint(obj: ClientObjectView): string | null {
  if (obj.family === 'instrument') {
    if (obj.affordances.includes('combine')) {
      return 'Pièce à assembler : dans l’inventaire, sélectionnez-la avec une autre pièce, puis « Combiner ».';
    }
    if (obj.affordances.includes('use_on')) {
      return 'S’utilise sur un élément de la salle : ouvrez la cible, puis « Utiliser un objet ».';
    }
  }
  if (obj.controls?.kind === 'use_target') {
    return 'Un objet de votre inventaire pourrait révéler ce que cache cette surface.';
  }
  if (obj.controls?.kind === 'keyhole') {
    return 'S’ouvre avec la clé dont l’étiquette correspond à la mention de la plaque.';
  }
  return null;
}

export function InteractionPanel({
  obj,
  inventoryObjects,
  notebook,
  busy,
  failSeq = 0,
  failObjectId = '',
  onAction,
  onClose,
}: Props) {
  const [mode, setMode] = useState<Mode>('menu');
  const [shaking, setShaking] = useState(false);

  // Mécanisme déjà résolu : plus rien à saisir (le serveur l'ignorerait).
  const solved = obj.state === 'open' || obj.state === 'activated';

  // Un clic ouvre DIRECTEMENT la bonne interface (simplicité) : le pavé de
  // code, le constructeur de séquence ou le choix d'outil — le menu ne sert
  // que de repli (bouton Retour) ou quand il n'y a rien à saisir.
  useEffect(() => {
    const c = obj.controls;
    const isSolved = obj.state === 'open' || obj.state === 'activated';
    if (isSolved) setMode('menu');
    else if (c?.kind === 'code' && obj.affordances.includes('enter_code')) setMode('code');
    else if (c?.kind === 'sequence' && obj.affordances.includes('enter_sequence')) setMode('sequence');
    else if ((c?.kind === 'keyhole' || c?.kind === 'use_target') && obj.affordances.includes('use_on'))
      setMode('useon');
    else setMode('menu');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.id]);

  // Au succès (l'objet passe à « ouvert » pendant que le panneau est affiché),
  // referme le pavé de saisie : sans ça, le keypad restait utilisable.
  useEffect(() => {
    if (solved) setMode('menu');
  }, [solved]);

  // Secousse brève à chaque échec (mauvais code, mauvaise séquence…) — mais
  // uniquement si l'échec concerne CET objet (pas un combine raté ailleurs).
  useEffect(() => {
    if (failSeq === 0 || failObjectId !== obj.id) return;
    setShaking(true);
    const id = window.setTimeout(() => setShaking(false), 420);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failSeq]);

  const controls = obj.controls;

  return (
    <div className={`interact ${shaking ? 'shake' : ''}`}>
      <header>
        <div>
          <div className="fam">{FAMILY_LABEL[obj.family]}</div>
          <div className="name">{obj.name}</div>
        </div>
        <button className="close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </header>
      <div className="desc">{obj.description}</div>

      {mode === 'menu' && (
        <>
          {solved && <div className="unlocked-badge">✓ Déverrouillé</div>}
          {!solved && usageHint(obj) && <div className="usage-hint">💡 {usageHint(obj)}</div>}
          <div className="actions">
            {/* 'combine' se joue depuis l'inventaire ; un mécanisme résolu ne
                propose plus ses affordances de saisie (code/séquence/outil). */}
            {obj.affordances
              .filter((aff) => aff !== 'combine')
              .filter(
                (aff) =>
                  !solved ||
                  (aff !== 'enter_code' &&
                    aff !== 'enter_sequence' &&
                    aff !== 'use_on' &&
                    aff !== 'activate'),
              )
              .map((aff) => (
                <button
                  key={aff}
                  disabled={busy}
                  onClick={() => handleAff(aff)}
                  className={aff === 'enter_code' || aff === 'enter_sequence' ? 'primary' : ''}
                >
                  {AFF_LABEL[aff] ?? aff}
                </button>
              ))}
          </div>
        </>
      )}

      {mode === 'code' && controls?.kind === 'code' && (
        <>
          <NotesAside entries={relevantNotes(notebook, controls.label ? [controls.label] : [])} />
          <Keypad
            controls={controls}
            busy={busy}
            onCancel={() => setMode('menu')}
            onSubmit={(code) => onAction({ type: 'enter_code', objectId: obj.id, code })}
          />
        </>
      )}

      {mode === 'sequence' && controls?.kind === 'sequence' && (
        <>
          <NotesAside
            entries={relevantNotes(
              notebook,
              controls.options.map((o) => o.label),
            )}
          />
          <SequenceBuilder
            controls={controls}
            busy={busy}
            onCancel={() => setMode('menu')}
            onSubmit={(steps) => onAction({ type: 'enter_sequence', objectId: obj.id, steps })}
          />
        </>
      )}

      {mode === 'useon' && (
        <UseOnChooser
          target={obj}
          tools={inventoryObjects}
          busy={busy}
          onCancel={() => setMode('menu')}
          onSubmit={(toolId) =>
            onAction({ type: 'use_on', toolObjectId: toolId, targetObjectId: obj.id })
          }
        />
      )}
    </div>
  );

  function handleAff(aff: string) {
    switch (aff) {
      case 'inspect':
        onAction({ type: 'inspect', objectId: obj.id });
        break;
      case 'read':
        onAction({ type: 'read', objectId: obj.id });
        break;
      case 'take':
        onAction({ type: 'take', objectId: obj.id });
        break;
      case 'activate':
        onAction({ type: 'activate', objectId: obj.id });
        break;
      case 'enter_code':
        setMode('code');
        break;
      case 'enter_sequence':
        setMode('sequence');
        break;
      case 'use_on':
        setMode('useon');
        break;
      default:
        break;
    }
  }
}

// ————————————————————————————————— Pavé de code —————————————————————————————————

function Keypad({
  controls,
  busy,
  onSubmit,
  onCancel,
}: {
  controls: Extract<MechanismControls, { kind: 'code' }>;
  busy: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const isLetters = controls.alphabet === 'letters';
  const keys = isLetters
    ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  const press = (k: string) => {
    if (value.length >= controls.length) return;
    setValue(value + k);
  };
  const ready = value.length === controls.length;
  const placeholder = '•'.repeat(Math.max(0, controls.length - value.length));

  return (
    <div className={`keypad ${isLetters ? 'letters' : ''}`}>
      {controls.label && <div className="lbl">{controls.label}</div>}
      <div className="readout">
        {value}
        <span style={{ opacity: 0.35 }}>{placeholder}</span>
      </div>
      <div className="keys">
        {keys.map((k) => (
          <button key={k} disabled={busy} onClick={() => press(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="actions" style={{ padding: '10px 0 0' }}>
        <button onClick={() => setValue(value.slice(0, -1))} disabled={busy || !value}>
          ⌫ Effacer
        </button>
        <button className="primary" disabled={busy || !ready} onClick={() => onSubmit(value)}>
          Valider
        </button>
        <button onClick={onCancel} disabled={busy}>
          Retour
        </button>
      </div>
    </div>
  );
}

// ————————————————————————————————— Constructeur de séquence —————————————————————————————————

function SequenceBuilder({
  controls,
  busy,
  onSubmit,
  onCancel,
}: {
  controls: Extract<MechanismControls, { kind: 'sequence' }>;
  busy: boolean;
  onSubmit: (steps: string[]) => void;
  onCancel: () => void;
}) {
  const [steps, setSteps] = useState<string[]>([]);
  const labelOf = (id: string) => controls.options.find((o) => o.id === id)?.label ?? id;
  const add = (id: string) => {
    if (steps.length >= controls.slots) return;
    setSteps([...steps, id]);
  };
  const ready = steps.length === controls.slots;
  const slots = Array.from({ length: controls.slots }, (_, i) => i);

  return (
    <div className="seq">
      <div className="slots">
        {slots.map((i) => {
          const s = steps[i];
          return (
            <div key={i} className={`slot ${s ? 'filled' : ''}`}>
              {s ? labelOf(s) : ''}
            </div>
          );
        })}
      </div>
      <div className="opts">
        {controls.options.map((o) => (
          <button key={o.id} disabled={busy || steps.length >= controls.slots} onClick={() => add(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="actions" style={{ padding: '10px 0 0' }}>
        <button onClick={() => setSteps(steps.slice(0, -1))} disabled={busy || !steps.length}>
          ⌫ Annuler
        </button>
        <button className="primary" disabled={busy || !ready} onClick={() => onSubmit(steps)}>
          Valider
        </button>
        <button onClick={onCancel} disabled={busy}>
          Retour
        </button>
      </div>
    </div>
  );
}

// ————————————————————————————————— Choix d'outil (use_on) —————————————————————————————————

function UseOnChooser({
  target,
  tools,
  busy,
  onSubmit,
  onCancel,
}: {
  target: ClientObjectView;
  tools: ClientObjectView[];
  busy: boolean;
  onSubmit: (toolId: string) => void;
  onCancel: () => void;
}) {
  const usable = tools.filter((t) => t.affordances.includes('use_on') || t.family === 'instrument');
  return (
    <div className="chooser">
      {usable.length === 0 && (
        <div className="empty">Aucun objet utilisable dans l'inventaire.</div>
      )}
      {usable.map((t) => (
        <button key={t.id} className="opt" disabled={busy} onClick={() => onSubmit(t.id)}>
          Utiliser « {t.name} » sur {target.name}
        </button>
      ))}
      <button onClick={onCancel} disabled={busy}>
        Retour
      </button>
    </div>
  );
}
