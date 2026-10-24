/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pre-LLM invariant tests -- ensureNonEmptyClosure + ScopeNotIndexedError.
 *
 * Uses an LMDB sandbox per test so the user's production graph
 * registry doesn't leak in.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/invariants.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addRepo, updateRepoStatus } from '../../../db/repos.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import type { Entity, RegisteredRepo } from '../../../shared/types.js';

import {
	RepoIndexingError,
	ScopeNotIndexedError,
	ensureNonEmptyClosure,
	ensureRepoQueryable,
	scopeErrorMapping,
} from '../invariants.js';
import { bumpIndexRunDone, closeIndexRun, openIndexRun, setIndexRunSelected } from '../../../indexer/run-record.js';
import { resolveTaskScope } from '../../runtimes/shared/task-scope.js';
import type { ClassifiedIntent } from '../types.js';
import { ScopeRefUnresolvedError } from '../invariants.js';
import { resolveScope, type ResolvedScope } from '../scope.js';

// ---------------------------------------------------------------------------
// Per-test LMDB sandbox
// ---------------------------------------------------------------------------

let storeDir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	storeDir = mkdtempSync(join(tmpdir(), 'analyze-invariants-'));
	setGraphStorePath(join(storeDir, 'graph.lmdb'));
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(storeDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function codeIntent(value: string, kind: ClassifiedIntent['scopeRef']['kind'] = 'repo'): ClassifiedIntent {
	return {
		target:    'code',
		scope:     'M',
		focused:   false,
		scopeRef:  { kind, value },
		reasoning: 'invariants test fixture',
	};
}

/**
 * The resolved scope the indexed check now takes. Built by hand here:
 * the check does its own registry matching from the scope's path, so
 * these cases exercise exactly what they did when it took an intent.
 */
function scopeOf(intent: ClassifiedIntent): ResolvedScope {
	const { kind, value } = intent.scopeRef;
	if (kind === 'connection') {
		return { kind, value, repoPath: '/some/repo', lookupPath: '/some/repo', connectionId: value };
	}
	if (kind === 'file') {
		return { kind, value, repoPath: null, lookupPath: value, filePath: value };
	}
	return { kind, value, repoPath: null, lookupPath: value };
}

function makeEntity(repo: string, file: string): Entity {
	return {
		id:        `e${Math.floor(Math.random() * 1e9).toString(16)}`,
		repo,
		file,
		kind:      'function',
		name:      'fn',
		language:  'typescript',
		startLine: 1,
		endLine:   3,
	} as unknown as Entity;
}

async function registerAndSeedRepo(path: string, withEntities: boolean): Promise<void> {
	await addRepo(null, {
		path,
		name:    path,
		addedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
		status:  withEntities ? 'ready' : 'pending',
	});
	if (withEntities) {
		await upsertEntities(null, [makeEntity(path, `${path}/index.ts`)]);
	}
}

// ---------------------------------------------------------------------------
// Pristine registry: invariant skipped
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: pristine registry -> skipped silently, returns undefined', async () => {
	const intent = codeIntent('/some/scope/path');
	const result = await ensureNonEmptyClosure(scopeOf(intent));
	assert.equal(result, undefined);
});

// ---------------------------------------------------------------------------
// Connection scope: always skipped
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: connection-kind scope is skipped silently', async () => {
	// Even with repos in the registry, a connection scope skips.
	await registerAndSeedRepo('/some/repo', true);
	const intent = codeIntent('my-conn', 'connection');
	const result = await ensureNonEmptyClosure(scopeOf(intent));
	assert.equal(result, undefined);
});

// ---------------------------------------------------------------------------
// Registered repo + entities -> success
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: registered repo with entities -> returns repo path', async () => {
	const repoPath = '/registered/with-entities';
	await registerAndSeedRepo(repoPath, true);
	const intent = codeIntent(repoPath);
	const result = await ensureNonEmptyClosure(scopeOf(intent));
	assert.equal(result, repoPath);
});

test('ensureNonEmptyClosure: scope nested under registered repo with entities -> match', async () => {
	const repoPath = '/registered/parent';
	await registerAndSeedRepo(repoPath, true);
	const intent = codeIntent(`${repoPath}/src/feature/x.ts`, 'file');
	const result = await ensureNonEmptyClosure(scopeOf(intent));
	assert.equal(result, repoPath);
});

// ---------------------------------------------------------------------------
// Registered repo without entities -> ScopeNotIndexedError
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: registered repo with ZERO entities -> ScopeNotIndexedError', async () => {
	const repoPath = '/registered/no-entities';
	await registerAndSeedRepo(repoPath, false);
	const intent = codeIntent(repoPath);
	await assert.rejects(
		() => ensureNonEmptyClosure(scopeOf(intent)),
		(err: unknown) => {
			assert.ok(err instanceof ScopeNotIndexedError);
			assert.equal(err.scopePath, repoPath);
			assert.equal(err.registeredAs, repoPath);
			assert.match(err.message, /zero indexed entities/);
			assert.match(err.message, /status: pending/);
			return true;
		},
	);
});

// ---------------------------------------------------------------------------
// No registered repo contains the scope -> ScopeNotIndexedError
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: scope outside every registered repo -> ScopeNotIndexedError', async () => {
	await registerAndSeedRepo('/registered/elsewhere', true);
	const intent = codeIntent('/unregistered/scope');
	await assert.rejects(
		() => ensureNonEmptyClosure(scopeOf(intent)),
		(err: unknown) => {
			assert.ok(err instanceof ScopeNotIndexedError);
			assert.equal(err.scopePath, '/unregistered/scope');
			assert.equal(err.registeredAs, undefined);
			assert.match(err.message, /no registered repo contains the scope path/);
			return true;
		},
	);
});

// ---------------------------------------------------------------------------
// Longest-prefix match honored
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: longest-prefix repo wins when nested', async () => {
	await registerAndSeedRepo('/registered/outer',          true);
	await registerAndSeedRepo('/registered/outer/inner',    true);
	const intent = codeIntent('/registered/outer/inner/deep/x.ts', 'file');
	const result = await ensureNonEmptyClosure(scopeOf(intent));
	assert.equal(result, '/registered/outer/inner');
});

// ---------------------------------------------------------------------------
// Boundary-at-"/" prefix rule (mirrors resolveRepoLastIndexedAt)
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: false-prefix is rejected (requires / boundary)', async () => {
	await registerAndSeedRepo('/registered/repo-c', true);
	const intent = codeIntent('/registered/repo-c-other');
	await assert.rejects(
		() => ensureNonEmptyClosure(scopeOf(intent)),
		ScopeNotIndexedError,
	);
});

// ---------------------------------------------------------------------------
// ScopeNotIndexedError shape
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Readers handed in
// ---------------------------------------------------------------------------

test('ensureNonEmptyClosure: given readers it reads the registry and the entities through them, not the real store', async () => {
	// The real store says the opposite of the stand-ins in each case.
	const calls: string[] = [];
	const readers = (entities: number) => ({
		listRepos:           async () => { calls.push('listRepos'); return [{ path: '/standin/app', status: 'ready' } as unknown as RegisteredRepo]; },
		listEntitiesForRepo: async (repoPath: string, opts?: { readonly limit: 1 } | undefined) => { assert.deepEqual(opts, { limit: 1 }); calls.push(`listEntitiesForRepo:${repoPath}`); return Array.from({ length: entities }, () => makeEntity(repoPath, `${repoPath}/a.ts`)); },
	});

	// Real store: nothing registered. Stand-ins: registered, with entities.
	assert.equal(await ensureNonEmptyClosure(scopeOf(codeIntent('/standin/app/src', 'module')), readers(1)), '/standin/app');
	assert.deepEqual(calls, ['listRepos', 'listEntitiesForRepo:/standin/app']);

	// Stand-ins: registered, no entities -> not indexed, naming the stand-in repo.
	await assert.rejects(
		() => ensureNonEmptyClosure(scopeOf(codeIntent('/standin/app')), readers(0)),
		(err: unknown) => err instanceof ScopeNotIndexedError && err.registeredAs === '/standin/app',
	);

	// Real store: the scope's repo IS registered with entities. Stand-ins: it is in no repo.
	await registerAndSeedRepo('/real/app', true);
	assert.equal(await ensureNonEmptyClosure(scopeOf(codeIntent('/real/app'))), '/real/app');
	await assert.rejects(
		() => ensureNonEmptyClosure(scopeOf(codeIntent('/real/app')), readers(1)),
		(err: unknown) => err instanceof ScopeNotIndexedError && err.registeredAs === undefined,
	);
});

test('ensureNonEmptyClosure: with readers the check keeps its leniency for a registry that cannot be read or holds no repo', async () => {
	const entities = async (): Promise<Entity[]> => { throw new Error('must not be read'); };
	assert.equal(await ensureNonEmptyClosure(scopeOf(codeIntent('/x/app')), {
		listRepos: async () => { throw new Error('registry down'); }, listEntitiesForRepo: entities,
	}), undefined);
	assert.equal(await ensureNonEmptyClosure(scopeOf(codeIntent('/x/app')), {
		listRepos: async () => [], listEntitiesForRepo: entities,
	}), undefined);
});

test('ScopeNotIndexedError carries scopePath + registeredAs on the instance', () => {
	const e = new ScopeNotIndexedError('/scope', '/repo', 'because');
	assert.equal(e.name, 'ScopeNotIndexedError');
	assert.equal(e.scopePath, '/scope');
	assert.equal(e.registeredAs, '/repo');
	assert.match(e.message, /Scope \/scope/);
	assert.match(e.message, /Registered repo: \/repo/);
	assert.match(e.message, /Reason: because/);
	assert.match(e.message, /insrc repo add/);
});

test('ScopeNotIndexedError handles undefined registeredAs', () => {
	const e = new ScopeNotIndexedError('/scope', undefined, 'reason');
	assert.equal(e.registeredAs, undefined);
	assert.match(e.message, /No registered repo contains this path/);
});

// ---------------------------------------------------------------------------
// The symbol exception: a symbol needs the index in every mode and for
// every kind of source, because it resolves to a stored entity. The
// check is made when the scope is resolved -- against the real store.
// ---------------------------------------------------------------------------

test('symbol exception: a symbol in a registered repo with ZERO entities -> ScopeNotIndexedError, not "no entity of that name"', async () => {
	const repoPath = '/registered/empty-for-symbol';
	await registerAndSeedRepo(repoPath, false);
	await assert.rejects(
		() => resolveScope({ kind: 'symbol', value: `${repoPath}/src/pay.ts#settle` }),
		(err: unknown) => {
			assert.ok(err instanceof ScopeNotIndexedError, `got ${(err as Error).name}: ${(err as Error).message}`);
			assert.ok(!(err instanceof ScopeRefUnresolvedError));
			assert.equal(err.registeredAs, repoPath);
			assert.equal(err.scopePath, `${repoPath}/src/pay.ts`);
			return true;
		},
	);
});

test('symbol exception: a symbol outside every registered repo, and with a pristine registry -> ScopeNotIndexedError', async () => {
	// pristine registry: the check above skips silently for other kinds; a symbol cannot.
	await assert.rejects(
		() => resolveScope({ kind: 'symbol', value: '/nowhere/src/pay.ts#settle' }),
		(err: unknown) => err instanceof ScopeNotIndexedError && err.registeredAs === undefined,
	);
	await registerAndSeedRepo('/registered/other', true);
	await assert.rejects(
		() => resolveScope({ kind: 'symbol', value: '/nowhere/src/pay.ts#settle' }),
		(err: unknown) => err instanceof ScopeNotIndexedError && err.registeredAs === undefined,
	);
});

test('symbol exception: in an indexed repo a symbol resolves to its stored entity; an unknown name is unresolved', async () => {
	const repoPath = '/registered/indexed-for-symbol';
	await registerAndSeedRepo(repoPath, true);   // seeds one entity 'fn' in <repo>/index.ts
	const resolved = await resolveScope({ kind: 'symbol', value: `${repoPath}/index.ts#fn` });
	assert.equal(resolved.repoPath, repoPath);
	assert.equal(resolved.lookupPath, repoPath);
	assert.equal(resolved.entityName, 'fn');
	assert.equal(typeof resolved.entityId, 'string');
	// ... and the indexed check passes for it.
	assert.equal(await ensureNonEmptyClosure(resolved), repoPath);

	await assert.rejects(
		() => resolveScope({ kind: 'symbol', value: `${repoPath}/index.ts#missing` }),
		(err: unknown) => err instanceof ScopeRefUnresolvedError,
	);
});

// ---------------------------------------------------------------------------
// A repository under index (Epic c2ba6fa6, Story s5, Task t7)
// ---------------------------------------------------------------------------

async function registerWith(path: string, status: RegisteredRepo['status'], extra: Partial<RegisteredRepo> = {}, entities = false): Promise<void> {
	await addRepo(null, { path, name: path, addedAt: '2026-01-01T00:00:00.000Z', status, ...extra });
	if (extra.lastRun !== undefined || extra.errorMsg !== undefined) {
		await updateRepoStatus(null, path, status, extra.lastIndexed, extra.errorMsg, extra.lastRun);
	}
	if (entities) await upsertEntities(null, [makeEntity(path, `${path}/index.ts`)]);
}

async function refusal(run: () => Promise<unknown>): Promise<RepoIndexingError> {
	try { await run(); } catch (err) {
		assert.ok(err instanceof RepoIndexingError, `expected RepoIndexingError, got ${String(err)}`);
		return err;
	}
	assert.fail('expected a refusal');
}

test("ensureNonEmptyClosure: status 'indexing' (with and without entities) throws RepoIndexingError with the running record's figures; 'indexing' with no record says the figures are not known; 'error' with lastRun.outcome 'failed' throws with lastRun's figures and error; 'pending' and 'ready' with no entities keep ScopeNotIndexedError and its message", async () => {
	const began = Date.UTC(2026, 9, 13, 9, 30);
	for (const withEntities of [true, false]) {
		const repo = `/indexing/${withEntities ? 'with' : 'without'}`;
		await registerWith(repo, 'indexing', {}, withEntities);
		openIndexRun(repo, began);
		setIndexRunSelected(repo, 120);
		for (let i = 0; i < 37; i++) bumpIndexRunDone(repo);
		try {
			const err = await refusal(() => ensureNonEmptyClosure(scopeOf(codeIntent(`${repo}/src`, 'module'))));
			assert.deepEqual(err.data, { repoPath: repo, status: 'indexing', run: { startedAt: began, filesSelected: 120, filesDone: 37 } });
			assert.equal(err.message,
				`The repository ${repo} is being indexed: the run began at 2026-10-13T09:30:00.000Z, 37 of 120 files done. Retry once the index is ready.`);
		} finally {
			closeIndexRun(repo);
		}
	}

	// 'indexing' with no running record (a daemon restarted mid-run).
	await registerWith('/indexing/norecord', 'indexing');
	const unknown = await refusal(() => ensureNonEmptyClosure(scopeOf(codeIntent('/indexing/norecord'))));
	assert.deepEqual(unknown.data, { repoPath: '/indexing/norecord', status: 'indexing', run: null });
	assert.match(unknown.message, /is being indexed; how far the run has got is not known yet/);

	// 'indexing' before the walk has counted its files.
	await registerWith('/indexing/uncounted', 'indexing');
	openIndexRun('/indexing/uncounted', began);
	try {
		const uncounted = await refusal(() => ensureNonEmptyClosure(scopeOf(codeIntent('/indexing/uncounted'))));
		assert.match(uncounted.message, /the files to index are not yet counted/);
	} finally {
		closeIndexRun('/indexing/uncounted');
	}

	// 'error' with a failed lastRun.
	const lastRun = { startedAt: began, endedAt: began + 60_000, filesSelected: 120, filesDone: 3, outcome: 'failed' as const, error: 'disk full' };
	await registerWith('/failed/run', 'error', { errorMsg: 'disk full', lastRun }, true);
	const failed = await refusal(() => ensureNonEmptyClosure(scopeOf(codeIntent('/failed/run'))));
	assert.deepEqual(failed.data, { repoPath: '/failed/run', status: 'error', run: { startedAt: began, endedAt: began + 60_000, filesSelected: 120, filesDone: 3, error: 'disk full' } });
	assert.equal(failed.message,
		'The last index of the repository /failed/run ended in an error before it completed: it began at 2026-10-13T09:30:00.000Z, ended at 2026-10-13T09:31:00.000Z, 3 of 120 files done. Error: disk full Re-index the repository.');

	// 'pending' and 'ready' with no entities: as today.
	for (const status of ['pending', 'ready'] as const) {
		const repo = `/empty/${status}`;
		await registerWith(repo, status);
		await assert.rejects(() => ensureNonEmptyClosure(scopeOf(codeIntent(repo))), (err: unknown) =>
			err instanceof ScopeNotIndexedError
			&& err.message === `Scope ${repo} produced an empty graph closure. Registered repo: ${repo}. Reason: registered repo has zero indexed entities (status: ${status}). Run \`insrc repo add <path>\` and let the indexer finish (status: 'ready') before re-running analyze.`);
	}
});

test("ensureRepoQueryable: a docs / data / infra / generic run on a repository under index is refused; an 'error' row without lastRun is refused with figures unknown and its errorMsg", async () => {
	const repo = mkdtempSync(join(tmpdir(), 'analyze-under-index-'));
	try {
		await registerWith(repo, 'indexing', {}, true);
		// The docs, data and infra families resolve their scope through
		// resolveTaskScope, which refuses for each of them. A generic intent
		// names no family: its run is not checked (runAnalyze, Task t9).
		for (const family of ['docs', 'data', 'infra'] as const) {
			const err = await refusal(() => resolveTaskScope({ kind: 'repo', value: repo }, family, `${family}.task`));
			assert.equal(err.data.status, 'indexing', family);
			assert.equal(scopeErrorMapping(err)?.code, 'repo-indexing', family);
		}
		// A connection scope reads no repository's index: not checked.
		await ensureRepoQueryable({ kind: 'connection', value: 'ledger-db', repoPath: repo, lookupPath: repo, connectionId: 'ledger-db' });

		// An 'error' row written before lastRun existed.
		await updateRepoStatus(null, repo, 'error', undefined, 'resolver exception: x is undefined');
		const old = await refusal(() => ensureRepoQueryable(scopeOf(codeIntent(repo))));
		assert.deepEqual(old.data, { repoPath: repo, status: 'error', run: { error: 'resolver exception: x is undefined' } });
		assert.match(old.message, /ended in an error before it completed; how far it got is not known\. Error: resolver exception: x is undefined/);

		// A ready repository is answered.
		await updateRepoStatus(null, repo, 'ready', '2026-10-13T10:00:00.000Z');
		await ensureRepoQueryable(scopeOf(codeIntent(repo)));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('ensureRepoQueryable: a registry read that throws, and a pristine registry, skip the check (no refusal, no raw error)', async () => {
	await ensureRepoQueryable(scopeOf(codeIntent('/x/app')), { listRepos: async () => { throw new Error('registry down'); } });
	await ensureRepoQueryable(scopeOf(codeIntent('/x/app')), { listRepos: async () => [] });
	// Against the real (pristine) sandbox store too.
	await ensureRepoQueryable(scopeOf(codeIntent('/x/app')));
	// And the same stand-in registry that refuses when it is read.
	await assert.rejects(
		() => ensureRepoQueryable(scopeOf(codeIntent('/x/app')), { listRepos: async () => [{ path: '/x/app', name: 'x', addedAt: '', status: 'indexing' } as RegisteredRepo], indexRun: () => undefined }),
		RepoIndexingError,
	);
});
