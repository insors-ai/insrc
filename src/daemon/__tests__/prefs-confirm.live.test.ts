/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live-LLM round trip for the Layer 3 confirm flow (memory-context M1.6.a).
 *
 * Runs the real Ollama Layer 2 hook against a deliberately fuzzy
 * assertion -- one whose confidence is likely to land below the
 * auto-accept threshold so Layer 3 staging kicks in. Then exercises:
 *   - listPendingConfirms surfaces the staged entry
 *   - resolvePendingConfirm('accept') promotes it to constraint
 *   - prefsListRpc reflects the promotion
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
	_resetPendingConfirmEmitterForTests,
	createPendingConfirmHook,
	listPendingConfirms,
	resolvePendingConfirm,
} from '../prefs-confirm.js';
import { prefsListRpc } from '../prefs-rpc.js';

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


test('M1.6.a live: borderline assertion -> Layer 3 staging -> accept promotes', { timeout: 120_000 }, async (t) => {
	if (!await isOllamaReachable()) {
		t.skip(`Ollama not reachable at ${OLLAMA_HOST}; skipping`);
		return;
	}
	_resetSubstrateRuntimeForTests();
	_resetPendingConfirmEmitterForTests();
	const dir = mkdtempSync(join(tmpdir(), 'm1-6-live-'));
	try {
		const provider = new OllamaProvider(OLLAMA_MODEL, OLLAMA_HOST, 8192);
		const runtime  = initSubstrateRuntime({
			localProvider: provider,
			workspaceId:   'm1-6-live',
			rootDir:       dir,
			userConfirm:   createPendingConfirmHook(),
		});
		registerAgentChatOwner(runtime);

		// Hand-feed a deliberately ambiguous assertion. The Ollama hook
		// MAY accept it at high confidence (-> straight into constraint
		// namespace), MAY accept low (-> Layer 3 stages), or MAY defer
		// (no entry, no pending). All three are acceptable LLM verdicts;
		// the test branches on which path fired.
		await runtime.classifyAssertion({
			turnId: 'live-1',
			text:   'I usually prefer functions over classes when the data is simple.',
		});

		const pending = await listPendingConfirms();
		const confirmed = await prefsListRpc();

		if (pending.length > 0) {
			// Layer 3 path: stage + resolve.
			const target = pending[0]!;
			const r = await resolvePendingConfirm({ key: target.key, verdict: 'accept' });
			assert.equal(r.promoted, true);
			const list = await prefsListRpc({ includeNoisy: true });
			assert.ok(list.entries.length >= 1, 'promoted entry should surface in prefs.list');
			const after = await listPendingConfirms();
			assert.equal(after.find(e => e.key === target.key), undefined,
				'accepted pending row should be gone');
		} else if (confirmed.entries.length > 0) {
			// Layer 2 high-confidence path: nothing to assert beyond
			// "we landed somewhere coherent."
			assert.ok(confirmed.entries[0]!.canonicalText.length > 0);
		} else {
			// Layer 2 deferred entirely: not the path we wanted to
			// exercise this run, but skipping is the right call -- the
			// LLM made a judgement we can't override deterministically.
			t.skip('Ollama deferred or rejected; not the borderline case this test targets');
		}
	} finally {
		_resetSubstrateRuntimeForTests();
		_resetPendingConfirmEmitterForTests();
		try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
	}
});
