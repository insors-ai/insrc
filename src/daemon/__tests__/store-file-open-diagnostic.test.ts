/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon logs any open of the graph store's own files in its process,
 * with the call stack, once per distinct stack (Epic c2ba6fa6, Story s4, t11).
 * The code that drops the daemon's lock on the store is not identified; this
 * names it next time.
 *
 * The home directory is pointed at a temporary one BEFORE any module is
 * imported, so "the live store" is a pair of plain files inside that home.
 *
 * Run: npx tsx --test src/daemon/__tests__/store-file-open-diagnostic.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-open-diag-'));
process.env['HOME'] = HOME;
mkdirSync(join(HOME, '.insrc'), { recursive: true });
const LOCK = join(HOME, '.insrc', 'graph.lmdb-lock');
const DATA = join(HOME, '.insrc', 'graph.lmdb');
writeFileSync(LOCK, 'lock');
writeFileSync(DATA, 'data');

const { installStoreFileOpenDiagnostic, uninstallStoreFileOpenDiagnostic } = await import('../store-file-open-diagnostic.js');
type Report = import('../store-file-open-diagnostic.js').StoreFileOpenReport;

after(() => {
	uninstallStoreFileOpenDiagnostic();
	rmSync(HOME, { recursive: true, force: true });
});

// Two distinct call sites (each its own stack).
async function readLockHere(): Promise<void> { const fsp = await import('node:fs/promises'); await fsp.readFile(LOCK); }
async function readLockThere(): Promise<void> { const { promises } = await import('node:fs'); await promises.readFile(LOCK); }

test('diagnostic through the tools\' route: fs.promises.readFile of the lock file logs one warn line with a stack, once per stack', async () => {
	const reports: Report[] = [];
	installStoreFileOpenDiagnostic({ report: r => reports.push(r) });
	try {
		// The route the daemon's own tools use: fs.promises.readFile, imported by name.
		for (let i = 0; i < 3; i++) await readLockHere();
		assert.equal(reports.length, 1, 'one report for three opens from the same stack');
		assert.equal(reports[0]?.fn, 'fs.promises.readFile');
		assert.equal(reports[0]?.path, LOCK);
		assert.match(reports[0]?.stack ?? '', /readLockHere/, 'the stack names the caller');

		await readLockThere();
		assert.equal(reports.length, 2, 'a different stack is reported');
		assert.match(reports[1]?.stack ?? '', /readLockThere/);

		// Other open routes, the data file, and a link to the lock file.
		const fs = await import('node:fs');
		fs.readFileSync(DATA);
		fs.closeSync(fs.openSync(LOCK, 'r'));
		const link = join(HOME, 'link');
		symlinkSync(LOCK, link);
		await (await import('node:fs/promises')).readFile(link);
		assert.deepEqual(reports.slice(2).map(r => r.fn), ['fs.readFileSync', 'fs.openSync', 'fs.promises.readFile']);

		// Other files are not reported, and every open still proceeds.
		const other = join(HOME, 'other.txt');
		writeFileSync(other, 'x');
		assert.equal((await (await import('node:fs/promises')).readFile(other, 'utf8')), 'x');
		assert.equal(fs.readFileSync(LOCK, 'utf8'), 'lock');
		assert.equal(reports.length, 6, 'only the readFileSync just above is new');
	} finally { uninstallStoreFileOpenDiagnostic(); }

	// Removed: nothing is reported any more.
	const before = reports.length;
	await readLockThere();
	await (await import('node:fs/promises')).readFile(DATA);
	assert.equal(reports.length, before);
});

test('the default report is a warn line on the daemon log, with the stack', async () => {
	const { getLogger } = await import('../../shared/logger.js');
	const log = getLogger('store-file-open');
	const lines: unknown[][] = [];
	const original = log.warn.bind(log);
	(log as { warn: unknown }).warn = (...args: unknown[]) => { lines.push(args); };
	installStoreFileOpenDiagnostic();
	try {
		await readLockHere();
	} finally {
		uninstallStoreFileOpenDiagnostic();
		(log as { warn: unknown }).warn = original;
	}
	assert.equal(lines.length, 1);
	const [fields, message] = lines[0] as [{ path: string; stack: string; fn: string }, string];
	assert.equal(fields.path, LOCK);
	assert.match(fields.stack, /readLockHere/);
	assert.match(message, /can drop the daemon's lock/);
});
