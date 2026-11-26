/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s3/t6: insrc_security_review_step's
 * daemon-side envelope wrapper + wiring.
 * Run: npx tsx --test src/daemon/steps/__tests__/security-review-step.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { handleSecurityReviewStepCall } from '../security-review-step.js';
import { stepToolTable, STEP_TOOL_NAMES, createStepCallHandler } from '../host.js';
import type { StepEnvelope } from '../host.js';
import { _setSecurityReviewStepDepsForTests } from '../../../workflow/security-review/handle-security-review-step.js';
import { SecurityModelUnavailableError } from '../../../workflow/security-review/run-security-review.js';
import { registerGitTools } from '../../tools/builtins/git/index.js';
import { _setContentIdentityDepsForTests, computeContentIdentity } from '../../../workflow/security-review/content-identity.js';
import { _setCheckpointDepsForTests } from '../../../workflow/review-round/checkpoint.js';
import { _setReviewReportDepsForTests } from '../../../workflow/review-round/review-report.js';
import { _setReconciliationDepsForTests } from '../../../workflow/review-round/reconciliation.js';
import { _setRunSecurityCodePassForTests } from '../../../workflow/security-review/security-round-hooks.js';

registerGitTools();

test('insrc_security_review_step is registered in the step host table under exactly its own name', () => {
	assert.ok(STEP_TOOL_NAMES.includes('insrc_security_review_step'));
	const table = stepToolTable();
	assert.ok(Object.hasOwn(table, 'insrc_security_review_step'));
});

const REGISTERED = { isRepoRegistered: async () => true, canonicallyContained: async () => undefined };
const ok = (mtimeMs: number) => ({ kind: 'ok' as const, mtimeMs });

test('handleSecurityReviewStepCall: a valid fresh request wraps handleSecurityReviewStep\'s reply as {content:[{type:"text",text}]}, routed through handleSecurityReviewStep and nowhere else', async () => {
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000),
		resolveSecurityModel: async () => ({ status: 'configured', provider: 'cli-claude', modelId: 'claude-opus' }),
		collectDependencyAdvisories: async () => ({ contentIdentity: 'id', contentStable: true, readOnly: true, queriedCoordinates: [], matches: [], perManagerMode: [], unresolvedDependencies: [], unavailableSources: [] }),
		runSecurityReview: async () => ({
			findings: [], unresolvedDependencies: [], unavailableSources: [], reconciliation: [],
			receipts: { round1: { id: 'r1', result: 'pass', ranAt: '2026-11-25T00:00:00.000Z' }, round2: { id: 'r2', result: 'pass', ranAt: '2026-11-25T00:00:00.000Z' } },
			effectiveModel: { provider: 'cli-claude', modelId: 'claude-opus' },
			baseReportMarkdown: '# base', supplementalMarkdown: '## supplemental',
		}),
	});
	try {
		const envelope = await handleSecurityReviewStepCall({ phase: 'start', repoPath: '/repo', targets: { entries: [{ path: 'app.ts' }] } });
		assert.equal(envelope.isError, undefined);
		assert.equal(envelope.content.length, 1);
		assert.equal(envelope.content[0]!.type, 'text');
		const parsed = JSON.parse(envelope.content[0]!.text) as { next: string; report: unknown; markdown: string };
		assert.equal(parsed.next, 'done');
		assert.ok(parsed.report);
		assert.match(parsed.markdown, /# base/);
	} finally { _setSecurityReviewStepDepsForTests(); }
});

test('handleSecurityReviewStepCall: malformed input (missing phase, neither a fresh nor a resumed shape, a MIXED fresh+resumed shape, or a lone epicHash/storyId without its pair) is refused with an error envelope, never a throw', async () => {
	for (const bad of [
		undefined, {}, { phase: 'start' }, { phase: 'resume', repoPath: '/repo', targets: {} },
		{ phase: 'start', state: 'abc' } /* missing proceed */,
		{ phase: 'start', state: 'abc', proceed: true, repoPath: '/repo' } /* mixed: state + a fresh field */,
		{ phase: 'start', state: 'abc', proceed: true, targets: {} } /* mixed: state + targets */,
		{ phase: 'start', repoPath: '/repo', targets: {}, proceed: false } /* resumed-only field on a fresh request */,
		{ phase: 'start', repoPath: '/repo', targets: {}, epicHash: 'abc' } /* epicHash without storyId */,
		{ phase: 'start', repoPath: '/repo', targets: {}, storyId: 's1' } /* storyId without epicHash */,
	]) {
		const envelope = await handleSecurityReviewStepCall(bad);
		assert.equal(envelope.isError, true, JSON.stringify(bad));
		const parsed = JSON.parse(envelope.content[0]!.text) as { next: string };
		assert.equal(parsed.next, 'error');
	}
});

test('handleSecurityReviewStepCall: a thrown error from handleSecurityReviewStep (e.g. SecurityModelUnavailableError) is reported as an error envelope, not an uncaught rejection', async () => {
	_setSecurityReviewStepDepsForTests({
		...REGISTERED,
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000),
		resolveSecurityModel: async () => ({ status: 'configured', provider: 'cli-claude', modelId: 'claude-opus' }),
		collectDependencyAdvisories: async () => ({ contentIdentity: 'id', contentStable: true, readOnly: true, queriedCoordinates: [], matches: [], perManagerMode: [], unresolvedDependencies: [], unavailableSources: [] }),
		runSecurityReview: async () => { throw new SecurityModelUnavailableError('no backend'); },
	});
	try {
		const envelope = await handleSecurityReviewStepCall({ phase: 'start', repoPath: '/repo', targets: { entries: [{ path: 'app.ts' }] } });
		assert.equal(envelope.isError, true);
		const parsed = JSON.parse(envelope.content[0]!.text) as { next: string; error: { message: string } };
		assert.equal(parsed.next, 'error');
		assert.match(parsed.error.message, /no backend/);
	} finally { _setSecurityReviewStepDepsForTests(); }
});

test('handleSecurityReviewStepCall forwards a given AbortSignal into handleSecurityReviewStep: an already-aborted signal refuses with SecurityReviewCancelledError before the admission check ever runs', async () => {
	let registeredCalls = 0;
	_setSecurityReviewStepDepsForTests({
		isRepoRegistered: async () => { registeredCalls++; return true; },
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statTarget: async () => ok(1_000_000),
		resolveSecurityModel: async () => ({ status: 'configured', provider: 'cli-claude', modelId: 'claude-opus' }),
		collectDependencyAdvisories: async () => ({ contentIdentity: 'id', contentStable: true, readOnly: true, queriedCoordinates: [], matches: [], perManagerMode: [], unresolvedDependencies: [], unavailableSources: [] }),
	});
	try {
		const controller = new AbortController();
		controller.abort();
		const envelope = await handleSecurityReviewStepCall({ phase: 'start', repoPath: '/repo', targets: { entries: [{ path: 'app.ts' }] } }, controller.signal);
		assert.equal(envelope.isError, true);
		const parsed = JSON.parse(envelope.content[0]!.text) as { next: string; error: { message: string } };
		assert.match(parsed.error.message, /cancelled/);
		assert.equal(registeredCalls, 0);
	} finally { _setSecurityReviewStepDepsForTests(); }
});

// --- smoke: the REGISTERED tool, through real step.call dispatch, with a
// REAL runSecurityReview over a real repo (fresh index, real report) --------

function initRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-security-review-step-smoke-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
	execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
	writeFileSync(join(repo, 'app.ts'), 'export const x = 1;\n');
	execFileSync('git', ['add', '.'], { cwd: repo });
	execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
	return repo;
}

test("smoke: calling the REGISTERED insrc_security_review_step tool through the real step.call dispatch (createStepCallHandler + stepToolTable), with a fresh index, reaches {next:'done'} with a REAL report and markdown -- proving the registration -> handler wiring is live, not just type-checked", async () => {
	const repo = initRepo();
	_setContentIdentityDepsForTests(async candidate => candidate === repo);
	_setCheckpointDepsForTests({ resolveRepoRoot: async () => repo });
	_setReviewReportDepsForTests({ resolveRepoRoot: async () => repo });
	_setReconciliationDepsForTests({ resolveRepoRoot: async () => repo, classify: async (_id, prior) => prior.map(() => 'still-open') });
	_setRunSecurityCodePassForTests(async () => []);
	try {
		const identity = await computeContentIdentity(repo, { entries: [{ path: 'app.ts' }] });
		_setSecurityReviewStepDepsForTests({
			resolveRepoLastIndexedAt: async () => 2_000_000, // fresh: newer than app.ts's mtime
			statTarget: async () => ok(1_000_000),
			resolveSecurityModel: async () => ({ status: 'configured', provider: 'cli-claude', modelId: 'claude-opus' }),
			collectDependencyAdvisories: async () => ({ contentIdentity: identity, contentStable: true, readOnly: true, queriedCoordinates: [], matches: [], perManagerMode: [], unresolvedDependencies: [], unavailableSources: [] }),
			// runSecurityReview itself is left REAL (not faked) -- only its own
			// CLI code-pass dispatch is, via _setRunSecurityCodePassForTests above.
		});

		const host = createStepCallHandler(stepToolTable());
		const frames: { stream: string; data: unknown }[] = [];
		await host(
			{ tool: 'insrc_security_review_step', args: { phase: 'start', repoPath: repo, targets: { entries: [{ path: 'app.ts' }] } }, context: { cwd: repo } },
			frame => frames.push(frame),
			new AbortController().signal,
		);
		assert.equal(frames.length, 1);
		assert.equal(frames[0]!.stream, 'done', JSON.stringify(frames[0]!.data));
		const envelope = frames[0]!.data as StepEnvelope;
		const parsed = JSON.parse(envelope.content[0]!.text) as { next: string; report: { receipts: { round1: { result: string }; round2: { result: string } } }; markdown: string };
		assert.equal(parsed.next, 'done');
		assert.equal(parsed.report.receipts.round1.result, 'pass');
		assert.equal(parsed.report.receipts.round2.result, 'pass');
		assert.ok(parsed.markdown.length > 0, 'a real, non-empty markdown rendering');
	} finally {
		_setSecurityReviewStepDepsForTests();
		_setContentIdentityDepsForTests();
		_setCheckpointDepsForTests();
		_setReviewReportDepsForTests();
		_setReconciliationDepsForTests();
		_setRunSecurityCodePassForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});
