/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-step JSON schemas for the `brainstorm` stage.
 *
 * S001 registered the stage with an open-object placeholder. S002 (Phase B —
 * first elicitation turn) gave `elicit` a first-turn `{ category, questions }`
 * shape. S003 (Phase B — convergence, sc3) evolved it into the converged
 * `{ category, workingStatement, openItems, confirmed }` shape. S004 (Phase B —
 * options/tradeoffs) EXTENDS that converged shape additively with structured
 * decision-capture: `decisions[]` ({ chosen, ruledOut[], reason }) records the
 * reasoning that narrowed a fork — the chosen direction, the alternatives ruled
 * out, and why (c32) — and `nonGoals[]` records the explicit exclusions. This is
 * the response the single paused `elicit` step validates on resume once the
 * controller has run the whole clarify → fold → show → confirm conversation.
 *
 * The shape enforces the story's guarantees STRUCTURALLY:
 *  - `category` is constrained to the reused BrainstormCategory vocabulary
 *    (BRAINSTORM_CATEGORY_CLASSES ids) — no competing taxonomy is invented (c33).
 *  - `workingStatement` (minLength 1) is the current understanding — an empty
 *    string fails validation, so a `confirmed:true` with nothing converged is
 *    rejected here (S003/ep1).
 *  - `openItems` is the still-unresolved gap list; `confirmed` is the explicit
 *    user-agreement flag (S003).
 *  - `decisions[]` captures each resolved fork as { chosen, ruledOut[], reason }
 *    with chosen/reason non-empty — a half-captured decision (a choice with no
 *    reason) fails validation (S004/ac2). `nonGoals[]` are the exclusions (ac3).
 *  - the s2 `questions` field is FULLY REMOVED (not deprecated), and
 *    additionalProperties:false (top-level AND per decisions entry) rejects a
 *    stale/ill-formed client payload.
 *
 * Two business rules the ajv shape deliberately does NOT express (they are owned
 * by the `elicit` runner's finalize() in index.ts, which leaves the run paused
 * and re-prompts): a `confirmed:true` payload must carry ZERO openItems
 * (S003 'convergence-incomplete') AND every `decisions[].ruledOut` direction must
 * also appear in `nonGoals` (S004 'ruled-out-not-recorded'). No persisted spec
 * artifact yet (S006).
 */

import { BRAINSTORM_CATEGORY_CLASSES } from '../../../shared/brainstorm-classes.js';

/** The enum members = exactly the reused BrainstormCategory ids
 *  (requirements/design/implementation/testing/general). Derived, never hand-listed,
 *  so it can never drift from the shared vocabulary. */
const BRAINSTORM_CATEGORY_IDS: readonly string[] = BRAINSTORM_CATEGORY_CLASSES.map(c => c.id);

/** Converged elicit response: a category, the folded working statement, the
 *  still-open gaps, the confirmation flag, plus the structured narrowing record
 *  (decisions) and the explicit exclusions (nonGoals). */
export const brainstormElicitSchema: Record<string, unknown> = {
	type: 'object',
	required: ['category', 'workingStatement', 'openItems', 'confirmed', 'decisions', 'nonGoals'],
	additionalProperties: false,
	properties: {
		category:         { enum: [...BRAINSTORM_CATEGORY_IDS] },
		workingStatement: { type: 'string', minLength: 1 },
		openItems:        { type: 'array', items: { type: 'string' } },
		confirmed:        { type: 'boolean' },
		decisions: {
			type: 'array',
			items: {
				type: 'object',
				required: ['chosen', 'ruledOut', 'reason'],
				additionalProperties: false,
				properties: {
					chosen:   { type: 'string', minLength: 1 },
					ruledOut: { type: 'array', items: { type: 'string' } },
					reason:   { type: 'string', minLength: 1 },
				},
			},
		},
		nonGoals: { type: 'array', items: { type: 'string' } },
	},
};
