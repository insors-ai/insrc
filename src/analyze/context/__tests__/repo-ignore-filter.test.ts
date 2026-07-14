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
 * 4. Non-git repo falls back to permissive (matches indexer)
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

test('non-git repo returns a permissive filter that includes everything', () => {
	const dir = mkdtempSync(join(tmpdir(), 'repo-ignore-nogit-'));
	try {
		mkdirSync(join(dir, 'src'));
		writeFileSync(join(dir, 'src/a.ts'), 'export const x = 1;\n', 'utf8');
		mkdirSync(join(dir, 'out'));
		writeFileSync(join(dir, 'out/a.js'), '// junk\n', 'utf8');

		const f = createRepoIgnoreFilter(dir);
		assert.equal(f.gitBacked, false);
		assert.equal(f.isIncluded(join(dir, 'src/a.ts')), true);
		// Permissive fallback -- filter cannot know what's gitignored,
		// so downstream IGNORE_DIRS sets are the guard.
		assert.equal(f.isIncluded(join(dir, 'out/a.js')), true);
	} finally {
		rmSync(dir, { recursive: true, force: true });
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
