/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s2/t2: buildArgv's read-only branch and
 * stableDescriptorHash, the stable qualification-cache key.
 * Run: npx tsx --test src/shared/__tests__/vibe-adapter-readonly-argv.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { _buildArgvForTests, createVibeAdapter, stableDescriptorHash } from '../vibe-adapter.js';
import type { VibeAdapterContext, VibeTurnRequest } from '../vibe-adapter.js';

function readOnlyRequest(overrides: Partial<VibeTurnRequest> = {}): VibeTurnRequest {
	return { prompt: 'hi', outputMode: 'json', session: { kind: 'new' }, mode: 'read-only', ...overrides };
}

test("buildArgv's read-only branch emits exactly the two connector_insrc_* flags and no approval flag", () => {
	for (const approval of [undefined, 'default', 'manual', 'edit-auto', 'auto'] as const) {
		const argv = _buildArgvForTests(readOnlyRequest(approval === undefined ? {} : { approval }), '/tmp/out');
		assert.ok(!argv.includes('--auto-approve'), `approval=${String(approval)} must not add --auto-approve`);
		assert.ok(!argv.includes('--approval-policy'), `approval=${String(approval)} must not add --approval-policy`);
		const enabledToolsPairs: string[] = [];
		for (let i = 0; i < argv.length; i++) if (argv[i] === '--enabled-tools') enabledToolsPairs.push(argv[i + 1] as string);
		assert.deepEqual(enabledToolsPairs, ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step']);
	}
});

test('the recorded argv matching buildArgv\'s own values exactly except outputDir', () => {
	const argvA = _buildArgvForTests(readOnlyRequest(), '/tmp/vibe-out-aaaa');
	const argvB = _buildArgvForTests(readOnlyRequest(), '/tmp/vibe-out-bbbb-different');
	const idx = (argv: readonly string[]) => argv.indexOf('--output-dir');
	assert.notEqual(argvA[idx(argvA) + 1], argvB[idx(argvB) + 1], 'the two calls really do differ in --output-dir');
	const strip = (argv: readonly string[]) => { const i = idx(argv); return [...argv.slice(0, i), ...argv.slice(i + 2)]; };
	assert.deepEqual(strip(argvA), strip(argvB), 'every OTHER recorded value matches exactly');
});

test('stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache', () => {
	const context: VibeAdapterContext = { cwd: process.cwd(), processGroup: 'adapter-owned' };
	const argvA = _buildArgvForTests(readOnlyRequest(), '/tmp/vibe-out-aaaa');
	const argvB = _buildArgvForTests(readOnlyRequest(), '/tmp/vibe-out-bbbb-different');
	const deps = { resolveCommandPath: () => '/usr/local/bin/vibe', statSync: () => ({ size: 1000, mtimeMs: 123 }) };
	const hashA = stableDescriptorHash(context, 'vibe', argvA, deps);
	const hashB = stableDescriptorHash(context, 'vibe', argvB, deps);
	assert.equal(hashA, hashB, 'two calls differing only in --output-dir must hash identically (a cache hit)');
});

test('stableDescriptorHash changes when the binary content identity, pinned env subset, or cwd changes', () => {
	const context: VibeAdapterContext = { cwd: '/repo/a', processGroup: 'adapter-owned' };
	const otherCwdContext: VibeAdapterContext = { cwd: '/repo/b', processGroup: 'adapter-owned' };
	const envContext: VibeAdapterContext = { cwd: '/repo/a', env: { FOO: 'bar' }, processGroup: 'adapter-owned' };
	const argv = _buildArgvForTests(readOnlyRequest(), '/tmp/out');
	const depsV1 = { resolveCommandPath: () => '/usr/local/bin/vibe', statSync: () => ({ size: 1000, mtimeMs: 123 }) };
	const depsV2 = { resolveCommandPath: () => '/usr/local/bin/vibe', statSync: () => ({ size: 1000, mtimeMs: 456 }) };

	const base = stableDescriptorHash(context, 'vibe', argv, depsV1);
	const differentBinary = stableDescriptorHash(context, 'vibe', argv, depsV2);
	const differentCwd = stableDescriptorHash(otherCwdContext, 'vibe', argv, depsV1);
	const differentEnv = stableDescriptorHash(envContext, 'vibe', argv, depsV1);

	assert.notEqual(base, differentBinary, 'a changed binary content identity (mtime) must change the hash');
	assert.notEqual(base, differentCwd, 'a changed cwd must change the hash');
	assert.notEqual(base, differentEnv, 'a changed pinned env subset must change the hash');
});

test('createVibeAdapter still exists and read-only requests without a qualified capability refuse before dispatch (unaffected by this Task)', () => {
	const adapter = createVibeAdapter({ cwd: process.cwd(), processGroup: 'adapter-owned' });
	assert.throws(() => adapter.startTurn(readOnlyRequest()), /no qualified capability yet/);
});
