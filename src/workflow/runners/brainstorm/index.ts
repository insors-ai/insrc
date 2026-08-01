/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `brainstorm` stage runners (Epic `frame-epic-new-pre-workflow-brainstorm`).
 *
 * S001 (sc2) made brainstorm a first-class, peer workflow stage: it self-registers
 * its step runner(s) into the SAME executor registry (`registerRunner`) the design
 * stages use, wired into `registerWorkflowRunners()` (src/workflow/index.ts). No
 * parallel execution or persistence path (k5).
 *
 * S002 (Phase B, sc3) turns the `elicit` step into the FIRST real elicitation
 * turn: an llm-pause whose prompt asks the controller to classify the rough idea
 * into a BrainstormCategory and emit clarifying questions targeting the unstated
 * intent gaps — surfaced to the user in chat, no spec produced on the first turn.
 * It reuses the step-loop llm-pause + state-store (opaque token preserved, k8/k9);
 * convergence into a working statement / spec is S003–S006.
 *
 * k10 — this is the `brainstorm` WORKFLOW STAGE. It shares ONLY the
 * BrainstormCategory vocabulary with the shared/chat-agent brainstorm concept and
 * NEVER imports or invokes the offlineRpc idea-capture stub.
 */

import { registerRunner } from '../../executor.js';
import type { StepRunner, StepRunnerContext } from '../../types.js';
import { BRAINSTORM_CATEGORY_CLASSES } from '../../../shared/brainstorm-classes.js';
import { brainstormElicitSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// llm-pause runner (local, mirroring the design-story/design-epic/plan modules —
// each keeps its own copy rather than a shared abstraction).
// ---------------------------------------------------------------------------

function llmPauseRunner(spec: {
	readonly id:          string;
	readonly buildPrompt: (ctx: StepRunnerContext) => { readonly prompt: string; readonly userTurn: string };
	readonly schema:      Record<string, unknown>;
}): StepRunner {
	return {
		id:       spec.id,
		workflow: 'brainstorm',
		async run(ctx) {
			const { prompt, userTurn } = spec.buildPrompt(ctx);
			return {
				type: 'llm-pause',
				prompt, userTurn,
				schema: spec.schema,
				preparedBlob: { stepId: spec.id },
			};
		},
		async finalize(llmResponse) {
			return { type: 'output', output: llmResponse };
		},
	};
}

/** Render the reused category vocabulary for the prompt (id — description),
 *  so the model classifies against the established taxonomy (c33), never invents one. */
function categoryVocabularyBlock(): string {
	return BRAINSTORM_CATEGORY_CLASSES.map(c => `- ${c.id}: ${c.description}`).join('\n');
}

// ---------------------------------------------------------------------------
// elicit — first turn: classify + ask clarifying questions (no spec)
// ---------------------------------------------------------------------------

const elicit = llmPauseRunner({
	id: 'elicit',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the first turn of the `brainstorm` stage — interactive spec elicitation.',
			'',
			'The user has given only a rough one-line idea. Your job on THIS turn is to ASK, not to answer:',
			'  1. Classify the idea into ONE request category from the fixed vocabulary below.',
			'  2. Emit clarifying QUESTIONS that target the intent gaps which would change how the request',
			'     is framed downstream — the scope boundary, the exclusions (what is explicitly NOT wanted),',
			'     and the success condition. Ask about what is MISSING; do not restate the idea back.',
			'',
			'HARD RULES:',
			'- Produce NO spec, summary, or answer on this turn — only a category and questions.',
			'- Every question must be answerable by the user and must move framing forward.',
			'- Shape the questions to the chosen category; do not invent a category outside the list.',
			'',
			'Request category vocabulary (pick exactly one `id`):',
			categoryVocabularyBlock(),
			'',
			'Emit JSON matching the schema: { "category": <one id>, "questions": [<clarifying questions>] }.',
		].join('\n'),
		userTurn: [
			`The rough idea (focus): ${ctx.intent.focus}`,
			'',
			'Classify it and emit your first round of clarifying questions now.',
		].join('\n'),
	}),
	schema: brainstormElicitSchema,
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

/** Idempotent registration, mirroring `registerDesignStoryRunners`
 *  (design-story/index.ts:541). Wired into `registerWorkflowRunners()`. */
export function registerBrainstormRunners(): void {
	if (registered) return;
	registerRunner(elicit);
	registered = true;
}
