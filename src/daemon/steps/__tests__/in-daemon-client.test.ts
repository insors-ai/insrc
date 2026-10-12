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
import { runCodeReview } from '../../../workflow/code-review/runner.js';
import type { CodeReviewGrounding, CodeReviewSubject } from '../../../workflow/code-review/types.js';
import type { RpcHandlers, StreamHandler, StreamHandlers } from '../../server.js';
import type { WorkflowReviewDone } from '../../workflow-review-rpc.js';
import { handleCodeReviewStep } from '../code-review-step/handler.js';
import type { CodeReviewStepDeps } from '../code-review-step/handler.js';
import { _clearCodeReviewStateStoreForTests } from '../code-review-step/state-store.js';
import { createInDaemonClient, installStepDaemonClient } from '../daemon-client.js';
import type { InDaemonClientDeps, StepDaemonClient } from '../daemon-client.js';
import { handleReviewStep } from '../review-step/handler.js';
import { _clearReviewStateStoreForTests } from '../review-step/state-store.js';
import type { ReviewStepDeps } from '../review-step/types.js';

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
		'codeReview.freshness': async () => { calls.push('codeReview.freshness'); return { isProcessing: false, staleFiles: [] }; },
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

/** `repo: null` sends no repo, so the start resolves it from the caller's cwd. */
async function reviewStart(fx: ReturnType<typeof reviewFixture>, deps: ReviewStepDeps = {}, repo: string | null = fx.repo) {
	_clearReviewStateStoreForTests();
	return parse(await handleReviewStep({ phase: 'start', artifact: fx.mdPath, ...(repo !== null ? { repo } : {}) }, deps));
}

const CREATED = '2026-07-18T00:00:00.000Z';
const crSubject = (): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f7a8', storyId: 's8', changedFiles: ['src/a.ts'],
	approvedLld:  { meta: { epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
});

/** Code-review deps that leave grounding, freshness and the daemon review to the installed client. */
function crDeps(extra: Partial<CodeReviewStepDeps> = {}): CodeReviewStepDeps {
	return {
		resolveSubject: async () => ({ ok: true, subject: crSubject() }),
		fetchGrounding: (p) => import('../daemon-client.js').then(m => m.stepDaemonClient().fetchCodeReviewGrounding(p)),
		fetchFreshness: (p) => import('../daemon-client.js').then(m => m.stepDaemonClient().fetchCodeReviewFreshness(p)),
		assembleDiffGrounding: async () => { throw new Error('no diff review in this test'); },
		runReview: runCodeReview,
		write: () => { throw new Error('the tool writes no record on the daemon path'); },
		sleep: async () => {},
		now: () => 0,
		freshnessTimeoutMs: () => 120000,
		readBuildAuthor: () => 'controller',
		...extra,
	};
}

async function crStart(deps: CodeReviewStepDeps) {
	_clearCodeReviewStateStoreForTests();
	return parse(await handleCodeReviewStep({ phase: 'start', epicHash: 'e1a2b3c4d5e6f7a8', storyId: 's8', repo: '/repo' }, deps));
}

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
	assert.deepEqual(await client.fetchCodeReviewFreshness({ repo: '/r', epicHash: 'e', storyId: 's', changedFiles: [] }), { ok: true, isProcessing: false, staleFiles: [] });
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

test("in-daemon review client: a wait past its limit fails with 'timeout' (retryable) and aborts the review run", { timeout: 15_000 }, async () => {
	const run = untilAborted();
	const m = maps({ 'workflow.review': run.handler });
	const fx = reviewFixture();
	try {
		const out = await withClient(createInDaemonClient(m.unary, m.streams, immediateTimer), () => reviewStart(fx));
		assert.equal(out['next'], 'error');
		const error = out['error'] as { code: string; retryable: boolean; message: string };
		assert.equal(error.code, 'daemon-review-timeout');
		assert.equal(error.retryable, true);
		assert.match(error.message, /no result from the daemon within/);
		assert.ok(run.state.started && run.state.aborted, 'the review run was ended, not left to run on');
	} finally { fx.cleanup(); }

	// The code review's wait the same way.
	const crRun = untilAborted();
	const m2 = maps({ 'codeReview.run': crRun.handler });
	const out2 = await withClient(createInDaemonClient(m2.unary, m2.streams, immediateTimer), () => crStart(crDeps()));
	assert.equal((out2['error'] as { code: string }).code, 'daemon-review-timeout');
	assert.equal((out2['error'] as { retryable: boolean }).retryable, true);
	assert.ok(crRun.state.aborted);
});

test("in-daemon review client: an aborted step signal fails with 'aborted' (code daemon-review-aborted, not retryable) and ends the inner review run", { timeout: 15_000 }, async () => {
	const run = untilAborted();
	const m = maps({ 'workflow.review': run.handler });
	const fx = reviewFixture();
	try {
		const ac = new AbortController();
		const pending = withClient(createInDaemonClient(m.unary, m.streams), async () => {
			const p = reviewStart(fx, { signal: ac.signal });
			await run.started;
			ac.abort();
			return p;
		});
		const out = await pending;
		const error = out['error'] as { code: string; retryable: boolean };
		assert.equal(error.code, 'daemon-review-aborted');
		assert.equal(error.retryable, false);
		assert.ok(run.state.aborted, 'the inner review run saw its signal abort');
	} finally { fx.cleanup(); }

	const crRun = untilAborted();
	const m2 = maps({ 'codeReview.run': crRun.handler });
	const ac2 = new AbortController();
	const out2 = await withClient(createInDaemonClient(m2.unary, m2.streams), async () => {
		const p = crStart(crDeps({ signal: ac2.signal }));
		await crRun.started;
		ac2.abort();
		return p;
	});
	const error2 = out2['error'] as { code: string; retryable: boolean };
	assert.equal(error2.code, 'daemon-review-aborted');
	assert.equal(error2.retryable, false);
	assert.ok(crRun.state.aborted);

	// A signal already aborted never starts the run.
	const late = untilAborted();
	const m3 = maps({ 'workflow.review': late.handler });
	const done = new AbortController(); done.abort();
	await assert.rejects(createInDaemonClient(m3.unary, m3.streams).reviewArtifactStream({ artifactPath: '/a.md' }, { timeoutMs: 60_000, signal: done.signal }),
		(e: unknown) => e instanceof ReviewStreamError && e.failure === 'aborted');
	assert.equal(late.state.started, false);
});

test("in-daemon review client: an error frame fails with 'daemon-error' and its reason, and a code review whose diff cannot be read comes back as a failed daemon review naming the cause", { timeout: 15_000 }, async () => {
	const cause = 'codeReview.run: could not read the changed-file diff — git diff exited 128';
	const diffFails: StreamHandler = async (_p, send) => {
		send({ id: 0, stream: 'error', data: { error: cause, reason: 'diff-unavailable', recoverable: false } } as IpcStreamMessage);
	};
	const m = maps({ 'codeReview.run': diffFails });
	const client = createInDaemonClient(m.unary, m.streams);
	await assert.rejects(client.codeReviewStream({ epicHash: 'e', storyId: 's', groundingMode: 'degraded' }, { timeoutMs: 60_000 }),
		(e: unknown) => e instanceof ReviewStreamError && e.failure === 'daemon-error' && e.reason === 'diff-unavailable' && e.message === cause);

	// Through the step, as the routing test T17 has it over the socket: a failed daemon review naming the cause.
	const out = await withClient(client, () => crStart(crDeps({ fetchGrounding: async () => ({ ok: true, grounding: { symbols: [] } }) })));
	const error = out['error'] as { code: string; message: string; retryable: boolean };
	assert.equal(error.code, 'daemon-review-daemon-error');
	assert.ok(error.message.includes(cause), error.message);
	assert.match(error.message, /No review was recorded/);
	assert.equal(error.retryable, false);

	// A handler that throws is the 'error' frame the request server would send.
	const throws = maps({ 'workflow.review': async () => { throw new Error('review exploded'); } });
	await assert.rejects(createInDaemonClient(throws.unary, throws.streams).reviewArtifactStream({ artifactPath: '/a.md' }, { timeoutMs: 60_000 }),
		(e: unknown) => e instanceof ReviewStreamError && e.failure === 'daemon-error' && e.message === 'review exploded');
});

// --- no loopback ------------------------------------------------------------------

test("no loopback: during a moved review or code-review call the daemon's request server sees no second connection from the daemon itself", { timeout: 15_000 }, async () => {
	// Every outgoing socket connection of this process is counted and refused.
	const proto = net.Socket.prototype as unknown as { connect: (...args: unknown[]) => unknown };
	const original = proto.connect;
	let connects = 0;
	proto.connect = function blocked(): never { connects += 1; throw new Error('blocked: an outgoing connection'); };
	const fx = reviewFixture();
	try {
		// Through the in-daemon client: the review (with its repo found from the caller's cwd),
		// and the code review (grounding, freshness and the review run) reach every handler, and connect nowhere.
		const m = maps();
		await withClient(createInDaemonClient(m.unary, m.streams), async () => {
			const review = await runInStepContext({ cwd: '/caller' }, () => reviewStart(fx, {}, null));
			assert.equal(review['next'], 'done', 'the repo found from the caller\'s cwd is reviewed');
			assert.equal((await reviewStart(fx))['next'], 'done');
			assert.equal((await crStart(crDeps()))['next'], 'done');
		});
		assert.deepEqual(m.calls, ['repo.resolveForCwd', 'workflow.review', 'workflow.review', 'codeReview.freshness', 'codeReview.grounding', 'codeReview.run']);
		assert.equal(connects, 0, 'no connection was opened');

		// Control: the socket client, in the same calls, opens a connection; the count would see a loopback.
		await withClient({ reviewArtifactStream, codeReviewStream, fetchCodeReviewGrounding, fetchCodeReviewFreshness, resolveRepoForCwd }, async () => {
			const out = await reviewStart(fx);
			assert.equal(out['next'], 'error');
		});
		assert.ok(connects >= 1, `the socket client was seen connecting (${connects})`);
	} finally {
		proto.connect = original;
		fx.cleanup();
	}
});
