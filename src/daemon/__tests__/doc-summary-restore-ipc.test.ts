/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-dced4385 S001/t5 — docSummary.restoreFromBackup restores document
 * summaries from a backup store inside the daemon that owns the live store,
 * and refuses a path that is not an absolute path to an existing file, or
 * that is the live store itself.
 *
 * A real daemon over a seeded store (helpers/seeded-daemon.ts); the backup is
 * a single-file LMDB store written by the test.
 *
 * Run: npx tsx --test src/daemon/__tests__/doc-summary-restore-ipc.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open } from 'lmdb';
import { Packr } from 'msgpackr';

import { encodeEntityKey } from '../../db/graph/keys.js';
import { startSeededDaemon } from './helpers/seeded-daemon.js';
import type { SeededDaemon } from './helpers/seeded-daemon.js';

const TIMEOUT = { timeout: 120_000 };
let seeded: SeededDaemon;
let dir: string;

test.before(async () => {
	seeded = await startSeededDaemon();
	dir = mkdtempSync(join(tmpdir(), 'insrc-dced-restore-ipc-'));
}, TIMEOUT);
test.after(async () => {
	await seeded?.stop();
	rmSync(dir, { recursive: true, force: true });
});

/** A backup holding one summary of the seeded section (whose body the helper writes). */
async function backupOfSeededDoc(): Promise<string> {
	const body = 'export function LLD() {}';
	const summary = {
		title: 'LLD', family: 'design', kind: 'design', subjects: [], summary: 'restored', keyDecisions: [],
		keyConstraints: [], relatedEntities: [], status: 'current', summarisedAt: '2026-10-16T00:00:00.000Z',
		modelId: 'qwen3.8:27b', contentHash: createHash('sha256').update(body, 'utf8').digest('hex'),
	};
	const path = join(dir, 'graph.lmdb.backup');
	const env = open({ path, maxDbs: 8 });
	const summaries = env.openDB({ name: 'doc_summary', keyEncoding: 'binary', encoding: 'binary' });
	const ids = env.openDB({ name: 'entity_string_by_u64', keyEncoding: 'binary', encoding: 'ordered-binary' });
	await env.transaction(() => {
		summaries.put(encodeEntityKey(7n), new Packr({ useRecords: false }).pack(summary));
		ids.put(encodeEntityKey(7n), seeded.ids.doc);
	});
	await env.close();
	return path;
}

const restore = (backupPath: unknown): Promise<unknown> => seeded.call('docSummary.restoreFromBackup', { backupPath });

test('docSummary.restoreFromBackup restores over IPC and rejects a relative path, a missing file and the live store path', TIMEOUT, async () => {
	await assert.rejects(restore('graph.lmdb.backup'), /not an absolute path/);
	await assert.rejects(restore(join(dir, 'missing.lmdb')), /does not exist/);
	await assert.rejects(restore(join(seeded.home, '.insrc', 'graph.lmdb')), /is the live store/);
	await assert.rejects(restore(42), /backupPath must be a string/);

	const backup = await backupOfSeededDoc();
	assert.deepEqual(await restore(backup), { read: 1, written: 1, alreadyPresent: 0, entityGone: 0, bodyChanged: 0, undecodable: 0 });
	assert.deepEqual(await restore(backup), { read: 1, written: 0, alreadyPresent: 1, entityGone: 0, bodyChanged: 0, undecodable: 0 },
		'the first call stored it: the second finds it present');
});
