/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-1102dc71 S001/t6 — the daemon-reviewed path carries the step's fallback
 * reason to the record the daemon writes: through codeReviewRequestParams, into
 * codeReview.run's params, onto body.fallbackReason.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';

// This file reaches the graph store through code that takes no path; give it a
// temporary one (the default path belongs to the daemon alone).
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => { await closeGraphStore(); rmSync(STORE_DIR, { recursive: true, force: true }); });

import type { IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import { codeReviewRequestParams, type CodeReviewStreamParams } from '../../shared/review-stream.js';
import { DEFAULT_DEPS, runCodeReview, type RunCodeReviewOpts } from '../../workflow/code-review/runner.js';
import type { CodeReviewFallbackReason, CodeReviewGrounding, CodeReviewSubject, DimensionResult } from '../../workflow/code-review/types.js';
import { artifactJsonPath, buildArtifactId } from '../../workflow/storage.js';
import { codeReviewRunStart, type CodeReviewRunDeps } from '../code-review-rpc.js';
import { handleCodeReviewStep, type CodeReviewStepDeps } from '../steps/code-review-step/handler.js';
import { _clearCodeReviewStateStoreForTests } from '../steps/code-review-step/state-store.js';
import type { CodeReviewStepOutput } from '../steps/code-review-step/types.js';

const EPIC = 'abcd1234ef567890';
const STORY = 'S001';
const CREATED = '2026-07-18T00:00:00.000Z';
const TIMED_OUT: CodeReviewFallbackReason = { kind: 'freshness-timeout', waitedMs: 3000, inFlight: false, pendingCodeIndexJobs: 4, staleFiles: ['src/a.ts'] };

/** A repo whose BUILD record names the controller as author, so the daemon reviews. */
function controllerRepo(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-cr-fallback-'));
	const json = artifactJsonPath(repo, buildArtifactId(EPIC, STORY));
	mkdirSync(dirname(json), { recursive: true });
	writeFileSync(json, JSON.stringify({ meta: { workflow: 'build', epicHash: EPIC, storyId: STORY, createdAt: CREATED, authoredBy: 'controller' }, body: {} }));
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const subjectFor = (repoPath: string): CodeReviewSubject => ({
	repoPath, epicHash: EPIC, storyId: STORY, changedFiles: ['src/a.ts'],
	approvedLld:  { meta: { epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: null, buildRecord: null, testRecord: null,
});
const DIFF: CodeReviewGrounding = { symbols: [{ entityId: 'diff:src/a.ts', file: 'src/a.ts', kind: 'file', name: 'src/a.ts', signature: '@@', callers: [], callees: [], testsReaching: [] }] };

/** codeReview.run deps: the REAL runner with judges that find nothing; records written are captured. */
function rpcDeps() {
	const writes: { path: string; content: string }[] = [];
	const opts: RunCodeReviewOpts[] = [];
	const judges = DEFAULT_DEPS.judges.slice(0, 4).map(slot => ({
		dimension: slot.dimension,
		judge: async (): Promise<DimensionResult> => ({ dimension: slot.dimension, findings: [] }),
	}));
	const deps: CodeReviewRunDeps = {
		resolveSubject: async (repoPath) => ({ ok: true, subject: subjectFor(repoPath) }),
		resolveProvider: () => ({ provider: {} as LLMProvider, modelLabel: 'cli-codex:gpt' }),
		assembleDiffGrounding: (async () => ({ grounding: DIFF, changedFiles: ['src/a.ts'] })) as never,
		write: (path, content) => { writes.push({ path, content }); },
		runReview: (async (subject: CodeReviewSubject, provider: LLMProvider, o: RunCodeReviewOpts, runnerDeps: typeof DEFAULT_DEPS | undefined) => {
			opts.push(o);
			return runCodeReview(subject, provider, o, { judges: judges as never, assembleGrounding: runnerDeps!.assembleGrounding, write: runnerDeps!.write });
		}) as never,
	};
	const body = (): Record<string, unknown> => (JSON.parse(writes.find(w => w.path.endsWith('.json'))!.content) as { body: Record<string, unknown> }).body;
	return { deps, writes, opts, body };
}

async function runRpc(params: Record<string, unknown>, deps: CodeReviewRunDeps): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await codeReviewRunStart(params, (m) => frames.push(m), new AbortController().signal, deps);
	return frames;
}

test('codeReview.run with params.fallbackReason writes a record whose body.fallbackReason equals it, and refuses a malformed reason; without one the body has no fallbackReason', async () => {
	const r = controllerRepo();
	try {
		const base = { repo: r.repo, epicHash: EPIC, storyId: STORY, groundingMode: 'degraded' };
		for (const reason of [TIMED_OUT, { kind: 'declined' }, { kind: 'hollow-grounding' }] as const) {
			const x = rpcDeps();
			const frames = await runRpc({ ...base, fallbackReason: reason }, x.deps);
			assert.equal(frames[frames.length - 1]!.stream, 'done', JSON.stringify(frames[frames.length - 1]!.data));
			assert.deepEqual(x.body()['fallbackReason'], reason);
			assert.deepEqual(x.opts[0]!.fallbackReason, reason);
		}

		// Malformed reasons are refused: one error frame, no record.
		for (const bad of [
			{ kind: 'nope' },
			'freshness-timeout',
			{ kind: 'declined', extra: 1 },
			{ ...TIMED_OUT, waitedMs: -1 },
			{ ...TIMED_OUT, inFlight: 'no' },
			{ ...TIMED_OUT, pendingCodeIndexJobs: 1.5 },
			{ ...TIMED_OUT, staleFiles: [1] },
			{ kind: 'freshness-timeout', waitedMs: 1, inFlight: true, pendingCodeIndexJobs: 0 },
		]) {
			const x = rpcDeps();
			const frames = await runRpc({ ...base, fallbackReason: bad }, x.deps);
			assert.equal(frames.length, 1, JSON.stringify(bad));
			assert.equal(frames[0]!.stream, 'error');
			assert.match((frames[0]!.data as { error: string }).error, /`fallbackReason` is malformed/);
			assert.deepEqual(x.writes, []);
		}
		// A reason with a full review is refused too.
		const full = rpcDeps();
		const ff = await runRpc({ ...base, groundingMode: 'full', fallbackReason: TIMED_OUT }, full.deps);
		assert.equal(ff[0]!.stream, 'error');
		assert.match((ff[0]!.data as { error: string }).error, /only accepted with groundingMode 'degraded'/);

		// Without one, the body has no fallbackReason.
		const none = rpcDeps();
		const nf = await runRpc(base, none.deps);
		assert.equal(nf[nf.length - 1]!.stream, 'done');
		assert.equal('fallbackReason' in none.body(), false);
	} finally { r.cleanup(); }
});

test("a step-to-daemon run through the real codeReviewRequestParams and codeReview.run writes body.fallbackReason identical to the step's done-frame fallbackReason", async () => {
	await _clearCodeReviewStateStoreForTests();
	const r = controllerRepo();
	try {
		const rpc = rpcDeps();
		let clock = 0;
		const deps: CodeReviewStepDeps = {
			resolveSubject: async () => ({ ok: true, subject: subjectFor(r.repo) }),
			fetchGrounding: async () => ({ ok: true, grounding: DIFF }),
			fetchFreshness: async () => ({ ok: true, isProcessing: true, inFlight: false, pendingCodeIndexJobs: 4, staleFiles: ['src/a.ts'] }),
			assembleDiffGrounding: async () => ({ grounding: DIFF, changedFiles: ['src/a.ts'] }),
			runReview: runCodeReview,
			write: () => { throw new Error('the controller writes no record on the daemon path'); },
			sleep: async () => { clock += 1000; },
			now: () => clock,
			freshnessTimeoutMs: () => 2500,
			readBuildAuthor: () => 'controller',
			// The daemon client: the REAL serializer, the wire, then the REAL codeReview.run.
			reviewByDaemon: async (params: CodeReviewStreamParams) => {
				const wire = JSON.parse(JSON.stringify(codeReviewRequestParams(params))) as Record<string, unknown>;
				const frames = await runRpc({ ...wire, repo: r.repo }, rpc.deps);
				const last = frames[frames.length - 1]!;
				assert.equal(last.stream, 'done', JSON.stringify(last.data));
				return last.data as never;
			},
		};
		const parse = (env: { content: readonly { text: string }[] }): CodeReviewStepOutput => JSON.parse(env.content[0]!.text) as CodeReviewStepOutput;
		const cw = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: r.repo }, deps));
		assert.ok(cw.next === 'confirm_wait');
		const done = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: true }, deps));
		assert.ok(done.next === 'done', JSON.stringify(done));
		assert.equal(done.reviewedBy, 'daemon');
		const frameReason = (done as { fallbackReason?: unknown }).fallbackReason;
		assert.deepEqual(frameReason, TIMED_OUT);
		assert.deepEqual(rpc.body()['fallbackReason'], frameReason, 'the daemon-written record carries the done frame\'s reason');
	} finally { r.cleanup(); }
});
