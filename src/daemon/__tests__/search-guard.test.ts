/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6, Story s5, Task t12 -- the daemon's graph-reading search
 * requests refuse a request that names a repository under index.
 *
 * A real daemon over a seeded store (helpers/seeded-daemon.ts) with two large
 * repositories that are not indexed yet. A reindex of one is a real full
 * index, long enough for the requests below to be made while it runs: the
 * refusal states how far the run has got. The registry-read case is checked on
 * the guard itself, with readers that fail.
 *
 * Run: npx tsx --test src/daemon/__tests__/search-guard.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { guardSearchRequest, SearchRefusedError } from '../search-guard.js';
import { startSeededDaemon } from './helpers/seeded-daemon.js';
import type { SeededDaemon } from './helpers/seeded-daemon.js';
import type { RegisteredRepo } from '../../shared/types.js';

const BIG_FILES = 3000;

/** Two full indexes of the large repositories, one after the other. */
const TIMEOUT = { timeout: 400_000 };

let seeded: SeededDaemon;

test.before(async () => {
	seeded = await startSeededDaemon({ bigRepos: [BIG_FILES, BIG_FILES] });
});

test.after(async () => {
	await seeded?.stop();
});

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idsOf = (rows: unknown): string[] => (rows as Array<{ id: string }>).map(r => r.id);

/** The refusal a request about `repo` gets while its full index runs, with the run's figures. */
function underIndex(repo: string): RegExp {
	return new RegExp(`^repo-indexing: The repository ${escape(repo)} is being indexed: the run began at \\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z, \\d+ of ${BIG_FILES} files done\\. Retry once the index is ready\\.$`);
}

/** Start a full index of `repo` and run `during` while it runs; the index is shown to still run afterwards. */
async function whileIndexing(repo: string, during: () => Promise<void>): Promise<void> {
	await seeded.call('repo.reindex', { path: repo });
	// The index queue runs one job at a time: a full index queued behind another starts when that one ends.
	const deadline = Date.now() + 180_000;
	for (;;) {
		const refused = await seeded.call('search.closure', { repoPath: repo }).then(() => undefined, (e: Error) => e.message);
		if (refused !== undefined && underIndex(repo).test(refused)) break;
		if (Date.now() > deadline) throw new Error(`the full index of ${repo} was never seen running (last answer: ${refused ?? 'answered'})`);
		await new Promise(r => setTimeout(r, 20));
	}
	await during();
	await assert.rejects(seeded.call('search.closure', { repoPath: repo }), (e: Error) => underIndex(repo).test(e.message),
		'the index was still running when the requests were made');
}

test("search requests: search.callers / search.callees / search.by_file / search.closure / entity.summary / repo.depends_on / locate.inferParents about a repository being indexed answer 'repo-indexing: ...' with the figures and no result; about another, ready repository they answer as before", TIMEOUT, async () => {
	const big = seeded.big[0]!;
	const { repoA, ids } = seeded;
	await whileIndexing(big.path, async () => {
		const requests: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
			['search.callers', { entityId: big.fn0 }],
			['search.callees', { entityId: big.fn0 }],
			['search.callers_nhop', { entityId: big.fn0, hops: 2 }],
			['search.by_file', { filePath: join(big.path, 'f0.ts') }],
			['search.closure', { repoPath: big.path }],
			['entity.summary', { entityId: big.fn0 }],
			['repo.depends_on', { repoId: big.path }],
			['repo.search_cross_repo', { query: 'about fnA', repoId: big.path, limit: 5 }],
			['locate.inferParents', { repoPath: big.path, touchedPaths: [join(big.path, 'f0.ts')], defectDescription: 'fn0 fails' }],
		];
		for (const [method, params] of requests) {
			await assert.rejects(seeded.call(method, params), (e: Error) => underIndex(big.path).test(e.message), `${method}: refused with the figures`);
		}
		// The ready repository is answered as before, while the other one is indexed.
		assert.deepEqual(idsOf(await seeded.call('search.callers', { entityId: ids.fnB })), [ids.fnA]);
		assert.deepEqual(idsOf(await seeded.call('search.callees', { entityId: ids.fnA })), [ids.fnB]);
		assert.deepEqual(idsOf(await seeded.call('search.by_file', { filePath: join(repoA, 'a.ts') })).sort(), [ids.fnA, ids.fnC, ids.fnD].sort());
		assert.deepEqual([...await seeded.call('search.closure', { repoPath: repoA }) as string[]].sort(), [repoA, seeded.repoB].sort());
		assert.equal((await seeded.call('entity.summary', { entityId: ids.fnA }) as { name: string }).name, 'fnA');
		assert.equal((await seeded.call('repo.depends_on', { repoId: repoA }) as unknown[]).length, 2);
		const inferred = await seeded.call('locate.inferParents', { repoPath: repoA, touchedPaths: [join(repoA, 'a.ts')], defectDescription: 'fnA fails' }) as { graph: unknown[] };
		assert.ok(inferred.graph.length > 0);
	});
});

test('entity.closure / entity.unreachable with a root in a repository under index are refused', TIMEOUT, async () => {
	const big = seeded.big[1]!;
	const { ids } = seeded;
	await whileIndexing(big.path, async () => {
		// One root in a ready repository and one in the repository under index: refused.
		await assert.rejects(seeded.call('entity.closure', { rootIds: [ids.fnA, big.fn0], edgeKind: 'CALLS', direction: 'out', maxDepth: 2 }),
			(e: Error) => underIndex(big.path).test(e.message), 'entity.closure');
		await assert.rejects(seeded.call('entity.unreachable', { rootIds: [ids.fnA, big.fn0], candidateKinds: ['function'], edgeKind: 'CALLS', maxDepth: 2 }),
			(e: Error) => underIndex(big.path).test(e.message), 'entity.unreachable');
		// Roots in ready repositories only: answered as before.
		assert.ok(idsOf(await seeded.call('entity.closure', { rootIds: [ids.fnA], edgeKind: 'CALLS', direction: 'out', maxDepth: 2 })).includes(ids.fnB));
		assert.ok(idsOf(await seeded.call('entity.unreachable', { rootIds: [ids.fnA], candidateKinds: ['function'], edgeKind: 'CALLS', maxDepth: 3 })).includes(ids.fnC));
	});
});

test('search guard: a registry read that throws skips the guard and the request is answered as today', async () => {
	const indexing = [{ path: '/r/app', name: 'app', addedAt: '', status: 'indexing' } as RegisteredRepo];
	const names = { repoPaths: ['/r/app'], filePaths: ['/r/app/a.ts'], entityIds: ['e1'] };
	const entityRepo = async (): Promise<string> => '/r/app';
	// The registry cannot be read: not refused, and nothing thrown.
	await guardSearchRequest(names, { listRepos: async () => { throw new Error('MDB_BAD_TXN'); }, entityRepo });
	// A pristine registry: not refused.
	await guardSearchRequest(names, { listRepos: async () => [], entityRepo });
	// The same names, with a registry that says the repository is being indexed: refused.
	await assert.rejects(guardSearchRequest(names, { listRepos: async () => indexing, indexRun: () => undefined, entityRepo }),
		(e: unknown) => e instanceof SearchRefusedError && /^repo-indexing: The repository \/r\/app is being indexed; how far the run has got is not known yet/.test(e.message));
	// Each way of naming the repository is enough on its own.
	for (const one of [{ repoPaths: ['/r/app'] }, { filePaths: ['/r/app/src/a.ts'] }, { entityIds: ['e1'] }]) {
		await assert.rejects(guardSearchRequest(one, { listRepos: async () => indexing, indexRun: () => undefined, entityRepo }), SearchRefusedError, JSON.stringify(one));
	}
});
