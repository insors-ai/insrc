/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t3: successive refresh-tool calls that share one deadline signal stop at the
 * deadline, kill the running command, and never start a call after it; a tool's own limit still stops a call first.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-shared-deadline.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { executeTool } from '../../../executor.js';
import { registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined; });

test('git-shared-deadline.test.ts: one deadline signal shared by successive calls kills the running command at the deadline and later calls never spawn', async () => {
	standIn = installStandInGit('sleep 0.3; echo refs/heads/main');
	registerForTests();
	const deadline = AbortSignal.timeout(800);
	const deps = { ...toolDeps('/tmp'), signal: deadline };
	const started = Date.now();
	const results = [];
	for (let i = 0; i < 5; i++) {
		results.push(await executeTool('git_symbolic_ref', { cwd: '/tmp', op: 'get', ref: 'HEAD' }, deps));
	}
	const took = Date.now() - started;
	assert.equal(results[0]!.success, true);
	assert.equal(results[1]!.success, true);
	assert.equal(results[2]!.success, false, 'the third call was running when the deadline fired');
	assert.equal(results[3]!.success, false);
	assert.equal(results[4]!.success, false);
	assert.equal(results[3]!.failure?.denial, 'cancelled', 'a call after the deadline is stopped by the executor');
	assert.equal(standIn.calls().length, 3, 'no git started after the deadline');
	assert.ok(took < 800 + 2000 + 1500, 'the whole sequence ended within the deadline plus the settlement bound');
});

test('git-shared-deadline.test.ts: a tool\'s own limit still stops a call first when it is shorter than the signal', async () => {
	standIn = installStandInGit('sleep 30');
	registerForTests();
	const deadline = AbortSignal.timeout(20_000);
	const t0 = Date.now();
	const r = await executeTool('git_cat_file', { cwd: '/tmp', rev: 'HEAD', exists: true, timeoutMs: 300 }, { ...toolDeps('/tmp'), signal: deadline });
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'timed-out');
	assert.ok(Date.now() - t0 < 300 + 2000 + 1500);
});
