/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Async (start/poll/abort) lifecycle for daemon-side workflow runs.
 *
 * The streaming `workflow.run` op (`workflow-rpc.ts` `runStart`) holds the
 * caller's socket open for the whole 5–20 min run. This registry instead runs
 * the SAME driver (`runWorkflowServerSide`) DETACHED: `startWorkflowRun`
 * returns a `runId` synchronously and the controller `pollWorkflowRun`s for
 * new progress frames + the terminal result, and can `abortWorkflowRun`
 * mid-run. Mirrors the controller-driven philosophy (insrc_workflow_step /
 * insrc_review_step) — the controller relays each progress batch to the user.
 *
 * Provider build, timeout, and client-provider context all come from the
 * shared `prepareWorkflowRun` helper, so a detached run resolves the exact
 * same provider as the streaming path.
 */

import { getLogger } from '../shared/logger.js';
import { runWithClientProviderContext } from '../analyze/context/shaper-provider.js';
import { appendProgressLog } from '../workflow/storage.js';
import {
	prepareWorkflowRun,
	runWorkflowServerSide,
	type PreparedWorkflowRun,
	type RunWorkflowResult,
	type WorkflowProgress,
} from './workflow-rpc.js';

const log = getLogger('daemon:workflow-run-registry');

/** Terminal + live states of a detached run. */
export type RunStatus = 'running' | 'done' | 'error' | 'aborted';

/** In-memory state of one detached run. `frames` is append-only so a
 *  cursor-based poll returns only what's new since the caller last looked. */
export interface RunState {
	readonly runId:     string;
	status:             RunStatus;
	readonly frames:    WorkflowProgress[];
	result?:            RunWorkflowResult | undefined;
	error?:             string | undefined;
	/** Resolved provider label (`meta.model`), known from start. */
	readonly model:     string;
	readonly abort:     AbortController;
	readonly startedAt: number;
}

/** Result of a `pollWorkflowRun`. `status` is `'unknown'` for an unregistered
 *  (GC'd or never-started) runId; `frames` then holds nothing and `error`
 *  explains. `cursor` is the next cursor to pass back. */
export interface PollResult {
	readonly status:  RunStatus | 'unknown';
	readonly frames:  WorkflowProgress[];
	readonly cursor:  number;
	/** Resolved provider label; absent for an unknown runId. */
	readonly model?:  string | undefined;
	readonly result?: RunWorkflowResult | undefined;
	readonly error?:  string | undefined;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const runs = new Map<string, RunState>();

/** Cap on retained runs. When exceeded, oldest TERMINAL runs are dropped first
 *  (a running run is never evicted). Simple size-cap GC — no timers. */
const MAX_RUNS = 64;

/** Test seam: clear the registry between cases. */
export function _resetWorkflowRuns(): void {
	runs.clear();
}

/** Injectable seam for `startWorkflowRun`. Tests override `prepare` to drive a
 *  fake provider without touching config/Ollama. */
export interface StartRunDeps {
	readonly prepare?: ((rawParams: unknown) => PreparedWorkflowRun) | undefined;
}

/** Kick off a workflow run DETACHED and return its `runId` immediately. The
 *  run drives in the background via `runWorkflowServerSide`; frames accumulate
 *  in the `RunState` for `pollWorkflowRun`. Throws only on a bad payload /
 *  missing repo (surfaced synchronously); a run-time failure lands in
 *  `state.error` with `status:'error'` (or `'aborted'`). */
export function startWorkflowRun(rawParams: unknown, deps: StartRunDeps = {}): { runId: string } {
	const prepare = deps.prepare ?? prepareWorkflowRun;
	const { intent, runId, epicKey, provider, modelLabel, clientDefault, review } = prepare(rawParams);
	const abort = new AbortController();
	const state: RunState = { runId, status: 'running', frames: [], model: modelLabel, abort, startedAt: Date.now() };
	runs.set(runId, state);
	gc();

	// Fire-and-forget: build the same drive closure as the streaming handler,
	// but land progress frames in the state buffer instead of the socket.
	const drive = (): Promise<RunWorkflowResult> => runWorkflowServerSide(intent, provider, {
		runId, epicKey, modelLabel, signal: abort.signal,
		onProgress: (f) => { appendProgressLog(runId, 'workflow.run', f.phase, f.detail); state.frames.push(f); },
		...(review !== undefined ? { review } : {}),
	});
	const run = clientDefault !== undefined
		? runWithClientProviderContext(clientDefault, drive)
		: drive();
	void run.then(
		(result) => {
			state.status = 'done';
			state.result = result;
			log.info({ runId, path: result.path }, 'workflow.run (async) done');
		},
		(err: unknown) => {
			if (abort.signal.aborted) {
				state.status = 'aborted';
				state.error  = 'workflow.run: aborted';
			} else {
				state.status = 'error';
				state.error  = err instanceof Error ? err.message : String(err);
			}
			log.warn({ runId, status: state.status, err: state.error }, 'workflow.run (async) ended non-ok');
		},
	);
	return { runId };
}

/** Return frames accumulated since `cursor` plus the run status + (once
 *  terminal) the result/error. `cursor` should be the value returned by the
 *  previous poll. Unknown runId → `status:'unknown'`. */
export function pollWorkflowRun(runId: string, cursor = 0): PollResult {
	const state = runs.get(runId);
	if (state === undefined) {
		return { status: 'unknown', frames: [], cursor, error: `workflow.run: unknown runId '${runId}'` };
	}
	const from   = cursor > 0 ? cursor : 0;
	const frames = state.frames.slice(from);
	return {
		status: state.status,
		frames,
		cursor: state.frames.length,
		model:  state.model,
		...(state.result !== undefined ? { result: state.result } : {}),
		...(state.error  !== undefined ? { error:  state.error }  : {}),
	};
}

/** Abort a running run: signal the driver (checked at every step) and flip the
 *  status to `'aborted'` if it was still running. Idempotent; `ok:false` for an
 *  unknown runId. */
export function abortWorkflowRun(runId: string): { ok: boolean } {
	const state = runs.get(runId);
	if (state === undefined) return { ok: false };
	state.abort.abort();
	if (state.status === 'running') state.status = 'aborted';
	return { ok: true };
}

/** Size-cap GC: evict oldest terminal runs until under `MAX_RUNS`. Running
 *  runs are never evicted (their frames are still accumulating). */
function gc(): void {
	if (runs.size <= MAX_RUNS) return;
	const terminal = [...runs.values()]
		.filter((s) => s.status !== 'running')
		.sort((a, b) => a.startedAt - b.startedAt);
	for (const s of terminal) {
		if (runs.size <= MAX_RUNS) break;
		runs.delete(s.runId);
	}
}
