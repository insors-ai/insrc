/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s6/t7 — Watcher.addRepo's FileFilter post-filter: a
 * watcher-emitted event for a FileFilter-excluded file never reaches a
 * registered handler.
 *
 * s6/t10 — an ignore-file edit refreshes the filter before the rest of its
 * batch is judged, and the files it moves leave or enter the index (ac5).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DbClient } from '../../db/client.js';
import { IndexQueue } from '../../daemon/queue.js';
import { IndexerService } from '../index.js';
import { filterBatch, Watcher, type FileEvent } from '../watcher.js';
import { createFileFilter, type FileFilter } from '../file-filter.js';

/** Polls `check` until it is true or `timeoutMs` elapses. */
async function waitFor(check: () => boolean, timeoutMs = 4000): Promise<void> {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeoutMs) return;
		await new Promise(r => setTimeout(r, 50));
	}
}

test('a watcher-emitted event for a FileFilter-excluded file never reaches a registered handler, while one for an included file does', async () => {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-watcher-filter-')));
	try {
		writeFileSync(join(repo, '.gitignore'), '/out/\n', 'utf8');
		mkdirSync(join(repo, 'out'));
		mkdirSync(join(repo, 'src'));

		const filter = createFileFilter(repo);
		const watcher = new Watcher();
		const seen: FileEvent[] = [];
		watcher.onEvents(events => seen.push(...events));
		await watcher.addRepo(repo, filter);

		const excluded = join(repo, 'out', 'built.js');
		const included = join(repo, 'src', 'real.ts');
		writeFileSync(excluded, 'x', 'utf8');
		writeFileSync(included, 'x', 'utf8');

		await waitFor(() => seen.some(e => e.path === included));

		assert.ok(seen.some(e => e.path === included), 'the included file\'s event reached the handler');
		assert.ok(!seen.some(e => e.path === excluded), 'the excluded file\'s event never reached the handler');

		await watcher.close();
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// s6/t10: an ignore-file edit in the same batch as the files it moves
// ---------------------------------------------------------------------------

/** A git repository whose .gitignore leaves out a/, with a/x.ts and b/y.ts. */
function indexedRepo(): string {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s6t10-')));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	writeFileSync(join(repo, '.gitignore'), 'a/\n', 'utf8');
	for (const d of ['a', 'b']) mkdirSync(join(repo, d));
	writeFileSync(join(repo, 'a', 'x.ts'), 'x', 'utf8');
	writeFileSync(join(repo, 'b', 'y.ts'), 'y', 'utf8');
	return repo;
}

const sortEvents = (events: readonly FileEvent[], repo: string) =>
	events.map(e => `${e.type} ${e.path.slice(repo.length + 1)}`).sort();

test('ac5: an ignore-file edit that drops one rule and adds another, in one batch with edits to the files it moves, is judged by the new rules -- the newly covered file leaves, the uncovered one enters, once each', () => {
	const repo = indexedRepo();
	try {
		const filter = createFileFilter(repo);
		assert.equal(filter.includes(join(repo, 'a', 'x.ts')), false);

		writeFileSync(join(repo, '.gitignore'), 'b/\n', 'utf8');   // a/ no longer left out, b/ now is
		const out = filterBatch(filter, [
			{ type: 'update', path: join(repo, 'a', 'x.ts') },
			{ type: 'update', path: join(repo, 'b', 'y.ts') },
			{ type: 'update', path: join(repo, '.gitignore') },
		]);

		assert.deepEqual(sortEvents(out, repo), ['delete b/y.ts', 'update .gitignore', 'update a/x.ts']);
		assert.equal(filter.includes(join(repo, 'b', 'y.ts')), false, 'the filter itself now judges by the new rules');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('ac5: a file the removed rule covered enters the index even when the batch carries no event for it', () => {
	const repo = indexedRepo();
	try {
		const filter = createFileFilter(repo);
		writeFileSync(join(repo, '.gitignore'), '\n', 'utf8');
		const out = filterBatch(filter, [{ type: 'update', path: join(repo, '.gitignore') }]);
		assert.deepEqual(sortEvents(out, repo), ['create a/x.ts', 'update .gitignore']);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('a change to the clone\'s exclude file, which no event names, is found by its content and applied before the batch is judged', () => {
	const repo = indexedRepo();
	try {
		const filter = createFileFilter(repo);
		writeFileSync(join(repo, '.git', 'info', 'exclude'), 'b/\n', 'utf8');
		const out = filterBatch(filter, [{ type: 'update', path: join(repo, 'b', 'y.ts') }]);
		assert.deepEqual(sortEvents(out, repo), ['delete b/y.ts']);
		// Unchanged rules: a batch is passed through as it is, nothing added.
		writeFileSync(join(repo, 'c.ts'), 'c', 'utf8');
		assert.deepEqual(sortEvents(filterBatch(filter, [{ type: 'create', path: join(repo, 'c.ts') }]), repo), ['create c.ts']);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('the real watcher applies an ignore-file edit and an edit to a file it newly covers consistently in one pass', async () => {
	const repo = indexedRepo();
	try {
		const filter = createFileFilter(repo);
		const watcher = new Watcher();
		const seen: FileEvent[] = [];
		watcher.onEvents(events => seen.push(...events));
		await watcher.addRepo(repo, filter);

		writeFileSync(join(repo, '.gitignore'), 'b/\n', 'utf8');
		writeFileSync(join(repo, 'b', 'y.ts'), 'y2', 'utf8');
		await waitFor(() => seen.some(e => e.path === join(repo, 'a', 'x.ts')));
		await watcher.close();

		const byPath = (rel: string) => seen.filter(e => e.path === join(repo, rel)).map(e => e.type);
		assert.deepEqual(byPath('a/x.ts'), ['create'], 'the file the removed rule covered entered');
		assert.ok(byPath('b/y.ts').every(t => t === 'delete') && byPath('b/y.ts').length > 0, `the newly covered file only left: ${byPath('b/y.ts').join(',')}`);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('a full index or re-registration refreshes the filter the watcher holds, in place, instead of handing out a new one', async () => {
	const repo = indexedRepo();
	try {
		const held: FileFilter[] = [];
		const watcher = { onEvents() {}, async addRepo(_p: string, f: FileFilter) { held.push(f); }, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
		const svc = new IndexerService(null as unknown as DbClient, new IndexQueue(), watcher, undefined, 600_000);
		await svc.addRepo(repo);
		writeFileSync(join(repo, '.gitignore'), 'b/\n', 'utf8');
		await svc.addRepo(repo);

		assert.equal(held.length, 2);
		assert.equal(held[1], held[0], 'the same instance');
		assert.equal(held[0]!.includes(join(repo, 'b', 'y.ts')), false, 'refreshed to the new rules');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

