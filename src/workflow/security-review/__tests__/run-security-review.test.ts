/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s3/t1: deriveReceiptIdentity, verifyContentIdentityMatch.
 * Run: npx tsx --test src/workflow/security-review/__tests__/run-security-review.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { registerGitTools } from '../../../daemon/tools/builtins/git/index.js';
import { persistVerificationReceipt, readReceiptRecord } from '../../review-round/receipt-record.js';
import { deriveReceiptIdentity, verifyContentIdentityMatch, ContentIdentityMismatchError } from '../run-security-review.js';
import { _setContentIdentityDepsForTests } from '../content-identity.js';
import type { SecurityAdvisoryEvidence } from '../collect-dependency-advisories.js';

// computeContentIdentity resolves HEAD through the shared executeTool
// dispatcher (git_rev_parse) -- the tool must be registered before any test
// in this file runs.
registerGitTools();

function initRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-run-security-review-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
	execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
	writeFileSync(join(repo, 'app.ts'), 'export const x = 1;\n');
	execFileSync('git', ['add', '.'], { cwd: repo });
	execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
	return repo;
}

function treatAsRegistered(repoPath: string): void {
	_setContentIdentityDepsForTests(async candidate => candidate === repoPath);
}

function cleanup(repo: string): void {
	_setContentIdentityDepsForTests();
	rmSync(repo, { recursive: true, force: true });
}

function evidence(over: Partial<SecurityAdvisoryEvidence> = {}): SecurityAdvisoryEvidence {
	return {
		contentIdentity: 'identity-a', contentStable: true, readOnly: true,
		queriedCoordinates: [], matches: [], perManagerMode: [],
		unresolvedDependencies: [], unavailableSources: [],
		...over,
	};
}

test('deriveReceiptIdentity: same contentIdentity re-derives the identical pair; a different identity derives a different pair', () => {
	const a1 = deriveReceiptIdentity('identity-a');
	const a2 = deriveReceiptIdentity('identity-a');
	const b = deriveReceiptIdentity('identity-b');
	assert.deepEqual(a1, a2);
	assert.equal(a1.storyId, 's1');
	assert.match(a1.epicHash, /^[0-9a-f]{16}$/);
	assert.notEqual(a1.epicHash, b.epicHash);
});

test("deriveReceiptIdentity's output round-trips through a REAL persistVerificationReceipt + readReceiptRecord call without being rejected by the storage layer", async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-run-security-review-receipt-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	try {
		const { epicHash, storyId } = deriveReceiptIdentity('identity-roundtrip');
		await persistVerificationReceipt(repo, { epicHash, storyId, now: '2026-11-24T00:00:00.000Z' }, { id: 'round-1', result: 'pass', ranAt: '2026-11-24T00:00:00.000Z' });
		const record = readReceiptRecord(repo, epicHash, storyId);
		assert.ok(record);
		assert.deepEqual(record.body.receipts.map(r => r.id), ['round-1']);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('verifyContentIdentityMatch: resolves on a match with contentStable:true; throws on identity mismatch; throws on contentStable:false even when identity matches', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		const targets = { entries: [{ path: 'app.ts' }] };
		const { computeContentIdentity } = await import('../content-identity.js');
		const real = await computeContentIdentity(repo, targets);

		await assert.doesNotReject(() => verifyContentIdentityMatch(repo, targets, evidence({ contentIdentity: real, contentStable: true })));
		await assert.rejects(() => verifyContentIdentityMatch(repo, targets, evidence({ contentIdentity: 'not-the-real-one', contentStable: true })), ContentIdentityMismatchError);
		await assert.rejects(() => verifyContentIdentityMatch(repo, targets, evidence({ contentIdentity: real, contentStable: false })), ContentIdentityMismatchError);
	} finally {
		cleanup(repo);
	}
});
