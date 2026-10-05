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

import type { WorkflowReviewDone } from '../../../daemon/workflow-review-rpc.js';
import { DEFAULT_DESIGN_REVIEW_SETTINGS, reviewTemplateFor } from '../../../workflow/review/template.js';
import { reviewArtifactStream, ReviewStreamError } from '../../daemon-stream.js';
import type { ReviewArtifactStreamParams, ReviewStreamOpts } from '../../daemon-stream.js';
import { handleReviewStep } from '../handler.js';
import { DESIGN_REVIEW_WAIT_MS, PIPELINE_REVIEW_WAIT_MS } from '../phases/start.js';
import { _clearReviewStateStoreForTests } from '../state-store.js';
import type { ReviewStepDeps } from '../types.js';

const SPEC = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);
const MIN = 60_000;

type Author = 'controller' | 'daemon' | 'unknown';
const AUTHOR_META: Record<Author, Record<string, unknown>> = { controller: { authoredBy: 'controller' }, daemon: { authoredBy: 'daemon' }, unknown: {} };

function fixture(workflow: string, author: Author) {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-review-routing-'));
	const dir = join(repo, 'docs', 'stub');
	mkdirSync(dir, { recursive: true });
	const mdPath = join(dir, 's1.md');
	const jsonPath = join(dir, 's1.json');
	writeFileSync(mdPath, '# Doc\n\nThe body.\n');
	writeFileSync(jsonPath, JSON.stringify({ meta: { workflow, epicHash: 'abcd', storyId: 'S001', ...AUTHOR_META[author] }, body: { note: 'untouched' } }, null, 2) + '\n');
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
			_clearReviewStateStoreForTests();
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
	_clearReviewStateStoreForTests();
	const def = fixture('define', 'daemon');
	const lld = fixture('design.story', 'daemon');
	const hld = fixture('design.epic', 'daemon');
	try {
		const d = fakeDaemon();
		const a = await start(def, d.deps);
		assert.equal(a['next'], 'emit_claims');
		assert.ok((a['prompt'] as { system: string }).system.includes('LOAD-BEARING PREMISES'));
		const b = await start(lld, d.deps);
		assert.equal(b['next'], 'emit_findings');
		assert.equal(b['template'], 'design-spec');
		assert.equal((await start(hld, d.deps))['next'], 'emit_findings');
		assert.deepEqual(d.calls, []);
	} finally { def.cleanup(); lld.cleanup(); hld.cleanup(); }
});

test('T9 an older artifact with no author field is routed by its attribution labels', async () => {
	_clearReviewStateStoreForTests();
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

test('T11 the tool waits 11 minutes for a design (HLD, LLD) and 30 minutes for a DEF', async () => {
	_clearReviewStateStoreForTests();
	assert.equal(DESIGN_REVIEW_WAIT_MS, 11 * MIN);
	// 30, not 10: a real DEF review measured 777 s (t12), so 10 minutes cut it off.
	assert.equal(PIPELINE_REVIEW_WAIT_MS, 30 * MIN);
	assert.ok(PIPELINE_REVIEW_WAIT_MS > 777_000 * 2, 'room for a DEF about twice the measured one');
	for (const [workflow, limit] of [['design.story', 11 * MIN], ['design.epic', 11 * MIN], ['define', 30 * MIN]] as const) {
		const fx = fixture(workflow, 'controller');
		try {
			const d = fakeDaemon();
			await start(fx, d.deps);
			assert.equal(d.calls[0]!.opts.timeoutMs, limit, workflow);
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
		_clearReviewStateStoreForTests();
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
	_clearReviewStateStoreForTests();
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
		assert.deepEqual(armedMs, [11 * MIN], 'the 11 minute wait limit was armed, and it never fired');
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
		_clearReviewStateStoreForTests();
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
	_clearReviewStateStoreForTests();
	const { fx, state } = await startThenFlip('define', 'controller');
	try {
		const claims = parse(await handleReviewStep({ phase: 'claims', state, claims: { claims: [] } }));
		assert.equal(claims['next'], 'emit_verdicts', JSON.stringify(claims));
		const before = { json: readFileSync(fx.jsonPath, 'utf8'), md: readFileSync(fx.mdPath, 'utf8') };
		const out = parse(await handleReviewStep({ phase: 'verdicts', state: claims['state'] as string, verdicts: { verdicts: [] } }));
		assert.equal(out['next'], 'error');
		assert.equal((out['error'] as { code: string }).code, 'same-party-review');
		assert.equal(readFileSync(fx.jsonPath, 'utf8'), before.json);
		assert.equal(readFileSync(fx.mdPath, 'utf8'), before.md);
	} finally { fx.cleanup(); }
});

test('T12/T4 on a daemon-authored DEF the verdicts phase stamps the controller, and so does findings on an LLD', async () => {
	_clearReviewStateStoreForTests();
	const def = fixture('define', 'daemon');
	const lld = fixture('design.story', 'daemon');
	try {
		const d = fakeDaemon();
		const s1 = (await start(def, d.deps))['state'] as string;
		const claims = parse(await handleReviewStep({ phase: 'claims', state: s1, claims: { claims: [] } }));
		const done = parse(await handleReviewStep({ phase: 'verdicts', state: claims['state'] as string, verdicts: { verdicts: [] } }));
		assert.equal(done['next'], 'done', JSON.stringify(done));
		assert.equal(done['reviewedBy'], undefined, 'the tool reviewed it itself: not a daemon review');
		const review = JSON.parse(readFileSync(def.jsonPath, 'utf8')).meta.review;
		assert.equal(review.stage, 'define');
		assert.equal(review.reviewedBy, 'controller');

		const s2 = (await start(lld, d.deps))['state'] as string;
		const out = parse(await handleReviewStep({ phase: 'findings', state: s2, findings: answer() }));
		assert.equal(out['next'], 'done');
		assert.equal(JSON.parse(readFileSync(lld.jsonPath, 'utf8')).meta.review.reviewedBy, 'controller');
		assert.deepEqual(d.calls, []);
	} finally { def.cleanup(); lld.cleanup(); }
});
