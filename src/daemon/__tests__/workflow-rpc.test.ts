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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('runWorkflowServerSide drives stub end-to-end + stamps meta.model with the provider label', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		const provider = new FakeProvider([STUB_PLAN, STUB_ARTIFACT]);
		const out = await runWorkflowServerSide(stubIntent(repo), provider, {
			runId: 'wf-test-1', epicKey: 'demo-stub', modelLabel: 'ollama:qwen3-test',
			review: false,   // this test asserts the decompose+synthesize turn count; review is exercised separately
		});
		assert.ok(out.path.endsWith('/docs/stub/demo-stub.md'), out.path);

		const json = JSON.parse(readFileSync(out.path.replace(/\.md$/, '.json'), 'utf8')) as { meta: { model: string; workflow: string } };
		assert.equal(json.meta.model, 'ollama:qwen3-test');   // NOT 'client'
		assert.equal(json.meta.workflow, 'stub');

		// Exactly two provider turns: the decomposer plan + the synthesize
		// artifact (stub steps are deterministic `output` runners, no pauses).
		assert.equal(provider.calls, 2);

		const md = readFileSync(out.path, 'utf8');
		assert.match(md, /\[\[c1\]\]/);   // citation grounding survived render + validation
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('runWorkflowServerSide reviews at finalize by default and stamps meta.review', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-rpc-'));
	try {
		// plan + synthesize, then the review cycle's extract + one verify turn.
		const REVIEW_EXTRACT = { claims: [{ id: 'c1', kind: 'citation', text: 'a grounded claim', anchors: [], probe: {} }] };
		const REVIEW_VERIFY = { severity: 'LOW', evidence: 'verified sound', action: 'none — verified sound', fixability: 'manual' };
		const provider = new FakeProvider([STUB_PLAN, STUB_ARTIFACT, REVIEW_EXTRACT, REVIEW_VERIFY]);
		const out = await runWorkflowServerSide(stubIntent(repo), provider, {
			runId: 'wf-test-r', epicKey: 'demo-stub-r', modelLabel: 'ollama:qwen3-test',
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
