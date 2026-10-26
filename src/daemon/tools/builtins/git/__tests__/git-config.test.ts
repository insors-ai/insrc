/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t7: git_config reads one config value.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-config.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { withEmptyPath } from '../../../__tests__/_bin.js';
import { cleanup } from '../../../__tests__/_proc.js';
import { resolveApprovalClass } from '../../../approval-policy.js';
import { setShellTimeoutScaleForTests } from '../../../shell-helper.js';
import { executeTool } from '../../../executor.js';
import { getTool } from '../../../registry.js';
import { gitConfigTool } from '../config.js';
import { git, newRepo, registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
let restore: (() => void) | undefined;
afterEach(() => { setShellTimeoutScaleForTests(undefined); standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined; restore?.(); restore = undefined; });

test('git-config.test.ts: exit 0 gives found true with the value trimmed, including an empty value, and the argv is git config --get key', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		git(repo, 'config', 'user.email', 'me@example.com');
		git(repo, 'config', 'empty.value', '');
		const r = await executeTool('git_config', { cwd: repo, key: 'user.email' }, toolDeps(repo));
		assert.equal(r.success, true, r.output);
		assert.deepEqual(r.data, { found: true, value: 'me@example.com' });
		const e = await executeTool('git_config', { cwd: repo, key: 'empty.value' }, toolDeps(repo));
		assert.deepEqual(e.data, { found: true, value: '' });
	} finally { rmSync(repo, { recursive: true, force: true }); }
	standIn = installStandInGit('echo v');
	await executeTool('git_config', { cwd: '/tmp', key: 'user.name' }, toolDeps('/tmp'));
	assert.deepEqual(standIn.calls(), ['config --get user.name']);
});

test('git-config.test.ts: exit 1 with empty stdout is a success with found false', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		const r = await executeTool('git_config', { cwd: repo, key: 'not.set' }, toolDeps(repo));
		assert.equal(r.success, true, r.output);
		assert.deepEqual(r.data, { found: false });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('git-config.test.ts: exit 128, and a spawn error, are failures with the kinds failureKind gives', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		writeFileSync(join(repo, '.git', 'config'), '[broken\n');
		const bad = await executeTool('git_config', { cwd: repo, key: 'user.name' }, toolDeps(repo));
		assert.equal(bad.success, false);
		assert.equal(bad.failure?.kind, 'rejected');
	} finally { rmSync(repo, { recursive: true, force: true }); }
	restore = withEmptyPath();
	const gone = await executeTool('git_config', { cwd: '/tmp', key: 'user.name' }, toolDeps('/tmp'));
	assert.equal(gone.success, false);
	assert.equal(gone.failure?.kind, 'missing-tool');
});

test('git-config.test.ts: a key that is not dotted, or starts with -, is rejected by the schema before anything runs; ceiling and class', async () => {
	registerForTests();
	standIn = installStandInGit('echo never');
	for (const key of ['nodots', '-x.y', 'a.b c', 'a.', '.a', 'a.b;rm', '']) {
		const r = await executeTool('git_config', { cwd: '/tmp', key }, toolDeps('/tmp'));
		assert.equal(r.success, false, key);
		assert.equal(r.failure?.kind, 'rejected', key);
	}
	assert.deepEqual(standIn.calls(), []);
	assert.equal(resolveApprovalClass(getTool('git_config')!, { key: 'user.name' }), 'none');
	assert.equal(gitConfigTool.approval, undefined);
});

/** The tool's own limit, as a ceiling: with every limit scaled down a sleeping git is stopped after about limit x scale. */
async function assertCeiling(run: () => Promise<{ success: boolean; failure?: { kind?: string } | undefined }>, limitMs: number): Promise<void> {
	const scale = 0.05;
	standIn = installStandInGit('sleep 30');
	setShellTimeoutScaleForTests(scale);
	const t0 = Date.now();
	const r = await run();
	const took = Date.now() - t0;
	setShellTimeoutScaleForTests(undefined);
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'timed-out');
	assert.ok(took >= limitMs * scale * 0.8 && took < limitMs * scale * 2 + 800, `stopped after ${took} ms, expected about ${limitMs * scale} ms`);
}

test('git-config.test.ts: the 5000 ms ceiling stops a sleeping git with a timed-out failure', async () => {
	registerForTests();
	await assertCeiling(() => executeTool('git_config', { cwd: '/tmp', key: 'user.name' }, toolDeps('/tmp')), 5_000);
});
