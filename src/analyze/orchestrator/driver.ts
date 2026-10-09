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
import { validateIntentSemantics } from '../classifier/validate.js';
import { connectionIsRegistered } from '../context/scope.js';
import {
	ClassifierLlmUnavailableError,
	ClassifierPromptMissingError,
	ClassifierSchemaUnrecoverable,
	ClassifierValidationExhausted,
} from '../classifier/driver.js';
import { shaperFor } from '../context/index.js';
import {
	ShaperAnswerStepFailedError,
	ShaperInvalidInputError,
	ShaperLlmUnavailableError,
	ShaperNoPlanError,
	ShaperPromptMissingError,
	ShaperSchemaUnrecoverable,
	ShaperToolLoopExhausted,
	toolLoopExhaustedData,
} from '../context/driver.js';
import { scopeErrorMapping } from '../context/invariants.js';
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
import { collectPlanSources, runExecutor } from '../executor/index.js';
import { resolveTaskScope } from '../runtimes/shared/task-scope.js';
import type { ExecutorResult } from '../executor/types.js';
import type { PlanTreeNode } from '../planner/recursive.js';
import {
	deriveAnswerReport,
	mergeAnswerReports,
	renderCompletenessLine,
	RUN_COMPLETENESS_NOT_RECORDED,
	type AnswerReport,
} from '../completeness.js';

import { liveRunCount, lowerRunLive, raiseRunLive } from './live-runs.js';
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
	AnalyzeScopeRef,
	AnalyzeTarget,
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
	const runId = args.runId;

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

	// What the run has reached, for the handler of an error nothing else
	// catches. The stage starts as 'classify', the first stage and the one the
	// initial record carries, so an error raised before any stage has started
	// is reported there.
	const reached: RunReached = { stage: 'classify', record: undefined, intent: undefined };

	// The run is live from here, before its first read of a record, until it
	// returns or throws.
	raiseRunLive(runId);
	try {
		return await runStages(args, opts, { start, emit, emitDoneAndReturn, reached });
	} catch (err) {
		// An error no stage's own handler caught. The run does not leave as a
		// rejection: its record says failed at the stage reached, and that
		// failure is returned.
		const failure: RunFailure = { code: 'internal-error', message: err instanceof Error ? err.message : String(err) };
		log.error({ runId, stage: reached.stage, err: failure.message }, 'runAnalyze: uncaught error; the run is recorded as failed');
		try {
			// The record is marked failed only when it is this run's to mark:
			//   - a record that already says how a run ended ('ok' or 'failed') is
			//     left as it is, also when the error was raised after that write;
			//   - while another run is going under the same id the record is shared
			//     and the run still going writes it, so this run leaves it alone.
			const onDisk = readRunRecord(runId);
			if (onDisk !== null && onDisk.status !== 'in-progress') {
				log.warn({ runId, status: onDisk.status, stage: onDisk.stage }, 'runAnalyze: the run record already says how the run ended; it is left as it is');
			} else if (liveRunCount(runId) > 1) {
				log.warn({ runId }, 'runAnalyze: another run is going under this id; the shared run record is left to it');
			} else {
				const base: RunRecord = reached.record ?? {
					runId, createdAt: nowIso(), updatedAt: nowIso(),
					userPrompt: args.userPrompt, initialScopeRef: args.scopeRef,
					stage: reached.stage, status: 'in-progress',
				};
				writeRunRecord(patch(base, {
					stage: reached.stage, status: 'failed', error: failure,
					...(reached.intent !== undefined ? { intent: reached.intent } : {}),
				}));
			}
		} catch (writeErr) {
			// The disk may be the very cause of the first error. The record is left
			// as it was; the run is no longer live, so a reader corrects it.
			log.error({ runId, err: (writeErr as Error).message }, 'runAnalyze: the failed run record could not be written');
		}
		return emitDoneAndReturn(failResult(reached.stage, failure, reached.intent, start, runId));
	} finally {
		lowerRunLive(runId);
	}
}

/** What a run has reached: kept current by runStages, read by runAnalyze's handler. */
interface RunReached {
	stage:  RunStage;
	record: RunRecord | undefined;
	intent: ClassifiedIntent | undefined;
}

interface RunStagesContext {
	readonly start:             number;
	readonly emit:              (event: AnalyzeRunEvent) => void;
	readonly emitDoneAndReturn: (result: RunAnalyzeResult) => RunAnalyzeResult;
	readonly reached:           RunReached;
}

/**
 * The run's stages, from its first read of an existing record onward. Every
 * failure a stage knows is turned into a returned failure here; anything else
 * is thrown to runAnalyze's handler.
 */
async function runStages(
	args: RunAnalyzeArgs,
	opts: RunAnalyzeOpts,
	ctx:  RunStagesContext,
): Promise<RunAnalyzeResult> {
	const { start, emit, emitDoneAndReturn, reached } = ctx;
	const { runId, userPrompt, scopeRef: initialScopeRef } = args;

	// Every write of the run record by a stage goes through here, so the
	// handler knows the record last written and the stage the run is in.
	const saveRunRecord = (r: RunRecord): string => {
		const path = writeRunRecord(r);
		reached.record = r;
		if (r.status === 'in-progress' && r.stage !== 'done') reached.stage = r.stage;
		if (r.intent !== undefined) reached.intent = r.intent;
		return path;
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
		return emitDoneAndReturn(resumedResult(cached, cached.intent));
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
	saveRunRecord(record);

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
		saveRunRecord(record);
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
		// No classifier runs on this branch, so no validator does either.
		// Make its two checks here, before any model call: the pairing of
		// the scope's kind with the hinted kind of source, and that the
		// scope resolves.
		const hinted = await hintedIntentBase(args.targetHint, userPrompt, initialScopeRef);
		if (!hinted.ok) {
			record = patch(record, { stage: 'classify', status: 'failed', error: hinted.failure });
			saveRunRecord(record);
			log.warn({ runId, code: hinted.failure.code }, 'runAnalyze: hinted request failed validation');
			return emitDoneAndReturn(failResult('classify', hinted.failure, undefined, start, runId));
		}
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
			...hinted.base,
			scope:  pickedScope,
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
			saveRunRecord(record);
			log.warn({ runId, code: failure.code }, 'runAnalyze: classify failed');
			return emitDoneAndReturn(failResult('classify', failure, undefined, start, runId));
		}
	}
	emit({ type: 'classified', intent });
	record = patch(record, { stage: 'plan', intent });
	saveRunRecord(record);
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
		saveRunRecord(record);
		log.warn({ runId, code: failure.code }, 'runAnalyze: bundle build failed');
		return emitDoneAndReturn(failResult('plan', failure, intent, start, runId));
	}
	// The run checks its intent's scope once, before it plans, with the scope
	// function every plan task will use. For a docs run this is the first place
	// the index is checked (the context builder checks it for the code source
	// only): without it, a docs run on a scope in no registered repo would be
	// planned and then fail in every task. A generic intent has no family row
	// and is not checked.
	if (intent.target !== 'generic') {
		try {
			await resolveTaskScope(intent.scopeRef, intent.target, 'the run');
		} catch (err) {
			const scoped = scopeErrorMapping(err);
			// Anything that is not a refused scope goes to runAnalyze's handler.
			if (scoped === undefined) throw err;
			// The mapping is a run failure as it stands: the code, the message and,
			// for a scope that is not indexed, the scope's path and its registration.
			const failure: RunFailure = scoped;
			record = patch(record, { stage: 'plan', status: 'failed', error: failure });
			saveRunRecord(record);
			log.warn({ runId, code: failure.code }, "runAnalyze: the run's scope was refused before planning");
			return emitDoneAndReturn(failResult('plan', failure, intent, start, runId));
		}
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
		saveRunRecord(record);
		log.warn({ runId, code: failure.code }, 'runAnalyze: plan build failed');
		return emitDoneAndReturn(failResult('plan', failure, intent, start, runId));
	}
	emit({
		type: 'plan-accepted',
		taskCount: tree.plan.tasks.length,
		planId: tree.plan.planId,
	});
	record = patch(record, { stage: 'execute' });
	saveRunRecord(record);

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
		saveRunRecord(record);
		log.warn({ runId, tasksFailed: rootPlan.tasksFailed.length }, 'runAnalyze: aggregator failed');
		return emitDoneAndReturn(failResult('execute', failure, intent, start, runId));
	}

	// ----- (done) -----
	// The answer report, derived by code from the run context's report and
	// from each plan task's own record; its line heads the final report's text.
	return emitDoneAndReturn(completeRun({ record, intent, tree, executed: execResult, contextReport: contextBundle.report, start }));
}

// ---------------------------------------------------------------------------
// The run's answer report
// ---------------------------------------------------------------------------

/** Put before the source ids that come from the run context's report. */
export const RUN_CONTEXT_SOURCE_PREFIX = 'run context / ';

/** The report of a run context that carries none: its completeness is not known, and that is said. */
const RUN_CONTEXT_NOT_RECORDED: AnswerReport = {
	completeness: {
		complete:   false,
		incomplete: [{ sourceId: 'bundle', sourceKind: 'lookup', reason: 'completeness was not recorded for the run context' }],
		failed:     [],
	},
};

/**
 * Put a line at the head of the final report's text. The final report is the
 * aggregate-report task's output, whose text is its `summary`; a report of
 * any other shape is returned as it is.
 */
function headFinalReport(finalReport: unknown, line: string): unknown {
	if (typeof finalReport !== 'object' || finalReport === null) return finalReport;
	const summary = (finalReport as Record<string, unknown>)['summary'];
	if (typeof summary !== 'string') return finalReport;
	return { ...finalReport, summary: `${line}\n\n${summary}` };
}

/**
 * What an executed plan tree gives the run: its answer report, and its final
 * report with the completeness line at the head of its text.
 *
 * The report is derived from two steps. The run context (the run's first
 * step) has the report of its own lookups. The plan's tasks each state their
 * completeness; collectPlanSources gathers them. The run is complete only
 * when both are.
 */
export function concludeRun(
	tree:          PlanTreeNode,
	executed:      ExecutorResult,
	contextReport: AnswerReport | undefined,
): { readonly report: AnswerReport; readonly finalReport: unknown } {
	const report = mergeAnswerReports(
		contextReport ?? RUN_CONTEXT_NOT_RECORDED,
		deriveAnswerReport(collectPlanSources(tree, executed)),
		RUN_CONTEXT_SOURCE_PREFIX,
	);
	return { report, finalReport: headFinalReport(executed.root.finalReport, renderCompletenessLine(report)) };
}

/**
 * The last step of a run whose plan was executed and produced a final report:
 * derive the answer report, store the run record as done, and build the
 * result. The record and the result carry the same report and the same final
 * report, so a run resumed from the record returns what the run returned.
 */
export function completeRun(args: {
	readonly record:        RunRecord;
	readonly intent:        ClassifiedIntent;
	readonly tree:          PlanTreeNode;
	readonly executed:      ExecutorResult;
	/** The report of the run context, the run's first step. */
	readonly contextReport: AnswerReport | undefined;
	/** When the run started, in milliseconds. */
	readonly start:         number;
}): RunAnalyzeResult {
	const { record, intent, tree, executed } = args;
	const rootPlan = executed.root;
	const concluded = concludeRun(tree, executed, args.contextReport);
	writeRunRecord(patch(record, {
		stage: 'done',
		status: 'ok',
		finalReport: concluded.finalReport,
		report: concluded.report,
		tasksCompleted: rootPlan.tasksCompleted,
		tasksFailed: rootPlan.tasksFailed,
	}));
	const durationMs = Date.now() - args.start;
	log.info(
		{ runId: record.runId, tasksCompleted: rootPlan.tasksCompleted, tasksFailed: rootPlan.tasksFailed.length, durationMs },
		'runAnalyze: ok',
	);
	return {
		ok: true,
		runId: record.runId,
		intent,
		finalReport: concluded.finalReport,
		tasksCompleted: rootPlan.tasksCompleted,
		tasksFailed: rootPlan.tasksFailed,
		durationMs,
		report: concluded.report,
	};
}

/**
 * The result of a run resumed from its stored record.
 *
 * A record written since the report existed carries it, and its final
 * report's text already starts with the completeness line. A record stored
 * before that carries none: the run resumes with no report, none is invented
 * for it, and the not-recorded line is put at the head of the text in its place.
 */
function resumedResult(cached: RunRecord, intent: ClassifiedIntent): RunAnalyzeResult {
	return {
		ok: true,
		runId: cached.runId,
		intent,
		finalReport: cached.report !== undefined
			? cached.finalReport
			: headFinalReport(cached.finalReport, RUN_COMPLETENESS_NOT_RECORDED),
		tasksCompleted: cached.tasksCompleted ?? 0,
		tasksFailed: cached.tasksFailed ?? [],
		durationMs: 0,
		...(cached.report !== undefined ? { report: cached.report } : {}),
	};
}

// ---------------------------------------------------------------------------
// The branch for a request with a stated kind of source
// ---------------------------------------------------------------------------

type HintedIntentBase = Pick<ClassifiedIntent, 'target' | 'focused' | 'focus' | 'scopeRef'>;

/**
 * Build what a hinted request's intent is known to be before its size
 * is picked, and validate it.
 *
 * The user's prompt IS the request's focus: an intent built here used
 * to be marked unfocused always, though the prompt was in hand. With
 * an empty prompt it is unfocused -- which the pipeline serves.
 *
 * `validate` is the classifier's validator; `connectionExists` the
 * check it uses for a connection scope. Both are parameters so a test
 * can stand in for the registry.
 */
export async function hintedIntentBase(
	target:      AnalyzeTarget,
	userPrompt:  string,
	scopeRef:    AnalyzeScopeRef,
	connectionExists: (id: string) => Promise<boolean> = connectionIsRegistered,
): Promise<{ ok: true; base: HintedIntentBase } | { ok: false; failure: RunFailure }> {
	const focus = userPrompt.trim();
	const base: HintedIntentBase = focus.length > 0
		? { target, focused: true, focus, scopeRef }
		: { target, focused: false, scopeRef };
	// The size is not part of either check; 'M' is a placeholder here.
	let failure: Awaited<ReturnType<typeof validateIntentSemantics>>;
	try {
		failure = await validateIntentSemantics({ ...base, scope: 'M', reasoning: '' }, connectionExists);
	} catch (err) {
		// The connection check can throw (an unreadable connections file,
		// a registry that cannot be read). That is a failure of this
		// stage like any other: it gets a code and a failed run record,
		// not an unhandled rejection that leaves the record in progress.
		return { ok: false, failure: classifyShaperError(err) };
	}
	if (failure !== null) {
		return {
			ok: false,
			failure: {
				code:    failure.code as RunFailure['code'],
				message: failure.message,
			},
		};
	}
	return { ok: true, base };
}

// ---------------------------------------------------------------------------
// Per-stage error classifiers
// ---------------------------------------------------------------------------

function classifyClassifierError(err: unknown): RunFailure {
	if (err instanceof ClassifierLlmUnavailableError) return wrap('classifier-llm-unavailable', err);
	if (err instanceof ClassifierSchemaUnrecoverable) return wrap('classifier-schema-unrecoverable', err);
	// The validator's failure arrives wrapped. Surface its own code
	// (scope-ref-unresolved / scope-ref-kind-target-mismatch) as the
	// run's code, as the daemon's mapping does, so a run names the
	// precise reason and not "validation exhausted".
	if (err instanceof ClassifierValidationExhausted) {
		return {
			code:    err.lastFailure.code as RunFailure['code'],
			message: err.message,
			data:    { lastFailure: { code: err.lastFailure.code, message: err.lastFailure.message } },
		};
	}
	if (err instanceof ClassifierPromptMissingError) return wrap('classifier-prompt-missing', err);
	// Anything else came from the classifier's own context build (the
	// classification bundle): map it as a context error, so a scope
	// that is not indexed or a model that is unavailable keeps its cause.
	return classifyShaperError(err);
}

function classifyShaperError(err: unknown): RunFailure {
	// The three scope errors: one mapping, shared with the daemon and the plan walk.
	const scoped = scopeErrorMapping(err);
	if (scoped !== undefined) return scoped;
	if (err instanceof ShaperLlmUnavailableError) return wrap('shaper-llm-unavailable', err);
	if (err instanceof ShaperToolLoopExhausted) {
		// What the tools returned before the limit is not lost with the failure:
		// it is in the file the message names (or in `data`, had the file not been written).
		return { code: 'shaper-tool-loop-exhausted', message: err.message, data: toolLoopExhaustedData(err) };
	}
	if (err instanceof ShaperSchemaUnrecoverable) return wrap('shaper-schema-unrecoverable', err);
	if (err instanceof ShaperPromptMissingError) {
		// The answer prompt is loaded after the lookups ran: what they found goes with the failure.
		return err.found !== undefined
			? { code: 'shaper-prompt-missing', message: err.message, data: { results: err.found.results, report: err.found.report } }
			: wrap('shaper-prompt-missing', err);
	}
	if (err instanceof ShaperInvalidInputError) return wrap('invalid-input', err);
	if (err instanceof ShaperNoPlanError) return wrap('no-plan-for-request', err);
	// The lookups ran and the answer could not be written: the failure
	// carries what they found, and the report says the answer step failed.
	if (err instanceof ShaperAnswerStepFailedError) {
		return {
			code: 'answer-step-failed',
			message: err.message,
			data: { reason: err.reason, results: err.found.results, report: err.found.report },
		};
	}
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
