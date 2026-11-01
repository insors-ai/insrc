/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The in-daemon client of the moved review handlers (Epic c2ba6fa6, Story s11,
 * task t7). Built from request handler maps of the shape the daemon passes to
 * its IpcServer; the review and code-review steps run through it end to end.
 * No daemon, no store, no model: the handlers in the maps are stand-ins.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { codeReviewStream, fetchCodeReviewFreshness, fetchCodeReviewGrounding, resolveRepoForCwd, reviewArtifactStream } from '../../../mcp/daemon-stream.js';
import { ReviewStreamError } from '../../../shared/review-stream.js';
import type { CodeReviewStreamResult } from '../../../shared/review-stream.js';
import { runInStepContext } from '../../../shared/step-context.js';
import type { IpcStreamMessage } from '../../../shared/types.js';
import type { CodeReviewGrounding, CodeReviewSubject } from '../../../workflow/code-review/types.js';
import type { RpcHandlers, StreamHandler, StreamHandlers } from '../../server.js';
import type { WorkflowReviewDone } from '../../workflow-review-rpc.js';
import { createInDaemonClient, installStepDaemonClient, waitText } from '../daemon-client.js';
import type { InDaemonClientDeps, StepDaemonClient } from '../daemon-client.js';
import '../../../workflow/__tests__/helpers/converted-repos.js';

// --- stand-ins -------------------------------------------------------------------

const REVIEW_DONE: WorkflowReviewDone = {
	artifactPath: 'x', verdict: 'warn', counts: { high: 0, med: 0, low: 7, unverified: 1 },
	reviewedBy: 'daemon', model: 'cli-claude:opus', template: 'design-spec', applied: 0, pending: 1, report: 'THE DAEMON REPORT',
};
const CR_DONE: CodeReviewStreamResult = {
	runId: 'cr-daemon',
	artifact: {
		meta: { reviewedBy: 'daemon', model: 'cli-claude:opus' },
		body: { verdict: 'pass', counts: { high: 0, med: 0, low: 2 }, groundingMode: 'full' },
	} as never,
};
const GROUNDING: CodeReviewGrounding = { symbols: [{ entityId: 'sym:src/a.ts#f', file: 'src/a.ts', kind: 'function', name: 'f', signature: 'f(): void', callers: [], callees: [], testsReaching: [] }] };

const doneWith = (data: unknown): StreamHandler => async (_params, send) => {
	send({ id: 0, stream: 'progress', data: { step: 'working' } });
	send({ id: 0, stream: 'done', data });
};

/** A stream handler that runs until its signal is aborted, and records that. */
function untilAborted() {
	const state = { started: false, aborted: false };
	let markStarted: () => void = () => {};
	const startedP = new Promise<void>(r => { markStarted = r; });
	const handler: StreamHandler = async (_params, _send, signal) => {
		state.started = true;
		markStarted();
		await new Promise<void>(r => { if (signal.aborted) r(); else signal.addEventListener('abort', () => r()); });
		state.aborted = true;
	};
	return { handler, state, started: startedP };
}

/** Handler maps of the IpcServer's shape, recording every call. */
function maps(stream: Partial<Record<'workflow.review' | 'codeReview.run', StreamHandler>> = {}) {
	const calls: string[] = [];
	const unary: RpcHandlers = {
		'codeReview.grounding': async () => { calls.push('codeReview.grounding'); return { ok: true, grounding: GROUNDING }; },
		'codeReview.freshness': async () => { calls.push('codeReview.freshness'); return { isProcessing: false, inFlight: false, pendingCodeIndexJobs: 0, staleFiles: [] }; },
		'repo.resolveForCwd':   async (p) => { calls.push('repo.resolveForCwd'); return { path: (p as { cwd: string }).cwd === '/caller' ? '/registered' : null }; },
	};
	const record = (method: string, h: StreamHandler): StreamHandler => async (params, send, signal) => { calls.push(method); return h(params, send, signal); };
	const streams: StreamHandlers = {
		'workflow.review': record('workflow.review', stream['workflow.review'] ?? doneWith(REVIEW_DONE)),
		'codeReview.run':  record('codeReview.run',  stream['codeReview.run']  ?? doneWith(CR_DONE)),
	};
	return { unary, streams, calls };
}

const immediateTimer: InDaemonClientDeps = { setTimer: (fn) => { setImmediate(fn); return 0; }, clearTimer: () => {} };

async function withClient<T>(client: StepDaemonClient, fn: () => Promise<T>): Promise<T> {
	installStepDaemonClient(client);
	try { return await fn(); } finally { installStepDaemonClient(undefined); }
}

// --- review and code-review subjects ---------------------------------------------

function reviewFixture() {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-in-daemon-review-'));
	const dir = join(repo, 'docs', 'stub');
	mkdirSync(dir, { recursive: true });
	const mdPath = join(dir, 's1.md');
	writeFileSync(mdPath, '# Doc\n\nThe body.\n');
	writeFileSync(join(dir, 's1.json'), JSON.stringify({ meta: { workflow: 'design.story', epicHash: 'abcd', storyId: 'S001', authoredBy: 'controller' }, body: {} }) + '\n');
	return { repo, mdPath, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const parse = (env: { content: readonly { text: string }[] }): Record<string, unknown> => JSON.parse(env.content[0]!.text) as Record<string, unknown>;

const CREATED = '2026-07-18T00:00:00.000Z';
const crSubject = (): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f7a8', storyId: 's8', changedFiles: ['src/a.ts'],
	approvedLld:  { meta: { epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
});

// --- equivalence with the socket client's failure behaviour ----------------------
// A review run that is never ended would hang its test; the time limit makes it a failure.

test("in-daemon client: a done frame resolves with its data and progress reaches onFrame; grounding, freshness and the cwd lookup are shaped as the socket client shapes them", async () => {
	const m = maps();
	const client = createInDaemonClient(m.unary, m.streams);
	const frames: unknown[] = [];
	assert.deepEqual(await client.reviewArtifactStream({ artifactPath: '/a.md', repo: '/r' }, { timeoutMs: 60_000, onFrame: (_k, d) => frames.push(d) }), REVIEW_DONE);
	assert.deepEqual(frames, [{ step: 'working' }]);
	assert.deepEqual(await client.codeReviewStream({ epicHash: 'e', storyId: 's' }, { timeoutMs: 60_000 }), CR_DONE);
	assert.deepEqual(await client.fetchCodeReviewGrounding({ repo: '/r', epicHash: 'e', storyId: 's' }), { ok: true, grounding: GROUNDING });
	assert.deepEqual(await client.fetchCodeReviewFreshness({ repo: '/r', epicHash: 'e', storyId: 's', changedFiles: [] }), { ok: true, isProcessing: false, inFlight: false, pendingCodeIndexJobs: 0, staleFiles: [] });
	assert.equal(await client.resolveRepoForCwd('/caller'), '/registered');
	assert.equal(await client.resolveRepoForCwd('/elsewhere'), null);

	// A declined or throwing unary handler is { ok:false, reason }, never a throw.
	const bad = createInDaemonClient({
		'codeReview.grounding': async () => ({ ok: false, reason: 'no-build-record' }),
		'codeReview.freshness': async () => { throw new Error('freshness exploded'); },
	}, {});
	assert.deepEqual(await bad.fetchCodeReviewGrounding({ repo: '/r', epicHash: 'e', storyId: 's' }), { ok: false, reason: 'no-build-record' });
	assert.deepEqual(await bad.fetchCodeReviewFreshness({ repo: '/r', epicHash: 'e', storyId: 's', changedFiles: [] }), { ok: false, reason: 'freshness exploded' });
	// A stream request with no handler is unknown-method, as against an older daemon.
	await assert.rejects(bad.reviewArtifactStream({ artifactPath: '/a.md' }, { timeoutMs: 60_000 }), (e: unknown) => e instanceof ReviewStreamError && e.failure === 'unknown-method');
});

test('in-daemon client: a stream handler that throws synchronously settles the request as daemon-error and releases its wait', async () => {
	let cleared = 0;
	const deps: InDaemonClientDeps = { setTimer: () => 'timer', clearTimer: () => { cleared += 1; } };
	const throwsNow = (() => { throw new Error('thrown before any await'); }) as unknown as StreamHandler;
	const ac = new AbortController();
	const client = createInDaemonClient({}, { 'workflow.review': throwsNow }, deps);
	await assert.rejects(client.reviewArtifactStream({ artifactPath: '/a.md' }, { timeoutMs: 60_000, signal: ac.signal }),
		(e: unknown) => e instanceof ReviewStreamError && e.failure === 'daemon-error' && e.message === 'thrown before any await');
	assert.equal(cleared, 1, 'the wait timer was cleared');
	// The abort listener was removed: aborting now has nothing to settle and does not throw.
	ac.abort();
});

test('in-daemon client: the wait limit is named in whole minutes when it is one, otherwise in seconds, never more than the limit', () => {
	assert.equal(waitText(30 * 60_000), '30 minutes');
	assert.equal(waitText(60_000), '1 minute');
	assert.equal(waitText(90_000), '90 seconds');
	assert.equal(waitText(1_500), '1 second');
	assert.equal(waitText(20_000), '20 seconds');
	assert.equal(waitText(1_000), '1 second');
	assert.equal(waitText(10), '1 second');
});

test('in-daemon review client: the codeReview.freshness reply keeps inFlight and pendingCodeIndexJobs (ISSUE-1102dc71)', async () => {
	const client = createInDaemonClient({
		'codeReview.freshness': async () => ({ isProcessing: true, inFlight: false, pendingCodeIndexJobs: 2, staleFiles: ['src/a.ts'] }),
	}, {});
	assert.deepEqual(await client.fetchCodeReviewFreshness({ repo: '/r', epicHash: 'e', storyId: 's', changedFiles: ['src/a.ts'] }),
		{ ok: true, isProcessing: true, inFlight: false, pendingCodeIndexJobs: 2, staleFiles: ['src/a.ts'] });
});
