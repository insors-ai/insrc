/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Amendment on-disk store — proposal + approval + rejection +
 * immutability + id generation.
 *
 * Amendment ids under the hash layout are `AMD-<epicHash>-<n>`.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/amendments/__tests__/store.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { mkAmendmentRepo } from './epic-head.js';

import {
	AmendmentIdConflictError,
	AmendmentImmutabilityError,
	AmendmentNotFoundError,
	approveAmendment,
	listAmendments,
	listApprovedAmendments,
	nextAmendmentId,
	proposeAmendment,
	readAmendment,
	rejectAmendment,
} from '../store.js';
import type { Amendment, AmendmentRecord } from '../types.js';
import { approvalStateOf } from '../../artifact-core/approval-view.js';
import { amendmentPath } from '../store.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const AMD1 = `AMD-${HASH}-1`;
const AMD2 = `AMD-${HASH}-2`;
const AMD3 = `AMD-${HASH}-3`;
const AMD4 = `AMD-${HASH}-4`;
const AMD10 = `AMD-${HASH}-10`;

const AMENDMENT: Amendment = {
	type: 'sharedContract.fieldAdd',
	contractId: 'sc1',
	field: { name: 'sortBy', type: 'string', optional: true, purpose: 'sort order' },
	breaking: false,
};

function record(overrides: Partial<AmendmentRecord> = {}): AmendmentRecord {
	return {
		id:           AMD1,
		epicHash:     HASH,
		epicSlug:     'test-epic',
		hldBaseRunId: 'base-1',
		amendment:    AMENDMENT,
		rationale:    'need sort order',
		citations:    [],
		proposedBy:   { workflow: 'design.story', runId: 'lld-1', storyId: 's2', stepId: 's4' },
		proposedAt:   '2026-07-12T00:00:00Z',
		status:       'pending',
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// nextAmendmentId
// ---------------------------------------------------------------------------

test('nextAmendmentId starts at 1 in an empty repo', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		assert.equal(nextAmendmentId(repo, HASH), AMD1);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('nextAmendmentId advances past existing entries', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await proposeAmendment(repo, record({ id: AMD1 }));
		await proposeAmendment(repo, record({ id: AMD3 }));
		assert.equal(nextAmendmentId(repo, HASH), `AMD-${HASH}-4`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// propose
// ---------------------------------------------------------------------------

test('proposeAmendment writes a record then readAmendment returns it', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await proposeAmendment(repo, record());
		const back = readAmendment(repo, AMD1);
		assert.equal(back.id, AMD1);
		assert.equal(back.status, 'pending');
		assert.equal(back.amendment.type, 'sharedContract.fieldAdd');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('proposeAmendment refuses duplicate ids', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await proposeAmendment(repo, record());
		await assert.rejects(
			proposeAmendment(repo, record()),
			(err: Error) => err instanceof AmendmentIdConflictError,
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('proposeAmendment refuses non-pending status at write time', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await assert.rejects(proposeAmendment(repo, record({ status: 'approved' })));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// approve / reject
// ---------------------------------------------------------------------------

test('approveAmendment sets status + approvedAt + approvedBy', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await proposeAmendment(repo, record());
		const back = await approveAmendment(repo, AMD1, 'alice');
		assert.equal(back.status, 'approved');
		assert.equal(back.approvedBy, 'alice');
		assert.match(back.approvedAt!, /^\d{4}-\d{2}-\d{2}T/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('approveAmendment refuses double-approve', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await proposeAmendment(repo, record());
		await approveAmendment(repo, AMD1, 'alice');
		await assert.rejects(
			approveAmendment(repo, AMD1, 'alice'),
			(err: Error) => err instanceof AmendmentImmutabilityError,
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('rejectAmendment refuses missing reason', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await proposeAmendment(repo, record());
		await assert.rejects(rejectAmendment(repo, AMD1, ''));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('rejectAmendment refuses on approved records', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await proposeAmendment(repo, record());
		await approveAmendment(repo, AMD1, 'alice');
		await assert.rejects(
			rejectAmendment(repo, AMD1, 'x'),
			(err: Error) => err instanceof AmendmentImmutabilityError,
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// list / listApproved
// ---------------------------------------------------------------------------

test('listAmendments returns records in id-suffix order', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await proposeAmendment(repo, record({ id: AMD2 }));
		await proposeAmendment(repo, record({ id: AMD1 }));
		await proposeAmendment(repo, record({ id: AMD10 }));
		const rows = listAmendments(repo, HASH);
		assert.deepEqual(rows.map(r => r.id), [AMD1, AMD2, AMD10]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('listAmendments filters by Epic hash prefix', async () => {
	const OTHER = 'b1b1b1b1b1b1b1b1';
	const repo = mkAmendmentRepo(HASH, OTHER);
	try {
		await proposeAmendment(repo, record({ id: AMD1 }));
		await proposeAmendment(repo, record({ id: `AMD-${OTHER}-1`, epicHash: OTHER }));
		const rows = listAmendments(repo, HASH);
		assert.deepEqual(rows.map(r => r.id), [AMD1]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('listApprovedAmendments filters + sorts by approvedAt', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await proposeAmendment(repo, record({ id: AMD1 }));
		await proposeAmendment(repo, record({ id: AMD2 }));
		await proposeAmendment(repo, record({ id: AMD3 }));
		await proposeAmendment(repo, record({ id: AMD4 }));
		await approveAmendment(repo, AMD3, 'a');
		await new Promise(r => setTimeout(r, 5));
		await approveAmendment(repo, AMD1, 'a');
		await rejectAmendment(repo, AMD4, 'nope');
		const rows = listApprovedAmendments(repo, HASH);
		assert.deepEqual(rows.map(r => r.id), [AMD3, AMD1]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// readAmendment errors
// ---------------------------------------------------------------------------

test('readAmendment throws when record is missing', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		assert.throws(
			() => readAmendment(repo, `AMD-${HASH}-999`),
			(err: Error) => err instanceof AmendmentNotFoundError,
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// amendments are heads with a lifecycle
// ---------------------------------------------------------------------------

test('store.test.ts: amendments are heads with a lifecycle', async () => {
	const repo = mkAmendmentRepo(HASH);
	try {
		await proposeAmendment(repo, record({ id: AMD1 }));
		await proposeAmendment(repo, record({ id: AMD2 }));
		const head = (id: string): { meta: Record<string, unknown>; body: Record<string, unknown>; citations: unknown[] } => JSON.parse(readFileSync(amendmentPath(repo, id), 'utf8'));

		// a proposal is a head: its proposal is the body, its decision the lifecycle, and it carries no flat decision field
		const proposed = head(AMD1);
		assert.equal((proposed.meta['lifecycle'] as { status: string }).status, 'draft');
		assert.equal(proposed.meta['epicHash'], HASH);
		assert.equal(proposed.body['id'], AMD1);
		assert.deepEqual(proposed.body['amendment'], AMENDMENT);
		for (const flat of ['status', 'approvedAt', 'approvedBy', 'rejectedAt', 'rejectedReason']) assert.equal(proposed.meta[flat] ?? proposed.body[flat], undefined, `no ${flat} on the head`);
		assert.equal(readAmendment(repo, AMD1).status, 'pending');

		// approval is the lifecycle's: the view reads it, and the content is not touched
		const approved = await approveAmendment(repo, AMD1, 'alice');
		const after = head(AMD1);
		assert.equal(approvalStateOf(after.meta), 'approved');
		assert.equal(after.meta['approvedAt'], undefined);
		assert.deepEqual(after.body, proposed.body, 'a decision leaves the proposal as it was');
		assert.equal(approved.status, 'approved');
		assert.equal(approved.approvedBy, 'alice');
		assert.equal(approved.approvedAt, (after.meta['lifecycle'] as { approval: { at: string } }).approval.at);
		assert.deepEqual(listApprovedAmendments(repo, HASH).map(a => a.id), [AMD1], 'the effective set reads the lifecycle approval');

		// rejection is a lifecycle step whose reason is the log entry
		const rejected = await rejectAmendment(repo, AMD2, 'not needed');
		assert.equal(approvalStateOf(head(AMD2).meta), 'rejected');
		assert.equal(rejected.status, 'rejected');
		assert.equal(rejected.rejectedReason, 'not needed');
		assert.match(rejected.rejectedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
		assert.deepEqual(listApprovedAmendments(repo, HASH).map(a => a.id), [AMD1]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
