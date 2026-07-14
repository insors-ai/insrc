/**
 * plans/docs-module.md Section 8. LMDB-backed docSummary CRUD.
 *
 * Verifies:
 *   - writeDocSummary + getDocSummary round-trip
 *   - listDocSummariesForRepo returns every summary for a repo
 *   - countDocSummariesForRepo matches the list length
 *   - deleteDocSummary drops primary + secondary index atomically
 *   - deleteDocSummariesForRepo scoped drop
 *   - cascade delete via deleteEntitiesForFile also removes summaries
 *   - listDocSummaryEntityIdsForRepo returns ids in the same order
 *   - writeDocSummary rejects unknown entities + unregistered repos
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import {
	countDocSummariesForRepo,
	deleteDocSummariesForRepo,
	deleteDocSummary,
	getDocSummary,
	listDocSummariesForRepo,
	listDocSummaryEntityIdsForRepo,
	writeDocSummary,
} from '../doc-summaries.js';
import { deleteEntitiesForFile, upsertEntities } from '../entities.js';
import { addRepo } from '../repos.js';
import type { Entity, RegisteredRepo } from '../../shared/types.js';
import type { DocSummary } from '../../shared/analyze-types.js';

let dir: string;

const REPO_A = '/repo/alpha';
const REPO_B = '/repo/bravo';
const NOW = '2026-07-06T12:00:00.000Z';

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeDocEntity(repo: string, file: string, name: string): Entity {
	return {
		id:        makeEntityId(repo, file, 'document', name),
		kind:      'document',
		name,
		language:  'markdown',
		repoId:    1,
		repo,
		file,
		startLine: 1,
		endLine:   50,
		body:      `# ${name}\n\nSome doc body content that we might summarise.`,
		embedding: [],
		indexedAt: NOW,
		artifact:  true,
	};
}

function makeSummary(overrides: Partial<DocSummary> = {}): DocSummary {
	return {
		title:           overrides.title           ?? 'Test Doc',
		family:          overrides.family          ?? 'design',
		kind:            overrides.kind            ?? 'design',
		subjects:        overrides.subjects        ?? ['analyze', 'shaper'],
		summary:         overrides.summary         ?? 'A short gist of the test doc.',
		keyDecisions:    overrides.keyDecisions    ?? ['run shapers serially'],
		keyConstraints:  overrides.keyConstraints  ?? ['no parallel LLM calls'],
		relatedEntities: overrides.relatedEntities ?? [],
		status:          overrides.status          ?? 'current',
		summarisedAt:    overrides.summarisedAt    ?? NOW,
		modelId:         overrides.modelId         ?? 'qwen3.6:35b-a3b',
		contentHash:     overrides.contentHash     ?? 'hash-0',
		...(overrides.errorCode !== undefined ? { errorCode: overrides.errorCode } : {}),
	};
}

async function registerRepo(path: string): Promise<void> {
	const repo: RegisteredRepo = {
		path, name: '', addedAt: new Date().toISOString(), status: 'pending',
	};
	await addRepo(null, repo);
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-doc-summaries-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await registerRepo(REPO_A);
	await registerRepo(REPO_B);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

test('writeDocSummary + getDocSummary round-trip', async () => {
	const e = makeDocEntity(REPO_A, `${REPO_A}/design/foo.md`, 'foo');
	await upsertEntities(null, [e]);

	const summary = makeSummary({ title: 'Foo Design' });
	await writeDocSummary(null, e.id, REPO_A, summary);

	const got = await getDocSummary(null, e.id);
	assert.ok(got !== null, 'summary should be present');
	assert.equal(got!.title, 'Foo Design');
	assert.equal(got!.family, 'design');
	assert.deepEqual(got!.subjects, ['analyze', 'shaper']);
	assert.deepEqual(got!.keyDecisions, ['run shapers serially']);
	assert.deepEqual(got!.keyConstraints, ['no parallel LLM calls']);
});

test('writeDocSummary overwrites an existing summary', async () => {
	const e = makeDocEntity(REPO_A, `${REPO_A}/design/foo.md`, 'foo');
	await upsertEntities(null, [e]);

	await writeDocSummary(null, e.id, REPO_A, makeSummary({ contentHash: 'v1' }));
	await writeDocSummary(null, e.id, REPO_A, makeSummary({ contentHash: 'v2', title: 'Updated' }));

	const got = await getDocSummary(null, e.id);
	assert.ok(got !== null);
	assert.equal(got!.contentHash, 'v2');
	assert.equal(got!.title, 'Updated');
});

test('getDocSummary returns null for unknown entity', async () => {
	const got = await getDocSummary(null, 'nonexistent-id');
	assert.equal(got, null);
});

test('getDocSummary returns null for known entity with no summary', async () => {
	const e = makeDocEntity(REPO_A, `${REPO_A}/design/foo.md`, 'foo');
	await upsertEntities(null, [e]);

	const got = await getDocSummary(null, e.id);
	assert.equal(got, null);
});

// ---------------------------------------------------------------------------
// Rejection paths
// ---------------------------------------------------------------------------

test('writeDocSummary rejects an unknown entity', async () => {
	await assert.rejects(
		() => writeDocSummary(null, 'nonexistent-entity-id', REPO_A, makeSummary()),
		/not known/,
	);
});

test('writeDocSummary rejects an unregistered repo', async () => {
	const e = makeDocEntity(REPO_A, `${REPO_A}/design/foo.md`, 'foo');
	await upsertEntities(null, [e]);

	await assert.rejects(
		() => writeDocSummary(null, e.id, '/repo/unregistered', makeSummary()),
		/not registered/,
	);
});

// ---------------------------------------------------------------------------
// Per-repo list + count
// ---------------------------------------------------------------------------

test('listDocSummariesForRepo returns every summary for the repo', async () => {
	const a1 = makeDocEntity(REPO_A, `${REPO_A}/design/one.md`, 'one');
	const a2 = makeDocEntity(REPO_A, `${REPO_A}/design/two.md`, 'two');
	const b1 = makeDocEntity(REPO_B, `${REPO_B}/plans/x.md`, 'x');
	await upsertEntities(null, [a1, a2, b1]);

	await writeDocSummary(null, a1.id, REPO_A, makeSummary({ title: 'One' }));
	await writeDocSummary(null, a2.id, REPO_A, makeSummary({ title: 'Two' }));
	await writeDocSummary(null, b1.id, REPO_B, makeSummary({ title: 'X', family: 'plans' }));

	const inA = await listDocSummariesForRepo(null, REPO_A);
	const inB = await listDocSummariesForRepo(null, REPO_B);
	const titlesA = inA.map(s => s.title).sort();
	const titlesB = inB.map(s => s.title).sort();
	assert.deepEqual(titlesA, ['One', 'Two']);
	assert.deepEqual(titlesB, ['X']);
});

test('countDocSummariesForRepo matches the list length', async () => {
	const a1 = makeDocEntity(REPO_A, `${REPO_A}/design/a.md`, 'a');
	const a2 = makeDocEntity(REPO_A, `${REPO_A}/design/b.md`, 'b');
	await upsertEntities(null, [a1, a2]);

	await writeDocSummary(null, a1.id, REPO_A, makeSummary());
	await writeDocSummary(null, a2.id, REPO_A, makeSummary());

	const count = await countDocSummariesForRepo(null, REPO_A);
	const list = await listDocSummariesForRepo(null, REPO_A);
	assert.equal(count, list.length);
	assert.equal(count, 2);
});

test('listDocSummaryEntityIdsForRepo returns the same entity ids', async () => {
	const a1 = makeDocEntity(REPO_A, `${REPO_A}/design/a.md`, 'a');
	const a2 = makeDocEntity(REPO_A, `${REPO_A}/design/b.md`, 'b');
	await upsertEntities(null, [a1, a2]);

	await writeDocSummary(null, a1.id, REPO_A, makeSummary());
	await writeDocSummary(null, a2.id, REPO_A, makeSummary());

	const ids = await listDocSummaryEntityIdsForRepo(null, REPO_A);
	const idSet = new Set(ids);
	assert.equal(idSet.size, 2);
	assert.ok(idSet.has(a1.id));
	assert.ok(idSet.has(a2.id));
});

test('listDocSummariesForRepo returns empty for an unregistered repo', async () => {
	const list = await listDocSummariesForRepo(null, '/repo/nope');
	assert.deepEqual(list, []);
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

test('deleteDocSummary drops primary + secondary index', async () => {
	const e = makeDocEntity(REPO_A, `${REPO_A}/design/foo.md`, 'foo');
	await upsertEntities(null, [e]);
	await writeDocSummary(null, e.id, REPO_A, makeSummary());

	await deleteDocSummary(null, e.id);

	assert.equal(await getDocSummary(null, e.id), null);
	assert.equal(await countDocSummariesForRepo(null, REPO_A), 0);
});

test('deleteDocSummariesForRepo scoped drop', async () => {
	const a1 = makeDocEntity(REPO_A, `${REPO_A}/design/a.md`, 'a');
	const a2 = makeDocEntity(REPO_A, `${REPO_A}/design/b.md`, 'b');
	const b1 = makeDocEntity(REPO_B, `${REPO_B}/plans/x.md`, 'x');
	await upsertEntities(null, [a1, a2, b1]);

	await writeDocSummary(null, a1.id, REPO_A, makeSummary());
	await writeDocSummary(null, a2.id, REPO_A, makeSummary());
	await writeDocSummary(null, b1.id, REPO_B, makeSummary({ family: 'plans' }));

	await deleteDocSummariesForRepo(null, REPO_A);

	assert.equal(await countDocSummariesForRepo(null, REPO_A), 0);
	assert.equal(await countDocSummariesForRepo(null, REPO_B), 1);
	assert.equal(await getDocSummary(null, a1.id), null);
	assert.equal(await getDocSummary(null, a2.id), null);
	assert.ok(await getDocSummary(null, b1.id) !== null);
});

// ---------------------------------------------------------------------------
// Cascade via entity delete
// ---------------------------------------------------------------------------

test('deleteEntitiesForFile cascades to the summary row', async () => {
	const file = `${REPO_A}/design/foo.md`;
	const e = makeDocEntity(REPO_A, file, 'foo');
	await upsertEntities(null, [e]);
	await writeDocSummary(null, e.id, REPO_A, makeSummary());
	assert.equal(await countDocSummariesForRepo(null, REPO_A), 1);

	await deleteEntitiesForFile(null, file);

	// Entity gone -> getDocSummary can't resolve the u64, returns null
	assert.equal(await getDocSummary(null, e.id), null);
	// Secondary index entry cleared too
	assert.equal(await countDocSummariesForRepo(null, REPO_A), 0);
});

// ---------------------------------------------------------------------------
// Error-code round-trip
// ---------------------------------------------------------------------------

test('placeholder rows persist the errorCode field', async () => {
	const e = makeDocEntity(REPO_A, `${REPO_A}/design/foo.md`, 'foo');
	await upsertEntities(null, [e]);

	const placeholder = makeSummary({
		errorCode:    'llm-unavailable',
		title:        'foo',
		summary:      '',
		keyDecisions: [],
		keyConstraints: [],
		status:       'unknown',
	});
	await writeDocSummary(null, e.id, REPO_A, placeholder);

	const got = await getDocSummary(null, e.id);
	assert.ok(got !== null);
	assert.equal(got!.errorCode, 'llm-unavailable');
	assert.equal(got!.status, 'unknown');
});
