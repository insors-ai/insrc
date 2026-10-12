/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test files that used to open the vector store at its DEFAULT path — the
 * daemon's live ~/.insrc/lance — because they gave the graph store a
 * temporary path but not the vector store (Epic c2ba6fa6, Story s11, t2).
 *
 * Each is run here in its own temporary home, so that "the default path" is
 * inside that home. The file must pass, and no vector store may appear there.
 *
 * Run: npx tsx --test src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const homes: string[] = [];
after(() => { for (const h of homes) rmSync(h, { recursive: true, force: true }); });

function runInTemporaryHome(file: string): { status: number | null; pass: number; fail: number; lance: boolean; out: string } {
	const home = mkdtempSync(join(tmpdir(), 'insrc-no-live-lance-'));
	homes.push(home);
	// A test runner started from inside a test runs nothing unless this is cleared.
	const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
	delete env['NODE_TEST_CONTEXT'];
	const r = spawnSync(process.execPath, ['--import', 'tsx/esm', '--test', '--test-force-exit', '--test-reporter=tap', file], {
		cwd: REPO, env, encoding: 'utf8', timeout: 180_000,
	});
	const out = `${r.stdout}${r.stderr}`;
	const count = (label: string): number => Number(new RegExp(`^# ${label} (\\d+)$`, 'm').exec(out)?.[1] ?? -1);
	return { status: r.status, pass: count('pass'), fail: count('fail'), lance: existsSync(join(home, '.insrc', 'lance')), out };
}

const REPAIRED = [
	'src/config/__tests__/store-lmdb.test.ts',
	'src/db/__tests__/delete-entities-by-id.test.ts',
	'src/db/__tests__/doc-summaries-lmdb.test.ts',
	'src/db/__tests__/conversations-lmdb.test.ts',
	'src/db/__tests__/reindex-file-lmdb.test.ts',
	'src/db/__tests__/entities-lmdb.test.ts',
	'src/db/__tests__/repos-lmdb.test.ts',
	'src/db/graph/__tests__/derived-indices.test.ts',
	'src/indexer/__tests__/messaging-endpoints.test.ts',
	'src/indexer/__tests__/external-endpoints.test.ts',
];

test('no test opens the live vector store: each repaired test file run in a temporary home leaves no lance directory', () => {
	for (const file of REPAIRED) {
		const r = runInTemporaryHome(file);
		assert.equal(r.status, 0, `${file} passes\n${r.out.slice(-2000)}`);
		assert.ok(r.pass > 0, `${file} ran its tests`);
		assert.equal(r.fail, 0);
		assert.equal(r.lance, false, `${file} created no vector store at the default path`);
		assert.doesNotMatch(r.out, /LanceStoreNotOwnerError/, `${file} was not refused`);
	}
});

test('the check sees a vector store that IS opened at the default path', () => {
	const r = runInTemporaryHome('src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts');
	assert.equal(r.status, 0, r.out.slice(-2000));
	assert.equal(r.lance, true);
});
