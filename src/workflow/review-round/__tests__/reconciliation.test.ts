/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _setReconciliationDepsForTests, reconcileRound } from '../reconciliation.js';
import type { ReconciliationVerdict } from '../reconciliation.js';
import type { Finding } from '../finding.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const FIXTURE = 'src/workflow/review-round/__type-tests__/reconciliation-result.typecheck.ts';

/**
 * tsconfig.json excludes `__type-tests__` from the main build, so this runs tsc itself against
 * a throwaway project that extends the root config with just the fixture included -- proving
 * every field's required/optional and readonly status (asserted there via @ts-expect-error)
 * without widening any shared tsconfig.
 */
function typecheckFixture(): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-reconciliation-typecheck-'));
	try {
		writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
			extends: resolve(ROOT, 'tsconfig.json'),
			compilerOptions: {
				noEmit: true, declaration: false, declarationMap: false, sourceMap: false,
				typeRoots: [resolve(ROOT, 'node_modules/@types')],
			},
			include: [resolve(ROOT, FIXTURE)],
			exclude: [],
		}));
		execFileSync('node', [TSC, '-p', join(dir, 'tsconfig.json')], { cwd: ROOT, stdio: 'pipe' });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const finding = (id: string, category: Finding['category'] = 'correctness', severity = 'HIGH'): Finding => ({ id, category, severity });

/** A classify stub returning the given verdicts in order, recording every call. */
function stubClassify(verdicts: readonly ReconciliationVerdict[]) {
	const calls: Array<{ reviewId: string; priorFindings: readonly Finding[]; currentFindings: readonly Finding[]; auditTrail: string | undefined }> = [];
	const classify = async (reviewId: string, priorFindings: readonly Finding[], currentFindings: readonly Finding[], auditTrail: string | undefined): Promise<readonly ReconciliationVerdict[]> => {
		calls.push({ reviewId, priorFindings, currentFindings, auditTrail });
		return verdicts;
	};
	return { classify, calls };
}

describe('reconcileRound and ReconciliationResult', () => {
	it("reconcileRound produces exactly one ReconciliationResult per entry in priorFindings, keyed by that finding's own id", async () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);

		const priorFindings = [finding('f1'), finding('f2'), finding('f3')];
		const currentFindings = [finding('f4')];
		const { classify } = stubClassify(['confirmed', 'still-open', 'no-longer-surfaced']);
		_setReconciliationDepsForTests({ classify, auditTrailExists: () => false });

		const results = await reconcileRound('review-1', priorFindings, currentFindings);

		assert.equal(results.length, 3, 'exactly one result per entry in priorFindings');
		assert.deepEqual(results.map(r => r.priorFindingRef), ['f1', 'f2', 'f3'], 'each result is keyed by its prior finding\'s own id, in order');
		assert.deepEqual(results.map(r => r.verdict), ['confirmed', 'still-open', 'no-longer-surfaced']);

		_setReconciliationDepsForTests({});
	});

	it('reconcileRound\'s parameters are reviewId and the two finding sets only -- no ReviewTargets-shaped parameter exists anywhere in its signature, so no re-grounding input is even possible', () => {
		assert.equal(reconcileRound.length, 3, 'reconcileRound must declare exactly three parameters: reviewId, priorFindings, currentFindings');
		// Runtime arity alone cannot see a widened or retyped parameter -- the fixture's
		// Parameters<typeof reconcileRound> exact-tuple proof is what actually rules out a
		// ReviewTargets-shaped (or any other) extra/retyped input.
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches, including its reconcileRound parameter-shape proof`);
	});

	it('ReconciliationResult\'s exported shape contains exactly priorFindingRef and verdict, with no severity, blocking, or gate-facing field of any kind', async () => {
		const { classify } = stubClassify(['confirmed']);
		_setReconciliationDepsForTests({ classify, auditTrailExists: () => false });

		const [result] = await reconcileRound('review-shape', [finding('f1')], []);

		assert.deepEqual(Object.keys(result!).sort(), ['priorFindingRef', 'verdict'], 'a ReconciliationResult has exactly these two own keys, at runtime as well as at the type level');

		_setReconciliationDepsForTests({});
	});

	it('ReconciliationVerdict accepts exactly the four fixed verdicts (confirmed, still-open, contradicted, no-longer-surfaced) and rejects any other value at compile time', () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);
	});

	it('a rejecting reconcileRound call propagates its rejection rather than returning partial or fabricated results', async () => {
		const failure = new Error('classification provider unavailable');
		const classify = async (): Promise<readonly ReconciliationVerdict[]> => { throw failure; };
		_setReconciliationDepsForTests({ classify, auditTrailExists: () => false });

		await assert.rejects(
			() => reconcileRound('review-reject', [finding('f1'), finding('f2')], []),
			(err: unknown) => err === failure,
			'the rejection must propagate unchanged, with no partial or fabricated result returned instead',
		);

		_setReconciliationDepsForTests({});
	});

	it('priorFindings as an empty array returns an empty array, not an error', async () => {
		const { classify, calls } = stubClassify([]);
		_setReconciliationDepsForTests({ classify, auditTrailExists: () => false });

		const results = await reconcileRound('review-empty', [], [finding('f1')]);

		assert.deepEqual(results, []);
		assert.equal(calls.length, 0, 'an empty priorFindings never needs to call classify at all');

		_setReconciliationDepsForTests({});
	});

	it('two priorFindings entries with identical category and severity but different id values still produce two separate ReconciliationResult entries, keyed by their distinct ids', async () => {
		const priorFindings = [finding('f1', 'correctness', 'HIGH'), finding('f2', 'correctness', 'HIGH')];
		const currentFindings = [finding('f3', 'correctness', 'HIGH')];
		const { classify } = stubClassify(['confirmed', 'confirmed']);
		_setReconciliationDepsForTests({ classify, auditTrailExists: () => false });

		const results = await reconcileRound('review-dup', priorFindings, currentFindings);

		assert.equal(results.length, 2, 'identical category+severity must still yield one result per distinct prior finding');
		assert.deepEqual(results.map(r => r.priorFindingRef), ['f1', 'f2'], 'each result is keyed by its own finding\'s distinct id, never collapsed');

		_setReconciliationDepsForTests({});
	});

	it('when the two finding sets alone do not resolve a classification, reconcileRound reads the audit trail itself from .insrc/tmp/<reviewId>/, rather than requiring the caller to have pre-extracted and passed it in', async () => {
		const reviewId = `review-audit-${process.pid}-${Date.now()}`;
		const dir = join(ROOT, '.insrc/tmp', reviewId);
		const auditTrailContent = JSON.stringify({ note: 'prior round audit trail' });
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'audit-trail.json'), auditTrailContent, 'utf8');

		try {
			// No classify.auditTrailExists/readAuditTrail override here: this exercises the
			// real default implementation, which resolves the path from reviewId alone, under
			// the process's own cwd -- proving reconcileRound reads it internally, since its
			// own signature (proven above) has no auditTrail parameter for a caller to fill.
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify });

			// Ambiguous: no currentFindings entry shares this prior finding's category+severity.
			await reconcileRound(reviewId, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, auditTrailContent, 'the audit trail read from .insrc/tmp/<reviewId>/audit-trail.json must be the one passed through to classify');
		} finally {
			rmSync(dir, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});
});
