/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_code_review_step` routes by the author of the Story's code: code the
 * daemon wrote is reviewed by the controller through the judgements phase; any
 * other code is sent to the daemon. The start phase keeps every outcome it had.
 * (LLD-1716f77ba9ba017b-S001, tests T10, T11, T12, T17; plan task t8.)
 */

import assert from 'node:assert/strict';
import { createConnection, createServer, type Socket } from 'node:net';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runCodeReview } from '../../../workflow/code-review/runner.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult, ReviewDimension } from '../../../workflow/code-review/types.js';
import type { PartyOrUnknown } from '../../../workflow/review/party.js';
import { codeReviewStream, ReviewStreamError } from '../../daemon-stream.js';
import type { CodeReviewStreamParams, CodeReviewStreamResult, ReviewStreamOpts } from '../../daemon-stream.js';
import { DAEMON_CODE_REVIEW_WAIT_MS, handleCodeReviewStep, type CodeReviewStepDeps } from '../handler.js';
import { _clearCodeReviewStateStoreForTests } from '../state-store.js';
import type { CodeReviewStepOutput } from '../types.js';

const EPIC = 'e1a2b3c4d5e6f7a8';
const STORY = 's8';
const MIN = 60_000;

const CREATED = '2026-07-18T00:00:00.000Z';
const subject = (): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: EPIC, storyId: STORY, changedFiles: ['src/a.ts'],
	approvedLld:  { meta: { epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
});
const grounding: CodeReviewGrounding = { symbols: [{ entityId: 'sym:src/a.ts#f', file: 'src/a.ts', kind: 'function', name: 'f', signature: 'f(): void', callers: [], callees: [], testsReaching: [] }] };
const FRESH = { ok: true as const, isProcessing: false, staleFiles: [] as string[] };
const STALE = { ok: true as const, isProcessing: false, staleFiles: ['src/a.ts'] };

function parse(env: { content: readonly { text: string }[] }): CodeReviewStepOutput {
	return JSON.parse(env.content[0]!.text) as CodeReviewStepOutput;
}

function daemonAnswer(mode: 'full' | 'degraded'): CodeReviewStreamResult {
	return {
		runId: 'cr-daemon',
		artifact: {
			meta: { reviewedBy: 'daemon', model: 'cli-claude:opus' },
			body: { verdict: mode === 'degraded' ? 'warn' : 'pass', counts: { high: 0, med: 0, low: 2 }, groundingMode: mode },
		} as never,
	};
}

/** Deps with a recording daemon stand-in. Nothing here reaches a real daemon. */
function harness(author: PartyOrUnknown, overrides: Partial<CodeReviewStepDeps> = {}, daemon?: Error) {
	const asked: { params: CodeReviewStreamParams; opts: ReviewStreamOpts }[] = [];
	const writes: string[] = [];
	const authorReads: string[] = [];
	let diffCalls = 0;
	const deps: CodeReviewStepDeps = {
		resolveSubject: async () => ({ ok: true, subject: subject() }),
		fetchGrounding: async () => ({ ok: true, grounding }),
		fetchFreshness: async () => FRESH,
		assembleDiffGrounding: async () => { diffCalls += 1; return { grounding, changedFiles: ['src/a.ts'] }; },
		runReview: runCodeReview,
		write: (path) => { writes.push(path); },
		sleep: async () => {},
		now: () => 0,
		freshnessTimeoutMs: () => 120000,
		readBuildAuthor: (repo, epicHash, storyId) => { authorReads.push(`${repo}|${epicHash}|${storyId}`); return author; },
		reviewByDaemon: async (params, opts) => {
			asked.push({ params, opts });
			if (daemon !== undefined) throw daemon;
			return daemonAnswer(params.groundingMode ?? 'full');
		},
		...overrides,
	};
	return { deps, asked, writes, authorReads, diffCalls: () => diffCalls };
}

const START = { phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' } as const;
const start = async (deps: CodeReviewStepDeps) => parse(await handleCodeReviewStep(START, deps));
const reset = (): void => _clearCodeReviewStateStoreForTests();

function judgements(): { judgements: DimensionResult[] } {
	const dims: ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];
	return { judgements: dims.map(d => ({ dimension: d, findings: [] })) };
}

// --- T10: who reviews -----------------------------------------------------------

for (const author of ['controller', 'unknown'] as const) {
	test(`T10 code of ${author} author with fresh grounding is sent to the daemon (full) and returns done with its verdict`, async () => {
		reset();
		const h = harness(author);
		const out = await start(h.deps);
		assert.ok(out.next === 'done', JSON.stringify(out));
		assert.equal(out.verdict, 'pass');
		assert.deepEqual(out.counts, { high: 0, med: 0, low: 2 });
		assert.equal(out.reviewedBy, 'daemon');
		assert.equal(out.groundingMode, 'full');
		assert.equal(out.model, 'cli-claude:opus');
		assert.ok(out.jsonPath.endsWith(`CR-${EPIC}-${STORY}.json`));
		const o = out as unknown as Record<string, unknown>;
		for (const key of ['prompts', 'schema', 'state', 'grounding']) assert.equal(o[key], undefined, `no ${key}: the judgements prompt is never handed back`);
		assert.equal(h.asked.length, 1);
		assert.deepEqual(h.asked[0]!.params, { repo: '/repo', epicHash: EPIC, storyId: STORY, groundingMode: 'full' });
		assert.deepEqual(h.authorReads, [`/repo|${EPIC}|${STORY}`], 'the author is read from the BUILD record of this Story');
		assert.deepEqual(h.writes, [], 'the tool itself writes no record: the daemon does');
	});
}

test('T10 daemon-authored code gets the judgements prompt as before, and the daemon is not asked', async () => {
	reset();
	const h = harness('daemon');
	const out = await start(h.deps);
	assert.ok(out.next === 'emit_judgements');
	assert.equal(out.prompts.length, 4);
	assert.deepEqual(h.asked, []);
	const done = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: out.state }, h.deps));
	assert.ok(done.next === 'done');
	assert.equal(done.reviewedBy, undefined, 'the controller reviewed it: not a daemon review');
	assert.ok(h.writes.some(p => p.endsWith('.json')));
});

test('T10 the invoking client is passed to the daemon when the tool knows it', async () => {
	reset();
	const h = harness('controller', { client: 'codex' });
	await start(h.deps);
	assert.equal(h.asked[0]!.params.client, 'codex');
});

// --- T17: the start phase keeps every outcome ------------------------------------

test('T17 a stale index returns confirm_wait and asks no daemon; the author is not even read yet', async () => {
	reset();
	const h = harness('controller', { fetchFreshness: async () => STALE });
	const out = await start(h.deps);
	assert.ok(out.next === 'confirm_wait');
	assert.deepEqual(out.staleFiles, ['src/a.ts']);
	assert.ok(out.state.length > 0);
	assert.deepEqual(h.asked, []);
	assert.deepEqual(h.authorReads, []);
});

test('T17 a declined wait asks the daemon with the degraded mode, and the tool does not assemble the diff itself', async () => {
	reset();
	const h = harness('controller', { fetchFreshness: async () => STALE });
	const cw = await start(h.deps);
	assert.ok(cw.next === 'confirm_wait');
	const out = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: false }, h.deps));
	assert.ok(out.next === 'done', JSON.stringify(out));
	assert.equal(out.groundingMode, 'degraded');
	assert.equal(out.verdict, 'warn', 'the daemon caps a degraded review at warn');
	assert.equal(h.asked.length, 1);
	assert.equal(h.asked[0]!.params.groundingMode, 'degraded');
	assert.equal(h.diffCalls(), 0, 'the daemon grounds on the diff, not the tool');
	assert.equal(h.authorReads.length, 1, 'the author is read on the resumed call');
});

test('T17 an accepted wait that never becomes fresh asks the daemon with the degraded mode', async () => {
	reset();
	let t = 0;
	const h = harness('controller', { fetchFreshness: async () => STALE, now: () => (t += 60_000), freshnessTimeoutMs: () => 120_000 });
	const cw = await start(h.deps);
	assert.ok(cw.next === 'confirm_wait');
	const out = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: true }, h.deps));
	assert.ok(out.next === 'done', JSON.stringify(out));
	assert.equal(h.asked.length, 1);
	assert.equal(h.asked[0]!.params.groundingMode, 'degraded');
	assert.equal(h.diffCalls(), 0);
});

test('T17 an accepted wait that becomes fresh asks the daemon with the full mode, and never returns emit_judgements', async () => {
	reset();
	let calls = 0;
	const h = harness('controller', { fetchFreshness: async () => (++calls <= 2 ? STALE : FRESH) });
	const cw = await start(h.deps);
	assert.ok(cw.next === 'confirm_wait');
	const out = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: true }, h.deps));
	assert.ok(out.next === 'done', JSON.stringify(out));
	assert.equal(h.asked.length, 1);
	assert.equal(h.asked[0]!.params.groundingMode, 'full');
	assert.equal(h.authorReads.length, 1, 'read on the resumed call, at the point the review starts');
});

test('T17 fresh grounding with no symbols asks the daemon with the degraded mode', async () => {
	reset();
	const h = harness('unknown', { fetchGrounding: async () => ({ ok: true, grounding: { symbols: [] } }) });
	const out = await start(h.deps);
	assert.ok(out.next === 'done', JSON.stringify(out));
	assert.equal(h.asked[0]!.params.groundingMode, 'degraded');
	assert.equal(h.diffCalls(), 0);
});

test('T17 an unavailable freshness check and unavailable grounding each return their own error and ask no daemon', async () => {
	reset();
	const a = harness('controller', { fetchFreshness: async () => ({ ok: false, reason: 'daemon-unreachable' }) as never });
	const outA = await start(a.deps);
	assert.ok(outA.next === 'error');
	assert.equal(outA.error.code, 'freshness-unavailable');
	assert.deepEqual(a.asked, []);

	const b = harness('controller', { fetchGrounding: async () => ({ ok: false, reason: 'no graph' }) as never });
	const outB = await start(b.deps);
	assert.ok(outB.next === 'error');
	assert.equal(outB.error.code, 'grounding-unavailable');
	assert.deepEqual(b.asked, []);

	// The same holds on the resumed call.
	let n = 0;
	const c = harness('controller', { fetchFreshness: async () => (++n === 1 ? STALE : ({ ok: false, reason: 'daemon-unreachable' }) as never) });
	const cw = await start(c.deps);
	assert.ok(cw.next === 'confirm_wait');
	const outC = parse(await handleCodeReviewStep({ phase: 'start', state: cw.state, proceed: true }, c.deps));
	assert.ok(outC.next === 'error');
	assert.equal(outC.error.code, 'freshness-unavailable');
	assert.deepEqual(c.asked, []);
});

test('T17 a diff the daemon cannot read comes back as a failed daemon review naming the cause; nothing is stamped', async () => {
	reset();
	const cause = 'codeReview.run: could not read the changed-file diff — git diff exited 128';
	const h = harness('controller', { fetchGrounding: async () => ({ ok: true, grounding: { symbols: [] } }) }, new ReviewStreamError('daemon-error', cause, 'diff-unavailable'));
	const out = await start(h.deps);
	assert.ok(out.next === 'error');
	assert.equal(out.error.code, 'daemon-review-daemon-error');
	assert.ok(out.error.message.includes(cause));
	assert.match(out.error.message, /No review was recorded/);
	assert.equal(h.diffCalls(), 0, 'no controller-side diff review is started in its place');
	assert.deepEqual(h.writes, []);
});

// --- a daemon older than the grounding mode ------------------------------------

for (const [what, answer] of [
	['ignored the degraded mode', { meta: { reviewedBy: 'daemon' }, body: { verdict: 'pass', counts: { high: 0, med: 0, low: 0 }, groundingMode: 'full' } }],
	['stamped no reviewer', { meta: { model: 'claude:opus' }, body: { verdict: 'warn', counts: { high: 0, med: 0, low: 0 }, groundingMode: 'degraded' } }],
] as const) {
	test(`an older daemon that ${what} is an error, not a verdict`, async () => {
		reset();
		const h = harness('controller', {
			fetchGrounding: async () => ({ ok: true, grounding: { symbols: [] } }),   // asks for degraded
			reviewByDaemon: async () => ({ runId: 'cr-old', artifact: answer as never }),
		});
		const out = await start(h.deps);
		assert.ok(out.next === 'error', JSON.stringify(out));
		assert.equal(out.error.code, 'daemon-review-unknown-method');
		assert.match(out.error.message, /Update the daemon and restart it/);
		assert.match(out.error.message, /does not count as this review/);
		assert.equal((out as unknown as Record<string, unknown>)['verdict'], undefined, 'the older daemon\'s verdict is not reported');
	});
}

// --- T11: a failed daemon review -------------------------------------------------

const FAILURES = [
	['unreachable', new ReviewStreamError('unreachable', 'daemon is not running — start it with: insrc daemon start'), true],
	['daemon-error', new ReviewStreamError('daemon-error', 'invalid code-review record: missing dimension'), false],
	['unknown-method', new ReviewStreamError('unknown-method', 'codeReview.run: this daemon does not support the request. Update the daemon and restart it.'), false],
	['timeout', new ReviewStreamError('timeout', 'codeReview.run: no result from the daemon within 10 minutes'), true],
	['failed', new Error('something unexpected'), false],
] as const;

for (const [failure, error, retryable] of FAILURES) {
	test(`T11 a daemon code review that fails (${failure}) is an error: nothing stamped, no judgements prompt offered`, async () => {
		reset();
		const h = harness('controller', {}, error);
		const env = await handleCodeReviewStep(START, h.deps);
		assert.equal((env as { isError?: boolean }).isError, true);
		const out = parse(env);
		assert.ok(out.next === 'error');
		assert.equal(out.error.code, `daemon-review-${failure}`);
		assert.equal(out.error.retryable, retryable);
		assert.ok(out.error.message.includes(error.message), 'the cause is named');
		assert.match(out.error.message, /not replaced by a controller review/);
		const o = out as unknown as Record<string, unknown>;
		for (const key of ['prompts', 'schema', 'state', 'grounding', 'verdict']) assert.equal(o[key], undefined);
		assert.deepEqual(h.writes, []);
	});
}

test('T11 the tool waits 30 minutes: with a daemon that never answers it fails when that limit fires', async () => {
	reset();
	assert.equal(DAEMON_CODE_REVIEW_WAIT_MS, 30 * MIN);
	const sock = join(tmpdir(), `insrc-crr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`);
	const sockets: Socket[] = [];
	let requests = 0;
	const server = createServer((socket) => {
		sockets.push(socket);
		socket.on('data', () => { requests += 1; /* never answers */ });
		socket.on('error', () => { /* client vanished */ });
	});
	await new Promise<void>((res) => server.listen(sock, () => res()));
	try {
		// The real stream helper over a real socket, with a timer this test fires.
		const armed: number[] = [];
		let fire: (() => void) | undefined;
		const h = harness('controller', {
			reviewByDaemon: (params, opts) => codeReviewStream(params, opts, {
				connect: () => createConnection(sock),
				setTimer: (fn, ms) => { armed.push(ms); fire = fn; return 1; },
				clearTimer: () => { fire = undefined; },
			}),
		});
		const pending = start(h.deps);
		let settled = false;
		pending.then(() => { settled = true; }, () => { settled = true; });
		while (requests === 0) await new Promise(r => setImmediate(r));
		assert.deepEqual(armed, [30 * MIN], 'the 30 minute limit is the one armed');
		assert.equal(settled, false, 'still waiting before the limit');
		fire?.();
		const out = await pending;
		assert.ok(out.next === 'error');
		assert.equal(out.error.code, 'daemon-review-timeout');
		assert.match(out.error.message, /within 30 minutes/);
		assert.equal(out.error.retryable, true);
	} finally {
		for (const s of sockets) s.destroy();
		await new Promise<void>((res) => server.close(() => res()));
		try { rmSync(sock); } catch { /* ignore */ }
	}
});

// --- T12: the judgements phase refuses controller-authored code ------------------

test('T12 the judgements phase refuses controller-authored code and stamps nothing', async () => {
	reset();
	// Start as daemon-authored so the controller loop begins, then the record names the controller.
	let author: PartyOrUnknown = 'daemon';
	const h = harness('daemon', { readBuildAuthor: () => author });
	const s = await start(h.deps);
	assert.ok(s.next === 'emit_judgements');
	author = 'controller';
	const out = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: s.state }, h.deps));
	assert.ok(out.next === 'error');
	assert.equal(out.error.code, 'same-party-review');
	assert.match(out.error.message, /the code of Story s8 was authored by the controller, so the controller cannot review it/);
	assert.match(out.error.message, /needs a daemon review/);
	assert.deepEqual(h.writes, []);
	// The run is over: the token cannot be used to try again.
	author = 'daemon';
	const again = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: s.state }, h.deps));
	assert.ok(again.next === 'error');
	assert.notEqual(again.error.code, 'same-party-review');
	assert.deepEqual(h.writes, []);
});

test('T12 an unknown author does not stop the judgements phase (only a known controller author does)', async () => {
	reset();
	let author: PartyOrUnknown = 'daemon';
	const h = harness('daemon', { readBuildAuthor: () => author });
	const s = await start(h.deps);
	assert.ok(s.next === 'emit_judgements');
	author = 'unknown';
	const out = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(), state: s.state }, h.deps));
	assert.ok(out.next === 'done', JSON.stringify(out));
});
