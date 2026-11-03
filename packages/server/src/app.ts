// Construction de l'app Fastify (séparée du bootstrap pour être injectable en test).

import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { ApiError, errors } from './errors';
import { registerHealth } from './routes/health';
import { registerRooms } from './routes/rooms';
import { registerSessions } from './routes/sessions';
import { registerDaily } from './routes/daily';

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  // CORS ouvert en dev (front Vite sur :5173).
  await app.register(cors, { origin: true });

  // Toutes les erreurs → format commun docs/04-API.md.
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send(err.toBody());
    }
    if (err instanceof ZodError) {
      const detail = err.issues
        .map((i) => `${i.path.join('.') || '(racine)'}: ${i.message}`)
        .join(' ; ');
      return reply.code(400).send(errors.validation(detail).toBody());
    }
    // Corps JSON malformé, etc. → 400 ; sinon 500.
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(400).send(errors.validation(err.message).toBody());
    }
    app.log.error(err);
    return reply.code(500).send(errors.internal().toBody());
  });

  app.setNotFoundHandler((_req, reply) => {
    return reply.code(404).send(errors.sessionNotFound('Route inconnue.').toBody());
  });

  registerHealth(app);
  registerRooms(app);
  registerSessions(app);
  registerDaily(app);

  return app;
}
