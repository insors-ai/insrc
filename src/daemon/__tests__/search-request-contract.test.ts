/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6, Story s5, Task t11 -- the contract of the daemon's
 * graph-reading search requests, pinned BEFORE the guard of a repository
 * under index is added (decision q4e48e4a6): each request is called over the
 * real daemon's socket with the parameters it takes today, and each answer
 * is checked for content only those parameters produce, so renaming or
 * dropping a parameter a handler reads fails this test.
 *
 * The real daemon runs with HOME in a temporary directory (its socket, stores
 * and logs are all there; the user's daemon is never touched). Its store is
 * seeded before it starts so that EVERY parameter a request reads decides its
 * answer: two registered repositories, A depending on B; a call chain
 * fnD -> fnA -> fnB (so the hop count and the depth matter), fnA REFERENCES
 * fnC (so the edge kind matters); one story artifact in A (an ownership record
 * citing a.ts, and an artifact document with a vector), so the touched paths
 * and the defect description each bring a candidate; more vectors than the
 * limits ask for; one vector axis per entity. Its embedding model is a
 * stand-in Ollama (helpers/seeded-daemon.ts) that embeds a text to the axis of
 * the entity it names, so the two requests that search by text are
 * deterministic and reach no model.
 *
 * Run: npx tsx --test src/daemon/__tests__/search-request-contract.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { startSeededDaemon } from './helpers/seeded-daemon.js';
import type { SeededDaemon } from './helpers/seeded-daemon.js';

let seeded: SeededDaemon;
let repoA: string;
let repoB: string;
let ids: SeededDaemon['ids'];

test.before(async () => {
	seeded = await startSeededDaemon();
	({ repoA, repoB, ids } = seeded);
});

test.after(async () => {
	await seeded?.stop();
});

const idsOf = (rows: unknown): string[] => (rows as Array<{ id: string }>).map(r => r.id);
const pathsOf = (rows: unknown): string[] => (rows as Array<{ path: string }>).map(r => r.path);

test('search request contract: each guarded search request accepts its existing params and answers', async () => {
	const call = (method: string, params: Record<string, unknown>) => seeded.call(method, params);
	const pinned = new Set<string>();
	const pin = async (method: string, params: Record<string, unknown>, check: (answer: unknown) => void): Promise<void> => {
		const answer = await call(method, params);
		check(answer);
		pinned.add(method);
	};
	const sorted = (xs: string[]): string[] => [...xs].sort();
	const code = sorted([ids.fnA, ids.fnB, ids.fnC, ids.fnD]);

	// entityId
	await pin('search.callers', { entityId: ids.fnB }, a => assert.deepEqual(idsOf(a), [ids.fnA], 'search.callers'));
	await pin('search.callees', { entityId: ids.fnA }, a => assert.deepEqual(idsOf(a), [ids.fnB], 'search.callees'));
	// entityId; hops: two hops reach fnD, the default one does not
	await pin('search.callers_nhop', { entityId: ids.fnB, hops: 2 }, a => assert.deepEqual(sorted(idsOf(a)), sorted([ids.fnA, ids.fnD]), 'search.callers_nhop'));
	// filePath
	await pin('search.by_file', { filePath: join(repoA, 'a.ts') }, a => assert.deepEqual(sorted(idsOf(a)), sorted([ids.fnA, ids.fnC, ids.fnD]), 'search.by_file'));
	// repoPath
	await pin('search.closure', { repoPath: repoA }, a => assert.deepEqual(sorted(a as string[]), sorted([repoA, repoB]), 'search.closure'));
	// entityId
	await pin('entity.summary', { entityId: ids.fnA }, a => assert.equal((a as { name: string }).name, 'fnA', 'entity.summary'));
	// rootIds + maxDepth: one CALLS step from fnD reaches fnA, not fnB
	await pin('entity.closure', { rootIds: [ids.fnD], edgeKind: 'CALLS', direction: 'out', maxDepth: 1 }, a => {
		assert.ok(idsOf(a).includes(ids.fnA), 'entity.closure: fnA');
		assert.ok(!idsOf(a).includes(ids.fnB), 'entity.closure: maxDepth 1 stops before fnB');
	});
	// edgeKind: from fnA, CALLS reaches fnB and not fnC (fnC is only REFERENCED)
	await pin('entity.closure', { rootIds: [ids.fnA], edgeKind: 'CALLS', direction: 'out', maxDepth: 2 }, a => {
		assert.ok(idsOf(a).includes(ids.fnB), 'entity.closure: fnB');
		assert.ok(!idsOf(a).includes(ids.fnC), 'entity.closure: the CALLS filter leaves fnC out');
	});
	// direction: into fnB, one CALLS step back is fnA
	await pin('entity.closure', { rootIds: [ids.fnB], edgeKind: 'CALLS', direction: 'in', maxDepth: 1 }, a =>
		assert.ok(idsOf(a).includes(ids.fnA), 'entity.closure: direction in reaches the caller'));
	// rootIds, candidateKinds, edgeKind: by CALLS from fnA, fnC is unreachable and fnB is not
	await pin('entity.unreachable', { rootIds: [ids.fnA], candidateKinds: ['function'], edgeKind: 'CALLS', maxDepth: 3 }, a => {
		assert.ok(idsOf(a).includes(ids.fnC), 'entity.unreachable: fnC is not reached by CALLS');
		assert.ok(!idsOf(a).includes(ids.fnB), 'entity.unreachable: fnB is reached from fnA');
		assert.ok((a as Array<{ kind: string }>).every(e => e.kind === 'function'), 'entity.unreachable: only the candidate kinds');
	});
	// maxDepth: one CALLS step from fnD does not reach fnB
	await pin('entity.unreachable', { rootIds: [ids.fnD], candidateKinds: ['function'], edgeKind: 'CALLS', maxDepth: 1 }, a =>
		assert.ok(idsOf(a).includes(ids.fnB), 'entity.unreachable: fnB lies beyond maxDepth 1'));
	// repoId
	await pin('repo.depends_on', { repoId: repoA }, a => assert.deepEqual(sorted(pathsOf(a)), sorted([repoA, repoB]), 'repo.depends_on'));
	// query (nearest is the entity it names), repoId (B is in A's closure), limit (one)
	await pin('repo.search_cross_repo', { query: 'about fnB', repoId: repoA, limit: 1 }, a =>
		assert.deepEqual(idsOf(a), [ids.fnB], 'repo.search_cross_repo: the one nearest code entity of the closure A and B'));
	// repoPath, touchedPaths (a graph candidate: the story citing a.ts), defectDescription (a semantic candidate: its document)
	await pin('locate.inferParents', { repoPath: repoA, touchedPaths: [join(repoA, 'a.ts')], defectDescription: 'fnA fails' }, a => {
		const out = a as { graph?: Array<{ parentRef: { storyId?: string } }>; semantic?: Array<{ parentRef: { storyId?: string } }> };
		assert.equal(out.graph?.[0]?.parentRef.storyId, 's1', `locate.inferParents: graph tier ${JSON.stringify(a)}`);
		assert.equal(out.semantic?.[0]?.parentRef.storyId, 's1', `locate.inferParents: semantic tier ${JSON.stringify(a)}`);
	});
	// text, limit, filter: every code entity of every registered repository, the artifact left out
	await pin('search.query', { text: 'a function', limit: 10, filter: 'code' }, a => assert.deepEqual(sorted(idsOf(a)), code, 'search.query: filter code'));
	await pin('search.query', { text: 'about fnD', limit: 1, filter: 'code' }, a => assert.deepEqual(idsOf(a), [ids.fnD], 'search.query: the text and the limit'));

	assert.deepEqual([...pinned].sort(), [
		'entity.closure', 'entity.summary', 'entity.unreachable', 'locate.inferParents', 'repo.depends_on', 'repo.search_cross_repo',
		'search.by_file', 'search.callees', 'search.callers', 'search.callers_nhop', 'search.closure', 'search.query',
	], 'the twelve requests the guard covers');
});
