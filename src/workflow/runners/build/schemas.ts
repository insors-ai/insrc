/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * JSON schemas for the `build` workflow's step outputs. Each is the
 * structured contract the outer LLM's step response must satisfy.
 * Kept as data so the runner file stays readable.
 *
 * s1 SCOPE: these are SKELETON schemas for a minimal, coherent recipe
 * (context.assemble + a placeholder implement step). The real
 * per-Task edit/test/repair output shape grows in Story s3/s4/s5.
 */

// s1 — context.assemble: a read-only summary of the approved plan the
// build run will implement.
export const buildContextSchema = {
	type: 'object',
	required: ['taskCount', 'summary'],
	additionalProperties: false,
	properties: {
		taskCount: { type: 'integer', minimum: 0 },
		summary:   { type: 'string', minLength: 1 },
		notes:     { type: 'string' },
	},
} as const;

// s2 — tasks.implement: PLACEHOLDER. s1 only records a per-Task outcome
// stub; the real serial CliProvider edit/test/repair loop is s3/s4.
export const tasksImplementSchema = {
	type: 'object',
	required: ['taskOutcomes'],
	additionalProperties: false,
	properties: {
		taskOutcomes: {
			type: 'array',
			items: {
				type: 'object',
				required: ['taskId', 'status'],
				additionalProperties: false,
				properties: {
					taskId:  { type: 'string', minLength: 1 },
					status:  { enum: ['pending', 'implemented', 'failed'] },
					summary: { type: 'string' },
				},
			},
		},
		notes: { type: 'string' },
	},
} as const;
