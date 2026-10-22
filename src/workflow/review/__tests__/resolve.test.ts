/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { writeReviewedHead } from '../../__tests__/lifecycle-fixtures.js';
import { reviewerPartyOf } from '../party.js';
import { readReviewRecordOf } from '../report-file.js';
import { effectiveReviewVerdict, listPendingReviewFindings, resolveReviewFinding } from '../resolve.js';
import type { Finding, ReviewReport } from '../types.js';

function finding(over: Partial<Finding>): Finding {
	return { claimId: 'c', kind: 'inventory', severity: 'MED', premise: 'p', evidence: 'e', action: 'a', fixability: 'manual', ...over };
}

function report(findings: Finding[]): ReviewReport {
	return { artifact: 'PLAN', stage: 'plan', verdict: 'block', findings, counts: { high: 0, med: 0, low: 0 }, reviewedAt: '', model: 'm' };
}

const MD = '# Plan\n\n- t1: extend the two exported constants.\n- t2: a design decision.\n';

function setup(findings: Finding[]): { md: string; json: string; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-resolve-'));
	const md = join(dir, 'PLAN-x.md');
	writeFileSync(md, MD);
	// the review is the lifecycle's, and its report is the entry of the artifact's log
	const json = writeReviewedHead(dir, `PLAN-${'0123456789abcdef'}-s1`, { meta: { workflow: 'plan' }, body: { tasks: [{ id: 't1', desc: 'extend the two exported constants.' }] }, report: report(findings) });
	return { md, json, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const FIXED = () => '2026-07-21T00:00:00.000Z';

test('listPendingReviewFindings returns non-LOW unresolved findings; effective verdict blocks', () => {
	const r = report([
		finding({ claimId: 'high1', severity: 'HIGH' }),
		finding({ claimId: 'med1', severity: 'MED' }),
		finding({ claimId: 'low1', severity: 'LOW' }),
	]);
	const pending = listPendingReviewFindings(r, undefined);
	assert.deepEqual(pending.map(f => f.claimId), ['high1', 'med1']);
	assert.equal(effectiveReviewVerdict(r, undefined), 'block');
	// resolve both blocking findings → pass
	const resolutions = { high1: { findingId: 'high1', status: 'resolved' as const, resolvedAt: '' }, med1: { findingId: 'med1', status: 'overridden' as const, resolvedAt: '' } };
	assert.equal(effectiveReviewVerdict(r, resolutions), 'pass');
	assert.equal(listPendingReviewFindings(r, resolutions).length, 0);
});

test('resolve apply mutates the artifact + records resolution; override clears the rest', () => {
	const s = setup([
		finding({ claimId: 'high1', severity: 'HIGH', fixability: 'assisted', proposedFix: { rationale: 'r', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] } }),
		finding({ claimId: 'med1', severity: 'MED', fixability: 'manual' }),
	]);
	try {
		// apply the HIGH's edit
		const r1 = resolveReviewFinding(s.md, s.json, 'high1', 'apply', undefined, FIXED);
		assert.equal(r1.status, 'resolved');
		assert.equal(r1.appliedEdits, 1);
		assert.equal(r1.effectiveVerdict, 'block');       // MED still unresolved
		assert.equal(r1.remainingBlocking, 1);
		assert.match(readFileSync(s.md, 'utf8'), /three exported constants/);
		const body = JSON.parse(readFileSync(s.json, 'utf8')).body;
		assert.equal(body.tasks[0].desc, 'extend the three exported constants.');   // body edited too

		// override the MED
		const r2 = resolveReviewFinding(s.md, s.json, 'med1', 'override', 'non-material', FIXED);
		assert.equal(r2.status, 'overridden');
		assert.equal(r2.effectiveVerdict, 'pass');        // all blocking resolved
		assert.equal(r2.remainingBlocking, 0);
		const resolutions = readReviewRecordOf(s.json)?.resolutions ?? {};
		assert.equal(resolutions['high1']?.status, 'resolved');
		assert.equal(resolutions['med1']?.note, 'non-material');
		assert.equal('reviewResolutions' in JSON.parse(readFileSync(s.json, 'utf8')).meta, false, 'the decisions are in the log, not the head');
	} finally { s.cleanup(); }
});

test('resolve apply refuses a finding with no edits', () => {
	const s = setup([finding({ claimId: 'm', severity: 'MED', fixability: 'manual' })]);
	try {
		assert.throws(() => resolveReviewFinding(s.md, s.json, 'm', 'apply', undefined, FIXED), /no artifactEdits/);
	} finally { s.cleanup(); }
});

test('resolve.test.ts: the review report is read from the review log entry', () => {
	const s = setup([finding({ claimId: 'm1', severity: 'MED', fixability: 'manual' }), finding({ claimId: 'm2', severity: 'MED', fixability: 'manual' })]);
	try {
		// the report and the decision come from the log; the head names the entry and holds no report
		const head = JSON.parse(readFileSync(s.json, 'utf8'));
		assert.equal(head.meta.review, undefined);
		assert.equal(head.meta.lifecycle.review.report.type, 'change-log-entry');
		assert.equal(reviewerPartyOf(head.meta.lifecycle.review), 'daemon', 'the party is the lifecycle review\'s');
		assert.equal(reviewerPartyOf({ party: 'controller', reviewedBy: 'daemon' }), 'controller', 'and wins over a report\'s label');
		const r1 = resolveReviewFinding(s.md, s.json, 'm1', 'accept', 'seen', FIXED);
		assert.equal(r1.effectiveVerdict, 'block');
		assert.equal(r1.remainingBlocking, 1);
		const r2 = resolveReviewFinding(s.md, s.json, 'm2', 'defer', undefined, FIXED);
		assert.equal(r2.effectiveVerdict, 'pass');
		const read = readReviewRecordOf(s.json);
		assert.deepEqual(Object.keys(read?.resolutions ?? {}).sort(), ['m1', 'm2']);
		assert.equal(effectiveReviewVerdict(read!.report, read!.resolutions), 'pass');
		assert.throws(() => resolveReviewFinding(s.md, s.json, 'nope', 'accept', undefined, FIXED), /no finding 'nope'/);

		// a head with a review stamp in its meta and no lifecycle review has nothing to resolve
		const old = JSON.parse(readFileSync(s.json, 'utf8'));
		delete old.meta.lifecycle;
		old.meta.review = report([finding({ claimId: 'm1', severity: 'MED' })]);
		writeFileSync(s.json, JSON.stringify(old));
		assert.throws(() => resolveReviewFinding(s.md, s.json, 'm1', 'accept', undefined, FIXED), /carries no review/);
	} finally { s.cleanup(); }
});
