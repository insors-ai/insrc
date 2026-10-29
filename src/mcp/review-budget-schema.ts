import { z } from 'zod';

export { reviewBudgetDeclarationSchema } from '../shared/review-controller-budget-schema.js';
export const reviewReplySchema = z.object({
	version: z.literal(1), generation: z.number().int().nonnegative(), callId: z.string().uuid(), answer: z.unknown(),
}).strict();
