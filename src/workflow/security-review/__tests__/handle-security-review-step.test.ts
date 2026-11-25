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

import {
	handleSecurityReviewStep, _setSecurityReviewStepDepsForTests,
} from '../handle-security-review-step.js';
import { ContentIdentityMismatchError, SecurityModelUnavailableError } from '../run-security-review.js';
import type { SecurityReviewReport } from '../run-security-review.js';
import type { SecurityModelSelection } from '../../../config/analyze.js';
import type { SecurityAdvisoryEvidence } from '../collect-dependency-advisories.js';

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
