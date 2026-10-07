/**
 * resolveScope: one function turns a scope's kind + value into the
 * repo, the directory lookups run in, the entity or the connection.
 *
 * The registry, entity and connection readers are passed in -- no
 * LMDB, no files, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedConnections } from '../../../daemon/db/config.js';
import type { AnalyzeScopeRef } from '../../../shared/analyze-types.js';
import type { Entity, RegisteredRepo } from '../../../shared/types.js';
import { ScopeNotIndexedError, ScopeRefUnresolvedError } from '../invariants.js';
import { resolveScope, type ScopeDeps } from '../scope.js';

const OUTER = '/work/mono';
const INNER = '/work/mono/packages/app';
const OTHER = '/work/other';

function repo(path: string, status = 'ready'): RegisteredRepo {
	return { path, status } as unknown as RegisteredRepo;
}

function entity(file: string, name: string, kind = 'function', startLine = 1): Entity {
	return { id: `id:${file}:${kind}:${name}:${startLine}`, kind, name, file, startLine } as unknown as Entity;
}

interface Fixture {
	repos?:        readonly RegisteredRepo[];
	entities?:     readonly Entity[];
	/** repo path -> connection ids, or an Error to throw for that repo. */
	connections?:  Readonly<Record<string, readonly string[] | Error>>;
	registryFails?: boolean;
}

function deps(f: Fixture = {}): ScopeDeps & { calls: string[] } {
	const repos    = f.repos ?? [repo(OUTER), repo(INNER), repo(OTHER)];
	const entities = f.entities ?? [];
	const calls: string[] = [];
	return {
		calls,
		listRepos: async () => {
			calls.push('listRepos');
			if (f.registryFails === true) throw new Error('graph store not initialised');
			return repos;
		},
		findEntitiesByFile: async (file) => {
			calls.push(`findEntitiesByFile:${file}`);
			return entities.filter(e => e.file === file);
		},
		listEntitiesForRepo: async (repoPath) => {
			calls.push(`listEntitiesForRepo:${repoPath}`);
			return entities.filter(e => e.file === repoPath || e.file.startsWith(`${repoPath}/`));
		},
		loadConnections: async (repoPath) => {
			calls.push(`loadConnections:${repoPath}`);
			const entry = f.connections?.[repoPath] ?? [];
			if (entry instanceof Error) throw entry;
			const resolved = entry.map(id => ({ id, kind: 'sqlite' }));
			return { file: { connections: resolved }, resolved, warnings: [] } as unknown as LoadedConnections;
		},
	};
}

async function rejection(run: () => Promise<unknown>): Promise<Error> {
	try { await run(); } catch (err) { return err as Error; }
	assert.fail('expected resolveScope to reject');
}

// ---------------------------------------------------------------------------
// The seven kinds
// ---------------------------------------------------------------------------

test('resolveScope for each of the seven kinds, with nested repos', async () => {
	const file = `${INNER}/src/pay.ts`;
	const d = deps({
		entities:    [entity(file, 'settle'), entity(file, 'refund')],
		connections: { [OTHER]: ['ledger-db'] },
	});

	assert.deepEqual(await resolveScope({ kind: 'repo', value: INNER }, d), {
		kind: 'repo', value: INNER, repoPath: INNER, lookupPath: INNER,
	});
	assert.deepEqual(await resolveScope({ kind: 'workspace', value: OUTER }, d), {
		kind: 'workspace', value: OUTER, repoPath: OUTER, lookupPath: OUTER,
	});
	// A module of the inner repo: the INNER repo contains it, not the outer one.
	assert.deepEqual(await resolveScope({ kind: 'module', value: `${INNER}/src` }, d), {
		kind: 'module', value: `${INNER}/src`, repoPath: INNER, lookupPath: `${INNER}/src`,
	});
	// A module of the outer repo, beside the inner one.
	assert.deepEqual(await resolveScope({ kind: 'module', value: `${OUTER}/tools` }, d), {
		kind: 'module', value: `${OUTER}/tools`, repoPath: OUTER, lookupPath: `${OUTER}/tools`,
	});
	assert.deepEqual(await resolveScope({ kind: 'manifest-dir', value: `${INNER}/deploy` }, d), {
		kind: 'manifest-dir', value: `${INNER}/deploy`, repoPath: INNER, lookupPath: `${INNER}/deploy`,
	});
	assert.deepEqual(await resolveScope({ kind: 'file', value: file }, d), {
		kind: 'file', value: file, repoPath: INNER, lookupPath: INNER, filePath: file,
	});
	assert.deepEqual(await resolveScope({ kind: 'symbol', value: `${file}#settle` }, d), {
		kind: 'symbol', value: `${file}#settle`, repoPath: INNER, lookupPath: INNER,
		filePath: file, entityId: `id:${file}:function:settle:1`, entityName: 'settle',
	});
	assert.deepEqual(await resolveScope({ kind: 'connection', value: 'ledger-db' }, d), {
		kind: 'connection', value: 'ledger-db', repoPath: OTHER, lookupPath: OTHER, connectionId: 'ledger-db',
	});
});

test('a sibling directory that only shares a name prefix is not inside the repo', async () => {
	const r = await resolveScope({ kind: 'module', value: '/work/mono-tools/src' }, deps());
	assert.equal(r.repoPath, null);
});

// ---------------------------------------------------------------------------
// Directory kinds
// ---------------------------------------------------------------------------

test('resolveScope directory kinds keep their own directory as lookupPath; a path in no repo gives repoPath null', async () => {
	const d = deps();
	for (const kind of ['repo', 'module', 'manifest-dir', 'workspace'] as const) {
		const inside = await resolveScope({ kind, value: `${INNER}/src/billing` }, d);
		// Lookups run in the scope's own directory, NOT the repo root.
		assert.equal(inside.lookupPath, `${INNER}/src/billing`, kind);
		assert.notEqual(inside.lookupPath, inside.repoPath, kind);
		assert.equal(inside.repoPath, INNER, kind);

		const outside = await resolveScope({ kind, value: '/elsewhere/proj' }, d);
		assert.equal(outside.repoPath, null, kind);
		assert.equal(outside.lookupPath, '/elsewhere/proj', kind);
	}
	// A file in no registered repo: lookups run in the file's directory.
	const loose = await resolveScope({ kind: 'file', value: '/elsewhere/proj/a.ts' }, d);
	assert.deepEqual(loose, {
		kind: 'file', value: '/elsewhere/proj/a.ts', repoPath: null,
		lookupPath: '/elsewhere/proj', filePath: '/elsewhere/proj/a.ts',
	});
});

test('a registry that cannot be read leaves the repo unknown for the file-system kinds', async () => {
	const d = deps({ registryFails: true });
	const mod = await resolveScope({ kind: 'module', value: `${INNER}/src` }, d);
	assert.deepEqual(mod, { kind: 'module', value: `${INNER}/src`, repoPath: null, lookupPath: `${INNER}/src` });
	const file = await resolveScope({ kind: 'file', value: `${INNER}/src/a.ts` }, d);
	assert.equal(file.repoPath, null);
	assert.equal(file.lookupPath, `${INNER}/src`);
	// A symbol and a connection cannot be resolved without it: the error propagates.
	const sym = await rejection(() => resolveScope({ kind: 'symbol', value: `${INNER}/src/a.ts#f` }, d));
	assert.match(sym.message, /graph store not initialised/);
	const conn = await rejection(() => resolveScope({ kind: 'connection', value: 'x' }, d));
	assert.match(conn.message, /graph store not initialised/);
});

// ---------------------------------------------------------------------------
// Symbol
// ---------------------------------------------------------------------------

test("resolveScope symbol cases: split, no '#', none, two, '#' in the path", async () => {
	const file  = `${INNER}/src/pay.ts`;
	const hashy = `${INNER}/src/c#/pay.ts`;
	const d = deps({
		entities: [
			entity(file, 'settle'),
			entity(file, 'run', 'method', 10),
			entity(file, 'run', 'method', 42),
			entity(hashy, 'settle', 'function', 7),
		],
	});

	// split at the LAST '#': the path keeps its own.
	const viaHashPath = await resolveScope({ kind: 'symbol', value: `${hashy}#settle` }, d);
	assert.equal(viaHashPath.filePath, hashy);
	assert.equal(viaHashPath.entityName, 'settle');
	assert.equal(viaHashPath.entityId, `id:${hashy}:function:settle:7`);

	// no '#', and the two degenerate splits.
	for (const value of [file, `${file}#`, '#settle']) {
		const err = await rejection(() => resolveScope({ kind: 'symbol', value }, d));
		assert.ok(err instanceof ScopeRefUnresolvedError, `${value} -> ${err.name}`);
		assert.match(err.message, /<absolute file path>#<entity name>/);
	}

	// no entity of that name.
	const none = await rejection(() => resolveScope({ kind: 'symbol', value: `${file}#missing` }, d));
	assert.ok(none instanceof ScopeRefUnresolvedError);
	assert.match(none.message, /no stored entity named 'missing'/);

	// two entities of that name: both are listed, with kind and line.
	const two = await rejection(() => resolveScope({ kind: 'symbol', value: `${file}#run` }, d));
	assert.ok(two instanceof ScopeRefUnresolvedError);
	assert.match(two.message, /2 stored entities named 'run'/);
	assert.match(two.message, /method 'run' at line 10/);
	assert.match(two.message, /method 'run' at line 42/);

	// A file scope whose path contains '#' is not split.
	const asFile = await resolveScope({ kind: 'file', value: hashy }, d);
	assert.equal(asFile.filePath, hashy);
});

test('resolveScope symbol not-indexed cases: empty repo, no containing repo, empty registry', async () => {
	const file = `${INNER}/src/pay.ts`;

	// (1) A registered repo with no stored entities.
	const emptyRepo = deps({ repos: [repo(INNER, 'indexing')], entities: [] });
	const e1 = await rejection(() => resolveScope({ kind: 'symbol', value: `${file}#settle` }, emptyRepo));
	assert.ok(e1 instanceof ScopeNotIndexedError, `got ${e1.name}: ${e1.message}`);
	assert.equal((e1 as ScopeNotIndexedError).registeredAs, INNER);
	assert.equal((e1 as ScopeNotIndexedError).scopePath, file);
	assert.match(e1.message, /status: indexing/);
	// The file was read first; finding nothing there, the repo was read
	// to tell "not indexed" from "no entity of that name".
	assert.deepEqual(
		emptyRepo.calls.filter(c => !c.startsWith('listRepos')),
		[`findEntitiesByFile:${file}`, `listEntitiesForRepo:${INNER}`],
	);

	// (2) No registered repo contains the file.
	const elsewhere = deps({ repos: [repo(OTHER)], entities: [entity(file, 'settle')] });
	const e2 = await rejection(() => resolveScope({ kind: 'symbol', value: `${file}#settle` }, elsewhere));
	assert.ok(e2 instanceof ScopeNotIndexedError, `got ${e2.name}`);
	assert.equal((e2 as ScopeNotIndexedError).registeredAs, undefined);
	assert.match(e2.message, /no registered repo contains the scope path/);

	// (3) No repo registered at all. The file-system kinds proceed; a symbol cannot.
	const pristine = deps({ repos: [] });
	const e3 = await rejection(() => resolveScope({ kind: 'symbol', value: `${file}#settle` }, pristine));
	assert.ok(e3 instanceof ScopeNotIndexedError, `got ${e3.name}`);
	assert.equal((e3 as ScopeNotIndexedError).registeredAs, undefined);
	const mod = await resolveScope({ kind: 'module', value: `${INNER}/src` }, pristine);
	assert.deepEqual(mod, { kind: 'module', value: `${INNER}/src`, repoPath: null, lookupPath: `${INNER}/src` });
});

test('a symbol that resolves costs one read: the whole repo is read only when the file has no entities', async () => {
	const file = `${INNER}/src/pay.ts`;
	// The file has entities: the repo is indexed, no repo-wide read.
	const d = deps({ entities: [entity(file, 'settle')] });
	await resolveScope({ kind: 'symbol', value: `${file}#settle` }, d);
	assert.ok(!d.calls.some(c => c.startsWith('listEntitiesForRepo')), d.calls.join(', '));
	// A wrong name in an indexed file: still no repo-wide read, and the failure is "no such entity".
	const d2 = deps({ entities: [entity(file, 'settle')] });
	const wrong = await rejection(() => resolveScope({ kind: 'symbol', value: `${file}#missing` }, d2));
	assert.ok(wrong instanceof ScopeRefUnresolvedError);
	assert.ok(!d2.calls.some(c => c.startsWith('listEntitiesForRepo')));
	// A file with no entities in a repo that IS indexed: the repo is read, and the failure is still "no such entity".
	const other = `${INNER}/src/other.ts`;
	const d3 = deps({ entities: [entity(other, 'x')] });
	const empty = await rejection(() => resolveScope({ kind: 'symbol', value: `${file}#settle` }, d3));
	assert.ok(empty instanceof ScopeRefUnresolvedError, `got ${empty.name}`);
	assert.ok(d3.calls.includes(`listEntitiesForRepo:${INNER}`));
});

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

test('resolveScope connection cases: one, none, two, unparseable connections file', async () => {
	const ref: AnalyzeScopeRef = { kind: 'connection', value: 'ledger-db' };

	// one
	const one = deps({ connections: { [OUTER]: ['cache'], [OTHER]: ['ledger-db', 'events'] } });
	assert.equal((await resolveScope(ref, one)).repoPath, OTHER);
	// every registered repo's file was read, in registry order
	assert.deepEqual(
		one.calls.filter(c => c.startsWith('loadConnections')),
		[`loadConnections:${OUTER}`, `loadConnections:${INNER}`, `loadConnections:${OTHER}`],
	);

	// none
	const none = await rejection(() => resolveScope(ref, deps({ connections: { [OTHER]: ['events'] } })));
	assert.ok(none instanceof ScopeRefUnresolvedError);
	assert.match(none.message, /'ledger-db' is not registered in any repo/);

	// two: both repos are named
	const two = await rejection(() => resolveScope(ref, deps({
		connections: { [OUTER]: ['ledger-db'], [OTHER]: ['ledger-db'] },
	})));
	assert.ok(two instanceof ScopeRefUnresolvedError);
	assert.match(two.message, /registered in 2 repos/);
	assert.ok(two.message.includes(OUTER) && two.message.includes(OTHER), two.message);

	// An unparseable file is reported, not skipped -- even though another repo declares the id.
	const broken = await rejection(() => resolveScope(ref, deps({
		connections: {
			[OUTER]: new Error('db-connections.json: invalid JSON (Unexpected token })'),
			[OTHER]: ['ledger-db'],
		},
	})));
	assert.ok(broken instanceof ScopeRefUnresolvedError, `got ${broken.name}`);
	assert.ok(broken.message.includes(OUTER), broken.message);
	assert.match(broken.message, /invalid JSON/);
});
