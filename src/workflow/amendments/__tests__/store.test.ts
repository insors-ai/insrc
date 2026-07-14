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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

test('nextAmendmentId starts at 1 in an empty repo', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		assert.equal(nextAmendmentId(repo, HASH), AMD1);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('nextAmendmentId advances past existing entries', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		proposeAmendment(repo, record({ id: AMD1 }));
		proposeAmendment(repo, record({ id: AMD3 }));
		assert.equal(nextAmendmentId(repo, HASH), `AMD-${HASH}-4`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// propose
// ---------------------------------------------------------------------------

test('proposeAmendment writes a record then readAmendment returns it', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		proposeAmendment(repo, record());
		const back = readAmendment(repo, AMD1);
		assert.equal(back.id, AMD1);
		assert.equal(back.status, 'pending');
		assert.equal(back.amendment.type, 'sharedContract.fieldAdd');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('proposeAmendment refuses duplicate ids', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		proposeAmendment(repo, record());
		assert.throws(
			() => proposeAmendment(repo, record()),
			(err: Error) => err instanceof AmendmentIdConflictError,
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('proposeAmendment refuses non-pending status at write time', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		assert.throws(() => proposeAmendment(repo, record({ status: 'approved' })));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// approve / reject
// ---------------------------------------------------------------------------

test('approveAmendment sets status + approvedAt + approvedBy', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		proposeAmendment(repo, record());
		const back = approveAmendment(repo, AMD1, 'alice');
		assert.equal(back.status, 'approved');
		assert.equal(back.approvedBy, 'alice');
		assert.match(back.approvedAt!, /^\d{4}-\d{2}-\d{2}T/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('approveAmendment refuses double-approve', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		proposeAmendment(repo, record());
		approveAmendment(repo, AMD1, 'alice');
		assert.throws(
			() => approveAmendment(repo, AMD1, 'alice'),
			(err: Error) => err instanceof AmendmentImmutabilityError,
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('rejectAmendment refuses missing reason', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		proposeAmendment(repo, record());
		assert.throws(() => rejectAmendment(repo, AMD1, ''));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('rejectAmendment refuses on approved records', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		proposeAmendment(repo, record());
		approveAmendment(repo, AMD1, 'alice');
		assert.throws(
			() => rejectAmendment(repo, AMD1, 'x'),
			(err: Error) => err instanceof AmendmentImmutabilityError,
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// list / listApproved
// ---------------------------------------------------------------------------

test('listAmendments returns records in id-suffix order', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		proposeAmendment(repo, record({ id: AMD2 }));
		proposeAmendment(repo, record({ id: AMD1 }));
		proposeAmendment(repo, record({ id: AMD10 }));
		const rows = listAmendments(repo, HASH);
		assert.deepEqual(rows.map(r => r.id), [AMD1, AMD2, AMD10]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('listAmendments filters by Epic hash prefix', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	const OTHER = 'b1b1b1b1b1b1b1b1';
	try {
		proposeAmendment(repo, record({ id: AMD1 }));
		proposeAmendment(repo, record({ id: `AMD-${OTHER}-1`, epicHash: OTHER }));
		const rows = listAmendments(repo, HASH);
		assert.deepEqual(rows.map(r => r.id), [AMD1]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('listApprovedAmendments filters + sorts by approvedAt', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		proposeAmendment(repo, record({ id: AMD1 }));
		proposeAmendment(repo, record({ id: AMD2 }));
		proposeAmendment(repo, record({ id: AMD3 }));
		proposeAmendment(repo, record({ id: AMD4 }));
		approveAmendment(repo, AMD3, 'a');
		await new Promise(r => setTimeout(r, 5));
		approveAmendment(repo, AMD1, 'a');
		rejectAmendment(repo, AMD4, 'nope');
		const rows = listApprovedAmendments(repo, HASH);
		assert.deepEqual(rows.map(r => r.id), [AMD3, AMD1]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// readAmendment errors
// ---------------------------------------------------------------------------

test('readAmendment throws when record is missing', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	try {
		assert.throws(
			() => readAmendment(repo, `AMD-${HASH}-999`),
			(err: Error) => err instanceof AmendmentNotFoundError,
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
