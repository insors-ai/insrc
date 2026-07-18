/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for the sc5 adapter seam + serial-provider invariants
 * (Story s3, t9), plus the t7 driver wiring + sc3 admission gate.
 *
 * Exercises sequencer → TaskImplementerAdapter.implement() → daemon-verdict
 * end-to-end against a fake `EditSessionRunner` (counts in-flight calls to
 * assert never >1; can resolve, reject, or claim completion regardless of
 * the real verdict) plus a stubbed verifier producing the verdict + diff
 * INDEPENDENTLY of the report. Proves:
 *   - exactly one subprocess per Task, strictly serial (never Promise.all);
 *   - the LLM is reached only through the injected abstraction (no REST);
 *   - an advisory claimedComplete:true never advances a failing-verdict Task;
 *   - a provider rejection degrades to an implementer failure, daemon verdict
 *     sole authority;
 *   - the sc3 gate: the adapter is UNREACHABLE when admitted !== true, and
 *     treeUntouched holds on refusal.
 *
 * A live-CLI edit session is gated behind INSRC_LIVE_TESTS and skips cleanly.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/adapter-seam.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { CliTaskImplementerAdapter, type EditSessionRunner } from '../adapter.js';
import { driveBuildStage } from '../index.js';
import { sequenceBuildTasks, type SequencerDeps } from '../sequencer.js';
import { createGitTestVerifier, type TaskVerifier } from '../verifier.js';
import type { LLMResponse } from '../../../shared/types.js';
import type { PlanArtifact, PlanTask } from '../../../artifacts/plan.js';
import type { TaskImplementerAdapter } from '../schemas.js';
import { approveArtifactByJsonPath } from '../../../gates.js';
import { lldArtifactPaths, planArtifactPaths } from '../../../storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';

// ---------------------------------------------------------------------------
// Fakes + fixtures
// ---------------------------------------------------------------------------

function planTask(id: string, order: number, dependsOn: string[] = [], testName = 'exit 0'): PlanTask {
	return {
		id, title: `Task ${id}`, summary: `do ${id}`, size: 'M', order,
		dependsOn, acceptanceChecks: ['ok'], derivedFrom: ['c1'],
		tests: [{ level: 'unit', name: testName }],
	};
}

/** Fake CLI editing subprocess: tracks in-flight concurrency + records the
 *  cwd each call ran in; may reject. This is the ONLY LLM surface reached —
 *  no REST client is constructed anywhere. */
function fakeRunner(opts?: { readonly rejectFor?: ReadonlySet<string>; readonly text?: string }): EditSessionRunner & {
	calls(): number; maxInFlight(): number; cwds: string[];
} {
	let count = 0;
	let inFlight = 0;
	let peak = 0;
	const cwds: string[] = [];
	return {
		cwds,
		calls: () => count,
		maxInFlight: () => peak,
		async runEditSession(prompt: string, o: { readonly cwd: string }): Promise<LLMResponse> {
			count += 1;
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			cwds.push(o.cwd);
			await Promise.resolve();
			inFlight -= 1;
			// The task id is embedded in the prompt (`id: tN`); reject on match.
			const m = /\bid: (t\d+)\b/.exec(prompt);
			const taskId = m?.[1] ?? '';
			if (opts?.rejectFor?.has(taskId)) throw new Error(`edit session failed for ${taskId}`);
			return { text: opts?.text ?? `edited ${taskId}`, stopReason: 'end_turn' };
		},
	};
}

interface TaskVerdictSpec { readonly passed: boolean; readonly files?: readonly string[]; readonly command?: string }

function fakeVerifier(spec: Record<string, TaskVerdictSpec>): TaskVerifier & { readonly verifyCalls: string[] } {
	const verifyCalls: string[] = [];
	return {
		verifyCalls,
		resolveTestCommand(task: PlanTask): string { return spec[task.id]?.command ?? (task.tests[0]?.name ?? ''); },
		async verify(task: PlanTask) {
			verifyCalls.push(task.id);
			const s = spec[task.id]!;
			return {
				verdict: { command: s.command ?? 'exit 0', passed: s.passed, exitCode: s.passed ? 0 : 1, summary: s.passed ? 'ok' : 'fail' },
				filesTouched: s.files ?? [],
			};
		},
	};
}

function deps(adapter: TaskImplementerAdapter, verifier: TaskVerifier, extra?: Partial<SequencerDeps>): SequencerDeps {
	return { adapter, verifier, repoRoot: '/tmp/scratch', storyDesignMarkdown: 'd', planMarkdown: 'p', maxAttempts: 2, ...extra };
}

// ---------------------------------------------------------------------------
// t4 — adapter drives exactly one subprocess per implement(); rejection surfaces
// ---------------------------------------------------------------------------

test('t4: implement() drives exactly one CLI subprocess per call through the injected abstraction (cwd = repoRoot)', async () => {
	const runner = fakeRunner();
	const adapter = new CliTaskImplementerAdapter(runner);
	const report = await adapter.implement({
		task: planTask('t1', 1), storyDesignMarkdown: 'd', planMarkdown: 'p',
		completedDependencies: [], repoRoot: '/repo/root', maxAttempts: 3,
	});
	assert.equal(runner.calls(), 1);                 // exactly one subprocess
	assert.deepEqual(runner.cwds, ['/repo/root']);   // ran inside the repo
	assert.equal(report.claimedComplete, true);      // advisory
	assert.match(report.narrative, /edited t1/);
});

test('t4: a subprocess rejection surfaces from implement() as a rejected Promise', async () => {
	const runner = fakeRunner({ rejectFor: new Set(['t1']) });
	const adapter = new CliTaskImplementerAdapter(runner);
	await assert.rejects(
		() => adapter.implement({ task: planTask('t1', 1), storyDesignMarkdown: 'd', planMarkdown: 'p', completedDependencies: [], repoRoot: '/r', maxAttempts: 1 }),
		/edit session failed for t1/,
	);
});

// ---------------------------------------------------------------------------
// ac3/ac5 — one subprocess per Task, strictly serial across the whole run
// ---------------------------------------------------------------------------

test('ac3/ac5: end-to-end run drives exactly one subprocess per Task, never >1 in flight', async () => {
	const runner = fakeRunner();
	const adapter = new CliTaskImplementerAdapter(runner);
	const tasks = [planTask('t1', 1), planTask('t2', 2), planTask('t3', 3)];   // all independent
	const verifier = fakeVerifier({ t1: { passed: true }, t2: { passed: true }, t3: { passed: true } });
	const out = await sequenceBuildTasks(tasks, deps(adapter, verifier));
	assert.equal(runner.calls(), 3);           // one per Task
	assert.equal(runner.maxInFlight(), 1);     // strictly serial — never parallel
	assert.ok(out.every(o => o.status === 'completed'));
});

// ---------------------------------------------------------------------------
// ac4 — advisory report never advances; daemon verdict is sole authority
// ---------------------------------------------------------------------------

test('ac4: a session that claims completion does NOT advance a Task whose daemon verdict fails', async () => {
	const runner = fakeRunner({ text: 'I completed the Task successfully!' });   // claims success
	const adapter = new CliTaskImplementerAdapter(runner);
	const verifier = fakeVerifier({ t1: { passed: false } });                    // daemon says fail
	const out = await sequenceBuildTasks([planTask('t1', 1)], deps(adapter, verifier, { maxAttempts: 1 }));
	assert.equal(out[0]!.status, 'failed');
});

test('ac5: a provider rejection degrades to an implementer failure with the daemon verdict as sole authority', async () => {
	// The subprocess rejects, but the daemon verdict PASSES — advancement is
	// driven purely by the daemon, proving the report is never required.
	const runner = fakeRunner({ rejectFor: new Set(['t1']) });
	const adapter = new CliTaskImplementerAdapter(runner);
	const verifier = fakeVerifier({ t1: { passed: true, files: ['x'] } });
	const out = await sequenceBuildTasks([planTask('t1', 1)], deps(adapter, verifier, { maxAttempts: 1 }));
	assert.equal(out[0]!.status, 'completed');   // daemon verdict wins despite the rejection
	assert.deepEqual(verifier.verifyCalls, ['t1']);
});

// ---------------------------------------------------------------------------
// sc3 — driveBuildStage: adapter unreachable on refusal, treeUntouched holds
// ---------------------------------------------------------------------------

function seedApprovedPlan(repo: string, storyId: string): void {
	const plan: PlanArtifact = {
		meta: {
			workflow: 'plan', runId: 'plan-run-1', repoPath: repo, createdAt: '2026-01-01T00:00:00Z',
			model: 'client', elapsedMs: 1, repoIndexedAt: null, schemaVersion: 1,
			epicHash: HASH, epicSlug: 'demo', storyId, lldRunId: 'lld-1', lldEffectiveHash: 'basis',
		},
		body: {
			tasks: [planTask('t1', 1)],
			testStrategyCoverage: [{ lldStrategyItem: 'unit: it works', coveredByTaskIds: ['t1'] }],
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD' }],
	};
	const pp = planArtifactPaths(repo, HASH, storyId);
	mkdirSync(dirname(pp.json), { recursive: true });
	writeFileSync(pp.json, JSON.stringify(plan, null, 2));
	approveArtifactByJsonPath(pp.json);

	const lp = lldArtifactPaths(repo, HASH, storyId);
	mkdirSync(dirname(lp.json), { recursive: true });
	writeFileSync(lp.json, JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'lld-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'demo', storyId,
			hldBaseRunId: 'hld-1', hldEffectiveHash: 'basis', approvedAt: '2026-01-01T00:00:00Z',
		}, body: {}, citations: [],
	}, null, 2));
}

test('sc3: driveBuildStage refuses a missing plan — adapter UNREACHABLE, treeUntouched, no outcomes', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-drive-'));
	try {
		const runner = fakeRunner();
		const adapter = new CliTaskImplementerAdapter(runner);
		const res = await driveBuildStage(
			{ repoPath: repo, epicHash: HASH, storyId: 's1' },
			{ adapter, verifier: fakeVerifier({}) },
		);
		assert.equal(res.admitted, false);
		assert.equal(res.refusal?.reason, 'plan-missing');
		assert.equal(res.refusal?.treeUntouched, true);
		assert.deepEqual(res.taskOutcomes, []);
		assert.equal(runner.calls(), 0);   // adapter never reached on refusal
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t7: driveBuildStage on an admitted plan runs the sequencer over the injected deps + fires the checkpoint hook', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-drive-ok-'));
	try {
		seedApprovedPlan(repo, 's1');
		const runner = fakeRunner();
		const adapter = new CliTaskImplementerAdapter(runner);
		const snapshots: number[] = [];
		const res = await driveBuildStage(
			{ repoPath: repo, epicHash: HASH, storyId: 's1', maxAttempts: 1, onCheckpoint: (o) => snapshots.push(o.length) },
			{ adapter, verifier: fakeVerifier({ t1: { passed: true, files: ['a'] } }) },
		);
		assert.equal(res.admitted, true);
		assert.equal(res.taskOutcomes.length, 1);
		assert.equal(res.taskOutcomes[0]!.status, 'completed');
		assert.equal(runner.calls(), 1);          // exactly one subprocess for the one Task
		assert.deepEqual(snapshots, [1]);          // checkpoint fired at the Task boundary
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// LIVE — a real claude/codex edit session (gated; skips cleanly when unset)
// ---------------------------------------------------------------------------

test('live: a real CLI edit session implements a trivial Task and the daemon verdict advances it', {
	skip: process.env['INSRC_LIVE_TESTS'] !== '1' ? 'set INSRC_LIVE_TESTS=1 to run the live CLI edit session' : false,
}, async () => {
	const { CliProvider } = await import('../../../../agent/providers/cli-provider.js');
	const repo = mkdtempSync(join(tmpdir(), 'insrc-live-build-'));
	try {
		execFileSync('git', ['init', '-q'], { cwd: repo });
		const adapter = new CliTaskImplementerAdapter(new CliProvider({ kind: 'claude' }));
		const verifier = createGitTestVerifier();
		// A Task whose test passes once the file exists.
		const task = planTask('t1', 1, [], 'test -f hello.txt');
		const out = await sequenceBuildTasks([task], deps(adapter, verifier, { repoRoot: repo, maxAttempts: 2 }));
		assert.equal(out[0]!.status, 'completed');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
