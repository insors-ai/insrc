/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t2: spawnManaged, the streaming entry of the process lifecycle.
 * Run: npx tsx --test src/daemon/tools/__tests__/spawn-managed.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { spawnManaged } from '../shell-helper.js';
import { cleanup, fileExists, tick, tmp } from './_proc.js';

test('spawn-managed.test.ts: returns the live child so stdout and stderr callbacks receive data in order, and settled carries code, signal, timedOut and aborted', async () => {
	const m = spawnManaged('sh', ['-c', 'echo one; sleep 0.05; echo two; echo bad 1>&2; exit 4']);
	assert.equal(m.spawned, true);
	if (!m.spawned) return;
	const out: string[] = []; const err: string[] = [];
	m.child.stdout!.on('data', d => out.push(String(d)));
	m.child.stderr!.on('data', d => err.push(String(d)));
	const e = await m.settled;
	assert.equal(out.join(''), 'one\ntwo\n');
	assert.equal(err.join(''), 'bad\n');
	assert.deepEqual(e, { code: 4, signal: null, timedOut: false, aborted: false });
});

test('spawn-managed.test.ts: the timeoutMs ceiling kills the group and reports timedOut', async () => {
	const m = spawnManaged('sleep', ['30'], { timeoutMs: 150 });
	assert.equal(m.spawned, true);
	const e = await m.settled;
	assert.equal(e.timedOut, true); assert.equal(e.aborted, false); assert.equal(e.code, null);
});

test('spawn-managed.test.ts: a spawn error reaches the child error event and settled still resolves', async () => {
	const m = spawnManaged('definitely-not-a-command-xyz', []);
	assert.equal(m.spawned, true);
	if (!m.spawned) return;
	let sawError = false;
	m.child.on('error', () => { sawError = true; });
	const e = await m.settled;
	assert.equal(sawError, true);
	assert.equal(e.code, null);
});

test('spawn-managed.test.ts: an already-aborted effective signal returns spawned false, starts nothing and settles already aborted', async () => {
	const dir = tmp();
	try {
		const marker = join(dir, 'm');
		const c = new AbortController(); c.abort();
		const m = spawnManaged('sh', ['-c', `touch '${marker}'`], { signal: c.signal });
		assert.equal(m.spawned, false);
		assert.equal('child' in m, false);
		assert.deepEqual(await m.settled, { code: null, signal: null, timedOut: false, aborted: true });
		await tick(150);
		assert.equal(fileExists(marker), false);
	} finally { cleanup(dir); }
});

// Compile-time: reading child without narrowing on spawned must not compile (checked by typecheck:tools, s7/t6).
export function _notReadableWithoutNarrowing(m: ReturnType<typeof spawnManaged>): void {
	// @ts-expect-error child exists only on the spawned branch
	void m.child;
}
