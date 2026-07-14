/**
 * Phase 5.2 + 5.3 tests for the repo-registry strict-contract design
 * (plans/repo-registry-strict-contract.md).
 *
 * Two slices in one file because both verify the same invariant from
 * complementary angles:
 *
 *   5.2 -- schema-contract enforcement
 *     Storage layer is a pure writer: it never auto-allocates a Repo
 *     registry row. `upsertEntities` with an unknown workspace path
 *     throws `UnregisteredRepoError`; the registry is unchanged.
 *
 *   5.3 -- shared-modules namespace correctness
 *     A Java module entity and a Python module entity that share a
 *     dotted name produce distinct stable IDs (different namespaces
 *     prepended into the hash) and live under different reserved
 *     repoId rows. Same-language module entities collapse to a single
 *     namespace row (Java + Scala -> jvm).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import {
	closeGraphStore,
	getGraphStore,
	setGraphStorePath,
} from '../graph/store.js';
import { upsertEntities } from '../entities.js';
import {
	addRepo,
	listRepos,
	UnregisteredRepoError,
} from '../repos.js';
import {
	SHARED_MODULES_REPO_ID,
	type SharedModulesNamespace,
} from '../../shared/repo-namespaces.js';
import { decodeRepoRow } from '../graph/codec.js';
import { encodeRepoKey } from '../graph/keys.js';
import type { Entity } from '../../shared/types.js';

let dir: string;
const NOW = '2026-05-08T10:00:00.000Z';

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-repo-strict-5.x-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mirror of `indexer/parser/base.ts:makeEntityId` so tests don't need
 * to import a parser to compute expected entity IDs.
 */
function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

/**
 * Build a workspace entity fixture. `repoId` defaults to 1 -- callers
 * are responsible for `addRepo()` if they want it to round-trip.
 */
function workspaceEntity(repo: string, repoId: number, name: string): Entity {
	const file = `${repo}/src/${name}.ts`;
	return {
		id:        makeEntityId(repo, file, 'function', name),
		kind:      'function',
		name,
		language:  'typescript',
		repoId,
		repo,
		file,
		startLine: 1,
		endLine:   5,
		body:      `function ${name}() {}`,
		embedding: [],
		indexedAt: NOW,
	};
}

/**
 * Build a module-stub entity (kind='module'). The repoId names a
 * shared-modules namespace; storage will accept it because the
 * v2->v3 migration provisioned all four reserved rows on first boot.
 */
function moduleEntity(language: Entity['language'], moduleName: string, namespace: SharedModulesNamespace): Entity {
	const repoId = SHARED_MODULES_REPO_ID[namespace];
	return {
		// Hash with the namespace as the first arg so cross-namespace
		// name collisions get distinct IDs (matches parser/base.ts +
		// the v2->v3 migration's id formula).
		id:        makeEntityId(namespace, '', 'module', moduleName),
		kind:      'module',
		name:      moduleName,
		language,
		repoId,
		repo:      '',
		file:      '',
		startLine: 0,
		endLine:   0,
		body:      '',
		embedding: [],
		indexedAt: NOW,
	};
}

// ---------------------------------------------------------------------------
// Phase 5.2 -- schema-contract enforcement
// ---------------------------------------------------------------------------

test('5.2: upsertEntities throws UnregisteredRepoError for an unregistered workspace path', async () => {
	const ent = workspaceEntity('/repo/never-registered', 1, 'foo');
	await assert.rejects(
		() => upsertEntities(null, [ent]),
		(err: unknown) => {
			assert.ok(err instanceof UnregisteredRepoError);
			assert.equal((err as UnregisteredRepoError).repo, '/repo/never-registered');
			assert.match((err as Error).message, /not registered/);
			return true;
		},
	);
});

test('5.2: failed upsert leaves the repo sub-DB untouched (no auto-allocation)', async () => {
	// listRepos returns workspace-only; pre-state is empty.
	assert.equal((await listRepos(null)).length, 0,
		'no workspace rows expected before failed upsert');

	const ent = workspaceEntity('/repo/never-registered', 1, 'foo');
	await assert.rejects(() => upsertEntities(null, [ent]), UnregisteredRepoError);

	assert.equal((await listRepos(null)).length, 0,
		'storage layer must not auto-allocate the failed path');
});

test('5.2: upsertEntities succeeds once the path is pre-registered via addRepo', async () => {
	await addRepo(null, { path: '/repo/registered', name: '', addedAt: NOW, status: 'pending' });

	// Look up the allocated id -- workspace ids start at 1 and grow
	// monotonically; this is the only workspace row, so id=1.
	const repos = await listRepos(null);
	const ws = repos.find(r => r.kind === 'workspace' && r.path === '/repo/registered');
	assert.ok(ws, 'addRepo should have written the workspace row');

	const store = await getGraphStore();
	let allocatedId: number | undefined;
	for (const { key } of store.repo.getRange()) {
		const buf = key as Buffer;
		const id = buf.readUInt32BE(0);
		if (id < 0xFFFFFFFB) {
			allocatedId = id;
			break;
		}
	}
	assert.ok(allocatedId !== undefined, 'expected at least one workspace repoId');

	const ent = workspaceEntity('/repo/registered', allocatedId, 'foo');
	await upsertEntities(null, [ent]);
	// No throw == pass.
});

test('5.2: storage layer never writes a non-shared-modules repo row outside addRepo()', async () => {
	// Pre-register one workspace via addRepo.
	await addRepo(null, { path: '/repo/explicit', name: '', addedAt: NOW, status: 'pending' });

	// Try to write a bunch of entities, some referencing the registered
	// path, some referencing a never-registered path.
	const okEnt = workspaceEntity('/repo/explicit', 1, 'a');
	const badEnt = workspaceEntity('/repo/sneaky', 1, 'b');

	await assert.rejects(
		() => upsertEntities(null, [okEnt, badEnt]),
		UnregisteredRepoError,
	);

	// Registry should still contain only the explicit workspace row.
	const workspaces = await listRepos(null);
	assert.equal(workspaces.length, 1, 'only the explicit workspace should be registered');
	assert.equal(workspaces[0]!.path, '/repo/explicit');
});

test('5.2: module entities (empty repo path) bypass strict lookup via namespace fallback', async () => {
	// No addRepo call -- module entities resolve their repoId via
	// SHARED_MODULES_NAMESPACE_BY_LANG[language]. The reserved rows
	// were provisioned by the v2->v3 migration on first boot.
	const javaModule = moduleEntity('java', 'org.apache.foo.Bar', 'jvm');
	await upsertEntities(null, [javaModule]);
	// No throw == pass.
});

test('5.2: UnregisteredRepoError is throwable + introspectable', () => {
	const errPath = new UnregisteredRepoError('/some/path');
	assert.equal(errPath.name, 'UnregisteredRepoError');
	assert.equal(errPath.repo, '/some/path');
	assert.match(errPath.message, /\/some\/path/);

	const errId = new UnregisteredRepoError(42);
	assert.equal(errId.repo, 42);
	assert.match(errId.message, /repoId 42/);
});

// ---------------------------------------------------------------------------
// Phase 5.3 -- shared-modules namespace correctness
// ---------------------------------------------------------------------------

test('5.3: same module name in Java vs Python produces distinct entity IDs', async () => {
	// Both languages can express dotted names; collisions are realistic.
	const javaMod   = moduleEntity('java',   'foo.bar', 'jvm');
	const pythonMod = moduleEntity('python', 'foo.bar', 'python');

	// Strict-contract: parsers + the v2->v3 migration both hash module
	// IDs with the namespace as the first arg of `makeEntityId`. So a
	// Java `foo.bar` and a Python `foo.bar` get distinct *string* IDs,
	// not just distinct repoIds.
	assert.notEqual(javaMod.id, pythonMod.id, 'string ids must differ -- different namespace prefix');
	assert.notEqual(javaMod.repoId, pythonMod.repoId, 'repoIds must differ -- different namespaces');

	// Both upserts succeed (no UnregisteredRepoError; reserved rows
	// were provisioned on first boot).
	await upsertEntities(null, [javaMod, pythonMod]);

	// name_index must have two rows -- one per (repoId, kindByte, name)
	// triple. We verify by listing the name_index's key range and
	// confirming both reserved-id keys are present.
	const store = await getGraphStore();
	const seenRepoIds = new Set<number>();
	for (const { key } of store.nameIndex.getRange()) {
		const buf = key as Buffer;
		const repoId = buf.readUInt32BE(0);
		seenRepoIds.add(repoId);
	}
	assert.ok(seenRepoIds.has(SHARED_MODULES_REPO_ID.jvm),    'jvm name_index entry present');
	assert.ok(seenRepoIds.has(SHARED_MODULES_REPO_ID.python), 'python name_index entry present');
});

test('5.3: Java + Scala module entities share the jvm namespace row (no separate row per language)', async () => {
	const javaMod  = moduleEntity('java',  'org.foo.Bar', 'jvm');
	const scalaMod = moduleEntity('scala', 'org.foo.Bar', 'jvm');

	// Both have repoId = SHARED_MODULES_REPO_ID.jvm.
	assert.equal(javaMod.repoId, scalaMod.repoId);
	assert.equal(javaMod.repoId, SHARED_MODULES_REPO_ID.jvm);

	// Same string ID (hash inputs match) -> ensure-exists upsert
	// semantics make this a single physical entity row, regardless
	// of which language emitted it first.
	assert.equal(javaMod.id, scalaMod.id);

	await upsertEntities(null, [javaMod, scalaMod]);

	// Only one entity-row should exist for this hash.
	const store = await getGraphStore();
	const u64 = store.entityIdByString.get(javaMod.id) as bigint | undefined;
	assert.ok(u64 !== undefined, 'entity must round-trip');

	// listRepos returns workspace-only; we never called addRepo.
	assert.equal((await listRepos(null)).length, 0, 'no workspace rows expected');

	// Iterate the repo sub-DB directly to count the reserved rows.
	const repoRows: Array<{ id: number; row: ReturnType<typeof decodeRepoRow> }> = [];
	for (const { key, value } of store.repo.getRange()) {
		repoRows.push({
			id:  (key as Buffer).readUInt32BE(0),
			row: decodeRepoRow(value as Buffer),
		});
	}
	const sm = repoRows.filter(r => r.row.kind === 'shared-modules');
	assert.equal(sm.length, 4, 'four shared-modules rows always present');
});

test('5.3: every shared-modules namespace gets its own reserved repoId (4 distinct rows)', async () => {
	// Trigger first-boot provisioning by opening the env.
	const store = await getGraphStore();

	// Iterate the repo sub-DB directly -- listRepos filters out
	// shared-modules rows by design.
	const namespaces = new Set<string>();
	let smCount = 0;
	for (const { value } of store.repo.getRange()) {
		const row = decodeRepoRow(value as Buffer);
		if (row.kind !== 'shared-modules') continue;
		smCount++;
		if (row.namespace !== undefined) namespaces.add(row.namespace);
	}
	assert.equal(smCount, 4, 'expected exactly 4 shared-modules rows');
	assert.deepEqual(
		[...namespaces].sort(),
		['go', 'jvm', 'npm', 'python'],
		'all four namespaces present',
	);

	// Each namespace's reserved id is distinct.
	const reservedIds = new Set(Object.values(SHARED_MODULES_REPO_ID));
	assert.equal(reservedIds.size, 4, 'reserved IDs are pairwise distinct');
});

test('5.3: reserved shared-modules row has empty path + namespace tag in storage', async () => {
	await getGraphStore();
	const store = await getGraphStore();

	for (const namespace of ['jvm', 'npm', 'python', 'go'] as const) {
		const reservedId = SHARED_MODULES_REPO_ID[namespace];
		const buf = store.repo.get(encodeRepoKey(reservedId)) as Buffer | undefined;
		assert.ok(buf, `reserved row for ${namespace} must be present`);
		const row = decodeRepoRow(buf);
		assert.equal(row.kind, 'shared-modules');
		assert.equal(row.namespace, namespace);
		assert.equal(row.path, '', 'shared-modules row carries no filesystem path');
	}
});
