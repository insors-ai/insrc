/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for session-aware MCP repo resolution.
 *
 *  - repoContainingCwd: the daemon-side pure CWD→repo containment match
 *    (equality, nesting/most-specific, path-segment boundary, empty registry).
 *  - resolveRepoPath: the shared resolver's precedence — explicit > CWD-match >
 *    INSRC_REPO > undefined — with the CWD lookup injected (no live daemon).
 *
 * Run: npx tsx --test src/mcp/__tests__/resolve-repo.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { repoContainingCwd } from '../../db/repos.js';
import { resolveRepoPath } from '../resolve-repo.js';
import type { RegisteredRepo } from '../../shared/types.js';

function repo(path: string): RegisteredRepo {
	return { path } as RegisteredRepo;
}

// ---------------------------------------------------------------------------
// repoContainingCwd — the pure containment match
// ---------------------------------------------------------------------------

test('repoContainingCwd: CWD inside a registered repo matches it', () => {
	assert.equal(repoContainingCwd([repo('/a'), repo('/b')], '/a/src/x'), '/a');
});

test('repoContainingCwd: CWD equal to a repo root matches (equality inclusive)', () => {
	assert.equal(repoContainingCwd([repo('/a')], '/a'), '/a');
});

test('repoContainingCwd: nested repos — most-specific (longest) containing path wins', () => {
	assert.equal(repoContainingCwd([repo('/a'), repo('/a/b')], '/a/b/src'), '/a/b');
	// order-independent
	assert.equal(repoContainingCwd([repo('/a/b'), repo('/a')], '/a/b/src'), '/a/b');
});

test('repoContainingCwd: path-segment boundary respected — /foo does NOT contain /foobar', () => {
	assert.equal(repoContainingCwd([repo('/foo')], '/foobar/src'), undefined);
});

test('repoContainingCwd: CWD outside every registered repo → undefined', () => {
	assert.equal(repoContainingCwd([repo('/a'), repo('/b')], '/c/src'), undefined);
});

test('repoContainingCwd: empty registry → undefined', () => {
	assert.equal(repoContainingCwd([], '/a/src'), undefined);
});

// ---------------------------------------------------------------------------
// resolveRepoPath — precedence (CWD lookup injected, no live daemon)
// ---------------------------------------------------------------------------

const priorEnv = process.env['INSRC_REPO'];
afterEach(() => {
	if (priorEnv !== undefined) process.env['INSRC_REPO'] = priorEnv;
	else delete process.env['INSRC_REPO'];
});

test('resolveRepoPath: explicit non-empty arg wins unconditionally + never calls the CWD lookup', async () => {
	process.env['INSRC_REPO'] = '/pinned';
	let called = false;
	const out = await resolveRepoPath('/explicit', { resolveForCwd: async () => { called = true; return '/cwd-repo'; }, cwd: '/cwd-repo/src' });
	assert.equal(out, '/explicit');
	assert.equal(called, false, 'explicit short-circuits before any IPC');
});

test('resolveRepoPath: explicit empty string is treated as absent → proceeds to CWD match', async () => {
	const out = await resolveRepoPath('', { resolveForCwd: async () => '/cwd-repo', cwd: '/cwd-repo/src' });
	assert.equal(out, '/cwd-repo');
});

test('resolveRepoPath: CWD-contained repo wins over a DIFFERENT INSRC_REPO (the core fix)', async () => {
	process.env['INSRC_REPO'] = '/pinned-other';
	const out = await resolveRepoPath(undefined, { resolveForCwd: async () => '/cwd-repo', cwd: '/cwd-repo/src' });
	assert.equal(out, '/cwd-repo');
});

test('resolveRepoPath: no CWD match → falls through to INSRC_REPO (headless/cron fallback)', async () => {
	process.env['INSRC_REPO'] = '/pinned';
	const out = await resolveRepoPath(undefined, { resolveForCwd: async () => null, cwd: '/outside/src' });
	assert.equal(out, '/pinned');
});

test('resolveRepoPath: no CWD match + INSRC_REPO unset → undefined (terminal no-repo contract unchanged)', async () => {
	delete process.env['INSRC_REPO'];
	const out = await resolveRepoPath(undefined, { resolveForCwd: async () => null, cwd: '/outside/src' });
	assert.equal(out, undefined);
});

test('resolveRepoPath: daemon-unreachable surfaces the error (does NOT silently fall through to INSRC_REPO)', async () => {
	process.env['INSRC_REPO'] = '/pinned';
	await assert.rejects(
		() => resolveRepoPath(undefined, { resolveForCwd: async () => { throw new Error('daemon is not running'); }, cwd: '/cwd-repo/src' }),
		/daemon is not running/,
	);
});
