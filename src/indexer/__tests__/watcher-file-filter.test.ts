/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s6/t7 — Watcher.addRepo's FileFilter post-filter: a
 * watcher-emitted event for a FileFilter-excluded file never reaches a
 * registered handler.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Watcher, type FileEvent } from '../watcher.js';
import { createFileFilter } from '../file-filter.js';

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
