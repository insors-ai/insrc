/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6, Story s5, code-review follow-up -- the search requests' result
 * filtering and the analyzer's refusal read ONE rule for "under index"
 * (isUnderIndex), and the guard treats a failed entity read as it treats a
 * failed registry read: the request is answered, not failed.
 *
 * Stand-in readers only: no store, no daemon.
 *
 * Run: npx tsx --test src/daemon/__tests__/search-guard-rule.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ensureRepoQueryable, isUnderIndex, RepoIndexingError } from '../../analyze/context/invariants.js';
import { guardSearchRequest, SearchRefusedError, underIndexFilter } from '../search-guard.js';
import type { RegisteredRepo } from '../../shared/types.js';

const STATUSES = ['ready', 'pending', 'indexing', 'error'] as const;
const repoAt = (status: RegisteredRepo['status']): RegisteredRepo =>
	({ path: `/r/${status}`, name: status, addedAt: '', status } as RegisteredRepo);

test("the result filter leaves out exactly the repositories the analyzer refuses: for every registry status, underIndexFilter drops the repository iff ensureRepoQueryable refuses it, and both agree with isUnderIndex", async () => {
	const registry = STATUSES.map(repoAt);
	const filter = await underIndexFilter({ listRepos: async () => registry });
	for (const repo of registry) {
		const refused = await ensureRepoQueryable(
			{ kind: 'repo', value: repo.path, repoPath: repo.path, lookupPath: repo.path },
			{ listRepos: async () => registry, indexRun: () => undefined },
		).then(() => false, (e: unknown) => {
			assert.ok(e instanceof RepoIndexingError, String(e));
			return true;
		});
		const leftOut = !filter.paths([repo.path]).includes(repo.path);
		assert.equal(leftOut, refused, `${repo.status}: filtered iff refused`);
		assert.equal(refused, isUnderIndex(repo), `${repo.status}: the one rule`);
	}
	assert.deepEqual([...filter.repos].sort(), ['/r/error', '/r/indexing']);
	// Entities of a repository under index are left out; the rest, and rows with no repository, are kept.
	assert.deepEqual(
		filter.entities([{ repo: '/r/ready' }, { repo: '/r/indexing' }, { repo: '/r/error' }, { repo: undefined }]),
		[{ repo: '/r/ready' }, { repo: undefined }],
	);
});

test('guardSearchRequest: an entity whose store read fails names nothing and the request is answered; another name in the same request still refuses it', async () => {
	const registry = [repoAt('indexing')];
	const failing = async (): Promise<string> => { throw new Error('MDB_BAD_TXN'); };
	// The failed read alone: answered, nothing thrown.
	await guardSearchRequest({ entityIds: ['e1'] }, { listRepos: async () => registry, indexRun: () => undefined, entityRepo: failing });
	// The failed read beside a path under index: refused for the path.
	await assert.rejects(
		guardSearchRequest({ entityIds: ['e1'], repoPaths: ['/r/indexing'] }, { listRepos: async () => registry, indexRun: () => undefined, entityRepo: failing }),
		SearchRefusedError,
	);
});

test('guardSearchRequest: an entity that is not stored names every repository being indexed (a full index deletes its rows before writing them again), and is answered when none is', async () => {
	const unstored = async (): Promise<undefined> => undefined;
	const deps = (registry: RegisteredRepo[]) => ({ listRepos: async () => registry, indexRun: () => undefined, entityRepo: unstored });
	// A repository being indexed: refused, naming that repository.
	await assert.rejects(
		guardSearchRequest({ entityIds: ['gone'] }, deps([repoAt('ready'), repoAt('indexing')])),
		(e: unknown) => e instanceof SearchRefusedError && e.message.includes('/r/indexing'),
	);
	// None being indexed: answered, even beside a repository whose last index failed.
	await guardSearchRequest({ entityIds: ['gone'] }, deps([repoAt('ready'), repoAt('error'), repoAt('pending')]));
	// A stored entity of a ready repository is answered while another repository is indexed.
	await guardSearchRequest({ entityIds: ['kept'] }, { ...deps([repoAt('ready'), repoAt('indexing')]), entityRepo: async () => '/r/ready' });
});
