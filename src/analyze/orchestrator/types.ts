/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Orchestrator types -- inputs, outputs, persisted-run shape, stages.
 *
 * The orchestrator drives the full analyze pipeline end-to-end:
 *   classify -> buildRunBundle -> runRecursivePlanner -> runExecutor
 *
 * Each stage's failure surfaces as a typed `RunFailure` with a stable
 * `code` so the daemon RPC + the UI can dispatch without peeking at
 * exception messages. The persisted RunRecord captures the run's
 * lifecycle on disk at <runRoot>/run.json so resume + UI know where
 * the run is.
 */

import type {
	AnalyzeScopeRef,
	ClassifiedIntent,
} from '../../shared/analyze-types.js';

// ---------------------------------------------------------------------------
// Stage identifiers
// ---------------------------------------------------------------------------

/** Stage in the orchestrator pipeline. Used by RunRecord.stage and
 *  by failure codes to indicate where a run gave up. */
export type RunStage =
	| 'classify'
	| 'plan'
	| 'execute'
	| 'done';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface RunAnalyzeArgs {
	readonly runId: string;
	readonly userPrompt: string;
	/** Starting scope ref -- usually workspace; the classifier may
	 *  refine to a more specific repo / module / connection ref. */
	readonly scopeRef: AnalyzeScopeRef;
	/**
	 * Optional target override. When set, the orchestrator skips the
	 * classifier stage entirely + synthesises the ClassifiedIntent
	 * directly with the given target. Saves the ~3 min classifier
	 * round-trip + gives deterministic control over which template
	 * family runs (code / data / infra / generic). Used by the chat
	 * panel's slash commands (`/code`, `/data`, etc.).
	 */
	readonly targetHint?: import('../../shared/analyze-types.js').AnalyzeTarget;
	/**
	 * Optional scope override. Only honoured when targetHint is also
	 * set (otherwise the classifier picks the scope band from the
	 * prompt + bundle). Defaults to 'M' when omitted with a target
	 * hint.
	 */
	readonly scopeHint?: import('../../shared/analyze-types.js').AnalyzeScope;
}

/**
 * Optional per-invocation options. None of these change the
 * happy-path semantics; both fields are observer / control hooks
 * the daemon's streaming RPC + the orchestrator's cancellation
 * surface plug into.
 */
export interface RunAnalyzeOpts {
	/**
	 * Streaming progress callback. Fires synchronously at every
	 * pipeline transition (stage boundaries, planner attempts,
	 * per-task start + complete, terminal done). Callers that don't
	 * care about progress omit this and get the same request/response
	 * behaviour the orchestrator had before S1.
	 *
	 * Always fires `{ type: 'done', result }` exactly once at the
	 * end -- on success, on failure, AND on resume cache hit. Callers
	 * can build off the `done` event alone as a single-shot terminal
	 * signal.
	 */
	readonly onEvent?: (event: AnalyzeRunEvent) => void;
	/**
	 * Cancellation signal. The orchestrator checks `signal.aborted`
	 * at every stage boundary + between executor tasks. On abort,
	 * runAnalyze writes a final run.json with status='failed' +
	 * error.code='aborted' and returns a RunAnalyzeFail with the
	 * same code. In-flight LLM calls cannot currently be
	 * interrupted mid-token; the abort takes effect at the next
	 * inter-stage / inter-task boundary.
	 */
	readonly signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Streaming event union
// ---------------------------------------------------------------------------

/**
 * Discriminated union the orchestrator emits via RunAnalyzeOpts.onEvent.
 *
 * The daemon's streaming RPC layer (S3) maps each variant to an
 * IpcStreamMessage frame the IDE consumes via daemonService.stream().
 * Callers in-process (tests, CLI) can subscribe directly without going
 * through the wire.
 *
 * Event ordering invariants:
 *   - `stage-started` fires before any work in that stage
 *   - `classified` fires after the classify stage's stage-started,
 *     before stage-started for 'plan'
 *   - `plan-attempt` fires once per planner LLM round-trip (only on
 *     validation failure or eventual accept); `plan-accepted` fires
 *     once at the end of a successful plan stage
 *   - `task-started` + `task-completed` come in pairs, in plan order;
 *     `index` is 1-based, `total` is the plan's task count
 *   - `done` fires EXACTLY ONCE per runAnalyze invocation -- on ok,
 *     on failure, on resume cache hit. It's the only event that
 *     carries the terminal RunAnalyzeResult.
 */
export type AnalyzeRunEvent =
	| {
		readonly type: 'stage-started';
		readonly stage: 'classify' | 'plan' | 'execute';
	}
	| {
		readonly type: 'classified';
		readonly intent: ClassifiedIntent;
	}
	| {
		/**
		 * Fine-grained sub-step within a stage, for UI progress that
		 * doesn't want to sit silent through multi-minute stage
		 * bodies (esp. the plan stage: bundle-shaper tool loop
		 * followed by planner LLM). `substep` is a stable short id
		 * the UI dispatches on; `detail` is optional human-readable
		 * text to append to the progress row.
		 */
		readonly type: 'stage-substep';
		readonly stage: 'classify' | 'plan' | 'execute';
		readonly substep: string;
		readonly detail?: string;
	}
	| {
		/**
		 * The shaper's tool loop invoked a read-only tool. Fires
		 * BEFORE the tool executes so the UI shows the pending call
		 * with a spinner. Paired with `shaper-tool-response` on
		 * completion. `stage` is 'plan' for buildRunBundle,
		 * 'classify' for buildClassificationBundle, 'execute' for
		 * task-level shaper calls under the executor.
		 */
		readonly type: 'shaper-tool-call';
		readonly stage: 'classify' | 'plan' | 'execute';
		readonly tool: string;
		readonly argsPreview?: string;
	}
	| {
		/**
		 * Terminates a `shaper-tool-call` pair. `ok:false` when the
		 * tool signalled failure (bad args, missing file, permission
		 * denied). The UI flips the row's icon to pass / error and
		 * appends a short output preview.
		 */
		readonly type: 'shaper-tool-response';
		readonly stage: 'classify' | 'plan' | 'execute';
		readonly tool: string;
		readonly ok: boolean;
		readonly notePreview?: string;
	}
	| {
		/**
		 * Throttled streaming preview of an LLM structured-output
		 * response as it arrives (currently just the shaper's final
		 * emit; planner integration is a follow-up). Fires at most
		 * every ~250ms or every ~400 new chars. `preview` carries
		 * the accumulated tail (cap ~240 chars) for the UI to render
		 * as a live-typing line under the parent stage row.
		 */
		readonly type: 'llm-token';
		readonly stage: 'classify' | 'plan' | 'execute';
		readonly substep: string;
		readonly preview: string;
	}
	| {
		readonly type: 'plan-attempt';
		readonly attempt: number;
		readonly accepted: boolean;
		readonly invariantId?: string;
	}
	| {
		readonly type: 'plan-accepted';
		readonly taskCount: number;
		readonly planId: string;
	}
	| {
		readonly type: 'task-started';
		readonly taskId: string;
		readonly template: string;
		readonly index: number;
		readonly total: number;
		/** Dotted path of ancestor planner-template tasks (e.g. "t02"
		 *  or "t02.t05"); undefined for tasks in the root plan. */
		readonly parentTaskPath?: string;
	}
	| {
		readonly type: 'task-completed';
		readonly taskId: string;
		readonly status: 'ok' | 'failed' | 'skipped-dependency-unavailable';
		readonly parentTaskPath?: string;
	}
	| {
		readonly type: 'done';
		readonly result: RunAnalyzeResult;
	};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** Tagged-union top-level result. */
export type RunAnalyzeResult =
	| RunAnalyzeOk
	| RunAnalyzeFail;

export interface RunAnalyzeOk {
	readonly ok: true;
	readonly runId: string;
	readonly intent: ClassifiedIntent;
	readonly finalReport: unknown;
	readonly tasksCompleted: number;
	readonly tasksFailed: ReadonlyArray<{ taskId: string; reason: string }>;
	readonly durationMs: number;
}

export interface RunAnalyzeFail {
	readonly ok: false;
	readonly runId: string;
	readonly stage: RunStage;
	readonly error: RunFailure;
	/** Intent is present iff the classify stage completed; otherwise undefined. */
	readonly intent?: ClassifiedIntent | undefined;
	readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Failure shape
// ---------------------------------------------------------------------------

export interface RunFailure {
	readonly code: RunErrorCode;
	readonly message: string;
	readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Stable error codes the daemon RPC + the IDE dispatch on.
 *
 * Per-stage codes pass through verbatim from the underlying stage's
 * typed error (classifier / shaper / planner / executor). The
 * orchestrator wraps unrecognised errors as `internal-error`.
 */
export type RunErrorCode =
	// classifier
	| 'classifier-llm-unavailable'
	| 'classifier-schema-unrecoverable'
	| 'classifier-validation-exhausted'
	| 'classifier-prompt-missing'
	| 'scope-ref-unresolved'
	| 'scope-ref-kind-target-mismatch'
	| 'invalid-input'
	// run-bundle shaper (mirrors analyze-rpc.ts error codes)
	| 'scope-not-indexed'
	| 'shaper-llm-unavailable'
	| 'shaper-tool-loop-exhausted'
	| 'shaper-schema-unrecoverable'
	| 'shaper-prompt-missing'
	// planner
	| 'plan-builder-llm-unavailable'
	| 'plan-builder-schema-unrecoverable'
	| 'plan-builder-prompt-missing'
	| 'plan-invariant-failed'
	| 'max-plan-depth-exceeded'
	// executor
	| 'executor-aggregator-failed'
	// cancellation
	| 'aborted'
	// catch-all
	| 'internal-error';

// ---------------------------------------------------------------------------
// Persisted run record (<runRoot>/run.json)
// ---------------------------------------------------------------------------

/**
 * The run's lifecycle record on disk. Updated at each stage transition
 * + at the terminal end (ok / failed). Atomic write via tmp+rename.
 */
export interface RunRecord {
	readonly runId: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly userPrompt: string;
	readonly initialScopeRef: AnalyzeScopeRef;
	readonly stage: RunStage;
	readonly status: 'in-progress' | 'ok' | 'failed';
	/** Filled in after the classifier stage completes. */
	readonly intent?: ClassifiedIntent | undefined;
	/** Filled in after the executor stage completes. */
	readonly finalReport?: unknown;
	/** Filled in when status='failed'. */
	readonly error?: RunFailure | undefined;
	readonly tasksCompleted?: number | undefined;
	readonly tasksFailed?: ReadonlyArray<{ taskId: string; reason: string }> | undefined;
}
