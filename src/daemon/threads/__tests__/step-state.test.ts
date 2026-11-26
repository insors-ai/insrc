/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared step-state store (Epic 86197ac6, Story s1, t7): today's per-kind
 * lifecycles, and state that crosses worker threads.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/step-state.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker } from 'node:worker_threads';
import { STATE_VERSION as ANALYZE_VERSION } from '../../steps/analyze-step/state.js';
import type { StepStatePayload } from '../../steps/analyze-step/state.js';
import type { WorkflowStepStatePayload } from '../../steps/workflow-step/state.js';
import { serveHub } from '../channel.js';
import { LocalStepStateStore, StepStateNotFound, stepStateHubHandlers } from '../step-state.js';
import type { StepKind } from '../step-state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOUR = 60 * 60 * 1_000;

test("each step kind's token rule, 100-entry eviction, TTL with read refresh and release match today's stores", async () => {
	let t = 1_000_000;
	const s = new LocalStepStateStore(() => t, () => {});

	// rotate-token (analyze, workflow): a new token; the old one is gone; no prior token is fine.
	for (const kind of ['analyze', 'workflow'] as const) {
		const a = await s.mint(kind, { n: 1 });
		assert.match(a, /^[A-Za-z0-9_-]{22}$/, '22-char URL-safe token');
		const b = await s.update(kind, a, { n: 2 });
		assert.notEqual(b, a);
		assert.equal(await s.read(kind, a), undefined, `${kind}: the superseded token fails`);
		assert.deepEqual((await s.read(kind, b))?.payload, { n: 2 });
		const c = await s.update(kind, undefined, { n: 3 });
		assert.deepEqual((await s.read(kind, c))?.payload, { n: 3 }, `${kind}: an update with no prior token just mints`);
	}
	// 100-entry cap per kind, least recently touched evicted first; other kinds untouched.
	const lru = new LocalStepStateStore(() => t, () => {});
	const tokens: string[] = [];
	for (let i = 0; i < 100; i++) { t += 1; tokens.push(await lru.mint('analyze', { i })); }
	t += 1; await lru.read('analyze', tokens[0]!);   // touch the oldest: now the least recent is tokens[1]
	const otherKind = await lru.mint('workflow', { other: true });
	t += 1; await lru.mint('analyze', { i: 100 });
	assert.equal(await lru.sizeForTests('analyze'), 100);
	assert.notEqual(await lru.read('analyze', tokens[0]!), undefined, 'the refreshed entry survives');
	assert.equal(await lru.read('analyze', tokens[1]!), undefined, 'the least recently touched is evicted');
	assert.notEqual(await lru.read('workflow', otherKind), undefined, 'another kind is unaffected');

	// TTL: a read refreshes the expiry; an entry untouched for over an hour is swept on the next mint.
	const ttl = new LocalStepStateStore(() => t, () => {});
	const kept = await ttl.mint('workflow', { kept: true });
	const dropped = await ttl.mint('workflow', { dropped: true });
	t += HOUR - 1; await ttl.read('workflow', kept);
	t += 2; await ttl.mint('workflow', { trigger: true });
	assert.notEqual(await ttl.read('workflow', kept), undefined, 'refreshed by the read');
	assert.equal(await ttl.read('workflow', dropped), undefined, 'untouched for over an hour: swept');
});

test("take: single-use retrieval -- the first take returns the entry and consumes it; a second take with the SAME token (sequential or concurrent) always gets undefined, never the entry twice; expiry is enforced on access, unlike read", async () => {
	let t = 1_000_000;
	const s = new LocalStepStateStore(() => t, () => {});

	const token = await s.mint('security-review', { n: 1 });
	const first = await s.take('security-review', token);
	assert.deepEqual(first?.payload, { n: 1 });
	assert.equal(await s.take('security-review', token), undefined, 'the SAME token a second time: already consumed');
	assert.equal(await s.read('security-review', token), undefined, 'a plain read confirms the entry is genuinely gone, not merely marked');

	// "Concurrent" racing calls on the same token: since take's lookup-and-delete
	// is one synchronous step with no internal await, firing two take() calls
	// back-to-back (no await between the two invocations) still lets only ONE
	// of them observe the entry -- Promise.all does not change JS's single-
	// threaded execution order of each call's synchronous portion.
	const raceToken = await s.mint('security-review', { race: true });
	const [a, b] = await Promise.all([s.take('security-review', raceToken), s.take('security-review', raceToken)]);
	const winners = [a, b].filter(r => r !== undefined);
	assert.equal(winners.length, 1, 'exactly one of the two racing take() calls gets the entry, never both, never neither');

	// Expiry: take refuses an entry past its kind's ttlMs since last touch,
	// even though nothing else has read or touched it (read alone only
	// refreshes the expiry -- it does not itself enforce it on the read side).
	const expiring = await s.mint('security-review', { expiring: true });
	t += HOUR + 1;
	assert.equal(await s.take('security-review', expiring), undefined, 'an entry past its ttl is treated as absent by take');
});

function connect(store: LocalStepStateStore): () => { worker: Worker; ask: (m: Record<string, unknown>) => Promise<Record<string, unknown>> } {
	return () => {
		const { port1: main, port2: workerPort } = new MessageChannel();
		serveHub(main, stepStateHubHandlers(store, () => {}));
		const worker = new Worker(join(HERE, 'helpers', 'step-state-worker-bootstrap.mjs'), { workerData: { port: workerPort }, transferList: [workerPort] });
		const inbox: Record<string, unknown>[] = [];
		const waiting: ((m: Record<string, unknown>) => void)[] = [];
		worker.on('message', (m: Record<string, unknown>) => { const w = waiting.shift(); if (w !== undefined) w(m); else inbox.push(m); });
		const next = (): Promise<Record<string, unknown>> => { const m = inbox.shift(); return m !== undefined ? Promise.resolve(m) : new Promise(res => { waiting.push(res); }); };
		void next();   // the 'ready' message
		return { worker, ask: (m) => { worker.postMessage(m); return next(); } };
	};
}

