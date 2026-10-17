/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Policy file parser tests (Story s2 / t1).
 *
 * Run:
 *   npx tsx --test src/workflow/team/__tests__/policy-parser.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PATHS } from '../../../shared/paths.js';
import { buildTeamPolicy, parsePolicyFile } from '../policy-parser.js';

const VALID = { teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: ['lead'] };

test('a valid policy file parses with the fixed claimUnits and forceTaskIssues true', () => {
	const parsed = parsePolicyFile(JSON.stringify(VALID));
	assert.equal(parsed.ok, true);
	if (!parsed.ok) return;
	const policy = buildTeamPolicy(parsed.value, {
		ref: 'refs/remotes/origin/main',
		fetchedAt: '2026-10-17T00:00:00.000Z',
		anchor: { known: true, firstCommit: 'abc123', firstCommitTime: '2026-01-01T00:00:00+00:00' },
	});
	assert.deepEqual(policy.claimUnits, { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] });
	assert.equal(policy.forceTaskIssues, true);
	assert.deepEqual(policy.signoffStages, ['DEF', 'HLD', 'LLD', 'BUILD']);
	assert.equal(policy.source.anchorKnown, true);
	assert.equal(policy.source.firstCommit, 'abc123');
});

test('an unknown anchor yields empty commit and time with anchorKnown false', () => {
	const parsed = parsePolicyFile(JSON.stringify(VALID));
	assert.equal(parsed.ok, true);
	if (!parsed.ok) return;
	const policy = buildTeamPolicy(parsed.value, {
		ref: 'refs/remotes/origin/main',
		fetchedAt: 'now',
		anchor: { known: false, firstCommit: 'ignored', firstCommitTime: 'ignored' },
	});
	assert.equal(policy.source.anchorKnown, false);
	assert.equal(policy.source.firstCommit, '');
	assert.equal(policy.source.firstCommitTime, '');
});

test('bad JSON, an unknown field, a wrong type and a file carrying claimUnits, forceTaskIssues or source are rejected with a reason', () => {
	const cases: ReadonlyArray<readonly [string, string, RegExp]> = [
		['bad JSON', '{not json', /not valid JSON/],
		['not an object', '[]', /must be a JSON object/],
		['unknown field', JSON.stringify({ ...VALID, extra: 1 }), /unknown field 'extra'/],
		['wrong type teamMode', JSON.stringify({ ...VALID, teamMode: 'yes' }), /'teamMode' must be a boolean/],
		['wrong type claimsEnforced', JSON.stringify({ ...VALID, claimsEnforced: 1 }), /'claimsEnforced' must be a boolean/],
		['invalid stage', JSON.stringify({ ...VALID, signoffStages: ['PLAN'] }), /invalid stage/],
		['repeated stage', JSON.stringify({ ...VALID, signoffStages: ['DEF', 'DEF'] }), /repeats stage/],
		['bad administrators', JSON.stringify({ ...VALID, administrators: [1] }), /'administrators'/],
		['missing field', JSON.stringify({ teamMode: true }), /'claimsEnforced' must be a boolean/],
		['claimUnits', JSON.stringify({ ...VALID, claimUnits: {} }), /must not set 'claimUnits'/],
		['forceTaskIssues', JSON.stringify({ ...VALID, forceTaskIssues: false }), /must not set 'forceTaskIssues'/],
		['source', JSON.stringify({ ...VALID, source: {} }), /must not set 'source'/],
	];
	for (const [label, text, pattern] of cases) {
		const parsed = parsePolicyFile(text);
		assert.equal(parsed.ok, false, label);
		if (!parsed.ok) assert.match(parsed.reason, pattern, label);
	}
});

test('PATHS exposes the team directory used by the sighting store', () => {
	assert.ok(PATHS.team.endsWith('/.insrc/team'));
});
