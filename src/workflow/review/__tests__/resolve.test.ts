/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

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
	const json = join(dir, 'PLAN-x.json');
	writeFileSync(md, MD);
	writeFileSync(json, JSON.stringify({ meta: { workflow: 'plan', review: report(findings) }, body: { tasks: [{ id: 't1', desc: 'extend the two exported constants.' }] }, citations: [] }, null, 2));
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
		const meta = JSON.parse(readFileSync(s.json, 'utf8')).meta;
		assert.equal(meta.reviewResolutions.high1.status, 'resolved');
		assert.equal(meta.reviewResolutions.med1.note, 'non-material');
	} finally { s.cleanup(); }
});

test('resolve apply refuses a finding with no edits', () => {
	const s = setup([finding({ claimId: 'm', severity: 'MED', fixability: 'manual' })]);
	try {
		assert.throws(() => resolveReviewFinding(s.md, s.json, 'm', 'apply', undefined, FIXED), /no artifactEdits/);
	} finally { s.cleanup(); }
});
