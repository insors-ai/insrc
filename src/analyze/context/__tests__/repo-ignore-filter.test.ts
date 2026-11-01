/**
 * Unit tests for RepoIgnoreFilter.
 *
 * The filter is the analyze framework's shared source of truth for
 * "is this path gitignored?". Regressing it silently readmits build
 * artefacts into every structural-map bundle, so we cover the key
 * semantics here:
 *
 * 1. Root gitignore rule excludes matching subdirs
 * 2. Tracked file is included; ancestor directories are included
 * 3. Directory with no tracked descendant is excluded
 * 4. Non-git repo gets its ignore files' rules alone (Epic c2ba6fa6 s6 ac9)
 * 5. permissiveIgnoreFilter() helper for tests
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
	createRepoIgnoreFilter,
	permissiveIgnoreFilter,
} from '../repo-ignore-filter.js';

function makeGitRepo(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
	execFileSync('git', ['init', '-q'], { cwd: dir });
	execFileSync('git', ['config', 'user.email', 'x@x'], { cwd: dir });
	execFileSync('git', ['config', 'user.name',  'x'  ], { cwd: dir });
	execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
	return dir;
}

function commit(repo: string, msg: string): void {
	execFileSync('git', ['add', '-A'], { cwd: repo });
	execFileSync('git', ['commit', '-q', '-m', msg], { cwd: repo });
}

// ---------------------------------------------------------------------------
// Gitignored dirs
// ---------------------------------------------------------------------------

test('excludes directories matching a root .gitignore rule', () => {
	const repo = makeGitRepo('repo-ignore-out');
	try {
		writeFileSync(join(repo, '.gitignore'), '/out/\n', 'utf8');
		mkdirSync(join(repo, 'src'));
		writeFileSync(join(repo, 'src/a.ts'), 'export const x = 1;\n', 'utf8');
		mkdirSync(join(repo, 'out'));
		writeFileSync(join(repo, 'out/a.js'), '// compiled\n', 'utf8');
		commit(repo, 'init');

		const f = createRepoIgnoreFilter(repo);
		assert.equal(f.gitBacked, true);
		// tracked source
		assert.equal(f.isIncluded(join(repo, 'src/a.ts')), true);
		assert.equal(f.isIncluded(join(repo, 'src'))     , true);
		// build output (matched by /out/)
		assert.equal(f.isIncluded(join(repo, 'out'))     , false);
		assert.equal(f.isIncluded(join(repo, 'out/a.js')), false);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('every ancestor of a tracked file is considered included', () => {
	const repo = makeGitRepo('repo-ignore-ancestors');
	try {
		writeFileSync(join(repo, '.gitignore'), '', 'utf8');
		mkdirSync(join(repo, 'a/b/c'), { recursive: true });
		writeFileSync(join(repo, 'a/b/c/deep.ts'), 'export const y = 2;\n', 'utf8');
		commit(repo, 'init');

		const f = createRepoIgnoreFilter(repo);
		assert.equal(f.isIncluded(join(repo, 'a')),        true);
		assert.equal(f.isIncluded(join(repo, 'a/b')),      true);
		assert.equal(f.isIncluded(join(repo, 'a/b/c')),    true);
		assert.equal(f.isIncluded(join(repo, 'a/b/c/deep.ts')), true);
		// unrelated dir (not in the tree)
		assert.equal(f.isIncluded(join(repo, 'nonexistent')), false);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('respects a subdirectory .gitignore', () => {
	const repo = makeGitRepo('repo-ignore-nested');
	try {
		writeFileSync(join(repo, '.gitignore'), '', 'utf8');
		mkdirSync(join(repo, 'pkg'));
		writeFileSync(join(repo, 'pkg/keep.ts'), 'export const z = 3;\n', 'utf8');
		// nested .gitignore drops build/ under pkg
		writeFileSync(join(repo, 'pkg/.gitignore'), '/build/\n', 'utf8');
		mkdirSync(join(repo, 'pkg/build'));
		writeFileSync(join(repo, 'pkg/build/z.js'), '// compiled\n', 'utf8');
		commit(repo, 'init');

		const f = createRepoIgnoreFilter(repo);
		assert.equal(f.isIncluded(join(repo, 'pkg/keep.ts'))  , true);
		assert.equal(f.isIncluded(join(repo, 'pkg/build'))    , false);
		assert.equal(f.isIncluded(join(repo, 'pkg/build/z.js')), false);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Non-git fallback
// ---------------------------------------------------------------------------

test('ac9: a non-git folder gets its ignore files\' rules, the same answer as the equivalent git repository, not a permissive one', () => {
	const plain = mkdtempSync(join(tmpdir(), 'repo-ignore-nogit-'));
	const git = makeGitRepo('repo-ignore-ac9-git');
	try {
		const rels = ['src/a.ts', 'out/a.js', 'pkg/keep.ts', 'pkg/build/z.js', 'notes.log', 'src', 'out', 'pkg/build'];
		for (const root of [plain, git]) {
			writeFileSync(join(root, '.gitignore'), 'out/\n*.log\n', 'utf8');
			for (const d of ['src', 'out', 'pkg/build']) mkdirSync(join(root, d), { recursive: true });
			writeFileSync(join(root, 'pkg/.gitignore'), '/build/\n', 'utf8');
			for (const f of rels.filter(r => r.includes('.'))) writeFileSync(join(root, f), 'x\n', 'utf8');
		}

		const nonGit = createRepoIgnoreFilter(plain);
		const withGit = createRepoIgnoreFilter(git);
		assert.equal(nonGit.gitBacked, false);
		assert.equal(withGit.gitBacked, true);
		const answers = (f: ReturnType<typeof createRepoIgnoreFilter>, root: string) => rels.map(r => `${r}=${f.isIncluded(join(root, r))}`);
		assert.deepEqual(answers(nonGit, plain), answers(withGit, git));
		assert.deepEqual(answers(nonGit, plain), [
			'src/a.ts=true', 'out/a.js=false', 'pkg/keep.ts=true', 'pkg/build/z.js=false', 'notes.log=false', 'src=true', 'out=false', 'pkg/build=false',
		]);
	} finally {
		rmSync(plain, { recursive: true, force: true });
		rmSync(git, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// permissiveIgnoreFilter helper
// ---------------------------------------------------------------------------

test('permissiveIgnoreFilter is always-include', () => {
	const f = permissiveIgnoreFilter();
	assert.equal(f.gitBacked, false);
	assert.equal(f.isIncluded('/anywhere/at/all'), true);
	assert.equal(f.isIncluded('/proc/1'), true);
});

// ---------------------------------------------------------------------------
// include() sugar over isIncluded
// ---------------------------------------------------------------------------

test('include() returns only tracked items', () => {
	const repo = makeGitRepo('repo-ignore-include');
	try {
		writeFileSync(join(repo, '.gitignore'), '/out/\n', 'utf8');
		mkdirSync(join(repo, 'src'));
		writeFileSync(join(repo, 'src/a.ts'), 'x', 'utf8');
		mkdirSync(join(repo, 'out'));
		writeFileSync(join(repo, 'out/a.js'), 'x', 'utf8');
		commit(repo, 'init');

		const f = createRepoIgnoreFilter(repo);
		const items = [
			{ path: join(repo, 'src/a.ts'), n: 1 },
			{ path: join(repo, 'out/a.js'), n: 2 },
		];
		const kept = f.include(items);
		assert.equal(kept.length, 1);
		assert.equal(kept[0]!.n, 1);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
