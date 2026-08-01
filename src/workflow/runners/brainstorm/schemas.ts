/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-step JSON schemas for the `brainstorm` stage.
 *
 * S001 registered the stage with an open-object placeholder. S002 (Phase B —
 * first elicitation turn, sc3) replaces it with `brainstormElicitSchema`: the
 * response the `elicit` llm-pause validates on resume.
 *
 * The shape enforces the story's guarantees STRUCTURALLY:
 *  - `category` is constrained to the reused BrainstormCategory vocabulary
 *    (BRAINSTORM_CATEGORY_CLASSES ids) — no competing taxonomy is invented (c33).
 *  - `questions` is a non-empty string list — the turn must ASK.
 *  - there is deliberately NO `spec` field, so a converged-spec or empty-questions
 *    response fails validation: no spec is produced on the first turn (ac1).
 * Convergence into a working statement / spec is S003–S006.
 */

import { BRAINSTORM_CATEGORY_CLASSES } from '../../../shared/brainstorm-classes.js';

/** The enum members = exactly the reused BrainstormCategory ids
 *  (requirements/design/implementation/testing/general). Derived, never hand-listed,
 *  so it can never drift from the shared vocabulary. */
const BRAINSTORM_CATEGORY_IDS: readonly string[] = BRAINSTORM_CATEGORY_CLASSES.map(c => c.id);

/** First-turn elicit response: pick a category + ask clarifying questions; no spec. */
export const brainstormElicitSchema: Record<string, unknown> = {
	type: 'object',
	required: ['category', 'questions'],
	additionalProperties: false,
	properties: {
		category:  { enum: [...BRAINSTORM_CATEGORY_IDS] },
		questions: { type: 'array', items: { type: 'string' }, minItems: 1 },
	},
};
