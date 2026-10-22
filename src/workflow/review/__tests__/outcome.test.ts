/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A template review says, per premise, whether the design is WRONG or whether
 * the reviewer could not verify it — and only the first blocks approval.
 * (LLD-f2f08ccf89f8ab25-S001, tests T4-T8 and T17.)
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ReviewBlockedError } from '../../gates.js';
import { approvalOverrideReasonOf, approvalStateOf } from '../../artifact-core/approval-view.js';
import { approveJson } from '../../__tests__/helpers/approve.js';
import { writeReviewedHead } from '../../__tests__/lifecycle-fixtures.js';
import {
	computeReviewVerdict, pendingUserFindings, renderReviewReport, severityForOutcome, tallyFindings,
} from '../index.js';
import { effectiveReviewVerdict } from '../resolve.js';
import type { Finding, FindingOutcome, ReviewReport, Severity } from '../types.js';

function finding(id: string, outcome: FindingOutcome | undefined, judged?: Severity): Finding {
	return {
		claimId: id, kind: 'semantic', premise: `premise ${id}`, evidence: `evidence ${id}`, action: `action ${id}`,
		fixability: 'manual',
		severity: outcome !== undefined ? severityForOutcome(outcome, judged) : (judged ?? 'LOW'),
		...(outcome !== undefined ? { outcome, item: `item-${id}` } : {}),
	};
}

function report(findings: readonly Finding[]): ReviewReport {
	return {
		artifact: 'LLD', stage: 'design.story', verdict: computeReviewVerdict(findings), findings,
		counts: tallyFindings(findings), reviewedAt: '2026-10-05T00:00:00.000Z', model: 'm', template: 'design-spec',
	};
}

const HASH = 'abcd1234ef567890';

/** Write a design head whose lifecycle review names `review` and try to approve it. */
async function approve(review: ReviewReport, opts?: { overrideReview?: string }): Promise<{ approved: boolean; meta: Record<string, unknown> }> {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-outcome-'));
	try {
		const p = writeReviewedHead(dir, `LLD-${HASH}-s1`, { meta: { workflow: 'design.story', epicHash: HASH, storyId: 's1' }, report: review });
		let approved = true;
		try { await approveJson(p, opts?.overrideReview); } catch (e) {
			if (!(e instanceof ReviewBlockedError)) throw e;
			approved = false;
		}
		return { approved, meta: JSON.parse(readFileSync(p, 'utf8')).meta as Record<string, unknown> };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test('T4 severity follows outcome', () => {
	assert.equal(severityForOutcome('does-not-hold', 'HIGH'), 'HIGH');
	assert.equal(severityForOutcome('does-not-hold', 'MED'), 'MED');
	// A premise that does not hold always blocks, whatever the reviewer rated it.
	assert.equal(severityForOutcome('does-not-hold', 'LOW'), 'MED');
	assert.equal(severityForOutcome('does-not-hold'), 'MED');
	for (const judged of ['HIGH', 'MED', 'LOW', undefined] as const) {
		assert.equal(severityForOutcome('holds', judged), 'LOW');
		assert.equal(severityForOutcome('could-not-verify', judged), 'LOW');
	}
});

test('T5 the verdict blocks only on a premise that does not hold', () => {
	assert.equal(computeReviewVerdict([finding('a', 'holds'), finding('b', 'does-not-hold')]), 'block');
	assert.equal(computeReviewVerdict([finding('a', 'holds'), finding('b', 'could-not-verify')]), 'warn');
	assert.equal(computeReviewVerdict([finding('a', 'holds'), finding('b', 'holds')]), 'pass');
	assert.equal(computeReviewVerdict([finding('a', 'could-not-verify'), finding('b', 'does-not-hold', 'HIGH')]), 'block');
});

test('T5 findings with no outcome give the verdict they gave before', () => {
	assert.equal(computeReviewVerdict([finding('a', undefined, 'LOW')]), 'pass');
	assert.equal(computeReviewVerdict([finding('a', undefined, 'MED')]), 'block');
	assert.equal(computeReviewVerdict([finding('a', undefined, 'HIGH')]), 'block');
	assert.equal(computeReviewVerdict([finding('a', undefined, 'MED')], ['HIGH']), 'warn');
	assert.equal(computeReviewVerdict([]), 'pass');
});

test('the unverified count appears only on a template review', () => {
	assert.deepEqual(tallyFindings([finding('a', undefined, 'MED'), finding('b', undefined, 'LOW')]), { high: 0, med: 1, low: 1 });
	assert.deepEqual(
		tallyFindings([finding('a', 'does-not-hold', 'HIGH'), finding('b', 'could-not-verify'), finding('c', 'could-not-verify'), finding('d', 'holds')]),
		{ high: 1, med: 0, low: 3, unverified: 2 },
	);
	assert.deepEqual(tallyFindings([finding('a', 'holds')]), { high: 0, med: 0, low: 1, unverified: 0 });
});

test('T6 the rendered review lists the two problem kinds separately and says which one blocks', () => {
	const md = renderReviewReport(report([
		finding('wrong', 'does-not-hold', 'HIGH'), finding('unsure', 'could-not-verify'), finding('fine', 'holds'),
	]));
	const wrongAt  = md.indexOf('#### Does not hold (blocks approval)');
	const unsureAt = md.indexOf('#### Could not verify (does not block)');
	assert.ok(wrongAt !== -1 && unsureAt > wrongAt, 'two labelled lists, the blocking one first');
	const wrongList  = md.slice(wrongAt, unsureAt);
	const unsureList = md.slice(unsureAt);
	assert.ok(wrongList.includes('premise wrong') && !wrongList.includes('premise unsure'));
	assert.ok(unsureList.includes('premise unsure') && !unsureList.includes('premise wrong'));
	assert.ok(!md.includes('premise fine'), 'a premise that holds is counted, not listed');
	assert.ok(md.includes('1 do not hold · 1 could not be verified · 1 hold'));
	assert.ok(md.includes('Only a premise that does not hold blocks approval.'));
	assert.ok(md.includes('template `design-spec`'));
});

test('T6 an empty list says so rather than disappearing', () => {
	const md = renderReviewReport(report([finding('unsure', 'could-not-verify')]));
	const wrongList = md.slice(md.indexOf('#### Does not hold'), md.indexOf('#### Could not verify'));
	assert.ok(wrongList.includes('_None._'));
});

test('T7 a design with only unverified premises is approvable', async () => {
	const r = report([finding('a', 'could-not-verify'), finding('b', 'holds')]);
	assert.equal(r.verdict, 'warn');
	assert.equal(effectiveReviewVerdict(r, undefined), 'pass');
	const res = await approve(r);
	assert.equal(res.approved, true);
	assert.equal(approvalStateOf(res.meta), 'approved');
	assert.equal(approvalOverrideReasonOf(res.meta), undefined, 'no override was needed');
});

test('T7 a premise that does not hold refuses approval until resolved or overridden', async () => {
	const r = report([finding('a', 'does-not-hold'), finding('b', 'could-not-verify')]);
	assert.equal(effectiveReviewVerdict(r, undefined), 'block');
	const refused = await approve(r);
	assert.equal(refused.approved, false);
	assert.equal(approvalStateOf(refused.meta), 'pending');

	const overridden = await approve(r, { overrideReview: 'accepted: the anchor is cosmetic' });
	assert.equal(overridden.approved, true);
	assert.equal(approvalOverrideReasonOf(overridden.meta), 'accepted: the anchor is cosmetic');

	// A resolution on the one blocking finding clears the block; the unverified one needs none.
	assert.equal(effectiveReviewVerdict(r, { a: { action: 'accept', at: '2026-10-05T00:00:00.000Z' } as never }), 'pass');
});

test('T8 a review record written before this change keeps its verdict, rendering and gate result', async () => {
	const old: ReviewReport = {
		artifact: 'LLD', stage: 'design.story', verdict: 'block', reviewedAt: '2026-09-01T00:00:00.000Z', model: 'client',
		findings: [finding('a', undefined, 'MED'), finding('b', undefined, 'LOW')],
		counts: { high: 0, med: 1, low: 1 },
	};
	assert.equal(computeReviewVerdict(old.findings), 'block');
	assert.deepEqual(tallyFindings(old.findings), old.counts);
	assert.equal(effectiveReviewVerdict(old, undefined), 'block');
	assert.equal((await approve(old)).approved, false);
	const md = renderReviewReport(old);
	assert.ok(md.includes('**0 HIGH · 1 MED · 1 LOW**'));
	assert.ok(md.includes('| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |'));
	assert.ok(!md.includes('Does not hold'), 'the two-list layout is for template reviews only');
});

test('T17 a premise that holds is not among the findings that need a human', () => {
	const r = report([finding('wrong', 'does-not-hold'), finding('unsure', 'could-not-verify'), finding('fine', 'holds')]);
	assert.deepEqual(pendingUserFindings(r).map(f => f.claimId).sort(), ['unsure', 'wrong']);
	// A pipeline review is untouched: its LOW findings are still listed, as before.
	const old = report([finding('a', undefined, 'LOW'), finding('b', undefined, 'MED')]);
	assert.equal(pendingUserFindings(old).length, 2);
});
