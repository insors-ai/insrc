/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Signoff (Story s7): the derived records, the request Reference and, later, submit and settle.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/signoff.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { signoffRecordsFromHeads, signoffRecordsOf, signoffRefOf, signoffReferenceOf, signoffViewOf } from '../signoff.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

const EPIC = 'a3f4b8c9d1e2f3a4';
const STORY: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: EPIC, storyId: 's1' };

const policy = (over: { anchorKnown?: boolean; firstCommitTime?: string } = {}): TeamPolicy => ({
	teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: over.firstCommitTime ?? '2026-06-01T00:00:00Z', anchorKnown: over.anchorKnown ?? true },
}) as TeamPolicy;

const signoff = (revision: number, ref: string, state: 'open' | 'changes-requested' | 'completed', at = '2026-07-01T00:00:00Z', type = 'signoff-request') =>
	({ revision, request: { entityId: ref, type, relation: 'tracked-by' }, state, actors: [], at });

const head = (status: string, over: { revision?: number; approvedAt?: string; signoffs?: unknown[] } = {}): unknown => ({
	lifecycle: {
		status, revision: { number: over.revision ?? 1 },
		...(over.approvedAt !== undefined ? { approval: { revision: over.revision ?? 1, at: over.approvedAt } } : {}),
		signoffs: over.signoffs ?? [],
	},
});

test('signoffRecordsOf derives sc5 records from lifecycle facts, groups by the ref read from entityId, and grandfathers by the shared rule', () => {
	const heads = {
		'LLD-a3f4b8c9d1e2f3a4-s1': head('signed-off', { signoffs: [signoff(1, 'acme/demo#9', 'completed', '2026-07-02T00:00:00Z')] }),
		'BUILD-a3f4b8c9d1e2f3a4-s1': head('signed-off', { signoffs: [signoff(1, 'acme/demo#9', 'completed', '2026-07-03T00:00:00Z')] }),
	};
	const read = (_repo: string, id: string): unknown => (heads as Record<string, unknown>)[id];
	const readPolicy: PolicyReader = () => ({ ok: true, value: policy() });

	const records = signoffRecordsOf('/repo', STORY, { readPolicy, readHead: read });
	assert.equal(records.length, 1, 'one request covers both artifacts');
	assert.deepEqual(records[0]?.request, { ref: 'acme/demo#9' });
	assert.deepEqual(records[0]?.artifacts.map(a => a.artifactId).sort(), ['BUILD-a3f4b8c9d1e2f3a4-s1', 'LLD-a3f4b8c9d1e2f3a4-s1']);
	assert.equal(records[0]?.completedAt, '2026-07-03T00:00:00Z');
	assert.equal(records[0]?.grandfathered, undefined);

	// an open or changes-requested signoff is not a completed record
	assert.deepEqual(signoffRecordsFromHeads(policy(), [{ artifactId: 'LLD-x', meta: head('in-signoff', { signoffs: [signoff(1, 'r#1', 'open')] }) }]), []);

	// a signoff that names no request is skipped
	assert.deepEqual(signoffRecordsFromHeads(policy(), [{ artifactId: 'LLD-x', meta: head('signed-off', { signoffs: [signoff(1, 'r#1', 'completed', '2026-07-01T00:00:00Z', 'something-else')] }) }]), []);

	// grandfathered by the shared rule: approved before the anchor, anchor known
	const old = { artifactId: 'LLD-old', meta: head('approved', { approvedAt: '2026-05-01T00:00:00Z' }) };
	const known = signoffRecordsFromHeads(policy(), [old]);
	assert.equal(known.length, 1);
	assert.equal(known[0]?.grandfathered, true);
	assert.equal(known[0]?.request.ref, '');
	// and never when the anchor is unknown
	assert.deepEqual(signoffRecordsFromHeads(policy({ anchorKnown: false }), [old]), []);

	// no policy, or no team mode: no records
	assert.deepEqual(signoffRecordsOf('/repo', STORY, { readPolicy: () => ({ ok: true, value: 'none' }), readHead: read }), []);
});

test('the request Reference round trip keeps the ref and never changes the Reference type', () => {
	const reference = signoffReferenceOf({ ref: 'acme/demo#9' });
	assert.deepEqual(reference, { entityId: 'acme/demo#9', type: 'signoff-request', relation: 'tracked-by' });
	assert.deepEqual(signoffRefOf(reference), { ref: 'acme/demo#9' });
	assert.equal(signoffRefOf({ entityId: 'acme/demo#9', type: 'other', relation: 'tracked-by' }), null);
	assert.equal(signoffRefOf({ entityId: '', type: 'signoff-request', relation: 'tracked-by' }), null);
});

test('signoffViewOf shows the signoff of the current revision only', () => {
	assert.deepEqual(signoffViewOf(head('approved')), { state: 'none', request: null, revision: null });
	const open = head('in-signoff', { revision: 2, signoffs: [signoff(1, 'r#1', 'completed'), signoff(2, 'r#2', 'open')] });
	assert.deepEqual(signoffViewOf(open), { state: 'open', request: { ref: 'r#2' }, revision: 2 });
	// edited since: the old signoff covers an older revision
	const edited = head('draft', { revision: 3, signoffs: [signoff(2, 'r#2', 'completed')] });
	assert.deepEqual(signoffViewOf(edited), { state: 'none', request: null, revision: null });
	assert.deepEqual(signoffViewOf(undefined), { state: 'none', request: null, revision: null });
});
