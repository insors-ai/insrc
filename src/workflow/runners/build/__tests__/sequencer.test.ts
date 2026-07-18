/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the PRIVATE build sequencer (Story s3, t8) — deterministic
 * in-memory inputs, NO live provider, NO real git/test run. A fake
 * `TaskImplementerAdapter` (counts calls + in-flight) and a fake
 * `TaskVerifier` (canned verdicts) are injected, mirroring the
 * workflow-rpc throwing-stub pattern.
 *
 * Covers: verbatim work-list materialization, topological serial walk,
 * dependency gating (blocked / not-reached, adapter never invoked, no
 * verdict/filesTouched), the daemon-verdict-not-self-report invariant, the
 * maxAttempts repair budget, the empty-command case, zero/single/independent
 * fixtures, and the per-Task-boundary checkpoint hook.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/sequencer.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sequenceBuildTasks, type SequencerDeps } from '../sequencer.js';
import type { TaskVerifier } from '../verifier.js';
import type { PlanTask } from '../../../artifacts/plan.js';
import type {
	BuildTaskOutcome,
	BuildTaskReached,
	BuildTaskUnreached,
	TaskImplementerAdapter,
	TaskImplementerReport,
	TaskImplementerRequest,
} from '../schemas.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function planTask(id: string, order: number, dependsOn: string[] = [], testName = 'exit 0'): PlanTask {
	return {
		id, title: `Task ${id}`, summary: `do ${id}`, size: 'M', order,
		dependsOn, acceptanceChecks: ['ok'], derivedFrom: ['c1'],
		tests: testName.length > 0 ? [{ level: 'unit', name: testName }] : [],
	};
}

/** Fake adapter: records call order + tracks in-flight concurrency; can be
 *  told to reject for specific Tasks and to always claim completion. */
function fakeAdapter(opts?: { readonly claimedComplete?: boolean; readonly rejectFor?: ReadonlySet<string> }): TaskImplementerAdapter & {
	readonly calls: string[]; maxInFlight(): number;
} {
	const calls: string[] = [];
	let inFlight = 0;
	let peak = 0;
	return {
		calls,
		maxInFlight: () => peak,
		async implement(req: TaskImplementerRequest): Promise<TaskImplementerReport> {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			calls.push(req.task.id);
			await Promise.resolve();   // force a real async boundary
			inFlight -= 1;
			if (opts?.rejectFor?.has(req.task.id)) throw new Error(`subprocess failed for ${req.task.id}`);
			return { claimedComplete: opts?.claimedComplete ?? true, narrative: `implemented ${req.task.id}` };
		},
	};
}

interface TaskVerdictSpec {
	readonly verdicts: readonly boolean[];   // pass/fail per attempt (last repeats)
	readonly command?: string;
	readonly files?: readonly string[];
}

/** Fake verifier: canned per-Task verdicts, independent of any report. */
function fakeVerifier(spec: Record<string, TaskVerdictSpec>): TaskVerifier & { readonly verifyCalls: string[] } {
	const attempt: Record<string, number> = {};
	const verifyCalls: string[] = [];
	return {
		verifyCalls,
		resolveTestCommand(task: PlanTask): string {
			return spec[task.id]?.command ?? (task.tests[0]?.name ?? '');
		},
		async verify(task: PlanTask) {
			verifyCalls.push(task.id);
			const s = spec[task.id]!;
			const i = attempt[task.id] ?? 0;
			attempt[task.id] = i + 1;
			const passed = s.verdicts[Math.min(i, s.verdicts.length - 1)] ?? false;
			const command = s.command ?? (task.tests[0]?.name ?? '');
			return {
				verdict: { command, passed, exitCode: passed ? 0 : 1, summary: passed ? 'ok' : 'fail' },
				filesTouched: s.files ?? [],
			};
		},
	};
}

function deps(adapter: TaskImplementerAdapter, verifier: TaskVerifier, extra?: Partial<SequencerDeps>): SequencerDeps {
	return {
		adapter, verifier,
		repoRoot: '/tmp/scratch',
		storyDesignMarkdown: 'design', planMarkdown: 'plan',
		maxAttempts: 3,
		...extra,
	};
}

function isReached(o: BuildTaskOutcome): o is BuildTaskReached { return 'testVerdict' in o; }

// ---------------------------------------------------------------------------
// ac1 — verbatim work-list materialization + topological order
// ---------------------------------------------------------------------------

test('ac1: materializes the work list verbatim (same ids, order, dependsOn) and walks it topologically', async () => {
	const tasks = [planTask('t3', 3, ['t2']), planTask('t1', 1), planTask('t2', 2, ['t1'])];
	const adapter = fakeAdapter();
	const verifier = fakeVerifier({ t1: { verdicts: [true], files: ['a'] }, t2: { verdicts: [true] }, t3: { verdicts: [true] } });
	const out = await sequenceBuildTasks(tasks, deps(adapter, verifier));
	assert.deepEqual(out.map(o => o.taskId), ['t1', 't2', 't3']);   // topological (by order)
	assert.deepEqual(adapter.calls, ['t1', 't2', 't3']);            // implemented in order
	assert.ok(out.every(o => o.status === 'completed'));
});

test('ac1: zero-Task plan yields an empty outcome list and runs no implementer subprocess', async () => {
	const adapter = fakeAdapter();
	const out = await sequenceBuildTasks([], deps(adapter, fakeVerifier({})));
	assert.deepEqual(out, []);
	assert.deepEqual(adapter.calls, []);
});

test('ac1: single-Task plan yields a one-element result', async () => {
	const adapter = fakeAdapter();
	const out = await sequenceBuildTasks([planTask('t1', 1)], deps(adapter, fakeVerifier({ t1: { verdicts: [true] } })));
	assert.equal(out.length, 1);
	assert.equal(out[0]!.status, 'completed');
});

// ---------------------------------------------------------------------------
// ac3 — serial walk, exactly one Task in flight at any moment
// ---------------------------------------------------------------------------

test('ac3: two independent Tasks are still walked one at a time (never >1 in flight, never Promise.all)', async () => {
	const tasks = [planTask('t1', 1), planTask('t2', 2)];   // no dependsOn overlap
	const adapter = fakeAdapter();
	const out = await sequenceBuildTasks(tasks, deps(adapter, fakeVerifier({ t1: { verdicts: [true] }, t2: { verdicts: [true] } })));
	assert.equal(adapter.maxInFlight(), 1, 'more than one implementer subprocess was in flight');
	assert.deepEqual(adapter.calls, ['t1', 't2']);
	assert.ok(out.every(o => o.status === 'completed'));
});

// ---------------------------------------------------------------------------
// ac2 — dependency gating (blocked, not-reached) — adapter never invoked
// ---------------------------------------------------------------------------

test('ac2: a dependent Task whose dependency failed is blocked with no verdict/filesTouched, adapter never invoked for it', async () => {
	const tasks = [planTask('t1', 1), planTask('t2', 2, ['t1']), planTask('t3', 3)];   // t3 independent
	const adapter = fakeAdapter();
	// t1 fails (single attempt) → run halts after t1.
	const verifier = fakeVerifier({ t1: { verdicts: [false] }, t2: { verdicts: [true] }, t3: { verdicts: [true] } });
	const out = await sequenceBuildTasks(tasks, deps(adapter, verifier, { maxAttempts: 1 }));

	const byId = new Map(out.map(o => [o.taskId, o]));
	assert.equal(byId.get('t1')!.status, 'failed');
	// t2 depends on the failed t1 → blocked, unreached (no verdict/files).
	const t2 = byId.get('t2') as BuildTaskUnreached;
	assert.equal(t2.status, 'blocked');
	assert.equal(isReached(t2), false);
	assert.equal('testVerdict' in t2, false);
	assert.equal('filesTouched' in t2, false);
	// t3 is independent but the run already halted → not-reached.
	assert.equal(byId.get('t3')!.status, 'not-reached');
	// The adapter was invoked ONLY for the reached Task t1.
	assert.deepEqual(adapter.calls, ['t1']);
	// The verifier was consulted only for t1 (t2/t3 never reached a verdict).
	assert.deepEqual(verifier.verifyCalls, ['t1']);
});

// ---------------------------------------------------------------------------
// ac4 — the daemon-verdict-not-self-report invariant (k2)
// ---------------------------------------------------------------------------

test('ac4/k2: an advisory claimedComplete:true does NOT advance a Task with a failing daemon verdict', async () => {
	const adapter = fakeAdapter({ claimedComplete: true });   // always claims success
	const verifier = fakeVerifier({ t1: { verdicts: [false] } });   // daemon says FAIL
	const out = await sequenceBuildTasks([planTask('t1', 1)], deps(adapter, verifier, { maxAttempts: 1 }));
	assert.equal(out[0]!.status, 'failed');   // daemon verdict wins, not the report
	assert.ok(isReached(out[0]!));
	assert.equal((out[0] as BuildTaskReached).testVerdict.passed, false);
});

test('ac4: after the repair budget is exhausted with a failing verdict, the Task is failed carrying that verdict and the run halts', async () => {
	const adapter = fakeAdapter();
	const verifier = fakeVerifier({ t1: { verdicts: [false] }, t2: { verdicts: [true] } });
	const tasks = [planTask('t1', 1), planTask('t2', 2, ['t1'])];
	const out = await sequenceBuildTasks(tasks, deps(adapter, verifier, { maxAttempts: 3 }));
	const t1 = out[0] as BuildTaskReached;
	assert.equal(t1.status, 'failed');
	assert.equal(t1.attempts, 3);                 // spent the whole budget
	assert.deepEqual(adapter.calls, ['t1', 't1', 't1']);   // one subprocess per attempt
	assert.equal(out[1]!.status, 'blocked');      // run halted; dependent not built
});

test('ac4: a repair attempt that passes advances the Task (attempts reflects the successful attempt)', async () => {
	const adapter = fakeAdapter();
	const verifier = fakeVerifier({ t1: { verdicts: [false, true] } });   // fail then pass
	const out = await sequenceBuildTasks([planTask('t1', 1)], deps(adapter, verifier, { maxAttempts: 3 }));
	const t1 = out[0] as BuildTaskReached;
	assert.equal(t1.status, 'completed');
	assert.equal(t1.attempts, 2);
	assert.deepEqual(adapter.calls, ['t1', 't1']);
});

test('ac4: maxAttempts===1 takes the first verdict as terminal (no repair iteration)', async () => {
	const adapter = fakeAdapter();
	const verifier = fakeVerifier({ t1: { verdicts: [false, true] } });   // would pass on attempt 2, but budget is 1
	const out = await sequenceBuildTasks([planTask('t1', 1)], deps(adapter, verifier, { maxAttempts: 1 }));
	assert.equal(out[0]!.status, 'failed');
	assert.equal((out[0] as BuildTaskReached).attempts, 1);
	assert.deepEqual(adapter.calls, ['t1']);
});

test('ac4: a no-op editing turn with an empty diff + passing verdict is a valid completed with filesTouched === []', async () => {
	const adapter = fakeAdapter();
	const verifier = fakeVerifier({ t1: { verdicts: [true], files: [] } });
	const out = await sequenceBuildTasks([planTask('t1', 1)], deps(adapter, verifier));
	const t1 = out[0] as BuildTaskReached;
	assert.equal(t1.status, 'completed');
	assert.deepEqual(t1.filesTouched, []);
});

// ---------------------------------------------------------------------------
// ac4 — empty/absent stated test command → failed, adapter NOT invoked
// ---------------------------------------------------------------------------

test('ac4: a Task stating no runnable test command is failed WITHOUT invoking the implementer', async () => {
	const adapter = fakeAdapter();
	const verifier = fakeVerifier({ t1: { verdicts: [false], command: '' } });
	const out = await sequenceBuildTasks([planTask('t1', 1, [], /* no tests */ '')], deps(adapter, verifier));
	const t1 = out[0] as BuildTaskReached;
	assert.equal(t1.status, 'failed');
	assert.equal(t1.attempts, 0);
	assert.deepEqual(adapter.calls, []);   // adapter never invoked — nothing to satisfy
});

// ---------------------------------------------------------------------------
// checkpoint hook fires at each Task boundary (durability NFR seam)
// ---------------------------------------------------------------------------

test('checkpoint hook fires once per Task boundary with the accumulated outcomes', async () => {
	const tasks = [planTask('t1', 1), planTask('t2', 2, ['t1']), planTask('t3', 3, ['t2'])];
	const adapter = fakeAdapter();
	const verifier = fakeVerifier({ t1: { verdicts: [true] }, t2: { verdicts: [true] }, t3: { verdicts: [true] } });
	const snapshots: number[] = [];
	await sequenceBuildTasks(tasks, deps(adapter, verifier, { onCheckpoint: (o) => snapshots.push(o.length) }));
	assert.deepEqual(snapshots, [1, 2, 3]);   // grows by one at each boundary
});

// ---------------------------------------------------------------------------
// union invariant — a blocked/not-reached outcome cannot carry a verdict
// (compile-time proof + runtime shape)
// ---------------------------------------------------------------------------

test('union invariant: an unreached outcome carries no testVerdict/filesTouched (compile + runtime)', async () => {
	// @ts-expect-error — a 'blocked' (unreached) outcome cannot carry testVerdict.
	const bad: BuildTaskUnreached = { taskId: 't', title: 't', dependsOn: [], status: 'blocked', testVerdict: { command: '', passed: false, exitCode: 1, summary: '' } };
	void bad;

	const out = await sequenceBuildTasks(
		[planTask('t1', 1), planTask('t2', 2, ['t1'])],
		deps(fakeAdapter(), fakeVerifier({ t1: { verdicts: [false] } }), { maxAttempts: 1 }),
	);
	const blocked = out[1]!;
	assert.equal(blocked.status, 'blocked');
	assert.equal(isReached(blocked), false);
});
