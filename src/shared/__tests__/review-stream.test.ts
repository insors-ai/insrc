/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review stream's failure type lives in src/shared/review-stream.ts
 * (Epic c2ba6fa6, Story s11, t1) and the MCP socket client re-exports it, so
 * an error thrown by either client is recognised by the same class.
 *
 * Run: npx tsx --test src/shared/__tests__/review-stream.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { codeReviewRequestParams, reviewArtifactRequestParams, ReviewStreamError, runReviewStream } from '../review-stream.js';
import type { ReviewStreamSink } from '../review-stream.js';
import * as daemonStream from '../../mcp/daemon-stream.js';

test('review stream module: ReviewStreamError from src/shared/review-stream.ts is the same class daemon-stream.ts exports, and the routing tests pass unchanged', () => {
	assert.equal(daemonStream.ReviewStreamError, ReviewStreamError, 'one class, re-exported');
	const e = new daemonStream.ReviewStreamError('daemon-error', 'boom', 'diff-unavailable');
	assert.ok(e instanceof ReviewStreamError);
	assert.equal(e.name, 'ReviewStreamError');
	assert.equal(e.failure, 'daemon-error');
	assert.equal(e.reason, 'diff-unavailable');
	assert.equal(e.message, 'boom');
});


/** A transport that records how it was released and lets the test drive the sink. */
function fakeTransport(onStart?: (sink: ReviewStreamSink) => void) {
	const state = { ended: 0, cancelled: 0, sink: undefined as ReviewStreamSink | undefined };
	const transport = (sink: ReviewStreamSink) => {
		state.sink = sink;
		onStart?.(sink);
		return { end: () => { state.ended += 1; }, cancel: () => { state.cancelled += 1; } };
	};
	return { state, transport };
}

const isFailure = (failure: string, message?: RegExp, reason?: string) => (e: unknown): boolean =>
	e instanceof ReviewStreamError && e.failure === failure && (message === undefined || message.test(e.message)) && (reason === undefined || e.reason === reason);

test('shared review request: done resolves and ends the transport; progress and delta reach onFrame; frames after settling are ignored', async () => {
	const f = fakeTransport();
	const frames: unknown[] = [];
	const p = runReviewStream<{ v: number }>('workflow.review', { timeoutMs: 60_000, onFrame: (k, d) => frames.push([k, d]) }, f.transport);
	f.state.sink!.frame({ stream: 'progress', data: 1 });
	f.state.sink!.frame({ stream: 'delta', data: 2 });
	f.state.sink!.frame({ stream: 'unknown-kind', data: 3 });
	f.state.sink!.frame({ stream: 'done', data: { v: 7 } });
	f.state.sink!.frame({ stream: 'error', data: { error: 'late' } });
	f.state.sink!.fail('closed', 'late close');
	assert.deepEqual(await p, { v: 7 });
	assert.deepEqual(frames, [['progress', 1], ['delta', 2]]);
	assert.deepEqual([f.state.ended, f.state.cancelled], [1, 0]);
});

test('shared review request: an error frame is daemon-error with its reason; a transport failure, the wait limit and an abort cancel the transport', async () => {
	const e = fakeTransport();
	const pe = runReviewStream('codeReview.run', { timeoutMs: 60_000 }, e.transport);
	e.state.sink!.frame({ stream: 'error', data: { error: 'could not read the diff', reason: 'diff-unavailable' } });
	await assert.rejects(pe, isFailure('daemon-error', /could not read the diff/, 'diff-unavailable'));
	assert.deepEqual([e.state.ended, e.state.cancelled], [1, 0]);

	const c = fakeTransport();
	const pc = runReviewStream('workflow.review', { timeoutMs: 60_000 }, c.transport);
	c.state.sink!.fail('closed', 'workflow.review: connection closed before completion');
	await assert.rejects(pc, isFailure('closed'));
	assert.deepEqual([c.state.ended, c.state.cancelled], [0, 1]);

	const t = fakeTransport();
	let fire: () => void = () => {};
	let cleared = 0;
	const pt = runReviewStream('workflow.review', { timeoutMs: 90_000 }, t.transport, { setTimer: (fn) => { fire = fn; return 'h'; }, clearTimer: () => { cleared += 1; } });
	fire();
	await assert.rejects(pt, isFailure('timeout', /no result from the daemon within 90 seconds/));
	assert.deepEqual([t.state.cancelled, cleared], [1, 1]);

	const a = fakeTransport();
	const ac = new AbortController();
	const pa = runReviewStream('workflow.review', { timeoutMs: 60_000, signal: ac.signal }, a.transport);
	ac.abort();
	await assert.rejects(pa, isFailure('aborted', /aborted by client/));
	assert.equal(a.state.cancelled, 1);

	// Already aborted: the transport is never started.
	const n = fakeTransport();
	const done = new AbortController(); done.abort();
	await assert.rejects(runReviewStream('workflow.review', { timeoutMs: 60_000, signal: done.signal }, n.transport), isFailure('aborted'));
	assert.equal(n.state.sink, undefined);
});

test('shared review request: a transport that fails while it is still starting is cancelled once it has started', async () => {
	const f = fakeTransport((sink) => sink.fail('unknown-method', 'workflow.review: this daemon does not support the request'));
	await assert.rejects(runReviewStream('workflow.review', { timeoutMs: 60_000 }, f.transport), isFailure('unknown-method'));
	assert.deepEqual([f.state.ended, f.state.cancelled], [0, 1]);
});

test('shared review request: a transport that throws while opening settles unreachable and releases its wait timer and abort listener', async () => {
	let cleared = 0;
	const ac = new AbortController();
	let listeners = 0;
	const add = ac.signal.addEventListener.bind(ac.signal);
	const remove = ac.signal.removeEventListener.bind(ac.signal);
	ac.signal.addEventListener = ((...args: Parameters<typeof add>) => { listeners += 1; add(...args); }) as typeof add;
	ac.signal.removeEventListener = ((...args: Parameters<typeof remove>) => { listeners -= 1; remove(...args); }) as typeof remove;
	const throwsOnOpen = (): never => { throw new Error('connect EACCES /tmp/daemon.sock'); };
	await assert.rejects(
		runReviewStream('workflow.review', { timeoutMs: 60_000, signal: ac.signal }, throwsOnOpen, { setTimer: () => 'h', clearTimer: () => { cleared += 1; } }),
		isFailure('unreachable', /^workflow\.review: cannot reach the daemon \(connect EACCES \/tmp\/daemon\.sock\)$/),
	);
	assert.equal(cleared, 1, 'the wait timer was cleared');
	assert.equal(listeners, 0, 'the abort listener was removed');
});

test('shared review request: the two requests\' parameters, and neither client interprets frames on its own', () => {
	assert.deepEqual(reviewArtifactRequestParams({ artifactPath: '/a.md' }), { artifactPath: '/a.md' });
	assert.deepEqual(reviewArtifactRequestParams({ artifactPath: '/a.md', repo: '/r' }), { artifactPath: '/a.md', repo: '/r' });
	assert.deepEqual(codeReviewRequestParams({ epicHash: 'e', storyId: 's' }), { epicHash: 'e', storyId: 's' });
	assert.deepEqual(codeReviewRequestParams({ epicHash: 'e', storyId: 's', repo: '/r', client: 'codex', groundingMode: 'degraded' }),
		{ epicHash: 'e', storyId: 's', repo: '/r', client: 'codex', groundingMode: 'degraded' });

	const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
	// Each client's review request, from its opening line to the end of the function.
	const body = (rel: string, start: string): string => {
		const text = readFileSync(join(SRC, rel), 'utf8');
		const at = text.indexOf(start);
		assert.ok(at >= 0, `${rel}: '${start}' found`);
		const end = text.indexOf('\n}\n', at);
		return text.slice(at, end < 0 ? undefined : end);
	};
	const clients: [string, string][] = [
		['mcp/daemon-stream.ts', 'function reviewStreamRequest<T>('],
		['daemon/steps/daemon-client.ts', 'export function createInDaemonClient('],
	];
	for (const [rel, start] of clients) {
		const fn = body(rel, start);
		assert.ok(fn.includes('runReviewStream'), `${rel} runs the shared request`);
		// The frame meanings and the wait limit live in the shared module only.
		assert.ok(!/=== 'progress' \|\| [\w.]+ === 'delta'/.test(fn), `${rel} maps progress frames itself`);
		assert.ok(!/new ReviewStreamError\(/.test(fn), `${rel} builds review failures itself`);
		assert.ok(!/no result from the daemon within/.test(fn), `${rel} words the wait limit itself`);
		assert.ok(!/artifactPath: params\.artifactPath|epicHash: params\.epicHash/.test(fn), `${rel} shapes request parameters itself`);
	}
	// The check sees such code: the socket client's separate workflow.run stream maps its own frames.
	assert.ok(/=== 'progress' \|\| [\w.]+ === 'delta'/.test(body('mcp/daemon-stream.ts', 'export function runWorkflowStream(')));
});
