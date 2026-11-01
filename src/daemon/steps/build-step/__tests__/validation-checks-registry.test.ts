/**
 * Story s9, task t13: the validation checks' git reads (the tracked files, the files a build changed, the trivial check plan) run through
 * the tool registry and return what the git commands they replaced return on the same repository. The oracle here is git itself, run by
 * the test with the old commands.
 * Run: npx tsx --test-force-exit src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts
 */

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _resetToolHooksForTests, registerToolHook } from '../../../tools/hooks.js';
import { _resetRegistryForTests } from '../../../tools/registry.js';
import { trackedFiles, trivialCheckPlan, withTypecheckProjects } from '../validation-checks.js';
import type { ValidationCheckPlan } from '../validation-checks.js';

const TOOLS = ['git_ls_files', 'git_diff', 'git_show'];
const calls: Array<{ tool: string; caller: string | undefined }> = [];
beforeEach(() => {
	_resetRegistryForTests(); _resetToolHooksForTests(); calls.length = 0;
	for (const tool of TOOLS) registerToolHook({ id: `spy-${tool}`, toolId: tool, async run(ctx) { calls.push({ tool: ctx.toolId, caller: ctx.caller }); } });
});
afterEach(() => { _resetToolHooksForTests(); });

const git = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const lines = (out: string): string[] => out.split('\n').filter(l => l.length > 0);
const isTest = (f: string): boolean => f.endsWith('.test.ts') && f.split('/').includes('__tests__');

function repo(): { dir: string; put(path: string, text?: string): void; commit(msg: string): void; cleanup(): void } {
	const dir = mkdtempSync(join(tmpdir(), 'validation-scn-'));
	git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 't'); git(dir, 'config', 'commit.gpgsign', 'false');
	return {
		dir,
		put: (path, text = 'x\n') => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); },
		commit: msg => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); },
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

test('validation-checks-registry.test.ts: trackedFiles, changedFiles and trivialCheckPlan return the old file lists including deleted and untracked files', async () => {
	const r = repo();
	try {
		r.put('src/a/__tests__/keep.test.ts'); r.put('src/a/__tests__/gone.test.ts'); r.put('src/a/code.ts'); r.put('plugin/tsconfig.json', '{}\n');
		r.put('with space.ts'); r.commit('base');
		const base = git(r.dir, 'rev-parse', 'HEAD').trim();
		r.put('src/a/__tests__/new.test.ts'); r.put('plugin/src/view.ts'); r.put('src/a/code.ts', 'changed\n');
		rmSync(join(r.dir, 'src/a/__tests__/gone.test.ts'));
		r.commit('build commit');
		// uncommitted: a tracked edit in another project and an untracked file in a third
		r.put('plugin2/tsconfig.json', '{}\n'); r.put('plugin3/tsconfig.json', '{}\n');
		git(r.dir, 'add', 'plugin2/tsconfig.json', 'plugin3/tsconfig.json'); git(r.dir, 'commit', '-q', '-m', 'projects');
		const afterProjects = git(r.dir, 'rev-parse', 'HEAD').trim();
		r.put('plugin2/x.ts'); git(r.dir, 'add', 'plugin2/x.ts'); git(r.dir, 'commit', '-q', '-m', 'x'); r.put('plugin2/x.ts', 'edited\n');   // tracked and modified
		r.put('plugin3/y.ts');                                                                                                          // untracked

		// the tracked files
		assert.deepEqual(await trackedFiles(r.dir), lines(git(r.dir, 'ls-files')), 'trackedFiles lists what git ls-files lists');

		// the trivial plan: the test files of the build, without the one it deleted
		const withBase = await trivialCheckPlan(r.dir, base);
		assert.deepEqual(withBase.testFiles, [...new Set(lines(git(r.dir, 'diff', '--name-only', '--diff-filter=d', base, 'HEAD')).filter(isTest))].sort());
		assert.ok(withBase.testFiles.includes('src/a/__tests__/new.test.ts') && !withBase.testFiles.includes('src/a/__tests__/gone.test.ts'), 'a deleted test file is not run');
		const noBase = await trivialCheckPlan(r.dir);
		assert.deepEqual(noBase.testFiles, [...new Set(lines(git(r.dir, 'show', '--name-only', '--diff-filter=d', '--format=', 'HEAD')).filter(isTest))].sort());

		// the files the build changed, seen through the projects that own them: committed, edited and untracked
		const empty: ValidationCheckPlan = { ...withBase, testFiles: [] };
		const projects = (await withTypecheckProjects(r.dir, empty, base)).typecheckProjects;
		assert.deepEqual(projects, ['plugin', 'plugin2', 'plugin3'], 'a committed file, a tracked edit and an untracked file each name their project');
		const headOnly = (await withTypecheckProjects(r.dir, empty)).typecheckProjects;
		assert.deepEqual(headOnly, ['plugin2', 'plugin3'], 'with no base, the HEAD commit, the edit and the untracked file count');
		void afterProjects;

		assert.ok(calls.length > 0 && calls.every(c => c.caller === 'workflow'), "every call went through the registry as the workflow");
		for (const tool of TOOLS) assert.ok(calls.some(c => c.tool === tool), `${tool} was called`);
	} finally { r.cleanup(); }
});

test('validation-checks-registry.test.ts: no execFileSync call remains in validation-checks.ts for git', () => {
	const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'validation-checks.ts'), 'utf8');
	assert.ok(!/execFileSync\(\s*'git'/.test(text) && !/execFileSync/.test(text.replace(/\/\*[\s\S]*?\*\//g, '')), 'validation-checks.ts runs no git itself');
});
