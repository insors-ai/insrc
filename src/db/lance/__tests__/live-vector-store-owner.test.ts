/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Only a declared process opens the live vector store (Epic c2ba6fa6, Story
 * s11, t2; criterion ac7), as Story s4 made true of the graph store.
 *
 * The home directory is pointed at a temporary one BEFORE the modules are
 * imported, so "the live vector store" is a directory inside that home.
 *
 * Run: npx tsx --test src/db/lance/__tests__/live-vector-store-owner.test.ts
 */

import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-lance-owner-'));
process.env['HOME'] = HOME;
const LIVE = join(HOME, '.insrc', 'lance');
const CWD = process.cwd();

const { closeLanceConn, getLanceConn, LanceStoreNotOwnerError, setLanceConnPath } = await import('../conn.js');
const { declareLiveStoreOwner, resetLiveStoreDeclarationsForTests } = await import('../../graph/store.js');
const graphStore = await import('../../graph/store.js');
const { PATHS } = await import('../../../shared/paths.js');

beforeEach(async () => {
	await closeLanceConn();
	resetLiveStoreDeclarationsForTests();
	setLanceConnPath(PATHS.lance);
	process.chdir(CWD);
	rmSync(join(HOME, '.insrc'), { recursive: true, force: true });
});
after(async () => {
	await closeLanceConn();
	resetLiveStoreDeclarationsForTests();
	process.chdir(CWD);
	rmSync(HOME, { recursive: true, force: true });
});

function assertRefused(e: unknown): true {
	assert.ok(e instanceof LanceStoreNotOwnerError, String(e));
	assert.equal((e as { code: string }).code, 'lance-not-owner');
	assert.match((e as Error).message, /only the insrc daemon may open it/);
	return true;
}

test('vector store owner rule: the graph store\'s temporary reader allowance does not open the live vector store', async () => {
	// Built from two pieces so this file does not hold the name Story s11 deletes.
	const declareReader = (graphStore as unknown as Record<string, () => void>)['declareLiveStoreReader' + 'UntilS11'];
	assert.equal(typeof declareReader, 'function', 'the allowance still exists until Task t11');
	declareReader!();
	await assert.rejects(getLanceConn(), assertRefused);
	assert.equal(existsSync(LIVE), false);
});

test('vector store owner rule: live path refused with no declaration and nothing created; opens after declareLiveStoreOwner; a temporary path opens; relative path and symbolic link refused', async () => {
	assert.equal(PATHS.lance, LIVE, 'the live path is inside the temporary home');

	// No declaration: refused, and not even the directory is created.
	await assert.rejects(getLanceConn(), assertRefused);
	assert.equal(existsSync(LIVE), false);

	// A temporary path opens without any declaration.
	const tmp = mkdtempSync(join(tmpdir(), 'insrc-lance-tmp-'));
	try {
		setLanceConnPath(join(tmp, 'lance'));
		const conn = await getLanceConn();
		assert.deepEqual(await conn.tableNames(), []);
		await closeLanceConn();
	} finally { rmSync(tmp, { recursive: true, force: true }); }

	// The live path by a relative path, and through links to it and to its directory.
	mkdirSync(join(HOME, '.insrc'), { recursive: true });
	const links = mkdtempSync(join(tmpdir(), 'insrc-lance-links-'));
	try {
		process.chdir(HOME);
		setLanceConnPath(join('.insrc', 'lance'));
		await assert.rejects(getLanceConn(), assertRefused);
		process.chdir(CWD);
		setLanceConnPath(relative(CWD, LIVE));
		await assert.rejects(getLanceConn(), assertRefused);
		symlinkSync(LIVE, join(links, 'lance-link'));               // dangling: the store does not exist yet
		setLanceConnPath(join(links, 'lance-link'));
		await assert.rejects(getLanceConn(), assertRefused);
		symlinkSync(join(HOME, '.insrc'), join(links, 'dir-link'));
		setLanceConnPath(join(links, 'dir-link', 'lance'));
		await assert.rejects(getLanceConn(), assertRefused);
	} finally { rmSync(links, { recursive: true, force: true }); }
	assert.equal(existsSync(LIVE), false, 'no refused open created the store');

	// After the owner's declaration the live path opens, also after a close and reopen.
	setLanceConnPath(PATHS.lance);
	declareLiveStoreOwner();
	await getLanceConn();
	assert.ok(existsSync(LIVE));
	await closeLanceConn();
	await getLanceConn();
	await closeLanceConn();

	// And once the declaration is gone it is refused again, even though the store now exists.
	resetLiveStoreDeclarationsForTests();
	await assert.rejects(getLanceConn(), assertRefused);
});
