/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the daemon-side workflow runner. Drives the `stub`
 * workflow end-to-end through `runWorkflowServerSide` with a FAKE
 * `LLMProvider` (canned plan + artifact JSON) — no Ollama/CLI, no network.
 * Confirms the decompose→execute→synthesize→persist loop and that the
 * artifact is stamped with the provider `modelLabel` (not 'client').
 *
 * The pause/resume + analyze-injection paths are exercised live (Ollama)
 * in the define verification, not here.
 *
 * Run: npx tsx --test src/daemon/__tests__/workflow-rpc.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REVIEW_SKIPPED_DETAIL, runWorkflowServerSide } from '../workflow-rpc.js';
import type { WorkflowProgress } from '../workflow-rpc.js';
import type { LLMProvider, LLMMessage, StructuredSchema } from '../../shared/types.js';
import type { WorkflowIntent } from '../../workflow/types.js';
import type { RoleRouter, ResolvedProvider, RoleResolution } from '../../analyze/context/role-router.js';
import type { AnalyzeConfig } from '../../config/analyze.js';

// ---------------------------------------------------------------------------
// Fake provider — returns a fixed queue of structured responses.
// ---------------------------------------------------------------------------

class FakeProvider implements LLMProvider {
	private readonly queue: unknown[];
	public calls = 0;
	constructor(responses: unknown[], private readonly structured = true) { this.queue = [...responses]; }
	readonly supportsTools = false;
	get capabilities() {
		return { structuredOutput: this.structured, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false };
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

function stubIntent(repo: string): WorkflowIntent {
	return { workflow: 'stub', focus: 'demo stub run', repoPath: repo, repoIndexedAt: null, params: {} };
}

/** A stub RoleRouter returning a distinct provider + resolution per role, so a
 *  driven run captures heterogeneous per-output attribution (S004/sc5). Memoized
 *  per role so a role's FakeProvider queue persists across repeated resolutions. */
function stubRouter(byRole: Record<string, { provider: LLMProvider; resolution: RoleResolution }>): RoleRouter {
	const cache = new Map<string, ResolvedProvider>();
	return {
		resolveProviderForRole(role) {
			let hit = cache.get(role);
			if (hit === undefined) {
				hit = byRole[role] ?? { provider: new FakeProvider([]), resolution: { role, tier: 'mid', runner: 'ollama', model: 'stub' } };
				cache.set(role, hit);
			}
			return hit;
		},
		resolveSummariser() {
			return { provider: new FakeProvider([]), resolution: { role: 'indexer.summarise', tier: 'cheap', runner: 'ollama', model: 'stub' } };
		},
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('runWorkflowServerSide drives stub end-to-end + stamps per-output attribution (sc5), not the retired scalar model', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		const provider = new FakeProvider([STUB_PLAN, STUB_ARTIFACT]);
		const out = await runWorkflowServerSide(stubIntent(repo), provider, {
			runId: 'wf-test-1', epicKey: 'demo-stub', modelLabel: 'ollama:qwen3-test',
			review: false,   // this test asserts the decompose+synthesize turn count; review is exercised separately
		});
		assert.ok(out.path.endsWith('/docs/stub/demo-stub.md'), out.path);

		// No router was supplied, so attribution is synthesized from the run-wide
		// label; the RETIRED scalar meta.model is no longer written.
		const json = JSON.parse(readFileSync(out.path.replace(/\.md$/, '.json'), 'utf8')) as {
			meta: { model?: string; workflow: string; authoredBy?: string; attribution: { outputs: { runner: string; model: string }[] } };
		};
		// T2 (LLD-1716f77ba9ba017b-S001): a daemon run authors as the daemon. The
		// first finalize and every correction retry share ONE finalize helper.
		assert.equal(json.meta.authoredBy, 'daemon');
		assert.equal(json.meta.model, undefined, 'scalar meta.model is retired (sc5)');
		assert.equal(json.meta.attribution.outputs[0]!.runner, 'ollama');
		assert.equal(json.meta.attribution.outputs[0]!.model, 'qwen3-test');   // NOT 'client'
		assert.equal(out.model, 'ollama:qwen3-test');   // done-frame summary
		assert.equal(json.meta.workflow, 'stub');

		// Exactly two provider turns: the decomposer plan + the synthesize
		// artifact (stub steps are deterministic `output` runners, no pauses).
		assert.equal(provider.calls, 2);

		const md = readFileSync(out.path, 'utf8');
		assert.match(md, /\[\[c1\]\]/);   // citation grounding survived render + validation
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('runWorkflowServerSide with a router captures per-output attribution — one heterogeneous row per output (sc5 ac1)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		// Stub steps are deterministic `output` runners → the two provider calls
		// are decompose (role design.decompose) + synthesize (role synthesize).
		const router = stubRouter({
			'design.decompose': { provider: new FakeProvider([STUB_PLAN]),     resolution: { role: 'design.decompose', tier: 'mid',  runner: 'ollama',     model: 'qwen-decomp' } },
			'synthesize':       { provider: new FakeProvider([STUB_ARTIFACT]), resolution: { role: 'synthesize',       tier: 'core', runner: 'cli-claude', model: 'opus-synth' } },
		});
		const out = await runWorkflowServerSide(stubIntent(repo), new FakeProvider([]), {
			runId: 'wf-test-attr', epicKey: 'demo-attr', modelLabel: 'ollama:should-be-ignored',
			router, cfg: {} as AnalyzeConfig, review: false,
		});

		const json = JSON.parse(readFileSync(out.path.replace(/\.md$/, '.json'), 'utf8')) as {
			meta: { model?: string; attribution: { outputs: { role: string; tier: string; runner: string; model: string }[] } };
		};
		assert.equal(json.meta.model, undefined, 'scalar retired');
		const outs = json.meta.attribution.outputs;
		// One row per produced output, in step-execution order (plan, then synthesize),
		// each carrying its OWN runner/model — never flattened to one dominant runner.
		assert.equal(outs.length, 2);
		assert.deepEqual(outs[0], { role: 'design.decompose', tier: 'mid', runner: 'ollama', model: 'qwen-decomp' });
		assert.deepEqual(outs[1], { role: 'synthesize', tier: 'core', runner: 'cli-claude', model: 'opus-synth' });
		// Heterogeneous run → done-frame summary is mixed(...), not the ignored modelLabel.
		assert.match(out.model, /^mixed\(2: /);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('runWorkflowServerSide does NOT review the artifact it authors (the other party reviews it)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		const provider = new FakeProvider([STUB_PLAN, STUB_ARTIFACT]);
		const out = await runWorkflowServerSide(stubIntent(repo), provider, {
			runId: 'wf-test-nr', epicKey: 'demo-stub-nr', modelLabel: 'ollama:qwen3-test',
		});
		assert.equal(out.review, undefined, 'the daemon does not review its own artifact');
		assert.equal(provider.calls, 2);   // decompose + synthesize only — no review turns
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T16 a run asked to review (review:true) makes no review call, says the artifact needs a controller review, and stamps nothing', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		// The queue holds a review's extract answer too. If the run reviewed its own
		// artifact it would consume it, and the call count below would be 3.
		const REVIEW_EXTRACT = { claims: [] };
		const provider = new FakeProvider([STUB_PLAN, STUB_ARTIFACT, REVIEW_EXTRACT]);
		const frames: WorkflowProgress[] = [];
		const out = await runWorkflowServerSide(stubIntent(repo), provider, {
			runId: 'wf-test-r', epicKey: 'demo-stub-r', modelLabel: 'ollama:qwen3-test', review: true,
			onProgress: (f) => frames.push(f),
		});
		assert.equal(provider.calls, 2, 'decompose + synthesize only: no review turn');
		assert.equal(out.review, undefined, 'no review is returned');
		const json = JSON.parse(readFileSync(out.path.replace(/\.md$/, '.json'), 'utf8')) as { meta: { review?: unknown; authoredBy?: string } };
		assert.equal(json.meta.review, undefined, 'the artifact is left unstamped');
		assert.equal(json.meta.authoredBy, 'daemon');
		assert.ok(!readFileSync(out.path, 'utf8').includes('insrc:review'), 'and no review section is appended to the document');

		const skipped = frames.filter(f => f.phase === 'review-skipped');
		assert.equal(skipped.length, 1, 'the skip is announced once');
		assert.equal(skipped[0]!.detail, REVIEW_SKIPPED_DETAIL);
		assert.match(REVIEW_SKIPPED_DETAIL, /controller review \(insrc_review_step\)/);
		assert.ok(frames.every(f => f.phase !== 'review' && f.phase !== 'review-done'), 'no review phase is reported');
		assert.ok(frames.findIndex(f => f.phase === 'review-skipped') < frames.findIndex(f => f.phase === 'done'));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T16 a run not asked to review announces nothing about a review', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		const frames: WorkflowProgress[] = [];
		await runWorkflowServerSide(stubIntent(repo), new FakeProvider([STUB_PLAN, STUB_ARTIFACT]), {
			runId: 'wf-test-q', epicKey: 'demo-stub-q', modelLabel: 'ollama:qwen3-test',
			onProgress: (f) => frames.push(f),
		});
		assert.ok(frames.every(f => !f.phase.startsWith('review')));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('runWorkflowServerSide refuses a provider without structured-output', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		const provider = new FakeProvider([], /* structured */ false);
		await assert.rejects(
			() => runWorkflowServerSide(stubIntent(repo), provider, { runId: 'wf-test-2', epicKey: 'x', modelLabel: 'ollama:x' }),
			/structured output/,
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('runWorkflowServerSide fails clearly when synthesize stays invalid across all attempts', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		// Plan ok, but every synthesize attempt returns a body that references
		// [[c1]] with an EMPTY citations[] (dangling ref → validateBodyAndCitations
		// fails) → exhausts retries → throws.
		const badArtifact = { body: { title: 'x', summary: 'claim [[c1]]', bulletList: ['point [[c1]]'] }, citations: [] };
		const provider = new FakeProvider([STUB_PLAN, badArtifact, badArtifact, badArtifact]);
		await assert.rejects(
			() => runWorkflowServerSide(stubIntent(repo), provider, { runId: 'wf-test-3', epicKey: 'y', modelLabel: 'ollama:x', maxSynthAttempts: 3 }),
			/synthesize rejected after 3 attempts/,
		);
		assert.equal(provider.calls, 4);   // 1 plan + 3 synth attempts
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T2 the daemon run finalizes through ONE call, so a correction retry cannot skip the author stamp', () => {
	// No test drives a correction round end to end (it needs a full design run that
	// fails its boundary audit and then passes). What this pins instead is the
	// structure that makes the retry safe: the run's first attempt and its retries
	// all go through `finalizeAsDaemon`, and that helper holds the file's only
	// finalizeArtifact call. A second, direct call would be an unstamped path.
	const src = readFileSync(new URL('../workflow-rpc.ts', import.meta.url), 'utf8');
	const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
	const calls = code.match(/\bfinalizeArtifact\(/g) ?? [];
	assert.equal(calls.length, 1, 'exactly one finalizeArtifact call in the daemon run');
	const call = code.slice(code.indexOf('finalizeArtifact(intent'));
	assert.ok(call.slice(0, call.indexOf(';')).endsWith("attributionNow(), 'daemon')"), 'and that call stamps the daemon');
	assert.equal((code.match(/\bfinalizeAsDaemon\(/g) ?? []).length, 2, 'used by the first attempt and by the correction retry');
});
