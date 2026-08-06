/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Orphan scan/kill service unit tests (Story s3, t3). Exercise scanOrphansWith /
 * killOrphansWith against injected ps-runner / kill / clock / platform / managed-pid
 * deps — NO real `ps`, no real process.kill, no real 3s wait.
 *
 * Run: npx tsx --test src/cli/services/__tests__/debug-orphans.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scanOrphansWith, killOrphansWith } from '../debug.js';
import type { OrphanScanDeps, OrphanKillDeps } from '../debug.js';
import * as debugImpl from '../debug.js';
import { makeServices } from '../index.js';

const ENTRY = '/home/u/.insrc/daemon/out/daemon/index.js';

function scanDeps(over: Partial<OrphanScanDeps> = {}): OrphanScanDeps {
	return {
		runPs: () => '',
		platform: 'darwin',
		managedPid: 4242,
		daemonEntry: ENTRY,
		...over,
	};
}

// --- scanOrphansWith ---------------------------------------------------------

test('scanOrphansWith: canned ps output returns ONLY the non-managed daemon-entry pid(s)', () => {
	const ps = [
		`  4242 node ${ENTRY} --serve`,        // the managed daemon — excluded
		`  5150 node ${ENTRY}`,                 // a genuine orphan — kept
		'  6001 node /some/other/app/main.js',  // unrelated node — dropped
		'  7002 /usr/bin/ps -axww',             // ps itself — dropped
	].join('\n');
	const res = scanOrphansWith(scanDeps({ runPs: () => ps }));
	assert.equal(res.supported, true);
	assert.ok(res.supported);
	assert.deepEqual(res.orphans.map(o => o.pid), [5150]);
	assert.match(res.orphans[0]!.command, /daemon\/index\.js/);
});

test("scanOrphansWith: platform 'win32' returns { supported:false } with no ps invoked", () => {
	let called = false;
	const res = scanOrphansWith(scanDeps({ platform: 'win32', runPs: () => { called = true; return ''; } }));
	assert.deepEqual(res, { supported: false });
	assert.equal(called, false);
});

test('scanOrphansWith: a throwing/garbled ps-runner degrades to { supported:true; orphans:[] }', () => {
	const res = scanOrphansWith(scanDeps({ runPs: () => { throw new Error('ps: command not found'); } }));
	assert.deepEqual(res, { supported: true, orphans: [] });
});

test('scanOrphansWith: managed pid undefined -> every matching daemon-entry process is a candidate', () => {
	const ps = [`  4242 node ${ENTRY} --serve`, `  5150 node ${ENTRY}`].join('\n');
	const res = scanOrphansWith(scanDeps({ managedPid: undefined, runPs: () => ps }));
	assert.ok(res.supported);
	assert.deepEqual(res.orphans.map(o => o.pid), [4242, 5150]);
});

// --- killOrphansWith ---------------------------------------------------------

interface KillLog { calls: Array<[number, NodeJS.Signals | 0]>; }

/** deps whose kill records every (pid,signal) and consults `alive` for the 0-probe. */
function killDeps(alive: (pid: number) => boolean, over: Partial<OrphanKillDeps> = {}): { deps: OrphanKillDeps; log: KillLog } {
	const log: KillLog = { calls: [] };
	const deps: OrphanKillDeps = {
		kill: (pid, signal) => {
			log.calls.push([pid, signal]);
			if (signal === 0 && !alive(pid)) {
				const err = new Error('no such process') as Error & { code?: string };
				err.code = 'ESRCH';
				throw err;
			}
		},
		wait: async () => {},
		platform: 'darwin',
		managedPid: 4242,
		...over,
	};
	return { deps, log };
}

test("killOrphansWith([p]) p dies on SIGTERM -> SIGTERM then liveness clears; 'terminated', no SIGKILL", async () => {
	const { deps, log } = killDeps(() => false); // dead after SIGTERM
	const out = await killOrphansWith([5150], deps);
	assert.deepEqual(out, [{ pid: 5150, result: 'terminated' }]);
	assert.deepEqual(log.calls, [[5150, 'SIGTERM'], [5150, 0]]);
	assert.ok(!log.calls.some(([, s]) => s === 'SIGKILL'));
});

test("killOrphansWith([p]) p survives -> SIGTERM then SIGKILL after the wait; 'forced'", async () => {
	const { deps, log } = killDeps(() => true); // still alive at the 0-probe
	const out = await killOrphansWith([5150], deps);
	assert.deepEqual(out, [{ pid: 5150, result: 'forced' }]);
	assert.deepEqual(log.calls, [[5150, 'SIGTERM'], [5150, 0], [5150, 'SIGKILL']]);
});

test('killOrphansWith([managedPid, p]) -> managed pid never signalled; only p processed', async () => {
	const { deps, log } = killDeps(() => false);
	const out = await killOrphansWith([4242, 5150], deps);
	assert.deepEqual(out, [{ pid: 4242, result: 'not-found' }, { pid: 5150, result: 'terminated' }]);
	assert.ok(!log.calls.some(([pid]) => pid === 4242)); // the managed daemon is never touched (k5)
});

test("killOrphansWith([p]) kill throws -> 'error'/'not-found', no re-throw, other pids still processed", async () => {
	const log: KillLog = { calls: [] };
	const deps: OrphanKillDeps = {
		kill: (pid, signal) => {
			log.calls.push([pid, signal]);
			if (pid === 5150 && signal === 'SIGTERM') {
				const err = new Error('operation not permitted') as Error & { code?: string };
				err.code = 'EPERM';
				throw err;
			}
			if (pid === 6001 && signal === 'SIGTERM') {
				const err = new Error('no such process') as Error & { code?: string };
				err.code = 'ESRCH';
				throw err;
			}
			// pid 7002: SIGTERM ok, 0-probe -> dead
			if (signal === 0) { const e = new Error('gone') as Error & { code?: string }; e.code = 'ESRCH'; throw e; }
		},
		wait: async () => {},
		platform: 'darwin',
		managedPid: 4242,
	};
	const out = await killOrphansWith([5150, 6001, 7002], deps);
	assert.deepEqual(out, [
		{ pid: 5150, result: 'error' },
		{ pid: 6001, result: 'not-found' },
		{ pid: 7002, result: 'terminated' },
	]);
});

test('killOrphansWith([]) -> no kill calls, resolves []; off-POSIX -> no-op', async () => {
	const { deps: empty, log: emptyLog } = killDeps(() => false);
	assert.deepEqual(await killOrphansWith([], empty), []);
	assert.equal(emptyLog.calls.length, 0);

	const { deps: win, log: winLog } = killDeps(() => true, { platform: 'win32' });
	assert.deepEqual(await killOrphansWith([5150], win), []);
	assert.equal(winLog.calls.length, 0);
});

// --- integration: the makeServices() facade binding ---------------------------

test('makeServices().debug exposes scanOrphans + killOrphans bound to the real impls', async () => {
	const { debug } = makeServices();
	assert.equal(debug.scanOrphans, debugImpl.scanOrphans); // bound to the real impl, not a stub
	assert.equal(debug.killOrphans, debugImpl.killOrphans);
	// killOrphans([]) short-circuits before any process.kill — safe to invoke here.
	assert.deepEqual(await debug.killOrphans([]), []);
});
