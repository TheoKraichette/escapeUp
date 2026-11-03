import { useEffect, useRef, useState } from 'react';
import type { GameEvent } from '@escapeup/engine';

export interface Toast {
  id: number;
  kind: 'good' | 'bad' | 'info';
  text: string;
}

/** Traduit un GameEvent du moteur en toast lisible (ou null si silencieux). */
export function toastFromEvent(ev: GameEvent, nextId: () => number): Toast | null {
  switch (ev.type) {
    case 'text':
      return { id: nextId(), kind: 'info', text: ev.text };
    case 'info_gained':
      return { id: nextId(), kind: 'good', text: `Noté : ${ev.text}` };
    case 'item_taken':
      return { id: nextId(), kind: 'good', text: 'Objet récupéré.' };
    case 'object_revealed':
      return { id: nextId(), kind: 'info', text: 'Quelque chose est apparu…' };
    case 'puzzle_solved':
      return { id: nextId(), kind: 'good', text: 'Énigme résolue !' };
    case 'state_changed':
      return { id: nextId(), kind: 'good', text: ev.label };
    case 'zone_unlocked':
      return { id: nextId(), kind: 'good', text: 'Une nouvelle zone est accessible !' };
    case 'goal_reached':
      return { id: nextId(), kind: 'good', text: 'Vous vous échappez !' };
    case 'failure':
      return { id: nextId(), kind: 'bad', text: ev.message };
    case 'noop':
      return { id: nextId(), kind: 'info', text: ev.message };
    default:
      return null;
  }
}

interface Props {
  toasts: Toast[];
  onExpire: (id: number) => void;
}

export function EventLog({ toasts, onExpire }: Props) {
  // Un timer PAR toast, armé une seule fois à son apparition : re-rendre la
  // liste ne remet pas le compte à rebours des toasts déjà affichés.
  // Expiration en deux temps : fondu de sortie (classe .out, 180 ms) PUIS
  // retrait réel de la liste (onExpire).
  const scheduled = useRef(new Map<number, number>());
  const [leaving, setLeaving] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    const timers = scheduled.current;
    for (const t of toasts) {
      if (timers.has(t.id)) continue;
      timers.set(
        t.id,
        window.setTimeout(() => {
          setLeaving((prev) => new Set(prev).add(t.id));
          timers.set(
            t.id,
            window.setTimeout(() => {
              timers.delete(t.id);
              setLeaving((prev) => {
                const next = new Set(prev);
                next.delete(t.id);
                return next;
              });
              onExpire(t.id);
            }, 180),
          );
        }, 4200),
      );
    }
  }, [toasts, onExpire]);
  useEffect(() => {
    const timers = scheduled.current;
    return () => {
      for (const id of timers.values()) window.clearTimeout(id);
      timers.clear();
    };
  }, []);

  return (
    <div className="eventlog">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind} ${leaving.has(t.id) ? 'out' : ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
