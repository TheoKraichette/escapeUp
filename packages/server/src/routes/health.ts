import type { FastifyInstance } from 'fastify';
import { pingDb } from '../db/client';

export function registerHealth(app: FastifyInstance): void {
  app.get('/api/health', async (_req, reply) => {
    const up = await pingDb();
    return reply.code(200).send({ status: 'ok', db: up ? 'up' : 'down' });
  });
}
