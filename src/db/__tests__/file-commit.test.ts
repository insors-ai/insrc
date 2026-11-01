/**
 * Epic c2ba6fa6, Story s2 -- commitFile, the one write for a file's rows.
 *
 * t3 (the entity half): the file's previous entities are found through
 * entity_by_file, a removal (contentHash null) takes them all, the repository's
 * generation advances and the file leaves uncommittedFiles in the same
 * transaction, and a commit that throws part-way keeps nothing.
 *
 * Run: npx tsx --test src/db/__tests__/file-commit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, setGraphStorePath } from '../graph/store.js';
import { commitFile, findEntitiesByFile } from '../entities.js';
import { readIndexState, setUncommittedFiles } from '../index-state.js';
import { addRepo } from '../repos.js';
import type { Entity } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const REPO = '/repo/file-commit';
const FILE = `${REPO}/src/a.ts`;
const OTHER = `${REPO}/src/b.ts`;

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-file-commit-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: 'file-commit', addedAt: '2026-11-01T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function entity(file: string, name: string, body = `function ${name}() {}`): Entity {
	return {
		id: createHash('sha256').update(`${REPO}\x00${file}\x00function\x00${name}`).digest('hex').slice(0, 32),
		kind: 'function', name, language: 'typescript', repoId: 1, repo: REPO, file,
		startLine: 1, endLine: 2, body, embedding: [], indexedAt: '2026-11-01T00:00:00.000Z',
	};
}
const names = async (file: string): Promise<string[]> => (await findEntitiesByFile(null, file)).map(e => e.name).sort();

async function reopen(): Promise<void> {
	await closeGraphStore();
	setGraphStorePath(join(dir, 'graph.lmdb'));
}

test('t3: a refresh replaces the file\'s entities in one commit, found through entity_by_file and not a scan of the entity table, and leaves other files alone', async () => {
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [entity(FILE, 'keep'), entity(FILE, 'drop')], relations: [] });
	await commitFile({ repoPath: REPO, filePath: OTHER, contentHash: 'h1', entities: [entity(OTHER, 'other')], relations: [] });

	const store = await getGraphStore();
	const scan = store.entity.getRange;
	store.entity.getRange = (() => { throw new Error('commitFile scanned the entity table'); }) as typeof scan;
	let result;
	try {
		result = await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h2', entities: [entity(FILE, 'keep', 'function keep() { return 1; }'), entity(FILE, 'added')], relations: [] });
	} finally {
		store.entity.getRange = scan;
	}

	assert.deepEqual(await names(FILE), ['added', 'keep']);
	assert.deepEqual(await names(OTHER), ['other']);
	assert.deepEqual([result.entitiesWritten, result.entitiesRemoved], [2, 1]);
});

test('t3: a commit that throws part-way leaves every row of the file as before (read after a reopen)', async () => {
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [entity(FILE, 'a'), entity(FILE, 'b')], relations: [] });
	const generation = (await readIndexState(REPO))!.generation;

	// The index-state write is the commit's last step: it fails after the entity writes ran.
	const store = await getGraphStore();
	const put = store.indexState.put;
	store.indexState.put = (() => { throw new Error('the index-state write fails'); }) as typeof put;
	try {
		await assert.rejects(
			commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h2', entities: [entity(FILE, 'c')], relations: [] }),
			/the index-state write fails/,
		);
	} finally {
		store.indexState.put = put;
	}

	await reopen();
	assert.deepEqual(await names(FILE), ['a', 'b']);
	assert.equal((await readIndexState(REPO))!.generation, generation);
});

test('t3: contentHash null removes every entity of the file in one commit; the generation advances and the file leaves uncommittedFiles', async () => {
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [entity(FILE, 'a'), entity(FILE, 'b')], relations: [] });
	await setUncommittedFiles(REPO, [FILE, OTHER]);
	const before = (await readIndexState(REPO))!.generation;

	// Entities passed with a null hash are not written: the file is gone.
	const result = await commitFile({ repoPath: REPO, filePath: FILE, contentHash: null, entities: [entity(FILE, 'ignored')], relations: [] });

	assert.deepEqual(await names(FILE), []);
	assert.deepEqual([result.entitiesWritten, result.entitiesRemoved], [0, 2]);
	const state = (await readIndexState(REPO))!;
	assert.equal(state.generation, before + 1);
	assert.equal(result.generation, state.generation);
	assert.deepEqual(state.uncommittedFiles, [OTHER]);
});

test('t3: an unregistered repository is refused and nothing is written', async () => {
	await assert.rejects(
		commitFile({ repoPath: '/repo/not-registered', filePath: '/repo/not-registered/a.ts', contentHash: 'h', entities: [], relations: [] }),
		/not-registered|UnregisteredRepo|not registered/i,
	);
});
