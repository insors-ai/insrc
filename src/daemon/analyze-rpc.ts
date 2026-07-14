/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon RPC surface for the analyze framework -- Context Builder +
 * Classifier.
 *
 * Context Builder methods (one per invocation mode):
 *
 *   analyze.context.buildClassification(params)
 *     params: { runId, scopeRef, userPrompt }
 *
 *   analyze.context.buildRun(params)
 *     params: { runId, intent }
 *
 *   analyze.context.buildTask(params)
 *     params: { runId, intent, task, template, upstream }
 *
 * Classifier method:
 *
 *   analyze.classify(params)
 *     params: { runId, userPrompt, scopeRef }
 *
 * Each method returns a tagged union:
 *
 *   Context Builder: { ok: true,  bundle: AnalyzeContextBundle }
 *   Classifier:      { ok: true,  intent: ClassifiedIntent      }
 *   either:          { ok: false, error:  { code, message, data? } }
 *
 * Tagged-union return (rather than throwing across the IPC layer)
 * lets every typed shaper / classifier error surface to the client
 * verbatim with a stable error code. Unexpected errors fall through
 * and the server's standard error handler converts them to a string
 * `error` field on the JSON-RPC envelope.
 *
 * No IDE / CLI surface yet -- the framework's outer-loop RPC is the
 * eventual caller of these handlers.
 *
 * See: design/analyze-framework.md "Surfaces" (Daemon RPC)
 *      plans/analyze-context-builder.md Phase 7
 */

import {
	classify as runClassifier,
	purgeRun,
	readRunRecord,
	runAnalyze,
	shaperFor,
} from '../analyze/index.js';
import type {
	AnalyzeRunEvent,
	RunAnalyzeArgs,
	RunAnalyzeResult,
	RunRecord,
} from '../analyze/index.js';
import type { IpcStreamMessage } from '../shared/types.js';
import {
	ClassifierLlmUnavailableError,
	ClassifierPromptMissingError,
	ClassifierSchemaUnrecoverable,
	ClassifierValidationExhausted,
} from '../analyze/classifier/driver.js';
import type { ClassifyInput, ClassifyOpts } from '../analyze/classifier/types.js';
import {
	ShaperLlmUnavailableError,
	ShaperPromptMissingError,
	ShaperSchemaUnrecoverable,
	ShaperToolLoopExhausted,
} from '../analyze/context/driver.js';
import { ScopeNotIndexedError } from '../analyze/context/invariants.js';
import {
	MaxPlanDepthExceededError,
	PlanBuilderExhausted,
	PlanBuilderLlmUnavailableError,
	PlanBuilderPromptMissingError,
	PlanBuilderSchemaUnrecoverable,
	runPlanner,
} from '../analyze/planner/driver.js';
import { getTemplatesForTarget } from '../analyze/planner/templates/registry.js';
import type {
	PlanBuilderInput,
	PlanBuilderOpts,
	PlanTask,
} from '../analyze/planner/types.js';
import type { AnalyzeScope } from '../shared/analyze-types.js';
import type {
	AnalyzeContextBundle,
	ClassificationShapeInput,
	RunShapeInput,
	ShapeOpts,
	TaskShapeInput,
} from '../analyze/context/types.js';
import { getLogger } from '../shared/logger.js';
import type {
	AnalyzeScopeRef,
	AnalyzeTaskTemplate,
	ClassifiedIntent,
	PlannedTask,
} from '../shared/analyze-types.js';

const log = getLogger('analyze-rpc');

// ---------------------------------------------------------------------------
// Tagged-union response shape
// ---------------------------------------------------------------------------

export interface AnalyzeRpcOk {
	readonly ok: true;
	readonly bundle: AnalyzeContextBundle;
}

export interface AnalyzeRpcErr {
	readonly ok: false;
	readonly error: AnalyzeRpcErrorPayload;
}

export interface AnalyzeRpcErrorPayload {
	readonly code: AnalyzeRpcErrorCode;
	readonly message: string;
	readonly data?: Readonly<Record<string, unknown>>;
}

export type AnalyzeRpcResponse = AnalyzeRpcOk | AnalyzeRpcErr;

/**
 * Stable error codes for typed shaper + classifier failures. The
 * orchestrator + IDE dispatch on these codes; new values land in
 * lock-step with new typed errors.
 */
export type AnalyzeRpcErrorCode =
	| 'invalid-params'
	| 'scope-not-indexed'
	| 'shaper-llm-unavailable'
	| 'shaper-tool-loop-exhausted'
	| 'shaper-schema-unrecoverable'
	| 'shaper-prompt-missing'
	| 'classifier-llm-unavailable'
	| 'classifier-schema-unrecoverable'
	| 'classifier-prompt-missing'
	| 'scope-ref-unresolved'
	| 'scope-ref-kind-target-mismatch'
	| 'plan-builder-llm-unavailable'
	| 'plan-builder-schema-unrecoverable'
	| 'plan-builder-prompt-missing'
	| 'plan-builder-exhausted'
	| 'plan-invariant-failed'
	| 'max-plan-depth-exceeded'
	| 'executor-aggregator-failed'
	| 'classifier-validation-exhausted'
	| 'invalid-input'
	| 'run-in-progress'
	| 'internal-error';

// ---------------------------------------------------------------------------
// Classifier response shape -- separate union since it returns
// `intent` instead of `bundle`. Errors share the AnalyzeRpcErrorPayload
// shape so the orchestrator's error-dispatch surface is uniform.
// ---------------------------------------------------------------------------

export interface ClassifyRpcOk {
	readonly ok: true;
	readonly intent: ClassifiedIntent;
}

export type ClassifyRpcResponse = ClassifyRpcOk | AnalyzeRpcErr;

// ---------------------------------------------------------------------------
// Plan Builder response shape -- separate `plan` field; shared
// AnalyzeRpcErr surface.
// ---------------------------------------------------------------------------

export interface PlanRpcOk {
	readonly ok: true;
	readonly plan: PlanTask;
}

export type PlanRpcResponse = PlanRpcOk | AnalyzeRpcErr;

// ---------------------------------------------------------------------------
// Run RPC response shapes
// ---------------------------------------------------------------------------

/**
 * analyze.run.start: full end-to-end pipeline. Tagged union on
 * `ok`. The success shape carries the orchestrator's
 * RunAnalyzeOk verbatim minus the discriminator; the failure
 * shape splices the orchestrator's stage + intent (when known)
 * onto the shared AnalyzeRpcErr error payload so clients have
 * a single dispatch path.
 */
export interface RunStartRpcOk {
	readonly ok: true;
	readonly runId: string;
	readonly intent: ClassifiedIntent;
	readonly finalReport: unknown;
	readonly tasksCompleted: number;
	readonly tasksFailed: ReadonlyArray<{ taskId: string; reason: string }>;
	readonly durationMs: number;
}

export interface RunStartRpcErr {
	readonly ok: false;
	readonly runId: string;
	readonly stage: 'classify' | 'plan' | 'execute' | 'done';
	readonly intent?: ClassifiedIntent | undefined;
	readonly durationMs: number;
	readonly error: AnalyzeRpcErrorPayload;
}

export type RunStartRpcResponse = RunStartRpcOk | RunStartRpcErr;

/**
 * analyze.run.status: read-only lookup of <runRoot>/run.json. Used
 * by the IDE to poll a running run's progress + by resume callers.
 * Returns `ok: false / code: invalid-input` when the run record
 * doesn't exist.
 */
export interface RunStatusRpcOk {
	readonly ok: true;
	readonly record: RunRecord;
}

export type RunStatusRpcResponse = RunStatusRpcOk | AnalyzeRpcErr;

/**
 * analyze.run.purge: remove ~/.insrc/analyze/<runId>/. Default
 * refuses on status='in-progress'; pass `force: true` to override
 * (e.g. clearing a stale crashed-daemon record).
 *
 * `purged: false` means the run dir didn't exist (idempotent
 * cleanup, not an error).
 */
export interface RunPurgeRpcOk {
	readonly ok: true;
	readonly purged: boolean;
}

export type RunPurgeRpcResponse = RunPurgeRpcOk | AnalyzeRpcErr;

// ---------------------------------------------------------------------------
// Public handlers
// ---------------------------------------------------------------------------

export async function buildClassification(params: unknown): Promise<AnalyzeRpcResponse> {
	let parsed: ClassificationParams;
	try {
		parsed = parseClassificationParams(params);
	} catch (err) {
		return invalidParams(err);
	}
	const shaper = shaperFor('classification');
	const input: ClassificationShapeInput = {
		scopeRef: parsed.scopeRef,
		userPrompt: parsed.userPrompt,
	};
	const opts: ShapeOpts = { runId: parsed.runId };
	return invoke(() => shaper.buildClassificationBundle(input, opts), 'classification', parsed.runId);
}

export async function buildRun(params: unknown): Promise<AnalyzeRpcResponse> {
	let parsed: RunParams;
	try {
		parsed = parseRunParams(params);
	} catch (err) {
		return invalidParams(err);
	}
	const shaper = shaperFor('run', parsed.intent.target);
	const input: RunShapeInput = { intent: parsed.intent };
	const opts: ShapeOpts = { runId: parsed.runId };
	return invoke(() => shaper.buildRunBundle(input, opts), 'run', parsed.runId);
}

export async function buildTask(params: unknown): Promise<AnalyzeRpcResponse> {
	let parsed: TaskParams;
	try {
		parsed = parseTaskParams(params);
	} catch (err) {
		return invalidParams(err);
	}
	if (parsed.intent.target === 'generic') {
		return {
			ok: false,
			error: {
				code: 'invalid-params',
				message: "analyze.context.buildTask: target='generic' is not valid at task scope; " +
					'task-level dispatch routes by task family namespace',
			},
		};
	}
	const shaper = shaperFor('task', parsed.intent.target);
	const input: TaskShapeInput = {
		intent: parsed.intent,
		task: parsed.task,
		template: parsed.template,
		upstreamTasks: parsed.upstream,
	};
	const opts: ShapeOpts = { runId: parsed.runId };
	return invoke(() => shaper.buildTaskBundle(input, opts), 'task', parsed.runId);
}

// ---------------------------------------------------------------------------
// analyze.classify
// ---------------------------------------------------------------------------

export async function classify(params: unknown): Promise<ClassifyRpcResponse> {
	let parsed: ClassifyParams;
	try {
		parsed = parseClassifyParams(params);
	} catch (err) {
		return invalidParams(err);
	}

	const input: ClassifyInput = {
		userPrompt: parsed.userPrompt,
		scopeRef: parsed.scopeRef,
	};
	const opts: ClassifyOpts = { runId: parsed.runId };

	try {
		const intent = await runClassifier({ input, opts });
		log.debug({ runId: parsed.runId }, 'analyze.classify complete');
		return { ok: true, intent };
	} catch (err) {
		const payload = classifyClassifierError(err);
		log.info(
			{ runId: parsed.runId, code: payload.code, message: payload.message },
			'analyze.classify failed',
		);
		return { ok: false, error: payload };
	}
}

/**
 * Map a typed classifier error onto an AnalyzeRpcErrorPayload. The
 * `ClassifierValidationExhausted` case carries the inner
 * `lastFailure` -- we surface its code (scope-ref-unresolved or
 * scope-ref-kind-target-mismatch) as the RPC error code directly so
 * the orchestrator can dispatch on the precise reason without
 * having to peek at `data`.
 */
function classifyClassifierError(err: unknown): AnalyzeRpcErrorPayload {
	if (err instanceof ClassifierValidationExhausted) {
		const code = err.lastFailure.code as AnalyzeRpcErrorCode;
		return {
			code,
			message: err.message,
			data: {
				lastFailure: {
					code: err.lastFailure.code,
					message: err.lastFailure.message,
				},
			},
		};
	}
	if (err instanceof ClassifierLlmUnavailableError) {
		return { code: 'classifier-llm-unavailable', message: err.message };
	}
	if (err instanceof ClassifierSchemaUnrecoverable) {
		return { code: 'classifier-schema-unrecoverable', message: err.message };
	}
	if (err instanceof ClassifierPromptMissingError) {
		return { code: 'classifier-prompt-missing', message: err.message };
	}
	// The classifier's shaper-side pre-step can also throw shaper-typed
	// errors (e.g. ShaperLlmUnavailableError if the classification shaper
	// itself can't reach Ollama, or ScopeNotIndexedError for code-shaper
	// runs -- though classification-mode doesn't trigger the closure
	// invariant). Defer to the shaper error classifier for those.
	return classifyShaperError(err);
}

// ---------------------------------------------------------------------------
// analyze.plan.build
// ---------------------------------------------------------------------------

/**
 * Build a Plan Task for a (runId, intent) pair. Internally:
 *   1. Builds (or cache-hits) the run-level context bundle via
 *      shaperFor('run', intent.target).buildRunBundle.
 *   2. Resolves the catalog via getTemplatesForTarget(intent.target).
 *   3. Calls runPlanner with the bundle + catalog + depth context.
 *
 * Tagged-union response. Typed errors map to stable codes:
 *   PlanBuilderLlmUnavailableError   -> plan-builder-llm-unavailable
 *   PlanBuilderSchemaUnrecoverable   -> plan-builder-schema-unrecoverable
 *   PlanBuilderPromptMissingError    -> plan-builder-prompt-missing
 *   PlanBuilderExhausted             -> plan-invariant-failed (carries
 *     lastFailure + all attempts in `data`)
 *   MaxPlanDepthExceededError        -> max-plan-depth-exceeded
 *   Shaper-side errors (from the bundle build) fall through to
 *     classifyShaperError so the wire codes stay stable.
 */
export async function plan(params: unknown): Promise<PlanRpcResponse> {
	let parsed: PlanParams;
	try {
		parsed = parsePlanParams(params);
	} catch (err) {
		return invalidParams(err);
	}

	try {
		// (0) Hoist the depth-cap check ABOVE the shaper call so a
		// refused invocation never pays for the bundle build. The
		// driver's runPlanner runs the same check internally as
		// defense-in-depth.
		const { loadAnalyzeConfig } = await import('../config/analyze.js');
		const cfg = loadAnalyzeConfig();
		const currentDepth = parsed.currentDepth ?? 0;
		const rootScope = parsed.rootScope ?? parsed.intent.scope;
		const cap = cfg.maxPlanDepth[rootScope];
		if (currentDepth + 1 > cap) {
			throw new MaxPlanDepthExceededError(currentDepth, rootScope, cap);
		}

		// (1) Build (or read-from-cache) the run-level bundle. Shaper
		// errors propagate to the outer catch + classifyShaperError.
		const shaper = shaperFor('run', parsed.intent.target);
		const contextBundle = await shaper.buildRunBundle(
			{ intent: parsed.intent },
			{ runId: parsed.runId },
		);

		// (2) + (3) Run the planner.
		const catalog = getTemplatesForTarget(parsed.intent.target);
		const input: PlanBuilderInput = {
			intent: parsed.intent,
			contextBundle,
			catalog,
			...(parsed.parentTaskPath !== undefined ? { parentTaskPath: parsed.parentTaskPath } : {}),
			...(parsed.currentDepth !== undefined ? { currentDepth: parsed.currentDepth } : {}),
			...(parsed.rootScope !== undefined ? { rootScope: parsed.rootScope } : {}),
		};
		const opts: PlanBuilderOpts = { runId: parsed.runId };

		const planResult = await runPlanner({ input, opts });
		log.debug({ runId: parsed.runId, taskCount: planResult.tasks.length }, 'analyze.plan.build complete');
		return { ok: true, plan: planResult };
	} catch (err) {
		const payload = classifyPlannerError(err);
		log.info(
			{ runId: parsed.runId, code: payload.code, message: payload.message },
			'analyze.plan.build failed',
		);
		return { ok: false, error: payload };
	}
}

// ---------------------------------------------------------------------------
// analyze.run.start -- full end-to-end pipeline
// ---------------------------------------------------------------------------

/**
 * Streaming RPC: drives the full analyze pipeline (classify -> plan
 * -> execute) and emits frames at every transition. Delegates to
 * runAnalyze; maps each AnalyzeRunEvent to an IpcStreamMessage so
 * the IDE-side daemonService.stream() consumer surfaces them as
 * DaemonStreamMessage events.
 *
 * Frame protocol:
 *   - { stream: 'progress', data: { step, status, ...event-specific } }
 *     fires for every intermediate stage / task event
 *   - { stream: 'analyze.result', data: RunStartRpcResponse }
 *     fires ONCE at the end carrying the terminal RunAnalyzeResult
 *     (success or failure, in the SAME shape the prior r/r RPC used)
 *   - { stream: 'done', data: {} }
 *     fires at the very end to close the stream lifecycle
 *
 * Persistence (run.json) happens inside runAnalyze regardless of
 * how the stream ends -- IDE disconnect, signal abort, etc. all
 * leave the terminal state recoverable via analyze.run.status.
 *
 * Param-validation errors surface as the analyze.result frame
 * carrying { ok:false, error.code: 'invalid-params', ... } so the
 * IDE has a single dispatch path regardless of where the failure
 * happened.
 */
export async function runStart(
	params: unknown,
	send: (msg: IpcStreamMessage) => void,
	signal: AbortSignal,
): Promise<void> {
	const start = Date.now();

	let parsed: RunStartParams;
	try {
		parsed = parseRunStartParams(params);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.info({ message }, 'analyze.run.start invalid params');
		send({
			id: 0,
			stream: 'analyze.result',
			data: {
				ok: false,
				runId: '',
				stage: 'classify',
				durationMs: Date.now() - start,
				error: { code: 'invalid-params', message },
			} satisfies RunStartRpcResponse,
		});
		send({ id: 0, stream: 'done', data: {} });
		return;
	}

	const args: RunAnalyzeArgs = {
		runId: parsed.runId,
		userPrompt: parsed.userPrompt,
		scopeRef: parsed.scopeRef,
		...(parsed.targetHint !== undefined ? { targetHint: parsed.targetHint } : {}),
		...(parsed.scopeHint !== undefined ? { scopeHint: parsed.scopeHint } : {}),
	};

	const onEvent = (event: AnalyzeRunEvent): void => {
		// `done` is captured by runAnalyze's return value; the handler
		// emits a single terminal `analyze.result` frame from that
		// return value below. Intermediate events go straight to
		// `progress` frames.
		if (event.type === 'done') return;
		send({ id: 0, stream: 'progress', data: eventToProgressData(event) });
	};

	let result: RunAnalyzeResult;
	try {
		result = await runAnalyze(args, { onEvent, signal });
	} catch (err) {
		// runAnalyze captures every typed error as a failure result.
		// An uncaught throw here means a bug or an OS-level failure;
		// surface as a structured analyze.result frame so the IDE
		// dispatch path stays uniform.
		const message = err instanceof Error ? err.message : String(err);
		log.error({ runId: parsed.runId, message }, 'analyze.run.start: uncaught orchestrator error');
		send({
			id: 0,
			stream: 'analyze.result',
			data: {
				ok: false,
				runId: parsed.runId,
				stage: 'classify',
				durationMs: Date.now() - start,
				error: { code: 'internal-error', message },
			} satisfies RunStartRpcResponse,
		});
		send({ id: 0, stream: 'done', data: {} });
		return;
	}

	const terminal = shapeTerminalFrame(result);
	if (result.ok) {
		log.info(
			{ runId: result.runId, tasksCompleted: result.tasksCompleted, durationMs: result.durationMs },
			'analyze.run.start ok',
		);
	} else {
		log.info(
			{
				runId: result.runId,
				stage: result.stage,
				code: result.error.code,
				durationMs: result.durationMs,
			},
			'analyze.run.start failed',
		);
	}
	send({ id: 0, stream: 'analyze.result', data: terminal });
	send({ id: 0, stream: 'done', data: {} });
}

// ---------------------------------------------------------------------------
// AnalyzeRunEvent -> wire-frame data shaping
// ---------------------------------------------------------------------------

/**
 * Shape an AnalyzeRunEvent into a JSON-friendly object the IDE side
 * surfaces as `DaemonStreamMessage.progress { step, status, ... }`.
 *
 * The `step` + `status` pair is what the existing widgets
 * (status bar, runs sidebar) read. The remaining fields are spread
 * verbatim so future widgets can pick them up without backend
 * changes.
 */
function eventToProgressData(event: AnalyzeRunEvent): Record<string, unknown> {
	switch (event.type) {
		case 'stage-started':
			return { step: event.stage, status: 'started' };
		case 'stage-substep':
			return {
				step: event.stage,
				status: `substep-${event.substep}`,
				substep: event.substep,
				...(event.detail !== undefined ? { detail: event.detail } : {}),
			};
		case 'classified':
			return { step: 'classify', status: 'completed', intent: event.intent };
		case 'plan-attempt':
			return {
				step: 'plan',
				status: `attempt-${event.attempt}-${event.accepted ? 'accepted' : 'rejected'}`,
				attempt: event.attempt,
				accepted: event.accepted,
				...(event.invariantId !== undefined ? { invariantId: event.invariantId } : {}),
			};
		case 'plan-accepted':
			return {
				step: 'plan',
				status: 'accepted',
				taskCount: event.taskCount,
				planId: event.planId,
			};
		case 'task-started':
			return {
				step: `task-${event.index}/${event.total}`,
				status: `started: ${event.template}`,
				taskId: event.taskId,
				template: event.template,
				index: event.index,
				total: event.total,
				...(event.parentTaskPath !== undefined ? { parentTaskPath: event.parentTaskPath } : {}),
			};
		case 'task-completed':
			return {
				step: `task-${event.taskId}`,
				status: event.status,
				taskId: event.taskId,
				...(event.parentTaskPath !== undefined ? { parentTaskPath: event.parentTaskPath } : {}),
			};
		case 'shaper-tool-call':
			// Nest under the parent stage row via parentTaskPath so the
			// LiveStepsWidget indents these as sub-rows. Use a synthetic
			// path 'shaper-tools' since real tasks haven't started yet
			// during the shaper phase.
			return {
				step: `tool-${event.tool}`,
				status: 'started',
				trace: 'shaper-tool-call',
				stage: event.stage,
				tool: event.tool,
				parentTaskPath: 'shaper-tools',
				...(event.argsPreview !== undefined ? { detail: event.argsPreview } : {}),
			};
		case 'shaper-tool-response':
			return {
				step: `tool-${event.tool}`,
				status: event.ok ? 'ok' : 'failed',
				trace: 'shaper-tool-response',
				stage: event.stage,
				tool: event.tool,
				parentTaskPath: 'shaper-tools',
				...(event.notePreview !== undefined ? { detail: event.notePreview } : {}),
			};
		case 'llm-token':
			// Throttled streaming preview. Non-terminal: the widget
			// updates a preview line under the parent substep row's
			// status but keeps the row's icon in in-progress state.
			return {
				step: event.stage,
				status: `token-${event.substep}`,
				substep: event.substep,
				preview: event.preview,
				trace: 'llm-token',
			};
		case 'done':
			// Not emitted as a progress frame -- handler emits analyze.result
			// from the run result directly.
			return { step: 'done', status: 'unused' };
	}
}

/**
 * Build the terminal RunStartRpcResponse from a RunAnalyzeResult.
 * Same shape the request/response RPC used to return, now travelling
 * as the `analyze.result` stream frame's payload.
 */
function shapeTerminalFrame(result: RunAnalyzeResult): RunStartRpcResponse {
	if (result.ok) {
		return {
			ok: true,
			runId: result.runId,
			intent: result.intent,
			finalReport: result.finalReport,
			tasksCompleted: result.tasksCompleted,
			tasksFailed: result.tasksFailed,
			durationMs: result.durationMs,
		};
	}
	const payload: AnalyzeRpcErrorPayload = {
		code: result.error.code as AnalyzeRpcErrorCode,
		message: result.error.message,
		...(result.error.data !== undefined ? { data: result.error.data } : {}),
	};
	return {
		ok: false,
		runId: result.runId,
		stage: result.stage,
		...(result.intent !== undefined ? { intent: result.intent } : {}),
		durationMs: result.durationMs,
		error: payload,
	};
}

// ---------------------------------------------------------------------------
// analyze.run.status -- read-only lookup of <runRoot>/run.json
// ---------------------------------------------------------------------------

/**
 * Read the persisted RunRecord for a runId. Used by the IDE to poll
 * a running run + by callers that want to know the terminal state
 * after an analyze.run.start invocation (e.g. after a transport
 * disconnect).
 *
 * Returns ok:false / code:invalid-input when the record doesn't
 * exist. Genuinely unrecoverable read errors surface as
 * internal-error.
 */
export async function runStatus(params: unknown): Promise<RunStatusRpcResponse> {
	let parsed: RunStatusParams;
	try {
		parsed = parseRunStatusParams(params);
	} catch (err) {
		return invalidParams(err);
	}

	let record: RunRecord | null;
	try {
		record = readRunRecord(parsed.runId);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: { code: 'internal-error', message } };
	}

	if (record === null) {
		return {
			ok: false,
			error: {
				code: 'invalid-input',
				message: `analyze.run.status: no run record for runId='${parsed.runId}'`,
			},
		};
	}
	return { ok: true, record };
}

// ---------------------------------------------------------------------------
// analyze.run.purge -- remove ~/.insrc/analyze/<runId>/
// ---------------------------------------------------------------------------

/**
 * Purge a run's on-disk artifacts. Refuses on status='in-progress'
 * unless force=true; idempotent on missing run dirs (returns
 * purged=false rather than erroring).
 *
 * Filesystem errors propagate to the wire as 'internal-error'.
 */
export async function runPurge(params: unknown): Promise<RunPurgeRpcResponse> {
	let parsed: RunPurgeParams;
	try {
		parsed = parseRunPurgeParams(params);
	} catch (err) {
		return invalidParams(err);
	}

	let result;
	try {
		result = purgeRun(parsed.runId, parsed.force !== undefined ? { force: parsed.force } : {});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.warn({ runId: parsed.runId, message }, 'analyze.run.purge: filesystem error');
		return { ok: false, error: { code: 'internal-error', message } };
	}

	if (result.ok) {
		log.info({ runId: parsed.runId, purged: result.purged }, 'analyze.run.purge ok');
		return { ok: true, purged: result.purged };
	}

	// result.ok === false -> refused on in-progress
	return {
		ok: false,
		error: {
			code: 'run-in-progress',
			message: `analyze.run.purge: refused -- run '${parsed.runId}' is in-progress at stage='${result.stage}' (pass force=true to override)`,
			data: { stage: result.stage },
		},
	};
}

/**
 * Map a typed Plan-Builder error onto an AnalyzeRpcErrorPayload.
 * PlanBuilderExhausted's `lastFailure` carries the invariant id +
 * message; we attach the full failures + last-attempt summary in
 * `data` so the orchestrator can build a diagnostic UI without
 * re-reading plan.attempts/ from disk.
 */
function classifyPlannerError(err: unknown): AnalyzeRpcErrorPayload {
	if (err instanceof MaxPlanDepthExceededError) {
		return {
			code: 'max-plan-depth-exceeded',
			message: err.message,
			data: {
				currentDepth: err.currentDepth,
				rootScope: err.rootScope,
				cap: err.cap,
			},
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
	if (err instanceof PlanBuilderLlmUnavailableError) {
		return { code: 'plan-builder-llm-unavailable', message: err.message };
	}
	if (err instanceof PlanBuilderSchemaUnrecoverable) {
		return { code: 'plan-builder-schema-unrecoverable', message: err.message };
	}
	if (err instanceof PlanBuilderPromptMissingError) {
		return { code: 'plan-builder-prompt-missing', message: err.message };
	}
	// Shaper-side errors (the buildRunBundle pre-step can raise its
	// own typed errors) get dispatched through the shaper classifier.
	return classifyShaperError(err);
}

// ---------------------------------------------------------------------------
// invoke -- single error-classification path for every handler
// ---------------------------------------------------------------------------

async function invoke(
	thunk: () => Promise<AnalyzeContextBundle>,
	mode: 'classification' | 'run' | 'task',
	runId: string,
): Promise<AnalyzeRpcResponse> {
	try {
		const bundle = await thunk();
		log.debug({ mode, runId }, 'analyze rpc invocation complete');
		return { ok: true, bundle };
	} catch (err) {
		const payload = classifyShaperError(err);
		log.info(
			{ mode, runId, code: payload.code, message: payload.message },
			'analyze rpc invocation failed',
		);
		return { ok: false, error: payload };
	}
}

/**
 * Map a typed shaper error onto an AnalyzeRpcErrorPayload. Untyped
 * errors fall through with code `internal-error` so the client sees
 * SOMETHING structured instead of a generic string; the message
 * preserves the original error's message.
 */
function classifyShaperError(err: unknown): AnalyzeRpcErrorPayload {
	if (err instanceof ScopeNotIndexedError) {
		return {
			code: 'scope-not-indexed',
			message: err.message,
			data: {
				scopePath: err.scopePath,
				registeredAs: err.registeredAs,
			},
		};
	}
	if (err instanceof ShaperLlmUnavailableError) {
		return { code: 'shaper-llm-unavailable', message: err.message };
	}
	if (err instanceof ShaperToolLoopExhausted) {
		return { code: 'shaper-tool-loop-exhausted', message: err.message };
	}
	if (err instanceof ShaperSchemaUnrecoverable) {
		return { code: 'shaper-schema-unrecoverable', message: err.message };
	}
	if (err instanceof ShaperPromptMissingError) {
		return { code: 'shaper-prompt-missing', message: err.message };
	}
	const message = err instanceof Error ? err.message : String(err);
	return { code: 'internal-error', message };
}

function invalidParams(err: unknown): AnalyzeRpcErr {
	const message = err instanceof Error ? err.message : String(err);
	return { ok: false, error: { code: 'invalid-params', message } };
}

// ---------------------------------------------------------------------------
// Params parsing -- each handler has a typed parser that throws
// TypeError on bad shape. invoke()'s try/catch turns those into
// invalid-params responses.
// ---------------------------------------------------------------------------

interface ClassificationParams {
	readonly runId: string;
	readonly scopeRef: AnalyzeScopeRef;
	readonly userPrompt: string;
}

interface RunParams {
	readonly runId: string;
	readonly intent: ClassifiedIntent;
}

interface ClassifyParams {
	readonly runId: string;
	readonly userPrompt: string;
	readonly scopeRef: AnalyzeScopeRef;
}

interface PlanParams {
	readonly runId: string;
	readonly intent: ClassifiedIntent;
	readonly parentTaskPath?: string;
	readonly currentDepth?: number;
	readonly rootScope?: AnalyzeScope;
}

interface RunStartParams {
	readonly runId: string;
	readonly userPrompt: string;
	readonly scopeRef: AnalyzeScopeRef;
	readonly targetHint?: 'code' | 'data' | 'infra' | 'generic' | 'docs';
	readonly scopeHint?: AnalyzeScope;
}

interface RunStatusParams {
	readonly runId: string;
}

interface RunPurgeParams {
	readonly runId: string;
	readonly force?: boolean;
}

interface TaskParams {
	readonly runId: string;
	readonly intent: ClassifiedIntent;
	readonly task: PlannedTask;
	readonly template: AnalyzeTaskTemplate;
	readonly upstream: ReadonlyMap<string, unknown | null>;
}

function parseClassificationParams(params: unknown): ClassificationParams {
	const obj = requireObject(params, 'params');
	return {
		runId: requireString(obj, 'runId'),
		scopeRef: parseScopeRef(obj['scopeRef']),
		userPrompt: requireString(obj, 'userPrompt'),
	};
}

function parseRunParams(params: unknown): RunParams {
	const obj = requireObject(params, 'params');
	return {
		runId: requireString(obj, 'runId'),
		intent: parseIntent(obj['intent']),
	};
}

function parseClassifyParams(params: unknown): ClassifyParams {
	const obj = requireObject(params, 'params');
	return {
		runId: requireString(obj, 'runId'),
		userPrompt: requireString(obj, 'userPrompt'),
		scopeRef: parseScopeRef(obj['scopeRef']),
	};
}

function parseRunStartParams(params: unknown): RunStartParams {
	const obj = requireObject(params, 'params');
	const result: Record<string, unknown> = {
		runId: requireString(obj, 'runId'),
		userPrompt: requireString(obj, 'userPrompt'),
		scopeRef: parseScopeRef(obj['scopeRef']),
	};
	if (obj['targetHint'] !== undefined) {
		const th = obj['targetHint'];
		const validTargets = ['code', 'data', 'infra', 'generic', 'docs'];
		if (typeof th !== 'string' || !validTargets.includes(th)) {
			throw new TypeError(
				`targetHint: must be one of ${validTargets.join(', ')}; got ${JSON.stringify(th)}`,
			);
		}
		result['targetHint'] = th;
	}
	if (obj['scopeHint'] !== undefined) {
		const sh = obj['scopeHint'];
		const validScopes = ['XS', 'S', 'M', 'L', 'XL'];
		if (typeof sh !== 'string' || !validScopes.includes(sh)) {
			throw new TypeError(
				`scopeHint: must be one of ${validScopes.join(', ')}; got ${JSON.stringify(sh)}`,
			);
		}
		result['scopeHint'] = sh;
	}
	return result as unknown as RunStartParams;
}

function parseRunStatusParams(params: unknown): RunStatusParams {
	const obj = requireObject(params, 'params');
	return {
		runId: requireString(obj, 'runId'),
	};
}

function parseRunPurgeParams(params: unknown): RunPurgeParams {
	const obj = requireObject(params, 'params');
	const result: Record<string, unknown> = {
		runId: requireString(obj, 'runId'),
	};
	if (obj['force'] !== undefined) {
		if (typeof obj['force'] !== 'boolean') {
			throw new TypeError(`force: must be boolean; got ${JSON.stringify(obj['force'])}`);
		}
		result['force'] = obj['force'];
	}
	return result as unknown as RunPurgeParams;
}

function parsePlanParams(params: unknown): PlanParams {
	const obj = requireObject(params, 'params');
	const result: Record<string, unknown> = {
		runId: requireString(obj, 'runId'),
		intent: parseIntent(obj['intent']),
	};
	if (typeof obj['parentTaskPath'] === 'string' && obj['parentTaskPath'].length > 0) {
		result['parentTaskPath'] = obj['parentTaskPath'];
	}
	if (typeof obj['currentDepth'] === 'number') {
		if (!Number.isInteger(obj['currentDepth']) || (obj['currentDepth'] as number) < 0) {
			throw new TypeError('currentDepth: must be a non-negative integer');
		}
		result['currentDepth'] = obj['currentDepth'];
	}
	if (obj['rootScope'] !== undefined) {
		const rs = obj['rootScope'];
		const validScopes = ['XS', 'S', 'M', 'L', 'XL'];
		if (typeof rs !== 'string' || !validScopes.includes(rs)) {
			throw new TypeError(`rootScope: must be one of ${validScopes.join(', ')}; got ${JSON.stringify(rs)}`);
		}
		result['rootScope'] = rs;
	}
	return result as unknown as PlanParams;
}

function parseTaskParams(params: unknown): TaskParams {
	const obj = requireObject(params, 'params');
	return {
		runId: requireString(obj, 'runId'),
		intent: parseIntent(obj['intent']),
		task: parseTask(obj['task']),
		template: parseTemplate(obj['template']),
		upstream: parseUpstream(obj['upstream']),
	};
}

function parseScopeRef(value: unknown): AnalyzeScopeRef {
	const obj = requireObject(value, 'scopeRef');
	const kind = requireString(obj, 'kind');
	const validKinds = ['repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir', 'workspace'];
	if (!validKinds.includes(kind)) {
		throw new TypeError(
			`scopeRef.kind: must be one of ${validKinds.join(', ')}; got '${kind}'`,
		);
	}
	return {
		kind: kind as AnalyzeScopeRef['kind'],
		value: requireString(obj, 'value'),
	};
}

function parseIntent(value: unknown): ClassifiedIntent {
	const obj = requireObject(value, 'intent');
	const target = requireString(obj, 'target');
	const validTargets = ['code', 'data', 'infra', 'generic', 'docs'];
	if (!validTargets.includes(target)) {
		throw new TypeError(`intent.target: must be one of ${validTargets.join(', ')}; got '${target}'`);
	}
	const scope = requireString(obj, 'scope');
	const validScopes = ['XS', 'S', 'M', 'L', 'XL'];
	if (!validScopes.includes(scope)) {
		throw new TypeError(`intent.scope: must be one of ${validScopes.join(', ')}; got '${scope}'`);
	}
	const result: Record<string, unknown> = {
		target: target as ClassifiedIntent['target'],
		scope: scope as ClassifiedIntent['scope'],
		focused: requireBoolean(obj, 'focused'),
		scopeRef: parseScopeRef(obj['scopeRef']),
		reasoning: requireString(obj, 'reasoning'),
	};
	if (obj['focus'] !== undefined && obj['focus'] !== null) {
		result['focus'] = requireString(obj, 'focus');
	}
	return result as unknown as ClassifiedIntent;
}

function parseTask(value: unknown): PlannedTask {
	const obj = requireObject(value, 'task');
	const params = obj['params'];
	if (params === undefined || params === null || typeof params !== 'object') {
		throw new TypeError("task.params: must be an object");
	}
	const produces = obj['produces'];
	if (!Array.isArray(produces) || produces.some(o => typeof o !== 'string')) {
		throw new TypeError("task.produces: must be string[]");
	}
	const kind = requireString(obj, 'kind');
	if (kind !== 'leaf' && kind !== 'planner') {
		throw new TypeError(`task.kind: must be 'leaf' or 'planner'; got '${kind}'`);
	}
	const result: Record<string, unknown> = {
		taskId: requireString(obj, 'taskId'),
		template: requireString(obj, 'template'),
		kind: kind as 'leaf' | 'planner',
		params: params as Record<string, unknown>,
		produces: produces as string[],
		rationale: requireString(obj, 'rationale'),
	};
	if (Array.isArray(obj['consumes'])) {
		const cons = obj['consumes'];
		if (cons.some((d: unknown) => typeof d !== 'string')) {
			throw new TypeError("task.consumes: must be string[]");
		}
		result['consumes'] = cons as string[];
	}
	if (typeof obj['taskPath'] === 'string') {
		result['taskPath'] = obj['taskPath'];
	}
	return result as unknown as PlannedTask;
}

function parseTemplate(value: unknown): AnalyzeTaskTemplate {
	const obj = requireObject(value, 'template');
	const kind = requireString(obj, 'kind');
	if (kind !== 'leaf' && kind !== 'planner') {
		throw new TypeError(`template.kind: must be 'leaf' or 'planner'; got '${kind}'`);
	}
	const target = requireString(obj, 'target');
	const validTargets = ['code', 'data', 'infra', 'generic', 'docs'];
	if (!validTargets.includes(target)) {
		throw new TypeError(`template.target: invalid '${target}'`);
	}
	return {
		id: requireString(obj, 'id'),
		target: target as AnalyzeTaskTemplate['target'],
		family: requireString(obj, 'family'),
		kind: kind as AnalyzeTaskTemplate['kind'],
		revision: requireString(obj, 'revision'),
	};
}

function parseUpstream(value: unknown): ReadonlyMap<string, unknown | null> {
	// Accept three input shapes:
	//   1. undefined -> empty Map
	//   2. { taskId: outputJson }
	//   3. [[taskId, outputJson]]
	if (value === undefined || value === null) {
		return new Map();
	}
	if (Array.isArray(value)) {
		const m = new Map<string, unknown | null>();
		for (const entry of value) {
			if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
				throw new TypeError("upstream: array form must be [[taskId, output], ...]");
			}
			m.set(entry[0], entry[1] as unknown | null);
		}
		return m;
	}
	if (typeof value === 'object') {
		const m = new Map<string, unknown | null>();
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			m.set(k, v as unknown | null);
		}
		return m;
	}
	throw new TypeError("upstream: must be an object, array of [taskId, output] pairs, or undefined");
}

// ---------------------------------------------------------------------------
// Tiny shape helpers
// ---------------------------------------------------------------------------

function requireObject(value: unknown, field: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${field}: must be an object`);
	}
	return value as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, field: string): string {
	const v = obj[field];
	if (typeof v !== 'string' || v.length === 0) {
		throw new TypeError(`${field}: must be a non-empty string`);
	}
	return v;
}

function requireBoolean(obj: Record<string, unknown>, field: string): boolean {
	const v = obj[field];
	if (typeof v !== 'boolean') {
		throw new TypeError(`${field}: must be a boolean`);
	}
	return v;
}
