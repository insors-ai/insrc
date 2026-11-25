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
import { deriveReceiptIdentity, verifyContentIdentityMatch, ContentIdentityMismatchError, assembleSecurityReport } from '../run-security-review.js';
import { _setContentIdentityDepsForTests } from '../content-identity.js';
import type { SecurityAdvisoryEvidence, SecurityAdvisoryMatch } from '../collect-dependency-advisories.js';
import type { SecurityFinding } from '../../review-round/security-finding.js';
import type { SecurityModelSelection } from '../../../config/analyze.js';

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

// --- assembleSecurityReport (s3/t3) ---------------------------------------

function match(over: Partial<SecurityAdvisoryMatch> = {}): SecurityAdvisoryMatch {
	return { coordinate: 'npm:left-pad@1.0.0', advisoryId: 'GHSA-xxxx', affectedVersions: '<1.0.1', severity: 'HIGH', provenance: 'pkg_audit', advisoryDestination: 'registry.npmjs.org', ...over };
}

function codeFinding(over: Partial<SecurityFinding> = {}): SecurityFinding {
	return { id: 'f1', category: 'security', severity: 'HIGH', kind: 'security', checkId: 'injection', evidence: [], enforcementMode: 'advisory', ...over };
}

const receipts = {
	round1: { id: 'r1', result: 'pass' as const, ranAt: '2026-11-24T00:00:00.000Z' },
	round2: { id: 'r2', result: 'pass' as const, ranAt: '2026-11-24T00:01:00.000Z' },
};

const modelSelection: SecurityModelSelection & { status: 'configured' } = { status: 'configured', provider: 'cli-claude', modelId: 'claude-opus' };

test("assembleSecurityReport: confirmed matches map to dependency-advisory SecurityFindings with checkId:'dependency-advisory' and NO receiptId; round-1/round-2 code findings keep whatever receiptId they already carry", () => {
	const round1Finding = codeFinding({ id: 'f-round1', receiptId: receipts.round1.id });
	const round2Finding = codeFinding({ id: 'f-round2', receiptId: receipts.round2.id });
	const report = assembleSecurityReport(
		evidence({ matches: [match()] }), [round1Finding, round2Finding], [], receipts, modelSelection, { path: 'x.md', markdown: '# base' },
	);
	const advisoryFindings = report.findings.filter(f => f.checkId === 'dependency-advisory');
	assert.equal(advisoryFindings.length, 1);
	assert.equal(advisoryFindings[0]!.receiptId, undefined);
	assert.equal(report.findings.find(f => f.id === 'f-round1')!.receiptId, receipts.round1.id);
	assert.equal(report.findings.find(f => f.id === 'f-round2')!.receiptId, receipts.round2.id);
});

test('assembleSecurityReport: unresolvedDependencies/unavailableSources pass through verbatim; empty inputs produce an empty findings array', () => {
	const emptyReport = assembleSecurityReport(evidence(), [], [], receipts, modelSelection, { path: 'x.md', markdown: '# base' });
	assert.deepEqual(emptyReport.findings, []);

	const gapsEvidence = evidence({ unresolvedDependencies: ['pkg-a'], unavailableSources: ['pkg-b'] });
	const report = assembleSecurityReport(gapsEvidence, [], [], receipts, modelSelection, { path: 'x.md', markdown: '# base' });
	assert.deepEqual(report.unresolvedDependencies, ['pkg-a']);
	assert.deepEqual(report.unavailableSources, ['pkg-b']);
});

test('assembleSecurityReport: effectiveModel equals modelSelection exactly as passed in, even when it differs from the repo-configured tier default', () => {
	const differentSelection: SecurityModelSelection & { status: 'configured' } = { status: 'configured', provider: 'cli-codex', modelId: 'o-whatever' };
	const report = assembleSecurityReport(evidence(), [], [], receipts, differentSelection, { path: 'x.md', markdown: '# base' });
	assert.deepEqual(report.effectiveModel, { provider: 'cli-codex', modelId: 'o-whatever' });
});

test('assembleSecurityReport: reconciliation and receipts are carried through verbatim; baseReportMarkdown is the supplied base markdown', () => {
	const reconciliation = [{ priorFindingRef: 'f1', verdict: 'confirmed' as const }];
	const report = assembleSecurityReport(evidence(), [], reconciliation, receipts, modelSelection, { path: 'x.md', markdown: '# the base report' });
	assert.deepEqual(report.reconciliation, reconciliation);
	assert.deepEqual(report.receipts, receipts);
	assert.equal(report.baseReportMarkdown, '# the base report');
});
