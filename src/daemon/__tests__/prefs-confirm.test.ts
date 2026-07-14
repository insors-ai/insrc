/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the Layer 3 confirm staging + resolve flow
 * (memory-context M1.6.a).
 *
 * Exercises:
 *   - `createPendingConfirmHook` -> stages payload, fires event, defers.
 *   - `listPendingConfirms` -> enumerates staged entries.
 *   - `resolvePendingConfirm` -> accept (promotes to constraint, deletes pending)
 *                                 + discard (marks userDiscarded:true, no promotion).
 *   - Resolve fires FeedbackBus events so the L1 cache invalidates.
 *   - Validation errors.
 *
 * No-LLM tests: the classifier is wired with a scripted Layer 2 hook
 * that returns low confidence so Layer 3 is reached deterministically.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	_resetSubstrateRuntimeForTests,
	AGENT_CHAT_OWNER,
	getSubstrateRuntime,
	initSubstrateRuntime,
	registerAgentChatOwner,
} from '../substrate/singleton.js';
import {
	_resetPendingConfirmEmitterForTests,
	bridgePendingConfirmToStream,
	createPendingConfirmHook,
	listPendingConfirms,
	onPendingConfirm,
	PENDING_NS,
	CONFIRMED_NS,
	resolvePendingConfirm,
	type AssertionConfirmStreamFrame,
	type PendingConfirmEvent,
} from '../prefs-confirm.js';
import { prefsListRpc } from '../prefs-rpc.js';
import type { IpcStreamMessage, LLMMessage, LLMProvider, LLMResponse } from '../../shared/types.js';
import type { FeedbackEvent } from '../substrate/types.js';


function noopProvider(): LLMProvider {
	return {
		async complete(_messages: LLMMessage[]): Promise<LLMResponse> {
			throw new Error('noopProvider.complete: should not be invoked');
		},
		stream() { return (async function* () { yield ''; })(); },
		async embed() { return []; },
	};
}


interface Fx { dir: string; events: PendingConfirmEvent[]; unsubscribe: () => void }

/**
 * Set up a fresh substrate runtime with the userConfirm hook wired up.
 * The provider is no-op; we don't use the Ollama Layer 2 in these tests
 * (we call the hook directly).
 */
function setup(): Fx {
	_resetSubstrateRuntimeForTests();
	_resetPendingConfirmEmitterForTests();
	const dir = mkdtempSync(join(tmpdir(), 'prefs-confirm-'));
	const runtime = initSubstrateRuntime({
		localProvider: noopProvider(),
		workspaceId:   'ws-confirm',
		rootDir:       dir,
		userConfirm:   createPendingConfirmHook(),
	});
	registerAgentChatOwner(runtime);
	const events: PendingConfirmEvent[] = [];
	const unsubscribe = onPendingConfirm((e) => { events.push(e); });
	return { dir, events, unsubscribe };
}
function teardown(fx: Fx): void {
	fx.unsubscribe();
	_resetSubstrateRuntimeForTests();
	_resetPendingConfirmEmitterForTests();
	try { rmSync(fx.dir, { recursive: true, force: true }); } catch { /* ignore */ }
}


// ---------------------------------------------------------------------------
// Direct hook invocation
// ---------------------------------------------------------------------------

test('createPendingConfirmHook: stages entry into pending namespace and fires event', async () => {
	const fx = setup();
	try {
		const hook = createPendingConfirmHook();
		const r = await hook('Always include unit tests', { turnId: 'turn-7' });
		assert.equal(r.kind, 'defer', 'hook should defer; the IDE answers asynchronously');

		// The pending namespace now contains the staged entry.
		const ns = getSubstrateRuntime().memory.scope(AGENT_CHAT_OWNER, PENDING_NS);
		const entries: { key: string }[] = [];
		for await (const e of ns.scan('')) { entries.push({ key: e.key }); }
		assert.equal(entries.length, 1, 'one pending entry');
		assert.match(entries[0]!.key, /^turn-7::/);

		// The event was emitted.
		assert.equal(fx.events.length, 1);
		assert.equal(fx.events[0]!.turnId, 'turn-7');
		assert.match(fx.events[0]!.canonicalText, /unit tests/i);
	} finally { teardown(fx); }
});

test('createPendingConfirmHook: same (turnId, subject) overwrites prior pending row', async () => {
	const fx = setup();
	try {
		const hook = createPendingConfirmHook();
		await hook('Always include unit tests', { turnId: 'turn-7' });
		await hook('Always include unit tests', { turnId: 'turn-7' });
		const pending = await listPendingConfirms();
		assert.equal(pending.length, 1);
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// listPendingConfirms
// ---------------------------------------------------------------------------

test('listPendingConfirms: returns ordered list, populated fields', async () => {
	const fx = setup();
	try {
		const hook = createPendingConfirmHook();
		await hook('Always include unit tests', { turnId: 'turn-1' });
		await hook('Always run linting',        { turnId: 'turn-2' });
		const list = await listPendingConfirms();
		assert.equal(list.length, 2);
		assert.ok(list.every(e => e.userDiscarded === false));
		assert.ok(list.every(e => e.rawSpan.length > 0));
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// resolvePendingConfirm: accept
// ---------------------------------------------------------------------------

test('resolvePendingConfirm: accept promotes hint to constraint, deletes pending row', async () => {
	const fx = setup();
	try {
		const hook = createPendingConfirmHook();
		await hook('Always include unit tests', { turnId: 'turn-7' });
		const [pending] = await listPendingConfirms();
		assert.ok(pending);

		const r = await resolvePendingConfirm({ key: pending!.key, verdict: 'accept' });
		assert.equal(r.ok, true);
		assert.equal(r.promoted, true);

		// Pending row removed.
		const pendingNs = getSubstrateRuntime().memory.scope(AGENT_CHAT_OWNER, PENDING_NS);
		assert.equal(await pendingNs.get(pending!.key), undefined);

		// Confirmed row exists and is visible via prefsListRpc.
		const list = await prefsListRpc();
		assert.equal(list.entries.length, 1);
		assert.match(list.entries[0]!.canonicalText, /unit tests/i);
		assert.ok(list.entries[0]!.confidence >= 0.8, 'promotion bumps confidence above auto-accept threshold');
	} finally { teardown(fx); }
});

test('resolvePendingConfirm: accept with canonicalText override applies the user edit', async () => {
	const fx = setup();
	try {
		const hook = createPendingConfirmHook();
		await hook('Always include unit tests', { turnId: 'turn-7' });
		const [pending] = await listPendingConfirms();

		await resolvePendingConfirm({
			key:           pending!.key,
			verdict:       'accept',
			canonicalText: 'Implementation plans must include unit AND integration tests.',
		});
		const list = await prefsListRpc();
		assert.match(list.entries[0]!.canonicalText, /AND integration/);
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// resolvePendingConfirm: discard
// ---------------------------------------------------------------------------

test('resolvePendingConfirm: discard marks userDiscarded:true; no constraint write', async () => {
	const fx = setup();
	try {
		const hook = createPendingConfirmHook();
		await hook('Always include unit tests', { turnId: 'turn-7' });
		const [pending] = await listPendingConfirms();

		const r = await resolvePendingConfirm({ key: pending!.key, verdict: 'discard' });
		assert.equal(r.promoted, false);

		// Confirmed namespace stays empty.
		const list = await prefsListRpc();
		assert.equal(list.entries.length, 0);

		// Pending row retained with userDiscarded:true.
		const after = await listPendingConfirms();
		assert.equal(after.length, 1);
		assert.equal(after[0]!.userDiscarded, true);
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// Validation + missing keys
// ---------------------------------------------------------------------------

test('resolvePendingConfirm: unknown key throws', async () => {
	const fx = setup();
	try {
		await assert.rejects(
			resolvePendingConfirm({ key: 'never-staged::nope', verdict: 'accept' }),
			/no pending entry/,
		);
	} finally { teardown(fx); }
});

test('resolvePendingConfirm: validation errors on bad params', async () => {
	const fx = setup();
	try {
		await assert.rejects(resolvePendingConfirm({} as never),                                        /`key`/);
		await assert.rejects(resolvePendingConfirm({ key: 'k' } as never),                              /verdict/);
		await assert.rejects(resolvePendingConfirm({ key: 'k', verdict: 'maybe' } as never),            /accept.*discard/);
		await assert.rejects(resolvePendingConfirm({ key: 'k', verdict: 'accept', canonicalText: '' }), /non-empty/);
		await assert.rejects(resolvePendingConfirm({ key: 'k', verdict: 'accept', confidence: 1.5 } as never), /\[0, 1\]/);
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// FeedbackBus dispatch -> L1 cache invalidation path
// ---------------------------------------------------------------------------

test('resolvePendingConfirm: accept + discard emit FeedbackBus events on agent:chat', async () => {
	const fx = setup();
	try {
		const hook = createPendingConfirmHook();
		await hook('Always include unit tests', { turnId: 'turn-1' });
		await hook('Always run linting',        { turnId: 'turn-2' });
		const list = await listPendingConfirms();

		const runtime = getSubstrateRuntime();
		const received: FeedbackEvent[] = [];
		const sub = runtime.feedbackBus.subscribe(AGENT_CHAT_OWNER, async (e) => { received.push(e); });
		try {
			await resolvePendingConfirm({ key: list[0]!.key, verdict: 'accept' });
			await resolvePendingConfirm({ key: list[1]!.key, verdict: 'discard' });
			assert.ok(received.length >= 2, `expected >= 2 events, got ${received.length}`);
			const sources = new Set(received.map(e => e.source));
			assert.ok(sources.has('rpc:prefs.confirm.resolve'));
		} finally { sub.unsubscribe(); }
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// No substrate runtime
// ---------------------------------------------------------------------------

test('hook: defers silently when substrate runtime not initialised', async () => {
	_resetSubstrateRuntimeForTests();
	_resetPendingConfirmEmitterForTests();
	const hook = createPendingConfirmHook();
	const r = await hook('always include unit tests', { turnId: 'no-runtime' });
	assert.equal(r.kind, 'defer');
});

test('resolvePendingConfirm: throws clearly when substrate not initialised', async () => {
	_resetSubstrateRuntimeForTests();
	await assert.rejects(resolvePendingConfirm({ key: 'k', verdict: 'accept' }), /not initialised/);
});

test('listPendingConfirms: returns empty when substrate not initialised', async () => {
	_resetSubstrateRuntimeForTests();
	const r = await listPendingConfirms();
	assert.deepEqual(r, []);
});


// ---------------------------------------------------------------------------
// M1.6.b: chat-handler bridge -> streaming IPC frames
// ---------------------------------------------------------------------------

test('bridgePendingConfirmToStream: forwards pending events as assertion-confirm frames', async () => {
	const fx = setup();
	try {
		const sent: IpcStreamMessage[] = [];
		const unsubscribe = bridgePendingConfirmToStream(99, (m) => { sent.push(m); });

		const hook = createPendingConfirmHook();
		await hook('Always include unit tests',    { turnId: 'turn-7' });
		await hook('Always run linting too',       { turnId: 'turn-8' });
		unsubscribe();

		// Both events arrive as assertion-confirm frames keyed to id=99.
		assert.equal(sent.length, 2);
		assert.ok(sent.every(m => m.id === 99));
		assert.ok(sent.every(m => m.stream === 'assertion-confirm'));
		const frames = sent.map(m => m.data as AssertionConfirmStreamFrame);
		assert.ok(frames.every(f => f.kind === 'pending'));
		assert.equal(frames[0]!.payload.turnId, 'turn-7');
		assert.equal(frames[1]!.payload.turnId, 'turn-8');
	} finally { teardown(fx); }
});

test('bridgePendingConfirmToStream: unsubscribing stops further forwarding', async () => {
	const fx = setup();
	try {
		const sent: IpcStreamMessage[] = [];
		const unsubscribe = bridgePendingConfirmToStream(1, (m) => { sent.push(m); });

		const hook = createPendingConfirmHook();
		await hook('Always include unit tests', { turnId: 'turn-1' });
		assert.equal(sent.length, 1);

		unsubscribe();

		await hook('Always run linting', { turnId: 'turn-2' });
		assert.equal(sent.length, 1, 'no further forwarding after unsubscribe');
	} finally { teardown(fx); }
});

test('bridgePendingConfirmToStream: respects AbortSignal -- aborted signal drops emission', async () => {
	const fx = setup();
	try {
		const sent: IpcStreamMessage[] = [];
		const ac = new AbortController();
		const unsubscribe = bridgePendingConfirmToStream(1, (m) => { sent.push(m); }, ac.signal);

		const hook = createPendingConfirmHook();
		await hook('First one fires', { turnId: 'turn-1' });
		assert.equal(sent.length, 1);

		ac.abort();
		await hook('After abort -- dropped', { turnId: 'turn-2' });
		assert.equal(sent.length, 1, 'aborted signal should drop further frames');
		unsubscribe();
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// Just type-touch the exports so unused-warnings don't bite
// ---------------------------------------------------------------------------

test('exports: PENDING_NS / CONFIRMED_NS strings reachable', () => {
	assert.equal(PENDING_NS,   'user-assertions-pending');
	assert.equal(CONFIRMED_NS, 'user-assertions');
});
