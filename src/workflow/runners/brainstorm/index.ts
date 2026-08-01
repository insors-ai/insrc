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
 * S002 (Phase B) turned the `elicit` step into the FIRST elicitation turn: an
 * llm-pause that classified the rough idea and asked clarifying questions.
 *
 * S003 (Phase B — convergence, sc3) reshapes that SAME single pause into the
 * whole convergence turn: the controller conducts the clarify → fold → show →
 * confirm conversation in chat, folding each answer into a working statement,
 * showing the current understanding every turn, re-asking only the still-open
 * gaps with no fixed round budget, and resuming the step ONCE with the CONFIRMED
 * converged statement. The daemon holds the single pause and runs NO loop (k2).
 * It reuses the step-loop llm-pause + state-store (opaque token preserved, k8/k9);
 * persistence into a spec artifact is S006.
 *
 * finalize() carries the ONE business rule the ajv schema cannot express: a
 * `confirmed:true` payload must have an EMPTY openItems list. A schema-valid
 * payload that confirms with gaps still open is rejected as a RETRYABLE error, so
 * the run stays paused (its state token is unchanged) and the controller
 * re-prompts on the remaining openItems rather than advancing to synthesize.
 *
 * k10 — this is the `brainstorm` WORKFLOW STAGE. It shares ONLY the
 * BrainstormCategory vocabulary with the shared/chat-agent brainstorm concept and
 * NEVER imports or invokes the offlineRpc idea-capture stub.
 */

import { registerRunner } from '../../executor.js';
import type { StepRunner, StepRunnerContext, StepRunnerFinalize } from '../../types.js';
import { BRAINSTORM_CATEGORY_CLASSES } from '../../../shared/brainstorm-classes.js';
import { brainstormElicitSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// llm-pause runner (local, mirroring the design-story/design-epic/plan modules —
// each keeps its own copy rather than a shared abstraction). An optional
// `finalize` override lets a runner enforce business rules the ajv schema cannot;
// the default just passes the validated response through as the step output.
// ---------------------------------------------------------------------------

function llmPauseRunner(spec: {
	readonly id:          string;
	readonly buildPrompt: (ctx: StepRunnerContext) => { readonly prompt: string; readonly userTurn: string };
	readonly schema:      Record<string, unknown>;
	readonly finalize?:   StepRunnerFinalize;
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
		finalize: spec.finalize ?? (async (llmResponse) => ({ type: 'output', output: llmResponse })),
	};
}

/** Render the reused category vocabulary for the prompt (id — description),
 *  so the model classifies against the established taxonomy (c33), never invents one. */
function categoryVocabularyBlock(): string {
	return BRAINSTORM_CATEGORY_CLASSES.map(c => `- ${c.id}: ${c.description}`).join('\n');
}

// ---------------------------------------------------------------------------
// elicit — the whole convergence turn: conduct clarify → fold → show → confirm
// in chat, then resume ONCE with the confirmed converged statement.
// ---------------------------------------------------------------------------

/** finalize gate: a `confirmed:true` payload MUST carry an empty openItems list.
 *  A schema-valid confirm with gaps still open is a RETRYABLE error — the run
 *  stays paused (state token unchanged) so the controller re-prompts on the
 *  remaining items rather than advancing to synthesize. Everything else (a
 *  confirmed:false intermediate turn, or a clean confirmed:true) passes through
 *  as the step output. */
const finalizeElicit: StepRunnerFinalize = async (llmResponse) => {
	const confirmed = llmResponse['confirmed'] === true;
	const openItems = llmResponse['openItems'];
	const openCount = Array.isArray(openItems) ? openItems.length : 0;
	if (confirmed && openCount > 0) {
		return {
			type:      'error',
			code:      'convergence-incomplete',
			message:
				`elicit: confirmed:true requires openItems to be empty, but ${openCount} ` +
				`open item(s) remain — keep probing those, or resume with confirmed:false. ` +
				`The run stays paused; re-send once the statement is genuinely agreed.`,
			retryable: true,
		};
	}
	return { type: 'output', output: llmResponse };
};

const elicit = llmPauseRunner({
	id: 'elicit',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `brainstorm` stage — interactive spec elicitation — for a rough one-line idea.',
			'This is a SINGLE paused step: conduct the ENTIRE back-and-forth with the user in chat, then resume',
			'this step exactly ONCE with the final CONFIRMED converged statement. The daemon runs no loop; you drive.',
			'',
			'Each conversational turn:',
			'  1. Fold the user\'s latest answers into a running `workingStatement` — the current understanding of',
			'     the request (its intent, scope boundary, explicit exclusions, and success condition).',
			'  2. SHOW that current understanding back to the user so they can correct a misreading on THIS turn.',
			'  3. Re-ask ONLY the gaps that are still unresolved (the `openItems`). Never re-ask a settled point.',
			'  4. If the user revises an earlier answer, re-fold it — a settled point may reopen.',
			'',
			'Classify the idea into ONE request category from the fixed vocabulary below (it may change as intent',
			'sharpens). Keep probing a large/ambiguous request until intent is genuinely pinned — do NOT stop early',
			'to save turns or model calls.',
			'',
			'CONVERGENCE / CONFIRMATION:',
			'- When no material gap remains, PRESENT the converged workingStatement and ask the user to confirm.',
			'- The turn is NOT done until the user explicitly confirms. Only then resume with `confirmed: true` and',
			'  an EMPTY `openItems` list. A `confirmed: true` with any open item left will be rejected and the run',
			'  stays paused.',
			'- While gaps remain (or the user has not agreed), resume with `confirmed: false`, the folded',
			'  `workingStatement`, and the still-open `openItems`.',
			'- If the user abandons the conversation, simply never resume this step — nothing is recorded.',
			'',
			'Produce NO persisted spec on this turn — that is a later stage. Do not invent a category outside the list.',
			'',
			'Request category vocabulary (pick exactly one `id`):',
			categoryVocabularyBlock(),
			'',
			'Emit JSON matching the schema: { "category": <one id>, "workingStatement": <current understanding>, ' +
				'"openItems": [<still-unresolved gaps>], "confirmed": <boolean> }.',
		].join('\n'),
		userTurn: [
			`The rough idea (focus): ${ctx.intent.focus}`,
			'',
			'Begin the convergence: fold what you know, show the current understanding, and ask about the open gaps.',
			'Resume this step only once the user has confirmed the converged statement.',
		].join('\n'),
	}),
	schema: brainstormElicitSchema,
	finalize: finalizeElicit,
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
