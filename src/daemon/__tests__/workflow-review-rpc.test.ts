/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's request to review an existing design artifact (`workflow.review`).
 * (LLD-1716f77ba9ba017b-S001, test T12; plan task t5.)
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import type { IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import { DEFAULT_DESIGN_REVIEW_SETTINGS, reviewTemplateFor } from '../../workflow/review/template.js';
import { workflowReviewStart } from '../workflow-review-rpc.js';
import type { WorkflowReviewDeps, WorkflowReviewDone } from '../workflow-review-rpc.js';

const SPEC = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);

function countingProvider() {
	const calls: string[] = [];
	const provider = {
		capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
		async completeStructured() { calls.push('completeStructured'); return { claims: [] }; },
		async runReviewSession() {
			calls.push('runReviewSession');
			return {
				items: SPEC.items.map((it, i) => ({
					item: it.id,
					premises: [i === 0
						? { premise: 'the list is complete', outcome: 'does-not-hold', severity: 'HIGH', evidence: 'server.ts also lists it', action: 'add it', files: ['src/mcp/server.ts'] }
						: { premise: `claim under ${it.id}`, outcome: 'holds', evidence: 'read it', action: '' }],
				})),
			};
		},
	} as unknown as LLMProvider;
	return { provider, calls };
}

function fixture(kind: 'DEF' | 'LLD', authorMeta: Record<string, unknown>) {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-review-'));
	const id = kind === 'DEF' ? 'DEF-abcd' : 'LLD-abcd-S001';
	const json = join(repo, '.insrc', 'artifacts', `${id}.json`);
	const md = join(repo, 'docs', 'epics', 'demo-E20261005abcd', kind === 'DEF' ? 'DEF.md' : join('S001', 'LLD.md'));
	mkdirSync(dirname(json), { recursive: true });
	mkdirSync(dirname(md), { recursive: true });
	writeFileSync(json, JSON.stringify({ meta: { workflow: kind === 'DEF' ? 'define' : 'design.story', epicHash: 'abcd', storyId: 'S001', ...authorMeta }, body: { note: 'x' }, citations: [] }, null, 2) + '\n');
	writeFileSync(md, `<!-- insrc:artifact ${id} -->\n\n# ${kind}\n\nThe body.\n`);
	return { repo, md, json, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

async function run(params: unknown, deps: WorkflowReviewDeps): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await workflowReviewStart(params, (m) => frames.push(m), new AbortController().signal, deps);
	return frames;
}

const withProvider = (provider: LLMProvider): WorkflowReviewDeps => ({ resolveProvider: () => ({ provider, model: 'cli-claude:opus' }) });

test('T12 a controller-authored LLD: progress frames, then done with the verdict and reviewedBy daemon', async () => {
	const f = fixture('LLD', { authoredBy: 'controller' });
	try {
		const p = countingProvider();
		const frames = await run({ artifactPath: f.md, repo: f.repo }, withProvider(p.provider));
		const progress = frames.filter(m => m.stream === 'progress');
		assert.ok(progress.length >= 1, 'the review phases are streamed');
		assert.equal((progress[0]!.data as { operation: string }).operation, 'workflow.review');
		assert.deepEqual(progress.map(m => (m.data as { index: number }).index), progress.map((_, i) => i));

		assert.equal(frames.filter(m => m.stream === 'done' || m.stream === 'error').length, 1, 'exactly one final frame');
		const last = frames[frames.length - 1]!;
		assert.equal(last.stream, 'done', JSON.stringify(last.data));
		const done = last.data as WorkflowReviewDone;
		assert.equal(done.verdict, 'block');
		assert.equal(done.reviewedBy, 'daemon');
		assert.equal(done.model, 'cli-claude:opus');
		assert.equal(done.template, 'design-spec');
		assert.equal(done.counts.high, 1);
		assert.equal(done.pending, 1);
		assert.ok(done.report.includes('Does not hold'));
		assert.deepEqual(p.calls, ['runReviewSession']);

		const stored = JSON.parse(readFileSync(f.json, 'utf8')).meta.review;
		assert.equal(stored.reviewedBy, 'daemon');
		assert.equal(stored.verdict, 'block');
	} finally { f.cleanup(); }
});

test('T12 a controller-authored DEF is reviewed through the pipeline and ends in done', async () => {
	const f = fixture('DEF', { authoredBy: 'controller' });
	try {
		const p = countingProvider();
		const frames = await run({ artifactPath: f.md, repo: f.repo }, withProvider(p.provider));
		const done = frames[frames.length - 1]!;
		assert.equal(done.stream, 'done');
		assert.equal((done.data as WorkflowReviewDone).verdict, 'pass');
		assert.equal((done.data as WorkflowReviewDone).template, undefined);
		assert.ok(p.calls.includes('completeStructured') && !p.calls.includes('runReviewSession'));
	} finally { f.cleanup(); }
});

for (const kind of ['DEF', 'LLD'] as const) {
	test(`T12 a daemon-authored ${kind} ends in one error frame; no provider call, nothing stamped`, async () => {
		const f = fixture(kind, { authoredBy: 'daemon' });
		try {
			const before = readFileSync(f.json, 'utf8');
			const p = countingProvider();
			const frames = await run({ artifactPath: f.md, repo: f.repo }, withProvider(p.provider));
			assert.equal(frames.length, 1);
			assert.equal(frames[0]!.stream, 'error');
			const data = frames[0]!.data as { error: string; reason?: string; recoverable: boolean };
			assert.equal(data.reason, 'same-party-review');
			assert.match(data.error, /Same-party review refused/);
			assert.equal(data.recoverable, false);
			assert.deepEqual(p.calls, []);
			assert.equal(readFileSync(f.json, 'utf8'), before);
		} finally { f.cleanup(); }
	});
}

test('a bad request, a missing artifact and a failing review each end in one error frame', async () => {
	const f = fixture('LLD', { authoredBy: 'controller' });
	try {
		const p = countingProvider();
		for (const params of [null, {}, { artifactPath: '' }, { artifactPath: f.json, repo: f.repo }, { artifactPath: join(f.repo, 'nope.md'), repo: f.repo }]) {
			const frames = await run(params, withProvider(p.provider));
			assert.equal(frames.length, 1, JSON.stringify(params));
			assert.equal(frames[0]!.stream, 'error');
			assert.equal((frames[0]!.data as { reason?: string }).reason, undefined, 'not a same-party refusal');
		}
		assert.deepEqual(p.calls, []);
		const missing = await run({ artifactPath: join(f.repo, 'nope.md'), repo: f.repo }, withProvider(p.provider));
		assert.match((missing[0]!.data as { error: string }).error, /^workflow\.review: no artifact at .*nope\.md$/);
		const notMd = await run({ artifactPath: f.json, repo: f.repo }, withProvider(p.provider));
		assert.match((notMd[0]!.data as { error: string }).error, /must be the artifact's \.md path/);

		const frames = await run({ artifactPath: f.md, repo: f.repo }, {
			resolveProvider: () => ({ provider: p.provider, model: 'm' }),
			review: async () => { throw new Error('the reviewer session passed its time limit'); },
		});
		const last = frames[frames.length - 1]!;
		assert.equal(last.stream, 'error');
		assert.match((last.data as { error: string }).error, /passed its time limit/);
	} finally { f.cleanup(); }
});
