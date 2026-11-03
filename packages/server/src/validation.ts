// Schémas Zod aux frontières HTTP. L'Action est de toute façon re-vérifiée par
// applyAction du moteur (défense en profondeur) — ici on rejette tôt le malformé.

import { z } from 'zod';
import type { Action } from '@escapeup/engine';

export const difficultySchema = z.enum(['easy', 'medium', 'hard']);

export const createRoomBodySchema = z
  .object({
    seed: z.string().trim().min(1).max(120).optional(),
    difficulty: difficultySchema.optional(),
    theme: z.string().trim().min(1).max(80).optional(),
    player: z.string().trim().min(1).max(24).optional(),
  })
  .strict();
export type CreateRoomBody = z.infer<typeof createRoomBodySchema>;

const objectId = z.string().trim().min(1);

// Union discriminée alignée 1:1 sur le type Action du moteur.
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('inspect'), objectId }),
  z.object({ type: z.literal('read'), objectId }),
  z.object({ type: z.literal('take'), objectId }),
  z.object({
    type: z.literal('use_on'),
    toolObjectId: objectId,
    targetObjectId: objectId,
  }),
  z.object({ type: z.literal('combine'), objectIds: z.array(objectId).min(2) }),
  z.object({ type: z.literal('enter_code'), objectId, code: z.string().min(1) }),
  z.object({ type: z.literal('enter_sequence'), objectId, steps: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal('activate'), objectId }),
]);

// Vérifie à la compilation que le schéma produit bien un Action du moteur.
type _ActionMatch = z.infer<typeof actionSchema> extends Action ? true : never;
const _actionMatch: _ActionMatch = true;
void _actionMatch;

export const hintBodySchema = z
  .object({ puzzleId: z.string().trim().min(1).optional() })
  .strict();
export type HintBody = z.infer<typeof hintBodySchema>;
