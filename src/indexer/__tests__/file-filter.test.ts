/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s6/t2 — createFileFilter / FileFilter.includes / .listFiles.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createFileFilter, proposeIgnoreFile, refreshFileFilter, type CheapTierModel } from '../file-filter.js';
import { readFileSync } from 'node:fs';

function makeGitRepo(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
	execFileSync('git', ['init', '-q'], { cwd: dir });
	execFileSync('git', ['config', 'user.email', 'x@x'], { cwd: dir });
	execFileSync('git', ['config', 'user.name', 'x'], { cwd: dir });
	execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
	return dir;
}

function commit(repo: string, msg: string): void {
	execFileSync('git', ['add', '-A'], { cwd: repo });
	execFileSync('git', ['commit', '-q', '-m', msg], { cwd: repo });
}

// ---------------------------------------------------------------------------
// ac1 — an anchored top-level rule does not shadow a same-named directory
// deeper in the tree
// ---------------------------------------------------------------------------

test('ac1: an anchored rule excludes the top-level directory it names, not a same-named directory deeper in the tree', () => {
	const repo = makeGitRepo('file-filter-ac1');
	try {
		writeFileSync(join(repo, '.gitignore'), '/out/\n', 'utf8');
		mkdirSync(join(repo, 'out'));
		writeFileSync(join(repo, 'out/a.js'), 'x', 'utf8');
		mkdirSync(join(repo, 'pkg/out'), { recursive: true });
		writeFileSync(join(repo, 'pkg/out/b.ts'), 'x', 'utf8');
		commit(repo, 'init');

		const f = createFileFilter(repo);
		assert.equal(f.includes(join(repo, 'out/a.js')), false, 'top-level out/ is excluded by the anchored rule');
		assert.equal(f.includes(join(repo, 'pkg/out/b.ts')), true, 'a same-named directory deeper in the tree is unaffected');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// ac2 — a tracked directory whose name is on the OLD built-in bare-name
// list, but that no ignore rule actually excludes, is indexed
// ---------------------------------------------------------------------------

test("ac2: a tracked directory named 'target' (an old built-in bare name) not matched by any ignore rule is included", () => {
	const repo = makeGitRepo('file-filter-ac2');
	try {
		writeFileSync(join(repo, '.gitignore'), '', 'utf8');
		mkdirSync(join(repo, 'target'));
		writeFileSync(join(repo, 'target/real-source.ts'), 'x', 'utf8');
		commit(repo, 'init');

		const f = createFileFilter(repo);
		assert.equal(f.includes(join(repo, 'target/real-source.ts')), true);
		assert.equal(f.includes(join(repo, 'target')), true);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// ac3 — a subdirectory .gitignore scopes to that subdirectory and below
// ---------------------------------------------------------------------------

test('ac3: a subdirectory .gitignore rule scopes to that subdirectory, excluding a same-named file elsewhere in the tree', () => {
	const repo = makeGitRepo('file-filter-ac3');
	try {
		writeFileSync(join(repo, '.gitignore'), '', 'utf8');
		mkdirSync(join(repo, 'pkg'));
		writeFileSync(join(repo, 'pkg/.gitignore'), 'generated.txt\n', 'utf8');
		writeFileSync(join(repo, 'pkg/generated.txt'), 'x', 'utf8');
		writeFileSync(join(repo, 'pkg/keep.ts'), 'x', 'utf8');
		mkdirSync(join(repo, 'other'));
		writeFileSync(join(repo, 'other/generated.txt'), 'x', 'utf8');
		commit(repo, 'init');

		const f = createFileFilter(repo);
		assert.equal(f.includes(join(repo, 'pkg/generated.txt')), false, 'excluded under the directory whose .gitignore names it');
		assert.equal(f.includes(join(repo, 'pkg/keep.ts')), true);
		assert.equal(f.includes(join(repo, 'other/generated.txt')), true, 'the same filename elsewhere in the tree is unaffected');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// ac9 baseline — a plain (non-git) folder with no ignore files: everything
// included except the two built-ins
// ---------------------------------------------------------------------------

test('ac9 baseline: a non-git folder with no ignore files includes every file (only the built-ins apply)', () => {
	const dir = mkdtempSync(join(tmpdir(), 'file-filter-ac9-'));
	try {
		mkdirSync(join(dir, 'src'));
		writeFileSync(join(dir, 'src/a.ts'), 'x', 'utf8');
		mkdirSync(join(dir, '.insrc'));
		writeFileSync(join(dir, '.insrc/config.json'), '{}', 'utf8');

		const f = createFileFilter(dir);
		assert.equal(f.includes(join(dir, 'src/a.ts')), true);
		assert.equal(f.includes(join(dir, '.insrc/config.json')), false, 'the .insrc built-in exclusion applies even without git');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a non-git folder with an ignore file is filtered by its rules alone (ac9)', () => {
	const dir = mkdtempSync(join(tmpdir(), 'file-filter-ac9-rules-'));
	try {
		writeFileSync(join(dir, '.gitignore'), '/build/\n', 'utf8');
		mkdirSync(join(dir, 'build'));
		writeFileSync(join(dir, 'build/out.js'), 'x', 'utf8');
		mkdirSync(join(dir, 'src'));
		writeFileSync(join(dir, 'src/a.ts'), 'x', 'utf8');

		const f = createFileFilter(dir);
		assert.equal(f.includes(join(dir, 'build/out.js')), false);
		assert.equal(f.includes(join(dir, 'src/a.ts')), true);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Built-in exclusions override even a tracked file
// ---------------------------------------------------------------------------

test('a tracked file under .insrc is excluded (built-in override, even over the tracked-file union)', () => {
	const repo = makeGitRepo('file-filter-builtin');
	try {
		mkdirSync(join(repo, '.insrc'));
		writeFileSync(join(repo, '.insrc/config.json'), '{}', 'utf8');
		writeFileSync(join(repo, 'src.ts'), 'x', 'utf8');
		commit(repo, 'init');

		const f = createFileFilter(repo);
		assert.equal(f.includes(join(repo, '.insrc/config.json')), false);
		assert.equal(f.includes(join(repo, 'src.ts')), true);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// listFiles()
// ---------------------------------------------------------------------------

test('listFiles() returns exactly the included files', () => {
	const repo = makeGitRepo('file-filter-listfiles');
	try {
		writeFileSync(join(repo, '.gitignore'), '/out/\n', 'utf8');
		mkdirSync(join(repo, 'src'));
		writeFileSync(join(repo, 'src/a.ts'), 'x', 'utf8');
		mkdirSync(join(repo, 'out'));
		writeFileSync(join(repo, 'out/a.js'), 'x', 'utf8');
		commit(repo, 'init');

		const f = createFileFilter(repo);
		const files = f.listFiles();
		assert.ok(files.includes(join(repo, 'src/a.ts')));
		assert.ok(files.includes(join(repo, '.gitignore')));
		assert.ok(!files.includes(join(repo, 'out/a.js')));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// refreshFileFilter (ac5) — an ignore-file edit takes effect live, without
// re-registering the repo
// ---------------------------------------------------------------------------

test('ac5: refreshFileFilter, given an ignore file that gained one rule and lost another, returns the correct left/entered sets', () => {
	const repo = makeGitRepo('file-filter-refresh');
	try {
		writeFileSync(join(repo, '.gitignore'), '/build/\n', 'utf8');
		mkdirSync(join(repo, 'build'));
		writeFileSync(join(repo, 'build/out.js'), 'x', 'utf8');
		writeFileSync(join(repo, 'keep.ts'), 'x', 'utf8');
		commit(repo, 'init');
		// Untracked, not covered by any rule yet — so a new /tmp/ rule can
		// actually exclude it (a TRACKED file would stay included by the
		// tracked-file union override, which is correct but not what this
		// case means to exercise).
		mkdirSync(join(repo, 'tmp'));
		writeFileSync(join(repo, 'tmp/scratch.txt'), 'x', 'utf8');

		const f = createFileFilter(repo);
		assert.equal(f.includes(join(repo, 'build/out.js')), false, 'excluded before the edit');
		assert.equal(f.includes(join(repo, 'tmp/scratch.txt')), true, 'included before the edit');

		// Lose the /build/ rule, gain a /tmp/ rule.
		const ignoreFile = join(repo, '.gitignore');
		writeFileSync(ignoreFile, '/tmp/\n', 'utf8');
		const change = refreshFileFilter(f, ignoreFile);

		assert.ok(change.left.includes(join(repo, 'tmp/scratch.txt')), 'newly excluded file is in left');
		assert.ok(change.entered.includes(join(repo, 'build/out.js')), 'newly included file is in entered');
		assert.equal(f.includes(join(repo, 'build/out.js')), true, 'includes() reflects the new rule content immediately');
		assert.equal(f.includes(join(repo, 'tmp/scratch.txt')), false);
		assert.equal(f.includes(join(repo, 'keep.ts')), true, 'untouched file is unaffected');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// proposeIgnoreFile
// ---------------------------------------------------------------------------

function modelStub(reply: string | Error): CheapTierModel {
	return {
		complete: async () => {
			if (reply instanceof Error) throw reply;
			return { text: reply, stopReason: 'end_turn' };
		},
	};
}

test('ac6: proposeIgnoreFile, given a repo with no root ignore file and a model stub that succeeds, writes the model-sourced file and returns {written:true, source:"model"}', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'file-filter-propose-ok-'));
	try {
		const result = await proposeIgnoreFile(dir, modelStub('node_modules/\ndist/\n'));
		assert.deepEqual(result, { written: true, source: 'model' });
		assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'node_modules/\ndist/\n');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('ac7/lc2: proposeIgnoreFile, given a model stub that throws, still writes a fallback ignore file and returns {written:true, source:"fallback", reason} without throwing', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'file-filter-propose-throw-'));
	try {
		const result = await proposeIgnoreFile(dir, modelStub(new Error('model unavailable')));
		assert.equal(result.written, true);
		assert.equal(result.source, 'fallback');
		assert.ok(result.reason !== undefined && result.reason.length > 0);
		const written = readFileSync(join(dir, '.gitignore'), 'utf8');
		assert.ok(written.includes('node_modules/'));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a malformed (prose) model response is treated as unusable and falls back, without throwing', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'file-filter-propose-malformed-'));
	try {
		const result = await proposeIgnoreFile(dir, modelStub('Sure! Here is a .gitignore for your project, hope that helps.'));
		assert.equal(result.written, true);
		assert.equal(result.source, 'fallback');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('ac8: proposeIgnoreFile given a repo whose root ignore file already exists leaves its bytes unchanged and never invokes the model', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'file-filter-propose-existing-'));
	try {
		const existing = '# my own rules\n/foo/\n';
		writeFileSync(join(dir, '.gitignore'), existing, 'utf8');
		let modelCalled = false;
		const model: CheapTierModel = { complete: async () => { modelCalled = true; return { text: 'x', stopReason: 'end_turn' }; } };

		const result = await proposeIgnoreFile(dir, model);
		assert.equal(result.written, false);
		assert.equal(modelCalled, false, 'the model must never be invoked when a root ignore file already exists');
		assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), existing, 'the existing file is byte-for-byte unchanged');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Error path 3 — git ls-files fails: tracked-file override degrades to
// empty, filter still works from ignore-file rules alone
// ---------------------------------------------------------------------------

test('error path: a broken .git directory degrades the tracked-file override to empty, not a throw', () => {
	const dir = mkdtempSync(join(tmpdir(), 'file-filter-broken-git-'));
	try {
		// A `.git` that is a plain file (not a real git repo) makes every
		// git subprocess call fail, exactly as a corrupted .git would.
		writeFileSync(join(dir, '.git'), 'not a real git dir', 'utf8');
		writeFileSync(join(dir, '.gitignore'), '/build/\n', 'utf8');
		mkdirSync(join(dir, 'build'));
		writeFileSync(join(dir, 'build/out.js'), 'x', 'utf8');
		writeFileSync(join(dir, 'src.ts'), 'x', 'utf8');

		assert.doesNotThrow(() => createFileFilter(dir));
		const f = createFileFilter(dir);
		assert.equal(f.includes(join(dir, 'src.ts')), true);
		assert.equal(f.includes(join(dir, 'build/out.js')), false, 'without a working tracked-file override, the ignore rule alone excludes it');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
