/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t3: git_cat_file takes a lowerable timeoutMs (1 to 30000, default 30000).
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-cat-file-timeout.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { cleanup } from '../../../__tests__/_proc.js';
import { executeTool } from '../../../executor.js';
import { setShellTimeoutScaleForTests } from '../../../shell-helper.js';
import { gitCatFileTool } from '../cat-file.js';
import { registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { setShellTimeoutScaleForTests(undefined); standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined; });

const check = (timeoutMs: unknown) => validateAgainstSchema(gitCatFileTool.inputSchema as StructuredSchema, { rev: 'HEAD', timeoutMs }).ok;

test('git-cat-file-timeout.test.ts: timeoutMs accepts 1 to 30000 and rejects 0, 30001 and a non-integer, in the schema and in execute', async () => {
	for (const ok of [1, 5000, 30000]) assert.equal(check(ok), true, String(ok));
	for (const bad of [0, 30001, 1.5, '10', -1]) assert.equal(check(bad), false, String(bad));
	standIn = installStandInGit('echo never');
	for (const bad of [0, 30001, 1.5]) {
		const r = await gitCatFileTool.execute({ cwd: '/tmp', rev: 'HEAD', exists: true, timeoutMs: bad }, toolDeps('/tmp'));
		assert.equal(r.success, false);
		assert.equal(r.failure?.kind, 'rejected');
		assert.match(r.error ?? '', /timeoutMs must be an integer from 1 to 30000/);
	}
	assert.deepEqual(standIn.calls(), [], 'nothing ran for a refused timeoutMs');
});

test('git-cat-file-timeout.test.ts: without timeoutMs the limit is 30000 ms; a lower timeoutMs stops the read sooner and keeps the time-out failure', async () => {
	standIn = installStandInGit('sleep 30');
	setShellTimeoutScaleForTests(0.02);              // 30000 ms becomes 600 ms
	const t1 = Date.now();
	const dflt = await gitCatFileTool.execute({ cwd: '/tmp', rev: 'HEAD', exists: true }, toolDeps('/tmp'));
	const defaultMs = Date.now() - t1;
	const t2 = Date.now();
	const lower = await gitCatFileTool.execute({ cwd: '/tmp', rev: 'HEAD', exists: true, timeoutMs: 5000 }, toolDeps('/tmp')); // 100 ms
	const lowerMs = Date.now() - t2;
	assert.equal(dflt.success, false); assert.equal(lower.success, false);
	assert.equal(dflt.failure?.kind, 'timed-out');
	assert.equal(lower.failure?.kind, 'timed-out');
	assert.ok(defaultMs >= 500, `the default limit is the full 30000 ms (scaled): ${defaultMs}`);
	assert.ok(lowerMs < defaultMs - 200, `the lower limit stops it sooner: ${lowerMs} vs ${defaultMs}`);
});

test('git-cat-file-timeout.test.ts: the signal still applies on top of timeoutMs', async () => {
	standIn = installStandInGit('sleep 30');
	registerForTests();
	const c = new AbortController();
	setTimeout(() => c.abort(), 150);
	const t0 = Date.now();
	const r = await executeTool('git_cat_file', { cwd: '/tmp', rev: 'HEAD', exists: true, timeoutMs: 20_000 }, { ...toolDeps('/tmp'), signal: c.signal });
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	assert.ok(Date.now() - t0 < 150 + 2000 + 1500);
});
