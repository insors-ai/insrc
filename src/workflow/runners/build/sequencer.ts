/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The PRIVATE verdict-driven build sequencer (Story s3, t6).
 *
 * Walks the pre-validated `PlanTask[]` in topological (`order`) sequence with
 * a serial `for...of` — NEVER `Promise.all`, even where independent Tasks
 * would permit parallelism (ac3/ac5). Per Task:
 *
 *   1. gate on `dependsOn` — if any dependency did not `'completed'`, emit a
 *      `BuildTaskUnreached 'blocked'` and DO NOT invoke the implementer;
 *   2. if the run already halted on an earlier failed Task, emit
 *      `'not-reached'` (also without invoking the implementer);
 *   3. otherwise run the bounded repair loop: implementer adapter → daemon
 *      verifier → advance decision, taken SOLELY from the daemon-produced
 *      `BuildTestVerdict` (never the advisory `TaskImplementerReport`).
 *
 * A Task that fails after the repair budget is exhausted HALTS the run: no
 * later Task is implemented (s4 halts on the failed outcome).
 *
 * The implementer adapter and the verifier are INJECTED seams, so this whole
 * module is exercised in unit tests with no live provider and no real git
 * (t8/t9). Kept PRIVATE to `runners/build/`: siblings see only finished
 * `BuildTaskOutcome` values via `driveBuildStage` (index.ts).
 *
 * THE k2 LOAD-BEARING INVARIANT, enforced at RUNTIME here: advancement is
 * decided ONLY from `verification.verdict.passed`. The advisory report's
 * `claimedComplete` is never read for the advance decision — proven by
 * `sequencer.test.ts` (a report claiming success against a failing daemon
 * verdict still yields `'failed'`).
 */

import { getLogger } from '../../../shared/logger.js';
import type { PlanTask } from '../../artifacts/plan.js';
import type {
	BuildTaskInFlight,
	BuildTaskOutcome,
	BuildTaskReached,
	BuildTaskStatus,
	BuildTaskUnreached,
	TaskImplementerAdapter,
	TaskImplementerRequest,
} from './schemas.js';
import type { DaemonVerification, TaskVerifier } from './verifier.js';

const log = getLogger('workflow:build');

/** A per-Task-boundary progress frame (observability). */
export interface BuildTaskProgress {
	readonly taskId:   string;
	readonly phase:    'task-start' | 'implementer-finished' | 'test-verdict' | 'advanced' | 'halted' | 'blocked' | 'not-reached';
	readonly attempt?: number | undefined;
	readonly status?:  BuildTaskStatus | undefined;
	readonly detail?:  string | undefined;
}

export interface SequencerDeps {
	readonly adapter:  TaskImplementerAdapter;
	readonly verifier: TaskVerifier;
	readonly repoRoot: string;
	readonly storyDesignMarkdown: string;
	readonly planMarkdown:        string;
	/** Bounded per-Task repair budget (>= 1). */
	readonly maxAttempts: number;
	readonly onProgress?:   ((frame: BuildTaskProgress) => void) | undefined;
	/** Fired at EVERY Task boundary with the accumulated TERMINAL outcomes so
	 *  far, so the wiring layer can persist incrementally (durability NFR). */
	readonly onCheckpoint?: ((outcomes: readonly BuildTaskOutcome[]) => void) | undefined;
	/** Fired just BEFORE a reached Task is driven, with the accumulated
	 *  terminal outcomes PLUS the single in-flight `'running'` row appended.
	 *  Lets the wiring layer persist a checkpoint that carries exactly one
	 *  `'running'` slot, so a run interrupted mid-Task leaves the s4 projection
	 *  a live `inFlightTaskId` to re-derive on restart (a1). Additive to
	 *  `onCheckpoint`, whose per-boundary cadence is unchanged. */
	readonly onInFlight?:   ((outcomes: readonly BuildTaskOutcome[]) => void) | undefined;
}

/**
 * Sequence a Story's Tasks one at a time in dependency order, returning one
 * `BuildTaskOutcome` per Task (verbatim ids/order preserved). The input
 * `tasks` is the approved plan's `PlanTask[]`, pre-validated acyclic by
 * `checkPlanTaskGraph` upstream — the sequencer sorts by `order` (a valid
 * topological order) and never re-derives the graph.
 */
export async function sequenceBuildTasks(
	tasks: readonly PlanTask[],
	deps:  SequencerDeps,
): Promise<readonly BuildTaskOutcome[]> {
	const ordered = [...tasks].sort((a, b) => a.order - b.order);
	const outcomes = new Map<string, BuildTaskOutcome>();
	const results: BuildTaskOutcome[] = [];
	let halted = false;

	// SERIAL walk — never Promise.all (provider calls are strictly serial).
	for (const task of ordered) {
		const depsCompleted = task.dependsOn.every(id => outcomes.get(id)?.status === 'completed');
		let outcome: BuildTaskOutcome;

		// THE HALT BRANCH (s4, formalized). Three mutually exclusive arms, in
		// priority order, so the invariant `runState==='halted' iff >=1 outcome
		// has status 'failed'` holds by construction:
		//   1. a dependency did not `'completed'`   → 'blocked'  (implementer NOT run)
		//   2. the run already halted on a failed Task → 'not-reached' (implementer NOT run)
		//   3. otherwise DRIVE the Task; a terminal 'failed' verdict HALTS the run
		//      (`halted := true`), so every later Task falls into arm 2.
		// Only ONE Task ever reaches a 'failed' outcome — the FIRST unrepairable
		// one — because arm 3 is gated on `!halted`. The blocked-vs-not-reached
		// classification the sequencer stamps here is advisory for observability;
		// s4's read-time projection (progress.ts) RECOMPUTES blockedTaskIds from
		// the plan graph, so it is the single source of truth (alt a1).
		if (!depsCompleted) {
			outcome = unreached(task, 'blocked', 'a dependency did not complete');
			deps.onProgress?.({ taskId: task.id, phase: 'blocked', status: 'blocked' });
		} else if (halted) {
			outcome = unreached(task, 'not-reached', 'the run halted on an earlier failed Task');
			deps.onProgress?.({ taskId: task.id, phase: 'not-reached', status: 'not-reached' });
		} else {
			// Publish the single in-flight `'running'` slot BEFORE driving, so an
			// interruption mid-Task leaves exactly one 'running' row on disk.
			deps.onInFlight?.([...results, inFlight(task)]);
			const completedDeps = task.dependsOn
				.map(id => outcomes.get(id))
				.filter((o): o is BuildTaskOutcome => o !== undefined);
			outcome = await runOneTask(task, completedDeps, deps);
			if (outcome.status === 'failed') {
				halted = true;
				deps.onProgress?.({ taskId: task.id, phase: 'halted', status: 'failed', detail: 'run halts on the failed Task' });
			} else {
				deps.onProgress?.({ taskId: task.id, phase: 'advanced', status: outcome.status });
			}
		}

		outcomes.set(task.id, outcome);
		results.push(outcome);
		// Per-Task-boundary checkpoint (a fresh snapshot copy each time).
		deps.onCheckpoint?.([...results]);
	}
	return results;
}

/**
 * Run the bounded edit→verify→repair loop for ONE reached Task. Advancement
 * is decided ONLY from the daemon verifier's verdict.
 */
async function runOneTask(
	task: PlanTask,
	completedDeps: readonly BuildTaskOutcome[],
	deps: SequencerDeps,
): Promise<BuildTaskReached> {
	// A Task that authorizes no runnable test command cannot be
	// authoritatively verified — flag it failed WITHOUT invoking the
	// implementer (nothing for it to satisfy). NEVER a fabricated pass.
	const command = deps.verifier.resolveTestCommand(task).trim();
	if (command === '') {
		const verification = await deps.verifier.verify(task, deps.repoRoot);
		deps.onProgress?.({ taskId: task.id, phase: 'test-verdict', status: 'failed', detail: 'no stated test command' });
		return reached(task, 'failed', verification, 0);
	}

	const req: TaskImplementerRequest = {
		task,
		storyDesignMarkdown:   deps.storyDesignMarkdown,
		planMarkdown:          deps.planMarkdown,
		completedDependencies: completedDeps,
		repoRoot:              deps.repoRoot,
		maxAttempts:           deps.maxAttempts,
	};

	const budget = Math.max(1, deps.maxAttempts);
	let lastVerification: DaemonVerification | undefined;
	let attempts = 0;

	for (let attempt = 1; attempt <= budget; attempt += 1) {
		attempts = attempt;
		deps.onProgress?.({ taskId: task.id, phase: 'task-start', attempt });

		// One implementer subprocess (serial). A rejection is an implementer
		// FAILURE, not a Task pass — swallow it and let the daemon verdict
		// (below) be the sole authority.
		try {
			const report = await deps.adapter.implement(req);
			deps.onProgress?.({
				taskId: task.id, phase: 'implementer-finished', attempt,
				detail: `claimedComplete=${report.claimedComplete} (advisory)`,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log.warn({ taskId: task.id, attempt, err: msg }, 'implementer subprocess failed; daemon verdict remains authoritative');
			deps.onProgress?.({ taskId: task.id, phase: 'implementer-finished', attempt, detail: `implementer error: ${msg}` });
		}

		// The DAEMON'S OWN verdict — the sole advance authority (k2).
		const verification = await deps.verifier.verify(task, deps.repoRoot);
		lastVerification = verification;
		deps.onProgress?.({
			taskId: task.id, phase: 'test-verdict', attempt,
			detail: `passed=${verification.verdict.passed} exit=${verification.verdict.exitCode}`,
		});

		if (verification.verdict.passed) {
			return reached(task, 'completed', verification, attempt);
		}
		// Failing verdict — repair on the next attempt if budget remains.
	}

	// Budget exhausted with a still-failing verdict → terminal 'failed'.
	// `lastVerification` is always defined (budget >= 1).
	return reached(task, 'failed', lastVerification!, attempts);
}

// ---------------------------------------------------------------------------
// Outcome constructors
// ---------------------------------------------------------------------------

function reached(
	task:         PlanTask,
	status:       'completed' | 'failed',
	verification: DaemonVerification,
	attempts:     number,
): BuildTaskReached {
	return {
		taskId:       task.id,
		title:        task.title,
		dependsOn:    task.dependsOn,
		status,
		filesTouched: verification.filesTouched,
		testVerdict:  verification.verdict,
		attempts,
	};
}

function unreached(
	task:   PlanTask,
	status: 'blocked' | 'not-reached',
	note:   string,
): BuildTaskUnreached {
	return {
		taskId:    task.id,
		title:     task.title,
		dependsOn: task.dependsOn,
		status,
		note,
	};
}

/** The single in-flight `'running'` slot for a Task about to be driven —
 *  no verdict/diff yet (the daemon has produced neither). */
function inFlight(task: PlanTask): BuildTaskInFlight {
	return {
		taskId:    task.id,
		title:     task.title,
		dependsOn: task.dependsOn,
		status:    'running',
	};
}
