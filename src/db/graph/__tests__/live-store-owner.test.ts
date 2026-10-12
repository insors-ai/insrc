/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Only a declared process may open the live graph store (Epic c2ba6fa6,
 * Story s4, t10): the daemon, which declares itself the owner, and — until
 * Story s11 — the MCP server, a permitted reader. Every other process that
 * opens and closes the live store can remove the daemon's locks.
 *
 * The home directory is pointed at a temporary one BEFORE the store module is
 * imported, so "the live store" here is a path inside that home.
 *
 * Run: npx tsx --test src/db/graph/__tests__/live-store-owner.test.ts
 */

import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-owner-'));
process.env['HOME'] = HOME;
const LIVE = join(HOME, '.insrc', 'graph.lmdb');
const CWD = process.cwd();

const store = await import('../store.js');
const {
	closeGraphStore, declareLiveStoreOwner, declareLiveStoreReaderUntilS11, getGraphStore,
	LmdbStoreError, LmdbStoreNotOwnerError, resetLiveStoreDeclarationsForTests, setGraphStorePath,
} = store;
const { PATHS } = await import('../../../shared/paths.js');

beforeEach(async () => {
	await closeGraphStore();
	resetLiveStoreDeclarationsForTests();
	setGraphStorePath(PATHS.lmdb);
	process.chdir(CWD);
});
after(async () => {
	await closeGraphStore();
	resetLiveStoreDeclarationsForTests();
	process.chdir(CWD);
	rmSync(HOME, { recursive: true, force: true });
});

function assertRefused(e: unknown): true {
	assert.ok(e instanceof LmdbStoreNotOwnerError, String(e));
	assert.ok(e instanceof LmdbStoreError);
	assert.match(e.message, /only the insrc daemon may open it/);
	assert.match(e.message, /setGraphStorePath/);
	return true;
}

/** Remove the live store between cases, so "no file is created" means this case. */
function removeLive(): void {
	rmSync(join(HOME, '.insrc'), { recursive: true, force: true });
}

test('owner check: default path with no declaration is refused and no file is created', async () => {
	assert.equal(PATHS.lmdb, LIVE, 'the live path is inside the temporary home');
	removeLive();
	await assert.rejects(getGraphStore(), assertRefused);
	assert.equal(existsSync(join(HOME, '.insrc')), false, 'not even the directory was created');
	// Asked again, still refused: nothing was half-initialised.
	await assert.rejects(getGraphStore(), assertRefused);
});

test('owner check: after the declaration the same open succeeds, also after a close and reopen', async () => {
	removeLive();
	declareLiveStoreOwner();
	const first = await getGraphStore();
	await first.meta.put('k', 'v');
	assert.ok(existsSync(LIVE));
	await closeGraphStore();
	const again = await getGraphStore();   // as a compaction does
	assert.equal(again.meta.get('k'), 'v');
	await closeGraphStore();
});

test('owner check: a temporary path opens without a declaration', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-owner-tmp-'));
	try {
		setGraphStorePath(join(dir, 'graph.lmdb'));
		const s = await getGraphStore();
		await s.meta.put('k', 'v');
		assert.equal(s.meta.get('k'), 'v');
		await closeGraphStore();
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('owner check: the live path as a relative path and through a symbolic link is refused', async () => {
	for (const liveExists of [false, true]) {
		removeLive();
		setGraphStorePath(PATHS.lmdb);
		if (liveExists) {
			declareLiveStoreOwner();
			await getGraphStore();
			await closeGraphStore();
			resetLiveStoreDeclarationsForTests();
		}

		// Relative, from the home directory and from inside .insrc.
		mkdirSync(join(HOME, '.insrc'), { recursive: true });
		process.chdir(HOME);
		setGraphStorePath(join('.insrc', 'graph.lmdb'));
		await assert.rejects(getGraphStore(), assertRefused);
		process.chdir(join(HOME, '.insrc'));
		setGraphStorePath('graph.lmdb');
		await assert.rejects(getGraphStore(), assertRefused);
		process.chdir(CWD);
		setGraphStorePath(relative(CWD, LIVE));
		await assert.rejects(getGraphStore(), assertRefused);

		// A link to the store file (dangling while the store does not exist yet).
		const elsewhere = mkdtempSync(join(tmpdir(), 'insrc-owner-link-'));
		try {
			symlinkSync(LIVE, join(elsewhere, 'graph.lmdb'));
			setGraphStorePath(join(elsewhere, 'graph.lmdb'));
			await assert.rejects(getGraphStore(), assertRefused);
			// A link to the directory that holds it.
			symlinkSync(join(HOME, '.insrc'), join(elsewhere, 'dir'));
			setGraphStorePath(join(elsewhere, 'dir', 'graph.lmdb'));
			await assert.rejects(getGraphStore(), assertRefused);
		} finally { rmSync(elsewhere, { recursive: true, force: true }); }

		const created = existsSync(join(HOME, '.insrc')) ? readdirSync(join(HOME, '.insrc')).filter(n => n.startsWith('graph.lmdb')) : [];
		assert.deepEqual(created, liveExists ? ['graph.lmdb', 'graph.lmdb-lock'] : [], 'a refused open creates nothing');
	}
});

test('owner check: permitted-reader only opens the live path; neither declaration is refused', async () => {
	removeLive();
	await assert.rejects(getGraphStore(), assertRefused);
	declareLiveStoreReaderUntilS11();
	const s = await getGraphStore();
	await s.meta.put('r', '1');
	assert.equal(s.meta.get('r'), '1');
	await closeGraphStore();
	resetLiveStoreDeclarationsForTests();
	await assert.rejects(getGraphStore(), assertRefused);
});

test('source scan: the permitted-reader function\'s name appears only at its definition: the MCP server no longer calls it (Story s11, t9)', () => {
	const SRC = fileURLToPath(new URL('../../../', import.meta.url));
	const NAME = 'declareLiveStoreReaderUntilS11';
	const hits: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const p = join(dir, entry);
			if (statSync(p).isDirectory()) { if (entry !== '__tests__' && entry !== 'node_modules' && entry !== 'assets') walk(p); continue; }
			if (!/\.(ts|tsx|mts)$/.test(entry)) continue;
			readFileSync(p, 'utf8').split('\n').forEach((line, i) => { if (line.includes(NAME)) hits.push(`${relative(SRC, p)}:${i + 1}`); });
		}
	};
	walk(SRC);
	// The MCP server's call went with its in-process step handlers; Story s11's t11 deletes the definition.
	assert.equal(hits.length, 1, hits.join('\n'));
	assert.ok(hits[0]!.startsWith('db/graph/store.ts:'), 'its definition');
});
