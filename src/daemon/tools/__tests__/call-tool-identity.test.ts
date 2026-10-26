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
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
import { isDefinitionOf } from '../provenance.js';
import { getTool } from '../registry.js';
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

/** Every export of the tool files in a directory that looks like a tool: a string id and an execute function. */
async function toolExports(dir: string, skip: readonly string[]): Promise<Array<[string, TypedTool]>> {
	const out: Array<[string, TypedTool]> = [];
	for (const file of readdirSync(dir).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts') && !skip.includes(n)).sort()) {
		const mod = await import(pathToFileURL(join(dir, file)).href) as Record<string, unknown>;
		for (const [name, value] of Object.entries(mod)) {
			const v = value as { id?: unknown; execute?: unknown } | null;
			if (v !== null && typeof v === 'object' && typeof v.id === 'string' && typeof v.execute === 'function') out.push([`${file}:${name}`, value as TypedTool]);
		}
	}
	return out;
}

test('call-tool-identity.test.ts, real tools: every exported git definition and every exported gh tool is the registered tool or a marked copy of it', async () => {
	const here = dirname(fileURLToPath(import.meta.url));
	_resetRegistryForTests();
	registerGitTools(); registerGhTools();
	const git = await toolExports(join(here, '../builtins/git'), ['index.ts', 'helpers.ts', 'coverage.ts', 'schemas.ts', 'parsers.ts']);
	const gh = await toolExports(join(here, '../builtins/gh'), ['index.ts', 'helpers.ts', 'coverage.ts', 'schemas.ts', 'parsers.ts', 'inputs.ts', 'convert.ts', 'op-table.ts']);
	assert.ok(git.length >= 34, `found ${git.length} git definitions`);
	assert.ok(gh.length >= 46, `found ${gh.length} gh tools`);
	for (const [where, tool] of [...git, ...gh]) {
		const registered = getTool(tool.id);
		assert.ok(registered !== undefined, `${where} (${tool.id}) is registered`);
		assert.equal(isDefinitionOf(registered!, tool), true, `${where} (${tool.id}) passes the provenance check`);
	}
});

test('call-tool-identity.test.ts, real tools: recorded runs of a git definition, five gh exports and a gh family, a plain registered tool and a twice-wrapped one run', async () => {
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
