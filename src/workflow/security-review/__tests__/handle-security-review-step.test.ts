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
	SecurityReviewRepoNotRegisteredError, SecurityReviewCancelledError, SecurityReviewTargetUnreachableError, SecurityReviewTargetOutOfScopeError,
} from '../handle-security-review-step.js';
import type { SecurityReviewStepResponse } from '../handle-security-review-step.js';
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

function fakeReport(degraded = false): SecurityReviewReport {
	return {
		findings: [], unresolvedDependencies: [], unavailableSources: [], reconciliation: [],
		receipts: { round1: { id: 'r1', result: 'pass', ranAt: '2026-11-25T00:00:00.000Z' }, round2: { id: 'r2', result: 'pass', ranAt: '2026-11-25T00:00:00.000Z' } },
		effectiveModel: { provider: 'cli-claude', modelId: 'claude-opus' },
		baseReportMarkdown: '# base', supplementalMarkdown: '## supplemental',
		degraded,
	};
}

/** A fake runSecurityReview that threads opts.degraded through to the
 *  returned report, matching the real implementation's own contract --
 *  rather than every caller having to remember to set it explicitly. */
function fakeRunSecurityReview() {
	return async (_repoPath: string, _targets: unknown, opts: { degraded?: boolean }) => fakeReport(opts.degraded ?? false);
}

const ok = (mtimeMs: number) => ({ kind: 'ok' as const, mtimeMs });
const missing = () => ({ kind: 'missing' as const });

/** The shared fixture every test below needs: a repo treated as registered
 *  (the admission check this Story's security review flagged -- every test
 *  must now pass this explicitly, matching a real caller authorizing a real
 *  repoPath). */
const REGISTERED = { isRepoRegistered: async () => true, canonicallyContained: async () => undefined };

function unwire(): void { _setSecurityReviewStepDepsForTests(); }

test('a fresh request against a repo with a FRESH index reaches {next:"done"} directly, never confirm_wait', async () => {
	let resolveModelCalls = 0;
	let collectCalls = 0;
	let runReviewCalls = 0;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000), // older than the index -- fresh
		resolveSecurityModel: async () => { resolveModelCalls++; return modelSelection; },
		collectDependencyAdvisories: async () => { collectCalls++; return evidence(); },
		runSecurityReview: async () => { runReviewCalls++; return fakeReport(); },
	});
	try {
		const response = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(response.next, 'done');
		assert.equal((response as { degraded: boolean }).degraded, false);
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
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => ok(2_000_000), // newer than the index -- stale
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

test("a resumed call ({phase:'start', state, proceed:true}) waits for the index before running the review end-to-end to done, with degraded:false", async () => {
	let staleReads = 0;
	const sleptMs: number[] = [];
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => {
			staleReads++;
			return staleReads < 3 ? 1_000_000 : 2_000_000; // becomes fresh on the 3rd read
		},
		statTarget: async () => ok(2_000_000),
		sleep: async ms => { sleptMs.push(ms); },
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		const resumed = await handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: true });
		assert.equal(resumed.next, 'done');
		assert.equal((resumed as { degraded: boolean }).degraded, false, 'proceed:true waited until fresh, so the run is not degraded');
		assert.ok(sleptMs.length >= 1, 'waited at least once before the index became fresh');
	} finally { unwire(); }
});

test("a resumed call ({phase:'start', state, proceed:false}) runs the review against the index as-is (a degraded run) and still reaches done with a fully populated report, with degraded:true and a coverage-status note in the markdown", async () => {
	let sleptCalls = 0;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => ok(2_000_000), // stays stale throughout
		sleep: async () => { sleptCalls++; },
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		const resumed = await handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: false }) as { next: string; report: SecurityReviewReport; degraded: boolean; markdown: string };
		assert.equal(resumed.next, 'done');
		assert.ok(resumed.report);
		assert.equal(resumed.degraded, true);
		assert.match(resumed.markdown, /DEGRADED/);
		assert.equal(sleptCalls, 0, 'proceed:false never waits on the index at all');
	} finally { unwire(); }
});

test("epicHash/storyId supplied on the ORIGINAL request are passed straight through into runSecurityReview's opts unchanged, never re-derived or second-guessed here", async () => {
	let capturedOpts: { epicHash?: string; storyId?: string } | undefined;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000),
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
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => ok(2_000_000),
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
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000),
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
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000),
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

// --- repo admission (security finding: a write-capable review endpoint had
// no registered-repository check at all, on either the fresh or resumed
// path) -----------------------------------------------------------------

test('a fresh request naming an UNREGISTERED repoPath is refused with SecurityReviewRepoNotRegisteredError before any stat, model probe, advisory audit or round', async () => {
	let statCalls = 0;
	let resolveModelCalls = 0;
	_setSecurityReviewStepDepsForTests({
		isRepoRegistered: async () => false,
		resolveRepoLastIndexedAt: async () => { statCalls++; return 2_000_000; },
		statTarget: async () => { statCalls++; return ok(1_000_000); },
		resolveSecurityModel: async () => { resolveModelCalls++; return modelSelection; },
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', repoPath: '/not-registered', targets }),
			SecurityReviewRepoNotRegisteredError,
		);
		assert.equal(statCalls, 0, 'not even the freshness check ran');
		assert.equal(resolveModelCalls, 0);
	} finally { unwire(); }
});

test('a resumed call is RE-AUTHORIZED against the registry at resume time, never merely trusting that its state token\'s repoPath was authorized once at pause time', async () => {
	let registeredNow = true;
	_setSecurityReviewStepDepsForTests({
		isRepoRegistered: async () => registeredNow, canonicallyContained: async () => undefined,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => ok(2_000_000),
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		registeredNow = false; // the repo is de-registered between pause and resume
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: false }),
			SecurityReviewRepoNotRegisteredError,
		);
	} finally { unwire(); }
});

test("proceed:true's wait re-authorizes on every poll iteration too -- a repo de-registered MID-WAIT stops the wait with SecurityReviewRepoNotRegisteredError rather than spinning forever", async () => {
	let pollCount = 0;
	let registeredNow = true;
	const sleptMs: number[] = [];
	_setSecurityReviewStepDepsForTests({
		isRepoRegistered: async () => registeredNow, canonicallyContained: async () => undefined,
		resolveRepoLastIndexedAt: async () => { pollCount++; if (pollCount === 2) registeredNow = false; return 1_000_000; },
		statTarget: async () => ok(2_000_000), // stays stale -- the only exit is de-registration
		sleep: async ms => { sleptMs.push(ms); },
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: true }),
			SecurityReviewRepoNotRegisteredError,
		);
		assert.ok(sleptMs.length >= 1, 'at least one poll happened before de-registration was noticed');
	} finally { unwire(); }
});

// --- missing vs. stale; cancellation --------------------------------------

test('a PERMANENTLY MISSING target (not merely stale) refuses immediately with SecurityReviewTargetUnreachableError on a fresh request, rather than silently treating it as ordinary lag', async () => {
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => missing(),
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets }),
			SecurityReviewTargetUnreachableError,
		);
	} finally { unwire(); }
});

test("proceed:true's wait refuses with SecurityReviewTargetUnreachableError instead of looping forever when a target becomes permanently missing mid-wait", async () => {
	let pollCount = 0;
	const sleptMs: number[] = [];
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => { pollCount++; return pollCount < 2 ? ok(2_000_000) : missing(); },
		sleep: async ms => { sleptMs.push(ms); },
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: true }),
			SecurityReviewTargetUnreachableError,
		);
	} finally { unwire(); }
});

test('an already-aborted signal refuses immediately with SecurityReviewCancelledError, before any admission check, stat, model probe or round', async () => {
	let registeredCalls = 0;
	_setSecurityReviewStepDepsForTests({
		isRepoRegistered: async () => { registeredCalls++; return true; },
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000),
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets }, controller.signal),
			SecurityReviewCancelledError,
		);
		assert.equal(registeredCalls, 0, 'not even the admission check ran once already aborted');
	} finally { unwire(); }
});

test("proceed:true's wait is cancellable: aborting mid-poll stops the loop with SecurityReviewCancelledError rather than waiting for freshness", async () => {
	const controller = new AbortController();
	let pollCount = 0;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => { pollCount++; if (pollCount === 1) controller.abort(); return 1_000_000; },
		statTarget: async () => ok(2_000_000), // never becomes fresh on its own
		sleep: async () => undefined,
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: true }, controller.signal),
			SecurityReviewCancelledError,
		);
	} finally { unwire(); }
});

const permanent = (code: string) => ({ kind: 'permanent' as const, code });
const transient = (code: string) => ({ kind: 'transient' as const, code });

test("a PERSISTENT non-ENOENT stat failure (e.g. EACCES) refuses with SecurityReviewTargetUnreachableError on a fresh request, exactly like a missing target -- it is never treated as ordinary index lag", async () => {
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => permanent('EACCES'),
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets }),
			SecurityReviewTargetUnreachableError,
		);
	} finally { unwire(); }
});

test("proceed:true's wait refuses with SecurityReviewTargetUnreachableError, never looping forever, when a target stat starts failing with a PERSISTENT non-ENOENT error (e.g. ENOTDIR) mid-wait", async () => {
	let pollCount = 0;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => { pollCount++; return pollCount < 2 ? ok(2_000_000) : permanent('ENOTDIR'); },
		sleep: async () => undefined,
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: true }),
			SecurityReviewTargetUnreachableError,
		);
	} finally { unwire(); }
});

test("a TRANSIENT stat failure (e.g. EMFILE) is treated as ordinary lag -- proceed:true's wait keeps polling through it rather than refusing, and eventually succeeds once the target genuinely stats fresh", async () => {
	let pollCount = 0;
	const sleptMs: number[] = [];
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => { pollCount++; return pollCount < 3 ? transient('EMFILE') : ok(1_000_000); },
		sleep: async ms => { sleptMs.push(ms); },
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		const resumed = await handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: true });
		assert.equal(resumed.next, 'done');
		assert.ok(sleptMs.length >= 1, 'the transient failures were retried, not refused');
	} finally { unwire(); }
});

// --- state-token forgery / scope ------------------------------------------

test("the confirm_wait state is an OPAQUE, daemon-minted token -- a resumed call cannot substitute a different repoPath/targets by handing back caller-crafted JSON instead of the real token", async () => {
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => ok(2_000_000),
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const forged = Buffer.from(JSON.stringify({ repoPath: '/some/other/repo', targets: { entries: [{ path: 'secret.env' }] } }), 'utf8').toString('base64url');
		await assert.rejects(handleSecurityReviewStep({ phase: 'start', state: forged, proceed: false }));
	} finally { unwire(); }
});

test('a confirm_wait token is SINGLE-USE: a second resume with the SAME token (a sequential retry or a would-be concurrent race) is refused exactly like an unknown token, never dispatching a second independent review', async () => {
	let runReviewCalls = 0;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => ok(2_000_000),
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: async (...a: Parameters<ReturnType<typeof fakeRunSecurityReview>>) => { runReviewCalls++; return fakeRunSecurityReview()(...a); },
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		const state = (first as { state: string }).state;

		const resumed = await handleSecurityReviewStep({ phase: 'start', state, proceed: false });
		assert.equal(resumed.next, 'done');
		assert.equal(runReviewCalls, 1);

		// The SAME token again: refused, and no second review ever dispatches.
		await assert.rejects(handleSecurityReviewStep({ phase: 'start', state, proceed: false }));
		assert.equal(runReviewCalls, 1, 'the second resume attempt never reached runSecurityReview a second time');
	} finally { unwire(); }
});

test('a confirm_wait token is consumed by the FIRST resume even when it ultimately fails (e.g. de-registration mid-wait) -- a retry with the same token is refused, not silently re-granted', async () => {
	_setSecurityReviewStepDepsForTests({
		isRepoRegistered: async () => true,
		canonicallyContained: async () => undefined,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => ok(2_000_000),
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		const state = (first as { state: string }).state;

		_setSecurityReviewStepDepsForTests({
			isRepoRegistered: async () => false, // de-registered before the resume ever runs
			canonicallyContained: async () => undefined,
			resolveRepoLastIndexedAt: async () => 1_000_000,
			statTarget: async () => ok(2_000_000),
			resolveSecurityModel: async () => modelSelection,
			collectDependencyAdvisories: async () => evidence(),
			runSecurityReview: fakeRunSecurityReview(),
		});
		await assert.rejects(handleSecurityReviewStep({ phase: 'start', state, proceed: false }), SecurityReviewRepoNotRegisteredError);
		// The token is already gone (consumed by the attempt above), even though that attempt itself failed.
		await assert.rejects(handleSecurityReviewStep({ phase: 'start', state, proceed: false }));
	} finally { unwire(); }
});

// --- canonical (realpath-resolved) containment, not just lexical ---------

test("a fresh request whose target is a SYMLINK pointing outside repoPath is refused with SecurityReviewTargetOutOfScopeError, even though the lexical path itself never contains '..'", async () => {
	let statCalls = 0;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		canonicallyContained: async () => { throw new Error("targets.entries path 'link.ts' resolves outside repoPath"); },
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => { statCalls++; return ok(1_000_000); },
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets: { entries: [{ path: 'link.ts' }] } }),
			SecurityReviewTargetOutOfScopeError,
		);
		assert.equal(statCalls, 0, 'the symlink-escaping target was never stat-ed either');
	} finally { unwire(); }
});

test('a RESUMED call (both proceed:true and proceed:false) re-checks canonical containment too, before any model or advisory work -- a target that became a symlink escape between pause and resume is caught, not merely trusted from the original admission', async () => {
	let resolveModelCalls = 0;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => ok(2_000_000),
		resolveSecurityModel: async () => { resolveModelCalls++; return modelSelection; },
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	let first1: SecurityReviewStepResponse;
	try {
		first1 = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first1.next, 'confirm_wait');
	} finally { unwire(); }

	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		canonicallyContained: async () => { throw new Error("targets.entries path 'app.ts' resolves outside repoPath"); },
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => ok(2_000_000),
		resolveSecurityModel: async () => { resolveModelCalls++; return modelSelection; },
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', state: (first1 as { state: string }).state, proceed: false }),
			SecurityReviewTargetOutOfScopeError,
		);
		assert.equal(resolveModelCalls, 0, 'the symlink escape was caught before any model work, on the resumed path too');
	} finally { unwire(); }
});

test("proceed:true's wait RE-CHECKS canonical containment on EVERY poll, not just once before the wait begins -- a target that becomes a symlink escape MID-WAIT is caught on the very next poll, before model/advisory work ever runs", async () => {
	let pollCount = 0;
	let resolveModelCalls = 0;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 1_000_000,
		statTarget: async () => ok(2_000_000), // stays stale -- the only exit is the escape below
		canonicallyContained: async () => { pollCount++; if (pollCount >= 2) throw new Error("targets.entries path 'app.ts' resolves outside repoPath"); },
		sleep: async () => undefined,
		resolveSecurityModel: async () => { resolveModelCalls++; return modelSelection; },
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(first.next, 'confirm_wait');
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: true }),
			SecurityReviewTargetOutOfScopeError,
		);
		assert.ok(pollCount >= 2, 'the escape was introduced only on a LATER poll, not the first');
		assert.equal(resolveModelCalls, 0, 'caught before any model work');
	} finally { unwire(); }
});

test('the canonical containment check classifies a FAILED resolution (e.g. ENOENT, or a transient code) the SAME way a stat failure is classified -- never folded into SecurityReviewTargetOutOfScopeError, which is reserved for a resolution that SUCCEEDS outside repoPath', async () => {
	// A failed resolution with code ENOENT: refused as unreachable, not as out-of-scope.
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000),
		canonicallyContained: async () => { const e = new Error('no such file') as NodeJS.ErrnoException; e.code = 'ENOENT'; throw e; },
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets }),
			SecurityReviewTargetUnreachableError,
		);
	} finally { unwire(); }

	// A failed resolution with a TRANSIENT code: treated as ordinary lag (stale), never refused.
	let canonicalCalls = 0;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000),
		canonicallyContained: async () => {
			canonicalCalls++;
			if (canonicalCalls === 1) { const e = new Error('too many open files') as NodeJS.ErrnoException; e.code = 'EMFILE'; throw e; }
		},
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		const response = await handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets });
		assert.equal(response.next, 'confirm_wait', 'a transient containment-check hiccup is treated as stale (safe default), never thrown');
	} finally { unwire(); }
});

test('a fresh request with malformed targets (no entries, an empty entries array, or an entry with no path) is refused before any admission check, stat, model probe or round', async () => {
	let registeredCalls = 0;
	_setSecurityReviewStepDepsForTests({
		isRepoRegistered: async () => { registeredCalls++; return true; },
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000),
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		for (const bad of [{ entries: [] }, {}, { entries: [{}] }, { entries: [{ path: '' }] }]) {
			await assert.rejects(handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets: bad as never }));
		}
		assert.equal(registeredCalls, 0, 'malformed targets are refused before admission is even checked');
	} finally { unwire(); }
});

test("a fresh request whose targets.entries resolves OUTSIDE repoPath is refused with SecurityReviewTargetOutOfScopeError before this module's own freshness stat ever touches the resolved path", async () => {
	let statCalls = 0;
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => { statCalls++; return ok(1_000_000); },
		resolveSecurityModel: async () => modelSelection,
		collectDependencyAdvisories: async () => evidence(),
		runSecurityReview: fakeRunSecurityReview(),
	});
	try {
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', repoPath: '/repo', targets: { entries: [{ path: '../outside.ts' }] } }),
			SecurityReviewTargetOutOfScopeError,
		);
		assert.equal(statCalls, 0, 'the out-of-scope target was never stat-ed');
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

test('integration: handleSecurityReviewStep: a fresh-index request calls the REAL runSecurityReview; epicHash/storyId supplied on the request land unchanged in the persisted receipt, while an omitted pair is derived via deriveReceiptIdentity with standalone:true -- the repo IS genuinely registered here (via the SAME content-identity seam this test already wires), proving admission is not merely faked away', async () => {
	const repo = initRepo();
	wireRealRunSecurityReview(repo);
	try {
		const identity = await computeContentIdentity(repo, targets);
		// handleSecurityReviewStep resolves the model/advisories itself (per its
		// own contract) -- only those two, plus the index-freshness check, are
		// faked here; runSecurityReview AND the registration check are the REAL
		// implementations (registration governed by _setContentIdentityDepsForTests
		// above, since handleSecurityReviewStep's admission check reuses that
		// SAME registry lookup).
		_setSecurityReviewStepDepsForTests({
			resolveRepoLastIndexedAt: async () => 2_000_000,
			statTarget: async () => ok(1_000_000),
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

test('integration: a request naming a repoPath that is NOT the one registered (via the same real content-identity seam) is refused with SecurityReviewRepoNotRegisteredError, never silently run against an unauthorized root', async () => {
	const registeredRepo = initRepo();
	const otherRepo = initRepo();
	wireRealRunSecurityReview(registeredRepo); // only registeredRepo is treated as registered
	try {
		_setSecurityReviewStepDepsForTests({
			resolveRepoLastIndexedAt: async () => 2_000_000,
			statTarget: async () => ok(1_000_000),
			resolveSecurityModel: async () => modelSelection,
			collectDependencyAdvisories: async () => evidence(),
		});
		await assert.rejects(
			handleSecurityReviewStep({ phase: 'start', repoPath: otherRepo, targets }),
			SecurityReviewRepoNotRegisteredError,
		);
	} finally { unwireReal(); unwire(); rmSync(registeredRepo, { recursive: true, force: true }); rmSync(otherRepo, { recursive: true, force: true }); }
});

test('integration: a STALE-index request pauses at confirm_wait, then a resumed proceed:false call runs the REAL runSecurityReview degraded and persists receipts; a separate resumed proceed:true call waits for freshness before running it', async () => {
	const repoFalse = initRepo();
	wireRealRunSecurityReview(repoFalse);
	try {
		const identityFalse = await computeContentIdentity(repoFalse, targets);
		_setSecurityReviewStepDepsForTests({
			resolveRepoLastIndexedAt: async () => 1_000_000,
			statTarget: async () => ok(2_000_000), // stale throughout -- proceed:false never waits
			resolveSecurityModel: async () => modelSelection,
			collectDependencyAdvisories: async () => ({ ...evidence(), contentIdentity: identityFalse }),
		});
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: repoFalse, targets, epicHash: '1111111111111111', storyId: 's3' });
		assert.equal(first.next, 'confirm_wait');
		assert.equal(readReceiptRecord(repoFalse, '1111111111111111', 's3'), null, 'nothing persisted yet at confirm_wait');

		const resumedFalse = await handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: false }) as { next: string; degraded: boolean };
		assert.equal(resumedFalse.next, 'done');
		assert.equal(resumedFalse.degraded, true);
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
			statTarget: async () => ok(2_000_000),
			sleep: async ms => { sleptMs.push(ms); },
			resolveSecurityModel: async () => modelSelection,
			collectDependencyAdvisories: async () => ({ ...evidence(), contentIdentity: identityTrue }),
		});
		const first = await handleSecurityReviewStep({ phase: 'start', repoPath: repoTrue, targets, epicHash: '2222222222222222', storyId: 's3' });
		assert.equal(first.next, 'confirm_wait');

		const resumedTrue = await handleSecurityReviewStep({ phase: 'start', state: (first as { state: string }).state, proceed: true }) as { next: string; degraded: boolean };
		assert.equal(resumedTrue.next, 'done');
		assert.equal(resumedTrue.degraded, false);
		assert.ok(sleptMs.length >= 1, 'proceed:true genuinely waited at least once before the index became fresh');
		const trueRecord = readReceiptRecord(repoTrue, '2222222222222222', 's3');
		assert.ok(trueRecord, 'the proceed:true run, once fresh, genuinely persisted both round receipts via the real runSecurityReview');
		assert.equal(trueRecord.body.receipts.length, 2);
	} finally { unwireReal(); unwire(); rmSync(repoTrue, { recursive: true, force: true }); }
});
