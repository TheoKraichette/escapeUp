// ============================================================================
// AUDIO PROCÉDURAL — Web Audio pur, zéro asset (cohérent avec le rendu 100 %
// procédural). Chaque son est une courte enveloppe d'oscillateurs.
// Le mute persiste en localStorage ; l'AudioContext est créé paresseusement
// (politique d'autoplay : il faut une interaction utilisateur préalable).
// ============================================================================

const STORAGE_KEY = 'escapeup.muted';

let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    window.localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
  } catch {
    /* stockage indisponible : sans conséquence */
  }
  // L'ambiance en cours suit immédiatement le mute (interrupteur maître).
  if (ambience) ambience.master.gain.value = m ? 0 : 1;
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Une note : fréquence (Hz), départ (s, relatif), durée (s), timbre, gain. */
interface Note {
  f: number;
  t: number;
  d: number;
  type?: OscillatorType;
  g?: number;
}

function play(notes: Note[]): void {
  if (muted) return;
  const ac = ensureCtx();
  if (!ac) return;
  const now = ac.currentTime;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.f, now + n.t);
    const peak = n.g ?? 0.1;
    gain.gain.setValueAtTime(0, now + n.t);
    gain.gain.linearRampToValueAtTime(peak, now + n.t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + n.t);
    osc.stop(now + n.t + n.d + 0.05);
  }
}

export type SoundKind =
  | 'click'
  | 'pickup'
  | 'info'
  | 'reveal'
  | 'success'
  | 'failure'
  | 'unlock'
  | 'victory'
  | 'door'
  | 'latch';

const SOUNDS: Record<SoundKind, Note[]> = {
  click: [{ f: 880, t: 0, d: 0.05, type: 'triangle', g: 0.04 }],
  pickup: [
    { f: 660, t: 0, d: 0.07, type: 'triangle', g: 0.08 },
    { f: 990, t: 0.06, d: 0.09, type: 'triangle', g: 0.08 },
  ],
  info: [{ f: 523, t: 0, d: 0.14, type: 'sine', g: 0.07 }],
  reveal: [
    { f: 1175, t: 0, d: 0.1, type: 'sine', g: 0.05 },
    { f: 1568, t: 0.07, d: 0.12, type: 'sine', g: 0.05 },
  ],
  success: [
    { f: 523, t: 0, d: 0.14, type: 'triangle', g: 0.09 },
    { f: 659, t: 0.08, d: 0.14, type: 'triangle', g: 0.09 },
    { f: 784, t: 0.16, d: 0.2, type: 'triangle', g: 0.09 },
  ],
  failure: [
    { f: 220, t: 0, d: 0.12, type: 'sawtooth', g: 0.05 },
    { f: 165, t: 0.1, d: 0.18, type: 'sawtooth', g: 0.05 },
  ],
  unlock: [
    { f: 392, t: 0, d: 0.12, type: 'triangle', g: 0.09 },
    { f: 494, t: 0.08, d: 0.12, type: 'triangle', g: 0.09 },
    { f: 587, t: 0.16, d: 0.12, type: 'triangle', g: 0.09 },
    { f: 784, t: 0.24, d: 0.24, type: 'triangle', g: 0.09 },
  ],
  victory: [
    { f: 523, t: 0, d: 0.16, type: 'triangle', g: 0.1 },
    { f: 659, t: 0.12, d: 0.16, type: 'triangle', g: 0.1 },
    { f: 784, t: 0.24, d: 0.16, type: 'triangle', g: 0.1 },
    { f: 1047, t: 0.36, d: 0.4, type: 'triangle', g: 0.1 },
    { f: 784, t: 0.52, d: 0.3, type: 'sine', g: 0.06 },
  ],
  // grincement grave d'un battant qui pivote
  door: [
    { f: 140, t: 0, d: 0.14, type: 'sawtooth', g: 0.05 },
    { f: 105, t: 0.1, d: 0.18, type: 'sawtooth', g: 0.05 },
    { f: 82, t: 0.22, d: 0.25, type: 'sawtooth', g: 0.04 },
  ],
  // claquement métallique d'un loquet qui cède
  latch: [
    { f: 1250, t: 0, d: 0.03, type: 'triangle', g: 0.06 },
    { f: 420, t: 0.03, d: 0.08, type: 'triangle', g: 0.05 },
  ],
};

export function playSound(kind: SoundKind): void {
  play(SOUNDS[kind]);
}

/** Priorité décroissante : un lot d'événements ne joue QUE son son le plus fort. */
const EVENT_SOUND_PRIORITY: [string, SoundKind][] = [
  ['goal_reached', 'victory'],
  ['zone_unlocked', 'unlock'],
  ['puzzle_solved', 'success'],
  ['failure', 'failure'],
  ['item_taken', 'pickup'],
  ['object_revealed', 'reveal'],
  ['info_gained', 'info'],
];

/** Joue le son du GameEvent le plus marquant du lot (évite la cacophonie). */
export function playForEvents(types: string[]): void {
  const set = new Set(types);
  for (const [evType, sound] of EVENT_SOUND_PRIORITY) {
    if (set.has(evType)) {
      playSound(sound);
      return;
    }
  }
}

// ============================================================================
// AMBIANCE PAR THÈME — nappe continue très discrète (drones/bruit filtré) +
// événements ponctuels espacés (bip d'instrument, craquement de coque, tic-tac,
// ventilation). 100 % procédural, interrompu par stopAmbience(), suit le mute.
// ============================================================================

interface Ambience {
  master: GainNode;
  stops: Array<() => void>;
  timers: number[];
}

let ambience: Ambience | null = null;

export function stopAmbience(): void {
  if (!ambience) return;
  for (const t of ambience.timers) window.clearInterval(t);
  for (const stop of ambience.stops) {
    try {
      stop();
    } catch {
      /* nœud déjà arrêté */
    }
  }
  try {
    ambience.master.disconnect();
  } catch {
    /* déjà déconnecté */
  }
  ambience = null;
}

export function startAmbience(theme: string): void {
  stopAmbience();
  const ac = ensureCtx();
  if (!ac) return;

  const master = ac.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ac.destination);
  const amb: Ambience = { master, stops: [], timers: [] };
  ambience = amb;

  /** Nappe continue : oscillateur (+ éventuel trémolo lent, façon houle). */
  const drone = (f: number, type: OscillatorType, g: number, lfoHz?: number) => {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    const gain = ac.createGain();
    gain.gain.value = g;
    if (lfoHz) {
      const lfo = ac.createOscillator();
      lfo.frequency.value = lfoHz;
      const depth = ac.createGain();
      depth.gain.value = g * 0.6;
      lfo.connect(depth).connect(gain.gain);
      lfo.start();
      amb.stops.push(() => lfo.stop());
    }
    osc.connect(gain).connect(master);
    osc.start();
    amb.stops.push(() => osc.stop());
  };

  /** Bruit blanc filtré en boucle (ventilation, rumeur de mer…). */
  const noise = (freq: number, q: number, g: number) => {
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ac.createGain();
    gain.gain.value = g;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    amb.stops.push(() => src.stop());
  };

  /** Motif ponctuel répété (les notes passent par le master → mute respecté). */
  const motif = (notes: Note[], everyMs: number) => {
    const playOnce = () => {
      if (!ambience || ambience !== amb) return;
      // Contexte suspendu (autoplay refusé tant qu'aucun geste utilisateur) :
      // currentTime est GELÉ — programmer ici accumulerait des nœuds qui
      // partiraient tous en rafale à la reprise. On saute ce battement.
      if (ac.state !== 'running') return;
      const now = ac.currentTime;
      for (const n of notes) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = n.type ?? 'sine';
        osc.frequency.setValueAtTime(n.f, now + n.t);
        gain.gain.setValueAtTime(0, now + n.t);
        gain.gain.linearRampToValueAtTime(n.g ?? 0.02, now + n.t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
        osc.connect(gain).connect(master);
        osc.start(now + n.t);
        osc.stop(now + n.t + n.d + 0.05);
      }
    };
    amb.timers.push(window.setInterval(playOnce, everyMs));
  };

  switch (theme) {
    case 'laboratoire':
      drone(120, 'sine', 0.016);
      drone(240, 'sine', 0.007);
      motif([{ f: 1320, t: 0, d: 0.08, type: 'sine', g: 0.02 }], 12000);
      break;
    case 'navire':
      drone(55, 'sine', 0.028, 0.07); // houle lente
      noise(180, 0.6, 0.009);
      motif(
        [
          { f: 95, t: 0, d: 0.25, type: 'sawtooth', g: 0.028 },
          { f: 70, t: 0.12, d: 0.3, type: 'sawtooth', g: 0.02 },
        ],
        10500,
      );
      break;
    case 'manoir':
      drone(65, 'sine', 0.009);
      // tic-tac : deux timbres alternés à la seconde
      motif([{ f: 950, t: 0, d: 0.03, type: 'triangle', g: 0.013 }], 2000);
      motif([{ f: 720, t: 1, d: 0.03, type: 'triangle', g: 0.011 }], 2000);
      break;
    case 'bunker':
      noise(320, 1.2, 0.014); // ventilation
      drone(90, 'sine', 0.011);
      motif(
        [
          { f: 1150, t: 0, d: 0.05, type: 'sine', g: 0.022 },
          { f: 700, t: 0.06, d: 0.09, type: 'sine', g: 0.016 },
        ],
        8500,
      );
      break;
    default:
      drone(85, 'sine', 0.014);
      break;
  }
}
