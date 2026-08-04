/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `brainstorm` stage runners (Epic `frame-epic-new-pre-workflow-brainstorm`).
 *
 * S001–S004 shipped the stage as a SINGLE freeform `elicit` pause: the daemon
 * emitted one prompt, the controller conducted the entire clarify → fold → show →
 * confirm conversation in chat, and resumed the step ONCE with a confirmed
 * converged statement (`brainstormElicitSchema`).
 *
 * S010 (Phase — adaptive elicit) rebuilds that into a DAEMON-DRIVEN,
 * one-decision-per-turn loop, per the redesign spec: at each turn the daemon
 * (a mid-tier `draftProvider`, resolved by the drive layer via the
 * `brainstorm.decision.draft` role) DRAFTS the single next decision — a question
 * with options, tradeoffs, and a recommended pick — and the controller presents
 * exactly that one recommendation to the user, folds their answer, and the
 * daemon drafts the next. The executor's new re-pause contract (a `finalize`
 * that returns another `llm-pause`) keeps the loop on the SAME step until the
 * daemon proposes convergence and the user confirms.
 *
 *   run()      → fail closed if no `ctx.draftProvider`; else DRAFT decision 1
 *                and pause (schema = `decisionAnswerSchema`).
 *   finalize() → fold the controller's answer:
 *                  choose            → record + DRAFT the next decision, re-pause;
 *                  reopen            → re-present a named earlier decision, re-pause;
 *                  propose_converge  → present the converged spec, re-pause;
 *                  final_confirm     → (only after convergence) return `{output}`
 *                                      as the UNCHANGED `brainstormElicitSchema`
 *                                      shape, ASSEMBLED from the answered
 *                                      decisions. Nothing is persisted here — the
 *                                      unchanged synthesize step remains the SOLE
 *                                      SpecArtifact writer (S006).
 *
 * The draftProvider is ALWAYS mid-tier (never cheap/local): an absent provider
 * is a retryable `draft-provider-unavailable`, not a silent downgrade.
 *
 * k10 — this is the `brainstorm` WORKFLOW STAGE. It shares ONLY the
 * BrainstormCategory vocabulary with the shared/chat-agent brainstorm concept and
 * NEVER imports or invokes the offlineRpc idea-capture stub.
 */

import { getLogger } from '../../../shared/logger.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { registerRunner } from '../../executor.js';
import type { StepRunner, StepRunnerContext, StepRunnerError, StepRunnerLlmPause, StepRunnerOutput } from '../../types.js';
import { BRAINSTORM_CATEGORY_CLASSES } from '../../../shared/brainstorm-classes.js';
import { brainstormElicitSchema, decisionAnswerSchema, decisionDraftSchema } from './schemas.js';

const log = getLogger('workflow:brainstorm:elicit');

// ---------------------------------------------------------------------------
// Draft / running-spec shapes (the daemon side of the loop)
// ---------------------------------------------------------------------------

interface DraftOption {
	readonly label:        string;
	readonly tradeoff?:    string;
	readonly recommended?: boolean;
}

/** One decision the draftProvider proposes for a turn. */
interface DraftedDecision {
	readonly decisionId:     string;
	readonly question:       string;
	readonly options:        readonly DraftOption[];
	readonly groundingNote?: string;
}

/** The mid-tier draftProvider's per-turn output (`decisionDraftSchema`). */
interface DecisionDraft {
	readonly category:         string;
	readonly workingStatement: string;
	readonly nonGoals?:        readonly string[];
	readonly convergence:      boolean;
	readonly decision?:        DraftedDecision;
}

/** A decision the user has answered (folded into the running spec). */
interface AnsweredDecision {
	readonly decisionId:     string;
	readonly question:       string;
	readonly options:        readonly DraftOption[];
	readonly chosenOption:   string;
	readonly groundingNote?: string;
}

/** The opaque blob carried across every pause of the loop (preparedBlob). */
interface ElicitBlob {
	readonly stepId:              'elicit';
	readonly focus:               string;
	readonly category:            string;
	readonly workingStatement:    string;
	readonly nonGoals:            readonly string[];
	readonly answered:            readonly AnsweredDecision[];
	/** The decision presented on THIS turn; null once convergence is proposed. */
	readonly current:             DraftedDecision | null;
	readonly convergenceProposed: boolean;
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

/** Render the reused category vocabulary for the drafter prompt (id — description),
 *  so it classifies against the established taxonomy (c33), never invents one. */
function categoryVocabularyBlock(): string {
	return BRAINSTORM_CATEGORY_CLASSES.map(c => `- ${c.id}: ${c.description}`).join('\n');
}

/** Build the drafter prompt: fold the running spec, classify, and draft the
 *  SINGLE next decision — or propose convergence when no material gap remains. */
function buildDraftPrompt(blob: {
	readonly focus:            string;
	readonly workingStatement: string | null;
	readonly nonGoals:         readonly string[];
	readonly answered:         readonly AnsweredDecision[];
}): { prompt: string; userTurn: string } {
	const prompt = [
		'You are the DRAFTER for the `brainstorm` stage — pre-workflow spec elicitation for a rough one-line idea.',
		'You DRIVE the convergence one decision at a time. Each turn you (a) fold everything decided so far into a',
		'running understanding, (b) classify the request, and (c) draft the SINGLE most important STILL-OPEN decision',
		'to put to the user next — a question with 2–4 concrete options, each with a one-line tradeoff, and exactly',
		'one option flagged `recommended: true` (your best default). Draft ONE decision only — never a batch.',
		'',
		'Ground the decision in what is already settled; do not re-litigate an answered decision. When NO material',
		'decision remains — the intent, scope boundary, and exclusions are pinned — set `convergence: true` and OMIT',
		'`decision` (propose that the spec is done). Otherwise set `convergence: false` and include `decision`.',
		'',
		'`workingStatement` is the current understanding: what the request IS and where it stops. `nonGoals` are the',
		'explicit exclusions accumulated so far (carry them forward; add any the latest answers imply). Classify',
		'`category` against the fixed vocabulary — never invent one.',
		'',
		'Request category vocabulary (pick exactly one `id`):',
		categoryVocabularyBlock(),
	].join('\n');

	const answeredBlock = blob.answered.length === 0
		? '(none yet — this is the first decision)'
		: blob.answered.map((a, i) =>
			`${i + 1}. [${a.decisionId}] ${a.question}\n   → chose: ${a.chosenOption}`).join('\n');

	const userTurn = [
		`The rough idea (focus): ${blob.focus}`,
		'',
		blob.workingStatement !== null ? `Working understanding so far: ${blob.workingStatement}` : 'Working understanding so far: (none yet)',
		blob.nonGoals.length > 0 ? `Non-goals so far: ${blob.nonGoals.join('; ')}` : 'Non-goals so far: (none yet)',
		'',
		'Decisions answered so far:',
		answeredBlock,
		'',
		'Fold the above, then either draft the single next decision, or propose convergence. Emit JSON matching the schema.',
	].join('\n');

	return { prompt, userTurn };
}

/** The system prompt handed to the CONTROLLER on every pause of the loop. */
const PRESENT_SYSTEM = [
	'You are conducting a `brainstorm` elicitation with the user, ONE decision at a time. The daemon has drafted the',
	'material below. Present it to the user faithfully:',
	'  - For a DECISION: show the question and each option with its tradeoff; call out the recommended option as your',
	'    suggestion; ask the user to pick one (or voice a different constraint). Then resume with',
	'    `{ action: "choose", decisionId, chosenOption }` using the EXACT option label the user picked.',
	'  - The user may instead revisit an earlier decision — resume `{ action: "reopen", decisionId }` — or ask to wrap',
	'    up early — resume `{ action: "propose_converge" }`.',
	'  - For a CONVERGENCE PROPOSAL: present the converged understanding + non-goals + the decisions recorded, and ask',
	'    the user to confirm. On explicit confirmation resume `{ action: "final_confirm" }`; if they want to keep',
	'    going, `reopen` a decision instead. Do NOT confirm on the user\'s behalf.',
	'Present exactly ONE recommendation at a time. Do not batch decisions or invent options the daemon did not draft.',
].join('\n');

/** Render the pause's user-turn: the drafted decision, or the convergence proposal. */
function presentUserTurn(blob: ElicitBlob): string {
	const lines: string[] = [];
	lines.push(`Category: ${blob.category}`);
	lines.push(`Working understanding: ${blob.workingStatement}`);
	if (blob.nonGoals.length > 0) lines.push(`Non-goals: ${blob.nonGoals.join('; ')}`);
	lines.push('');
	if (blob.convergenceProposed || blob.current === null) {
		lines.push('CONVERGENCE PROPOSED — the daemon believes the spec is complete.');
		if (blob.answered.length > 0) {
			lines.push('Decisions recorded:');
			blob.answered.forEach((a, i) => lines.push(`  ${i + 1}. [${a.decisionId}] ${a.question} → ${a.chosenOption}`));
		}
		lines.push('');
		lines.push('Present this to the user and ask them to confirm. Resume `final_confirm` only on explicit confirmation;');
		lines.push('otherwise `reopen` a decision by its id to keep refining.');
		return lines.join('\n');
	}
	const d = blob.current;
	lines.push(`DECISION [${d.decisionId}]: ${d.question}`);
	lines.push('Options:');
	for (const o of d.options) {
		const rec = o.recommended ? '  ⟵ recommended' : '';
		const tr = o.tradeoff ? ` — ${o.tradeoff}` : '';
		lines.push(`  • ${o.label}${tr}${rec}`);
	}
	if (d.groundingNote) lines.push(`Note: ${d.groundingNote}`);
	lines.push('');
	lines.push('Present these options to the user, recommend the flagged one, and resume `choose` with their exact pick.');
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Draft call + folding
// ---------------------------------------------------------------------------

function msgs(system: string, user: string): LLMMessage[] {
	return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Draft the next decision through the mid-tier provider. Returns null on a
 *  provider/validation failure OR a malformed non-converging draft (no decision),
 *  which the caller maps to a retryable `draft-failed`. */
async function draftNext(provider: LLMProvider, blob: {
	readonly focus:            string;
	readonly workingStatement: string | null;
	readonly nonGoals:         readonly string[];
	readonly answered:         readonly AnsweredDecision[];
}): Promise<DecisionDraft | null> {
	const { prompt, userTurn } = buildDraftPrompt(blob);
	try {
		const draft = await provider.completeStructured<DecisionDraft>(
			msgs(prompt, userTurn),
			decisionDraftSchema as StructuredSchema,
			{ maxAttempts: 3 },
		);
		if (!draft.convergence && draft.decision === undefined) {
			log.warn({ focus: blob.focus }, 'draftNext: non-converging draft carried no decision');
			return null;
		}
		return draft;
	} catch (err) {
		log.warn({ focus: blob.focus, err: err instanceof Error ? err.message : String(err) }, 'draftNext: draftProvider failed');
		return null;
	}
}

/** Fold a fresh draft into a new blob: refresh the running spec fields and set
 *  the current decision (or mark convergence proposed). */
function foldDraft(base: ElicitBlob, draft: DecisionDraft): ElicitBlob {
	const convergence = draft.convergence === true || draft.decision === undefined;
	return {
		stepId:              'elicit',
		focus:               base.focus,
		category:            draft.category,
		workingStatement:    draft.workingStatement,
		nonGoals:            draft.nonGoals ?? base.nonGoals,
		answered:            base.answered,
		current:             convergence ? null : draft.decision ?? null,
		convergenceProposed: convergence,
	};
}

// ---------------------------------------------------------------------------
// Result builders
// ---------------------------------------------------------------------------

function pauseFor(blob: ElicitBlob): StepRunnerLlmPause {
	return {
		type:         'llm-pause',
		prompt:       PRESENT_SYSTEM,
		userTurn:     presentUserTurn(blob),
		schema:       decisionAnswerSchema,
		preparedBlob: blob,
	};
}

function retryable(code: string, message: string): StepRunnerError {
	return { type: 'error', code, message, retryable: true };
}

const DRAFT_UNAVAILABLE = retryable(
	'draft-provider-unavailable',
	'brainstorm elicit needs a mid-tier draftProvider (role `brainstorm.decision.draft`) but none was supplied — ' +
	'the drive layer must resolve + inject it. The stage never falls back to a cheap/local model; the run stays paused.',
);

const DRAFT_FAILED = retryable(
	'draft-failed',
	'the draftProvider could not produce a valid next decision after retries — the run stays paused; re-send to retry.',
);

/** Assemble the UNCHANGED `brainstormElicitSchema` output from the answered
 *  decisions on final confirm. The synthesize step (SOLE SpecArtifact writer)
 *  consumes this exactly as it consumed the old single-turn elicit output. Each
 *  decision's non-chosen options are the ruled-out directions, all folded into
 *  `nonGoals` so a rejected option survives into the record (the S004 invariant). */
function assembleOutput(blob: ElicitBlob): StepRunnerOutput {
	const decisions = blob.answered.map(a => {
		const ruledOut = a.options.filter(o => o.label !== a.chosenOption).map(o => o.label);
		const note = a.groundingNote !== undefined && a.groundingNote.trim().length > 0 ? a.groundingNote : a.question;
		return { chosen: a.chosenOption, ruledOut, reason: note };
	});
	const ruledOutAll = decisions.flatMap(d => d.ruledOut);
	const nonGoals = [...new Set([...blob.nonGoals, ...ruledOutAll])];
	return {
		type:   'output',
		output: {
			category:         blob.category,
			workingStatement: blob.workingStatement,
			openItems:        [],
			confirmed:        true,
			decisions,
			nonGoals,
		},
	};
}

// ---------------------------------------------------------------------------
// The reworked `elicit` runner
// ---------------------------------------------------------------------------

const elicit: StepRunner = {
	id:       'elicit',
	workflow: 'brainstorm',

	async run(ctx) {
		if (ctx.draftProvider === undefined) return DRAFT_UNAVAILABLE;
		const focus = ctx.intent.focus;
		const draft = await draftNext(ctx.draftProvider, {
			focus,
			workingStatement: null,
			nonGoals:         [],
			answered:         [],
		});
		if (draft === null) return DRAFT_FAILED;
		const base: ElicitBlob = {
			stepId: 'elicit', focus, category: draft.category, workingStatement: draft.workingStatement,
			nonGoals: [], answered: [], current: null, convergenceProposed: false,
		};
		return pauseFor(foldDraft(base, draft));
	},

	async finalize(llmResponse, preparedBlob, ctx) {
		const blob = preparedBlob as ElicitBlob;
		const action = String(llmResponse['action'] ?? '');

		if (action === 'choose') {
			if (blob.current === null) {
				return retryable('no-open-decision', 'action `choose` but no decision is open — the spec is at a convergence proposal; `final_confirm` or `reopen`.');
			}
			const decisionId = String(llmResponse['decisionId'] ?? '');
			if (decisionId !== blob.current.decisionId) {
				return retryable('unknown-decision', `answer names decision '${decisionId}' but the open decision is '${blob.current.decisionId}'.`);
			}
			const chosen = String(llmResponse['chosenOption'] ?? '');
			if (!blob.current.options.some(o => o.label === chosen)) {
				return retryable('unknown-option', `'${chosen}' is not one of the presented options for '${blob.current.decisionId}'.`);
			}
			const answered: AnsweredDecision[] = [...blob.answered, {
				decisionId:   blob.current.decisionId,
				question:     blob.current.question,
				options:      blob.current.options,
				chosenOption: chosen,
				...(blob.current.groundingNote !== undefined ? { groundingNote: blob.current.groundingNote } : {}),
			}];
			if (ctx.draftProvider === undefined) return DRAFT_UNAVAILABLE;
			const draft = await draftNext(ctx.draftProvider, {
				focus:            blob.focus,
				workingStatement: blob.workingStatement,
				nonGoals:         blob.nonGoals,
				answered,
			});
			if (draft === null) return DRAFT_FAILED;
			return pauseFor(foldDraft({ ...blob, answered, current: null, convergenceProposed: false }, draft));
		}

		if (action === 'reopen') {
			const decisionId = String(llmResponse['decisionId'] ?? '');
			const idx = blob.answered.findIndex(a => a.decisionId === decisionId);
			if (idx < 0) {
				return retryable('unknown-decision', `cannot reopen '${decisionId}' — no such answered decision.`);
			}
			const reopened = blob.answered[idx]!;
			const answered = blob.answered.filter((_, i) => i !== idx);
			const current: DraftedDecision = {
				decisionId: reopened.decisionId,
				question:   reopened.question,
				options:    reopened.options,
				...(reopened.groundingNote !== undefined ? { groundingNote: reopened.groundingNote } : {}),
			};
			return pauseFor({ ...blob, answered, current, convergenceProposed: false });
		}

		if (action === 'propose_converge') {
			return pauseFor({ ...blob, current: null, convergenceProposed: true });
		}

		if (action === 'final_confirm') {
			if (!blob.convergenceProposed) {
				return retryable('not-confirmed', 'action `final_confirm` before convergence was proposed — answer the open decision, or `propose_converge` first.');
			}
			return assembleOutput(blob);
		}

		return retryable('unknown-action', `unrecognized elicit action '${action}'.`);
	},
};

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
