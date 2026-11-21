/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { persistVerificationReceipt, readReceiptRecord, renderReceiptRecordMd } from '../receipt-record.js';
import type { VerificationReceipt } from '../receipt-record.js';
import { isTestRecordJsonPath, NotApprovableError, approveArtifactByJsonPath } from '../../gates.js';
import type { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import { receiptsArtifactId } from '../../storage.js';
import { makeRiskFamilyVerdictFinding } from '../security-finding.js';

const HASH = 'abc123def4567890';
const T0 = '2026-03-01T10:00:00.000Z';

async function withRepo(fn: (repo: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-receipt-record-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	try { await fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

function receipt(id: string, over: Partial<VerificationReceipt> = {}): VerificationReceipt {
	return { id, result: 'pass', ranAt: T0, ...over };
}

describe('VerificationReceipt and its RECEIPTS record', () => {
	it('VerificationReceipt record shape (pass/fail/evidence linkage by id)', async () => {
		await withRepo(async (repo) => {
			const r = receipt('receipt-1', { result: 'fail', environment: 'docker:node22' });
			assert.equal(r.id, 'receipt-1');
			assert.equal(r.result, 'fail');
			assert.equal(r.environment, 'docker:node22');
			assert.equal(r.ranAt, T0);

			await persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: T0 }, r);
			const rec = readReceiptRecord(repo, HASH, 's1');
			assert.ok(rec);
			assert.deepEqual(rec.body.receipts, [r]);

			// A corroborated SecurityFinding references the receipt by id -- never the receipt object itself.
			const finding = makeRiskFamilyVerdictFinding('verdict-1', 'sast', 'applicable', 'server-side code present');
			const corroborated = { ...finding, receiptId: r.id };
			assert.equal(corroborated.receiptId, rec.body.receipts[0]!.id);
		});
	});

	it('RECEIPTS.md write for a security review round', async () => {
		await withRepo(async (repo) => {
			// Simulates the sandbox/mutation checkpoint of a security review's round 1
			// and round 2, each writing its own receipt as soon as it completes -- no
			// SecurityFinding object exists anywhere in this test, proving the write
			// is unconditional (pass or fail) and never gated on corroboration.
			const round1 = await persistVerificationReceipt(
				repo, { epicHash: HASH, storyId: 's1', now: T0 },
				receipt('review-sec1-round-1-sandbox', { result: 'pass', environment: 'docker:node22' }),
			);
			assert.equal(basename(round1.json), `RECEIPTS-${HASH}-s1.json`);
			assert.equal(basename(round1.md), 'RECEIPTS.md');
			let md = readFileSync(round1.md, 'utf8');
			assert.match(md, /review-sec1-round-1-sandbox/);
			assert.match(md, /pass/);
			assert.match(md, new RegExp(`insrc:artifact ${receiptsArtifactId(HASH, 's1')}`));

			// Round 2's checkpoint fails -- still recorded, unconditionally, in the same
			// Story's receipt record, independent of whether anything corroborates it.
			await persistVerificationReceipt(
				repo, { epicHash: HASH, storyId: 's1', now: T0 },
				receipt('review-sec1-round-2-sandbox', { result: 'fail', environment: 'docker:node22' }),
			);
			const rec = readReceiptRecord(repo, HASH, 's1')!;
			assert.deepEqual(
				rec.body.receipts.map(r => [r.id, r.result]),
				[['review-sec1-round-1-sandbox', 'pass'], ['review-sec1-round-2-sandbox', 'fail']],
				'both rounds\' receipts persist, pass and fail alike, with no SecurityFinding involved at any point',
			);
			md = readFileSync(round1.md, 'utf8');
			assert.match(md, /review-sec1-round-1-sandbox/);
			assert.match(md, /review-sec1-round-2-sandbox/);
			assert.match(renderReceiptRecordMd(rec), /fail/);
		});
	});

	it('approval attempt against a RECEIPTS.md/VerificationReceipt record is refused', async () => {
		const jsonPath = join('/does/not/matter', `${receiptsArtifactId(HASH, 's1')}.json`);
		assert.equal(isTestRecordJsonPath(jsonPath), true, 'a RECEIPTS json path must be recognized as a non-approvable record, matching TESTS.md\'s own prefix check');

		// approveArtifactByJsonPath refuses a non-approvable record BEFORE it ever
		// touches `opts.lifecycle` (the real approval route's own guarantee) -- a
		// cast placeholder is safe here, proven by the rejection itself.
		await assert.rejects(
			approveArtifactByJsonPath(jsonPath, { lifecycle: undefined as unknown as LifecycleService }),
			(err: unknown) => err instanceof NotApprovableError,
			'a RECEIPTS record must be refused the same way a TESTS record already is',
		);
	});
});
