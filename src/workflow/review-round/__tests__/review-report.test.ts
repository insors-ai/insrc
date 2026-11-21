/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _setReviewReportDepsForTests, renderReviewReport } from '../review-report.js';
import type { ReviewReportDocgenCall } from '../review-report.js';
import type { Finding } from '../finding.js';
import type { ReconciliationResult } from '../reconciliation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const FIXTURE = 'src/workflow/review-round/__type-tests__/review-report.typecheck.ts';

/**
 * tsconfig.json excludes `__type-tests__` from the main build, so this runs tsc itself against
 * a throwaway project that extends the root config with just the fixture included.
 */
function typecheckFixture(): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-review-report-typecheck-'));
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

/** The resolveRepoRoot dep every test not specifically exercising repo resolution itself injects. */
const resolveRepoRoot = async (): Promise<string> => ROOT;

describe('renderReviewReport and ReviewReportDocgenCall', () => {
	it("renderReviewReport writes a persisted Markdown file under the review's own .insrc/tmp/<reviewId>/ directory and returns its path", async () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);

		const call: ReviewReportDocgenCall = { reviewId: `review-t1-${process.pid}-${Date.now()}`, round: 1 };
		const findings: readonly Finding[] = [finding('f1', 'correctness', 'HIGH')];
		const reconciliation: readonly ReconciliationResult[] | undefined = undefined;
		const priorFindings: readonly Finding[] | undefined = undefined;
		_setReviewReportDepsForTests({ resolveRepoRoot });

		const expectedPath = join(ROOT, '.insrc/tmp', call.reviewId, `review-report-round-${call.round}.md`);
		try {
			const path = await renderReviewReport(call, findings, reconciliation, priorFindings);

			assert.equal(path, expectedPath, 'the returned path must be exactly the persisted file under .insrc/tmp/<reviewId>/');
			assert.equal(existsSync(path), true, 'the file must actually exist on disk after the call resolves');
			const content = readFileSync(path, 'utf8');
			assert.match(content, /# Review report — round 1/, 'the rendered Markdown must carry the round heading');
			assert.match(content, /f1/, "the rendered Markdown must mention this round's finding");
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', call.reviewId), { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});
});
