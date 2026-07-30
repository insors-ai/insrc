/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the repo-service path normalization (toAbsPath).
 *
 * The daemon requires an ABSOLUTE repo path; the CLI normalizes before the
 * repo.add/remove/reindex IPC. The TUI command bar has no shell, so a typed
 * `~/...` must be expanded here (resolve() alone leaves `~` literal and the
 * path fails). `../` relatives are handled by resolve() as before.
 *
 * Run: npx tsx --test src/cli/__tests__/repo-service.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';

import { toAbsPath } from '../services/repo.js';

test('toAbsPath: bare ~ expands to the home directory', () => {
	assert.equal(toAbsPath('~'), homedir());
});

test('toAbsPath: ~/x expands to home/x (the reported bug)', () => {
	assert.equal(toAbsPath('~/projects/myrepo'), join(homedir(), 'projects/myrepo'));
	// prove the pre-fix behaviour would have been wrong
	assert.notEqual(resolve('~/projects/myrepo'), join(homedir(), 'projects/myrepo'));
});

test('toAbsPath: a ../ relative resolves against cwd (unchanged behaviour)', () => {
	assert.equal(toAbsPath('../sibling'), resolve('../sibling'));
	assert.ok(isAbsolute(toAbsPath('../sibling')));
});

test('toAbsPath: a . relative resolves to cwd', () => {
	assert.equal(toAbsPath('.'), resolve('.'));
});

test('toAbsPath: an already-absolute path is returned normalized + unchanged', () => {
	assert.equal(toAbsPath('/tmp/foo/../bar'), resolve('/tmp/foo/../bar'));
	assert.equal(toAbsPath('/tmp/foo/../bar'), '/tmp/bar');
});

test('toAbsPath: a ~-prefixed username form (no slash) is NOT tilde-expanded', () => {
	// only bare `~` and `~/` are expanded; `~user` is left to resolve() (no shell semantics here)
	assert.equal(toAbsPath('~someuser/x'), resolve('~someuser/x'));
	assert.ok(!toAbsPath('~someuser/x').startsWith(homedir() + 'someuser'));
});
