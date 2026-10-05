/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's code-review request (`codeReview.run`): it is the daemon's
 * review, so it stamps `daemon` and refuses code the daemon wrote.
 * (LLD-1716f77ba9ba017b-S001, tests T4 and T12; plan tasks t3 and t4.)
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import type { IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import type { RunCodeReviewOpts } from '../../workflow/code-review/runner.js';
import { artifactJsonPath, buildArtifactId } from '../../workflow/storage.js';
import { buildAuthorParty, codeReviewRunStart } from '../code-review-rpc.js';
import type { CodeReviewRunDeps } from '../code-review-rpc.js';

const EPIC = 'abcd1234ef567890';
const STORY = 'S001';

function repoWith(buildMeta?: Record<string, unknown>): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-cr-rpc-'));
	if (buildMeta !== undefined) {
		const json = artifactJsonPath(repo, buildArtifactId(EPIC, STORY));
		mkdirSync(dirname(json), { recursive: true });
		writeFileSync(json, JSON.stringify({ meta: { workflow: 'build', epicHash: EPIC, storyId: STORY, createdAt: 'x', ...buildMeta }, body: {} }));
	}
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

/** Deps that record what was asked of them and never reach a real provider. */
function spyDeps(): { deps: CodeReviewRunDeps; calls: { subject: number; provider: number; review: RunCodeReviewOpts[] } } {
	const calls = { subject: 0, provider: 0, review: [] as RunCodeReviewOpts[] };
	const deps: CodeReviewRunDeps = {
		resolveSubject: async (repoPath, epicHash, storyId) => {
			calls.subject += 1;
			return { ok: true, subject: { repoPath, epicHash, storyId, changedFiles: ['src/a.ts'] } } as never;
		},
		resolveProvider: () => { calls.provider += 1; return { provider: {} as LLMProvider, modelLabel: 'cli-claude:opus' }; },
		runReview: (async (_subject: unknown, _provider: unknown, opts: RunCodeReviewOpts) => {
			calls.review.push(opts);
			return { ok: true, artifact: { meta: { reviewedBy: opts.reviewedBy }, body: { verdict: 'pass' } } };
		}) as never,
	};
	return { deps, calls };
}

async function run(repo: string, deps: CodeReviewRunDeps): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await codeReviewRunStart({ repo, epicHash: EPIC, storyId: STORY }, (m) => frames.push(m), new AbortController().signal, deps);
	return frames;
}

test('T12 the daemon refuses to review code the daemon wrote: an error frame, no provider, no review', async () => {
	const r = repoWith({ authoredBy: 'daemon' });
	try {
		const { deps, calls } = spyDeps();
		const frames = await run(r.repo, deps);
		assert.equal(frames.length, 1);
		const f = frames[0]!;
		assert.equal(f.stream, 'error');
		const data = f.data as { error: string; reason?: string; recoverable: boolean };
		assert.equal(data.reason, 'same-party-review');
		assert.match(data.error, /Same-party review refused: the code of Story S001 was authored by the daemon/);
		assert.match(data.error, /controller review \(.*insrc_code_review_step.*\) or an override reason at approval/);
		assert.equal(calls.provider, 0, 'no provider is built');
		assert.deepEqual(calls.review, [], 'no review is run, so nothing is stamped');
	} finally { r.cleanup(); }
});

for (const [label, meta] of [['controller-authored', { authoredBy: 'controller' }], ['of unknown author (an older record)', {}]] as const) {
	test(`T4 the daemon reviews code that is ${label}, and stamps the review as the daemon's`, async () => {
		const r = repoWith(meta);
		try {
			const { deps, calls } = spyDeps();
			const frames = await run(r.repo, deps);
			assert.equal(calls.review.length, 1);
			assert.equal(calls.review[0]!.reviewedBy, 'daemon');
			assert.equal(calls.review[0]!.modelLabel, 'cli-claude:opus');
			const last = frames[frames.length - 1]!;
			assert.equal(last.stream, 'done');
			assert.equal((last.data as { artifact: { meta: { reviewedBy: string } } }).artifact.meta.reviewedBy, 'daemon');
		} finally { r.cleanup(); }
	});
}

test('T4 with no BUILD record at all the author is unknown and the daemon reviews', async () => {
	const r = repoWith();
	try {
		const { deps, calls } = spyDeps();
		const frames = await run(r.repo, deps);
		assert.equal(buildAuthorParty(r.repo, EPIC, STORY), 'unknown');
		assert.equal(calls.review.length, 1);
		assert.equal(frames[frames.length - 1]!.stream, 'done');
	} finally { r.cleanup(); }
});

test('the author is read from the BUILD record', () => {
	const a = repoWith({ authoredBy: 'daemon' });
	const b = repoWith({ authoredBy: 'controller' });
	try {
		assert.equal(buildAuthorParty(a.repo, EPIC, STORY), 'daemon');
		assert.equal(buildAuthorParty(b.repo, EPIC, STORY), 'controller');
		assert.equal(buildAuthorParty(a.repo, EPIC, 'S999'), 'unknown');
	} finally { a.cleanup(); b.cleanup(); }
});

test('a declined subject is still an error frame, before the author is looked at', async () => {
	const r = repoWith({ authoredBy: 'daemon' });
	try {
		const { deps, calls } = spyDeps();
		const frames = await run(r.repo, { ...deps, resolveSubject: async () => ({ ok: false, reason: 'no-build' }) as never });
		assert.equal(frames.length, 1);
		assert.match((frames[0]!.data as { error: string }).error, /declined: no-build/);
		assert.deepEqual(calls.review, []);
	} finally { r.cleanup(); }
});
