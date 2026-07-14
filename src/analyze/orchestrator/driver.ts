/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Orchestrator -- the analyze pipeline's end-to-end driver.
 *
 * Flow:
 *   1. classify(userPrompt, scopeRef)               -> ClassifiedIntent
 *   2. shaperFor('run', intent.target)
 *        .buildRunBundle({intent}, {runId})         -> ContextBundle
 *   3. runRecursivePlanner({input, opts})           -> PlanTreeNode
 *   4. runExecutor({tree, intent, runId})           -> ExecutorResult
 *
 * Each stage transition patches <runRoot>/run.json so resume + the
 * IDE can observe progress. Typed errors from each stage map to
 * stable RunErrorCode values; the orchestrator never papers over an
 * underlying error -- it wraps + persists + returns a tagged-union
 * failure.
 *
 * Skipped intentionally in this revision (separate phases):
 *   - workspace warnings + clarify step (between classify + plan)
 *   - resume: if <runRoot>/run.json shows stage='done' or has a
 *     stale failure, the driver currently re-runs from scratch
 *   - analyze.run.start IPC (this driver is the in-process API;
 *     the RPC layer is one wrapper call away)
 */

import { getLogger } from '../../shared/logger.js';

import { classify, pickScope } from '../classifier/index.js';
import {
	ClassifierLlmUnavailableError,
	ClassifierPromptMissingError,
	ClassifierSchemaUnrecoverable,
	ClassifierValidationExhausted,
} from '../classifier/driver.js';
import { shaperFor } from '../context/index.js';
import {
	ShaperLlmUnavailableError,
	ShaperPromptMissingError,
	ShaperSchemaUnrecoverable,
	ShaperToolLoopExhausted,
} from '../context/driver.js';
import { ScopeNotIndexedError } from '../context/invariants.js';
import type { ShaperTraceEvent } from '../context/types.js';
import {
	getTemplatesForTarget,
	MaxPlanDepthExceededError,
	PlanBuilderExhausted,
	PlanBuilderLlmUnavailableError,
	PlanBuilderPromptMissingError,
	PlanBuilderSchemaUnrecoverable,
	runRecursivePlanner,
} from '../planner/index.js';
import { runExecutor } from '../executor/index.js';

import { readRunRecord, writeRunRecord } from './persistence.js';
import type {
	AnalyzeRunEvent,
	RunAnalyzeArgs,
	RunAnalyzeOpts,
	RunAnalyzeResult,
	RunFailure,
	RunRecord,
	RunStage,
} from './types.js';
import type {
	AnalyzeScope,
	ClassifiedIntent,
} from '../../shared/analyze-types.js';

const log = getLogger('analyze:orchestrator:driver');

// ---------------------------------------------------------------------------
// runAnalyze -- public entry point
// ---------------------------------------------------------------------------

export async function runAnalyze(
	args: RunAnalyzeArgs,
	opts: RunAnalyzeOpts = {},
): Promise<RunAnalyzeResult> {
	const start = Date.now();
	const { runId, userPrompt, scopeRef: initialScopeRef } = args;

	// Local emit() that swallows callback exceptions so a broken
	// subscriber can't take the run down. The `done` event is the
	// only one the orchestrator GUARANTEES fires; intermediate events
	// are best-effort observers.
	const emit = (event: AnalyzeRunEvent): void => {
		if (opts.onEvent === undefined) return;
		try { opts.onEvent(event); }
		catch (err) {
			log.warn({ runId, eventType: event.type, err: (err as Error).message },
				'runAnalyze: onEvent callback threw; ignoring');
		}
	};

	// emitDoneAndReturn wraps every terminal exit -- success, failure,
	// cache hit -- to keep the "done fires EXACTLY ONCE" invariant in
	// one place.
	const emitDoneAndReturn = (result: RunAnalyzeResult): RunAnalyzeResult => {
		emit({ type: 'done', result });
		return result;
	};

	// (resume) If <runRoot>/run.json shows a previously-completed run
	// (status='ok' + stage='done' + intent + finalReport all present),
	// short-circuit and return the cached result. See O3 commit for
	// the full rationale on which records DO and DON'T short-circuit.
	const cached = readRunRecord(runId);
	if (
		cached !== null
		&& cached.status === 'ok'
		&& cached.stage === 'done'
		&& cached.intent !== undefined
		&& cached.finalReport !== undefined
	) {
		log.info({ runId }, 'runAnalyze: resume cache hit; returning persisted RunAnalyzeOk');
		return emitDoneAndReturn({
			ok: true,
			runId: cached.runId,
			intent: cached.intent,
			finalReport: cached.finalReport,
			tasksCompleted: cached.tasksCompleted ?? 0,
			tasksFailed: cached.tasksFailed ?? [],
			durationMs: 0,
		});
	}

	// (0) Stamp the initial RunRecord so observers (IDE, resume) see
	//     the run exists even if stage 1 hangs.
	let record: RunRecord = {
		runId,
		createdAt: nowIso(),
		updatedAt: nowIso(),
		userPrompt,
		initialScopeRef,
		stage: 'classify',
		status: 'in-progress',
	};
	writeRunRecord(record);

	// Pre-stage abort check helper. Returns a terminal fail result
	// when aborted; caller short-circuits with it.
	const checkAborted = (stage: RunStage, intent?: ClassifiedIntent): RunAnalyzeResult | null => {
		if (opts.signal?.aborted !== true) return null;
		const failure: RunFailure = {
			code: 'aborted',
			message: `runAnalyze: aborted before stage='${stage}' could start`,
		};
		record = patch(record, {
			stage,
			status: 'failed',
			error: failure,
			...(intent !== undefined ? { intent } : {}),
		});
		writeRunRecord(record);
		log.info({ runId, stage }, 'runAnalyze: aborted via signal');
		return failResult(stage, failure, intent, start, runId);
	};

	// ----- (1) Classify -----
	{
		const abortedHere = checkAborted('classify');
		if (abortedHere !== null) return emitDoneAndReturn(abortedHere);
	}
	emit({ type: 'stage-started', stage: 'classify' });

	let intent: ClassifiedIntent;
	if (args.targetHint !== undefined) {
		// Skip the full classifier -- caller (chat panel slash command)
		// has explicitly picked the target. Saves the ~3-min classifier
		// round-trip. But the classifier ALSO picks the scope band; if
		// the slash command didn't append :xs|:s|:m|:l|:xl we run a
		// cheap scope-only picker (~30 s) instead of hardcoding 'M'
		// (ISSUES.md I-001). The picker sees a compact workspace-signals
		// block + the user prompt and returns a scope enum + reasoning.
		// Falls back to 'M' if the picker throws.
		let pickedScope: AnalyzeScope;
		let pickReasoning: string;
		if (args.scopeHint !== undefined) {
			pickedScope = args.scopeHint;
			pickReasoning = 'scope hinted via slash command suffix';
		} else {
			emit({
				type: 'stage-substep',
				stage: 'classify',
				substep: 'scope-picker',
				detail: 'picking scope band',
			});
			try {
				const picked = await pickScope({
					userPrompt,
					target:   args.targetHint,
					scopeRef: initialScopeRef,
					runId,
				});
				pickedScope   = picked.scope;
				pickReasoning = picked.reasoning;
			} catch (err) {
				// Preserve the slash-command promise: don't fail the whole
				// run just because the picker had a hiccup. Fall back to
				// M with a note in the reasoning so downstream stages
				// (and the run.json) can see why.
				pickedScope   = 'M';
				pickReasoning = `scope-picker failed (${(err as Error).message}); ` +
					'falling back to default scope=M';
				log.warn(
					{ runId, err: (err as Error).message },
					'runAnalyze: scope-picker failed; falling back to M',
				);
			}
		}
		intent = {
			target: args.targetHint,
			scope:  pickedScope,
			focused: false,
			scopeRef: initialScopeRef,
			reasoning: `target hinted via slash command (classifier skipped); ${pickReasoning}`,
		};
		log.info(
			{
				runId,
				target: intent.target,
				scope:  intent.scope,
				source: args.scopeHint !== undefined ? 'scopeHint' : 'scope-picker',
			},
			'runAnalyze: classifier skipped via targetHint',
		);
	} else {
		try {
			intent = await classify({
				input: { userPrompt, scopeRef: initialScopeRef },
				opts: { runId },
			});
		} catch (err) {
			const failure = classifyClassifierError(err);
			record = patch(record, { stage: 'classify', status: 'failed', error: failure });
			writeRunRecord(record);
			log.warn({ runId, code: failure.code }, 'runAnalyze: classify failed');
			return emitDoneAndReturn(failResult('classify', failure, undefined, start, runId));
		}
	}
	emit({ type: 'classified', intent });
	record = patch(record, { stage: 'plan', intent });
	writeRunRecord(record);
	log.info({ runId, target: intent.target, scope: intent.scope }, 'runAnalyze: classified');

	// ----- (2) Build run-level context bundle + (3) plan -----
	{
		const abortedHere = checkAborted('plan', intent);
		if (abortedHere !== null) return emitDoneAndReturn(abortedHere);
	}
	emit({ type: 'stage-started', stage: 'plan' });

	// The plan stage has two multi-minute sub-steps that would
	// otherwise sit silent (see ISSUES.md I-002). Emit stage-substep
	// events at their boundaries so the UI has something to show
	// during the 5-15 min plan window.
	emit({
		type: 'stage-substep',
		stage: 'plan',
		substep: 'bundle-shaper',
		detail: `building ${intent.target}/${intent.scope} run bundle`,
	});
	let contextBundle;
	try {
		const shaper = shaperFor('run', intent.target);
		contextBundle = await shaper.buildRunBundle(
			{ intent },
			{
				runId,
				onTrace: (traceEvent) => forwardShaperTrace('plan', traceEvent, emit),
			},
		);
	} catch (err) {
		const failure = classifyShaperError(err);
		record = patch(record, { stage: 'plan', status: 'failed', error: failure });
		writeRunRecord(record);
		log.warn({ runId, code: failure.code }, 'runAnalyze: bundle build failed');
		return emitDoneAndReturn(failResult('plan', failure, intent, start, runId));
	}
	emit({
		type: 'stage-substep',
		stage: 'plan',
		substep: 'planner',
		detail: 'composing task list',
	});

	let tree;
	try {
		tree = await runRecursivePlanner({
			input: {
				intent,
				contextBundle,
				catalog: getTemplatesForTarget(intent.target),
			},
			opts: {
				runId,
				onLlmToken: (preview) => emit({
					type:    'llm-token',
					stage:   'plan',
					substep: 'planner',
					preview,
				}),
			},
		});
	} catch (err) {
		const failure = classifyPlannerError(err);
		record = patch(record, { stage: 'plan', status: 'failed', error: failure });
		writeRunRecord(record);
		log.warn({ runId, code: failure.code }, 'runAnalyze: plan build failed');
		return emitDoneAndReturn(failResult('plan', failure, intent, start, runId));
	}
	emit({
		type: 'plan-accepted',
		taskCount: tree.plan.tasks.length,
		planId: tree.plan.planId,
	});
	record = patch(record, { stage: 'execute' });
	writeRunRecord(record);

	// ----- (4) Execute -----
	{
		const abortedHere = checkAborted('execute', intent);
		if (abortedHere !== null) return emitDoneAndReturn(abortedHere);
	}
	emit({ type: 'stage-started', stage: 'execute' });

	// S2: wire per-task events from the executor through opts.onEvent.
	// The executor's TaskExecutionEvent shape matches our AnalyzeRunEvent
	// task-started / task-completed variants 1:1; we just pass them
	// through. parentTaskPath threads naturally for tasks inside child
	// plans dispatched by planner-template tasks.
	const execResult = await runExecutor({
		tree,
		intent,
		runId,
		onTaskEvent: (event) => {
			if (event.type === 'task-started') {
				emit({
					type: 'task-started',
					taskId: event.taskId,
					template: event.template,
					index: event.index,
					total: event.total,
					...(event.parentTaskPath !== undefined ? { parentTaskPath: event.parentTaskPath } : {}),
				});
			} else {
				emit({
					type: 'task-completed',
					taskId: event.taskId,
					status: event.status,
					...(event.parentTaskPath !== undefined ? { parentTaskPath: event.parentTaskPath } : {}),
				});
			}
		},
	});
	const rootPlan = execResult.root;

	if (rootPlan.finalReport === undefined) {
		const failure: RunFailure = {
			code: 'executor-aggregator-failed',
			message: 'Run executor completed but the aggregator produced no report.',
			data: {
				tasksCompleted: rootPlan.tasksCompleted,
				tasksFailed: rootPlan.tasksFailed,
			},
		};
		record = patch(record, {
			stage: 'execute',
			status: 'failed',
			error: failure,
			tasksCompleted: rootPlan.tasksCompleted,
			tasksFailed: rootPlan.tasksFailed,
		});
		writeRunRecord(record);
		log.warn({ runId, tasksFailed: rootPlan.tasksFailed.length }, 'runAnalyze: aggregator failed');
		return emitDoneAndReturn(failResult('execute', failure, intent, start, runId));
	}

	// ----- (done) -----
	record = patch(record, {
		stage: 'done',
		status: 'ok',
		finalReport: rootPlan.finalReport,
		tasksCompleted: rootPlan.tasksCompleted,
		tasksFailed: rootPlan.tasksFailed,
	});
	writeRunRecord(record);
	const durationMs = Date.now() - start;
	log.info(
		{ runId, tasksCompleted: rootPlan.tasksCompleted, tasksFailed: rootPlan.tasksFailed.length, durationMs },
		'runAnalyze: ok',
	);

	return emitDoneAndReturn({
		ok: true,
		runId,
		intent,
		finalReport: rootPlan.finalReport,
		tasksCompleted: rootPlan.tasksCompleted,
		tasksFailed: rootPlan.tasksFailed,
		durationMs,
	});
}

// ---------------------------------------------------------------------------
// Per-stage error classifiers
// ---------------------------------------------------------------------------

function classifyClassifierError(err: unknown): RunFailure {
	if (err instanceof ClassifierLlmUnavailableError) return wrap('classifier-llm-unavailable', err);
	if (err instanceof ClassifierSchemaUnrecoverable) return wrap('classifier-schema-unrecoverable', err);
	if (err instanceof ClassifierValidationExhausted) return wrap('classifier-validation-exhausted', err);
	if (err instanceof ClassifierPromptMissingError) return wrap('classifier-prompt-missing', err);
	// Scope-ref errors come from the classifier's intent-validator as
	// plain Error with stable messages; pattern-match.
	if (err instanceof Error) {
		if (/scope-ref-unresolved/.test(err.message)) return wrap('scope-ref-unresolved', err);
		if (/scope-ref-kind-target-mismatch/.test(err.message)) return wrap('scope-ref-kind-target-mismatch', err);
	}
	return wrap('internal-error', err);
}

function classifyShaperError(err: unknown): RunFailure {
	if (err instanceof ScopeNotIndexedError) {
		return {
			code: 'scope-not-indexed',
			message: err.message,
			data: { scopePath: err.scopePath, registeredAs: err.registeredAs },
		};
	}
	if (err instanceof ShaperLlmUnavailableError) return wrap('shaper-llm-unavailable', err);
	if (err instanceof ShaperToolLoopExhausted) return wrap('shaper-tool-loop-exhausted', err);
	if (err instanceof ShaperSchemaUnrecoverable) return wrap('shaper-schema-unrecoverable', err);
	if (err instanceof ShaperPromptMissingError) return wrap('shaper-prompt-missing', err);
	return wrap('internal-error', err);
}

function classifyPlannerError(err: unknown): RunFailure {
	if (err instanceof MaxPlanDepthExceededError) {
		return {
			code: 'max-plan-depth-exceeded',
			message: err.message,
			data: { currentDepth: err.currentDepth, rootScope: err.rootScope, cap: err.cap },
		};
	}
	if (err instanceof PlanBuilderExhausted) {
		return {
			code: 'plan-invariant-failed',
			message: err.message,
			data: {
				lastFailure: {
					invariantId: err.lastFailure.invariantId,
					message: err.lastFailure.message,
				},
				totalAttempts: err.attempts.length,
			},
		};
	}
	if (err instanceof PlanBuilderLlmUnavailableError) return wrap('plan-builder-llm-unavailable', err);
	if (err instanceof PlanBuilderSchemaUnrecoverable) return wrap('plan-builder-schema-unrecoverable', err);
	if (err instanceof PlanBuilderPromptMissingError) return wrap('plan-builder-prompt-missing', err);
	return wrap('internal-error', err);
}

function wrap(code: RunFailure['code'], err: unknown): RunFailure {
	const message = err instanceof Error ? err.message : String(err);
	return { code, message };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function patch(prev: RunRecord, change: Partial<RunRecord>): RunRecord {
	return { ...prev, ...change, updatedAt: nowIso() };
}

function failResult(
	stage: RunStage,
	failure: RunFailure,
	intent: ClassifiedIntent | undefined,
	start: number,
	runId: string,
): RunAnalyzeResult {
	const durationMs = Date.now() - start;
	return {
		ok: false,
		runId,
		stage,
		error: failure,
		...(intent !== undefined ? { intent } : {}),
		durationMs,
	};
}

function nowIso(): string {
	return new Date().toISOString();
}

/**
 * Translate an in-process `ShaperTraceEvent` from the shaper's tool
 * loop + final structured emit into the wire-transported
 * `AnalyzeRunEvent` variant, then dispatch via the run's emit fn.
 * `stage` names which pipeline stage the trace belongs to
 * ('classify' for buildClassificationBundle, 'plan' for
 * buildRunBundle, 'execute' for task-level buildTaskBundle calls).
 * ISSUES.md I-002.
 */
function forwardShaperTrace(
	stage: 'classify' | 'plan' | 'execute',
	trace: ShaperTraceEvent,
	emit:  (event: AnalyzeRunEvent) => void,
): void {
	switch (trace.type) {
		case 'tool-call':
			emit({
				type:  'shaper-tool-call',
				stage,
				tool:  trace.tool,
				...(trace.argsPreview !== undefined ? { argsPreview: trace.argsPreview } : {}),
			});
			return;
		case 'tool-response':
			emit({
				type:  'shaper-tool-response',
				stage,
				tool:  trace.tool,
				ok:    trace.ok,
				...(trace.notePreview !== undefined ? { notePreview: trace.notePreview } : {}),
			});
			return;
		case 'llm-token':
			emit({
				type:    'llm-token',
				stage,
				substep: 'bundle-shaper',
				preview: trace.preview,
			});
			return;
	}
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const _classifyClassifierErrorForTest = classifyClassifierError;
export const _classifyShaperErrorForTest = classifyShaperError;
export const _classifyPlannerErrorForTest = classifyPlannerError;
