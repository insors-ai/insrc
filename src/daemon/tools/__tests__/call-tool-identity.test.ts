/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t5: callTool runs only the definition it was passed, accepts every real git
 * definition and gh export, and cannot be fooled by a replacement registered over the same id.
 * Run: npx tsx --test src/daemon/tools/__tests__/call-tool-identity.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { gitDiffTool } from '../builtins/git/diff.js';
import { withFailureNet } from '../builtins/git/helpers.js';
import { registerGitTools } from '../builtins/git/index.js';
import { git, newRepo, toolDeps as gitDeps } from '../builtins/git/__tests__/_repo.js';
import { CASES } from '../builtins/gh/__tests__/_cases.js';
import { installFakeGh } from '../builtins/gh/__tests__/_fakegh.js';
import { ROWS } from '../builtins/gh/__tests__/_family-rows.js';
import { withGhFailureNet } from '../builtins/gh/helpers.js';
import { registerGhTools } from '../builtins/gh/index.js';
import * as ghIssue from '../builtins/gh/issue.js';
import * as ghProject from '../builtins/gh/project.js';
import * as ghRepo from '../builtins/gh/repo.js';
import * as ghActions from '../builtins/gh/actions.js';
import * as ghRelease from '../builtins/gh/release.js';
import { callTool } from '../call-tool.js';
import type { TypedTool } from '../call-tool.js';
import { _setApprovalGateForTests } from '../executor.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import type { ToolDeps, ToolResult } from '../types.js';
import { InSchema, OutSchema } from './_fakes.js';

afterEach(() => { _setApprovalGateForTests(undefined); _resetRegistryForTests(); });

const deps: ToolDeps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, approvalMode: 'auto' };
const OK = (n: number): ToolResult => ({ output: 'ok', format: 'text', success: true, data: { id: 'x', total: n } });

function typed(id: string, calls: { n: number }, total = 1): TypedTool {
	return { id, description: 'd', inputSchema: InSchema, outputSchema: OutSchema, async execute() { calls.n += 1; return OK(total); } } as TypedTool;
}
const REFUSED = /not the definition that was passed/;
const input = { name: 'a', count: 1 };

test('call-tool-identity.test.ts, real tools: every real git definition and gh export, a plain registered tool and a twice-wrapped one run', async () => {
	_resetRegistryForTests();
	registerGitTools(); registerGhTools();

	// git: the registered tool is a withFailureNet copy of the exported definition
	const repo = newRepo();
	try {
		writeFileSync(join(repo, 'a.txt'), 'one\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'first');
		writeFileSync(join(repo, 'a.txt'), 'two\n');
		const g = await callTool(gitDiffTool as never as TypedTool, { cwd: repo } as never, gitDeps(repo));
		assert.equal(g.success, true, g.output);
	} finally { rmSync(repo, { recursive: true, force: true }); }

	// gh: the exports ARE the registered objects; real recorded outputs through a fake gh
	const wanted = [ghProject.ghProjectListTool, ghIssue.ghIssueListTool, ghRepo.ghRepoViewTool, ghActions.ghRunListTool, ghRelease.ghReleaseListTool];
	for (const tool of wanted) {
		const row = CASES.find(c => c[0] === tool)!;
		assert.ok(row, `a recorded case exists for ${tool.id}`);
		const fake = installFakeGh('ok', row[2], row[3] === undefined ? undefined : { ...(row[3].json !== undefined ? { json: row[3].json } : {}) });
		try {
			const r = await callTool(tool, row[1] as never, deps);
			assert.equal(r.success, true, `${tool.id}: ${r.output}`);
		} finally { fake.restore(); }
	}
	// a defineGhFamily result: gh_issue_manage status
	const rowF = ROWS.find(r => r[0].id === 'gh_issue_manage' && r[1]['op'] === 'status')!;
	const fakeF = installFakeGh('ok', rowF[3]);
	try {
		const r = await callTool(rowF[0], rowF[1] as never, deps);
		assert.equal(r.success, true, r.output);
	} finally { fakeF.restore(); }

	// a plain registerTool(definition) runs; a definition wrapped twice runs when either level is passed
	const plainCalls = { n: 0 }; const plain = typed('ci_plain', plainCalls);
	registerTool(plain);
	assert.equal((await callTool(plain, input, deps)).success, true);
	const base = typed('ci_twice', { n: 0 });
	const once = withFailureNet(base) as TypedTool; const twice = withFailureNet(once) as TypedTool;
	registerTool(twice);
	assert.equal((await callTool(twice, input, deps)).success, true, 'the registered object itself');
	assert.equal((await callTool(once, input, deps)).success, true, 'the first wrapper');
	assert.equal((await callTool(base, input, deps)).success, true, 'the original definition');
});

test('call-tool-identity.test.ts, replacements: a spread replacement over the same id is refused, alone or behind a failure net, and its execute never runs', async () => {
	const original = typed('ci_target', { n: 0 });
	const replCalls = { n: 0 };
	const other = async (): Promise<ToolResult> => { replCalls.n += 1; return OK(99); };
	const variants: Array<[string, TypedTool]> = [
		['same schemas, other execute', { ...original, execute: other } as TypedTool],
		['other inputSchema only', { ...original, inputSchema: { ...InSchema } } as TypedTool],
		['other approval only', { ...original, approval: 'destructive', execute: other } as TypedTool],
		['other outputSchema only', { ...original, outputSchema: { ...OutSchema }, execute: other } as TypedTool],
	];
	for (const [label, replacement] of variants) {
		for (const wrap of ['none', 'git', 'gh'] as const) {
			_resetRegistryForTests();
			const registered = wrap === 'git' ? withFailureNet(replacement) : wrap === 'gh' ? withGhFailureNet(replacement) : replacement;
			registerTool(registered);
			const r = await callTool(original, input, deps);
			assert.equal(r.success, false, `${label} (${wrap})`);
			if (!r.success) {
				assert.equal(r.error.kind, 'rejected');
				assert.match(r.error.message, REFUSED);
				assert.match(r.error.message, /ci_target/);
			}
		}
	}
	assert.equal(replCalls.n, 0, 'no replacement execute ran');
});

test('call-tool-identity.test.ts, replacements: an overwritten gh export is refused for the original export, an unregistered id is refused, and the signature is unchanged', async () => {
	_resetRegistryForTests();
	registerGhTools();
	const original = ghIssue.ghIssueListTool;
	const replCalls = { n: 0 };
	registerTool({ ...original, async execute() { replCalls.n += 1; return OK(1); } } as TypedTool);
	const r = await callTool(original, {} as never, deps);
	assert.equal(r.success, false);
	assert.match(r.success ? '' : r.error.message, REFUSED);
	assert.equal(replCalls.n, 0);

	_resetRegistryForTests();
	const missing = await callTool(typed('ci_missing', { n: 0 }), input, deps);
	assert.equal(missing.success, false);
	assert.equal(missing.success ? '' : missing.error.kind, 'rejected');
	assert.match(missing.success ? '' : missing.error.message, /No tool registered/);
	assert.equal(callTool.length, 3, 'callTool still takes (tool, input, deps)');
});
