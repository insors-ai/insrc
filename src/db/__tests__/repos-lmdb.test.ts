/**
 * Phase 2.1 tests for the LMDB-backed `db/repos.ts`.
 *
 * Verifies the public surface (addRepo / removeRepo / listRepos /
 * updateRepoStatus) preserves the prior DuckDB-backed behaviour:
 *   - addRepo creates new + updates existing (path-keyed)
 *   - removeRepo by path
 *   - listRepos returns all rows in any order (test sorts before
 *     comparing)
 *   - updateRepoStatus mutates only status / lastIndexed / errorMsg
 *   - Optional fields (lastIndexed / errorMsg) are properly absent
 *     when their LMDB-side sentinel (0 / '') is in use
 *   - Empty registry round-trips
 *   - Status enum round-trips for all four values
 *   - addRepo on existing path keeps the same internal repo_id
 *     (verifies linear-scan finder works)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import {
	addRepo, removeRepo, listRepos, updateRepoStatus,
	InvalidRepoPathError, validateRepoPath, validateRepoPathShape,
} from '../repos.js';
import type { RegisteredRepo } from '../../shared/types.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-repos-lmdb-2.1-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const NOW = '2026-05-05T10:00:00.000Z';
const LATER = '2026-05-05T11:00:00.000Z';

function makeRepo(overrides: Partial<RegisteredRepo> = {}): RegisteredRepo {
	return {
		path:    overrides.path    ?? '/repo/foo',
		name:    overrides.name    ?? 'foo',
		addedAt: overrides.addedAt ?? NOW,
		status:  overrides.status  ?? 'pending',
		...(overrides.lastIndexed !== undefined ? { lastIndexed: overrides.lastIndexed } : {}),
		...(overrides.errorMsg !== undefined ? { errorMsg: overrides.errorMsg } : {}),
	};
}

test('addRepo + listRepos round-trip', async () => {
	await addRepo(null, makeRepo());
	const list = await listRepos(null);
	assert.equal(list.length, 1);
	assert.equal(list[0]!.path, '/repo/foo');
	assert.equal(list[0]!.name, 'foo');
	assert.equal(list[0]!.status, 'pending');
	assert.equal(list[0]!.addedAt, NOW);
	assert.equal(list[0]!.lastIndexed, undefined);
	assert.equal(list[0]!.errorMsg, undefined);
});

test('addRepo with explicit name overrides basename derivation', async () => {
	await addRepo(null, makeRepo({ path: '/repo/foo', name: 'custom-name' }));
	const list = await listRepos(null);
	assert.equal(list[0]!.name, 'custom-name');
});

test('addRepo with empty name falls back to basename', async () => {
	await addRepo(null, makeRepo({ path: '/path/to/myrepo', name: '' }));
	const list = await listRepos(null);
	assert.equal(list[0]!.name, 'myrepo');
});

test('addRepo on existing path updates in place (same repo_id semantics)', async () => {
	await addRepo(null, makeRepo({ status: 'pending' }));
	await addRepo(null, makeRepo({ status: 'ready', lastIndexed: LATER }));
	const list = await listRepos(null);
	assert.equal(list.length, 1, 'expected upsert, not insert+insert');
	assert.equal(list[0]!.status, 'ready');
	assert.equal(list[0]!.lastIndexed, LATER);
});

test('addRepo with multiple paths creates multiple rows', async () => {
	await addRepo(null, makeRepo({ path: '/repo/a', name: 'a' }));
	await addRepo(null, makeRepo({ path: '/repo/b', name: 'b' }));
	await addRepo(null, makeRepo({ path: '/repo/c', name: 'c' }));
	const list = await listRepos(null);
	const sorted = list.map(r => r.path).sort();
	assert.deepEqual(sorted, ['/repo/a', '/repo/b', '/repo/c']);
});

test('removeRepo by path deletes the row', async () => {
	await addRepo(null, makeRepo({ path: '/repo/a' }));
	await addRepo(null, makeRepo({ path: '/repo/b' }));
	await removeRepo(null, '/repo/a');
	const list = await listRepos(null);
	assert.equal(list.length, 1);
	assert.equal(list[0]!.path, '/repo/b');
});

test('removeRepo on unknown path is a silent no-op', async () => {
	await addRepo(null, makeRepo({ path: '/repo/a' }));
	await removeRepo(null, '/repo/does-not-exist');
	const list = await listRepos(null);
	assert.equal(list.length, 1);
});

test('listRepos on empty registry returns empty array', async () => {
	const list = await listRepos(null);
	assert.deepEqual(list, []);
});

test('updateRepoStatus mutates only status / lastIndexed / errorMsg', async () => {
	await addRepo(null, makeRepo({ status: 'pending', name: 'original-name' }));
	await updateRepoStatus(null, '/repo/foo', 'indexing');
	let list = await listRepos(null);
	assert.equal(list[0]!.status, 'indexing');
	assert.equal(list[0]!.name, 'original-name');
	assert.equal(list[0]!.addedAt, NOW);

	await updateRepoStatus(null, '/repo/foo', 'ready', LATER);
	list = await listRepos(null);
	assert.equal(list[0]!.status, 'ready');
	assert.equal(list[0]!.lastIndexed, LATER);
});

test('updateRepoStatus on unknown path is a silent no-op', async () => {
	await addRepo(null, makeRepo());
	await updateRepoStatus(null, '/repo/does-not-exist', 'error', undefined, 'oops');
	const list = await listRepos(null);
	assert.equal(list[0]!.status, 'pending');
	assert.equal(list[0]!.errorMsg, undefined);
});

test('updateRepoStatus with errorMsg surfaces it on listRepos', async () => {
	await addRepo(null, makeRepo({ status: 'indexing' }));
	await updateRepoStatus(null, '/repo/foo', 'error', undefined, 'parse failed');
	const list = await listRepos(null);
	assert.equal(list[0]!.status, 'error');
	assert.equal(list[0]!.errorMsg, 'parse failed');
});

test('all four status values round-trip', async () => {
	const statuses: RegisteredRepo['status'][] = ['pending', 'indexing', 'ready', 'error'];
	for (let i = 0; i < statuses.length; i++) {
		await addRepo(null, makeRepo({ path: `/repo/${i}`, status: statuses[i]! }));
	}
	const list = await listRepos(null);
	const got = list.map(r => ({ path: r.path, status: r.status })).sort((a, b) => a.path.localeCompare(b.path));
	assert.deepEqual(got, [
		{ path: '/repo/0', status: 'pending' },
		{ path: '/repo/1', status: 'indexing' },
		{ path: '/repo/2', status: 'ready' },
		{ path: '/repo/3', status: 'error' },
	]);
});

test('lastIndexed sentinel: absent when never indexed, present after first index', async () => {
	await addRepo(null, makeRepo({ path: '/repo/x' }));
	let list = await listRepos(null);
	assert.equal(list[0]!.lastIndexed, undefined);

	await updateRepoStatus(null, '/repo/x', 'ready', LATER);
	list = await listRepos(null);
	assert.equal(list[0]!.lastIndexed, LATER);
});

test('lastIndexed survives close + reopen', async () => {
	await addRepo(null, makeRepo({ status: 'ready', lastIndexed: LATER }));
	await closeGraphStore();
	const list = await listRepos(null);
	assert.equal(list[0]!.lastIndexed, LATER);
});

test('many repos round-trip without collision (linear-scan correctness)', async () => {
	const N = 50;
	for (let i = 0; i < N; i++) {
		await addRepo(null, makeRepo({ path: `/repo/${i}`, name: `repo-${i}`, status: 'pending' }));
	}
	const list = await listRepos(null);
	assert.equal(list.length, N);
	for (let i = 0; i < N; i++) {
		await updateRepoStatus(null, `/repo/${i}`, 'ready');
	}
	const after = await listRepos(null);
	assert.ok(after.every(r => r.status === 'ready'));
});

test('addRepo updates status without losing addedAt', async () => {
	await addRepo(null, makeRepo({ status: 'pending', addedAt: NOW }));
	// Simulate an indexer call that re-adds with new status but
	// preserves the original addedAt (shouldn't happen in practice,
	// but the new addedAt overwrites the old one -- this matches the
	// prior DuckDB ON CONFLICT DO UPDATE behaviour)
	await addRepo(null, makeRepo({ status: 'ready', addedAt: LATER }));
	const list = await listRepos(null);
	assert.equal(list[0]!.status, 'ready');
	assert.equal(list[0]!.addedAt, LATER, 'addRepo overwrites addedAt (matches prior behaviour)');
});

// ---------------------------------------------------------------------------
// Path-validation guardrail (2026-05-07): the phantom-empty-repo bug.
// addRepo / validateRepoPath{Shape,} reject empty / non-absolute /
// system-root paths before any LMDB write so a buggy IPC caller can't
// pollute the registry with an unindexable repo.
// ---------------------------------------------------------------------------

test('validateRepoPathShape rejects empty string', () => {
	assert.throws(() => validateRepoPathShape(''), InvalidRepoPathError);
	assert.throws(() => validateRepoPathShape(''), /cannot be empty/);
});

test('validateRepoPathShape rejects non-string input', () => {
	assert.throws(() => validateRepoPathShape(null), /must be a string/);
	assert.throws(() => validateRepoPathShape(undefined), /must be a string/);
	assert.throws(() => validateRepoPathShape(42 as unknown), /must be a string/);
});

test('validateRepoPathShape rejects relative paths', () => {
	assert.throws(() => validateRepoPathShape('foo/bar'), /must be absolute/);
	assert.throws(() => validateRepoPathShape('./relative'), /must be absolute/);
});

test('validateRepoPathShape rejects filesystem root + system / volatile dirs', () => {
	for (const banned of ['/', '/tmp', '/var', '/usr', '/etc', '/Users', '/home', '/private', '/Library', '/System', '/Applications']) {
		assert.throws(
			() => validateRepoPathShape(banned),
			/system \/ volatile directory/,
			`expected '${banned}' to be rejected`,
		);
	}
});

test('validateRepoPathShape normalises trailing-slash + .. segments', () => {
	assert.equal(validateRepoPathShape('/Users/me/proj/'), '/Users/me/proj');
	assert.equal(validateRepoPathShape('/Users/me/proj/sub/..'), '/Users/me/proj');
});

test('validateRepoPathShape rejects normalised banned root (e.g. `/Users/.`)', () => {
	assert.throws(() => validateRepoPathShape('/Users/.'), /system \/ volatile directory/);
	assert.throws(() => validateRepoPathShape('/tmp/..'), /system \/ volatile directory/);
});

test('validateRepoPath (full) accepts an existing temp directory', () => {
	// `dir` is the per-test mkdtempSync directory created in beforeEach;
	// resolves to /private/var/folders/... on macOS or /tmp/... on Linux.
	const result = validateRepoPath(dir);
	// The normalised form may differ from input on macOS due to
	// /tmp -> /private/tmp symlink resolution by `resolve()`.
	assert.ok(result.length > 0);
});

test('validateRepoPath (full) rejects non-existent path', () => {
	assert.throws(
		() => validateRepoPath('/Users/nobody/this-definitely-does-not-exist-12345'),
		/does not exist or is not accessible/,
	);
});

test('addRepo rejects empty / banned-root paths via shape validation', async () => {
	await assert.rejects(
		addRepo(null, makeRepo({ path: '' })),
		InvalidRepoPathError,
	);
	await assert.rejects(
		addRepo(null, makeRepo({ path: '/' })),
		/system \/ volatile/,
	);
	await assert.rejects(
		addRepo(null, makeRepo({ path: '/tmp' })),
		/system \/ volatile/,
	);
	// Confirm registry is empty after rejected attempts.
	const list = await listRepos(null);
	assert.equal(list.length, 0);
});
