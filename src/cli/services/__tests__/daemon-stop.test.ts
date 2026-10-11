/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Stop outcome unit tests (Epic c2ba6fa6, Story s4, t1). Drive stopDaemonWith
 * against a fake process table (alive / command line / kill) — NO real daemon,
 * no real signal, no real wait.
 *
 * Run: npx tsx --test src/cli/services/__tests__/daemon-stop.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeStop, stopDaemonWith } from '../daemon.js';
import type { StopDeps } from '../daemon.js';
import { restart } from '../maintenance.js';

const DAEMON_CMD = 'node --import tsx/esm /home/u/.insrc/daemon/out/daemon/index.js';
const NOT_RUNNING = 'daemon is not running — start it with: insrc daemon start';

interface Table {
	deps:    StopDeps;
	killed:  Array<{ pid: number; signal: string }>;
	removed: number;
	waits:   number[];
}

/** A fake process table holding ONE process (the pid in the pid file). */
function table(opts: {
	pid?:        number | undefined;
	command?:    string | undefined;
	alive?:      boolean;
	stopsItself?: boolean;
	diesOnKill?: boolean;
	request?:    () => Promise<'replied' | 'no-reply'>;
}): Table {
	let alive = opts.alive ?? true;
	const t: Table = { killed: [], removed: 0, waits: [], deps: undefined as unknown as StopDeps };
	t.deps = {
		requestShutdown: opts.request ?? (async () => 'replied'),
		waitForStop: async ms => {
			t.waits.push(ms);
			if (opts.stopsItself === true) { alive = false; return true; }
			return false;
		},
		pidFromFile: () => opts.pid,
		pidAlive:    pid => pid === opts.pid && alive,
		commandLine: () => opts.command,
		kill: (pid, signal) => {
			t.killed.push({ pid, signal });
			if (opts.diesOnKill !== false) alive = false;
		},
		removeRunFiles: () => { t.removed++; },
		sleep: async () => {},
		replyBoundMs: 5_000,
		stopWaitMs:   30_000,
		killWaitMs:   0,
	};
	return t;
}

test('stop outcome with an injected process table: stops by itself, forced after the wait, pid not a daemon, pid survives the kill', async () => {
	// Stops by itself: no kill, nothing removed by us.
	const self = table({ pid: 71, command: DAEMON_CMD, stopsItself: true });
	assert.deepEqual(await stopDaemonWith(self.deps), { stopped: true, forced: false });
	assert.deepEqual(self.killed, []);
	assert.equal(self.removed, 0);
	assert.deepEqual(self.waits, [30_000]);

	// Does not stop: killed only AFTER the wait, files removed, pid reported.
	const forced = table({ pid: 72, command: DAEMON_CMD });
	const order: string[] = [];
	const wait = forced.deps.waitForStop;
	const kill = forced.deps.kill;
	const out = await stopDaemonWith({
		...forced.deps,
		waitForStop: async ms => { order.push('wait'); return wait(ms); },
		kill: (pid, signal) => { order.push('kill'); kill(pid, signal); },
	});
	assert.deepEqual(out, { stopped: true, forced: true, pid: 72 });
	assert.deepEqual(order, ['wait', 'kill']);
	assert.deepEqual(forced.killed, [{ pid: 72, signal: 'SIGKILL' }]);
	assert.equal(forced.removed, 1);

	// The pid is not a daemon: nothing killed.
	const other = table({ pid: 73, command: '/usr/bin/vim notes.txt' });
	await assert.rejects(stopDaemonWith(other.deps), /pid 73 .*not a daemon process/);
	assert.deepEqual(other.killed, []);

	// The pid survives the kill: throws naming it, pid file left in place.
	const immortal = table({ pid: 74, command: DAEMON_CMD, diesOnKill: false });
	await assert.rejects(stopDaemonWith(immortal.deps), /pid 74\).*still alive after SIGKILL/);
	assert.deepEqual(immortal.killed, [{ pid: 74, signal: 'SIGKILL' }]);
	assert.equal(immortal.removed, 0);
});

test("stop outcome: no socket and no live pid rejects with 'daemon is not running'", async () => {
	const refuse = async (): Promise<never> => { throw new Error(NOT_RUNNING); };
	// No pid file at all.
	const none = table({ pid: undefined, request: refuse });
	await assert.rejects(stopDaemonWith(none.deps), /daemon is not running/);
	// A stale pid file naming a dead process.
	const stale = table({ pid: 75, alive: false, command: DAEMON_CMD, request: refuse });
	await assert.rejects(stopDaemonWith(stale.deps), /daemon is not running/);
	for (const t of [none, stale]) {
		assert.deepEqual(t.waits, [], 'rejects before any wait');
		assert.deepEqual(t.killed, []);
		assert.equal(t.removed, 0);
	}
});

test('stop outcome: a live pid whose command line does not match is not killed and its pid file is kept', async () => {
	for (const command of ['/usr/bin/python3 server.py', 'node /x/daemon/index.js.bak', undefined]) {
		const t = table({ pid: 76, command });
		await assert.rejects(stopDaemonWith(t.deps), (err: Error) => {
			assert.match(err.message, /pid 76/);
			assert.ok(err.message.includes(command ?? 'unreadable'), 'names the command line');
			return true;
		});
		assert.deepEqual(t.killed, []);
		assert.equal(t.removed, 0, 'pid file and socket are left in place');
	}
});

test('stop outcome: a refused connection with a LIVE daemon pid goes on to the wait and the kill', async () => {
	const t = table({ pid: 77, command: DAEMON_CMD, request: async () => { throw new Error(NOT_RUNNING); } });
	assert.deepEqual(await stopDaemonWith(t.deps), { stopped: true, forced: true, pid: 77 });
	assert.deepEqual(t.waits, [30_000]);
});

test('stop outcome: no reply within the bound goes on to the wait and the kill', async () => {
	const bounds: number[] = [];
	const t = table({ pid: 78, command: DAEMON_CMD });
	const out = await stopDaemonWith({ ...t.deps, requestShutdown: async ms => { bounds.push(ms); return 'no-reply'; } });
	assert.deepEqual(out, { stopped: true, forced: true, pid: 78 });
	assert.deepEqual(bounds, [5_000]);
});

test('stop outcome: a kill that throws for a live process fails naming the pid and removes nothing', async () => {
	const t = table({ pid: 79, command: DAEMON_CMD });
	const deps: StopDeps = { ...t.deps, kill: () => { throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' }); } };
	await assert.rejects(stopDaemonWith(deps), /pid 79\).*SIGKILL failed: kill EPERM/);
	assert.equal(t.removed, 0);
});

test("restart: steps include 'force-stop' after a forced stop and the start follows", async () => {
	const log: string[] = [];
	const calls: string[] = [];
	const start = async () => { calls.push('start'); return { started: true, logPath: '', alreadyRunning: false, pid: 9 }; };

	const forced = await restart(l => log.push(l), {
		stopDaemon: async () => { calls.push('stop'); return { stopped: true, forced: true, pid: 80 }; },
		startDaemon: start,
	});
	assert.deepEqual(forced, { ok: true, steps: ['stop', 'force-stop', 'start'] });
	assert.deepEqual(calls, ['stop', 'start']);
	assert.ok(log.some(l => l.includes('killed (pid 80)')), 'the forced stop is logged');

	const clean = await restart(() => {}, { stopDaemon: async () => ({ stopped: true, forced: false }), startDaemon: start });
	assert.deepEqual(clean, { ok: true, steps: ['stop', 'start'] });

	calls.length = 0;
	const failed = await restart(() => {}, { stopDaemon: async () => { throw new Error('pid 81 is not a daemon process'); }, startDaemon: start });
	assert.deepEqual(failed, { ok: false, steps: ['stop'], error: 'pid 81 is not a daemon process' });
	assert.deepEqual(calls, [], 'no start after a stop that failed');
});

test('describeStop: says when the daemon was killed', () => {
	assert.equal(describeStop({ stopped: true, forced: false }), 'daemon stopped');
	assert.equal(describeStop({ stopped: true, forced: true, pid: 5 }), 'daemon did not stop by itself; killed (pid 5)');
});
