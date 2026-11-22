/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isOverrideStale, isSecurityFinding, makeRiskFamilyVerdictFinding } from '../security-finding.js';
import type { SecurityFinding } from '../security-finding.js';
import type { Finding } from '../finding.js';
import { _setReconciliationDepsForTests, reconcileRound } from '../reconciliation.js';
import type { ReconciliationResult } from '../reconciliation.js';
import { _setReviewReportDepsForTests, renderReviewReport } from '../review-report.js';
import type { ReviewReportDocgenCall } from '../review-report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const resolveRepoRoot = async (): Promise<string> => ROOT;

const plainFinding = (id: string): Finding => ({ id, category: 'correctness', severity: 'HIGH' });

const securityFinding = (id: string, overrides: Partial<SecurityFinding> = {}): SecurityFinding => ({
	id,
	category: 'security',
	severity: 'HIGH',
	kind: 'security',
	checkId: 'secret-scan',
	evidence: [],
	enforcementMode: 'blocking',
	...overrides,
});

describe('SecurityFinding, isSecurityFinding, risk-family verdicts, and the policy-override staleness check', () => {
	it('isSecurityFinding returns true only for an object whose kind discriminant is exactly \'security\'', () => {
		assert.equal(isSecurityFinding(securityFinding('f1')), true, 'a well-formed SecurityFinding must be recognized');
		assert.equal(isSecurityFinding(plainFinding('f2')), false, 'a plain Finding (no kind field) must not be recognized');
		assert.equal(isSecurityFinding({ ...plainFinding('f3'), kind: 'Security' } as unknown as Finding), false, 'a malformed discriminant (wrong case) must not be recognized');
		assert.equal(isSecurityFinding({ ...plainFinding('f4'), kind: 'comment' } as unknown as Finding), false, 'a discriminant naming an unrelated kind must not be recognized');
	});

	it('SecurityFinding structurally extends base Finding -- every Finding field present plus the security-only fields', () => {
		const sf = securityFinding('f1', {
			violatedPolicyRef: 'POL-1',
			fixability: 'patch available',
			confidence: 'medium',
			overriddenBy: 'alice',
			overrideReason: 'accepted risk',
			overriddenAt: 'rev-1',
			receiptId: 'receipt-1',
			riskFamilyVerdict: 'uncertain',
		});
		assert.equal(sf.id, 'f1');
		assert.equal(sf.category, 'security');
		assert.equal(sf.severity, 'HIGH');
		assert.equal(sf.kind, 'security');
		assert.equal(sf.checkId, 'secret-scan');
		assert.equal(sf.violatedPolicyRef, 'POL-1');
		assert.deepEqual(sf.evidence, []);
		assert.equal(sf.fixability, 'patch available');
		assert.equal(sf.confidence, 'medium');
		assert.equal(sf.enforcementMode, 'blocking');
		assert.equal(sf.overriddenBy, 'alice');
		assert.equal(sf.overrideReason, 'accepted risk');
		assert.equal(sf.overriddenAt, 'rev-1');
		assert.equal(sf.receiptId, 'receipt-1');
		assert.equal(sf.riskFamilyVerdict, 'uncertain');
	});

	it('overriddenAt vs current Scope revision comparison (stale override rejected)', () => {
		assert.equal(isOverrideStale('rev-1', 'rev-2'), true, 'a diverged revision must be rejected as stale');
		assert.equal(isOverrideStale('rev-1', 'rev-1'), false, 'a matching revision must not be rejected');
		assert.equal(isOverrideStale(undefined, 'rev-1'), false, 'no override at all is never stale -- nothing to compare');
	});

	it('risk-family verdict recorded as informational zero-severity SecurityFinding for not-applicable/uncertain families', () => {
		const notApplicable = makeRiskFamilyVerdictFinding('verdict-1', 'sast', 'not-applicable', 'no server-side code in this scope');
		assert.equal(notApplicable.severity, 'INFO', 'a risk-family verdict must carry informational, zero severity');
		assert.equal(notApplicable.checkId, 'sast');
		assert.equal(notApplicable.fixability, 'no server-side code in this scope');
		assert.equal(notApplicable.riskFamilyVerdict, 'not-applicable', 'the verdict itself must be retrievable from the finding');
		assert.equal(notApplicable.confidence, undefined, 'a definite (not-applicable) verdict carries no confidence qualifier');
		assert.equal(isSecurityFinding(notApplicable), true);

		const applicable = makeRiskFamilyVerdictFinding('verdict-2', 'sast', 'applicable', 'no server-side code in this scope');
		assert.equal(applicable.riskFamilyVerdict, 'applicable', 'an applicable verdict with the same family/reason as a not-applicable one must still be distinguishable');
		assert.notDeepEqual(applicable, notApplicable, 'applicable and not-applicable verdicts for the same family and reason must never collapse to identical findings');

		const uncertain = makeRiskFamilyVerdictFinding('verdict-3', 'iac', 'uncertain', 'ambiguous infra manifest coverage');
		assert.equal(uncertain.severity, 'INFO');
		assert.equal(uncertain.riskFamilyVerdict, 'uncertain');
		assert.equal(uncertain.confidence, 'low', 'an uncertain verdict must flag low confidence');
	});

	it('reconciliation pass consuming a mixed Finding/SecurityFinding list', async () => {
		const reviewId = `review-mixedfinding-${process.pid}-${Date.now()}`;
		const prior: readonly Finding[] = [plainFinding('f1'), securityFinding('sf1')];
		const current: readonly Finding[] = [plainFinding('f1'), securityFinding('sf1')];
		_setReconciliationDepsForTests({
			resolveRepoRoot,
			auditTrailExists: () => false,
			classify: async (_reviewId, priorFindings) => priorFindings.map(() => 'confirmed' as const),
		});
		try {
			const result = await reconcileRound(reviewId, prior, current);
			assert.deepEqual(result, [
				{ priorFindingRef: 'f1', verdict: 'confirmed' },
				{ priorFindingRef: 'sf1', verdict: 'confirmed' },
			], 'reconcileRound must accept a mixed Finding/SecurityFinding list with zero change to its own logic');
		} finally {
			_setReconciliationDepsForTests({});
		}
	});

	it('docgen review-report render of a round containing SecurityFinding entries', async () => {
		const call: ReviewReportDocgenCall = { reviewId: `review-secfinding-${process.pid}-${Date.now()}`, round: 1 };
		const findings: readonly Finding[] = [plainFinding('f1'), securityFinding('sf1', { violatedPolicyRef: 'POL-1' })];
		_setReviewReportDepsForTests({ resolveRepoRoot });
		try {
			const result = await renderReviewReport(call, findings, undefined, undefined);
			assert.match(result.markdown, /\*\*f1\*\* — correctness \/ HIGH/, 'the plain Finding must still render');
			assert.match(result.markdown, /\*\*sf1\*\* — security \/ HIGH/, 'the SecurityFinding must render through the same renderer, with zero change to its own type signature');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', call.reviewId), { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});
});
