/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-dced4385 S001/t5 — restoreDocSummariesFromBackup puts back the
 * summaries a backup store holds, for every document stored now whose body
 * hashes to the summary's contentHash, never over a summary the live store
 * holds, and leaves the backup as it was.
 *
 * The backup is a single-file LMDB store written by the test with the live
 * store's databases and encodings (doc_summary, entity_string_by_u64).
 *
 * Run: npx tsx --test src/db/__tests__/doc-summary-restore.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open } from 'lmdb';
import { Packr } from 'msgpackr';

import { closeGraphStore, getGraphStorePath, setGraphStorePath } from '../graph/store.js';
import { encodeEntityKey } from '../graph/keys.js';
import { addRepo } from '../repos.js';
import { upsertEntities } from '../entities.js';
import { getDocSummary, restoreDocSummariesFromBackup, writeDocSummary } from '../doc-summaries.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import type { DocSummary } from '../../shared/analyze-types.js';
import type { Entity } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const NOW = '2026-10-18T00:00:00.000Z';
const REPO = '/repo/restore';
let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-dced-restore-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: 'restore', addedAt: NOW, status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function doc(name: string, body: string): Entity {
	const file = `${REPO}/docs/${name}.md`;
	return {
		id: makeEntityId(REPO, file, 'section', name), kind: 'section', name, language: 'markdown',
		repoId: 1, repo: REPO, file, startLine: 1, endLine: 1, body, embedding: [], indexedAt: NOW,
	};
}

const hash = (body: string): string => createHash('sha256').update(body, 'utf8').digest('hex');

function summaryOf(body: string, extra: Partial<DocSummary> = {}): DocSummary {
	return {
		title: 't', family: 'design', kind: 'design', subjects: [], summary: `of ${body}`,
		keyDecisions: [], keyConstraints: [], relatedEntities: [], status: 'current',
		summarisedAt: NOW, modelId: 'qwen3.8:27b', contentHash: hash(body), ...extra,
	} as DocSummary;
}

interface BackupRow { readonly u64: bigint; readonly entityId?: string | undefined; readonly value: Buffer }

/** Write a single-file backup store holding `rows` (omit `databases` entries to leave one out). */
async function writeBackup(rows: readonly BackupRow[], databases = ['doc_summary', 'entity_string_by_u64'], name = `backup-${Math.random().toString(36).slice(2)}.lmdb`): Promise<string> {
	const path = join(dir, name);
	const env = open({ path, noSubdir: true, maxDbs: 8 });
	const summaries = databases.includes('doc_summary') ? env.openDB({ name: 'doc_summary', keyEncoding: 'binary', encoding: 'binary' }) : undefined;
	const ids = databases.includes('entity_string_by_u64') ? env.openDB({ name: 'entity_string_by_u64', keyEncoding: 'binary', encoding: 'ordered-binary' }) : undefined;
	await env.transaction(() => {
		for (const r of rows) {
			summaries?.put(encodeEntityKey(r.u64), r.value);
			if (r.entityId !== undefined) ids?.put(encodeEntityKey(r.u64), r.entityId);
		}
	});
	await env.close();
	return path;
}

const packed = (s: DocSummary): Buffer => new Packr({ useRecords: false }).pack(s);
const fileHash = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/** The live store and a backup holding one row of every kind. */
async function fixture(): Promise<{ backup: string; ids: Record<string, string> }> {
	const current = doc('current', 'current body'), earlier = doc('earlier', 'earlier body');
	const present = doc('present', 'present body'), changed = doc('changed', 'changed body now');
	await upsertEntities(null, [current, earlier, present, changed]);
	await writeDocSummary(null, present.id, REPO, summaryOf('present body', { summary: 'live' }));
	const backup = await writeBackup([
		{ u64: 101n, entityId: current.id, value: packed(summaryOf('current body', { summary: 'restored current' })) },
		{ u64: 102n, entityId: earlier.id, value: packed(summaryOf('earlier body', { summary: 'restored earlier', modelId: 'qwen3.6:35b-a3b' })) },
		{ u64: 103n, entityId: present.id, value: packed(summaryOf('present body', { summary: 'from the backup' })) },
		{ u64: 104n, entityId: doc('gone', 'gone body').id, value: packed(summaryOf('gone body')) },
		{ u64: 105n, entityId: changed.id, value: packed(summaryOf('changed body then')) },
		{ u64: 106n, entityId: doc('garbage', 'x').id, value: Buffer.from([0xc1]) },
		{ u64: 107n, value: packed(summaryOf('no mapping')) },
	]);
	return { backup, ids: { current: current.id, earlier: earlier.id, present: present.id, changed: changed.id } };
}

test('restore writes a backup summary whose document is stored with the same body, by either model, and counts already-present, gone, changed and undecodable rows', async () => {
	const { backup, ids } = await fixture();

	assert.deepEqual(await restoreDocSummariesFromBackup(backup),
		{ read: 7, written: 2, alreadyPresent: 1, entityGone: 1, bodyChanged: 1, undecodable: 2 });

	assert.equal((await getDocSummary(null, ids.current!))?.summary, 'restored current');
	const earlier = await getDocSummary(null, ids.earlier!);
	assert.equal(earlier?.summary, 'restored earlier');
	assert.equal(earlier?.modelId, 'qwen3.6:35b-a3b', 'an earlier model\'s summary is restored as it is');
	assert.equal((await getDocSummary(null, ids.present!))?.summary, 'live', 'a stored summary is never replaced');
	assert.equal(await getDocSummary(null, ids.changed!), null, 'nothing for a changed body');
});

test('a second restore writes nothing and the backup file is unchanged', async () => {
	const { backup } = await fixture();
	const before = fileHash(backup);

	await restoreDocSummariesFromBackup(backup);
	const second = await restoreDocSummariesFromBackup(backup);

	assert.equal(second.written, 0);
	assert.deepEqual(second, { read: 7, written: 0, alreadyPresent: 3, entityGone: 1, bodyChanged: 1, undecodable: 2 });
	assert.equal(fileHash(backup), before, 'the backup file\'s bytes are unchanged');
});

test('a backup lacking entity_string_by_u64 is rejected, nothing is written and the backup is closed', async () => {
	const current = doc('current', 'current body');
	await upsertEntities(null, [current]);
	const backup = await writeBackup([{ u64: 101n, entityId: current.id, value: packed(summaryOf('current body')) }], ['doc_summary']);

	await assert.rejects(restoreDocSummariesFromBackup(backup), /has no entity_string_by_u64 database/);
	assert.equal(await getDocSummary(null, current.id), null, 'nothing written');

	// Closed: the file opens for writing again, and once it has the database the restore runs.
	const env = open({ path: backup, noSubdir: true, maxDbs: 8 });
	const ids = env.openDB({ name: 'entity_string_by_u64', keyEncoding: 'binary', encoding: 'ordered-binary' });
	await ids.put(encodeEntityKey(101n), current.id);
	await env.close();
	assert.equal((await restoreDocSummariesFromBackup(backup)).written, 1);
});

test('restore refuses a relative path, a missing file, a directory and the live store, before opening anything', async () => {
	await assert.rejects(restoreDocSummariesFromBackup('backup.lmdb'), /not an absolute path/);
	await assert.rejects(restoreDocSummariesFromBackup(join(dir, 'missing.lmdb')), /does not exist/);
	await assert.rejects(restoreDocSummariesFromBackup(dir), /is not a file/);
	await getDocSummary(null, 'any');   // the live store file exists once opened
	await assert.rejects(restoreDocSummariesFromBackup(getGraphStorePath()), /is the live store/);
});

test('a backup file whose name has no extension is read as a single-file store', async () => {
	const current = doc('current', 'current body');
	await upsertEntities(null, [current]);
	const backup = await writeBackup([{ u64: 101n, entityId: current.id, value: packed(summaryOf('current body')) }], undefined, 'graphbackup');

	assert.equal((await restoreDocSummariesFromBackup(backup)).written, 1);
	assert.equal((await getDocSummary(null, current.id))?.contentHash, hash('current body'));
});
