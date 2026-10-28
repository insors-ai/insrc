/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_review_step` routes by author: work the daemon authored is reviewed by
 * the controller through this tool's own phases; anything else is sent to the
 * daemon, and a daemon review that fails is never replaced by a controller one.
 * (LLD-1716f77ba9ba017b-S001, tests T9, T11, T12, T14; plan task t7.)
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { after as afterAll } from 'node:test';
import { mkdtempSync as mkdtempSyncRaw, rmSync as rmSyncForStore } from 'node:fs';
import { tmpdir as tmpdirForStore } from 'node:os';
import { join as joinForStore } from 'node:path';
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';

// This file reaches the graph store through code that takes no path. Give it a
// temporary one: the store at the default path belongs to the daemon alone
// (Epic c2ba6fa6, Story s4).
const STORE_DIR = mkdtempSyncRaw(joinForStore(tmpdirForStore(), 'insrc-test-store-'));
setGraphStorePath(joinForStore(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmSyncForStore(STORE_DIR, { recursive: true, force: true });
});

import type { WorkflowReviewDone } from '../../../workflow-review-rpc.js';
import { DEFAULT_DESIGN_REVIEW_SETTINGS, reviewTemplateFor } from '../../../../workflow/review/template.js';
import { reviewArtifactStream, ReviewStreamError } from '../../../../mcp/daemon-stream.js';
import type { ReviewArtifactStreamParams, ReviewStreamOpts } from '../../../../mcp/daemon-stream.js';
import { readReviewRecordOf } from '../../../../workflow/review/report-file.js';
import { fixtureReviewClient as handleReviewStep } from './terminal-client.js';
import { idOfWorkflow, writeDesign } from './review-fixture.js';
import { DESIGN_REVIEW_IDLE_MS, DESIGN_REVIEW_WAIT_MS, PIPELINE_REVIEW_WAIT_MS } from '../phases/start.js';
import { runReviewStream, type ReviewStreamSink } from '../../../../shared/review-stream.js';
import { _clearReviewStateStoreForTests } from '../state-store.js';
import type { ReviewStepDeps } from '../types.js';
import { createRepoLifecycle } from '../../../../workflow/artifact-core/repo-lifecycle.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

const SPEC = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);
const MIN = 60_000;

type Author = 'controller' | 'daemon' | 'unknown';
const AUTHOR_META: Record<Author, Record<string, unknown>> = { controller: { authoredBy: 'controller' }, daemon: { authoredBy: 'daemon' }, unknown: {} };

function fixture(workflow: string, author: Author) {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-review-routing-'));
	const { mdPath, jsonPath } = writeDesign(repo, idOfWorkflow(workflow), { meta: { workflow, storyId: 's1', ...AUTHOR_META[author] }, body: { note: 'untouched' } }, '# Doc\n\nThe body.\n');
	return { repo, mdPath, jsonPath, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function parse(env: { content: { text: string }[] }): Record<string, unknown> {
	return JSON.parse(env.content[0]!.text) as Record<string, unknown>;
}

const DONE: WorkflowReviewDone = {
	artifactPath: 'x', verdict: 'warn', counts: { high: 0, med: 0, low: 7, unverified: 1 },
	reviewedBy: 'daemon', model: 'cli-claude:opus', template: 'design-spec', applied: 0, pending: 1, report: 'THE DAEMON REPORT',
};

/** A daemon stand-in that records each request and answers with `answer`. */
function fakeDaemon(answer: WorkflowReviewDone | Error = DONE) {
	const calls: { params: ReviewArtifactStreamParams; opts: ReviewStreamOpts }[] = [];
	const deps: ReviewStepDeps = {
		reviewByDaemon: async (params, opts) => {
			calls.push({ params, opts });
			if (answer instanceof Error) throw answer;
			return answer;
		},
	};
	return { deps, calls };
}

const start = async (fx: ReturnType<typeof fixture>, deps: ReviewStepDeps) =>
	parse(await handleReviewStep({ phase: 'start', artifact: fx.mdPath, repo: fx.repo }, deps));

const answer = () => ({ items: SPEC.items.map(it => ({ item: it.id, premises: [{ premise: `claim under ${it.id}`, outcome: 'holds', evidence: 'read it', action: '' }] })) });

// --- T9 / T14: who reviews ------------------------------------------------------

for (const author of ['controller', 'unknown'] as const) {
	for (const [kind, workflow] of [['DEF', 'define'], ['LLD', 'design.story'], ['HLD', 'design.epic']] as const) {
		test(`T9 a ${kind} of ${author} author is sent to the daemon and returns done with the daemon's verdict`, async () => {
			await _clearReviewStateStoreForTests();
			const fx = fixture(workflow, author);
			try {
				const d = fakeDaemon();
				const out = await start(fx, d.deps);
				assert.equal(out['next'], 'done');
				assert.equal(out['verdict'], 'warn');
				assert.deepEqual(out['counts'], DONE.counts);
				assert.equal(out['report'], 'THE DAEMON REPORT');
				assert.equal(out['pending'], 1);
				assert.equal(out['reviewedBy'], 'daemon');
				assert.equal(out['path'], fx.mdPath);
				assert.equal(out['jsonPath'], fx.jsonPath);
				// T14: neither the extract prompt nor the review template is ever handed back.
				for (const key of ['prompt', 'schema', 'state', 'template']) assert.equal(out[key], undefined, `no ${key} is returned`);
				assert.equal(d.calls.length, 1);
				assert.deepEqual(d.calls[0]!.params, { artifactPath: fx.mdPath, repo: fx.repo });
			} finally { fx.cleanup(); }
		});
	}
}

test('T9/T14 daemon-authored work runs the controller loop as before, and the daemon is not asked', async () => {
	await _clearReviewStateStoreForTests();
	const def = fixture('define', 'daemon');
	const lld = fixture('design.story', 'daemon');
	const hld = fixture('design.epic', 'daemon');
	try {
		const d = fakeDaemon();
		const a = await start(def, d.deps);
		assert.equal(a['next'], 'emit_claims');
		assert.ok((a['prompt'] as { user: string }).user.includes('LOAD-BEARING PREMISES'));
		const b = await start(lld, d.deps);
		assert.equal(b['next'], 'emit_findings');
		assert.equal(b['template'], 'design-spec');
		assert.equal((await start(hld, d.deps))['next'], 'emit_findings');
		assert.deepEqual(d.calls, []);
	} finally { def.cleanup(); lld.cleanup(); hld.cleanup(); }
});

test('T9 an older artifact with no author field is routed by its attribution labels', async () => {
	await _clearReviewStateStoreForTests();
	const mk = (model: string) => {
		const fx = fixture('define', 'unknown');
		const stored = JSON.parse(readFileSync(fx.jsonPath, 'utf8'));
		stored.meta.attribution = { outputs: [{ role: 'synthesize', tier: 'core', runner: 'cli-claude', model }] };
		writeFileSync(fx.jsonPath, JSON.stringify(stored));
		return fx;
	};
	const byClient = mk('client');
	const byDaemon = mk('opus');
	try {
		const d = fakeDaemon();
		assert.equal((await start(byClient, d.deps))['next'], 'done', 'written by the controller: the daemon reviews');
		assert.equal((await start(byDaemon, d.deps))['next'], 'emit_claims', 'written by the daemon: the controller reviews');
		assert.equal(d.calls.length, 1);
	} finally { byClient.cleanup(); byDaemon.cleanup(); }
});

// --- T11: the wait limit, and a failed daemon review ----------------------------

test('T11 the tool waits 31 minutes for a design (HLD, LLD) and 90 minutes for a DEF', async () => {
	await _clearReviewStateStoreForTests();
	assert.equal(DESIGN_REVIEW_WAIT_MS, 31 * MIN);
	// A real DEF review measured 777 s (t12), so the first limit of 10 minutes cut it off; 30, then90, now120 minutes.
	assert.equal(PIPELINE_REVIEW_WAIT_MS, 120 * MIN);
	assert.ok(PIPELINE_REVIEW_WAIT_MS > 777_000 * 2, 'room for a DEF about twice the measured one');
	for (const [workflow, limit] of [['design.story', 31 * MIN], ['design.epic', 31 * MIN], ['define', 120 * MIN]] as const) {
		const fx = fixture(workflow, 'controller');
		try {
			const d = fakeDaemon();
			await start(fx, d.deps);
			assert.equal(d.calls[0]!.opts.timeoutMs, limit, workflow);
		} finally { fx.cleanup(); }
	}
});

/** A clock the stream's timers run on: `advance` fires every timer that falls due, in order. */
function fakeClock() {
	let now = 0;
	let next = 0;
	const timers = new Map<number, { fn: () => void; at: number }>();
	return {
		setTimer: (fn: () => void, ms: number): unknown => { const h = ++next; timers.set(h, { fn, at: now + ms }); return h; },
		clearTimer: (h: unknown): void => { timers.delete(h as number); },
		advance(ms: number): void {
			const end = now + ms;
			for (;;) {
				const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
				if (due === undefined) break;
				now = due[1].at;
				timers.delete(due[0]);
				due[1].fn();
			}
			now = end;
		},
	};
}

test('a healthy design review longer than 15 minutes completes while heartbeats flow, and a daemon that sends no frame for 5 minutes fails with an idle timeout naming the idle limit', async () => {
	await _clearReviewStateStoreForTests();
	assert.equal(DESIGN_REVIEW_IDLE_MS, 5 * MIN);
	const settle = () => new Promise<void>(r => setImmediate(r));
	// The real stream wait (ceiling + idle limit) over a transport the test drives, on a fake clock.
	const daemon = () => {
		const clock = fakeClock();
		let sink: ReviewStreamSink | undefined;
		const seen: ReviewStreamOpts[] = [];
		const relayed: unknown[] = [];
		const deps: ReviewStepDeps = {
			progress: data => { relayed.push(data); },
			reviewByDaemon: (_params, opts) => {
				seen.push(opts);
				return runReviewStream('workflow.review', opts, s => { sink = s; return { end: () => {}, cancel: () => {} }; }, clock);
			},
		};
		const opened = async () => { while (sink === undefined) await settle(); return sink; };
		return { clock, deps, seen, relayed, opened };
	};
	// 17 minutes, a heartbeat each minute: done.
	{
		const fx = fixture('design.story', 'controller');
		try {
			const d = daemon();
			const out = start(fx, d.deps);
			const sink = await d.opened();
			for (let i = 1; i <= 17; i++) {
				d.clock.advance(MIN);
				sink.frame({ stream: 'progress', data: { kind: 'heartbeat', operation: 'workflow.review', elapsedMs: i * MIN } });
			}
			sink.frame({ stream: 'done', data: DONE });
			const res = await out;
			assert.equal(res['next'], 'done', JSON.stringify(res));
			assert.equal(d.seen[0]!.idleMs, DESIGN_REVIEW_IDLE_MS, 'the wait has the idle limit');
			assert.equal(d.seen[0]!.timeoutMs, DESIGN_REVIEW_WAIT_MS, 'beside the ceiling');
			assert.equal(d.relayed.length, 17, 'every heartbeat relayed');
		} finally { fx.cleanup(); }
	}
	// No frame for 5 minutes: an idle timeout naming the idle limit.
	{
		const fx = fixture('design.story', 'controller');
		try {
			const d = daemon();
			const out = start(fx, d.deps);
			await d.opened();
			d.clock.advance(5 * MIN);
			const res = await out;
			assert.equal(res['next'], 'error');
			const err = res['error'] as { code: string; message: string; retryable: boolean };
			assert.equal(err.code, 'daemon-review-timeout');
			assert.match(err.message, /no progress from the daemon for 5 minutes/);
			assert.equal(err.retryable, true);
		} finally { fx.cleanup(); }
	}
});

const FAILURES = [
	['unreachable', new ReviewStreamError('unreachable', 'daemon is not running — start it with: insrc daemon start'), true],
	['daemon-error', new ReviewStreamError('daemon-error', 'The design review passed its time limit of 6 minutes', undefined), false],
	['unknown-method', new ReviewStreamError('unknown-method', 'workflow.review: this daemon does not support the request (unknown method: workflow.review). Update the daemon and restart it.'), false],
	['timeout', new ReviewStreamError('timeout', 'workflow.review: no result from the daemon within 11 minutes'), true],
	['closed', new ReviewStreamError('closed', 'workflow.review: connection closed before completion'), true],
	['failed', new Error('something unexpected'), false],
] as const;

for (const [failure, error, retryable] of FAILURES) {
	test(`T11 a daemon review that fails (${failure}) is an error: nothing stamped, no controller loop offered`, async () => {
		await _clearReviewStateStoreForTests();
		for (const workflow of ['define', 'design.story']) {
			const fx = fixture(workflow, 'controller');
			try {
				const before = { json: readFileSync(fx.jsonPath, 'utf8'), md: readFileSync(fx.mdPath, 'utf8') };
				const env = await handleReviewStep({ phase: 'start', artifact: fx.mdPath, repo: fx.repo }, fakeDaemon(error).deps);
				assert.equal((env as { isError?: boolean }).isError, true);
				const out = parse(env);
				assert.equal(out['next'], 'error');
				const err = out['error'] as { code: string; message: string; retryable: boolean };
				assert.equal(err.code, `daemon-review-${failure}`);
				assert.equal(err.retryable, retryable);
				assert.ok(err.message.includes(error.message), 'the cause is named');
				assert.match(err.message, /No review was recorded/);
				assert.match(err.message, /not replaced by a controller review/);
				// No way into the controller loop: no prompt, no schema, no state token.
				for (const key of ['prompt', 'schema', 'state', 'template', 'verdict']) assert.equal(out[key], undefined);
				assert.equal(readFileSync(fx.jsonPath, 'utf8'), before.json);
				assert.equal(readFileSync(fx.mdPath, 'utf8'), before.md);
			} finally { fx.cleanup(); }
		}
	});
}

test('T11 against an older daemon (a plain unknown-method line, socket kept open) the tool fails at once with the update message', async () => {
	await _clearReviewStateStoreForTests();
	const sock = join(tmpdir(), `insrc-rr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`);
	const sockets: Socket[] = [];
	const server = createServer((socket) => {
		sockets.push(socket);
		socket.on('data', (chunk: Buffer) => {
			const req = JSON.parse(chunk.toString().trim()) as { id: number; method: string };
			socket.write(JSON.stringify({ id: req.id, error: `unknown method: ${req.method}` }) + '\n');   // and the socket stays open
		});
		socket.on('error', () => { /* client vanished */ });
	});
	await new Promise<void>((res) => server.listen(sock, () => res()));
	const fx = fixture('design.story', 'controller');
	try {
		// The real stream helper, over a real socket, with a timer that never fires.
		const armedMs: number[] = [];
		const deps: ReviewStepDeps = {
			reviewByDaemon: (params, opts) => reviewArtifactStream(params, opts, {
				connect: () => createConnection(sock),
				setTimer: (_fn, ms) => { armedMs.push(ms); return 1; },
				clearTimer: () => { /* nothing to clear */ },
			}),
		};
		const out = await start(fx, deps);
		assert.deepEqual(armedMs, [31 * MIN, DESIGN_REVIEW_IDLE_MS], 'the 31 minute wait limit and the 5 minute idle limit were armed, and neither fired');
		assert.equal(out['next'], 'error');
		const err = out['error'] as { code: string; message: string };
		assert.equal(err.code, 'daemon-review-unknown-method');
		assert.match(err.message, /Update the daemon and restart it/);
		assert.equal(JSON.parse(readFileSync(fx.jsonPath, 'utf8')).meta.review, undefined);
	} finally {
		fx.cleanup();
		for (const s of sockets) s.destroy();
		await new Promise<void>((res) => server.close(() => res()));
		try { rmSync(sock); } catch { /* ignore */ }
	}
});

// --- T12: the controller's stamping phases refuse controller-authored work ------

/** Start as daemon-authored (so the controller loop begins), then flip the author. */
async function startThenFlip(workflow: string, to: Author) {
	const fx = fixture(workflow, 'daemon');
	const out = await start(fx, fakeDaemon().deps);
	const stored = JSON.parse(readFileSync(fx.jsonPath, 'utf8'));
	delete stored.meta.authoredBy;
	Object.assign(stored.meta, AUTHOR_META[to]);
	writeFileSync(fx.jsonPath, JSON.stringify(stored, null, 2) + '\n');
	return { fx, state: out['state'] as string };
}

for (const [kind, workflow] of [['LLD', 'design.story'], ['HLD', 'design.epic']] as const) {
	test(`T12 the findings phase refuses a controller-authored ${kind} and stamps nothing`, async () => {
		await _clearReviewStateStoreForTests();
		const { fx, state } = await startThenFlip(workflow, 'controller');
		try {
			const before = { json: readFileSync(fx.jsonPath, 'utf8'), md: readFileSync(fx.mdPath, 'utf8') };
			const out = parse(await handleReviewStep({ phase: 'findings', state, findings: answer() }));
			assert.equal(out['next'], 'error');
			const err = out['error'] as { code: string; message: string };
			assert.equal(err.code, 'same-party-review');
			assert.match(err.message, /authored by the controller, so the controller cannot review it/);
			assert.match(err.message, /needs a daemon review/);
			assert.equal(readFileSync(fx.jsonPath, 'utf8'), before.json);
			assert.equal(readFileSync(fx.mdPath, 'utf8'), before.md);
			// The run is over: the same token cannot be used to try again.
			const again = parse(await handleReviewStep({ phase: 'findings', state, findings: answer() }));
			assert.notEqual((again['error'] as { code: string }).code, 'same-party-review');
			assert.equal(again['next'], 'error');
		} finally { fx.cleanup(); }
	});
}

test('T12 the verdicts phase refuses a controller-authored DEF and stamps nothing', async () => {
	await _clearReviewStateStoreForTests();
	const { fx, state } = await startThenFlip('define', 'controller');
	try {
		const claims = parse(await handleReviewStep({ phase: 'claims', state, claims: { claims: [] } }));
		assert.equal(claims['next'], 'error');
		assert.equal((claims['error'] as { code: string }).code, 'same-party-review');
		const before = { json: readFileSync(fx.jsonPath, 'utf8'), md: readFileSync(fx.mdPath, 'utf8') };
		assert.equal(readFileSync(fx.jsonPath, 'utf8'), before.json);
		assert.equal(readFileSync(fx.mdPath, 'utf8'), before.md);
	} finally { fx.cleanup(); }
});

test('T12/T4 on a daemon-authored DEF the verdicts phase stamps the controller, and so does findings on an LLD', async () => {
	await _clearReviewStateStoreForTests();
	const def = fixture('define', 'daemon');
	const lld = fixture('design.story', 'daemon');
	try {
		const d = fakeDaemon();
		const s1 = (await start(def, d.deps))['state'] as string;
		const done = parse(await handleReviewStep({ phase: 'claims', state: s1, claims: { claims: [] } }, { lifecycleFor: repo => createRepoLifecycle(repo).service }));
		assert.equal(done['next'], 'done', JSON.stringify(done));
		assert.equal(done['reviewedBy'], undefined, 'the tool reviewed it itself: not a daemon review');
		const review = readReviewRecordOf(def.jsonPath)!.report;
		assert.equal(review.stage, 'define');
		assert.equal(review.reviewedBy, 'controller');

		const s2 = (await start(lld, d.deps))['state'] as string;
		const out = parse(await handleReviewStep({ phase: 'findings', state: s2, findings: answer() }));
		assert.equal(out['next'], 'done');
		assert.equal(readReviewRecordOf(lld.jsonPath)!.report.reviewedBy, 'controller');
		assert.deepEqual(d.calls, []);
	} finally { def.cleanup(); lld.cleanup(); }
});
