/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s3/t4: runSecurityReview.
 * Run: npx tsx --test src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { registerGitTools } from '../../../daemon/tools/builtins/git/index.js';
import { _setResolveForCwdForTests } from '../../../daemon/steps/resolve-repo.js';
import { readReceiptRecord } from '../../review-round/receipt-record.js';
import { _setCheckpointDepsForTests } from '../../review-round/checkpoint.js';
import { _setReviewReportDepsForTests } from '../../review-round/review-report.js';
import { _setReconciliationDepsForTests } from '../../review-round/reconciliation.js';
import { runInStepContext } from '../../../shared/step-context.js';
import { savedAnalysisExecution } from '../../../analyze/connection-access.js';
import {
	runSecurityReview, ContentIdentityMismatchError, SecurityModelUnavailableError,
} from '../run-security-review.js';
import { _setContentIdentityDepsForTests } from '../content-identity.js';
import { _setRunSecurityCodePassForTests } from '../security-round-hooks.js';
import type { SecurityAdvisoryEvidence } from '../collect-dependency-advisories.js';
import type { SecurityFinding } from '../../review-round/security-finding.js';
import type { SecurityModelSelection } from '../../../config/analyze.js';

registerGitTools();

function initRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-run-security-review-orch-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
	execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
	writeFileSync(join(repo, 'app.ts'), 'export const x = 1;\n');
	execFileSync('git', ['add', '.'], { cwd: repo });
	execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
	return repo;
}

function wireRepo(repo: string): void {
	_setContentIdentityDepsForTests(async candidate => candidate === repo);
	_setCheckpointDepsForTests({ resolveRepoRoot: async () => repo });
	_setReviewReportDepsForTests({ resolveRepoRoot: async () => repo });
	_setReconciliationDepsForTests({ resolveRepoRoot: async () => repo, classify: async (_id, prior) => prior.map(() => 'still-open') });
}

function unwire(): void {
	_setContentIdentityDepsForTests();
	_setCheckpointDepsForTests();
	_setReviewReportDepsForTests();
	_setReconciliationDepsForTests();
	_setRunSecurityCodePassForTests();
}

const targets = { entries: [{ path: 'app.ts' }] };
const modelSelection: SecurityModelSelection & { status: 'configured' } = { status: 'configured', provider: 'cli-claude', modelId: 'claude-opus' };

async function realContentIdentity(repo: string): Promise<string> {
	const { computeContentIdentity } = await import('../content-identity.js');
	return computeContentIdentity(repo, targets);
}

function evidenceFor(contentIdentity: string, over: Partial<SecurityAdvisoryEvidence> = {}): SecurityAdvisoryEvidence {
	return {
		contentIdentity, contentStable: true, readOnly: true,
		queriedCoordinates: [], matches: [], perManagerMode: [],
		unresolvedDependencies: [], unavailableSources: [],
		...over,
	};
}

function finding(id: string): SecurityFinding {
	return { id, category: 'security', severity: 'HIGH', kind: 'security', checkId: 'injection', evidence: [], enforcementMode: 'advisory' };
}

test('a targets.entries path resolving outside repoPath throws SYNCHRONOUSLY (never a rejected Promise) with no dispatch, before any receipt or round work', async () => {
	const repo = initRepo();
	wireRepo(repo);
	let dispatched = false;
	_setRunSecurityCodePassForTests(async () => { dispatched = true; return []; });
	try {
		const identity = await realContentIdentity(repo);
		assert.throws(
			() => runSecurityReview(repo, { entries: [{ path: '../outside.ts' }] }, { reviewId: `r-${randomUUID()}`, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z' }),
			/resolves outside repoPath/,
		);
		assert.equal(dispatched, false, 'the fake code-pass dispatch was never called');
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test("runSecurityReview binds the call to a step context over repoPath, preserving an already-bound outer connectionExecution", async () => {
	const repo = initRepo();
	wireRepo(repo);
	_setRunSecurityCodePassForTests(async () => []);
	const saved = savedAnalysisExecution(repo);
	try {
		const identity = await realContentIdentity(repo);
		const reviewId = `r-${randomUUID()}`;
		const report = await runInStepContext({ cwd: repo, connectionExecution: saved }, () =>
			runSecurityReview(repo, targets, { reviewId, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z' }),
		);
		assert.ok(report);
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test("refuses before any round dispatches when modelSelection.status is 'unavailable'; the fake CLI session is never called", async () => {
	const repo = initRepo();
	wireRepo(repo);
	let dispatched = false;
	_setRunSecurityCodePassForTests(async () => { dispatched = true; return []; });
	try {
		const identity = await realContentIdentity(repo);
		const unavailable: SecurityModelSelection = { status: 'unavailable', blockerReason: 'no backend' };
		await assert.rejects(
			runSecurityReview(repo, targets, { reviewId: `r-${randomUUID()}`, modelSelection: unavailable, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z' }),
			SecurityModelUnavailableError,
		);
		assert.equal(dispatched, false);
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test('refuses before any round dispatches when the pre-flight verifyContentIdentityMatch fails, and no receipt is persisted', async () => {
	const repo = initRepo();
	wireRepo(repo);
	let dispatched = false;
	_setRunSecurityCodePassForTests(async () => { dispatched = true; return []; });
	try {
		const reviewId = `r-${randomUUID()}`;
		await assert.rejects(
			runSecurityReview(repo, targets, { reviewId, modelSelection, advisoryEvidence: evidenceFor('stale-identity'), now: '2026-11-25T00:00:00.000Z', epicHash: '0000000000000000', storyId: 's9' }),
			ContentIdentityMismatchError,
		);
		assert.equal(dispatched, false);
		assert.equal(readReceiptRecord(repo, '0000000000000000', 's9'), null);
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test("persists exactly ONE VerificationReceipt per round, both 'pass' on a clean run; epicHash/storyId supplied are threaded through unchanged", async () => {
	const repo = initRepo();
	wireRepo(repo);
	_setRunSecurityCodePassForTests(async (_repoPath, _targets, _model, round) => [finding(`f-round${round}`)]);
	try {
		const identity = await realContentIdentity(repo);
		const reviewId = `r-${randomUUID()}`;
		const report = await runSecurityReview(repo, targets, {
			reviewId, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z', epicHash: 'abcdef0123456789', storyId: 's3',
		});
		assert.equal(report.receipts.round1.result, 'pass');
		assert.equal(report.receipts.round2.result, 'pass');
		assert.deepEqual(report.effectiveModel, { provider: modelSelection.provider, modelId: modelSelection.modelId }, 'effectiveModel matches the modelSelection actually passed in');
		const record = readReceiptRecord(repo, 'abcdef0123456789', 's3');
		assert.ok(record);
		assert.equal(record.meta.standalone, undefined, 'explicit epicHash/storyId leaves standalone unset');
		const ids = record.body.receipts.map(r => r.id);
		assert.ok(ids.includes(report.receipts.round1.id) && ids.includes(report.receipts.round2.id));
		assert.equal(report.findings.find(f => f.id === 'f-round1')!.receiptId, report.receipts.round1.id);
		assert.equal(report.findings.find(f => f.id === 'f-round2')!.receiptId, report.receipts.round2.id);
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test('SecurityReviewReport.effectiveModel matches the modelSelection actually passed in, even when it differs from this file\'s own baseline fixture modelSelection (standing in for "the repo\'s currently-configured tier default", which t4 itself never resolves or consults -- s1 owns that)', async () => {
	const repo = initRepo();
	wireRepo(repo);
	_setRunSecurityCodePassForTests(async () => []);
	try {
		const identity = await realContentIdentity(repo);
		const differingModelSelection: SecurityModelSelection & { status: 'configured' } = { status: 'configured', provider: 'cli-codex', modelId: 'a-non-default-model-id' };
		assert.notDeepEqual(differingModelSelection, modelSelection, 'the two selections genuinely differ');
		const report = await runSecurityReview(repo, targets, {
			reviewId: `r-${randomUUID()}`, modelSelection: differingModelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z',
		});
		assert.deepEqual(report.effectiveModel, { provider: 'cli-codex', modelId: 'a-non-default-model-id' }, 'effectiveModel reflects the DIFFERING selection actually passed in, never the file\'s baseline');
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test("without epicHash/storyId, deriveReceiptIdentity's output is used and standalone:true is set", async () => {
	const repo = initRepo();
	wireRepo(repo);
	_setRunSecurityCodePassForTests(async () => []);
	try {
		const identity = await realContentIdentity(repo);
		const { deriveReceiptIdentity } = await import('../run-security-review.js');
		const { epicHash, storyId } = deriveReceiptIdentity(identity);
		await runSecurityReview(repo, targets, { reviewId: `r-${randomUUID()}`, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z' });
		const record = readReceiptRecord(repo, epicHash, storyId);
		assert.ok(record);
		assert.equal(record.meta.standalone, true);
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test("a round's own execution failure persists only that round's 'fail' receipt and never dispatches a later round", async () => {
	const repo = initRepo();
	wireRepo(repo);
	let round2Dispatched = false;
	_setRunSecurityCodePassForTests(async (_r, _t, _m, round) => {
		if (round === 1) throw new Error('round 1 CLI dispatch failed');
		round2Dispatched = true;
		return [];
	});
	try {
		const identity = await realContentIdentity(repo);
		await assert.rejects(
			runSecurityReview(repo, targets, { reviewId: `r-${randomUUID()}`, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z', epicHash: '1111111111111111', storyId: 's3' }),
			/round 1 CLI dispatch failed/,
		);
		assert.equal(round2Dispatched, false);
		const record = readReceiptRecord(repo, '1111111111111111', 's3');
		assert.ok(record);
		assert.deepEqual(record.body.receipts.map(r => r.result), ['fail']);
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test('reverifies contentIdentity before round 2: a repository edit injected between round 1 and round 2 is caught and aborts with ContentIdentityMismatchError, with round 1\'s receipt already durably persisted as pass', async () => {
	const repo = initRepo();
	wireRepo(repo);
	const identity = await realContentIdentity(repo);
	let round = 0;
	_setRunSecurityCodePassForTests(async () => {
		round++;
		if (round === 1) {
			// mutate the repo between round 1 and round 2's pre-flight reverify
			writeFileSync(join(repo, 'app.ts'), 'export const x = 2;\n');
			execFileSync('git', ['add', '.'], { cwd: repo });
			execFileSync('git', ['commit', '-q', '-m', 'mutate'], { cwd: repo });
		}
		return [];
	});
	try {
		await assert.rejects(
			runSecurityReview(repo, targets, { reviewId: `r-${randomUUID()}`, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z', epicHash: '2222222222222222', storyId: 's3' }),
			ContentIdentityMismatchError,
		);
		const record = readReceiptRecord(repo, '2222222222222222', 's3');
		assert.ok(record);
		assert.deepEqual(record.body.receipts.map(r => r.result), ['pass'], "round 1's receipt is already durably persisted as pass before the round-2 reverify aborts");
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test('two sequential calls with the SAME reviewId -- the first failing at ROUND 2, the second succeeding -- persist TWO distinct receipts in EACH round slot; neither attempt\'s receipt is ever overwritten', async () => {
	const repo = initRepo();
	wireRepo(repo);
	const reviewId = `r-${randomUUID()}`;
	try {
		const identity = await realContentIdentity(repo);
		_setRunSecurityCodePassForTests(async (_r, _t, _m, round) => { if (round === 2) throw new Error('first attempt fails at round 2'); return []; });
		await assert.rejects(runSecurityReview(repo, targets, { reviewId, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z', epicHash: '3333333333333333', storyId: 's3' }));

		_setRunSecurityCodePassForTests(async () => []);
		const report = await runSecurityReview(repo, targets, { reviewId, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:01:00.000Z', epicHash: '3333333333333333', storyId: 's3' });

		const record = readReceiptRecord(repo, '3333333333333333', 's3');
		assert.ok(record);
		const round1Receipts = record.body.receipts.filter(r => r.id.includes('-round-1'));
		const round2Receipts = record.body.receipts.filter(r => r.id.includes('-round-2'));
		assert.equal(round1Receipts.length, 2, 'two distinct round-1 receipts, one per attempt (both pass: round 1 always succeeds here)');
		assert.deepEqual(round1Receipts.map(r => r.result).sort(), ['pass', 'pass']);
		assert.equal(round2Receipts.length, 2, 'two distinct round-2 receipts, one per attempt');
		assert.equal(round2Receipts.filter(r => r.result === 'fail').length, 1, 'the first attempt\'s round-2 fail receipt');
		assert.equal(round2Receipts.filter(r => r.result === 'pass').length, 1, 'the second attempt\'s round-2 pass receipt');
		assert.notEqual(report.receipts.round2.id, round2Receipts.find(r => r.result === 'fail')!.id, 'the second attempt mints its own distinct round-2 receipt id, never overwriting the first attempt\'s fail receipt');
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test('reverifies contentIdentity immediately before final persistence too: a repository edit injected after round 2 completes is caught and aborts with ContentIdentityMismatchError, with BOTH round receipts already durably persisted as pass', async () => {
	const repo = initRepo();
	wireRepo(repo);
	const identity = await realContentIdentity(repo);
	let round = 0;
	_setRunSecurityCodePassForTests(async () => {
		round++;
		if (round === 2) {
			// mutate the repo after round 2 completes, before the pre-finalization reverify
			writeFileSync(join(repo, 'app.ts'), 'export const x = 3;\n');
			execFileSync('git', ['add', '.'], { cwd: repo });
			execFileSync('git', ['commit', '-q', '-m', 'mutate-after-round-2'], { cwd: repo });
		}
		return [];
	});
	try {
		await assert.rejects(
			runSecurityReview(repo, targets, { reviewId: `r-${randomUUID()}`, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z', epicHash: '7777777777777777', storyId: 's3' }),
			ContentIdentityMismatchError,
		);
		const record = readReceiptRecord(repo, '7777777777777777', 's3');
		assert.ok(record);
		assert.deepEqual(record.body.receipts.map(r => r.result), ['pass', 'pass'], 'both round receipts are already durably persisted as pass before the pre-finalization reverify aborts');
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test('on success, both round receipts exist and finalizeAndCleanup has run (the review temp dir is gone); on a pre-flight refusal, neither a receipt nor a checkpoint exists', async () => {
	const repo = initRepo();
	wireRepo(repo);
	try {
		const identity = await realContentIdentity(repo);
		_setRunSecurityCodePassForTests(async () => []);
		const reviewId = `r-${randomUUID()}`;
		await runSecurityReview(repo, targets, { reviewId, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z', epicHash: '4444444444444444', storyId: 's3' });
		assert.equal(existsSync(join(repo, '.insrc', 'tmp', reviewId)), false, 'finalizeAndCleanup removed the review temp dir');
		const record = readReceiptRecord(repo, '4444444444444444', 's3');
		assert.ok(record);
		assert.equal(record.body.receipts.length, 2);

		const refusedReviewId = `r-${randomUUID()}`;
		await assert.rejects(runSecurityReview(repo, targets, { reviewId: refusedReviewId, modelSelection, advisoryEvidence: evidenceFor('stale'), now: '2026-11-25T00:00:00.000Z', epicHash: '5555555555555555', storyId: 's3' }));
		assert.equal(existsSync(join(repo, '.insrc', 'tmp', refusedReviewId)), false, 'no checkpoint was ever written for the refused run');
		assert.equal(readReceiptRecord(repo, '5555555555555555', 's3'), null);
	} finally { unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test('run with repoPath=B while the test harness\'s own ambient cwd is A: checkpoint/reconciliation/report-render/cleanup resolve the repo through runSecurityReview\'s OWN step-context binding, never through a test-hardcoded override, and never resolve to A', async () => {
	const repoA = initRepo();
	const repoB = initRepo();
	try {
		// computeContentIdentity takes repoPath explicitly as an argument (not
		// via step context), so this seam only needs to accept B.
		_setContentIdentityDepsForTests(async candidate => candidate === repoB);
		// Deliberately NOT overriding checkpoint/review-report/reconciliation's
		// own resolveRepoRoot: their REAL default resolves through
		// resolveRepoPath() -> resolveRepoFrom(explicit=undefined, {cwd, envRepo,
		// resolveForCwd}), reading stepCwd()/stepEnvRepo() from whatever step
		// context is active at the time of the call. Forcing resolveForCwd to
		// find no match (as it genuinely would with no daemon/registry in this
		// test) makes the chain fall through to `envRepo` -- which
		// runSecurityReview's own runInStepContext({cwd:repoPath, envRepo:repoPath})
		// binding sets to repoPath (B), never to the ambient outer cwd (A). If
		// runSecurityReview bound the wrong path, this would genuinely resolve
		// to A (or throw with no match at all), not silently pass.
		_setResolveForCwdForTests(async () => null);
		_setRunSecurityCodePassForTests(async () => []);
		const identity = await realContentIdentity(repoB);
		const report = await runInStepContext({ cwd: repoA }, () =>
			runSecurityReview(repoB, targets, { reviewId: `r-${randomUUID()}`, modelSelection, advisoryEvidence: evidenceFor(identity), now: '2026-11-25T00:00:00.000Z', epicHash: '6666666666666666', storyId: 's3' }),
		);
		assert.ok(report);
		const record = readReceiptRecord(repoB, '6666666666666666', 's3');
		assert.ok(record);
		assert.equal(record.body.receipts.length, 2, 'both round receipts were written under B, resolved via the real default resolveRepoRoot chain');
		assert.equal(existsSync(join(repoA, '.insrc')), false, 'nothing was ever written under the ambient cwd A');
		assert.equal(readReceiptRecord(repoA, '6666666666666666', 's3'), null, 'no receipt record exists under A either');
	} finally { _setResolveForCwdForTests(); unwire(); rmSync(repoA, { recursive: true, force: true }); rmSync(repoB, { recursive: true, force: true }); }
});
