/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t7 — one file-selection rule for the full index and the
 * cross-file pass. The predicate classes each file 'selected', 'not-code' or
 * 'excluded-by-ignore', and the full index selects exactly the files it
 * selected before, apart from the files the artifact parser skipped anyway.
 *
 * Run: npx tsx --test src/indexer/__tests__/file-selection.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { selectFile } from '../file-selection.js';
import { getParser } from '../parser/registry.js';
import { basenameParser } from '../parser/artifact.js';

useTemporaryLance();

const NOW = '2026-10-18T00:00:00.000Z';
const OVER = 256 * 1024 + 1;

let store: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s1t7-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s1t7-repo-')));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

function write(rel: string, text: string): string {
	const abs = join(repo, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, text, 'utf8');
	return abs;
}

test('the predicate classes a .png, a .min.js, a lock file and a JSON over 256 KB as not-code, a .ts under an ignored directory as excluded-by-ignore, and a .css and a .json under the limit as selected', () => {
	const ignore = ['build'];
	const cls = (rel: string, text = 'x') => selectFile(write(rel, text), repo, ignore);
	assert.equal(cls('assets/logo.png'), 'not-code');
	assert.equal(cls('vendor/lib.min.js', 'var a=1;'), 'not-code');
	assert.equal(cls('package-lock.json', '{}'), 'not-code');
	assert.equal(cls('data/big.json', `{"a":"${'x'.repeat(OVER)}"}`), 'not-code');
	assert.equal(cls('build/gen.ts', 'export const a = 1;'), 'excluded-by-ignore');
	assert.equal(cls('styles/site.css', 'a { color: red; }'), 'selected');
	assert.equal(cls('data/small.json', '{"a": 1}'), 'selected');
	assert.equal(cls('src/a.ts', 'export const a = 1;'), 'selected');
	// The artifact parser's limit is in characters: more bytes than the limit, fewer characters.
	assert.equal(cls('data/wide.json', `{"a":"${'é'.repeat(140 * 1024)}"}`), 'selected');
	// A file that is not code stays not-code under an ignored directory too.
	assert.equal(cls('build/logo.png'), 'not-code');
});

/** The full index's own choice before t7: a parser for the extension or basename, not generated or minified. */
const BEFORE_T7 = (file: string): boolean =>
	(getParser(file) !== null || basenameParser.handles(file))
	&& !/\.(min|bundle|dist|production|prod)\.(js|mjs|cjs|css|html|json)$|[-_]min\.(js|mjs|cjs|css)$/i.test(file);

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;

/** The real full index, recording each file it hands to the per-file step. */
class Probe extends IndexerService {
	readonly indexed: string[] = [];
	constructor() { super(null as unknown as DbClient, new IndexQueue(), watcher, undefined, 600_000); }
	protected override async indexFile(filePath: string): Promise<boolean> {
		this.indexed.push(relative(repo, filePath));
		return true;
	}
}

async function fullIndexSelection(): Promise<string[]> {
	await addRepo(null, { path: repo, name: 'fixture', addedAt: NOW, status: 'pending' });
	const svc = new Probe();
	await svc.processJob({ kind: 'full', repoPath: repo });
	return svc.indexed.sort();
}

test('the full index selects the same files as before on the full-index fixture of index-run-record (five .ts files)', async () => {
	const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map(f => write(join('src', f), `export const ${f[0]} = 1;\n`));
	const expected = files.filter(BEFORE_T7).map(f => relative(repo, f)).sort();
	assert.equal(expected.length, 5);
	assert.deepEqual(await fullIndexSelection(), expected);
});

test('on a mixed fixture the full index selects the files it selected before, less only the lock file and the oversized JSON the artifact parser skipped', async () => {
	const all = [
		write('src/a.ts', 'export const a = 1;\n'),
		write('src/b.py', 'def b():\n    return 1\n'),
		write('src/c.go', 'package c\n'),
		write('styles/site.css', 'a { color: red; }\n'),
		write('data/small.json', '{"a": 1}\n'),
		write('README.md', '# Title\n\ntext\n'),
		write('Dockerfile', 'FROM node:22\n'),
		write('assets/logo.png', 'png'),
		write('vendor/lib.min.js', 'var a=1;'),
		write('package-lock.json', '{}'),
		write('data/big.json', `{"a":"${'x'.repeat(OVER)}"}`),
	];
	const before = all.filter(BEFORE_T7).map(f => relative(repo, f)).sort();
	const now = await fullIndexSelection();
	assert.deepEqual(before.filter(f => !now.includes(f)).sort(), ['data/big.json', 'package-lock.json']);
	assert.deepEqual(now.filter(f => !before.includes(f)), [], 'nothing selected that was not before');
});
