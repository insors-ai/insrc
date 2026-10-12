/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's file and search tools refuse the live graph store's own files
 * (Epic c2ba6fa6, Story s4, t11): opening and closing a descriptor on the lock
 * file inside the daemon drops the daemon's lock on the store. Each tool's own
 * execute is called, by direct path and through a symbolic link.
 *
 * The home directory is pointed at a temporary one BEFORE any module is
 * imported, so "the live store" is a pair of files inside that home.
 *
 * Run: npx tsx --test src/daemon/tools/builtins/file/__tests__/live-store-file-refusal.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-tool-refusal-'));
process.env['HOME'] = HOME;
const INSRC = join(HOME, '.insrc');
mkdirSync(INSRC, { recursive: true });
const DATA = join(INSRC, 'graph.lmdb');
const LOCK = join(INSRC, 'graph.lmdb-lock');
// Plain files stand in for the store: nothing here opens it through the library.
writeFileSync(DATA, 'DATA-NEEDLE\n');
writeFileSync(LOCK, 'LOCK-NEEDLE\n');
const LINKS = mkdtempSync(join(tmpdir(), 'insrc-tool-refusal-links-'));
symlinkSync(DATA, join(LINKS, 'data-link'));
symlinkSync(LOCK, join(LINKS, 'lock-link'));
symlinkSync(INSRC, join(LINKS, 'dir-link'));

const { fileReadTool } = await import('../read.js');
const { fileEditTool } = await import('../edit.js');
const { fileMultiEditTool } = await import('../multi-edit.js');
const { fileCopyTool } = await import('../copy.js');
const { fileMoveTool } = await import('../move.js');
const { fileDeleteTool } = await import('../delete.js');
const { fileWriteTool } = await import('../write.js');
const { searchGrepTool } = await import('../../search/grep.js');
const { searchGlobTool } = await import('../../search/glob.js');
const { searchListDirTool } = await import('../../search/list-dir.js');
const { searchRecentTool } = await import('../../search/recent.js');
const { executeTool } = await import('../../../executor.js');
const { registerTool, getTool } = await import('../../../registry.js');
import type { Tool, ToolInput, ToolResult } from '../../../types.js';

after(() => {
	rmSync(HOME, { recursive: true, force: true });
	rmSync(LINKS, { recursive: true, force: true });
});

const STORE_FILES = [DATA, LOCK, join(LINKS, 'data-link'), join(LINKS, 'lock-link'), join(LINKS, 'dir-link', 'graph.lmdb-lock')];

/** The tool's own execute must refuse: by rejecting with the named error. */
async function assertRefused(tool: Tool, input: ToolInput): Promise<void> {
	await assert.rejects(Promise.resolve().then(() => tool.execute(input, {} as never)), (e: Error) => {
		assert.equal(e.name, 'LiveStoreFileRefusedError', `${tool.id} ${JSON.stringify(input)}: ${e.message}`);
		return true;
	}, `${tool.id} refuses ${JSON.stringify(input)}`);
}

function assertStoreUntouched(): void {
	assert.equal(readFileSync(DATA, 'utf8'), 'DATA-NEEDLE\n');
	assert.equal(readFileSync(LOCK, 'utf8'), 'LOCK-NEEDLE\n');
}

test("file tools: each tool's own execute refuses the store file and its lock file, by direct path and through a symbolic link", async () => {
	const scratch = mkdtempSync(join(tmpdir(), 'insrc-tool-refusal-scratch-'));
	const other = join(scratch, 'other.txt');
	writeFileSync(other, 'x\n');
	try {
		for (const p of STORE_FILES) {
			await assertRefused(fileReadTool, { path: p });
			await assertRefused(fileEditTool, { path: p, oldString: 'NEEDLE', newString: 'X' });
			await assertRefused(fileMultiEditTool, { path: p, edits: [{ oldString: 'NEEDLE', newString: 'X' }] });
			await assertRefused(fileCopyTool, { from: p, to: join(scratch, 'copy-out') });
			await assertRefused(fileCopyTool, { from: other, to: p, overwrite: true });
			await assertRefused(fileMoveTool, { from: p, to: join(scratch, 'move-out') });
			await assertRefused(fileMoveTool, { from: other, to: p, overwrite: true });
			await assertRefused(fileDeleteTool, { path: p });
			await assertRefused(fileWriteTool, { path: p, content: 'X' });
			await assertRefused(searchGrepTool, { pattern: 'NEEDLE', path: p });
		}
		// The approval gates of copy and move say so, and offer only Skip.
		for (const tool of [fileCopyTool, fileMoveTool]) {
			const gate = tool.buildApprovalGate!({ from: LOCK, to: join(scratch, 'x') });
			assert.match(String(gate.content), /Refusing to touch/);
			assert.deepEqual(gate.actions.map(a => a.name), ['skip']);
		}
		assertStoreUntouched();
		assert.equal(existsSync(join(scratch, 'copy-out')), false);
		assert.equal(existsSync(join(scratch, 'move-out')), false);

		// Searching the directory that holds the store never reads its files.
		const hits = await searchGrepTool.execute({ pattern: 'NEEDLE', path: INSRC }, {} as never);
		assert.equal(hits.success, true);
		assert.doesNotMatch(hits.output, /graph\.lmdb/);
		// Copying that directory leaves the store's files behind.
		const copied = await fileCopyTool.execute({ from: INSRC, to: join(scratch, 'insrc-copy') }, {} as never);
		assert.equal(copied.success, true, copied.output);
		assert.equal(existsSync(join(scratch, 'insrc-copy', 'graph.lmdb')), false);
		assert.equal(existsSync(join(scratch, 'insrc-copy', 'graph.lmdb-lock')), false);

		// The walking search tools refuse a store file as their root.
		await assertRefused(searchListDirTool, { path: LOCK });
		await assertRefused(searchRecentTool, { path: LOCK });
		await assertRefused(searchGlobTool, { pattern: '*', cwd: LOCK });

		// Through the executor, the refusal is a failed result naming it, not a crash.
		if (getTool('file_read') === undefined) registerTool(fileReadTool);
		const r = await (executeTool as (id: string, input: ToolInput) => Promise<ToolResult>)('file_read', { path: LOCK });
		assert.equal(r.success, false);
		assert.match(r.error ?? '', /Refusing to touch/, 'the tool ran and refused (not an unknown tool)');
	} finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('a file tool call on any other path behaves as before', async () => {
	const scratch = mkdtempSync(join(tmpdir(), 'insrc-tool-ok-'));
	try {
		const a = join(scratch, 'a.txt');
		assert.equal((await fileWriteTool.execute({ path: a, content: 'hello NEEDLE\n' }, {} as never)).success, true);
		assert.match((await fileReadTool.execute({ path: a }, {} as never)).output, /hello NEEDLE/);
		assert.equal((await fileEditTool.execute({ path: a, oldString: 'hello', newString: 'hi' }, {} as never)).success, true);
		assert.equal((await fileMultiEditTool.execute({ path: a, edits: [{ oldString: 'hi', newString: 'hey' }] }, {} as never)).success, true);
		assert.equal((await fileCopyTool.execute({ from: a, to: join(scratch, 'b.txt') }, {} as never)).success, true);
		assert.equal((await fileMoveTool.execute({ from: join(scratch, 'b.txt'), to: join(scratch, 'c.txt') }, {} as never)).success, true);
		const grep = await searchGrepTool.execute({ pattern: 'NEEDLE', path: scratch }, {} as never);
		assert.match(grep.output, /a\.txt/);
		assert.match(grep.output, /c\.txt/);
		assert.equal((await fileDeleteTool.execute({ path: join(scratch, 'c.txt') }, {} as never)).success, true);
		assert.equal(readFileSync(a, 'utf8'), 'hey NEEDLE\n');
		// A file merely NAMED like the store, outside the live store's directory.
		const lookalike = join(scratch, 'graph.lmdb-lock');
		writeFileSync(lookalike, 'not the store\n');
		assert.match((await fileReadTool.execute({ path: lookalike }, {} as never)).output, /not the store/);
	} finally { rmSync(scratch, { recursive: true, force: true }); }
});
