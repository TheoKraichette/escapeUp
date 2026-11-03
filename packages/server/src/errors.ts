// Erreurs applicatives → format d'erreur commun docs/04-API.md :
//   { "error": { "code": "...", "message": "..." } }

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'SESSION_NOT_FOUND'
  | 'ROOM_GENERATION_FAILED'
  | 'INTERNAL';

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toBody(): { error: { code: ErrorCode; message: string } } {
    return { error: { code: this.code, message: this.message } };
  }
}

export const errors = {
  validation: (message: string): ApiError => new ApiError('VALIDATION_ERROR', 400, message),
  sessionNotFound: (message = 'Session introuvable.'): ApiError =>
    new ApiError('SESSION_NOT_FOUND', 404, message),
  roomGeneration: (message = 'Échec de génération de la salle.'): ApiError =>
    new ApiError('ROOM_GENERATION_FAILED', 500, message),
  internal: (message = 'Erreur interne.'): ApiError => new ApiError('INTERNAL', 500, message),
};
