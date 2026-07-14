/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live-LLM end-to-end smoke for the `/prefs` round trip (memory-context M1.7).
 *
 * Verifies the surface a real user touches:
 *   1. Type a preference in chat (-> classifyAssertion against real Ollama)
 *   2. Run `/prefs list`        (-> prefsListRpc)
 *   3. Discard one              (-> prefsDiscardRpc)
 *   4. Edit one                 (-> prefsEditRpc)
 *   5. List confirms the change
 *
 * Skips cleanly when Ollama isn't reachable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OllamaProvider } from '../../agent/providers/ollama.js';
import {
	_resetSubstrateRuntimeForTests,
	initSubstrateRuntime,
	registerAgentChatOwner,
} from '../substrate/singleton.js';
import {
	prefsDiscardRpc,
	prefsEditRpc,
	prefsListRpc,
} from '../prefs-rpc.js';

const OLLAMA_HOST  = process.env.OLLAMA_HOST  ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3-coder:latest';


async function isOllamaReachable(): Promise<boolean> {
	try {
		const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
		return r.ok;
	} catch {
		return false;
	}
}


test('M1.7 live: capture preference -> /prefs list -> edit -> discard round trip', { timeout: 120_000 }, async (t) => {
	if (!await isOllamaReachable()) {
		t.skip(`Ollama not reachable at ${OLLAMA_HOST}; skipping`);
		return;
	}
	_resetSubstrateRuntimeForTests();
	const dir = mkdtempSync(join(tmpdir(), 'm1-7-live-'));
	try {
		const provider = new OllamaProvider(OLLAMA_MODEL, OLLAMA_HOST, 8192);
		const runtime = initSubstrateRuntime({
			localProvider: provider,
			workspaceId:   'm1-7-live',
			rootDir:       dir,
		});
		registerAgentChatOwner(runtime);

		// Step 1: capture (real Ollama Layer 2)
		await runtime.classifyAssertion({
			turnId: 'live-1',
			text:   'Always include unit tests in implementation plans.',
		});
		await runtime.classifyAssertion({
			turnId: 'live-2',
			text:   'Use camelCase for all JavaScript variable names.',
		});

		// Step 2: /prefs list
		const list1 = await prefsListRpc();
		assert.ok(list1.entries.length >= 2, `expected at least 2 entries, got ${list1.entries.length}`);

		const testPolicy = list1.entries.find(e => /test/i.test(e.canonicalText));
		assert.ok(testPolicy, 'test-policy preference should be present in list');

		// Step 3: discard the camelCase one
		const styleEntry = list1.entries.find(e => /camelCase/i.test(e.canonicalText));
		assert.ok(styleEntry, 'camelCase preference should be present');
		await prefsDiscardRpc({ key: styleEntry!.key });
		const list2 = await prefsListRpc();
		assert.equal(list2.entries.find(e => e.key === styleEntry!.key), undefined,
			'discarded entry should no longer appear in list');

		// Step 4: edit the test-policy canonical text
		const r = await prefsEditRpc({
			key:           testPolicy!.key,
			canonicalText: 'Implementation plans MUST include unit tests AND integration tests.',
		});
		assert.equal(r.ok, true);
		assert.match(r.entry!.canonicalText, /integration tests/);

		// Step 5: list reflects the edit
		const list3 = await prefsListRpc();
		const refreshed = list3.entries.find(e => e.key === testPolicy!.key);
		assert.ok(refreshed, 'edited entry should still be present');
		assert.match(refreshed!.canonicalText, /integration tests/);
	} finally {
		_resetSubstrateRuntimeForTests();
		try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
	}
});
