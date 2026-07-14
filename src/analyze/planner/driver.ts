/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plan Builder driver.
 *
 * Pipeline:
 *
 *   1. Load planner.system.md.
 *   2. Build the message list:
 *      - system  = prompt + contract reminder footer
 *      - user    = intent + assembled context bundle Markdown
 *                + DEPTH POLICY BAND + TASK CATALOG +
 *                final emit instruction
 *   3. Call OllamaProvider.completeStructured against
 *      PLAN_TASK_SCHEMA with retry budget for wire-layer faults.
 *   4. Stamp `parentTaskPath` from the call site (NOT from the LLM).
 *      INV-15 enforces presence-iff-not-root.
 *   5. Run validatePlan(plan, catalog, { focused, isChildPlan }).
 *      On failure, append a `## VALIDATOR FEEDBACK` block to the user
 *      message + the rejected plan as an assistant turn, then retry.
 *      Up to `maxAttempts` total (default 3). Exhaustion -> typed
 *      ClassifierLlmUnavailable-style error.
 *
 * No tool-loop: the planner only consumes the context bundle the
 * caller already built.
 *
 * See: design/analyze-plan-builder.md
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAnalyzeConfig } from '../../config/analyze.js';
import { buildShaperProvider } from '../context/shaper-provider.js';
import { getLogger } from '../../shared/logger.js';
import type { LLMMessage, LLMProvider } from '../../shared/types.js';
import { CONTRACT_FOOTER_MD } from '../contract.js';
import { assembleMarkdown } from '../context/bundle.js';

import {
	writeAttempt,
	writeFeedback,
	writePlanFinal,
} from './cache.js';
import { invariantFixHint, renderFixHint } from './invariant-fix-hints.js';
import { renderCatalog, renderDepthPolicy } from './render-catalog.js';
import {
	PLAN_TASK_SCHEMA,
	PLAN_SCHEMA_VERSION,
	validatePlanShapeWithErrors,
} from './schema.js';
import { getTemplatesForTarget } from './templates/registry.js';
import type {
	PlanBuilderInput,
	PlanBuilderOpts,
	PlanTask,
} from './types.js';
import { validatePlan, type PlanValidationFailure } from './validate.js';

const log = getLogger('analyze:planner');

const PLANNER_PROMPT_REL = 'prompts/analyze/planner.system.md';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class PlanBuilderLlmUnavailableError extends Error {
	constructor(cause: string) {
		super(`Local Ollama unavailable for Plan Builder: ${cause}`);
		this.name = 'PlanBuilderLlmUnavailableError';
	}
}

export class PlanBuilderSchemaUnrecoverable extends Error {
	constructor(lastErrors: readonly string[]) {
		super(`Plan Builder structured output unrecoverable: ${lastErrors.join('; ')}`);
		this.name = 'PlanBuilderSchemaUnrecoverable';
	}
}

export class PlanBuilderExhausted extends Error {
	readonly attempts:    readonly PlanTask[];
	readonly failures:    readonly PlanValidationFailure[];
	readonly lastFailure: PlanValidationFailure;

	constructor(attempts: readonly PlanTask[], failures: readonly PlanValidationFailure[]) {
		const last = failures[failures.length - 1]!;
		super(
			`Plan Builder exhausted after ${attempts.length} attempts. ` +
				`Last failure: ${last.invariantId} -- ${last.message}`,
		);
		this.name = 'PlanBuilderExhausted';
		this.attempts = attempts;
		this.failures = failures;
		this.lastFailure = last;
	}
}

export class PlanBuilderPromptMissingError extends Error {
	constructor(promptPath: string) {
		super(`Plan Builder prompt file missing: ${promptPath}`);
		this.name = 'PlanBuilderPromptMissingError';
	}
}

export class MaxPlanDepthExceededError extends Error {
	readonly currentDepth: number;
	readonly rootScope:    string;
	readonly cap:          number;

	constructor(currentDepth: number, rootScope: string, cap: number) {
		super(
			`Plan Builder refused: currentDepth=${currentDepth}+1 exceeds ` +
				`max-plan-depth for root scope ${rootScope} (cap=${cap}). ` +
				`Adjust models.analyze.maxPlanDepth.${rootScope} or restructure ` +
				`the parent plan to use leaf templates instead of planner-template ` +
				`tasks at this depth.`,
		);
		this.name = 'MaxPlanDepthExceededError';
		this.currentDepth = currentDepth;
		this.rootScope = rootScope;
		this.cap = cap;
	}
}

// ---------------------------------------------------------------------------
// runPlanner -- public entry point
// ---------------------------------------------------------------------------

export interface RunPlannerArgs {
	readonly input:     PlanBuilderInput;
	readonly opts:      PlanBuilderOpts;
	readonly provider?: LLMProvider | undefined;
}

export async function runPlanner(args: RunPlannerArgs): Promise<PlanTask> {
	const cfg = loadAnalyzeConfig();
	const { input, opts } = args;
	const { intent, contextBundle, parentTaskPath, catalog: catalogArg } = input;

	// (0) Depth cap. The Plan Builder refuses to invoke when
	// currentDepth + 1 would exceed the root scope's ceiling. Fires
	// BEFORE any LLM cost is paid.
	const currentDepth = input.currentDepth ?? 0;
	const rootScope = input.rootScope ?? intent.scope;
	const cap = cfg.maxPlanDepth[rootScope];
	if (currentDepth + 1 > cap) {
		throw new MaxPlanDepthExceededError(currentDepth, rootScope, cap);
	}

	// (1) Catalog: use the provided catalog or fall back to the
	// registered builtins filtered to this plan's target.
	const catalog = catalogArg.length > 0
		? catalogArg
		: getTemplatesForTarget(intent.target);

	// (2) Prompt load.
	const promptContent = loadPromptFile();

	// (3) Provider.
	const provider = args.provider ?? buildShaperProvider(cfg);

	// (4) Initial messages.
	const bundleMd = assembleMarkdown(contextBundle);
	let messages = buildInitialMessages({
		promptContent,
		bundleMd,
		intent,
		catalog,
		parentTaskPath,
	});

	const attempts: PlanTask[] = [];
	const failures: PlanValidationFailure[] = [];
	const maxAttempts = cfg.shaper.structuredOutputRetries;
	const persistArgs = parentTaskPath !== undefined
		? { runId: opts.runId, parentTaskPath }
		: { runId: opts.runId };

	// Live-preview state for the planner's structured emit. Mirrors
	// the shaper's throttling in analyze/context/driver.ts: emit
	// snapshots when >=250ms have passed OR >=400 chars are new,
	// preview cap 240 chars. Reset per attempt so the widget's line
	// tracks the current attempt, not the historical accumulation.
	const onLlmToken = opts.onLlmToken;
	let acc = '';
	let lastEmit = 0;
	let lastEmitLen = 0;
	const onStreamToken = onLlmToken === undefined ? undefined : (delta: string) => {
		acc += delta;
		const now = Date.now();
		const bytesSince = acc.length - lastEmitLen;
		if (now - lastEmit >= 250 || bytesSince >= 400) {
			lastEmit = now;
			lastEmitLen = acc.length;
			onLlmToken(acc.length > 240 ? acc.slice(-240) : acc);
		}
	};

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		acc = ''; lastEmit = 0; lastEmitLen = 0;  // reset preview per attempt
		let raw: PlanTask;
		try {
			raw = await provider.completeStructured<PlanTask>(
				messages,
				PLAN_TASK_SCHEMA as Record<string, unknown>,
				{
					maxAttempts:     cfg.shaper.structuredOutputRetries,
					disableThinking: true,
					// Plans for L/XL scopes routinely produce 30-80 tasks
					// each with consumes/produces arrays + a rationale; 8K
					// is too tight. Use the same shaper budget.
					maxTokens:       cfg.shaper.ollamaNumPredict,
					...(onStreamToken !== undefined ? { onToken: onStreamToken } : {}),
				},
			);
		} catch (err) {
			throw classifyError(err);
		}

		// Stamp parentTaskPath from the call site (INV-15). The LLM
		// may or may not have emitted it; either way the call site is
		// authoritative.
		const stamped: PlanTask = (() => {
			const { parentTaskPath: _ignored, ...rest } = raw;
			return parentTaskPath !== undefined
				? { ...rest, parentTaskPath }
				: rest;
		})();

		// Wire-layer re-validation (defensive).
		const shape = validatePlanShapeWithErrors(stamped);
		if (!shape.ok) {
			throw new PlanBuilderSchemaUnrecoverable(shape.errors);
		}

		// Persist this attempt to the audit trail BEFORE the validator
		// runs -- so a mid-validation crash still leaves the attempt on
		// disk for diagnosis.
		writeAttempt(persistArgs, attempt + 1, stamped);

		// Semantic invariants.
		const failure = validatePlan(stamped, catalog, {
			focused:     intent.focused,
			isChildPlan: parentTaskPath !== undefined,
		});
		if (failure === null) {
			// Promote the accepted attempt to the final slot.
			writePlanFinal(persistArgs, stamped);
			log.info(
				{
					runId:       opts.runId,
					target:      stamped.target,
					scope:       stamped.scope,
					taskCount:   stamped.tasks.length,
					attempt:     attempt + 1,
					isChildPlan: parentTaskPath !== undefined,
				},
				'Plan Builder accepted',
			);
			return stamped;
		}

		// Snapshot the prior-failure history BEFORE pushing the new one
		// so `appendCorrectionTurn` can detect repeats without seeing
		// the current failure in the list. ISSUES.md I-004: same
		// (invariantId, target) two attempts in a row escalates the
		// note wording so qwen3.6 treats it as "change approach"
		// rather than "try again".
		const priorFailures = [...failures];
		attempts.push(stamped);
		failures.push(failure);

		// Persist the validator feedback alongside the rejected attempt
		// so the audit trail has both halves of the round-trip.
		writeFeedback(persistArgs, attempt + 1, failure);

		log.info(
			{
				runId:       opts.runId,
				attempt:     attempt + 1,
				invariantId: failure.invariantId,
				message:     failure.message,
				repeatOfPrevious: priorFailures.length > 0 &&
					priorFailures[priorFailures.length - 1]!.invariantId === failure.invariantId,
			},
			'Plan Builder validation failure -- corrective retry',
		);

		messages = appendCorrectionTurn(messages, stamped, failure, priorFailures);
	}

	throw new PlanBuilderExhausted(attempts, failures);
}

// ---------------------------------------------------------------------------
// Message composition
// ---------------------------------------------------------------------------

interface BuildMessagesArgs {
	readonly promptContent:    string;
	readonly bundleMd:         string;
	readonly intent:           PlanBuilderInput['intent'];
	readonly catalog:          PlanBuilderInput['catalog'];
	readonly parentTaskPath?:  string | undefined;
}

function buildInitialMessages(args: BuildMessagesArgs): LLMMessage[] {
	const { promptContent, bundleMd, intent, catalog, parentTaskPath } = args;

	const systemContent = `${promptContent.trimEnd()}\n\n${CONTRACT_FOOTER_MD}`;

	const parentNote = parentTaskPath !== undefined
		? `\n**Child plan**: this plan is being built for parent task \`${parentTaskPath}\`. ` +
		  `Do NOT emit \`parentTaskPath\` -- the framework stamps it from the call site.\n`
		: '\n';

	const userContent =
		`PlanSchemaVersion: ${PLAN_SCHEMA_VERSION}\n` +
		`\n` +
		`## Intent\n` +
		'```json\n' +
		JSON.stringify(intent, null, 2) +
		'\n```\n' +
		parentNote +
		`\n` +
		`## Context bundle\n` +
		bundleMd +
		`\n\n` +
		`## DEPTH POLICY BAND (this plan)\n` +
		renderDepthPolicy(intent.scope, intent.focused) +
		`\n` +
		`## TASK CATALOG (emit task ids from here only)\n` +
		renderCatalog(catalog) +
		`\n` +
		`## OUTPUT SHAPE\n` +
		'```json\n' +
		JSON.stringify(PLAN_TASK_SCHEMA, null, 2) +
		'\n```\n' +
		`\n` +
		`## TASK\n` +
		`Emit the PlanTask JSON object now. ONLY the JSON object -- no markdown fences, no prose.`;

	return [
		{ role: 'system', content: systemContent },
		{ role: 'user',   content: userContent },
	];
}

function appendCorrectionTurn(
	prior:         LLMMessage[],
	rejected:      PlanTask,
	failure:       PlanValidationFailure,
	priorFailures: readonly PlanValidationFailure[],
): LLMMessage[] {
	const hint = invariantFixHint(failure.invariantId);
	const fixHintBlock = renderFixHint(hint);
	const offendingTaskBlock = renderOffendingTaskSnippet(rejected, failure);
	const repetitionBanner = repetitionBannerFor(failure, priorFailures);

	return [
		...prior,
		{ role: 'assistant', content: JSON.stringify(rejected) },
		{
			role:    'user',
			content:
				`## VALIDATOR FEEDBACK\n` +
				`The plan failed invariant **${failure.invariantId}**:\n` +
				`> ${failure.message}\n` +
				`\n` +
				(failure.target !== undefined
					? `Pointer: \`${JSON.stringify(failure.target)}\`\n\n`
					: '\n') +
				repetitionBanner +
				offendingTaskBlock +
				fixHintBlock +
				`\n\n` +
				`Emit the corrected PlanTask JSON. Fix ONLY the named issue -- keep the ` +
				`rest of the plan intact. Respond with ONLY the JSON object -- no markdown ` +
				`fences, no prose.`,
		},
	];
}

/**
 * When failure.target names a specific task (by index or taskId),
 * render a focused snippet of that task's { taskId, template, kind,
 * params, produces, consumes, rationale } so the model can see
 * exactly what it emitted for the task it's being asked to fix.
 *
 * The full rejected plan is ALREADY visible in the assistant turn
 * above; this snippet just highlights the offender + gives the
 * model a concrete "here's what you wrote" anchor.
 *
 * Returns an empty string when the failure isn't task-scoped (INV-1,
 * INV-13, INV-14 plan-level, INV-15).
 */
function renderOffendingTaskSnippet(
	rejected: PlanTask,
	failure:  PlanValidationFailure,
): string {
	if (failure.target === undefined) return '';
	const target = failure.target;

	// Prefer taskId match; fall back to index.
	const targetTaskId = typeof target['taskId'] === 'string' ? target['taskId'] as string : undefined;
	const targetIndex  = typeof target['index']  === 'number' ? target['index']  as number : undefined;

	let offending;
	if (targetTaskId !== undefined) {
		offending = rejected.tasks.find(t => t.taskId === targetTaskId);
	} else if (targetIndex !== undefined) {
		offending = rejected.tasks[targetIndex];
	}
	if (offending === undefined) return '';

	const snippet = {
		taskId:    offending.taskId,
		template:  offending.template,
		kind:      offending.kind,
		produces:  offending.produces,
		consumes:  offending.consumes ?? [],
		params:    offending.params,
		rationale: offending.rationale,
	};
	return (
		`## OFFENDING TASK (what you emitted)\n` +
		'```json\n' +
		JSON.stringify(snippet, null, 2) +
		'\n```\n\n'
	);
}

/**
 * When the same (invariantId, taskId) failed on the previous attempt,
 * escalate the note wording so the model treats the retry as
 * "change your approach" rather than "try again in the same way".
 * Repetition-key uses (invariantId, target.taskId ?? target.index)
 * as identity -- distinguishes "same violation on same task" from
 * "same invariant but different task".
 */
function repetitionBannerFor(
	current: PlanValidationFailure,
	prior:   readonly PlanValidationFailure[],
): string {
	if (prior.length === 0) return '';
	const previous = prior[prior.length - 1]!;
	if (previous.invariantId !== current.invariantId) return '';
	if (targetIdentity(previous) !== targetIdentity(current)) return '';

	// Same violation on the same task/pointer as the last attempt.
	return (
		`## REPEATED FAILURE\n` +
		`You just emitted the SAME violation (\`${current.invariantId}\` on the ` +
		`same target) as your previous attempt. Your last correction did NOT ` +
		`fix the problem -- it re-introduced it.\n` +
		`\n` +
		`Try a DIFFERENT remedy from the menu below this time. Do NOT re-emit ` +
		`a plan with the same structural mistake.\n\n`
	);
}

function targetIdentity(f: PlanValidationFailure): string {
	if (f.target === undefined) return '<no-target>';
	const t = f.target;
	if (typeof t['taskId'] === 'string') return `taskId:${t['taskId'] as string}`;
	if (typeof t['index']  === 'number') return `index:${String(t['index'])}`;
	return JSON.stringify(t);
}

// ---------------------------------------------------------------------------
// Prompt loading + provider construction
// ---------------------------------------------------------------------------

function loadPromptFile(): string {
	const abs = isAbsolute(PLANNER_PROMPT_REL)
		? PLANNER_PROMPT_REL
		: resolveRelativeToInsrcRoot(PLANNER_PROMPT_REL);
	try {
		return readFileSync(abs, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new PlanBuilderPromptMissingError(abs);
		}
		throw err;
	}
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/planner/driver.js -> .../analyze/planner -> .../analyze -> .../insrc
	const insrcRoot = resolve(thisFile, '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}

// ---------------------------------------------------------------------------
// Error classification (mirrors the shaper + classifier surface)
// ---------------------------------------------------------------------------

const UNAVAILABLE_PATTERNS = [
	'Ollama is not running',
	'Model not found',
	'ECONNREFUSED',
	'ECONNRESET',
	'fetch failed',
	'socket hang up',
	'EPIPE',
	'other side closed',
	'Did not receive done or success response in stream',
];

function classifyError(err: unknown): Error {
	if (!(err instanceof Error)) return new Error(String(err));
	const msg = err.message;
	for (const pat of UNAVAILABLE_PATTERNS) {
		if (msg.includes(pat)) return new PlanBuilderLlmUnavailableError(msg);
	}
	return new PlanBuilderSchemaUnrecoverable([msg]);
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const PLANNER_PROMPT_PATH = PLANNER_PROMPT_REL;
export const _buildInitialMessagesForTest = buildInitialMessages;
export const _appendCorrectionTurnForTest = appendCorrectionTurn;
export const _classifyErrorForTest = classifyError;
