/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story b94cf2c9 S001/t2 — the summariser runs at the same time as code
 * indexing, so a document can be rewritten or deleted while the model works.
 * summariseDoc stores a summary (or an error placeholder) only for a document
 * that is still current, and says why when it does not.
 *
 * Driven against a temporary graph store and a fake model.
 *
 * Run: npx tsx --test src/analyze/summariser/__tests__/summarise-doc-current.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import { getDocSummary, writeDocSummaryIfCurrent } from '../../../db/doc-summaries.js';
import { createHash } from 'node:crypto';
import type { DocSummary } from '../../../shared/analyze-types.js';
import { deleteEntitiesForFile, upsertEntities } from '../../../db/entities.js';
import { addRepo } from '../../../db/repos.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import { summariseDoc } from '../driver.js';

useTemporaryLance();

const REPO = '/repo/summaries';
const FILE = `${REPO}/docs/design.md`;

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-summarise-current-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: 'summaries', addedAt: '2026-10-17T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function docEntity(body = '# Design\n\nThe queue has two lanes.'): Entity {
	return {
		id: makeEntityId(REPO, FILE, 'document', 'design'), kind: 'document', name: 'design', language: 'markdown',
		repoId: 1, repo: REPO, file: FILE, startLine: 1, endLine: 3, body, embedding: [], indexedAt: '2026-10-17T00:00:00.000Z',
	};
}

const REPLY = {
	title: 'Design', family: 'design', kind: 'design', subjects: ['queue'], summary: 'Two lanes.',
	keyDecisions: [], keyConstraints: [], relatedEntities: [], status: 'current',
};

/** A fake model: runs `during` while "thinking", then answers or throws. */
function model(during: () => Promise<void>, fail?: Error): LLMProvider {
	return {
		async completeStructured() {
			await during();
			if (fail) throw fail;
			return REPLY;
		},
	} as unknown as LLMProvider;
}

const rewrite = async (): Promise<void> => { await upsertEntities(null, [docEntity('# Design\n\nRewritten while summarising.')]); };
const remove  = async (): Promise<void> => { await deleteEntitiesForFile(null, FILE); };
const nothing = async (): Promise<void> => {};

test('a summary of a document rewritten or deleted while it was summarised is not stored, and is reported as skipped body-changed or entity-gone', async () => {
	const e = docEntity();
	await upsertEntities(null, [e]);
	assert.deepEqual(await summariseDoc({ db: null, entity: e, provider: model(rewrite) }), { ok: false, skipped: 'body-changed' });
	assert.equal(await getDocSummary(null, e.id), null, 'nothing stored from the old text');

	assert.deepEqual(await summariseDoc({ db: null, entity: e, provider: model(remove) }), { ok: false, skipped: 'entity-gone' });
	assert.equal(await getDocSummary(null, e.id), null);

	// Still current: stored as before.
	const fresh = docEntity();
	await upsertEntities(null, [fresh]);
	const ok = await summariseDoc({ db: null, entity: fresh, provider: model(nothing) });
	assert.equal(ok.ok, true);
	assert.equal((await getDocSummary(null, fresh.id))?.summary, 'Two lanes.');
});

test('a summary write that throws is reported as persistence-failed', async () => {
	const e = docEntity();
	await upsertEntities(null, [e]);
	// The same document named under a repository that is not registered: the write throws.
	const r = await summariseDoc({ db: null, entity: { ...e, repo: '/repo/not-registered' }, provider: model(nothing) });
	assert.equal(r.ok, false);
	assert.equal(r.errorCode, 'persistence-failed');
	assert.match(r.errorMessage ?? '', /is not registered/);
});

test('when the model fails, a placeholder write that throws keeps the model error, and one that finds the document gone or rewritten reports that instead', async () => {
	const e = docEntity();
	await upsertEntities(null, [e]);
	const failure = new Error('the model answered garbage');

	const thrown = await summariseDoc({ db: null, entity: { ...e, repo: '/repo/not-registered' }, provider: model(nothing, failure) });
	assert.deepEqual(thrown, { ok: false, errorCode: 'other', errorMessage: 'the model answered garbage' });

	const stored = await summariseDoc({ db: null, entity: e, provider: model(nothing, failure) });
	assert.deepEqual(stored, { ok: false, errorCode: 'other', errorMessage: 'the model answered garbage' });
	assert.equal((await getDocSummary(null, e.id))?.errorCode, 'other', 'the placeholder is stored for a current document');

	assert.deepEqual(await summariseDoc({ db: null, entity: e, provider: model(rewrite, failure) }), { ok: false, skipped: 'body-changed' });
	const gone = docEntity('# Design\n\nRewritten while summarising.');
	assert.deepEqual(await summariseDoc({ db: null, entity: gone, provider: model(remove, failure) }), { ok: false, skipped: 'entity-gone' });
});

test('a summary stored while the model runs is kept when the model then fails (the placeholder is not written)', async () => {
	const e = docEntity();
	await upsertEntities(null, [e]);
	const good = {
		title: 'Design', family: 'design', kind: 'design', subjects: [], summary: 'restored meanwhile',
		keyDecisions: [], keyConstraints: [], relatedEntities: [], status: 'current', summarisedAt: '2026-10-16T00:00:00.000Z',
		modelId: 'an-earlier-model', contentHash: createHash('sha256').update(e.body ?? '', 'utf8').digest('hex'),
	} as DocSummary;
	// While the model "thinks", a backup restore or a carry write-back stores a good summary of the same body.
	const restore = async (): Promise<void> => { assert.equal(await writeDocSummaryIfCurrent(null, e.id, e.repo, good), 'written'); };

	const r = await summariseDoc({ db: null, entity: e, provider: model(restore, new Error('the model timed out')) });

	assert.deepEqual(r, { ok: false, skipped: 'kept-good', errorCode: 'other', errorMessage: 'the model timed out' });
	const stored = await getDocSummary(null, e.id);
	assert.equal(stored?.summary, 'restored meanwhile', 'the good summary is kept');
	assert.equal(stored?.errorCode, undefined, 'no placeholder replaced it');
});
