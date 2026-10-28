/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pins the lenient github.json resolver before and after it is split into
 * `loadGithubConfigFile` + `resolveGithubConfigFromFile` (s3 t1).
 *
 * Run:
 *   npx tsx --test src/workflow/config/__tests__/github-split.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadGithubConfigFile, resolveGithubConfig, resolveGithubConfigFromFile } from '../github.js';

const REPO = '/abs/repo-under-test';

async function withFile(contents: string | undefined, fn: (path: string) => void | Promise<void>, mode?: number): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), 'github-split-'));
	const path = join(dir, 'github.json');
	try {
		if (contents !== undefined) writeFileSync(path, contents, 'utf8');
		if (mode !== undefined) chmodSync(path, mode);
		await fn(path);
	} finally {
		if (mode !== undefined) { try { chmodSync(path, 0o600); } catch { /* absent */ } }
		rmSync(dir, { recursive: true, force: true });
	}
}

/** What a call gives: the value, or the name of what it threw. */
async function outcome(fn: () => unknown): Promise<{ readonly value?: unknown; readonly threw?: string }> {
	try { return { value: await fn() }; } catch (err) { return { threw: (err as Error).name }; }
}

test('resolveGithubConfig returns none for a missing, unreadable, invalid-JSON and non-object file', async () => {
	const none = { type: 'none', source: 'default-config' };
	await withFile(undefined, async (p) => assert.deepEqual(await resolveGithubConfig(REPO, p), none), undefined);
	await withFile('{ not json', async (p) => assert.deepEqual(await resolveGithubConfig(REPO, p), none));
	await withFile('null', async (p) => assert.deepEqual(await resolveGithubConfig(REPO, p), none));
	await withFile('42', async (p) => assert.deepEqual(await resolveGithubConfig(REPO, p), none));
	await withFile('"text"', async (p) => assert.deepEqual(await resolveGithubConfig(REPO, p), none));
	if (process.getuid?.() !== 0) {
		await withFile('{"default":{"type":"none"}}', async (p) => assert.deepEqual(await resolveGithubConfig(REPO, p), none), 0o000);
	}
	// The loader gives an empty file for every one of these inputs.
	await withFile('{ not json', async (p) => assert.deepEqual(loadGithubConfigFile(p), {}));
	await withFile('null', async (p) => assert.deepEqual(loadGithubConfigFile(p), {}));
});

test('characterization of a null own entry and a null default is unchanged by the split', async () => {
	const nullOwn = JSON.stringify({ default: { type: 'none' }, repos: { [REPO]: null } });
	const nullDefault = JSON.stringify({ default: null });
	const nullOwnCompleteDefault = JSON.stringify({ default: { type: 'github' }, repos: { [REPO]: null } });

	for (const contents of [nullOwn, nullDefault, nullOwnCompleteDefault]) {
		await withFile(contents, async (p) => {
			const viaPath = await outcome(() => resolveGithubConfig(REPO, p));
			const viaFile = await outcome(() => resolveGithubConfigFromFile(loadGithubConfigFile(p), REPO));
			// Today a null entry reaches `entry.type` and throws a TypeError; the split must not change that.
			assert.equal(viaPath.threw, 'TypeError');
			assert.deepEqual(viaFile, viaPath);
		});
	}
});

test('resolveGithubConfigFromFile gives the same result as resolveGithubConfig for a well-formed file', async () => {
	const contents = JSON.stringify({
		default: { type: 'github', epicLabel: 'e', ghHost: 'ghe.example.com', branchPattern: '{id}', ghPath: '/usr/bin/gh' },
		repos: { [REPO]: { type: 'none' } },
	});
	await withFile(contents, async (p) => {
		assert.deepEqual(await resolveGithubConfigFromFile(loadGithubConfigFile(p), REPO), await resolveGithubConfig(REPO, p));
		assert.deepEqual(await resolveGithubConfig(REPO, p), { type: 'none', source: 'per-repo-config' });
	});
});
