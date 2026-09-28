/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (provenance/feedback) — the JSON-schema FRAGMENT + prompt HARD RULE the
 * DEF/HLD/LLD/PLAN synthesizers share to ADMIT-BUT-NEVER-EMIT `body.feedback`.
 *
 * Kept in this neutral provenance module (no imports back into orchestrator /
 * runners) so every synthesizer body schema single-sources the exact same
 * FeedbackEntry shape — mirroring the companion `er-schema.ts` idiom. The shape
 * mirrors the FeedbackEntry/ProvenanceTarget interfaces in ./types.ts.
 *
 * The synthesizer NEVER authors feedback (it is populated post-hoc by the append
 * API); this schema exists only so `additionalProperties:false` does not reject a
 * body that already carries feedback from an earlier append.
 */

/** The `feedback` body-element schema. The synthesizer NEVER authors it; present
 *  only so `additionalProperties:false` does not reject a body that already carries
 *  post-hoc appended feedback. */
export const FEEDBACK_PROPERTY_SCHEMA: Record<string, unknown> = {
	type: 'array',
	items: {
		type: 'object',
		required: ['id', 'author', 'timestamp', 'target', 'comment'],
		additionalProperties: false,
		properties: {
			id:        { type: 'string' },
			author:    { type: 'string' },
			timestamp: { type: 'string' },
			comment:   { type: 'string' },
			kind:      { enum: ['feedback', 'suggestion', 'comment'] },
			target: {
				type: 'object',
				required: ['file'],
				additionalProperties: false,
				properties: {
					file:    { type: 'string' },
					version: { type: 'string' },
					segment: {
						type: 'object',
						required: ['startLine', 'endLine'],
						additionalProperties: false,
						properties: {
							startLine: { type: 'integer' },
							endLine:   { type: 'integer' },
						},
					},
				},
			},
		},
	},
};

/** The HARD RULE every DEF/HLD/LLD/PLAN synthesizer prompt carries: NEVER author
 *  feedback. */
export const FEEDBACK_NEVER_AUTHOR_RULE =
	'- Do NOT author `body.feedback`. Feedback is post-hoc, human-authored provenance populated by the append API after the artifact is written; the synthesizer never emits it (omit the field entirely).';
