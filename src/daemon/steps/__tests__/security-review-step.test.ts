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

import { handleSecurityReviewStepCall } from '../security-review-step.js';
import { stepToolTable, STEP_TOOL_NAMES } from '../host.js';
import { _setSecurityReviewStepDepsForTests } from '../../../workflow/security-review/handle-security-review-step.js';
import { SecurityModelUnavailableError } from '../../../workflow/security-review/run-security-review.js';

test('insrc_security_review_step is registered in the step host table under exactly its own name', () => {
	assert.ok(STEP_TOOL_NAMES.includes('insrc_security_review_step'));
	const table = stepToolTable();
	assert.ok(Object.hasOwn(table, 'insrc_security_review_step'));
});

test('handleSecurityReviewStepCall: a valid fresh request wraps handleSecurityReviewStep\'s reply as {content:[{type:"text",text}]}, routed through handleSecurityReviewStep and nowhere else', async () => {
	_setSecurityReviewStepDepsForTests({
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statMtimeMs: async () => 1_000_000,
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

test('handleSecurityReviewStepCall: malformed input (missing phase, or neither a fresh nor a resumed shape) is refused with an error envelope, never a throw', async () => {
	for (const bad of [undefined, {}, { phase: 'start' }, { phase: 'resume', repoPath: '/repo', targets: {} }, { phase: 'start', state: 'abc' /* missing proceed */ }]) {
		const envelope = await handleSecurityReviewStepCall(bad);
		assert.equal(envelope.isError, true, JSON.stringify(bad));
		const parsed = JSON.parse(envelope.content[0]!.text) as { next: string };
		assert.equal(parsed.next, 'error');
	}
});

test('handleSecurityReviewStepCall: a thrown error from handleSecurityReviewStep (e.g. SecurityModelUnavailableError) is reported as an error envelope, not an uncaught rejection', async () => {
	_setSecurityReviewStepDepsForTests({
		resolveRepoLastIndexedAt: async () => 2_000_000,
		statMtimeMs: async () => 1_000_000,
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
