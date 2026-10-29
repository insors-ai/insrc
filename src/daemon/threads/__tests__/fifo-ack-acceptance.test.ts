/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-7c39e5cd, t5: over the real threaded daemon (spawned under a temp HOME with
 * daemon.threads.enabled and INSRC_TEST_HOOKS=1), one session's request on a second connection
 * starts only after its first request, whose socket closed while it ran, finished on the worker.
 *
 * test.order waits (it does not block its thread), so the worker could run both at once: only
 * the session's queue keeps them apart. Under the old rule the socket close moved the queue, so
 * the second started at the close, about FIRST_MS - CLOSE_AFTER_MS before the first ended.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/fifo-ack-acceptance.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Conn, once, spawnDaemon, stopDaemon } from './helpers/daemon-socket.js';
import type { SpawnedDaemon } from './helpers/daemon-socket.js';

const FIRST_MS = 2_000;
const CLOSE_AFTER_MS = 300;
/** Clock and scheduling slack; far below the FIRST_MS - CLOSE_AFTER_MS the old rule fell short by. */
const SLACK_MS = 100;

const homes: string[] = [];
const daemons: SpawnedDaemon[] = [];
after(async () => {
	for (const d of daemons) await stopDaemon(d);
	for (const h of homes) rmSync(h, { recursive: true, force: true });
});

test("fifo ack: the second connection's request starts only after the first, whose socket closed, has finished on the worker", { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-fifo-ack-'));
	homes.push(home);
	const d = await spawnDaemon(home, { daemon: { threads: { enabled: true } } });
	daemons.push(d);
	const A = { label: 'mcp', pid: 9501 };
	// The session's worker exists before the timed part.
	assert.equal((await once(d.sock, 'test.servingThread', null, A)).error, undefined);

	const first = await Conn.open(d.sock);
	const sentAt = Date.now();
	void first.ask('test.order', { ms: FIRST_MS, tag: 'first' }, A);
	await new Promise(r => setTimeout(r, CLOSE_AFTER_MS));
	first.close();
	const second = await once(d.sock, 'test.order', { ms: 0, tag: 'second' }, A);
	assert.equal(second.error, undefined, `answered: ${second.error ?? ''}`);
	const startedAt = (second.result as { startedAt: number }).startedAt;
	assert.ok(startedAt >= sentAt + FIRST_MS - SLACK_MS,
		`the second started ${startedAt - sentAt} ms after the first was sent; the first ran ${FIRST_MS} ms (the old rule started it at the close, ~${CLOSE_AFTER_MS} ms)`);
});
