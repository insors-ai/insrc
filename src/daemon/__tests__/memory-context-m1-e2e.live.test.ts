/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Memory-context M1.10 -- end-to-end smoke test.
 *
 * Drives the full M1 chain through `ContextManager.assemble()` (the
 * surface the agent loop actually consumes). One test covers the
 * happy-path Layer 2 flow with real Ollama; a second covers the
 * Layer 3 staging-and-resolve flow with a scripted Layer 2 so the
 * borderline path is deterministic.
 *
 * What this test is for:
 *   - Catch regressions where capture works in isolation but the
 *     L1 cache invalidation, edit-then-re-assemble, or
 *     discard-then-re-assemble step silently breaks.
 *   - Verify the M1.7 + M1.8 + M1.6.a interfaces compose end-to-end,
 *     not just individually.
 *
 * Skips cleanly when Ollama is unreachable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OllamaProvider } from '../../agent/providers/ollama.js';
import { ContextManager } from '../../agent/context/index.js';
import {
	_resetSubstrateRuntimeForTests,
	AGENT_CHAT_OWNER,
	getSubstrateRuntime,
	initSubstrateRuntime,
	registerAgentChatOwner,
} from '../substrate/singleton.js';
import {
	_resetPendingConfirmEmitterForTests,
	createPendingConfirmHook,
	listPendingConfirms,
	resolvePendingConfirm,
} from '../prefs-confirm.js';
import {
	prefsDiscardRpc,
	prefsEditRpc,
	prefsListRpc,
} from '../prefs-rpc.js';
import type { LLMMessage, LLMProvider, LLMResponse } from '../../shared/types.js';

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


function makeContextManager(provider: LLMProvider): ContextManager {
	return new ContextManager({
		repoPath:          '/m1-e2e/repo',
		closureRepos:      ['/m1-e2e/repo'],
		provider,
		contextWindowSize: 16_384,
	});
}


// ---------------------------------------------------------------------------
// Test 1: Layer 2 happy path through ContextManager.assemble
// ---------------------------------------------------------------------------

test('M1.10 live: capture -> assemble L1 -> edit propagates -> discard drops', { timeout: 180_000 }, async (t) => {
	if (!await isOllamaReachable()) {
		t.skip(`Ollama not reachable at ${OLLAMA_HOST}; skipping`);
		return;
	}
	_resetSubstrateRuntimeForTests();
	_resetPendingConfirmEmitterForTests();
	const dir = mkdtempSync(join(tmpdir(), 'm1-10-e2e-'));
	try {
		const provider = new OllamaProvider(OLLAMA_MODEL, OLLAMA_HOST, 8192);
		const runtime = initSubstrateRuntime({
			localProvider: provider,
			workspaceId:   'm1-10-e2e',
			rootDir:       dir,
			userConfirm:   createPendingConfirmHook(),
		});
		registerAgentChatOwner(runtime);

		// ------------------------------------------------------------------
		// Step 1: capture a strong preference via real Ollama Layer 2.
		// ------------------------------------------------------------------
		await runtime.classifyAssertion({
			turnId: 'm1-10-1',
			text:   'Always include unit tests in implementation plans.',
		});

		const captured = await prefsListRpc();
		assert.ok(captured.entries.length >= 1, 'capture step should land at least one preference');
		const target = captured.entries.find(e => /unit tests/i.test(e.canonicalText));
		assert.ok(target, 'expected the test-policy preference to be captured');

		// ------------------------------------------------------------------
		// Step 2: ContextManager.assemble surfaces it in the L1 system block.
		// ------------------------------------------------------------------
		const ctx = makeContextManager(provider);
		try {
			const r1 = await ctx.assemble('Draft an implementation plan for adding a feature flag system.', []);
			assert.match(r1.system.text, /Active user preferences/, 'L1 should include the preferences section');
			assert.match(r1.system.text, /unit tests/i, 'L1 should include the captured preference text');

			// ------------------------------------------------------------------
			// Step 3: edit the preference; the L1 cache invalidates (FeedbackBus)
			// and the next assemble reflects the new canonical text.
			// ------------------------------------------------------------------
			const edited = await prefsEditRpc({
				key:           target!.key,
				canonicalText: 'Implementation plans MUST include BOTH unit tests AND integration tests.',
			});
			assert.equal(edited.ok, true);

			// Give the FeedbackBus dispatch a tick to flow to the
			// ContextManager subscriber.
			await new Promise(resolve => setImmediate(resolve));

			const r2 = await ctx.assemble('Continuing the plan -- next step please.', []);
			assert.match(r2.system.text, /integration tests/i, 'edit should propagate through the L1 cache invalidation');

			// ------------------------------------------------------------------
			// Step 4: discard the preference; the next assemble drops it.
			// ------------------------------------------------------------------
			await prefsDiscardRpc({ key: target!.key });
			await new Promise(resolve => setImmediate(resolve));

			const r3 = await ctx.assemble('And now -- what else?', []);
			assert.doesNotMatch(r3.system.text, /integration tests/i, 'discard should drop the preference from L1');
		} finally {
			ctx.dispose();
		}
	} finally {
		_resetSubstrateRuntimeForTests();
		_resetPendingConfirmEmitterForTests();
		try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
	}
});


// ---------------------------------------------------------------------------
// Test 2: Layer 3 staging + resolve through ContextManager.assemble
// ---------------------------------------------------------------------------

/**
 * Scripted Layer 2 that always accepts at confidence 0.5 (below the
 * default 0.7 auto-accept threshold) so the classifier escalates to
 * Layer 3 deterministically. The real Ollama hook is non-deterministic
 * on borderline phrasings, so we substitute a fixed responder here --
 * the LIVE test for the Ollama hook itself is in
 * substrate/__tests__/ollama-hook.live.test.ts.
 */
function scriptedLowConfidenceProvider(): LLMProvider {
	return {
		async complete(messages: LLMMessage[]): Promise<LLMResponse> {
			// Mimic the JSON shape the Ollama hook prompt expects.
			const lastUser = messages.findLast(m => m.role === 'user');
			const span = lastUser?.content ?? '';
			return {
				text: JSON.stringify({
					verdict:       'accept',
					confidence:    0.5,
					rationale:     'scripted borderline accept',
					subject:       'test-policy',
					canonicalText: span,
					categories:    [],
					repoPaths:     [],
					relationship:  null,
				}),
				stopReason: 'end_turn',
			};
		},
		stream() { return (async function* () { yield ''; })(); },
		async embed() { return []; },
	};
}


test('M1.10 e2e: Layer 3 stages, resolve(accept) promotes, L1 surfaces', { timeout: 60_000 }, async () => {
	_resetSubstrateRuntimeForTests();
	_resetPendingConfirmEmitterForTests();
	const dir = mkdtempSync(join(tmpdir(), 'm1-10-l3-'));
	try {
		const scripted = scriptedLowConfidenceProvider();
		const runtime  = initSubstrateRuntime({
			localProvider: scripted,
			workspaceId:   'm1-10-l3',
			rootDir:       dir,
			userConfirm:   createPendingConfirmHook(),
		});
		registerAgentChatOwner(runtime);

		// Step 1: low-confidence Layer 2 -> Layer 3 stages instead of persisting.
		const r = await runtime.classifyAssertion({
			turnId: 'l3-1',
			text:   'Always include unit tests when planning.',
		});
		assert.equal(r.persisted.length, 0, 'low-confidence should not land in confirmed namespace');
		assert.equal(r.classification.deferred.length, 1, 'Layer 3 should defer (staging) instead of accept');

		// Step 2: pending namespace surfaces the staged row.
		const pending = await listPendingConfirms();
		assert.equal(pending.length, 1);
		const stagedKey = pending[0]!.key;

		// Step 3: assemble at this point -- L1 should NOT include the pending row
		// (it's a 'hint', not a 'constraint'; prefs.list defaults exclude it).
		const ctx = makeContextManager(scripted);
		try {
			const before = await ctx.assemble('Draft an implementation plan.', []);
			assert.doesNotMatch(before.system.text, /include unit tests/i,
				'pending (un-resolved) preferences should not appear in L1');

			// Step 4: resolve as accept -> promotes hint to constraint + fires FeedbackBus.
			const resolved = await resolvePendingConfirm({ key: stagedKey, verdict: 'accept' });
			assert.equal(resolved.promoted, true);

			await new Promise(resolve => setImmediate(resolve));

			// Step 5: assemble again; promoted preference now appears.
			const after = await ctx.assemble('Continue.', []);
			assert.match(after.system.text, /Active user preferences/);
			assert.match(after.system.text, /include unit tests/i);

			// Step 6: confirmed namespace now contains the entry; pending is gone.
			const confirmed = await prefsListRpc();
			assert.ok(confirmed.entries.some(e => e.key === stagedKey),
				'promoted entry should be visible in confirmed list');
			const stillPending = await listPendingConfirms();
			assert.equal(stillPending.find(e => e.key === stagedKey), undefined,
				'promoted entry should no longer be in pending namespace');
		} finally {
			ctx.dispose();
		}

		// Sanity check: the runtime's memory namespaces reflect the promotion.
		const confirmedNs = getSubstrateRuntime().memory.scope(AGENT_CHAT_OWNER, 'user-assertions');
		const promotedEntry = await confirmedNs.get(stagedKey);
		assert.ok(promotedEntry, 'confirmed row should exist after resolve(accept)');
		assert.equal(promotedEntry!.kind, 'constraint', 'promoted row must be a constraint, not a hint');
	} finally {
		_resetSubstrateRuntimeForTests();
		_resetPendingConfirmEmitterForTests();
		try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
	}
});
