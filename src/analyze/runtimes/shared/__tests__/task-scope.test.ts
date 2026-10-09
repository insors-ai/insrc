/**
 * resolveTaskScope: the one place a plan task turns its scope into a repo, a
 * path, an entity or a connection (LLD-b9d5c5c4-s7, task t2).
 *
 * Stand-in readers; no LMDB, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedConnections } from '../../../../daemon/db/config.js';
import type { AnalyzeScopeRef } from '../../../../shared/analyze-types.js';
import type { Entity, RegisteredRepo } from '../../../../shared/types.js';
import { TARGET_TO_KINDS } from '../../../classifier/validate.js';
import { ScopeKindTargetMismatchError, ScopeNotIndexedError, ScopeRefUnresolvedError } from '../../../context/invariants.js';
import type { KindsPerTarget, ScopeDeps } from '../../../context/scope.js';
import { resolveTaskScope, type TaskFamily } from '../task-scope.js';

const REPO = '/work/app';
const FILE = `${REPO}/src/pay.ts`;
const FAMILIES: readonly TaskFamily[] = ['code', 'docs', 'infra', 'data'];
const KINDS: ReadonlyArray<AnalyzeScopeRef['kind']> = ['repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir', 'workspace'];
const VALUE: Record<AnalyzeScopeRef['kind'], string> = {
	repo: REPO, module: `${REPO}/src`, file: FILE, symbol: `${FILE}#settle`,
	connection: 'ledger-db', 'manifest-dir': `${REPO}/deploy`, workspace: REPO,
};
const ref = (kind: AnalyzeScopeRef['kind'], value = VALUE[kind]): AnalyzeScopeRef => ({ kind, value });

interface Fixture {
	/** The registry: the repos it holds, or 'unreadable'. */
	registry?: readonly string[] | 'unreadable' | undefined;
	/** Whether a registered repo has stored entities. */
	indexed?: boolean | undefined;
}
function deps(f: Fixture = {}): ScopeDeps & { calls: string[] } {
	const registry = f.registry ?? [REPO];
	const indexed = f.indexed ?? true;
	const ent = { id: 'ent-settle', name: 'settle', kind: 'function', file: FILE, startLine: 3 } as unknown as Entity;
	const calls: string[] = [];
	return {
		calls,
		listRepos: async () => {
			calls.push('listRepos');
			if (registry === 'unreadable') throw new Error('the registry cannot be read');
			return registry.map(path => ({ path, status: 'ready' }) as unknown as RegisteredRepo);
		},
		findEntitiesByFile:  async (file) => { calls.push('findEntitiesByFile'); return indexed && file === FILE ? [ent] : []; },
		listEntitiesForRepo: async (repoPath) => { calls.push(`listEntitiesForRepo:${repoPath}`); return indexed ? [ent] : []; },
		loadConnections:     async () => {
			calls.push('loadConnections');
			return { file: { connections: [] }, resolved: [{ id: 'ledger-db', kind: 'sqlite' }], warnings: [] } as unknown as LoadedConnections;
		},
	};
}
async function rejection(run: () => Promise<unknown>): Promise<Error> {
	try { await run(); } catch (err) { return err as Error; }
	assert.fail('expected a rejection');
}

test('a table test over four families and seven kinds of scope: pairings in the table resolve, the rest throw the mismatch error naming the kinds allowed (mutation: give a family a kind outside its row)', async () => {
	let resolved = 0;
	let refused = 0;
	for (const family of FAMILIES) {
		for (const kind of KINDS) {
			const d = deps();
			if (TARGET_TO_KINDS[family].includes(kind)) {
				const scope = await resolveTaskScope(ref(kind), family, 'tpl.x', d);
				assert.deepEqual([scope.kind, scope.value], [kind, VALUE[kind]], `${family}+${kind}`);
				resolved += 1;
			} else {
				const err = await rejection(() => resolveTaskScope(ref(kind), family, 'code.discovery.modules', d));
				assert.ok(err instanceof ScopeKindTargetMismatchError, `${family}+${kind}: got ${err.name}: ${err.message}`);
				// The message names the template, the pairing and the kinds allowed.
				assert.equal(err.message,
					`code.discovery.modules: scopeRef.kind='${kind}' is incompatible with target='${family}'. ` +
					`Allowed kinds for this target: ${TARGET_TO_KINDS[family].join(', ')}.`);
				// Refused before anything was resolved or read.
				assert.deepEqual(d.calls, [], `${family}+${kind}`);
				refused += 1;
			}
		}
	}
	// The table's own rows, counted: code 6, docs 4, infra 3, data 4.
	assert.deepEqual([resolved, refused], [6 + 4 + 3 + 4, 4 * 7 - 17]);
	// Spot checks against the rows as the design states them.
	for (const [family, kind] of [['docs', 'symbol'], ['docs', 'manifest-dir'], ['infra', 'module'], ['infra', 'file'], ['data', 'file'], ['code', 'connection']] as const) {
		assert.ok((await rejection(() => resolveTaskScope(ref(kind), family, 't', deps()))) instanceof ScopeKindTargetMismatchError, `${family}+${kind}`);
	}
});

test('a kind added to a row of a stand-in table is accepted', async () => {
	// Under the real table, docs refuses a symbol and infra refuses a file.
	assert.ok((await rejection(() => resolveTaskScope(ref('symbol'), 'docs', 't', deps()))) instanceof ScopeKindTargetMismatchError);
	const standIn: KindsPerTarget = { ...TARGET_TO_KINDS, docs: [...TARGET_TO_KINDS.docs, 'symbol'], infra: ['file'] };
	// With the kind added to the row, it is accepted: no list but the table is consulted.
	const scope = await resolveTaskScope(ref('symbol'), 'docs', 't', deps(), standIn);
	assert.deepEqual([scope.kind, scope.entityId], ['symbol', 'ent-settle']);
	assert.equal((await resolveTaskScope(ref('file'), 'infra', 't', deps(), standIn)).kind, 'file');
	// And a kind taken OUT of a row is refused, with the stand-in row named.
	const err = await rejection(() => resolveTaskScope(ref('repo'), 'infra', 't', deps(), standIn));
	assert.ok(err instanceof ScopeKindTargetMismatchError);
	assert.ok(err.message.endsWith('Allowed kinds for this target: file.'), err.message);
});

test('a module, a file, a symbol and a connection scope resolve to the registered repo and the area', async () => {
	// The directory.
	assert.deepEqual(await resolveTaskScope(ref('module'), 'code', 't', deps()),
		{ kind: 'module', value: `${REPO}/src`, repoPath: REPO, lookupPath: `${REPO}/src` });
	assert.deepEqual(await resolveTaskScope(ref('module'), 'docs', 't', deps()),
		{ kind: 'module', value: `${REPO}/src`, repoPath: REPO, lookupPath: `${REPO}/src` });
	// The file, in the repo that contains it.
	assert.deepEqual(await resolveTaskScope(ref('file'), 'code', 't', deps()),
		{ kind: 'file', value: FILE, repoPath: REPO, lookupPath: REPO, filePath: FILE });
	// The entity.
	assert.deepEqual(await resolveTaskScope(ref('symbol'), 'code', 't', deps()),
		{ kind: 'symbol', value: `${FILE}#settle`, repoPath: REPO, lookupPath: REPO, filePath: FILE, entityId: 'ent-settle', entityName: 'settle' });
	// The connection, in the repo that declares it.
	assert.deepEqual(await resolveTaskScope(ref('connection'), 'data', 't', deps()),
		{ kind: 'connection', value: 'ledger-db', repoPath: REPO, lookupPath: REPO, connectionId: 'ledger-db' });
	// The longest registered repo that contains the scope wins.
	const nested = await resolveTaskScope(ref('module', `${REPO}/pkg/core/src`), 'code', 't', deps({ registry: [REPO, `${REPO}/pkg/core`] }));
	assert.equal(nested.repoPath, `${REPO}/pkg/core`);
	// A value that does not resolve is ScopeRefUnresolvedError, passed through.
	assert.ok((await rejection(() => resolveTaskScope(ref('symbol', `${FILE}#nothing`), 'code', 't', deps()))) instanceof ScopeRefUnresolvedError);
	assert.ok((await rejection(() => resolveTaskScope(ref('connection', 'no-such-db'), 'data', 't', deps()))) instanceof ScopeRefUnresolvedError);
});

test('a scope in no registered repo is not indexed for code and docs and resolves for infra and data', async () => {
	// A readable registry that holds repos, none of which contains the scope.
	const elsewhere = { registry: ['/work/other'] } as const;
	for (const family of ['code', 'docs'] as const) {
		for (const kind of ['repo', 'module', 'file'] as const) {
			const err = await rejection(() => resolveTaskScope(ref(kind), family, 't', deps(elsewhere)));
			assert.ok(err instanceof ScopeNotIndexedError, `${family}+${kind}: got ${err.name}: ${err.message}`);
			assert.deepEqual([(err as ScopeNotIndexedError).scopePath, (err as ScopeNotIndexedError).registeredAs], [VALUE[kind], undefined]);
		}
	}
	// Infra walks the file system and data opens a pool at a path: neither reads the graph.
	for (const [family, kind] of [['infra', 'repo'], ['infra', 'manifest-dir'], ['data', 'repo'], ['data', 'manifest-dir'], ['data', 'workspace']] as const) {
		const d = deps(elsewhere);
		const scope = await resolveTaskScope(ref(kind), family, 't', d);
		assert.deepEqual([scope.repoPath, scope.lookupPath], [null, VALUE[kind]], `${family}+${kind}`);
		assert.ok(!d.calls.some(c => c.startsWith('listEntitiesForRepo')), `${family}+${kind}: no entity was read`);
	}
	// A registered repo with no stored entities is not indexed either, and is named.
	for (const family of ['code', 'docs'] as const) {
		const err = await rejection(() => resolveTaskScope(ref('module'), family, 't', deps({ indexed: false })));
		assert.ok(err instanceof ScopeNotIndexedError, family);
		assert.equal((err as ScopeNotIndexedError).registeredAs, REPO);
	}
	assert.equal((await resolveTaskScope(ref('repo'), 'infra', 't', deps({ indexed: false }))).repoPath, REPO);
	// The check reads through the SAME readers the resolution used.
	const d = deps();
	await resolveTaskScope(ref('module'), 'code', 't', d);
	assert.deepEqual(d.calls, ['listRepos', 'listRepos', `listEntitiesForRepo:${REPO}`]);
});

test('an unreadable or empty registry does not refuse a path scope; a symbol scope fails as resolveScope decides (mutation: treat a null repo as not indexed)', async () => {
	for (const registry of ['unreadable', []] as const) {
		for (const family of ['code', 'docs'] as const) {
			for (const kind of TARGET_TO_KINDS[family].filter(k => k !== 'symbol')) {
				const scope = await resolveTaskScope(ref(kind), family, 't', deps({ registry }));
				// Not refused: the repo is unknown, and the task works on the scope's own path.
				assert.equal(scope.repoPath, null, `${String(registry)} ${family}+${kind}`);
				assert.equal(scope.lookupPath, kind === 'file' ? `${REPO}/src` : VALUE[kind], `${String(registry)} ${family}+${kind}`);
			}
		}
	}
	// A symbol cannot be served from the file system. With a registry that holds
	// no repo, resolveScope says it is not indexed ...
	const empty = await rejection(() => resolveTaskScope(ref('symbol'), 'code', 't', deps({ registry: [] })));
	assert.ok(empty instanceof ScopeNotIndexedError, `got ${empty.name}`);
	// ... and with one that cannot be read, the reader's own error passes through.
	const unreadable = await rejection(() => resolveTaskScope(ref('symbol'), 'code', 't', deps({ registry: 'unreadable' })));
	assert.equal(unreadable.message, 'the registry cannot be read');
	assert.ok(!(unreadable instanceof ScopeNotIndexedError) && !(unreadable instanceof ScopeKindTargetMismatchError));
});
