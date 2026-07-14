/**
 * Tests for daemon/db/list-files.ts -- the directory-connection
 * file-enumeration helper backing `db_file_list_files`
 * (plans/data-driver-duckdb-files.md Phase 6.2).
 */

import { describe, it, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listFilesForConnection } from '../list-files.js';

const root = mkdtempSync(join(tmpdir(), 'insrc-list-files-'));
await mkdir(join(root, 'sub'), { recursive: true });
await mkdir(join(root, '.hidden'), { recursive: true });
writeFileSync(join(root, 'a.csv'),       'col\n1\n', 'utf8');
writeFileSync(join(root, 'b.parquet'),   'fake',     'utf8');
writeFileSync(join(root, '.dotfile'),    'skip me',  'utf8');
writeFileSync(join(root, 'sub', 'c.csv'), 'col\n2\n', 'utf8');
writeFileSync(join(root, '.hidden', 'd.csv'), 'col\n3\n', 'utf8');

describe('listFilesForConnection', () => {
	it('non-recursive returns only top-level visible files', async () => {
		const r = await listFilesForConnection(root, { limit: 100 });
		assert.deepEqual(r.files.map(f => f.path).sort(), ['a.csv', 'b.parquet']);
		assert.equal(r.truncated, false);
		// Hidden directory + dotfile excluded.
		assert.ok(!r.files.find(f => f.path.startsWith('.')));
	});

	it('recursive walks subdirectories but skips hidden ones', async () => {
		const r = await listFilesForConnection(root, { recursive: true, limit: 100 });
		assert.deepEqual(r.files.map(f => f.path).sort(), ['a.csv', 'b.parquet', 'sub/c.csv']);
	});

	it('pattern filter narrows by basename', async () => {
		const r = await listFilesForConnection(root, { recursive: true, pattern: '*.csv', limit: 100 });
		assert.deepEqual(r.files.map(f => f.path).sort(), ['a.csv', 'sub/c.csv']);
	});

	it('limit truncates and flags', async () => {
		const r = await listFilesForConnection(root, { recursive: true, limit: 1 });
		assert.equal(r.files.length, 1);
		assert.equal(r.truncated, true);
	});

	it('single-file connection returns a single empty-path entry', async () => {
		const r = await listFilesForConnection(join(root, 'a.csv'), { limit: 100 });
		assert.equal(r.files.length, 1);
		assert.equal(r.files[0]!.path, '');
		assert.ok(r.files[0]!.size > 0);
	});
});

after(() => {
	try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
});
