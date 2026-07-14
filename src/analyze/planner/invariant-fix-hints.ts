/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-invariant prescriptive fix menus for the Plan Builder's
 * corrective-retry loop.
 *
 * Motivation (ISSUES.md I-004):
 * The corrective-retry note used to only name the invariant + say
 * "emit a corrected PlanTask". qwen3.6:35b-a3b interpreted that as
 * ambient feedback and re-emitted structurally identical plans
 * with the same violation. Naming the failure without naming the
 * REMEDY -- especially for invariants with multiple orthogonal
 * fixes like INV-7 / INV-11 -- left the model without direction.
 *
 * Each entry below spells out the concrete edits the model can
 * make to satisfy the invariant. Where the fix is unambiguous
 * we name it directly; where several remedies apply we enumerate
 * them so the model has a menu.
 *
 * Any invariant id not in this table falls back to
 * `GENERIC_FIX_HINT` -- less prescriptive but still better than
 * silence.
 */

import type { PlanInvariantId } from './validate.js';

export interface InvariantFixHint {
	/** Short one-line summary of what went wrong, model-readable. */
	readonly what: string;
	/**
	 * Enumerated remedies. Each entry describes a concrete edit
	 * the model can make. If only one applies, the array has one
	 * entry. Menu-style presentation (numbered) invites the model
	 * to pick one deliberately rather than paraphrase.
	 */
	readonly remedies: readonly string[];
}

const GENERIC_FIX_HINT: InvariantFixHint = {
	what: 'The plan failed a semantic invariant.',
	remedies: [
		'Read the validator message carefully.',
		'Modify the specific task(s) it names -- do NOT re-architect the whole plan.',
	],
};

const FIX_HINTS: Readonly<Record<PlanInvariantId, InvariantFixHint>> = {
	'INV-1': {
		what: 'The `tasks` array is empty.',
		remedies: [
			'Emit at least one task drawn from the catalog. Every Plan must end with an aggregator template as the last task.',
		],
	},

	'INV-2': {
		what: 'Task ids are not the monotonic sequence `t01, t02, t03, ...` matching the array order.',
		remedies: [
			'Renumber every taskId to match its array position: `tasks[0].taskId = "t01"`, `tasks[1].taskId = "t02"`, etc. Do NOT skip numbers.',
			'If a task was removed, renumber ALL subsequent taskIds -- and update every `consumes` reference that pointed at removed / renumbered producers.',
		],
	},

	'INV-3': {
		what: 'A task cites a `template` id that is not in the catalog.',
		remedies: [
			'Replace the template with a real catalog id from the TASK CATALOG block above -- copy the id EXACTLY, no abbreviation.',
			'If no catalog template fits, remove the task entirely (do NOT invent template ids).',
		],
	},

	'INV-4': {
		what: 'A task uses a template whose declared `target` does not match the plan target.',
		remedies: [
			'Replace the task with a template from the catalog whose target matches the plan target.',
			'If the plan legitimately needs a cross-target task, use a `planner`-kind template (subrun.deep-dive) that recursively dispatches to the other target instead of embedding it directly.',
		],
	},

	'INV-5': {
		what: 'A task\'s `params` object does not validate against the template\'s declared `inputSchema`.',
		remedies: [
			'Read the schema error message and fix ONLY the offending property. Do not touch other tasks.',
			'Common causes: wrong field type (string vs object), missing required field, additional unexpected field. Match the schema exactly.',
			'For `planner`-kind templates, the `params.childIntent` field is a full `ClassifiedIntent` object with `target`, `scope`, `focused`, `scopeRef`, and `reasoning` -- not just a scope string.',
		],
	},

	'INV-6': {
		what: 'A task\'s `produces` array does not match the template\'s declared `produces`.',
		remedies: [
			'Copy the template\'s `produces` array VERBATIM into the task. Same names, same length, same order.',
			'Do NOT customise `produces` per instance -- the template owns this field.',
		],
	},

	'INV-7': {
		what: 'A task consumes an item name that no earlier task produces in this Plan.',
		remedies: [
			'REORDER: move the task that produces this item to an earlier index (before the consumer). Renumber every taskId per INV-2 after moving.',
			'REPLACE CONSUMES: change the offending task\'s `consumes` array to reference something an earlier task actually produces (check the catalog for producers, or the aggregator does not consume anything).',
			'ADD PRODUCER: insert a new task earlier in the plan whose template `produces` includes this item. Renumber taskIds per INV-2.',
			'REMOVE THE CONSUMES ENTRY: if the task doesn\'t actually need that input, drop it from `consumes`.',
		],
	},

	'INV-8': {
		what: 'A task\'s `kind` does not match its template\'s declared `kind`.',
		remedies: [
			'Copy the template\'s `kind` VERBATIM (`leaf` | `aggregator` | `planner`) into the task. The template owns this field; do not override.',
		],
	},

	'INV-9': {
		what: 'A task\'s `params` contains a nested task-array. Recursion in this framework happens via `planner`-kind templates, NOT inline sub-tasks.',
		remedies: [
			'Remove the nested task array from `params`. If the intent needs a recursive plan, use a `planner`-kind template (e.g. `subrun.deep-dive`) which spawns a child plan.',
		],
	},

	'INV-10': {
		what: 'The produces-consumes DAG has a cycle.',
		remedies: [
			'Break the cycle by removing one edge: pick a task in the cycle and delete the offending item from its `consumes` array.',
			'If the cycle is between two tasks, one of them likely shouldn\'t exist -- consider merging or removing.',
		],
	},

	'INV-11': {
		what: 'The serial task order is not a valid topological sort: a task consumes an item whose producer is at a later or the same index.',
		remedies: [
			'REORDER: swap the two tasks so the producer comes strictly earlier. Renumber every taskId (INV-2 requires t01, t02, ... in array order).',
			'REPLACE CONSUMES: change the consumer\'s `consumes` array to reference an item produced by a strictly earlier task instead.',
			'ADD PRODUCER: insert a new producer task before the consumer.',
			'Common pattern: if `t13` consumes `report` but `t12` produces `report`, swap so `report`-producer becomes `t12` and consumer becomes `t13` -- or make the consumer `t14` and put the producer at `t13`.',
		],
	},

	'INV-12': {
		what: 'Aggregator placement is wrong: either no aggregator, multiple aggregators, or the aggregator is not the last task.',
		remedies: [
			'Exactly one aggregator task, and it MUST be the last task in the array.',
			'If missing: add an aggregator template (look for `isAggregator: yes` in the TASK CATALOG). Only one such template exists per target.',
			'If duplicated: keep the LAST aggregator, delete the earlier one(s), then renumber taskIds per INV-2.',
			'If misplaced: move the aggregator to the last index of `tasks[]`, renumber taskIds per INV-2.',
		],
	},

	'INV-13': {
		what: 'The task count is outside the scope band for the plan\'s scope.',
		remedies: [
			'If TOO FEW: add more `leaf`-kind tasks covering additional aspects of the scope. Each new task must produce a unique named artefact the aggregator consumes.',
			'If TOO MANY: consolidate tasks (merge tasks with adjacent scopes), collapse variants, or drop the least valuable ones. Renumber taskIds per INV-2.',
			'The scope band was declared in the DEPTH POLICY BAND block near the top of your prompt.',
		],
	},

	'INV-14': {
		what: 'A required text field is too short (`reasoning` < 50 chars, or a task `rationale` < 20 chars).',
		remedies: [
			'Expand the offending field with a concrete explanation. For `reasoning`: 1-2 substantive sentences on why THIS shape of plan (task set + ordering) fits the intent.',
			'For a task `rationale`: 1 sentence stating what THIS task contributes to the aggregate output.',
		],
	},

	'INV-15': {
		what: 'The `parentTaskPath` field is on the root Plan (should be absent) or absent from a child Plan (should be present).',
		remedies: [
			'Do NOT emit the `parentTaskPath` field. The framework stamps it from the call site; whether you set it or not, the validator will read what the framework wrote.',
			'If the validator still complains after removal, the issue is elsewhere -- re-read the specific message.',
		],
	},
};

export function invariantFixHint(id: PlanInvariantId): InvariantFixHint {
	return FIX_HINTS[id] ?? GENERIC_FIX_HINT;
}

/**
 * Render a fix-hint as the retry-note fragment that goes into the
 * corrective user turn. Numbered list with a lead-in so the model
 * treats it as a menu.
 */
export function renderFixHint(hint: InvariantFixHint): string {
	const remedies = hint.remedies
		.map((r, i) => `  ${i + 1}. ${r}`)
		.join('\n');
	return (
		`WHAT IS BROKEN:\n` +
		`  ${hint.what}\n` +
		`\n` +
		`HOW TO FIX (pick ONE remedy that fits your case):\n` +
		remedies
	);
}
