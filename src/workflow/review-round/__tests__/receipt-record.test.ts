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
			const paths = await persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: T0 }, receipt('receipt-1'));
			assert.equal(basename(paths.json), `RECEIPTS-${HASH}-s1.json`);
			assert.equal(basename(paths.md), 'RECEIPTS.md');
			const md = readFileSync(paths.md, 'utf8');
			assert.match(md, /receipt-1/);
			assert.match(md, new RegExp(`insrc:artifact ${receiptsArtifactId(HASH, 's1')}`));
			const rendered = renderReceiptRecordMd(readReceiptRecord(repo, HASH, 's1')!);
			assert.match(rendered, /pass/);

			// A second receipt for a failed run is recorded independent of whether any
			// SecurityFinding corroborates it -- both entries persist.
			await persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: T0 }, receipt('receipt-2', { result: 'fail' }));
			const rec = readReceiptRecord(repo, HASH, 's1')!;
			assert.deepEqual(rec.body.receipts.map(r => [r.id, r.result]), [['receipt-1', 'pass'], ['receipt-2', 'fail']]);
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
