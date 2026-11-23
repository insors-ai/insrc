/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How a daemon ends once its graph store has lost its locks (Epic c2ba6fa6,
 * Story s4, t7). Before this, a stop left the daemon hung for ever: both ends
 * of the shutdown called process.exit, whose exit hook in the store library
 * never returns in that state.
 *
 * The child process here is not a whole daemon, but what ends it is the
 * daemon's own code: createShutdown, reportFatal, the request server, the job
 * queue and the status builder, on a store broken by the real sequence.
 *
 * Run: npx tsx --test src/daemon/__tests__/shutdown-store-failure.test.ts
 */

import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import type { StoreHealth } from '../../db/graph/store.js';
import type { DaemonStatus } from '../../shared/types.js';
import { killAllStoreChildren, runLockLossSequence, spawnStoreChild } from '../../db/graph/__tests__/helpers/store-child-driver.js';
import type { StoreChild } from '../../db/graph/__tests__/helpers/store-child-driver.js';

// A short root: each child's request socket lives under it (path limit ~104 bytes).
const base = mkdtempSync('/tmp/insrc-shutdown-');
afterEach(() => { killAllStoreChildren(); });
after(() => {
	killAllStoreChildren();
	rmSync(base, { recursive: true, force: true });
});

const skip = process.platform === 'win32';

interface Home { home: string; store: string; log: string; crashDir: string; pid: string; sock: string; }
function tempHome(name: string): Home {
	const home = join(base, name);
	mkdirSync(join(home, '.insrc'), { recursive: true });
	return {
		home, store: join(home, 'graph.lmdb'), log: join(home, 'daemon.log'), crashDir: join(home, 'crash'),
		pid: join(home, '.insrc/daemon.pid'), sock: join(home, '.insrc/daemon.sock'),
	};
}

/** One request over the child's socket. Resolves with the answer, or with
 *  'closed' when the connection ends without one. */
function ask(sock: string, method: string, params: unknown = {}): Promise<{ result?: unknown; error?: string } | 'closed'> {
	return new Promise((resolve, reject) => {
		const c = createConnection(sock);
		let buf = '';
		// Never wait for ever on a process that neither answers nor ends.
		const timer = setTimeout(() => { c.destroy(); reject(new Error(`no answer to ${method} within 10 s`)); }, 10_000);
		c.on('connect', () => c.write(`${JSON.stringify({ id: 1, method, params })}\n`));
		c.on('data', d => {
			buf += String(d);
			const nl = buf.indexOf('\n');
			if (nl < 0) return;
			clearTimeout(timer);
			c.end();
			resolve(JSON.parse(buf.slice(0, nl)) as { result?: unknown; error?: string });
		});
		c.on('close', () => { clearTimeout(timer); resolve('closed'); });
		c.on('error', e => { clearTimeout(timer); reject(e); });
	});
}

async function becomeDaemon(child: StoreChild, h: Home): Promise<void> {
	const r = await child.send({ op: 'daemon-like', logPath: h.log, crashLogDir: h.crashDir });
	assert.ok(r.ok, r.ok ? '' : r.message);
	assert.ok(existsSync(h.sock), 'request socket is in place');
}

/** A child with a store broken by the real sequence, serving as a daemon. */
async function brokenDaemon(name: string): Promise<{ child: StoreChild; h: Home }> {
	const h = tempHome(name);
	const child = await runLockLossSequence(h.store, { env: { HOME: h.home } });
	await becomeDaemon(child, h);
	return { child, h };
}

test('status after failure: storeFailure names another process and does not contain \'semume\'', { skip }, async () => {
	const { child, h } = await brokenDaemon('status');
	const answer = await ask(h.sock, 'daemon.status');
	assert.notEqual(answer, 'closed');
	const status = (answer as { result: DaemonStatus }).result;
	assert.deepEqual(status.repos, [], 'answered, with an empty repository list');
	assert.equal(status.storeFailure?.kind, 'locks-lost');
	assert.equal(status.storeFailure?.operation, 'request daemon.status');
	assert.match(status.storeFailure?.cause ?? '', /Another process/);
	assert.doesNotMatch(JSON.stringify(status), /semume/);
	// It goes on answering.
	const again = await ask(h.sock, 'daemon.status');
	assert.equal((again as { result: DaemonStatus }).result.storeFailure?.kind, 'locks-lost');
	await child.kill();
});
