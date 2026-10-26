/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t2: git_cat_file (through runShellBytes) settles within the bound with a
 * stand-in git that starts a descendant holding the output pipes, on abort and on its time-out.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { setShellTimeoutScaleForTests } from '../../../shell-helper.js';
import { gitCatFileTool } from '../cat-file.js';
import { alive, cleanup, readPid, tmp, waitFor } from '../../../__tests__/_proc.js';

const dir = tmp();
const pidFile = join(dir, 'git.pid');
// A stand-in git that leaves a descendant in its group holding the pipes, then waits.
writeFileSync(join(dir, 'git'), `#!/bin/sh\nsleep 30 & echo $! > '${pidFile}'\nwait\n`);
chmodSync(join(dir, 'git'), 0o755);
const oldPath = process.env['PATH'];
process.env['PATH'] = `${dir}:${oldPath}`;
after(() => { process.env['PATH'] = oldPath; setShellTimeoutScaleForTests(undefined); cleanup(dir); });

const deps = (signal?: AbortSignal) => ({ sessionId: 's', repoPath: dir, send: () => {}, requestId: 1, ...(signal ? { signal } : {}) });

test('git-cat-file-tree-kill.test.ts: an abort kills the stand-in git and its descendant and returns a rejected failure within the bound', async () => {
	const c = new AbortController();
	setTimeout(() => c.abort(), 300);
	const t0 = Date.now();
	const r = await gitCatFileTool.execute({ cwd: dir, rev: 'HEAD', exists: true }, deps(c.signal));
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	assert.ok(Date.now() - t0 < 300 + 2000 + 1500);
	const pid = readPid(pidFile);
	assert.equal(await waitFor(() => !alive(pid)), true, 'the descendant is gone');
});

test('git-cat-file-tree-kill.test.ts: its time-out kills the stand-in git and its descendant and returns a failure within the bound', async () => {
	setShellTimeoutScaleForTests(0.01); // 30 s becomes 300 ms
	const t0 = Date.now();
	const r = await gitCatFileTool.execute({ cwd: dir, rev: 'HEAD', exists: true }, deps());
	setShellTimeoutScaleForTests(undefined);
	assert.equal(r.success, false);
	assert.ok(['timed-out', 'rejected'].includes(r.failure?.kind ?? ''), `kind ${r.failure?.kind}`);
	assert.ok(Date.now() - t0 < 300 + 2000 + 1500);
	const pid = readPid(pidFile);
	assert.equal(await waitFor(() => !alive(pid)), true, 'the descendant is gone');
});
