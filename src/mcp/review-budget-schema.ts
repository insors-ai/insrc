import { z } from 'zod';

/** Optional publicly because daemon-routed reviews do not need a host declaration. */
export const reviewBudgetDeclarationSchema = z.object({
	version: z.literal(1), hostContextReserveTokens: z.number().int().positive(),
	profile: z.object({
		profileVersion: z.literal(1), providerId: z.string().min(1).max(128),
		transport: z.literal('controller'), transportVersion: z.string().min(1).max(128),
		schemaDialect: z.literal('controller-json-v1'), promptDialect: z.literal('controller-frame-v1'),
		qualification: z.literal('controller-reserved'), declaredToolsJson: z.string(),
		contextWindowTokens: z.number().int().positive().optional(),
		nativeReserveTokens: z.number().int().nonnegative(), transportReserveTokens: z.number().int().nonnegative(),
		completionReserveTokens: z.number().int().positive(), inspectionReserveTokens: z.number().int().nonnegative(),
	}).strict(),
}).strict();
export const reviewReplySchema = z.object({
	version: z.literal(1), generation: z.number().int().nonnegative(), callId: z.string().uuid(), answer: z.unknown(),
}).strict();
