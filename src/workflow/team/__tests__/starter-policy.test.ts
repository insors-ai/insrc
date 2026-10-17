/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * StarterPolicyWriter tests (Story s2 / t7).
 *
 * Run:
 *   npx tsx --test src/workflow/team/__tests__/starter-policy.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parsePolicyFile } from '../policy-parser.js';
import { writeStarterPolicy } from '../starter-policy.js';

function scratch(): string {
	return mkdtempSync(join(tmpdir(), 'starter-'));
}

test('writes a starter with signoff for DEF, HLD, LLD and BUILD and claims enforced', () => {
	const repo = scratch();
	try {
		const result = writeStarterPolicy(repo);
		assert.equal(result.ok, true, result.ok ? '' : result.reason);
		if (!result.ok) return;
		assert.equal(result.value.path, join(repo, '.insrc', 'policy.json'));

		const parsed = parsePolicyFile(readFileSync(result.value.path, 'utf8'));
		assert.equal(parsed.ok, true, 'the starter is a valid policy file');
		if (!parsed.ok) return;
		assert.deepEqual(parsed.value.signoffStages, ['DEF', 'HLD', 'LLD', 'BUILD']);
		assert.equal(parsed.value.claimsEnforced, true);
		assert.equal(parsed.value.teamMode, true);
		assert.deepEqual(readdirSync(join(repo, '.insrc')), ['policy.json'], 'no temporary file is left behind');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('refuses to overwrite an existing file', () => {
	const repo = scratch();
	try {
		mkdirSync(join(repo, '.insrc'));
		const existing = join(repo, '.insrc', 'policy.json');
		writeFileSync(existing, '{"mine":"uncommitted edit"}');
		const result = writeStarterPolicy(repo);
		assert.equal(result.ok, false);
		if (!result.ok) assert.match(result.reason, /already exists/);
		assert.equal(readFileSync(existing, 'utf8'), '{"mine":"uncommitted edit"}', 'the existing file is untouched');
		assert.deepEqual(readdirSync(join(repo, '.insrc')), ['policy.json']);

		assert.equal(writeStarterPolicy(join(repo, 'missing')).ok, false, 'a missing directory is refused');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
