// Client HTTP de l'API EscapeUp — contrat gelé dans docs/04-API.md.
// Le serveur est autoritaire : on n'envoie que des Actions, on reçoit des
// GameEvent + une ClientRoomView expurgée. Aucun secret n'est stocké ici.
//
// IMPORTANT : on importe UNIQUEMENT des *types* du moteur (`import type`) — ils
// sont effacés au build, donc aucune logique/secret du moteur n'est embarqué.

import type { Action, ClientRoomView, Difficulty, GameEvent, Hint } from '@escapeup/engine';

/** Config renvoyée par le serveur (theme résolu à la génération). */
export interface RoomConfig {
  difficulty: Difficulty;
  theme?: string;
}

export interface SessionPayload {
  sessionId: string;
  seed: string;
  config: RoomConfig;
  view: ClientRoomView;
}

export interface ActionResponse {
  events: GameEvent[];
  view: ClientRoomView;
}

export interface DailyInfo {
  seed: string;
  difficulty: Difficulty;
  date: string;
}

/** Une ligne du classement du jour (jamais de sessionId d'autrui sur le fil). */
export interface LeaderboardEntry {
  rank: number;
  player: string | null;
  durationMs: number;
  hintsUsed: number;
  you: boolean;
}

export interface DailyLeaderboard {
  date: string;
  seed: string;
  entries: LeaderboardEntry[];
  total: number;
}

export interface CreateRoomBody {
  seed?: string;
  difficulty?: Difficulty;
  theme?: string;
  /** pseudo affiché au classement du jour (optionnel, 1–24 caractères) */
  player?: string;
}

/** Erreur structurée alignée sur le format commun `{ error: { code, message } }`. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (cause) {
    throw new ApiError(
      'NETWORK',
      "Impossible de joindre le serveur EscapeUp. Est-il lancé sur :3000 ?",
      0,
    );
  }

  const text = await res.text();
  const data: unknown = text ? safeParse(text) : undefined;

  if (!res.ok) {
    const err = extractError(data);
    throw new ApiError(err.code, err.message, res.status);
  }
  return data as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractError(data: unknown): { code: string; message: string } {
  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    (data as { error: unknown }).error &&
    typeof (data as { error: unknown }).error === 'object'
  ) {
    const e = (data as { error: { code?: unknown; message?: unknown } }).error;
    return {
      code: typeof e.code === 'string' ? e.code : 'INTERNAL',
      message: typeof e.message === 'string' ? e.message : 'Erreur inconnue.',
    };
  }
  return { code: 'INTERNAL', message: 'Erreur inconnue du serveur.' };
}

// ————————————————————————————————— Endpoints —————————————————————————————————

/** POST /api/rooms — crée une partie (201). */
export function createRoom(body: CreateRoomBody = {}): Promise<SessionPayload> {
  return request<SessionPayload>('/rooms', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** GET /api/sessions/:id — reprendre une partie. */
export function getSession(sessionId: string): Promise<SessionPayload> {
  return request<SessionPayload>(`/sessions/${encodeURIComponent(sessionId)}`);
}

/** POST /api/sessions/:id/actions — jouer une action. */
export function sendAction(sessionId: string, action: Action): Promise<ActionResponse> {
  return request<ActionResponse>(`/sessions/${encodeURIComponent(sessionId)}/actions`, {
    method: 'POST',
    body: JSON.stringify(action),
  });
}

/** POST /api/sessions/:id/hint — indice progressif (le niveau s'incrémente serveur). */
export function getHint(sessionId: string, puzzleId?: string): Promise<Hint> {
  return request<Hint>(`/sessions/${encodeURIComponent(sessionId)}/hint`, {
    method: 'POST',
    body: JSON.stringify(puzzleId ? { puzzleId } : {}),
  });
}

/** GET /api/daily — salle du jour (seed dérivée de la date). */
export function getDaily(): Promise<DailyInfo> {
  return request<DailyInfo>('/daily');
}

/** GET /api/daily/leaderboard — top 10 du jour (+ votre rang via sessionId). */
export function getDailyLeaderboard(sessionId?: string): Promise<DailyLeaderboard> {
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  return request<DailyLeaderboard>(`/daily/leaderboard${qs}`);
}
