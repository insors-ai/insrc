/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s2/t4: createVibeAdapter's readOnly field -- a
 * pure, side-effect-free synchronous read of the qualification cache's current entry for
 * this adapter's own stable descriptor. Construction itself never triggers a qualification
 * run: confirmed by direct experiment that self-triggering on a cache miss breaks s1's own
 * existing contract (createVibeAdapter runs on EVERY turn's construction, including
 * ordinary 'default'-mode turns -- an already-aborted-request test asserting
 * spawnCalls.length===0 would see 1 instead, a real regression). Triggering a fresh run on
 * a cache miss belongs to startTurn's own read-only dispatch path instead (a later Task of
 * this Story).
 * Run: npx tsx --test src/shared/__tests__/vibe-adapter-readonly-field.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _buildArgvForTests, _readOnlyQualificationCacheForTests, createVibeAdapter, stableDescriptorHash } from '../vibe-adapter.js';
import type { ReadOnlyCapability, VibeAdapterContext } from '../vibe-adapter.js';

function realDir(): string { return mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-field-')); }

function descriptorFor(context: VibeAdapterContext, command: string): string {
	const argv = _buildArgvForTests({ prompt: 'x', outputMode: 'streaming', session: { kind: 'new' }, mode: 'read-only' }, '/tmp/unused-output-dir');
	return stableDescriptorHash(context, command, argv, { resolveCommandPath: (cmd) => cmd, statSync: () => ({ size: 1, mtimeMs: 1 }) });
}

test("VibeExecutionAdapter.readOnly reflects the cached capability for this adapter's stable descriptor", () => {
	_readOnlyQualificationCacheForTests().clear();
	const context: VibeAdapterContext = { cwd: realDir(), processGroup: 'adapter-owned' };
	const key = descriptorFor(context, 'vibe-cached');
	const cachedCapability: ReadOnlyCapability = {
		status: 'qualified',
		allowedTools: ['insrc_analyze', 'insrc_analyze_step'],
		provenAgainst: { stableDescriptorHash: key, effectiveConfigFingerprint: 'fp-fixed' },
	};
	_readOnlyQualificationCacheForTests().set(key, cachedCapability);

	const adapter = createVibeAdapter(context, { command: 'vibe-cached', resolveCommandPath: (cmd) => cmd, identityStatSync: () => ({ size: 1, mtimeMs: 1 }) });
	assert.deepEqual(adapter.readOnly, cachedCapability);
});

test("the cache-miss-on-descriptor-change path when the binary content or pinned env changes", () => {
	_readOnlyQualificationCacheForTests().clear();
	const cwd = realDir();
	const baseContext: VibeAdapterContext = { cwd, processGroup: 'adapter-owned' };
	const changedEnvContext: VibeAdapterContext = { cwd, env: { FOO: 'bar' }, processGroup: 'adapter-owned' };
	const command = 'vibe-change';

	// Pre-populate the cache for the BASE descriptor only.
	const baseKey = descriptorFor(baseContext, command);
	const baseCapability: ReadOnlyCapability = { status: 'qualified', allowedTools: ['insrc_analyze', 'insrc_analyze_step'], provenAgainst: { stableDescriptorHash: baseKey, effectiveConfigFingerprint: 'fp-base' } };
	_readOnlyQualificationCacheForTests().set(baseKey, baseCapability);

	// A changed pinned env subset is a DIFFERENT descriptor: a cold miss. Construction
	// returns an 'unavailable' snapshot synchronously, distinct from the base entry, and
	// never spawns anything itself -- confirmed by never providing a spawn override here
	// at all; a self-trigger would throw (spawn is undefined) and this must not happen.
	let spawnInvoked = false;
	const adapterChangedEnv = createVibeAdapter(changedEnvContext, {
		command,
		resolveCommandPath: (cmd) => cmd,
		identityStatSync: () => ({ size: 1, mtimeMs: 1 }),
		spawn: () => { spawnInvoked = true; throw new Error('construction must never spawn'); },
	});
	assert.notDeepEqual(adapterChangedEnv.readOnly, baseCapability);
	assert.equal(adapterChangedEnv.readOnly.status, 'unavailable');
	assert.equal(spawnInvoked, false, 'createVibeAdapter must never itself trigger a qualification probe');

	// The base descriptor is unaffected by the miss on the changed one.
	const adapterBaseAgain = createVibeAdapter(baseContext, { command, resolveCommandPath: (cmd) => cmd, identityStatSync: () => ({ size: 1, mtimeMs: 1 }) });
	assert.deepEqual(adapterBaseAgain.readOnly, baseCapability);
});
