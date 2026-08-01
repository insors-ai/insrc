/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-step JSON schemas for the `brainstorm` stage.
 *
 * S001 registered the stage with an open-object placeholder. S002 (Phase B —
 * first elicitation turn) gave `elicit` a first-turn `{ category, questions }`
 * shape. S003 (Phase B — convergence, sc3) EVOLVES it into the converged
 * `{ category, workingStatement, openItems, confirmed }` shape: the response the
 * single paused `elicit` step validates on resume once the controller has run the
 * whole clarify → fold → show → confirm conversation in chat.
 *
 * The shape enforces the story's guarantees STRUCTURALLY:
 *  - `category` is constrained to the reused BrainstormCategory vocabulary
 *    (BRAINSTORM_CATEGORY_CLASSES ids) — no competing taxonomy is invented (c33).
 *  - `workingStatement` (minLength 1) is the current understanding — an empty
 *    string fails validation, so a `confirmed:true` with nothing converged is
 *    rejected here (ep1).
 *  - `openItems` is the still-unresolved gap list; `confirmed` is the explicit
 *    user-agreement flag (ac3).
 *  - the s2 `questions` field is FULLY REMOVED (not deprecated), and
 *    additionalProperties:false rejects a stale client still sending it.
 *
 * The business rule that a `confirmed:true` payload must carry ZERO openItems is
 * deliberately NOT expressed in ajv here (schema-shape only) — it is owned by the
 * `elicit` runner's finalize() (S003 index.ts), which leaves the run paused and
 * re-prompts on the remaining openItems. No persisted spec artifact yet (S006).
 */

import { BRAINSTORM_CATEGORY_CLASSES } from '../../../shared/brainstorm-classes.js';

/** The enum members = exactly the reused BrainstormCategory ids
 *  (requirements/design/implementation/testing/general). Derived, never hand-listed,
 *  so it can never drift from the shared vocabulary. */
const BRAINSTORM_CATEGORY_IDS: readonly string[] = BRAINSTORM_CATEGORY_CLASSES.map(c => c.id);

/** Converged elicit response: a category, the folded working statement, the
 *  still-open gaps, and the explicit confirmation flag. */
export const brainstormElicitSchema: Record<string, unknown> = {
	type: 'object',
	required: ['category', 'workingStatement', 'openItems', 'confirmed'],
	additionalProperties: false,
	properties: {
		category:         { enum: [...BRAINSTORM_CATEGORY_IDS] },
		workingStatement: { type: 'string', minLength: 1 },
		openItems:        { type: 'array', items: { type: 'string' } },
		confirmed:        { type: 'boolean' },
	},
};
