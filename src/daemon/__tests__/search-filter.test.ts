/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6, Story s5, Task t13 -- results that follow the graph or a
 * closure across repositories leave out a repository under index, and
 * search.query searches the other repositories only, without refusing.
 *
 * A real daemon over a seeded store (helpers/seeded-daemon.ts) with three
 * large repositories linked to the ready ones (A depends on each; each one's
 * fn0 calls fnB and is called by it). Each test first records that its large
 * repository IS reached, then starts a real full index of it and makes the
 * same requests while the index runs.
 *
 * Run: npx tsx --test src/daemon/__tests__/search-filter.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startSeededDaemon, whileIndexing } from './helpers/seeded-daemon.js';
import type { SeededDaemon } from './helpers/seeded-daemon.js';

const BIG_FILES = 3000;
/** Three full indexes, one after the other. */
const TIMEOUT = { timeout: 600_000 };

let seeded: SeededDaemon;

test.before(async () => {
	seeded = await startSeededDaemon({ bigRepos: [BIG_FILES, BIG_FILES, BIG_FILES], linkBig: true });
});

test.after(async () => {
	await seeded?.stop();
});

type Row = { id: string; repo: string };
const rows = (a: unknown): Row[] => a as Row[];
const reposOf = (a: unknown): string[] => [...new Set(rows(a).map(r => r.repo))];

test('search.callers across repositories leaves out the entities of a repository under index', TIMEOUT, async () => {
	const [big, other] = [seeded.big[0]!, seeded.big[1]!];
	const { ids } = seeded;
	// Before: fnB's callers include the large repository's fn0.
	const before = rows(await seeded.call('search.callers', { entityId: ids.fnB })).map(r => r.id);
	assert.ok(before.includes(big.fn0) && before.includes(ids.fnA), JSON.stringify(before));

	await whileIndexing(seeded, big.path, BIG_FILES, async () => {
		const callers = rows(await seeded.call('search.callers', { entityId: ids.fnB }));
		assert.ok(!reposOf(callers).includes(big.path), 'no caller from the repository under index');
		assert.ok(callers.some(r => r.id === ids.fnA) && callers.some(r => r.id === other.fn0), 'the callers from ready repositories are kept');
		const callees = rows(await seeded.call('search.callees', { entityId: ids.fnB }));
		assert.ok(!reposOf(callees).includes(big.path) && callees.some(r => r.id === other.fn0), 'search.callees likewise');
		const nhop = rows(await seeded.call('search.callers_nhop', { entityId: ids.fnB, hops: 2 }));
		assert.ok(!reposOf(nhop).includes(big.path) && nhop.some(r => r.id === ids.fnD), 'search.callers_nhop likewise, walking on through ready ones');
	});
});

test('search.query while one repository is being indexed returns rows from the other repositories only', TIMEOUT, async () => {
	const big = seeded.big[1]!;
	await whileIndexing(seeded, big.path, BIG_FILES, async () => {
		// The entities written by the running index have vectors near any other text: unfiltered, they would be found.
		const found = rows(await seeded.call('search.query', { text: 'something else', limit: 50 }));
		assert.ok(found.length > 0, 'answered, not refused');
		assert.ok(!reposOf(found).includes(big.path), `nothing from the repository under index: ${JSON.stringify(reposOf(found))}`);
		assert.ok(reposOf(found).includes(seeded.repoA), 'rows from the others');
	});
	// Once the index has ended, the repository is searched again. (The limit is above every entity
	// stored: the other large repositories' rows are as near as this one's, so a smaller one need not reach it.)
	const deadline = Date.now() + 180_000;
	for (;;) {
		const found = rows(await seeded.call('search.query', { text: 'something else', limit: 20_000 }));
		if (reposOf(found).includes(big.path)) break;
		if (Date.now() > deadline) throw new Error('the repository was never searched again after its index');
		await new Promise(r => setTimeout(r, 200));
	}
});

test("entity.closure, entity.unreachable, search.closure, repo.depends_on and repo.search_cross_repo from a ready repository whose closure reaches a repository under index leave that repository's entities out", TIMEOUT, async () => {
	const big = seeded.big[2]!;
	const { ids, repoA, repoB } = seeded;
	// Before: A's closure reaches the large repository, and fnA's CALLS closure reaches its fn0.
	assert.ok((await seeded.call('search.closure', { repoPath: repoA }) as string[]).includes(big.path));
	assert.ok(rows(await seeded.call('entity.closure', { rootIds: [ids.fnA], edgeKind: 'CALLS', direction: 'out', maxDepth: 3 })).some(r => r.id === big.fn0));

	await whileIndexing(seeded, big.path, BIG_FILES, async () => {
		const closure = rows(await seeded.call('entity.closure', { rootIds: [ids.fnA], edgeKind: 'CALLS', direction: 'out', maxDepth: 3 }));
		assert.ok(!reposOf(closure).includes(big.path) && closure.some(r => r.id === ids.fnB), 'entity.closure');
		const unreachable = rows(await seeded.call('entity.unreachable', { rootIds: [ids.fnA], candidateKinds: ['function'], edgeKind: 'CALLS', maxDepth: 3 }));
		assert.ok(!reposOf(unreachable).includes(big.path) && unreachable.some(r => r.id === ids.fnC), 'entity.unreachable');
		const repos = await seeded.call('search.closure', { repoPath: repoA }) as string[];
		assert.ok(!repos.includes(big.path) && repos.includes(repoA) && repos.includes(repoB), `search.closure: ${JSON.stringify(repos)}`);
		const deps = (await seeded.call('repo.depends_on', { repoId: repoA }) as Array<{ path: string }>).map(d => d.path);
		assert.ok(!deps.includes(big.path) && deps.includes(repoB), `repo.depends_on: ${JSON.stringify(deps)}`);
		const cross = rows(await seeded.call('repo.search_cross_repo', { query: 'something else', repoId: repoA, limit: 50 }));
		assert.ok(cross.length > 0 && !reposOf(cross).includes(big.path), `repo.search_cross_repo: ${JSON.stringify(reposOf(cross))}`);
	});
});
