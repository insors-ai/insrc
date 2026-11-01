/**
 * Story s9, task t14: the repository ignore filter, the companion header's git user name and the convert plan's clean-tree check read git
 * through the tool registry and give what the git commands they replaced gave.
 * Run: npx tsx --test-force-exit src/workflow/__tests__/ignore-filter-header-plan-registry.test.ts
 */

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRepoIgnoreFilter } from '../../analyze/context/repo-ignore-filter.js';
import { _resetToolHooksForTests, registerToolHook } from '../../daemon/tools/hooks.js';
import { _resetRegistryForTests } from '../../daemon/tools/registry.js';
import { resolveReviewer } from '../artifacts/companion/header.js';
import { assertCleanTree } from '../convert/plan.js';
import { ConversionRefused } from '../convert/types.js';

const TOOLS = ['git_ls_files', 'git_config', 'git_rev_parse', 'git_cat_file', 'git_status'];
const calls: Array<{ tool: string; caller: string | undefined }> = [];
const dirs: string[] = [];
const savedEnv = { ...process.env };
beforeEach(() => {
	_resetRegistryForTests(); _resetToolHooksForTests(); calls.length = 0;
	for (const tool of TOOLS) registerToolHook({ id: `spy-${tool}`, toolId: tool, async run(ctx) { calls.push({ tool: ctx.toolId, caller: ctx.caller }); } });
	process.env['GIT_CONFIG_GLOBAL'] = '/dev/null'; process.env['GIT_CONFIG_NOSYSTEM'] = '1';   // only the repository's own configuration is read
});
afterEach(() => {
	_resetToolHooksForTests();
	process.env = { ...savedEnv };
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const git = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function repo(prefix = 'igp'): string {
	const dir = mkdtempSync(join(tmpdir(), `${prefix}-`)); dirs.push(dir);
	git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'commit.gpgsign', 'false');
	return dir;
}
const put = (dir: string, path: string, text = 'x\n'): void => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };

test('ignore-filter-header-plan-registry.test.ts: createRepoIgnoreFilter, defaultGitUserName and the convert plan reads run through the registry, with names containing spaces and newlines, a non-git directory and a git failure', async () => {
	// the ignore filter: tracked, untracked-not-ignored and ignored files, with awkward names
	const r = repo();
	put(r, '.gitignore', 'out/\n'); put(r, 'src/with space.ts'); put(r, 'src/new\nline.ts'); put(r, 'out/build.js'); put(r, 'src/fresh.ts');
	git(r, 'add', '.gitignore', 'src/with space.ts', 'src/new\nline.ts'); git(r, 'commit', '-q', '-m', 'init');
	const filter = await createRepoIgnoreFilter(r);
	assert.equal(filter.gitBacked, true);
	assert.equal(filter.isIncluded(join(r, 'src/with space.ts')), true, 'a name with a space');
	assert.equal(filter.isIncluded(join(r, 'src/new\nline.ts')), true, 'a name with a newline');
	assert.equal(filter.isIncluded(join(r, 'src/fresh.ts')), true, 'an untracked file that is not ignored');
	assert.equal(filter.isIncluded(join(r, 'out/build.js')), false, 'an ignored file');

	// a directory that is not a git repository, and a git that fails: the permissive filter
	const plain = mkdtempSync(join(tmpdir(), 'igp-plain-')); dirs.push(plain);
	assert.equal((await createRepoIgnoreFilter(plain)).gitBacked, false);
	const bin = mkdtempSync(join(tmpdir(), 'igp-bin-')); dirs.push(bin);
	const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
	writeFileSync(join(bin, 'git'), `#!/bin/sh\ncase "$*" in\n  *ls-files*) echo 'fatal: broken' >&2; exit 128 ;;\n  *) exec '${real}' "$@" ;;\nesac\n`); chmodSync(join(bin, 'git'), 0o755);
	const path = process.env['PATH']; process.env['PATH'] = `${bin}:${path}`;
	try { assert.equal((await createRepoIgnoreFilter(r)).gitBacked, false, 'a failed git ls-files degrades to the permissive filter'); } finally { process.env['PATH'] = path; }

	// the companion header's user: the repository's git user.name, else the OS user
	const named = repo('igp-named'); git(named, 'config', 'user.name', 'Ada Lovelace');
	assert.deepEqual(await resolveReviewer(named, { osUserName: () => 'osuser' }), { name: 'Ada Lovelace', source: 'git' });
	const unnamed = repo('igp-unnamed');
	assert.deepEqual(await resolveReviewer(unnamed, { osUserName: () => 'osuser' }), { name: 'osuser', source: 'os' });

	// the convert plan's clean-tree check
	await assert.rejects(assertCleanTree(plain), (e: unknown) => e instanceof ConversionRefused && /is not a git repository/.test(e.message));
	const clean = repo('igp-clean'); put(clean, 'README.md'); git(clean, 'add', '.'); git(clean, 'commit', '-q', '-m', 'init');
	await assertCleanTree(clean);
	put(clean, '.insrc/artifacts/DEF-1.json'); put(clean, 'docs/epics/e/DEF.md');
	for (let i = 0; i < 6; i += 1) put(clean, `docs/epics/e/x${i}.md`);
	await assert.rejects(assertCleanTree(clean), (e: unknown) => e instanceof ConversionRefused && /uncommitted changes under .insrc\/artifacts and docs\/epics/.test(e.message) && /and 3 more/.test(e.message));
	const merging = repo('igp-merge'); put(merging, 'a.txt'); git(merging, 'add', '.'); git(merging, 'commit', '-q', '-m', 'init');
	git(merging, 'checkout', '-q', '-b', 'side'); put(merging, 'b.txt'); git(merging, 'add', '.'); git(merging, 'commit', '-q', '-m', 'side');
	git(merging, 'checkout', '-q', 'main'); put(merging, 'c.txt'); git(merging, 'add', '.'); git(merging, 'commit', '-q', '-m', 'main');
	git(merging, 'merge', '--no-commit', '--no-ff', 'side');
	await assert.rejects(assertCleanTree(merging), (e: unknown) => e instanceof ConversionRefused && /a merge is in progress/.test(e.message));

	assert.ok(calls.length > 0 && calls.every(c => c.caller === 'workflow'), "every git call went through the registry as the workflow");
	for (const tool of TOOLS) assert.ok(calls.some(c => c.tool === tool), `${tool} was called`);
});

test('ignore-filter-header-plan-registry.test.ts: no execFileSync call remains in repo-ignore-filter.ts, header.ts and plan.ts', () => {
	const here = dirname(fileURLToPath(import.meta.url));
	for (const file of ['../../analyze/context/repo-ignore-filter.ts', '../artifacts/companion/header.ts', '../convert/plan.ts']) {
		assert.ok(!/execFileSync|execFile\(|spawnSync/.test(readFileSync(join(here, file), 'utf8')), `${file} spawns nothing itself`);
	}
});
