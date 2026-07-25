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

import { runWorkflowServerSide } from '../workflow-rpc.js';
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
			meta: { model?: string; workflow: string; attribution: { outputs: { runner: string; model: string }[] } };
		};
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

test('runWorkflowServerSide does NOT review by default (review is a controller task)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		const provider = new FakeProvider([STUB_PLAN, STUB_ARTIFACT]);
		const out = await runWorkflowServerSide(stubIntent(repo), provider, {
			runId: 'wf-test-nr', epicKey: 'demo-stub-nr', modelLabel: 'ollama:qwen3-test',
		});
		assert.equal(out.review, undefined, 'daemon does not self-review by default');
		assert.equal(provider.calls, 2);   // decompose + synthesize only — no review turns
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('runWorkflowServerSide reviews at finalize when review:true is opted in', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		// plan + synthesize, then the review cycle's extract + one verify turn.
		const REVIEW_EXTRACT = { claims: [{ id: 'c1', kind: 'citation', text: 'a grounded claim', anchors: [], probe: {} }] };
		const REVIEW_VERIFY = { severity: 'LOW', evidence: 'verified sound', action: 'none — verified sound', fixability: 'manual' };
		const provider = new FakeProvider([STUB_PLAN, STUB_ARTIFACT, REVIEW_EXTRACT, REVIEW_VERIFY]);
		const out = await runWorkflowServerSide(stubIntent(repo), provider, {
			runId: 'wf-test-r', epicKey: 'demo-stub-r', modelLabel: 'ollama:qwen3-test', review: true,
		});
		// review result surfaced + stamped into the persisted meta
		assert.ok(out.review, 'review present on result');
		assert.equal(out.review.verdict, 'pass');
		const json = JSON.parse(readFileSync(out.path.replace(/\.md$/, '.json'), 'utf8')) as { meta: { review?: { verdict: string } } };
		assert.equal(json.meta.review?.verdict, 'pass');
		// decompose + synthesize + review(extract + verify) = 4 provider turns
		assert.equal(provider.calls, 4);
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
