/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s4 / t6: acceptance over the real threaded daemon (spawned under a temp
 * HOME with daemon.threads.enabled and INSRC_TEST_HOOKS=1). ac1: routed requests leave the main
 * thread's handler runtime unbuilt; a connection-scoped request builds it and is answered. ac3:
 * SIGTERM and daemon.shutdown end with 'bye' and exit 0, the workers (session-pool workers
 * included) terminated before the stores close.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/s4-acceptance.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { once, spawnDaemon, stopDaemon, until } from './helpers/daemon-socket.js';
import type { SpawnedDaemon } from './helpers/daemon-socket.js';

const BUILT = 'handler runtime built on the main thread';
const CONFIG = { daemon: { threads: { enabled: true } } };
const homes: string[] = [];
const daemons: SpawnedDaemon[] = [];
const home = (): string => { const h = mkdtempSync(join(tmpdir(), 'insrc-s4-acceptance-')); homes.push(h); return h; };
after(async () => {
	for (const d of daemons) await stopDaemon(d);
	for (const h of homes) rmSync(h, { recursive: true, force: true });
});
const count = (text: string, line: string): number => text.split(line).length - 1;

test("s4 ac1: routed requests leave the main thread's handler runtime unbuilt; a connection-scoped request is answered and builds it", { timeout: 120_000 }, async () => {
	const d = await spawnDaemon(home(), CONFIG);
	daemons.push(d);
	const A = { label: 'mcp', pid: 9401 };
	// Admin, indexing and session requests: each served on its worker.
	for (const [method, params, client] of [
		['daemon.status', {}, undefined], ['repo.list', {}, undefined], ['daemon.debug-status', {}, undefined],
		['repo.stats', {}, undefined], ['test.servingThread', null, A], ['session.list', {}, A],
	] as const) {
		const r = await once(d.sock, method, params, client);
		assert.equal(r.error, undefined, `${method} answered: ${r.error ?? ''}`);
	}
	assert.equal(count(d.stderr(), BUILT), 0, "no routed request built the main thread's runtime");

	// A connection-management method stays on the main thread: it is answered there, and builds the runtime then.
	const conn = await once(d.sock, 'db.listDriverKinds', {});
	assert.equal(conn.error, undefined, `db.listDriverKinds answered: ${conn.error ?? ''}`);
	await until(() => count(d.stderr(), BUILT) === 1, 'the build logged once');
	assert.equal((await once(d.sock, 'db.listDriverKinds', {})).error, undefined);
	assert.equal(count(d.stderr(), BUILT), 1, 'a later local request reuses it');
});

test("s4 ac3: SIGTERM and daemon.shutdown exit 0 after 'bye' with every worker, session-pool workers included, terminated", { timeout: 180_000 }, async () => {
	for (const how of ['SIGTERM', 'daemon.shutdown'] as const) {
		const d = await spawnDaemon(home(), CONFIG);
		// Session-pool workers alive at the stop: two sessions and the unattributed worker, besides the shared-state one.
		assert.equal((await once(d.sock, 'test.servingThread', null, { label: 'mcp', pid: 9411 })).error, undefined);
		assert.equal((await once(d.sock, 'test.servingThread', null, { label: 'mcp', pid: 9412 })).error, undefined);
		assert.equal((await once(d.sock, 'test.servingThread', null)).error, undefined);
		let code: number | null;
		if (how === 'SIGTERM') code = await stopDaemon(d);
		else {
			assert.deepEqual((await once(d.sock, 'daemon.shutdown', {})).result, { ok: true });
			code = await d.exited;
		}
		const log = d.stderr();
		assert.equal(code, 0, `${how}: exit 0 (${log.slice(-1500)})`);
		const exited = log.indexOf("shutdown: the daemon's workers exited");
		const closed = log.indexOf('shutdown: stores closed');
		const bye = log.lastIndexOf('bye');
		assert.ok(exited >= 0 && closed > exited && bye > closed, `${how}: the workers exited, then the stores closed, then 'bye'`);
		assert.doesNotMatch(log, /supervisor: a worker failed|session pool: a session worker exited/, `${how}: no worker ended on its own`);
	}
});
