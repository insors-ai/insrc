/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s6/t12 — FileFilter conforms to real git. One fixture tree
 * of ignore rules (anchored, nested, negation, deeper-overrides-shallower,
 * directory-only, `**`, the clone's exclude file, a tracked file under an
 * ignored directory) is built as a real git repository; FileFilter's
 * in-process answers are compared with git's own `ls-files` and
 * `check-ignore` for every path. The same tree as a plain folder (no git)
 * must leave out the same files (ac9).
 *
 * Run: npx tsx --test src/indexer/__tests__/file-filter-git-conformance.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { createFileFilter, type FileFilter } from '../file-filter.js';

/** The rule files of the fixture, by repo-relative path. */
const RULES: Record<string, string> = {
	'.gitignore': [
		'/build/',          // ac1: anchored -- only the top-level build/
		'*.log',
		'!keep.log',        // negation re-includes a file
		'tmp/',             // directory-only, any depth
		'!tmp/keep.ts',     // git cannot re-include a file under an excluded directory
		'**/cache/**',      // globstar
		'secret.txt',
		'',
	].join('\n'),
	'pkg/.gitignore': [
		'/out/',            // ac3: scoped to pkg/
		'!secret.txt',      // a deeper rule overrides a shallower one
		'*.gen.ts',         // no separator: any depth below pkg/
		'gen/',             // directory-only, any depth below pkg/
		'a/skip.ts',        // a middle separator: relative to pkg/ only
		'',
	].join('\n'),
	'pkg/inner/.gitignore': '!*.log\n',   // re-includes logs under pkg/inner only
};

/** Every ordinary file of the fixture. */
const FILES = [
	'src/a.ts', 'src/build/b.ts', 'build/out.ts',
	'app.log', 'keep.log', 'pkg/inner/trace.log', 'pkg/inner/deep/x.log',
	'tmp/t.ts', 'src/tmp/t.ts', 'src/cache/c.ts', 'cache/d.ts',
	'secret.txt', 'pkg/secret.txt',
	'pkg/out/o.ts', 'out/o.ts', 'pkg/model.gen.ts', 'model.gen.ts',
	'excluded-by-clone.ts', 'vendor/forced.ts', 'readme.md',
	'tmp/keep.ts', 'pkg/deep/model.gen.ts', 'pkg/gen/g.ts', 'pkg/a/gen/g.ts', 'gen/g.ts',
	'pkg/a/skip.ts', 'pkg/b/a/skip.ts',
];

function writeTree(root: string): void {
	for (const [rel, body] of Object.entries(RULES)) {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), body, 'utf8');
	}
	for (const rel of FILES) {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), 'x\n', 'utf8');
	}
}

function gitRepo(): string {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s6t12-git-')));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	writeTree(repo);
	writeFileSync(join(repo, '.git', 'info', 'exclude'), 'excluded-by-clone.ts\nvendor/\n', 'utf8');
	execFileSync('git', ['add', '-f', 'vendor/forced.ts'], { cwd: repo });
	return repo;
}

/** What git itself includes: tracked files plus untracked files it does not ignore. */
function gitIncluded(repo: string): string[] {
	const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8' });
	return out.split('\0').filter(Boolean).sort();
}

/** git check-ignore's answer for one path (a tracked path is never reported ignored). */
function gitIgnores(repo: string, rel: string): boolean {
	return spawnSync('git', ['check-ignore', '-q', rel], { cwd: repo }).status === 0;
}

const listed = (filter: FileFilter, root: string): string[] => filter.listFiles().map(f => relative(root, f)).sort();

test('ac1/ac3: FileFilter lists exactly the files real git includes, over anchored, nested, negation, precedence, directory-only and globstar rules', () => {
	const repo = gitRepo();
	try {
		const expected = gitIncluded(repo);
		// The fixture exercises both sides of every rule: guard against a tree that proves nothing.
		for (const rel of ['src/build/b.ts', 'keep.log', 'pkg/inner/trace.log', 'pkg/secret.txt', 'out/o.ts', 'vendor/forced.ts']) assert.ok(expected.includes(rel), `git includes ${rel}`);
		for (const rel of ['gen/g.ts', 'pkg/b/a/skip.ts', 'pkg/inner/deep/x.log']) assert.ok(expected.includes(rel), `git includes ${rel}`);
		for (const rel of ['build/out.ts', 'app.log', 'tmp/t.ts', 'src/tmp/t.ts', 'src/cache/c.ts', 'secret.txt', 'pkg/out/o.ts', 'pkg/model.gen.ts', 'excluded-by-clone.ts']) assert.ok(!expected.includes(rel), `git leaves out ${rel}`);
		for (const rel of ['tmp/keep.ts', 'pkg/deep/model.gen.ts', 'pkg/gen/g.ts', 'pkg/a/gen/g.ts', 'pkg/a/skip.ts']) assert.ok(!expected.includes(rel), `git leaves out ${rel}`);

		assert.deepEqual(listed(createFileFilter(repo), repo), expected);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('FileFilter.includes agrees with git check-ignore for every file of the fixture, tracked override included', () => {
	const repo = gitRepo();
	try {
		const filter = createFileFilter(repo);
		const tracked = new Set(execFileSync('git', ['ls-files', '--cached', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean));
		const disagreements = [...FILES, ...Object.keys(RULES)]
			.map(rel => ({ rel, git: tracked.has(rel) || !gitIgnores(repo, rel), ours: filter.includes(join(repo, rel)) }))
			.filter(r => r.git !== r.ours)
			.map(r => `${r.rel}: git=${r.git} FileFilter=${r.ours}`);
		assert.deepEqual(disagreements, []);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('ac9: a non-git folder holding the same tree leaves out the same files its ignore files leave out in the git repository', () => {
	const repo = gitRepo();
	const plain = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s6t12-plain-')));
	try {
		writeTree(plain);
		// Without git there is no clone exclude file and no tracked override, so
		// the git answer to match is the .gitignore files' alone: drop those two.
		const fromIgnoreFiles = gitIncluded(repo).filter(rel => rel !== 'vendor/forced.ts');
		const expected = [...fromIgnoreFiles, 'excluded-by-clone.ts', 'vendor/forced.ts'].sort();

		assert.deepEqual(listed(createFileFilter(plain), plain), expected);
	} finally {
		rmSync(repo, { recursive: true, force: true });
		rmSync(plain, { recursive: true, force: true });
	}
});
