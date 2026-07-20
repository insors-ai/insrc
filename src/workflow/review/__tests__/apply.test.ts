/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyAutoFixes, pendingUserFindings } from '../apply.js';
import type { Finding, ReviewReport } from '../types.js';

function finding(over: Partial<Finding>): Finding {
	return {
		claimId: 'c', kind: 'inventory', severity: 'HIGH', premise: 'p',
		evidence: 'e', action: 'a', fixability: 'manual', ...over,
	};
}

function report(findings: Finding[]): ReviewReport {
	return {
		artifact: 'a', stage: 'plan', verdict: 'block', findings,
		counts: { high: 0, med: 0, low: 0 }, reviewedAt: '2026-07-20T00:00:00.000Z', model: 'm',
	};
}

const MD = '# Story\n\n- t1: extend the two exported constants.\n';
const BODY = { tasks: [{ id: 't1', desc: 'extend the two exported constants.' }] };

test('auto finding applies its edit to both markdown and body', () => {
	const r = report([finding({
		claimId: 'c-inv', ref: 's1/t1', fixability: 'auto',
		proposedFix: { rationale: 'three found', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] },
	})]);
	const out = applyAutoFixes(MD, BODY, r);
	assert.match(out.markdown, /three exported constants/);
	assert.equal((out.body as typeof BODY).tasks[0]?.desc, 'extend the three exported constants.');
	assert.equal(out.applied.length, 1);
	assert.equal(out.skipped.length, 0);
	// input not mutated
	assert.match(MD, /two exported constants/);
	assert.equal(BODY.tasks[0]?.desc, 'extend the two exported constants.');
});

test('an edit whose find is absent is skipped, never applied blind', () => {
	const r = report([finding({
		claimId: 'c-x', fixability: 'auto',
		proposedFix: { rationale: 'x', artifactEdits: [{ find: 'NONEXISTENT SUBSTRING', replace: 'whatever' }] },
	})]);
	const out = applyAutoFixes(MD, BODY, r);
	assert.equal(out.markdown, MD);
	assert.equal(out.applied.length, 0);
	assert.equal(out.skipped.length, 1);
	assert.equal(out.skipped[0]?.reason, 'find-not-present');
});

test('assisted/manual findings are not auto-applied and surface via pendingUserFindings', () => {
	const findings = [
		finding({ claimId: 'a', fixability: 'assisted', proposedFix: { rationale: 'r', options: ['x', 'y'] } }),
		finding({ claimId: 'm', fixability: 'manual', proposedFix: { rationale: 'r', options: ['z'] } }),
		finding({ claimId: 'au', fixability: 'auto', proposedFix: { rationale: 'r', artifactEdits: [{ find: 'two', replace: '2' }] } }),
	];
	const r = report(findings);
	const out = applyAutoFixes(MD, BODY, r);
	// only the auto one applied
	assert.deepEqual(out.applied.map(a => a.claimId), ['au']);
	// gate returns assisted first, then manual — never the auto one
	const pending = pendingUserFindings(r);
	assert.deepEqual(pending.map(f => f.claimId), ['a', 'm']);
});
