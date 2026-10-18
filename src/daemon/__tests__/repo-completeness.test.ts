/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t12 — repo.list, repo.stats and daemon.status carry each
 * repository's completeness beside its unchanged four-value status, and
 * daemon.status carries the daemon-wide unattributedUnwritable count.
 *
 * A real daemon over a seeded store (helpers/seeded-daemon.ts): its seeded
 * repositories read complete; a large one being reindexed reads not complete
 * ('the full index has not finished') while its status is 'indexing'.
 *
 * Run: npx tsx --test src/daemon/__tests__/repo-completeness.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startSeededDaemon, whileIndexing } from './helpers/seeded-daemon.js';
import type { SeededDaemon } from './helpers/seeded-daemon.js';
import type { DaemonStatus, RegisteredRepo, RepoStats } from '../../shared/types.js';

const BIG_FILES = 3000;
const TIMEOUT = { timeout: 400_000 };

let seeded: SeededDaemon;

test.before(async () => {
	seeded = await startSeededDaemon({ bigRepos: [BIG_FILES] });
}, TIMEOUT);
test.after(async () => {
	await seeded?.stop();
});

const list = async (): Promise<RegisteredRepo[]> => await seeded.call('repo.list', {}) as RegisteredRepo[];
const stats = async (): Promise<RepoStats[]> => await seeded.call('repo.stats', {}) as RepoStats[];
const status = async (): Promise<DaemonStatus> => await seeded.call('daemon.status', {}) as DaemonStatus;
const pathOf = (r: RegisteredRepo | RepoStats): string => 'path' in r ? r.path : r.repoPath;
const of = <T extends RegisteredRepo | RepoStats>(rows: T[], path: string): T => {
	const row = rows.find(r => pathOf(r) === path);
	assert.ok(row, `no row for ${path}`);
	return row;
};

test('repo.list, repo.stats and daemon.status carry completeness beside the unchanged status: a complete repository reads complete, one whose full index is running reads not complete while its status is indexing; daemon.status carries unattributedUnwritable', TIMEOUT, async () => {
	const big = seeded.big[0]!.path;

	// A complete repository, in each reply: status 'ready', complete, no reasons.
	for (const rows of [await list(), await stats(), (await status()).repos]) {
		const a = of(rows as (RegisteredRepo | RepoStats)[], seeded.repoA);
		assert.equal(a.status, 'ready');
		assert.equal(a.completeness?.complete, true, JSON.stringify(a.completeness));
		assert.deepEqual(a.completeness?.reasons, []);
	}
	const one = await seeded.call('repo.stats', { repoPath: seeded.repoA }) as RepoStats;
	assert.equal(one.completeness?.complete, true, 'the one-repository repo.stats reply carries it too');
	assert.deepEqual((await status()).unattributedUnwritable, { total: 0, reasons: {} });

	// A repository whose full index is running: status 'indexing' (the registry's own), not complete.
	await whileIndexing(seeded, big, BIG_FILES, async () => {
		const registry = of(await list(), big);
		assert.equal(registry.status, 'indexing');
		for (const rows of [await list(), await stats(), (await status()).repos]) {
			const b = of(rows as (RegisteredRepo | RepoStats)[], big);
			assert.equal(b.status, 'indexing', 'the status is unchanged');
			assert.equal(b.completeness?.complete, false);
			assert.ok(b.completeness?.reasons.includes('the full index has not finished'), JSON.stringify(b.completeness));
		}
	});
});
