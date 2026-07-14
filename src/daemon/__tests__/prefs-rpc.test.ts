/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the `/prefs` IPC handlers (memory-context M1.7).
 *
 * Exercises list / edit / discard against a real substrate runtime
 * configured with a no-op LLM provider. The classifier is never
 * invoked -- entries are pre-populated via `runtime.memory` so the
 * tests focus on RPC behaviour (filtering, ordering, prefix
 * resolution, validation, feedback dispatch).
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
	prefsDiscardRpc,
	prefsEditRpc,
	prefsListRpc,
	type PrefsEntry,
} from '../prefs-rpc.js';
import type { LLMMessage, LLMProvider, LLMResponse } from '../../shared/types.js';
import type { FeedbackEvent } from '../substrate/types.js';

const NS = 'user-assertions';


function noopProvider(): LLMProvider {
	return {
		async complete(_messages: LLMMessage[]): Promise<LLMResponse> {
			throw new Error('noopProvider.complete: should not be invoked in these tests');
		},
		stream() { return (async function* () { yield ''; })(); },
		async embed() { return []; },
	};
}


interface SeedOpts {
	readonly key:           string;
	readonly subject:       string;
	readonly canonicalText: string;
	readonly confidence?:   number;
	readonly turnId?:       string;
	readonly repoPaths?:    readonly string[];
	readonly categories?:   readonly string[];
}

async function seedPref(opts: SeedOpts): Promise<void> {
	const runtime = getSubstrateRuntime();
	const ns = runtime.memory.scope(AGENT_CHAT_OWNER, NS);
	const turnId = opts.turnId ?? opts.key.split('::')[0]!;
	await ns.put(
		opts.key,
		{
			text:               opts.canonicalText,
			subject:            opts.subject,
			preferenceSubject:  opts.subject,
			canonicalText:      opts.canonicalText,
			polarity:           'preference',
			scope:              'workspace',
			...(opts.repoPaths  !== undefined ? { repoPaths:  opts.repoPaths  } : {}),
			...(opts.categories !== undefined ? { categories: opts.categories } : {}),
			targetOwners: [],
			confidence:   opts.confidence ?? 0.9,
		},
		{
			kind:       'constraint',
			source:     { kind: 'user-asserted', turnId },
			confidence: opts.confidence ?? 0.9,
		},
	);
}


interface Fx { dir: string }
function setup(): Fx {
	_resetSubstrateRuntimeForTests();
	const dir = mkdtempSync(join(tmpdir(), 'prefs-rpc-'));
	const runtime = initSubstrateRuntime({
		localProvider: noopProvider(),
		workspaceId:   'ws-prefs-rpc',
		rootDir:       dir,
	});
	registerAgentChatOwner(runtime);
	return { dir };
}
function teardown(fx: Fx): void {
	_resetSubstrateRuntimeForTests();
	try { rmSync(fx.dir, { recursive: true, force: true }); } catch { /* ignore */ }
}


// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

test('prefs.list: empty namespace -> empty result', async () => {
	const fx = setup();
	try {
		const r = await prefsListRpc();
		assert.deepEqual(r.entries, []);
	} finally { teardown(fx); }
});

test('prefs.list: returns seeded entries with all derived fields', async () => {
	const fx = setup();
	try {
		await seedPref({
			key:           'turn-1::test-policy',
			subject:       'test-policy',
			canonicalText: 'Always include unit tests.',
			confidence:    0.85,
			repoPaths:     ['/r1'],
			categories:    ['quality'],
		});
		const r = await prefsListRpc();
		assert.equal(r.entries.length, 1);
		const e = r.entries[0]!;
		assert.equal(e.key,           'turn-1::test-policy');
		assert.equal(e.subject,       'test-policy');
		assert.equal(e.canonicalText, 'Always include unit tests.');
		assert.equal(e.confidence,    0.85);
		assert.equal(e.polarity,      'preference');
		assert.equal(e.scope,         'workspace');
		assert.deepEqual(e.repoPaths,  ['/r1']);
		assert.deepEqual(e.categories, ['quality']);
		assert.equal(e.capturedAtTurn, 'turn-1');
	} finally { teardown(fx); }
});

test('prefs.list: drops entries below noise threshold (default 0.30)', async () => {
	const fx = setup();
	try {
		await seedPref({ key: 'turn-1::a', subject: 'a', canonicalText: 'A', confidence: 0.9 });
		await seedPref({ key: 'turn-2::b', subject: 'b', canonicalText: 'B', confidence: 0.25 });
		const r = await prefsListRpc();
		assert.equal(r.entries.length, 1);
		assert.equal(r.entries[0]!.canonicalText, 'A');
	} finally { teardown(fx); }
});

test('prefs.list: --all / includeNoisy returns below-threshold entries too', async () => {
	const fx = setup();
	try {
		await seedPref({ key: 'turn-1::a', subject: 'a', canonicalText: 'A', confidence: 0.9 });
		await seedPref({ key: 'turn-2::b', subject: 'b', canonicalText: 'B', confidence: 0.10 });
		const r = await prefsListRpc({ includeNoisy: true });
		assert.equal(r.entries.length, 2);
	} finally { teardown(fx); }
});

test('prefs.list: orders by descending confidence then key', async () => {
	const fx = setup();
	try {
		await seedPref({ key: 'turn-1::aa', subject: 'aa', canonicalText: 'AA', confidence: 0.7 });
		await seedPref({ key: 'turn-2::bb', subject: 'bb', canonicalText: 'BB', confidence: 0.9 });
		await seedPref({ key: 'turn-3::cc', subject: 'cc', canonicalText: 'CC', confidence: 0.9 });
		const r = await prefsListRpc();
		assert.deepEqual(r.entries.map(e => e.key), [
			'turn-2::bb', 'turn-3::cc', 'turn-1::aa',
		]);
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// edit
// ---------------------------------------------------------------------------

test('prefs.edit: replaces canonicalText, returns updated entry', async () => {
	const fx = setup();
	try {
		await seedPref({ key: 'turn-1::test-policy', subject: 'test-policy', canonicalText: 'old text' });
		const r = await prefsEditRpc({ key: 'turn-1::test-policy', canonicalText: 'new text' });
		assert.equal(r.ok, true);
		assert.equal(r.key, 'turn-1::test-policy');
		assert.ok(r.entry, 'edit should return refreshed entry');
		assert.equal(r.entry!.canonicalText, 'new text');

		// And the list now sees the update.
		const list = await prefsListRpc();
		assert.equal(list.entries[0]!.canonicalText, 'new text');
	} finally { teardown(fx); }
});

test('prefs.edit: updates confidence', async () => {
	const fx = setup();
	try {
		await seedPref({ key: 'turn-1::test-policy', subject: 'test-policy', canonicalText: 't', confidence: 0.5 });
		const r = await prefsEditRpc({ key: 'turn-1::test-policy', confidence: 0.95 });
		assert.equal(r.entry!.confidence, 0.95);
	} finally { teardown(fx); }
});

test('prefs.edit: prefix that uniquely identifies one entry resolves', async () => {
	const fx = setup();
	try {
		await seedPref({ key: 'turn-1::test-policy', subject: 'test-policy', canonicalText: 'old' });
		const r = await prefsEditRpc({ key: 'turn-1', canonicalText: 'updated' });
		assert.equal(r.key, 'turn-1::test-policy');
		assert.equal(r.entry!.canonicalText, 'updated');
	} finally { teardown(fx); }
});

test('prefs.edit: ambiguous prefix throws', async () => {
	const fx = setup();
	try {
		await seedPref({ key: 'turn-1::a', subject: 'a', canonicalText: 'A' });
		await seedPref({ key: 'turn-1::b', subject: 'b', canonicalText: 'B' });
		await assert.rejects(
			prefsEditRpc({ key: 'turn-1', canonicalText: 'x' }),
			/ambiguous/,
		);
	} finally { teardown(fx); }
});

test('prefs.edit: unknown key throws', async () => {
	const fx = setup();
	try {
		await assert.rejects(
			prefsEditRpc({ key: 'turn-99::missing', canonicalText: 'x' }),
			/no entry/,
		);
	} finally { teardown(fx); }
});

test('prefs.edit: validation errors on bad params', async () => {
	const fx = setup();
	try {
		await assert.rejects(prefsEditRpc({}),                                   /`key`/);
		await assert.rejects(prefsEditRpc({ key: 'k' }),                         /nothing to update/);
		await assert.rejects(prefsEditRpc({ key: 'k', canonicalText: '' }),     /non-empty/);
		await assert.rejects(prefsEditRpc({ key: 'k', confidence: 1.5 }),       /\[0, 1\]/);
		await assert.rejects(prefsEditRpc({ key: 'k', confidence: -0.1 }),      /\[0, 1\]/);
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// discard
// ---------------------------------------------------------------------------

test('prefs.discard: removes entry; list no longer returns it', async () => {
	const fx = setup();
	try {
		await seedPref({ key: 'turn-1::test-policy', subject: 'test-policy', canonicalText: 't' });
		const r = await prefsDiscardRpc({ key: 'turn-1::test-policy' });
		assert.equal(r.ok, true);
		assert.equal(r.key, 'turn-1::test-policy');
		const list = await prefsListRpc();
		assert.equal(list.entries.length, 0);
	} finally { teardown(fx); }
});

test('prefs.discard: unique prefix resolves', async () => {
	const fx = setup();
	try {
		await seedPref({ key: 'turn-1::test-policy', subject: 'test-policy', canonicalText: 't' });
		const r = await prefsDiscardRpc({ key: 'turn-1' });
		assert.equal(r.key, 'turn-1::test-policy');
		const list = await prefsListRpc();
		assert.equal(list.entries.length, 0);
	} finally { teardown(fx); }
});

test('prefs.discard: unknown key throws', async () => {
	const fx = setup();
	try {
		await assert.rejects(prefsDiscardRpc({ key: 'turn-99::missing' }), /no entry/);
	} finally { teardown(fx); }
});

test('prefs.discard: validation on missing key', async () => {
	const fx = setup();
	try {
		await assert.rejects(prefsDiscardRpc({}), /`key`/);
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// feedback dispatch (so ContextManager invalidates its cache)
// ---------------------------------------------------------------------------

test('prefs.edit + prefs.discard emit FeedbackBus events on agent:chat owner', async () => {
	const fx = setup();
	try {
		await seedPref({ key: 'turn-1::test-policy', subject: 'test-policy', canonicalText: 't' });
		const runtime = getSubstrateRuntime();
		const received: FeedbackEvent[] = [];
		const sub = runtime.feedbackBus.subscribe(AGENT_CHAT_OWNER, async (evt) => { received.push(evt); });
		try {
			await prefsEditRpc({ key: 'turn-1::test-policy', canonicalText: 'updated' });
			await prefsDiscardRpc({ key: 'turn-1::test-policy' });
			assert.ok(received.length >= 2, `expected >= 2 events, got ${received.length}`);
			const sources = new Set(received.map(e => e.source));
			assert.ok(sources.has('rpc:prefs.edit'),    'edit dispatch missing');
			assert.ok(sources.has('rpc:prefs.discard'), 'discard dispatch missing');
		} finally { sub.unsubscribe(); }
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// no substrate runtime
// ---------------------------------------------------------------------------

test('prefs.list: returns empty when substrate runtime not initialised', async () => {
	_resetSubstrateRuntimeForTests();
	const r = await prefsListRpc();
	assert.deepEqual(r.entries, []);
});

test('prefs.edit + prefs.discard: throw clearly when substrate runtime not initialised', async () => {
	_resetSubstrateRuntimeForTests();
	await assert.rejects(prefsEditRpc({ key: 'k', canonicalText: 'x' }), /not initialised/);
	await assert.rejects(prefsDiscardRpc({ key: 'k' }),                  /not initialised/);
});
