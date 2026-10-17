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

function withFile(contents: string | undefined, fn: (path: string) => void, mode?: number): void {
	const dir = mkdtempSync(join(tmpdir(), 'github-split-'));
	const path = join(dir, 'github.json');
	try {
		if (contents !== undefined) writeFileSync(path, contents, 'utf8');
		if (mode !== undefined) chmodSync(path, mode);
		fn(path);
	} finally {
		if (mode !== undefined) { try { chmodSync(path, 0o600); } catch { /* absent */ } }
		rmSync(dir, { recursive: true, force: true });
	}
}

/** What a call gives: the value, or the name of what it threw. */
function outcome(fn: () => unknown): { readonly value?: unknown; readonly threw?: string } {
	try { return { value: fn() }; } catch (err) { return { threw: (err as Error).name }; }
}

test('resolveGithubConfig returns none for a missing, unreadable, invalid-JSON and non-object file', () => {
	const none = { type: 'none', source: 'default-config' };
	withFile(undefined, (p) => assert.deepEqual(resolveGithubConfig(REPO, p), none), undefined);
	withFile('{ not json', (p) => assert.deepEqual(resolveGithubConfig(REPO, p), none));
	withFile('null', (p) => assert.deepEqual(resolveGithubConfig(REPO, p), none));
	withFile('42', (p) => assert.deepEqual(resolveGithubConfig(REPO, p), none));
	withFile('"text"', (p) => assert.deepEqual(resolveGithubConfig(REPO, p), none));
	if (process.getuid?.() !== 0) {
		withFile('{"default":{"type":"none"}}', (p) => assert.deepEqual(resolveGithubConfig(REPO, p), none), 0o000);
	}
	// The loader gives an empty file for every one of these inputs.
	withFile('{ not json', (p) => assert.deepEqual(loadGithubConfigFile(p), {}));
	withFile('null', (p) => assert.deepEqual(loadGithubConfigFile(p), {}));
});

test('characterization of a null own entry and a null default is unchanged by the split', () => {
	const nullOwn = JSON.stringify({ default: { type: 'none' }, repos: { [REPO]: null } });
	const nullDefault = JSON.stringify({ default: null });
	const nullOwnCompleteDefault = JSON.stringify({ default: { type: 'github' }, repos: { [REPO]: null } });

	for (const contents of [nullOwn, nullDefault, nullOwnCompleteDefault]) {
		withFile(contents, (p) => {
			const viaPath = outcome(() => resolveGithubConfig(REPO, p));
			const viaFile = outcome(() => resolveGithubConfigFromFile(loadGithubConfigFile(p), REPO));
			// Today a null entry reaches `entry.type` and throws a TypeError; the split must not change that.
			assert.equal(viaPath.threw, 'TypeError');
			assert.deepEqual(viaFile, viaPath);
		});
	}
});

test('resolveGithubConfigFromFile gives the same result as resolveGithubConfig for a well-formed file', () => {
	const contents = JSON.stringify({
		default: { type: 'github', epicLabel: 'e', ghHost: 'ghe.example.com', branchPattern: '{id}', ghPath: '/usr/bin/gh' },
		repos: { [REPO]: { type: 'none' } },
	});
	withFile(contents, (p) => {
		assert.deepEqual(resolveGithubConfigFromFile(loadGithubConfigFile(p), REPO), resolveGithubConfig(REPO, p));
		assert.deepEqual(resolveGithubConfig(REPO, p), { type: 'none', source: 'per-repo-config' });
	});
});
