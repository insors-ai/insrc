/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the async (start/poll/abort) workflow run registry. Drives the
 * `stub` workflow end-to-end DETACHED via `startWorkflowRun`, using a FAKE
 * provider (canned plan + artifact) — no Ollama/CLI, no network. Confirms:
 *   - start returns a runId synchronously; poll transitions running → done;
 *   - a second poll with the returned cursor yields only NEW frames;
 *   - the terminal result carries the persisted artifact path + model;
 *   - abort flips the status.
 *
 * The provider build normally comes from `prepareWorkflowRun` (config-driven);
 * these tests stub the whole prepare step so a fake provider drives the loop.
 *
 * Run: npx tsx --test src/daemon/__tests__/workflow-run-registry.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as registry from '../workflow-run-registry.js';
import type { StartRunDeps } from '../workflow-run-registry.js';
import type { LLMProvider, LLMMessage, StructuredSchema } from '../../shared/types.js';
import type { PreparedWorkflowRun } from '../workflow-rpc.js';

// ---------------------------------------------------------------------------
// Fakes (mirrors workflow-rpc.test.ts).
// ---------------------------------------------------------------------------

class FakeProvider implements LLMProvider {
	private readonly queue: unknown[];
	public calls = 0;
	constructor(responses: unknown[]) { this.queue = [...responses]; }
	readonly supportsTools = false;
	get capabilities() {
		return { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false };
	}
	async complete(): Promise<never> { throw new Error('unused'); }
	async *stream(): AsyncIterable<string> { throw new Error('unused'); }
	async embed(): Promise<number[]> { return []; }
	async completeStructured<T>(_m: LLMMessage[], _s: StructuredSchema): Promise<T> {
		this.calls += 1;
		if (this.queue.length === 0) throw new Error('FakeProvider: response queue exhausted');
		return this.queue.shift() as T;
	}
}

const STUB_PLAN = {
	workflow: 'stub',
	steps: [
		{ id: 's1', runner: 'echo.a', params: {} },
		{ id: 's2', runner: 'echo.b', params: {} },
		{ id: 's3', runner: 'echo.c', params: {} },
	],
};
const STUB_ARTIFACT = {
	body: { title: 'Demo', summary: 'A demo summary grounded in a step [[c1]].', bulletList: ['first point [[c1]]'] },
	citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
};

/** Build a `StartRunDeps.prepare` that drives a fake provider — no config/Ollama. */
function stubDeps(repo: string, provider: LLMProvider, runId: string): StartRunDeps {
	const prep: PreparedWorkflowRun = {
		intent:        { workflow: 'stub', focus: 'demo stub run', repoPath: repo, repoIndexedAt: null, params: {} },
		runId,
		epicKey:       `demo-stub-${runId}`,
		provider,
		modelLabel:    'ollama:qwen3-test',
		clientDefault: undefined,
		review:        false,
	};
	return { prepare: () => prep };
}

/** Poll until the run reaches a terminal status or the deadline elapses. */
async function pollUntilTerminal(runId: string, timeoutMs = 5000): Promise<registry.PollResult> {
	const deadline = Date.now() + timeoutMs;
	let cursor = 0;
	let last: registry.PollResult = registry.pollWorkflowRun(runId, cursor);
	while (last.status === 'running' && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 10));
		cursor = last.cursor;
		last = registry.pollWorkflowRun(runId, cursor);
	}
	return last;
}

afterEach(() => {
	registry._resetWorkflowRuns();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('startWorkflowRun returns a runId synchronously and poll transitions running → done', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-reg-'));
	try {
		const provider = new FakeProvider([STUB_PLAN, STUB_ARTIFACT]);
		const deps = stubDeps(repo, provider, 'wf-reg-1');

		const { runId } = registry.startWorkflowRun({ workflow: 'stub', focus: 'demo stub run', repo }, deps);
		assert.equal(runId, 'wf-reg-1');

		// Immediately after start the run is registered + running.
		const first = registry.pollWorkflowRun(runId, 0);
		assert.equal(first.status, 'running');
		assert.equal(first.model, 'ollama:qwen3-test');

		const done = await pollUntilTerminal(runId);
		assert.equal(done.status, 'done');
		assert.ok(done.result, 'terminal result present');
		assert.ok(done.result!.path.endsWith('/docs/stub/demo-stub-wf-reg-1.md'), done.result!.path);

		// The persisted artifact is stamped with the fake provider label.
		const json = JSON.parse(readFileSync(done.result!.path.replace(/\.md$/, '.json'), 'utf8')) as { meta: { model: string } };
		assert.equal(json.meta.model, 'ollama:qwen3-test');
		assert.equal(provider.calls, 2);   // decompose + synthesize
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('poll with the returned cursor yields only NEW frames (append-only)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-reg-'));
	try {
		const provider = new FakeProvider([STUB_PLAN, STUB_ARTIFACT]);
		const deps = stubDeps(repo, provider, 'wf-reg-2');

		const { runId } = registry.startWorkflowRun({ workflow: 'stub', focus: 'demo stub run', repo }, deps);

		// Drain frames across multiple cursor-advancing polls, collecting phases.
		const phases: string[] = [];
		let cursor = 0;
		const deadline = Date.now() + 5000;
		let status = 'running';
		while (status === 'running' && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 5));
			const res = registry.pollWorkflowRun(runId, cursor);
			for (const f of res.frames) phases.push(f.phase);   // each frame seen exactly once
			assert.ok(res.cursor >= cursor, 'cursor is monotonic');
			cursor = res.cursor;
			status = res.status;
		}
		// A completed stub run emits at least decompose → plan-ready → done,
		// each appearing exactly once across the cursor-advanced polls.
		assert.ok(phases.includes('decompose'), phases.join(','));
		assert.ok(phases.includes('done'), phases.join(','));
		assert.equal(phases.filter((p) => p === 'done').length, 1, 'done frame seen exactly once');

		// A re-poll at the final cursor returns no further frames.
		const tail = registry.pollWorkflowRun(runId, cursor);
		assert.equal(tail.frames.length, 0, 'no new frames past the final cursor');
		assert.equal(tail.status, 'done');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('unknown runId polls as status:unknown with an error', () => {
	const res = registry.pollWorkflowRun('does-not-exist', 0);
	assert.equal(res.status, 'unknown');
	assert.equal(res.frames.length, 0);
	assert.match(res.error ?? '', /unknown runId/);
});

test('abortWorkflowRun flips a running run to aborted; unknown runId → ok:false', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-reg-'));
	try {
		// A provider that never resolves the plan turn keeps the run 'running'
		// long enough to observe the abort transition deterministically.
		let release: (() => void) | undefined;
		const hangingProvider: LLMProvider = {
			supportsTools: false,
			get capabilities() { return { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false }; },
			async complete(): Promise<never> { throw new Error('unused'); },
			async *stream(): AsyncIterable<string> { throw new Error('unused'); },
			async embed(): Promise<number[]> { return []; },
			completeStructured<T>(): Promise<T> {
				return new Promise<T>((_resolve, reject) => { release = () => reject(new Error('released')); });
			},
		};
		const deps = stubDeps(repo, hangingProvider, 'wf-reg-3');

		const { runId } = registry.startWorkflowRun({ workflow: 'stub', focus: 'demo stub run', repo }, deps);
		await new Promise((r) => setTimeout(r, 20));   // let the driver reach the hanging turn
		assert.equal(registry.pollWorkflowRun(runId, 0).status, 'running');

		const aborted = registry.abortWorkflowRun(runId);
		assert.deepEqual(aborted, { ok: true });
		assert.equal(registry.pollWorkflowRun(runId, 0).status, 'aborted');

		assert.deepEqual(registry.abortWorkflowRun('nope'), { ok: false });
		release?.();   // unstick the hanging promise so the process can exit
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
