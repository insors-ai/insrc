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
 *
 * S010 (Phase — adaptive elicit) reworks the SINGLE freeform elicit pause into a
 * daemon-drafted, one-decision-per-turn loop. TWO new schemas support it, and
 * `brainstormElicitSchema` above is LEFT UNCHANGED — it remains the elicit step's
 * OUTPUT shape that the (unchanged) synthesize step consumes, now ASSEMBLED by
 * the runner from the answered decisions on final confirm rather than emitted in
 * one client turn:
 *   - `decisionDraftSchema`  — what the mid-tier draftProvider EMITS each turn:
 *     the folded running spec (category, workingStatement, nonGoals) plus the
 *     NEXT single decision to present ({ decisionId, question, options[] with a
 *     recommended one + tradeoffs, groundingNote }), or `convergence:true` +
 *     no `decision` when it judges no material decision remains.
 *   - `decisionAnswerSchema` — what the CONTROLLER resumes with (the pause's
 *     schema): a tagged action (choose / reopen / propose_converge /
 *     final_confirm) carrying the user's pick for the presented decision.
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

/** One presentable decision the draftProvider proposes for THIS turn: a question
 *  with 2+ labelled options (each carrying a tradeoff; at most one flagged
 *  `recommended`) and an optional grounding note. `decisionId` is stable so a
 *  later `reopen` can name it. */
const decisionSchema: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	required: ['decisionId', 'question', 'options'],
	properties: {
		decisionId: { type: 'string', minLength: 1 },
		question:   { type: 'string', minLength: 1 },
		options: {
			type: 'array',
			minItems: 2,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['label', 'tradeoff'],
				properties: {
					label:       { type: 'string', minLength: 1 },
					tradeoff:    { type: 'string' },
					recommended: { type: 'boolean' },
				},
			},
		},
		groundingNote: { type: 'string' },
	},
};

/** The mid-tier draftProvider's per-turn output (S010): the folded running spec
 *  plus the NEXT single decision to present — or `convergence:true` with no
 *  `decision` when the drafter judges the spec complete. The runner keeps
 *  `category`/`workingStatement`/`nonGoals` as the running spec across turns and
 *  assembles the final `brainstormElicitSchema` output from the answered
 *  decisions on confirm. */
export const decisionDraftSchema: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	required: ['category', 'workingStatement', 'convergence'],
	properties: {
		category:         { enum: [...BRAINSTORM_CATEGORY_IDS] },
		workingStatement: { type: 'string', minLength: 1 },
		nonGoals:         { type: 'array', items: { type: 'string' } },
		/** true => the drafter proposes convergence; `decision` is then omitted. */
		convergence:      { type: 'boolean' },
		decision:         decisionSchema,
	},
};

/** The controller's resume payload for a paused decision turn (S010) — the
 *  pause's schema. A tagged action:
 *   - `choose`           → the user picked `chosenOption` for `decisionId`;
 *   - `reopen`           → re-present the earlier decision named by `decisionId`;
 *   - `propose_converge` → force a convergence proposal now (controller/user override);
 *   - `final_confirm`    → the user confirmed the converged spec (only valid once
 *                          convergence has been proposed). */
export const decisionAnswerSchema: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	required: ['action'],
	properties: {
		action:       { enum: ['choose', 'reopen', 'propose_converge', 'final_confirm'] },
		/** Which decision `choose`/`reopen` refers to. */
		decisionId:   { type: 'string' },
		/** The option label the user chose (for `choose`). */
		chosenOption: { type: 'string' },
		/** Optional freeform note (e.g. an added constraint the user voiced). */
		note:         { type: 'string' },
	},
};
