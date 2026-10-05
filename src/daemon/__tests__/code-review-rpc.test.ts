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
		writeFileSync(json, JSON.stringify({ meta: { workflow: 'build', epicHash: EPIC, storyId: STORY, createdAt: '2026-10-05T00:00:00.000Z', ...buildMeta }, body: {} }));
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

// --- the grounding mode (LLD-1716f77ba9ba017b-S001, test T17; plan task t6) -------

import type { DimensionResult } from '../../workflow/code-review/types.js';
import { DiffUnavailableError } from '../../workflow/code-review/grounding.js';
import { DEFAULT_DEPS, runCodeReview } from '../../workflow/code-review/runner.js';

const DIFF_GROUNDING = { symbols: [], conventions: [], contractRefs: [] } as never;

/** Deps that run the REAL runner with judges that find nothing, capturing what
 *  it is asked and what it writes. `diff` is what the diff assembler does. */
function realRunnerDeps(diff: 'ok' | 'unavailable' | 'broken' = 'ok') {
	const seen = { opts: [] as RunCodeReviewOpts[], subjects: [] as { changedFiles: readonly string[] }[], groundings: [] as unknown[], diffArgs: [] as unknown[] };
	const writes: { path: string; content: string }[] = [];
	const judges = DEFAULT_DEPS.judges.slice(0, 4).map(slot => ({
		dimension: slot.dimension,
		judge: async (_s: unknown, grounding: unknown): Promise<DimensionResult> => { seen.groundings.push(grounding); return { dimension: slot.dimension, findings: [] }; },
	}));
	const deps: CodeReviewRunDeps = {
		resolveSubject: async (repoPath, epicHash, storyId) => ({ ok: true, subject: { repoPath, epicHash, storyId, changedFiles: ['src/graph.ts'] } }) as never,
		resolveProvider: () => ({ provider: {} as LLMProvider, modelLabel: 'cli-claude:opus' }),
		assembleDiffGrounding: (async (...args: unknown[]) => {
			seen.diffArgs.push(args);
			if (diff === 'unavailable') throw new DiffUnavailableError('git diff exited 128');
			if (diff === 'broken') throw new Error('something else broke');
			return { grounding: DIFF_GROUNDING, changedFiles: ['src/from-diff.ts'] };
		}) as never,
		write: (path, content) => { writes.push({ path, content }); },
		runReview: (async (subject: { changedFiles: readonly string[] }, provider: LLMProvider, opts: RunCodeReviewOpts, runnerDeps: typeof DEFAULT_DEPS | undefined) => {
			seen.opts.push(opts); seen.subjects.push(subject);
			return runCodeReview(subject as never, provider, opts, {
				judges: judges as never,
				assembleGrounding: runnerDeps?.assembleGrounding ?? (async () => ({ graph: true }) as never),
				write: runnerDeps?.write ?? (() => { throw new Error('no write dep was passed'); }),
			});
		}) as never,
	};
	return { deps, seen, writes };
}

async function runMode(repo: string, deps: CodeReviewRunDeps, groundingMode?: unknown): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await codeReviewRunStart({ repo, epicHash: EPIC, storyId: STORY, ...(groundingMode !== undefined ? { groundingMode } : {}) }, (m) => frames.push(m), new AbortController().signal, deps);
	return frames;
}

interface Record_ { meta: { reviewedBy?: string }; body: { groundingMode: string; verdict: string; subject: { changedFiles: string[] } } }
const recordOf = (writes: { path: string; content: string }[]): Record_ => JSON.parse(writes.find(w => w.path.endsWith('.json'))!.content) as Record_;

test('T17 the degraded mode grounds on the diff, stamps the record degraded and caps a clean verdict at warn', async () => {
	const r = repoWith({ authoredBy: 'controller' });
	try {
		const { deps, seen, writes } = realRunnerDeps();
		const frames = await runMode(r.repo, deps, 'degraded');
		assert.equal(frames[frames.length - 1]!.stream, 'done', JSON.stringify(frames[frames.length - 1]!.data));
		assert.equal(seen.diffArgs.length, 1, 'the diff is assembled once');
		const [repoArg, , diffOpts] = seen.diffArgs[0] as [string, unknown, { excludeGlobs: readonly string[] }];
		assert.equal(repoArg, r.repo);
		assert.ok(diffOpts.excludeGlobs.length > 0, 'the ledger files are excluded, as on the controller path');
		assert.deepEqual(seen.subjects[0]!.changedFiles, ['src/from-diff.ts'], 'the subject is re-keyed to the diff');
		assert.ok(seen.groundings.length === 4 && seen.groundings.every(g => g === DIFF_GROUNDING), 'every judge reads the diff grounding');
		assert.equal(seen.opts[0]!.groundingMode, 'degraded');
		assert.equal(seen.opts[0]!.capVerdictAtWarn, true);

		const rec = recordOf(writes);
		assert.equal(rec.body.groundingMode, 'degraded');
		assert.equal(rec.body.verdict, 'warn', 'no findings would fold to pass; a degraded review never passes');
		assert.deepEqual(rec.body.subject.changedFiles, ['src/from-diff.ts']);
		assert.equal(rec.meta.reviewedBy, 'daemon');
	} finally { r.cleanup(); }
});

test('T17 a diff the daemon cannot read ends in one error frame naming the cause, and no record is written', async () => {
	const r = repoWith({ authoredBy: 'controller' });
	try {
		const { deps, seen, writes } = realRunnerDeps('unavailable');
		const frames = await runMode(r.repo, deps, 'degraded');
		assert.equal(frames.length, 1);
		assert.equal(frames[0]!.stream, 'error');
		const data = frames[0]!.data as { error: string; reason?: string };
		assert.equal(data.reason, 'diff-unavailable');
		assert.match(data.error, /could not read the changed-file diff — git diff exited 128/);
		assert.deepEqual(seen.opts, [], 'the runner never starts');
		assert.deepEqual(writes, []);

		// Any other failure is still an error frame, but is not reported as an unreadable diff.
		const other = realRunnerDeps('broken');
		const f2 = await runMode(r.repo, other.deps, 'degraded');
		assert.equal(f2.length, 1);
		assert.equal((f2[0]!.data as { reason?: string }).reason, undefined);
		assert.match((f2[0]!.data as { error: string }).error, /something else broke/);
		assert.deepEqual(other.writes, []);
	} finally { r.cleanup(); }
});

for (const mode of [undefined, 'full'] as const) {
	test(`T17 with ${mode === undefined ? 'no mode' : 'the full mode'} the request grounds on the graph and can pass, as before`, async () => {
		const r = repoWith({ authoredBy: 'controller' });
		try {
			const { deps, seen, writes } = realRunnerDeps();
			const frames = await runMode(r.repo, deps, mode);
			assert.equal(frames[frames.length - 1]!.stream, 'done', JSON.stringify(frames[frames.length - 1]!.data));
			assert.deepEqual(seen.diffArgs, [], 'the diff is not touched');
			assert.deepEqual(seen.subjects[0]!.changedFiles, ['src/graph.ts'], 'the resolved subject is used as it is');
			assert.ok(seen.groundings.every(g => g !== DIFF_GROUNDING));
			assert.equal(seen.opts[0]!.groundingMode, undefined);
			assert.equal(seen.opts[0]!.capVerdictAtWarn, undefined);
			const rec = recordOf(writes);
			assert.equal(rec.body.groundingMode, 'full');
			assert.equal(rec.body.verdict, 'pass');
		} finally { r.cleanup(); }
	});
}

test('T17 a grounding mode the daemon does not know is refused, not read as full', async () => {
	const r = repoWith({ authoredBy: 'controller' });
	try {
		const { deps, seen, writes } = realRunnerDeps();
		const frames = await runMode(r.repo, deps, 'partial');
		assert.equal(frames.length, 1);
		assert.equal(frames[0]!.stream, 'error');
		assert.match((frames[0]!.data as { error: string }).error, /`groundingMode` must be 'full' or 'degraded', got "partial"/);
		assert.deepEqual(seen.opts, []);
		assert.deepEqual(writes, []);
	} finally { r.cleanup(); }
});
