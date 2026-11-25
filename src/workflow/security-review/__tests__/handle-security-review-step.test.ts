/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s3/t5: handleSecurityReviewStep.
 * Run: npx tsx --test src/workflow/security-review/__tests__/handle-security-review-step.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
	handleSecurityReviewStep, _setSecurityReviewStepDepsForTests,
} from '../handle-security-review-step.js';
import { ContentIdentityMismatchError, SecurityModelUnavailableError, deriveReceiptIdentity } from '../run-security-review.js';
import type { SecurityReviewReport } from '../run-security-review.js';
import type { SecurityModelSelection } from '../../../config/analyze.js';
import type { SecurityAdvisoryEvidence } from '../collect-dependency-advisories.js';
import { registerGitTools } from '../../../daemon/tools/builtins/git/index.js';
import { readReceiptRecord } from '../../review-round/receipt-record.js';
import { _setCheckpointDepsForTests } from '../../review-round/checkpoint.js';
import { _setReviewReportDepsForTests } from '../../review-round/review-report.js';
import { _setReconciliationDepsForTests } from '../../review-round/reconciliation.js';
import { _setContentIdentityDepsForTests, computeContentIdentity } from '../content-identity.js';
import { _setRunSecurityCodePassForTests } from '../security-round-hooks.js';

registerGitTools();

const targets = { entries: [{ path: 'app.ts' }] };
const modelSelection: SecurityModelSelection = { status: 'configured', provider: 'cli-claude', modelId: 'claude-opus' };

function evidence(): SecurityAdvisoryEvidence {
	return {
		contentIdentity: 'id', contentStable: true, readOnly: true,
		queriedCoordinates: [], matches: [], perManagerMode: [],
		unresolvedDependencies: [], unavailableSources: [],
	};
}

function fakeReport(): SecurityReviewReport {
	return {
		findings: [], unresolvedDependencies: [], unavailableSources: [], reconciliation: [],
		receipts: { round1: { id: 'r1', result: 'pass', ranAt: '2026-11-25T00:00:00.000Z' }, round2: { id: 'r2', result: 'pass', ranAt: '2026-11-25T00:00:00.000Z' } },
		effectiveModel: { provider: 'cli-claude', modelId: 'claude-opus' },
		baseReportMarkdown: '# base', supplementalMarkdown: '## supplemental',
	};
}

function unwire(): void { _setSecurityReviewStepDepsForTests(); }

test('a fresh request against a repo with a FRESH index reaches {next:"done"} directly, never confirm_wait', async () => {
	let resolveModelCalls = 0;
	let collectCalls = 0;
	let runReviewCalls = 0;
	_setSecurityReviewStepDepsForTests({
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statMtimeMs: async () => 1_000_000, // older than the index -- fresh
		resolveSecurityModel: async () => { resolveModelCalls++; return modelSelection; },
		collectDependencyAdvisories: async () => { collectCalls++; return evidence(); },
		runSecurityReview: async () => { runReviewCalls++; return fakeReport(); },
	});
	try {
		const response = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(response.next, 'done');
		assert.equal(resolveModelCalls, 1);
		assert.equal(collectCalls, 1);
		assert.equal(runReviewCalls, 1);
	} finally { unwire(); }
});

test('a fresh request against a repo with a STALE index returns {next:"confirm_wait", state, guidance} without running resolveSecurityModel, collectDependencyAdvisories, or any round', async () => {
	let resolveModelCalls = 0;
	let collectCalls = 0;
	let runReviewCalls = 0;
	_setSecurityReviewStepDepsForTests({
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statMtimeMs: async () => 2_000_000, // newer than the index -- stale
		resolveSecurityModel: async () => { resolveModelCalls++; return modelSelection; },
		collectDependencyAdvisories: async () => { collectCalls++; return evidence(); },
		runSecurityReview: async () => { runReviewCalls++; return fakeReport(); },
	});
	try {
		const response = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(response.next, 'confirm_wait');
		assert.equal(typeof (response as { state: string }).state, 'string');
		assert.equal(typeof (response as { guidance: string }).guidance, 'string');
		assert.equal(resolveModelCalls, 0);
		assert.equal(collectCalls, 0);
		assert.equal(runReviewCalls, 0);
	} finally { unwire(); }
});

test("a resumed call ({phase:'start', state, proceed:true}) waits for the index before running the review end-to-end to done", async () => {
	let staleReads = 0;
	const sleptMs: number[] = [];
	_setSecurityReviewStepDepsForTests({
		resolveRepoLastIndexedAt: async () => {
			staleReads++;
			return staleReads < 3 ? 1_000_000 : 2_000_000; // becomes fresh on the 3rd read
		},
		statMtimeMs: async () => 2_000_000,
		sleep: async ms => { sleptMs.push(ms); },
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: async () => fakeReport(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		const resumed = await handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: true });
		assert.equal(resumed.next, 'done');
		assert.ok(sleptMs.length >= 1, 'waited at least once before the index became fresh');
	} finally { unwire(); }
});

test("a resumed call ({phase:'start', state, proceed:false}) runs the review against the index as-is (a degraded run) and still reaches done with a fully populated report", async () => {
	let sleptCalls = 0;
	_setSecurityReviewStepDepsForTests({
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statMtimeMs: async () => 2_000_000, // stays stale throughout
		sleep: async () => { sleptCalls++; },
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: async () => fakeReport(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		const resumed = await handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: false }) as { next: string; report: SecurityReviewReport };
		assert.equal(resumed.next, 'done');
		assert.ok(resumed.report);
		assert.equal(sleptCalls, 0, 'proceed:false never waits on the index at all');
	} finally { unwire(); }
});

test("epicHash/storyId supplied on the ORIGINAL request are passed straight through into runSecurityReview's opts unchanged, never re-derived or second-guessed here", async () => {
	let capturedOpts: { epicHash?: string; storyId?: string } | undefined;
	_setSecurityReviewStepDepsForTests({
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statMtimeMs: async () => 1_000_000,
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: async (_repo, _targets, opts) => { capturedOpts = opts; return fakeReport(); },
	});
	try {
		await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets, epicHash: 'abc123', storyId: 's3' });
		assert.equal(capturedOpts?.epicHash, 'abc123');
		assert.equal(capturedOpts?.storyId, 's3');
	} finally { unwire(); }

	// Also proven across the confirm_wait -> resumed boundary: the state token
	// is the ONLY thing carrying epicHash/storyId forward, never re-derived.
	let resumedOpts: { epicHash?: string; storyId?: string } | undefined;
	_setSecurityReviewStepDepsForTests({
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statMtimeMs: async () => 2_000_000,
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: async (_repo, _targets, opts) => { resumedOpts = opts; return fakeReport(); },
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets, epicHash: 'def456', storyId: 's7' });
		await handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: false });
		assert.equal(resumedOpts?.epicHash, 'def456');
		assert.equal(resumedOpts?.storyId, 's7');
	} finally { unwire(); }
});

test('ContentIdentityMismatchError and SecurityModelUnavailableError from runSecurityReview propagate out of handleSecurityReviewStep unchanged', async () => {
	_setSecurityReviewStepDepsForTests({
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statMtimeMs: async () => 1_000_000,
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: async () => { throw new ContentIdentityMismatchError('a', 'b', true); },
	});
	try {
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets }),
			ContentIdentityMismatchError,
		);
	} finally { unwire(); }

	_setSecurityReviewStepDepsForTests({
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statMtimeMs: async () => 1_000_000,
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: async () => { throw new SecurityModelUnavailableError('no backend'); },
	});
	try {
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets }),
			SecurityModelUnavailableError,
		);
	} finally { unwire(); }
});

// --- integration: a REAL runSecurityReview call, proving receipt persistence
// (not a mocked runSecurityReview, unlike every test above) --------------

function initRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-handle-security-review-step-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
	execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
	writeFileSync(join(repo, 'app.ts'), 'export const x = 1;\n');
	execFileSync('git', ['add', '.'], { cwd: repo });
	execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
	return repo;
}

function wireRealRunSecurityReview(repo: string): void {
	_setContentIdentityDepsForTests(async candidate => candidate === repo);
	_setCheckpointDepsForTests({ resolveRepoRoot: async () => repo });
	_setReviewReportDepsForTests({ resolveRepoRoot: async () => repo });
	_setReconciliationDepsForTests({ resolveRepoRoot: async () => repo, classify: async (_id, prior) => prior.map(() => 'still-open') });
	_setRunSecurityCodePassForTests(async () => []);
}

function unwireReal(): void {
	_setContentIdentityDepsForTests();
	_setCheckpointDepsForTests();
	_setReviewReportDepsForTests();
	_setReconciliationDepsForTests();
	_setRunSecurityCodePassForTests();
}

test('integration: handleSecurityReviewStep: a fresh-index request calls the REAL runSecurityReview; epicHash/storyId supplied on the request land unchanged in the persisted receipt, while an omitted pair is derived via deriveReceiptIdentity with standalone:true', async () => {
	const repo = initRepo();
	wireRealRunSecurityReview(repo);
	try {
		const identity = await computeContentIdentity(repo, targets);
		// handleSecurityReviewStep resolves the model/advisories itself (per its
		// own contract) -- only those two, plus the index-freshness check, are
		// faked here; runSecurityReview itself is the REAL implementation.
		_setSecurityReviewStepDepsForTests({
			resolveRepoLastIndexedAt: async () => 2_000_000,
			statMtimeMs: async () => 1_000_000,
			resolveSecurityModel: async () => modelSelection,
			collectDependencyAdvisories: async () => ({ ...evidence(), contentIdentity: identity }),
		});

		const explicit = await handleSecurityReviewStep({ phase: 'start', repoPath: repo, targets, epicHash: 'fedcba9876543210', storyId: 's3' }) as { next: string; report: SecurityReviewReport };
		assert.equal(explicit.next, 'done');
		const explicitRecord = readReceiptRecord(repo, 'fedcba9876543210', 's3');
		assert.ok(explicitRecord);
		assert.equal(explicitRecord.meta.standalone, undefined, 'explicit epicHash/storyId leaves standalone unset in the persisted receipt');
		assert.equal(explicitRecord.body.receipts.length, 2);

		const derived = await handleSecurityReviewStep({ phase: 'start', repoPath: repo, targets }) as { next: string; report: SecurityReviewReport };
		assert.equal(derived.next, 'done');
		const { epicHash: derivedEpicHash, storyId: derivedStoryId } = deriveReceiptIdentity(identity);
		const derivedRecord = readReceiptRecord(repo, derivedEpicHash, derivedStoryId);
		assert.ok(derivedRecord);
		assert.equal(derivedRecord.meta.standalone, true, 'an omitted epicHash/storyId derives identity via deriveReceiptIdentity and sets standalone:true in the persisted receipt');
	} finally { unwireReal(); unwire(); rmSync(repo, { recursive: true, force: true }); }
});

test('integration: a STALE-index request pauses at confirm_wait, then a resumed proceed:false call runs the REAL runSecurityReview degraded and persists receipts; a separate resumed proceed:true call waits for freshness before running it', async () => {
	const repoFalse = initRepo();
	wireRealRunSecurityReview(repoFalse);
	try {
		const identityFalse = await computeContentIdentity(repoFalse, targets);
		_setSecurityReviewStepDepsForTests({
			resolveRepoLastIndexedAt: async () => 1_000_000,
			statMtimeMs: async () => 2_000_000, // stale throughout -- proceed:false never waits
			resolveSecurityModel: async () => modelSelection,
			collectDependencyAdvisories: async () => ({ ...evidence(), contentIdentity: identityFalse }),
		});
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: repoFalse, targets, epicHash: '1111111111111111', storyId: 's3' });
		assert.equal(first.next, 'confirm_wait');
		assert.equal(readReceiptRecord(repoFalse, '1111111111111111', 's3'), null, 'nothing persisted yet at confirm_wait');

		const resumedFalse = await handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: false }) as { next: string };
		assert.equal(resumedFalse.next, 'done');
		const falseRecord = readReceiptRecord(repoFalse, '1111111111111111', 's3');
		assert.ok(falseRecord, 'the degraded proceed:false run genuinely persisted both round receipts via the real runSecurityReview');
		assert.equal(falseRecord.body.receipts.length, 2);
	} finally { unwireReal(); unwire(); rmSync(repoFalse, { recursive: true, force: true }); }

	const repoTrue = initRepo();
	wireRealRunSecurityReview(repoTrue);
	try {
		const identityTrue = await computeContentIdentity(repoTrue, targets);
		let staleReads = 0;
		const sleptMs: number[] = [];
		_setSecurityReviewStepDepsForTests({
			resolveRepoLastIndexedAt: async () => { staleReads++; return staleReads < 3 ? 1_000_000 : 2_000_000; },
			statMtimeMs: async () => 2_000_000,
			sleep: async ms => { sleptMs.push(ms); },
			resolveSecurityModel: async () => modelSelection,
			collectDependencyAdvisories: async () => ({ ...evidence(), contentIdentity: identityTrue }),
		});
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: repoTrue, targets, epicHash: '2222222222222222', storyId: 's3' });
		assert.equal(first.next, 'confirm_wait');

		const resumedTrue = await handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: true }) as { next: string };
		assert.equal(resumedTrue.next, 'done');
		assert.ok(sleptMs.length >= 1, 'proceed:true genuinely waited at least once before the index became fresh');
		const trueRecord = readReceiptRecord(repoTrue, '2222222222222222', 's3');
		assert.ok(trueRecord, 'the proceed:true run, once fresh, genuinely persisted both round receipts via the real runSecurityReview');
		assert.equal(trueRecord.body.receipts.length, 2);
	} finally { unwireReal(); unwire(); rmSync(repoTrue, { recursive: true, force: true }); }
});
