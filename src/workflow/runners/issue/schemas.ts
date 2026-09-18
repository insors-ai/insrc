/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-step JSON schemas for the `issue` stage (sc2 / S002). The `issue.capture`
 * step emits the defect record's prose fields (grounded against the code); the
 * `checklist.verify` step audits it. Mirrors the shape of the other stages'
 * `schemas.ts` (define/design.story/plan).
 */

import type { StructuredSchema } from '../../../shared/types.js';

/** The captured defect record — the four prose fields the IssueArtifact body
 *  carries, plus the citations that ground them. */
export const issueCaptureSchema: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['title', 'reproduction', 'rootCause', 'fixIntent', 'citations'],
	properties: {
		title:        { type: 'string', minLength: 1 },
		reproduction: { type: 'string', minLength: 1 },
		rootCause:    { type: 'string', minLength: 1 },
		fixIntent:    { type: 'string', minLength: 1 },
		citations: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['id', 'kind', 'ref'],
				properties: {
					id:         { type: 'string', pattern: '^c\\d+$' },
					kind:       { enum: ['step-output', 'analyze-bundle', 'doc', 'code', 'stakeholder', 'convention', 'prior-artifact'] },
					ref:        { type: 'string', minLength: 1 },
					quotedText: { type: 'string' },
				},
			},
		},
	},
};

/** The in-stage audit verdict — one result per checklist item (mirrors the
 *  define/design checklist.verify shape). */
export const issueChecklistSchema: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['results'],
	properties: {
		results: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['itemId', 'verdict', 'evidence'],
				properties: {
					itemId:   { type: 'string', minLength: 1 },
					verdict:  { enum: ['passed', 'missed', 'partial', 'ambiguous'] },
					evidence: { type: 'string', minLength: 1 },
					notes:    { type: 'string' },
				},
			},
		},
	},
};
