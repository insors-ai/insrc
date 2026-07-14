/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for `runPrefsSlash` (memory-context M1.7).
 *
 * The slash dispatcher is a thin markdown renderer over `prefs-rpc.ts`,
 * but it owns parsing (subcommand split, edit-args), error messaging,
 * and the rendered shape the user sees. These tests pin all three.
 *
 * All paths emit a final stream:'done' frame -- pin that too so the
 * chat UI never hangs on a missing terminator.
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
import { runPrefsSlash } from '../prefs-slash.js';
import type { IpcStreamMessage, LLMMessage, LLMProvider, LLMResponse } from '../../shared/types.js';


function noopProvider(): LLMProvider {
	return {
		async complete(_messages: LLMMessage[]): Promise<LLMResponse> {
			throw new Error('noopProvider.complete: should not be invoked');
		},
		stream() { return (async function* () { yield ''; })(); },
		async embed() { return []; },
	};
}


async function seed(key: string, subject: string, canonicalText: string, confidence = 0.9): Promise<void> {
	const ns = getSubstrateRuntime().memory.scope(AGENT_CHAT_OWNER, 'user-assertions');
	const turnId = key.split('::')[0]!;
	await ns.put(key, {
		text: canonicalText, subject, preferenceSubject: subject, canonicalText,
		polarity: 'preference', scope: 'workspace', targetOwners: [], confidence,
	}, {
		kind: 'constraint', source: { kind: 'user-asserted', turnId }, confidence,
	});
}


interface Fx { dir: string; sent: IpcStreamMessage[]; send: (m: IpcStreamMessage) => void }
function setup(): Fx {
	_resetSubstrateRuntimeForTests();
	const dir = mkdtempSync(join(tmpdir(), 'prefs-slash-'));
	const runtime = initSubstrateRuntime({
		localProvider: noopProvider(),
		workspaceId:   'ws-prefs-slash',
		rootDir:       dir,
	});
	registerAgentChatOwner(runtime);
	const sent: IpcStreamMessage[] = [];
	return { dir, sent, send: (m) => { sent.push(m); } };
}
function teardown(fx: Fx): void {
	_resetSubstrateRuntimeForTests();
	try { rmSync(fx.dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function deltaText(sent: readonly IpcStreamMessage[]): string {
	for (const m of sent) {
		if (m.stream === 'delta') {
			const d = m.data as { text?: string };
			return d.text ?? '';
		}
	}
	return '';
}

function endsWithDone(sent: readonly IpcStreamMessage[]): boolean {
	const last = sent[sent.length - 1];
	return last !== undefined && last.stream === 'done';
}


// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

test('/prefs (no args) -> alias for list; empty state renders human-readable message', async () => {
	const fx = setup();
	try {
		await runPrefsSlash('', 42, fx.send);
		assert.match(deltaText(fx.sent), /No active user preferences captured/);
		assert.ok(endsWithDone(fx.sent));
	} finally { teardown(fx); }
});

test('/prefs list renders entries with subject and canonical text', async () => {
	const fx = setup();
	try {
		await seed('turn-1::test-policy', 'test-policy', 'Always include unit tests.');
		await runPrefsSlash('list', 1, fx.send);
		const text = deltaText(fx.sent);
		assert.match(text, /Active preferences \(1\)/);
		assert.match(text, /`turn-1::test-policy`/);
		assert.match(text, /test-policy/);
		assert.match(text, /Always include unit tests\./);
		assert.ok(endsWithDone(fx.sent));
	} finally { teardown(fx); }
});

test('/prefs list --all surfaces below-threshold entries', async () => {
	const fx = setup();
	try {
		await seed('turn-1::a', 'code-style', 'A', 0.9);
		await seed('turn-2::b', 'code-style', 'B', 0.10);
		await runPrefsSlash('list --all', 1, fx.send);
		const text = deltaText(fx.sent);
		assert.match(text, /Active preferences \(2/);
		assert.match(text, /turn-2::b/);
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// edit
// ---------------------------------------------------------------------------

test('/prefs edit <key> <text> updates and confirms', async () => {
	const fx = setup();
	try {
		await seed('turn-1::test-policy', 'test-policy', 'old');
		await runPrefsSlash('edit turn-1::test-policy actually use property-based tests', 2, fx.send);
		const text = deltaText(fx.sent);
		assert.match(text, /Updated.*turn-1::test-policy/);
		assert.match(text, /actually use property-based tests/);
		assert.ok(endsWithDone(fx.sent));
	} finally { teardown(fx); }
});

test('/prefs edit accepts unique key prefix', async () => {
	const fx = setup();
	try {
		await seed('turn-1::test-policy', 'test-policy', 'old');
		await runPrefsSlash('edit turn-1 new canonical text', 2, fx.send);
		const text = deltaText(fx.sent);
		assert.match(text, /Updated.*turn-1::test-policy/);
		assert.match(text, /new canonical text/);
	} finally { teardown(fx); }
});

test('/prefs edit missing args -> usage', async () => {
	const fx = setup();
	try {
		await runPrefsSlash('edit', 2, fx.send);
		const text = deltaText(fx.sent);
		assert.match(text, /key and new text are required/);
		assert.match(text, /Subcommands/);
		assert.ok(endsWithDone(fx.sent));
	} finally { teardown(fx); }
});

test('/prefs edit unknown key -> error message (and done)', async () => {
	const fx = setup();
	try {
		await runPrefsSlash('edit turn-99 nothing here', 2, fx.send);
		assert.match(deltaText(fx.sent), /no entry/);
		assert.ok(endsWithDone(fx.sent));
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// discard
// ---------------------------------------------------------------------------

test('/prefs discard <key> removes and confirms', async () => {
	const fx = setup();
	try {
		await seed('turn-1::test-policy', 'test-policy', 't');
		await runPrefsSlash('discard turn-1::test-policy', 3, fx.send);
		assert.match(deltaText(fx.sent), /Discarded.*turn-1::test-policy/);
		assert.ok(endsWithDone(fx.sent));
	} finally { teardown(fx); }
});

test('/prefs discard missing key -> usage', async () => {
	const fx = setup();
	try {
		await runPrefsSlash('discard', 3, fx.send);
		assert.match(deltaText(fx.sent), /key is required/);
		assert.match(deltaText(fx.sent), /Subcommands/);
	} finally { teardown(fx); }
});


// ---------------------------------------------------------------------------
// unknown subcommand + help
// ---------------------------------------------------------------------------

test('/prefs help renders usage', async () => {
	const fx = setup();
	try {
		await runPrefsSlash('help', 4, fx.send);
		const text = deltaText(fx.sent);
		assert.match(text, /Subcommands/);
		assert.match(text, /\/prefs list/);
		assert.match(text, /\/prefs discard/);
		assert.match(text, /\/prefs edit/);
		assert.ok(endsWithDone(fx.sent));
	} finally { teardown(fx); }
});

test('/prefs <garbage> -> "Unknown subcommand" + usage', async () => {
	const fx = setup();
	try {
		await runPrefsSlash('floobazz', 4, fx.send);
		const text = deltaText(fx.sent);
		assert.match(text, /Unknown subcommand/);
		assert.match(text, /Subcommands/);
	} finally { teardown(fx); }
});
