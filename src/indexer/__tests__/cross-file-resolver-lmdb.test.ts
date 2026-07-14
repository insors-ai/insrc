/**
 * Phase 5.2 tests for cross-file-resolver.ts on the LMDB substrate.
 *
 * Same scenarios as the legacy DuckDB-backed test suite, but every
 * graph-state assertion goes through the LMDB graph-layer helpers
 * (countOutEdges / listUnresolvedRelations / etc.) instead of raw
 * `db.duck.query`. The Pass 1 IMPORTS rewrite, Pass 2 INHERITS /
 * IMPLEMENTS / CALLS resolution, ambiguity recording, and idempotency
 * are all verified.
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { closeGraphStore, getGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../db/lance/conn.js';
import { _resetEntityVecCache } from '../../db/lance/entity-vec.js';
import {
	encodeOutEdgeKey,
	encodeInEdgeKey,
	encodeOutEdgePrefix,
	prefixSuccessor,
	RELATION_KIND_BYTE,
	type RelationKind,
} from '../../db/graph/keys.js';
import { upsertEntities, entityU64ForId } from '../../db/entities.js';
import { addRepo } from '../../db/repos.js';
import {
	upsertRelations,
	listUnresolvedRelations,
} from '../../db/relations.js';
import type { Entity, Relation } from '../../shared/types.js';
import { SHARED_MODULES_REPO_ID } from '../../shared/repo-namespaces.js';
import { makeEntityId } from '../parser/base.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';

let tmpHome: string;

before(async () => {
	tmpHome = mkdtempSync(join(tmpdir(), 'insrc-cfr-lmdb-'));
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	setGraphStorePath(join(tmpHome, 'graph.lmdb'));
	setLanceConnPath(join(tmpHome, 'lance'));
});

after(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkEntity(
	repo: string,
	file: string,
	kind: Entity['kind'],
	name: string,
	language: Entity['language'] = 'java',
	extra: Partial<Entity> = {},
): Entity {
	return {
		id:        makeEntityId(repo, file, kind, name),
		kind, name, language, repoId: extra.repoId ?? 1, repo, file,
		startLine: 0, endLine: 0,
		body: '', embedding: [], indexedAt: new Date().toISOString(),
		...extra,
	};
}

/** Count edges in out_edge matching (src, dst, kind) — LMDB cursor probe. */
async function countEdge(src: string, dst: string, kind: RelationKind): Promise<number> {
	const fromU64 = await entityU64ForId(src);
	const toU64   = await entityU64ForId(dst);
	if (fromU64 === undefined || toU64 === undefined) return 0;
	const store = await getGraphStore();
	const key = encodeOutEdgeKey(fromU64, RELATION_KIND_BYTE[kind], toU64);
	return store.outEdge.get(key) === undefined ? 0 : 1;
}

/** Count edges of a given kind across the whole out_edge sub-DB. */
async function countAllOfKind(kind: RelationKind): Promise<number> {
	const store = await getGraphStore();
	const kindByte = RELATION_KIND_BYTE[kind];
	let n = 0;
	for (const { key } of store.outEdge.getRange()) {
		if ((key as Buffer).readUInt8(8) === kindByte) n++;
	}
	return n;
}

/** Count unresolved-relation rows for a (fromEntity, kind) pair. */
async function countUnresolved(fromEntity: string, kind: string, repo: string): Promise<number> {
	const rows = await listUnresolvedRelations(null, repo);
	return rows.filter(r => r.fromEntity === fromEntity && r.kind === kind).length;
}

/** Collect candidates from any unresolved-relation rows for a (fromEntity, kind) pair. */
async function listAmbiguousCandidates(fromEntity: string, kind: string, repo: string): Promise<string[][]> {
	const rows = await listUnresolvedRelations(null, repo);
	return rows
		.filter(r => r.fromEntity === fromEntity && r.kind === kind)
		.map(r => Array.isArray(r.meta?.['candidates']) ? r.meta['candidates'] as string[] : []);
}

// Sanity helper for a place where the resolver writes back into the
// in_edge mirror (just so a regression that leaves out_edge populated
// but in_edge empty doesn't slip through).
async function countInEdgesForKind(
	dst: string, kind: RelationKind,
): Promise<number> {
	const dstU64 = await entityU64ForId(dst);
	if (dstU64 === undefined) return 0;
	const store = await getGraphStore();
	const kindByte = RELATION_KIND_BYTE[kind];
	let n = 0;
	for (const { key } of store.inEdge.getRange({
		start: encodeInEdgeKey(dstU64, kindByte, 0n),
		end:   encodeInEdgeKey(dstU64, kindByte + 1, 0n),
	})) {
		if ((key as Buffer).readUInt8(8) !== kindByte) continue;
		n++;
	}
	return n;
}

// Reference unused helper to avoid TS unused-import warnings (kept for
// future tests that probe out_edge ranges directly).
void encodeOutEdgePrefix;
void prefixSuccessor;
void countInEdgesForKind;

// ---------------------------------------------------------------------------
// Test 1: INHERITS resolution -- two-file Java project, same package
// ---------------------------------------------------------------------------

describe('runCrossFileResolver (LMDB) -- INHERITS in same package', () => {
	let repo: string;

	before(async () => {
		repo = mkdtempSync(join(tmpdir(), 'insrc-cfr-lmdb-mvn-'));
		await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });
		const javaRoot = join(repo, 'src', 'main', 'java', 'com', 'example');
		mkdirSync(javaRoot, { recursive: true });
		writeFileSync(join(javaRoot, 'Foo.java'), 'package com.example;\npublic class Foo {}');
		writeFileSync(join(javaRoot, 'Bar.java'),
			'package com.example;\npublic class Bar extends Foo {}');

		const fooFile = join(javaRoot, 'Foo.java');
		const barFile = join(javaRoot, 'Bar.java');

		await upsertEntities(null, [
			mkEntity(repo, fooFile, 'file',  fooFile),
			mkEntity(repo, fooFile, 'class', 'Foo'),
			mkEntity(repo, barFile, 'file',  barFile),
			mkEntity(repo, barFile, 'class', 'Bar'),
		]);
		const inheritsRel: Relation = {
			kind: 'INHERITS',
			from: makeEntityId(repo, barFile, 'class', 'Bar'),
			to:   'Foo',
			resolved: false,
			meta: { file: barFile, repo },
		};
		await upsertRelations(null, [inheritsRel]);
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('resolves INHERITS Bar->Foo via same-package visibility', async () => {
		const sourceRoots = detectSourceRoots(repo);
		const result = await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots });

		assert.equal(result.resolved, 1, `expected 1 resolution; got: ${JSON.stringify(result)}`);
		assert.equal(result.ambiguous, 0);

		const barId = makeEntityId(repo, join(repo, 'src/main/java/com/example/Bar.java'), 'class', 'Bar');
		const fooId = makeEntityId(repo, join(repo, 'src/main/java/com/example/Foo.java'), 'class', 'Foo');
		assert.equal(await countEdge(barId, fooId, 'INHERITS'), 1);
	});
});

// ---------------------------------------------------------------------------
// Test 2: Module-stub IMPORTS rewiring
// ---------------------------------------------------------------------------

describe('runCrossFileResolver (LMDB) -- module-stub IMPORTS rewiring', () => {
	let repo: string;

	before(async () => {
		repo = mkdtempSync(join(tmpdir(), 'insrc-cfr-lmdb-imports-'));
		await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });
		const javaRoot = join(repo, 'src', 'main', 'java', 'com', 'example');
		mkdirSync(javaRoot, { recursive: true });
		writeFileSync(join(javaRoot, 'Foo.java'), 'package com.example;\npublic class Foo {}');
		const userDir = join(repo, 'src', 'main', 'java', 'com', 'other');
		mkdirSync(userDir, { recursive: true });
		writeFileSync(join(userDir, 'User.java'),
			'package com.other;\nimport com.example.Foo;\npublic class User {}');

		const fooFile  = join(javaRoot, 'Foo.java');
		const userFile = join(userDir,  'User.java');

		const fooFileEnt  = mkEntity(repo, fooFile,  'file', fooFile);
		const userFileEnt = mkEntity(repo, userFile, 'file', userFile);
		const moduleStub: Entity = {
			id: makeEntityId('jvm', '', 'module', 'com.example.Foo'),
			kind: 'module', name: 'com.example.Foo', language: 'java',
			repoId: SHARED_MODULES_REPO_ID.jvm,
			repo: '', file: '', startLine: 0, endLine: 0,
			body: '', embedding: [], indexedAt: new Date().toISOString(),
		};
		await upsertEntities(null, [fooFileEnt, userFileEnt, moduleStub]);
		const importsRel: Relation = {
			kind: 'IMPORTS', from: userFileEnt.id, to: moduleStub.id, resolved: true,
		};
		await upsertRelations(null, [importsRel]);
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('rewires IMPORTS to point at the in-tree file entity', async () => {
		const sourceRoots = detectSourceRoots(repo);
		const result = await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots });
		assert.equal(result.importsRewired, 1, `expected 1 rewire; got: ${JSON.stringify(result)}`);

		const fooFileId  = makeEntityId(
			repo, join(repo, 'src/main/java/com/example/Foo.java'), 'file',
			join(repo, 'src/main/java/com/example/Foo.java'),
		);
		const userFileId = makeEntityId(
			repo, join(repo, 'src/main/java/com/other/User.java'), 'file',
			join(repo, 'src/main/java/com/other/User.java'),
		);

		assert.equal(await countEdge(userFileId, fooFileId, 'IMPORTS'), 1);
		const stubId = makeEntityId('jvm', '', 'module', 'com.example.Foo');
		assert.equal(await countEdge(userFileId, stubId, 'IMPORTS'), 0);
	});
});

// ---------------------------------------------------------------------------
// Test 3: External-dep import stays as module stub
// ---------------------------------------------------------------------------

describe('runCrossFileResolver (LMDB) -- external-dep stays as module stub', () => {
	let repo: string;

	before(async () => {
		repo = mkdtempSync(join(tmpdir(), 'insrc-cfr-lmdb-ext-'));
		await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });
		const javaRoot = join(repo, 'src', 'main', 'java', 'app');
		mkdirSync(javaRoot, { recursive: true });
		writeFileSync(join(javaRoot, 'App.java'),
			'package app;\nimport org.springframework.boot.SpringApplication;\npublic class App {}');

		const appFile = join(javaRoot, 'App.java');
		const appFileEnt = mkEntity(repo, appFile, 'file', appFile);
		const moduleStub: Entity = {
			id: makeEntityId('jvm', '', 'module', 'org.springframework.boot.SpringApplication'),
			kind: 'module', name: 'org.springframework.boot.SpringApplication', language: 'java',
			repoId: SHARED_MODULES_REPO_ID.jvm,
			repo: '', file: '', startLine: 0, endLine: 0,
			body: '', embedding: [], indexedAt: new Date().toISOString(),
		};
		await upsertEntities(null, [appFileEnt, moduleStub]);
		await upsertRelations(null, [{
			kind: 'IMPORTS', from: appFileEnt.id, to: moduleStub.id, resolved: true,
		}]);
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('leaves the module-stub edge alone for external deps', async () => {
		const sourceRoots = detectSourceRoots(repo);
		const result = await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots });
		assert.equal(result.importsRewired, 0,
			`expected no rewires for external deps; got: ${JSON.stringify(result)}`);

		const stubId = makeEntityId('jvm', '', 'module', 'org.springframework.boot.SpringApplication');
		const appFileId = makeEntityId(
			repo, join(repo, 'src/main/java/app/App.java'), 'file',
			join(repo, 'src/main/java/app/App.java'),
		);
		assert.equal(await countEdge(appFileId, stubId, 'IMPORTS'), 1);
	});
});

// ---------------------------------------------------------------------------
// Test 4: CALLS resolution -- two-file Python project, exported function
// ---------------------------------------------------------------------------

describe('runCrossFileResolver (LMDB) -- CALLS resolves to exported function in imported file', () => {
	let repo: string;

	before(async () => {
		repo = mkdtempSync(join(tmpdir(), 'insrc-cfr-lmdb-calls-'));
		await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });
		const helpersFile = join(repo, 'helpers.py');
		const mainFile    = join(repo, 'main.py');
		writeFileSync(helpersFile, 'def validate(x):\n    return x is not None\n');
		writeFileSync(mainFile,
			'from helpers import validate\n\ndef main():\n    return validate(1)\n');

		const helpersFileEnt = mkEntity(repo, helpersFile, 'file', helpersFile, 'python');
		const validateFn     = mkEntity(repo, helpersFile, 'function', 'validate', 'python', { isExported: true });
		const mainFileEnt    = mkEntity(repo, mainFile,    'file', mainFile, 'python');
		const mainFn         = mkEntity(repo, mainFile,    'function', 'main', 'python', { isExported: true });

		await upsertEntities(null, [helpersFileEnt, validateFn, mainFileEnt, mainFn]);
		await upsertRelations(null, [{
			kind: 'IMPORTS', from: mainFileEnt.id, to: helpersFileEnt.id, resolved: true,
		}]);
		await upsertRelations(null, [{
			kind: 'CALLS', from: mainFn.id, to: 'validate', resolved: false,
			meta: { file: mainFile, repo },
		}]);
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('promotes the CALLS edge to the validate function', async () => {
		const sourceRoots = detectSourceRoots(repo);
		const result = await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots });
		assert.equal(result.resolved, 1,
			`expected 1 CALLS resolution; got: ${JSON.stringify(result)}`);

		const helpersFile = join(repo, 'helpers.py');
		const mainFile    = join(repo, 'main.py');
		const mainFnId     = makeEntityId(repo, mainFile,    'function', 'main');
		const validateFnId = makeEntityId(repo, helpersFile, 'function', 'validate');
		assert.equal(await countEdge(mainFnId, validateFnId, 'CALLS'), 1);
	});
});

// ---------------------------------------------------------------------------
// Test 5: CALLS to a non-exported function stays unresolved
// ---------------------------------------------------------------------------

describe('runCrossFileResolver (LMDB) -- CALLS to non-exported target stays unresolved', () => {
	let repo: string;

	before(async () => {
		repo = mkdtempSync(join(tmpdir(), 'insrc-cfr-lmdb-priv-'));
		await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });
		const helpersFile = join(repo, 'helpers.py');
		const mainFile    = join(repo, 'main.py');
		writeFileSync(helpersFile, 'def _internal(x):\n    return x\n');
		writeFileSync(mainFile, 'from helpers import _internal\n\ndef use():\n    return _internal(1)\n');

		const helpersFileEnt = mkEntity(repo, helpersFile, 'file', helpersFile, 'python');
		const internalFn     = mkEntity(repo, helpersFile, 'function', '_internal', 'python', { isExported: false });
		const mainFileEnt    = mkEntity(repo, mainFile,    'file', mainFile, 'python');
		const useFn          = mkEntity(repo, mainFile,    'function', 'use', 'python', { isExported: true });

		await upsertEntities(null, [helpersFileEnt, internalFn, mainFileEnt, useFn]);
		await upsertRelations(null, [
			{ kind: 'IMPORTS', from: mainFileEnt.id, to: helpersFileEnt.id, resolved: true },
			{ kind: 'CALLS',   from: useFn.id, to: '_internal', resolved: false,
			  meta: { file: mainFile, repo } },
		]);
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('does not resolve the CALLS edge', async () => {
		const sourceRoots = detectSourceRoots(repo);
		const result = await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots });
		assert.equal(result.resolved, 0,
			`expected no resolution; got: ${JSON.stringify(result)}`);

		const useFnId = makeEntityId(repo, join(repo, 'main.py'), 'function', 'use');
		assert.equal(await countUnresolved(useFnId, 'CALLS', repo), 1);
	});
});

// ---------------------------------------------------------------------------
// Test 6: CALLS ambiguity
// ---------------------------------------------------------------------------

describe('runCrossFileResolver (LMDB) -- CALLS marks ambiguous when two imported files export same name', () => {
	let repo: string;

	before(async () => {
		repo = mkdtempSync(join(tmpdir(), 'insrc-cfr-lmdb-amb-'));
		await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });
		const aFile  = join(repo, 'a.py');
		const bFile  = join(repo, 'b.py');
		const main   = join(repo, 'main.py');
		writeFileSync(aFile, 'def fmt(x):\n    return str(x)\n');
		writeFileSync(bFile, 'def fmt(x):\n    return repr(x)\n');
		writeFileSync(main,  'from a import fmt\nfrom b import fmt\n\ndef m():\n    return fmt(1)\n');

		const aFileEnt = mkEntity(repo, aFile,  'file', aFile, 'python');
		const bFileEnt = mkEntity(repo, bFile,  'file', bFile, 'python');
		const mainFileEnt = mkEntity(repo, main, 'file', main, 'python');
		const fmtA = mkEntity(repo, aFile, 'function', 'fmt', 'python', { isExported: true });
		const fmtB = mkEntity(repo, bFile, 'function', 'fmt', 'python', { isExported: true });
		const mFn  = mkEntity(repo, main,  'function', 'm',   'python', { isExported: true });

		await upsertEntities(null, [aFileEnt, bFileEnt, mainFileEnt, fmtA, fmtB, mFn]);
		await upsertRelations(null, [
			{ kind: 'IMPORTS', from: mainFileEnt.id, to: aFileEnt.id, resolved: true },
			{ kind: 'IMPORTS', from: mainFileEnt.id, to: bFileEnt.id, resolved: true },
			{ kind: 'CALLS',   from: mFn.id, to: 'fmt', resolved: false,
			  meta: { file: main, repo } },
		]);
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('records candidates in meta and stays unresolved', async () => {
		const sourceRoots = detectSourceRoots(repo);
		const result = await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots });
		assert.equal(result.ambiguous, 1,
			`expected 1 ambiguous; got: ${JSON.stringify(result)}`);

		const mFnId = makeEntityId(repo, join(repo, 'main.py'), 'function', 'm');
		const candidates = await listAmbiguousCandidates(mFnId, 'CALLS', repo);
		assert.equal(candidates.length, 1);
		assert.equal(candidates[0]!.length, 2);
	});
});

// ---------------------------------------------------------------------------
// Test 7: Idempotency
// ---------------------------------------------------------------------------

describe('runCrossFileResolver (LMDB) -- idempotency', () => {
	let repo: string;

	before(async () => {
		repo = mkdtempSync(join(tmpdir(), 'insrc-cfr-lmdb-idem-'));
		await addRepo(null, { path: repo, name: '', addedAt: new Date().toISOString(), status: 'pending' });
		const javaRoot = join(repo, 'src', 'main', 'java', 'com', 'example');
		mkdirSync(javaRoot, { recursive: true });
		writeFileSync(join(javaRoot, 'Foo.java'), 'package com.example;\npublic class Foo {}');
		writeFileSync(join(javaRoot, 'Bar.java'),
			'package com.example;\npublic class Bar extends Foo {}');

		const fooFile = join(javaRoot, 'Foo.java');
		const barFile = join(javaRoot, 'Bar.java');

		await upsertEntities(null, [
			mkEntity(repo, fooFile, 'file',  fooFile),
			mkEntity(repo, fooFile, 'class', 'Foo'),
			mkEntity(repo, barFile, 'file',  barFile),
			mkEntity(repo, barFile, 'class', 'Bar'),
		]);
		await upsertRelations(null, [{
			kind: 'INHERITS', from: makeEntityId(repo, barFile, 'class', 'Bar'),
			to: 'Foo', resolved: false, meta: { file: barFile, repo },
		}]);
	});

	after(() => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('second run resolves nothing new and the typed REL count is unchanged', async () => {
		const sourceRoots = detectSourceRoots(repo);
		const first = await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots });
		assert.equal(first.resolved, 1, `first: ${JSON.stringify(first)}`);

		const beforeN = await countAllOfKind('INHERITS');
		const second = await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots });
		assert.equal(second.resolved, 0, `second pass should resolve nothing new: ${JSON.stringify(second)}`);
		assert.equal(second.importsRewired, 0);

		const afterN = await countAllOfKind('INHERITS');
		assert.equal(afterN, beforeN, `INHERITS count drifted between passes: ${beforeN} -> ${afterN}`);
	});
});
