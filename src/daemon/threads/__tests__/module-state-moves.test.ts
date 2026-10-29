/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story 5d393a4b S001 / t6: module-scope state that needs one copy, over the real threaded daemon
 * (spawned under a temp HOME with daemon.threads.enabled and INSRC_TEST_HOOKS=1).
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/module-state-moves.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { once, spawnDaemon, stopDaemon } from './helpers/daemon-socket.js';
import type { SpawnedDaemon } from './helpers/daemon-socket.js';

const homes: string[] = [];
const daemons: SpawnedDaemon[] = [];
after(async () => {
	for (const d of daemons) await stopDaemon(d);
	for (const h of homes) rmSync(h, { recursive: true, force: true });
});
const daemon = async (): Promise<SpawnedDaemon> => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-module-state-'));
	homes.push(home);
	const d = await spawnDaemon(home, { daemon: { threads: { enabled: true } } });
	daemons.push(d);
	return d;
};
const threadOf = async (sock: string, client: { label: string; pid: number }): Promise<number> =>
	((await once(sock, 'test.servingThread', null, client)).result as { threadId: number }).threadId;

test('tool settings set by one session reach every session worker, those already running and those started later', { timeout: 120_000 }, async () => {
	const d = await daemon();
	const A = { label: 'mcp', pid: 9601 };
	const B = { label: 'codex', pid: 9602 };
	const a = await threadOf(d.sock, A);
	const set = await once(d.sock, 'tools.config.set', { 'loop.maxIterations': 7 }, A);
	assert.equal(set.error, undefined, `set: ${set.error ?? ''}`);
	const b = await threadOf(d.sock, B);
	assert.notEqual(a, b, 'two session workers');
	for (const client of [A, B]) {
		const got = (await once(d.sock, 'tools.config.get', {}, client)).result as { loop: { maxIterations: number } };
		assert.equal(got.loop.maxIterations, 7, `${client.label}'s worker sees the setting`);
	}
});
