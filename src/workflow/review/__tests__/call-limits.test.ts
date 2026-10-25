/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The per-call-type review limits and the call sites that read them
 * (ISSUE-562b1bb5, LLD-697b9f8ff46b9deb-S001 t6).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { qualitySpec } from '../../code-review/dimensions/quality.js';
import { uxSpec } from '../../code-review/dimensions/ux/index.js';
import type { CodeReviewSubject } from '../../code-review/types.js';
import { codeReviewSnapshot, deterministicDimensionAdapter, modelDimensionAdapter } from '../../review-pipeline/code-review.js';
import { designReviewSnapshot, premiseAdapter, templateAdapter } from '../../review-pipeline/design-review.js';
import type { ExecutionMode, ReviewCall, ReviewMaterialSnapshot } from '../../review-pipeline/types.js';
import type { LLMProvider, StructuredCompletionOpts } from '../../../shared/types.js';
import { REVIEW_CALL_LIMITS, structuredLimits, type ReviewCallLimits } from '../call-limits.js';
import { HARD_REVIEW_DEADLINE_MS, reviewDeadlineMs, reviewTemplateFor } from '../template.js';
import { extractClaims } from '../extract.js';
import type { Claim } from '../types.js';
import { VERIFY_CALL_STALL_MS, VERIFY_CALL_TIMEOUT_MS, verifyClaim } from '../verify.js';

const CLAIM: Claim = { id: 'p1', kind: 'citation', text: 'x', anchors: [], probe: {} };

test('REVIEW_CALL_LIMITS holds the five call-type rows, every silence limit is below its call\'s total limit, and VERIFY_CALL_TIMEOUT_MS and VERIFY_CALL_STALL_MS come from the design-verify row', () => {
	assert.deepEqual(REVIEW_CALL_LIMITS, {
		'design-verify':  { silenceMs: 90_000, timeoutMs: 600_000 },
		'design-extract': { timeoutMs: 600_000 },
		'design-session': { silenceMs: 300_000 },
		'code-review':    { silenceMs: 300_000, timeoutMs: 600_000 },
		'build-validate': { silenceMs: 90_000 },
	});
	for (const [kind, row] of Object.entries(REVIEW_CALL_LIMITS as Readonly<Record<string, ReviewCallLimits>>)) {
		if (row.silenceMs !== undefined && row.timeoutMs !== undefined) assert.ok(row.silenceMs < row.timeoutMs, `${kind}: silence below its cap`);
	}
	// The rows without a cap of their own sit inside their call's deadline.
	const session = REVIEW_CALL_LIMITS['design-session'].silenceMs!;
	assert.ok(session < reviewDeadlineMs('issue') && session < reviewDeadlineMs('feature') && session < HARD_REVIEW_DEADLINE_MS, 'design-session: below the review deadline');
	assert.ok(REVIEW_CALL_LIMITS['build-validate'].silenceMs! < 300_000, 'build-validate: below the 300 s judge deadline');
	assert.equal(VERIFY_CALL_TIMEOUT_MS, 600_000);
	assert.equal(VERIFY_CALL_STALL_MS, 90_000);
	assert.deepEqual(structuredLimits('design-extract'), { timeoutMs: 600_000 }, 'no silence limit is sent where the row has none');
});

const callsOf = (stages: readonly { id: string; singleCalls: (prior: never, snap: ReviewMaterialSnapshot) => readonly ReviewCall[] }[], id: string, snap: ReviewMaterialSnapshot): readonly ReviewCall[] =>
	stages.find(s => s.id === id)!.singleCalls({} as never, snap);

test('the design-review extract, verify and template-session executions send their REVIEW_CALL_LIMITS row\'s silence limit and cap', async () => {
	const snap: ReviewMaterialSnapshot = { ...designReviewSnapshot('# DEF'), claims: [CLAIM], evidence: [{ claimId: 'p1', grepResults: [], reads: [] }] };
	const premise = premiseAdapter(snap, { stage: 'define', repo: '/repo' });
	const stages = premise.stagesFor('daemon') as never;
	assert.deepEqual(callsOf(stages, 'extract', snap)[0]!.execution, { mode: 'structured', cwd: '/repo', timeoutMs: 600_000 });
	const verify = callsOf(stages, 'verify', snap);
	assert.equal(verify.length, 1);
	assert.deepEqual(verify[0]!.execution, { mode: 'structured', cwd: '/repo', timeoutMs: 600_000, stallMs: 90_000 });
	const batched = callsOf(premise.stagesFor('controller') as never, 'verify', snap);
	assert.deepEqual(batched[0]!.execution, { mode: 'structured', cwd: '/repo', timeoutMs: 600_000, stallMs: 90_000 }, "the controller path's batched verify call");
	const template = templateAdapter(designReviewSnapshot('# LLD'), {
		template: reviewTemplateFor('spec'), stage: 'design.story', repo: '/repo', limitMs: 900_000, timedOut: () => new Error('t'),
	});
	const session = callsOf(template.stagesFor('daemon') as never, 'template', designReviewSnapshot('# LLD'))[0]!.execution;
	assert.deepEqual(session, { mode: 'reviewer-session', cwd: '/repo', deadlineMs: 900_000, tools: 'read-only', stallMs: 300_000 });
	// extractClaims, the extract call outside the pipeline, reads the same row.
	let extractOpts: StructuredCompletionOpts | undefined;
	const provider = { completeStructured: async (_m: unknown, _s: unknown, o?: StructuredCompletionOpts) => { extractOpts = o; return { claims: [] }; } } as unknown as LLMProvider;
	await extractClaims('# DEF', 'define', provider);
	assert.deepEqual(extractOpts, { timeoutMs: 600_000 });
});

test('every code-review execution, the controller\'s included, sends the code-review row\'s 300 s silence limit and 600 s cap', () => {
	const subject: CodeReviewSubject = { repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', changedFiles: [], approvedLld: null, approvedPlan: null, buildRecord: null, testRecord: null };
	const symbol = { entityId: 'a', file: 'src/a.ts', kind: 'function', name: 'a', signature: 'a()', callers: [], callees: [], testsReaching: [] };
	const snapshot = codeReviewSnapshot(subject, { symbols: [symbol] } as never);
	const want: ExecutionMode = { mode: 'structured', cwd: '/repo', timeoutMs: 600_000, stallMs: 300_000 };
	const model = modelDimensionAdapter(qualitySpec(subject), subject, snapshot);
	const judge = model.stagesFor('daemon').find(s => s.id === 'judge')!;
	assert.deepEqual(judge.singleCalls({}, snapshot)[0]!.execution, want, 'the single call');
	const chunk = judge.chunkCalls({ id: 'c1', atomIds: ['a'], chars: 0, neighbours: [] }, {}, snapshot);
	assert.ok(chunk.length > 0);
	assert.ok(chunk.every(c => JSON.stringify(c.execution) === JSON.stringify(want)), 'every chunk call');
	const controller = deterministicDimensionAdapter(uxSpec(subject), subject, snapshot).stagesFor('controller')[0]!;
	assert.deepEqual(controller.singleCalls({}, snapshot)[0]!.execution, want, "the controller's call");
});

test('verifyClaim sends stallMs 90 s and timeoutMs 600 s', async () => {
	let seen: StructuredCompletionOpts | undefined;
	const provider = {
		completeStructured: async (_m: unknown, _s: unknown, opts?: StructuredCompletionOpts) => {
			seen = opts;
			return { severity: 'LOW', evidence: 'read src/a.ts:1', action: 'none', fixability: 'manual' };
		},
	} as unknown as LLMProvider;
	await verifyClaim(CLAIM, { claimId: 'p1', grepResults: [], reads: [] }, provider);
	assert.equal(seen?.stallMs, 90_000);
	assert.equal(seen?.timeoutMs, 600_000);
});
