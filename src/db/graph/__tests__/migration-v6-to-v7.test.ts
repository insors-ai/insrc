/**
 * Epic c2ba6fa6, Story s9, t1 -- schema 7: the shared-modules namespaces of
 * the added languages (cargo, nuget, native) and the table/view entity kinds.
 * A v6 store (without the three rows) opens, migrates to 7 and holds them,
 * with its existing entities and relationships read unchanged; a fresh store
 * holds all seven; a module stub of Rust, C#, C or C++ is stored under its
 * namespace's row; the kind bytes and the new languages are in place.
 *
 * Run: npx tsx --test src/db/graph/__tests__/migration-v6-to-v7.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, SCHEMA_VERSION, setGraphStorePath, withWriteTxn } from '../store.js';
import { decodeRepoRow, encodeRepoRow } from '../codec.js';
import { encodeRepoKey, ENTITY_KIND_BYTE, entityKindByteToName } from '../keys.js';
import { commitFile, findEntitiesByFile, getEntity } from '../../entities.js';
import { findCallees } from '../../search.js';
import { addRepo } from '../../repos.js';
import { SHARED_MODULES_NAMESPACE_BY_LANG, SHARED_MODULES_REPO_ID } from '../../../shared/repo-namespaces.js';
import type { Entity, Language, RelationWrite } from '../../../shared/types.js';
import { useTemporaryLance } from '../../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const REPO = '/repo/v6-to-v7';
const FILE = `${REPO}/src/a.ts`;
const NEW = { cargo: 0xFFFFFFFA, nuget: 0xFFFFFFF9, native: 0xFFFFFFF8 } as const;

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-v6-to-v7-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const fn = (name: string): Entity => ({
	id: createHash('sha256').update(`${REPO}\x00${FILE}\x00function\x00${name}`).digest('hex').slice(0, 32),
	kind: 'function', name, language: 'typescript', repoId: 1, repo: REPO, file: FILE,
	startLine: 1, endLine: 2, body: `function ${name}() {}`, embedding: [], indexedAt: '2026-11-02T00:00:00.000Z',
});
async function sharedRows(): Promise<Map<number, string>> {
	const store = await getGraphStore();
	const out = new Map<number, string>();
	for (const { value } of store.repo.getRange()) {
		const row = decodeRepoRow(value as Buffer);
		if (row.kind === 'shared-modules') out.set(row.id, row.namespace ?? '');
	}
	return out;
}

test('s9 t1: a v6 store without the new namespace rows opens at version 7 holding them, its entities and relationships read unchanged', async () => {
	await addRepo(null, { path: REPO, name: 'v6', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
	const [a, b] = [fn('a'), fn('b')];
	const calls: RelationWrite = { from: a.id, kind: 'CALLS', target: { stored: b.id, meta: { repo: REPO } }, evidence: 'extracted' };
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h', entities: [a, b], relations: [calls] });
	// Make it a v6 store: the three rows the step provisions are absent and the version is 6.
	await withWriteTxn(s => {
		for (const id of Object.values(NEW)) s.repo.remove(encodeRepoKey(id));
		s.meta.put('schema_version', 6);
	});
	assert.equal((await sharedRows()).size, 4);
	await closeGraphStore();

	const store = await getGraphStore();
	assert.equal(store.meta.get('schema_version'), 7);
	assert.equal(SCHEMA_VERSION, 7);
	const rows = await sharedRows();
	for (const [ns, id] of Object.entries(NEW)) assert.equal(rows.get(id), ns, ns);
	assert.equal(rows.size, 7);
	assert.deepEqual((await findEntitiesByFile(null, FILE)).map(e => e.name).sort(), ['a', 'b']);
	assert.deepEqual((await findCallees(null, a.id)).map(e => `${e.name}: ${e.evidence}`), ['b: extracted']);
});

test('s9 t1: a fresh store holds all seven shared-modules rows', async () => {
	const rows = await sharedRows();
	assert.deepEqual([...rows.values()].sort(), ['cargo', 'go', 'jvm', 'native', 'npm', 'nuget', 'python']);
	for (const [ns, id] of Object.entries(SHARED_MODULES_REPO_ID)) assert.equal(rows.get(id), ns);
});

test('s9 t1: a module stub of Rust, C#, C or C++ is stored under its namespace row', async () => {
	await addRepo(null, { path: REPO, name: 'stubs', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
	const stub = (language: Language, name: string): Entity => ({
		id: createHash('sha256').update(`module\x00${language}\x00${name}`).digest('hex').slice(0, 32),
		kind: 'module', name, language, repoId: 0, repo: '', file: '', startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: '2026-11-02T00:00:00.000Z',
	});
	const stubs = [stub('rust', 'serde'), stub('csharp', 'System.Linq'), stub('c', 'stdio.h'), stub('cpp', 'vector')];
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h', entities: [fn('main'), ...stubs], relations: [] });

	assert.deepEqual(
		await Promise.all(stubs.map(async s => (await getEntity(null, s.id))?.repoId)),
		[NEW.cargo, NEW.nuget, NEW.native, NEW.native],
	);
	assert.deepEqual(['rust', 'csharp', 'c', 'cpp'].map(l => SHARED_MODULES_NAMESPACE_BY_LANG[l as Language]), ['cargo', 'nuget', 'native', 'native']);
});

test('s9 t1: table and view are appended kind slots 14 and 15, and every earlier slot keeps its byte', () => {
	assert.equal(ENTITY_KIND_BYTE.table, 14);
	assert.equal(ENTITY_KIND_BYTE.view, 15);
	assert.equal(entityKindByteToName(14), 'table');
	assert.equal(entityKindByteToName(15), 'view');
	assert.deepEqual(
		['repo', 'file', 'module', 'function', 'method', 'class', 'interface', 'type', 'variable', 'document', 'section', 'config', 'externalEndpoint'].map(k => ENTITY_KIND_BYTE[k as keyof typeof ENTITY_KIND_BYTE]),
		[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
	);
});
