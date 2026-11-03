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
import { decodeIndexStateRow, decodeUnresolvedRow } from '../graph/codec.js';
import { encodeOutEdgeKey, RELATION_KIND_BYTE } from '../graph/keys.js';
import { commitFile, entityU64ForId, findEntitiesByFile, getEntity } from '../entities.js';
import { SHARED_MODULES_NAMESPACE_BY_LANG, SHARED_MODULES_REPO_ID } from '../../shared/repo-namespaces.js';
import { readIndexState, setUncommittedFiles } from '../index-state.js';
import { addRepo } from '../repos.js';
import type { Entity, RelationWrite } from '../../shared/types.js';
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

test('t3: a commit that throws at its last step leaves every row of the file as before -- entities, relationships and pending rows (read after a reopen)', async () => {
	const [a, b] = [entity(FILE, 'a'), entity(FILE, 'b')];
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [a, b],
		relations: [{ from: a.id, kind: 'CALLS', target: { stored: b.id, meta: { repo: REPO } }, evidence: 'unknown' },
			{ from: a.id, kind: 'IMPORTS', target: { pending: { to: './old', meta: { repo: REPO, file: FILE } } }, evidence: 'unknown' }] });
	const generation = (await readIndexState(REPO))!.generation;

	// The generation advance is the commit's last step (step 6): the write that
	// carries it fails, after the entity, sweep, removal and relationship writes ran.
	const store = await getGraphStore();
	const put = store.indexState.put;
	let failedAtLastStep = false;
	store.indexState.put = ((key: unknown, value: Buffer, ...rest: unknown[]) => {
		if (decodeIndexStateRow(value).generation > generation) { failedAtLastStep = true; throw new Error('the index-state write fails'); }
		return (put as (...args: unknown[]) => unknown).call(store.indexState, key, value, ...rest);
	}) as typeof put;
	const c = entity(FILE, 'c');
	try {
		await assert.rejects(
			commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h2', entities: [c],
				relations: [{ from: c.id, kind: 'IMPORTS', target: { pending: { to: './new', meta: { repo: REPO, file: FILE } } }, evidence: 'unknown' }] }),
			/the index-state write fails/,
		);
	} finally {
		store.indexState.put = put;
	}
	assert.ok(failedAtLastStep, 'the failure came from the generation advance');

	await reopen();
	assert.deepEqual(await names(FILE), ['a', 'b']);
	assert.equal(await edge(a, b), true, 'the removed entity\'s outgoing edge is back');
	assert.deepEqual((await pending()).map(p => p.to), ['./old'], 'the old pending row is back and the new one was not kept');
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

test('t3 (s2 review): a module stub first stored by a file commit goes to the shared-modules rows, not under the workspace, and a refresh does not take it back', async () => {
	const stub: Entity = {
		id: createHash('sha256').update('module\x00typescript\x00some-package').digest('hex').slice(0, 32),
		kind: 'module', name: 'some-package', language: 'typescript', repoId: 0, repo: '', file: '',
		startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: '2026-11-01T00:00:00.000Z',
	};
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [entity(FILE, 'a'), stub], relations: [] });

	const shared = SHARED_MODULES_REPO_ID[SHARED_MODULES_NAMESPACE_BY_LANG['typescript']!];
	assert.equal((await getEntity(null, stub.id))?.repoId, shared);
	assert.deepEqual(await names(FILE), ['a'], 'the stub is not one of the file\'s entities');

	// The file's refresh (and its removal) leave the shared stub in place.
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h2', entities: [entity(FILE, 'b')], relations: [] });
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: null, entities: [], relations: [] });
	assert.equal((await getEntity(null, stub.id))?.repoId, shared);
});

test('t3: an unregistered repository is refused and nothing is written', async () => {
	await assert.rejects(
		commitFile({ repoPath: '/repo/not-registered', filePath: '/repo/not-registered/a.ts', contentHash: 'h', entities: [], relations: [] }),
		/not-registered|UnregisteredRepo|not registered/i,
	);
});

// ---------------------------------------------------------------------------
// t4: the relationship half
// ---------------------------------------------------------------------------

const calls = (from: Entity, to: Entity | string): RelationWrite =>
	({ from: from.id, kind: 'CALLS', target: { stored: typeof to === 'string' ? to : to.id, meta: { repo: REPO } }, evidence: 'unknown' });
const imports = (from: Entity, spec: string): RelationWrite =>
	({ from: from.id, kind: 'IMPORTS', target: { pending: { to: spec, meta: { repo: REPO, file: from.file } } }, evidence: 'unknown' });

async function edge(from: Entity, to: Entity): Promise<boolean> {
	const store = await getGraphStore();
	const [f, t] = [await entityU64ForId(from.id), await entityU64ForId(to.id)];
	return f !== undefined && t !== undefined && store.outEdge.get(encodeOutEdgeKey(f, RELATION_KIND_BYTE['CALLS'], t)) !== undefined;
}
async function pending(): Promise<Array<{ from: string; kind: string; to: string; file: string }>> {
	const store = await getGraphStore();
	return [...store.unresolved.getRange()].map(({ value }) => decodeUnresolvedRow(value as Buffer))
		.map(r => ({ from: r.fromEntity, kind: r.kind, to: r.rawTo, file: r.fromFile })).sort((a, b) => (a.to < b.to ? -1 : 1));
}

test('t4: a refresh replaces the file\'s outgoing relationships and pending rows in the same commit as its entities, and a relationship to an entity not stored becomes a pending row awaiting it', async () => {
	const [keep, helper, other] = [entity(FILE, 'keep'), entity(FILE, 'helper'), entity(OTHER, 'other')];
	await commitFile({ repoPath: REPO, filePath: OTHER, contentHash: 'h1', entities: [other], relations: [] });
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [keep, helper],
		relations: [calls(keep, other), calls(keep, helper), imports(keep, './old')] });
	assert.deepEqual([await edge(keep, other), await edge(keep, helper)], [true, true]);

	// The new parse keeps both entities but calls only `helper` and a function not stored yet, and imports './new'.
	const later = `${'f'.repeat(32)}`;
	const result = await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h2', entities: [keep, helper],
		relations: [calls(keep, helper), calls(keep, later), imports(keep, './new')] });

	assert.deepEqual([await edge(keep, other), await edge(keep, helper)], [false, true], 'keep -> other is gone although both entities survive');
	assert.deepEqual((await pending()).map(p => `${p.kind} ${p.to}`).sort(), [`CALLS ${later}`, 'IMPORTS ./new'], "the old import row is gone; the new import and the call to the unstored function are pending");
	assert.deepEqual([result.relationsStored, result.relationsPending, result.relationsUnwritable], [1, 2, 0]);
});

test('t4: relationships other files hold into surviving entities are left in place by a refresh', async () => {
	const [keep, other] = [entity(FILE, 'keep'), entity(OTHER, 'other')];
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [keep], relations: [] });
	await commitFile({ repoPath: REPO, filePath: OTHER, contentHash: 'h1', entities: [other], relations: [calls(other, keep)] });

	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h2', entities: [entity(FILE, 'keep', 'function keep() { return 2; }')], relations: [] });

	assert.equal(await edge(other, keep), true);
	assert.deepEqual(await pending(), []);
});

test('t4 (ac4): contentHash null removes the file\'s entities, relationships and pending rows together, and returns relationships other files hold into it to pending', async () => {
	const [keep, helper, other] = [entity(FILE, 'keep'), entity(FILE, 'helper'), entity(OTHER, 'other')];
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [keep, helper], relations: [calls(keep, helper), imports(keep, './x')] });
	await commitFile({ repoPath: REPO, filePath: OTHER, contentHash: 'h1', entities: [other], relations: [calls(other, keep)] });

	const result = await commitFile({ repoPath: REPO, filePath: FILE, contentHash: null, entities: [], relations: [] });

	assert.deepEqual(await names(FILE), []);
	assert.equal(result.relationsReturnedToPending, 1);
	// The import row of the removed file is gone; the call other -> keep now awaits keep's id.
	assert.deepEqual(await pending(), [{ from: other.id, kind: 'CALLS', to: keep.id, file: OTHER }]);
	// When the file comes back, the cross-file pass (s1) can complete it: the row awaits the same id.
	assert.equal((await readIndexState(REPO))!.pending['awaiting-target'], 1);
});

