/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s4 / t4: the supervisor tracks a worker it did not start (the session
 * pool's), ending it at terminateAll and handling its error, and counts restarts against its
 * limit, shutting the daemon down past it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

import { Supervisor } from '../supervisor.js';

const supervisor = (opts: { now?: () => number; shutdown?: (reason: string) => void } = {}) =>
	new Supervisor({ services: {} as never, router: {} as never, shutdown: opts.shutdown ?? (() => {}), ...(opts.now !== undefined ? { now: opts.now } : {}) });

test('supervisor: a tracked worker is terminated by terminateAll and its error is logged', { timeout: 10_000 }, async () => {
	const s = supervisor();
	// One that runs until terminated, one that throws: an 'error' with no listener would throw on this thread.
	const idle = new Worker('setInterval(() => {}, 1000);', { eval: true });
	const failing = new Worker("throw new Error('the worker failed');", { eval: true });
	s.track(idle, 'session mcp:1');
	s.track(failing, 'shared-state');
	assert.equal(s.createdCount(), 2);
	await new Promise<void>(resolve => failing.once('exit', () => resolve()));
	assert.equal(s.createdCount(), 1, 'a tracked worker that exited leaves the created set; its error was handled, not thrown');
	const exited = new Promise<number>(resolve => idle.once('exit', resolve));
	await s.terminateAll();
	await exited;
	assert.equal(s.createdCount(), 0, 'terminateAll ended the tracked worker');
});

test("supervisor: the restart query refuses past 5 restarts in 60 s and runs the daemon's shutdown", () => {
	let now = 1_000;
	const reasons: string[] = [];
	const s = supervisor({ now: () => now, shutdown: r => reasons.push(r) });
	for (let i = 0; i < 5; i++) { assert.equal(s.allowRestart('shared-state'), true, `restart ${i + 1} allowed`); now += 1_000; }
	assert.deepEqual(reasons, []);
	assert.equal(s.allowRestart('shared-state'), false, 'the sixth within 60 s is refused');
	assert.deepEqual(reasons, ['the shared-state worker exceeded the restart limit']);

	// Restarts older than the window no longer count.
	const fresh = supervisor({ now: () => now, shutdown: r => reasons.push(r) });
	for (let i = 0; i < 5; i++) fresh.allowRestart('shared-state');
	now += 60_000;
	assert.equal(fresh.allowRestart('shared-state'), true, 'after the window the count starts again');
});
