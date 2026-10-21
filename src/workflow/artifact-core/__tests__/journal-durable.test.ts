import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JOURNAL_DIR, createFileJournal, headHashOf } from '../journal.js';
import type { StagedOperation } from '../journal.js';
import { alice } from './store-kit.js';

const A = 'LLD-0123456789abcdef-s1';
const B = 'LLD-0123456789abcdef-s2';

const op = (operationId: string): StagedOperation => ({
	operationId, priorRevision: 1, priorHeadHash: headHashOf('before'), bytes: '{"after":1}',
	entry: { id: operationId, actor: alice, timestamp: '2026-10-20T12:00:01.000Z', operation: 'update' },
});

describe('journal-durable', () => {
	it('the journal stages, reports and clears one file per artifact and refuses an invalid file', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'journal-durable-'));
		try {
			const journal = createFileJournal(repo);
			assert.equal(await journal.pending(A), undefined);
			await journal.stage(A, op('op1'));
			await journal.stage(B, op('op2'));
			assert.deepEqual(readdirSync(join(repo, JOURNAL_DIR)).sort(), [`${A}.json`, `${B}.json`]);
			// A second journal object over the same directory sees it: it survives a restart.
			assert.deepEqual(await createFileJournal(repo).pending(A), op('op1'));
			// Staging again replaces the file; clearing a different operation leaves it.
			await journal.stage(A, op('op3'));
			assert.equal((await journal.pending(A))?.operationId, 'op3');
			await journal.clear(A, 'op1');
			assert.equal((await journal.pending(A))?.operationId, 'op3');
			await journal.clear(A, 'op3');
			assert.equal(await journal.pending(A), undefined);
			assert.equal(existsSync(join(repo, JOURNAL_DIR, `${A}.json`)), false);
			assert.equal((await journal.pending(B))?.operationId, 'op2');

			// A file that is not a staged operation is an error, never an empty journal.
			writeFileSync(join(repo, JOURNAL_DIR, `${A}.json`), '{not json');
			await assert.rejects(journal.pending(A), /not valid JSON/);
			writeFileSync(join(repo, JOURNAL_DIR, `${A}.json`), JSON.stringify({ operationId: 'x' }));
			await assert.rejects(journal.pending(A), /not a staged operation/);
			await assert.rejects(journal.clear(A, 'x'), /not a staged operation/);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});
});
