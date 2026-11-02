/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s8/t5: a git_patch op that writes a file the call names is destructive, the same op without one
 * is not, and a denial leaves the repository and the file as they were.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-patch.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanup } from '../../../__tests__/_proc.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import type { ApprovalDenial, ApprovalGate, ToolInput } from '../../../types.js';
import { GIT_PATCH_OPS, gitPatchTool } from '../patch.js';
import { registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
let dir: string | undefined;
afterEach(() => {
	_setApprovalGateForTests(undefined);
	standIn?.restore(); if (standIn) { cleanup(standIn.dir); } standIn = undefined;
	if (dir) { rmSync(dir, { recursive: true, force: true }); } dir = undefined;
});

const classOf = (input: ToolInput): string => (gitPatchTool.approval as (i: ToolInput) => string)(input);

test('git-patch.test.ts: an op writing a named file is destructive, the same op without one is not, and a denial leaves the file unchanged', async () => {
	const pairs: Array<[ToolInput, ToolInput, string]> = [
		[{ op: 'format-patch', range: 'HEAD~1', outputDirectory: '/tmp/out' }, { op: 'format-patch', range: 'HEAD~1' }, 'none'],
		[{ op: 'archive', rev: 'HEAD', output: '/tmp/a.tar' }, { op: 'archive', rev: 'HEAD' }, 'none'],
		[{ op: 'bundle', action: 'create', file: '/tmp/x.bundle', revs: ['main'] }, { op: 'bundle', action: 'verify', file: '/tmp/x.bundle' }, 'none'],
		[{ op: 'fast-export', all: true, exportMarks: '/tmp/marks' }, { op: 'fast-export', all: true }, 'none'],
		[{ op: 'diagnose', output: '/tmp/d' }, { op: 'diagnose' }, 'common'],
		[{ op: 'bugreport', output: '/tmp/d' }, { op: 'bugreport' }, 'common'],
	];
	for (const [writes, without, cls] of pairs) {
		assert.equal(classOf(writes), 'destructive', JSON.stringify(writes));
		assert.equal(classOf(without), cls, JSON.stringify(without));
	}
	assert.equal(GIT_PATCH_OPS.find(o => o.name === 'bugreport')?.env?.['GIT_EDITOR'], 'true', 'bugreport must not open an editor');
	assert.equal(classOf({ op: 'apply', patch: 'p', check: true }), 'none');
	assert.equal(classOf({ op: 'apply', patch: 'p' }), 'common');
	assert.equal(classOf({ op: 'am', mbox: 'm' }), 'common');

	registerForTests();
	standIn = installStandInGit('exit 0');
	dir = mkdtempSync(join(tmpdir(), 'insrc-patch-test-'));
	const file = join(dir, 'keep.bin');
	writeFileSync(file, 'keep');
	let asked = 0;
	const gate: ApprovalGate = { async ask() { asked += 1; return 'no-client' as ApprovalDenial; } };
	_setApprovalGateForTests(() => gate);
	for (const input of [{ op: 'archive', rev: 'HEAD', output: file }, { op: 'bundle', action: 'create', file, revs: ['main'] }, { op: 'fast-export', all: true, exportMarks: file }] as ToolInput[]) {
		const r = await executeTool('git_patch', { cwd: '/tmp', ...input }, toolDeps('/tmp'));
		assert.equal(r.success, false, JSON.stringify(input));
	}
	assert.equal(asked, 3, 'each asked');
	assert.deepEqual(standIn.calls(), [], 'git did not start');
	assert.equal(readFileSync(file, 'utf8'), 'keep', 'the file is unchanged');
});
