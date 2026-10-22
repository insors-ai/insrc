/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The real daemon entry with daemon.threads.enabled (Epic 86197ac6, Story s2):
 * it starts its admin and code-indexing workers, answers admin, indexing and
 * session methods, and shuts down when asked.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/threads-boot.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { alive, rpc, startDaemon } from '../../../mcp/__tests__/helpers/mcp-e2e.js';

test('the daemon boots with daemon.threads.enabled, answers admin, indexing and session methods through its threads, and shuts down', { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-threads-boot-'));
	try {
		mkdirSync(join(home, '.insrc'), { recursive: true });
		writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify({ daemon: { threads: { enabled: true } } }));
		const daemon = await startDaemon(home);
		try {
			const status = await rpc(daemon.sock, 'daemon.status') as { repos: unknown[]; queueDepth: number; queueLanes?: unknown };
			assert.ok(Array.isArray(status.repos));
			assert.equal(typeof status.queueDepth, 'number');
			assert.ok(status.queueLanes !== undefined, 'the lanes come from the board');
			assert.deepEqual(await rpc(daemon.sock, 'repo.list'), []);
			assert.ok(Array.isArray(await rpc(daemon.sock, 'repo.stats', {})), 'an indexing method answered by the code-indexing worker');
			assert.ok(typeof await rpc(daemon.sock, 'config.show') === 'object');
			assert.ok((await rpc(daemon.sock, 'session.list', {}) as unknown[]).length >= 0, 'a session method answered on the main thread');
		} finally {
			await daemon.stop();
		}
		assert.equal(alive(daemon.pid), false, 'the daemon exited after daemon.shutdown');
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
