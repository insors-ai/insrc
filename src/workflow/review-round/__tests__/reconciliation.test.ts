/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
});
