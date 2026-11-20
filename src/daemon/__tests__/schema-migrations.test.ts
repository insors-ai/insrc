/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readSchemaVersion, writeRepoEntryKeys, writeSchemaVersion } from '../../workflow/config/repo-config-store.js';

async function inTempDir(run: (dir: string, file: string) => Promise<void>): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), 'schema-migrations-'));
	try { await run(dir, join(dir, 'repo-config.json')); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const parse = (file: string): Record<string, unknown> => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

test('schema-migrations.test.ts: readSchemaVersion returns null for an absent file, an absent key and a null value, the integer for a valid one, and ok:false for an unreadable file or a value that is not a non-negative integer, without changing the file', async () => {
	await inTempDir(async (dir, file) => {
		assert.deepEqual(readSchemaVersion(file), { ok: true, version: null }, 'an absent file');
		assert.ok(!existsSync(file), 'a read never creates the file');

		const cases: ReadonlyArray<readonly [string, unknown]> = [
			['an absent key', undefined], ['a null value', null], ['zero', 0], ['a valid integer', 3],
		];
		for (const [label, value] of cases) {
			const text = JSON.stringify(value === undefined ? { repos: {} } : { schemaVersion: value, repos: {} });
			writeFileSync(file, text);
			const r = readSchemaVersion(file);
			assert.ok(r.ok, label);
			assert.equal(r.version, value === undefined || value === null ? null : value, label);
			assert.equal(readFileSync(file, 'utf8'), text, `${label}: the file is unchanged`);
		}

		for (const bad of ['"1"', '1.5', '-1', '{}', '[1]', 'true']) {
			const text = `{"schemaVersion": ${bad}}`;
			writeFileSync(file, text);
			const r = readSchemaVersion(file);
			assert.ok(!r.ok && r.code === 'schema-version-invalid', `${bad} is invalid, not 0`);
			assert.equal(readFileSync(file, 'utf8'), text, `${bad}: the file is unchanged`);
		}

		for (const text of ['{not json', '[]', '{"repos": []}']) {
			writeFileSync(file, text);
			const r = readSchemaVersion(file);
			assert.ok(!r.ok && r.code === 'repo-config-unreadable', `${text} is unreadable`);
			assert.equal(readFileSync(file, 'utf8'), text);
		}
		assert.deepEqual(readdirSync(dir), ['repo-config.json'], 'no temp file is left');
	});
});

test('schema-migrations.test.ts: writeSchemaVersion creates the file when absent, keeps default, repos and unknown root keys, reports changed false when the version is already stored, never lowers a stored version, and returns write-failed or file-changed as data', async () => {
	await inTempDir(async (dir, file) => {
		const created = await writeSchemaVersion(1, file);
		assert.deepEqual(created, { ok: true, changed: true });
		assert.deepEqual(parse(file), { schemaVersion: 1 });

		writeFileSync(file, JSON.stringify({ default: { type: 'none' }, repos: { '/r': { buildCommand: 'make' } }, extra: { keep: true } }));
		assert.deepEqual(await writeSchemaVersion(2, file), { ok: true, changed: true });
		assert.deepEqual(parse(file), { default: { type: 'none' }, repos: { '/r': { buildCommand: 'make' } }, extra: { keep: true }, schemaVersion: 2 });

		const before = readFileSync(file, 'utf8');
		assert.deepEqual(await writeSchemaVersion(2, file), { ok: true, changed: false }, 'already stored');
		assert.deepEqual(await writeSchemaVersion(1, file), { ok: true, changed: false }, 'never lowered');
		assert.equal(readFileSync(file, 'utf8'), before);

		const invalid = await writeSchemaVersion(-1, file);
		assert.ok(!invalid.ok && invalid.error.code === 'write-failed', 'an invalid version is data');

		// A throwing seam is write-failed as data and leaves no temp file.
		const failedWrite = await writeSchemaVersion(5, file, { writeFile: () => { throw new Error('disk full'); }, rename: () => undefined });
		assert.ok(!failedWrite.ok && failedWrite.error.code === 'write-failed' && /disk full/.test(failedWrite.error.message));
		assert.equal(readFileSync(file, 'utf8'), before);

		// The file changing under the writer on every attempt is file-changed, nothing written.
		const raced = await writeSchemaVersion(5, file, {
			writeFile: (path, content) => writeFileSync(path, content),
			rename: (from, to) => { throw new Error(`unreachable ${from} ${to}`); },
			afterTempWrite: () => { writeFileSync(file, JSON.stringify({ schemaVersion: 2, touched: Math.random() })); },
		});
		assert.ok(!raced.ok && raced.error.code === 'file-changed');
		assert.ok(parse(file)['schemaVersion'] === 2);

		// An unreadable file is reported and not overwritten.
		writeFileSync(file, '{not json');
		const unreadable = await writeSchemaVersion(1, file);
		assert.ok(!unreadable.ok && unreadable.error.code === 'repo-config-unreadable');
		assert.equal(readFileSync(file, 'utf8'), '{not json');
		assert.deepEqual(readdirSync(dir).sort(), ['repo-config.json'], 'no temp file is left');
	});
});

test('schema-migrations.test.ts: a repo write through writeRepoEntryKeys after the stamp keeps the root schemaVersion', async () => {
	await inTempDir(async (_dir, file) => {
		await writeSchemaVersion(1, file);
		assert.deepEqual(await writeRepoEntryKeys('/repo', { buildCommand: 'make' }, file), { ok: true, changed: true });
		assert.deepEqual(parse(file), { schemaVersion: 1, repos: { '/repo': { buildCommand: 'make' } } });

		// And the other direction: stamping keeps what the repo writes put in.
		assert.deepEqual(await writeSchemaVersion(2, file), { ok: true, changed: true });
		assert.deepEqual(parse(file), { schemaVersion: 2, repos: { '/repo': { buildCommand: 'make' } } });
	});
});
