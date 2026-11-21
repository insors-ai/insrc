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
import { _setResolveForCwdForTests } from '../../../daemon/steps/resolve-repo.js';

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

	it("the written Markdown renders every finding in this round's own findings array, each annotated with its category and severity", async () => {
		const call: ReviewReportDocgenCall = { reviewId: `review-findings-${process.pid}-${Date.now()}`, round: 1 };
		const findings: readonly Finding[] = [
			finding('f1', 'correctness', 'HIGH'),
			finding('f2', 'security', 'MED'),
		];
		_setReviewReportDepsForTests({ resolveRepoRoot });

		try {
			const path = await renderReviewReport(call, findings, undefined, undefined);
			const content = readFileSync(path, 'utf8');

			assert.match(content, /f1[\s\S]*correctness[\s\S]*HIGH/, 'f1 must be rendered with its own category and severity');
			assert.match(content, /f2[\s\S]*security[\s\S]*MED/, 'f2 must be rendered with its own category and severity');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', call.reviewId), { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});

	it('for round 1, the rendered Markdown carries no reconciliation annotation section at all, since no prior round exists to reconcile against', async () => {
		const call: ReviewReportDocgenCall = { reviewId: `review-round1-${process.pid}-${Date.now()}`, round: 1 };
		_setReviewReportDepsForTests({ resolveRepoRoot });

		try {
			const path = await renderReviewReport(call, [finding('f1')], undefined, undefined);
			const content = readFileSync(path, 'utf8');

			assert.doesNotMatch(content, /## Reconciliation/, 'round 1 must never render a reconciliation section, not even an empty one');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', call.reviewId), { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});

	it("for round greater than 1, the rendered Markdown inlines each reconciliation result's verdict next to the prior finding it refers to (via priorFindings), limited to only the findings this round's own reconciliation classified -- never a running audit of all history", async () => {
		const call: ReviewReportDocgenCall = { reviewId: `review-round2-${process.pid}-${Date.now()}`, round: 2 };
		// p3 is a real prior finding that this round's reconciliation did NOT classify --
		// it must never appear in the reconciliation section (lc3: limited to only what
		// reconciliation actually classified, never a running audit of all prior history).
		const priorFindings: readonly Finding[] = [
			finding('p1', 'correctness', 'HIGH'),
			finding('p2', 'security', 'MED'),
			finding('p3', 'quality', 'HIGH'),
		];
		const reconciliation: readonly ReconciliationResult[] = [
			{ priorFindingRef: 'p1', verdict: 'still-open' },
			{ priorFindingRef: 'p2', verdict: 'no-longer-surfaced' },
			// p4 has no matching priorFindings entry -- s3's own reconciliation contract
			// guarantees the id itself is correct, so this must still render, with its
			// verdict alone and the bare ref named, never a thrown error.
			{ priorFindingRef: 'p4', verdict: 'contradicted' },
		];
		_setReviewReportDepsForTests({ resolveRepoRoot });

		try {
			const path = await renderReviewReport(call, [finding('f1')], reconciliation, priorFindings);
			const content = readFileSync(path, 'utf8');

			assert.match(content, /## Reconciliation/, 'round>1 must render the reconciliation section');
			assert.match(content, /p1[\s\S]*correctness[\s\S]*HIGH[\s\S]*still-open/, "p1's own category/severity must appear next to its verdict");
			assert.match(content, /p2[\s\S]*security[\s\S]*MED[\s\S]*no-longer-surfaced/, "p2's own category/severity must appear next to its verdict");
			assert.doesNotMatch(content, /p3/, 'p3 was never classified by this round\'s reconciliation and must not appear -- never a running audit of all history');
			assert.match(content, /p4[\s\S]*contradicted/, 'an unmatched priorFindingRef must still render, with its verdict alone and the bare ref named');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', call.reviewId), { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});

	it('a reviewId containing a path-traversal segment is rejected before any filesystem access', async () => {
		let writeAttempted = false;
		_setReviewReportDepsForTests({ resolveRepoRoot, writeReport: () => { writeAttempted = true; } });

		try {
			await assert.rejects(
				() => renderReviewReport({ reviewId: '../../../private', round: 1 }, [finding('f1')], undefined, undefined),
				/invalid reviewId/,
				'a reviewId with a traversal segment must be rejected, not joined into a filesystem path',
			);
			assert.equal(writeAttempted, false, 'no write must ever be attempted once reviewId validation has failed');
		} finally {
			_setReviewReportDepsForTests({});
		}
	});

	it('a non-positive-integer round is rejected with a RangeError before any write', async () => {
		let writeAttempted = false;
		_setReviewReportDepsForTests({ resolveRepoRoot, writeReport: () => { writeAttempted = true; } });

		try {
			await assert.rejects(
				() => renderReviewReport({ reviewId: 'review-badround', round: 0 }, [finding('f1')], undefined, undefined),
				(err: unknown) => err instanceof RangeError,
				'round 0 must be rejected with a RangeError, not a plain Error',
			);
			assert.equal(writeAttempted, false, 'no write must ever be attempted once round validation has failed');
		} finally {
			_setReviewReportDepsForTests({});
		}
	});

	it("when the reviewed repository cannot be resolved, renderReviewReport rejects rather than silently defaulting to the daemon process's own cwd", async () => {
		const previousRepo = process.env.INSRC_REPO;
		delete process.env.INSRC_REPO;
		_setResolveForCwdForTests(async () => null);
		_setReviewReportDepsForTests({});
		try {
			await assert.rejects(
				() => renderReviewReport({ reviewId: 'review-unresolved', round: 1 }, [finding('f1')], undefined, undefined),
				/could not resolve the reviewed repository/,
				'with nothing resolving, renderReviewReport must reject rather than quietly using the daemon\'s own cwd',
			);
		} finally {
			if (previousRepo === undefined) delete process.env.INSRC_REPO; else process.env.INSRC_REPO = previousRepo;
			_setResolveForCwdForTests(undefined);
			_setReviewReportDepsForTests({});
		}
	});

	it('a rejecting filesystem write propagates its rejection rather than returning a path to a file that was never actually written', async () => {
		const failure = new Error('disk full');
		_setReviewReportDepsForTests({ resolveRepoRoot, writeReport: () => { throw failure; } });

		try {
			await assert.rejects(
				() => renderReviewReport({ reviewId: 'review-writefail', round: 1 }, [finding('f1')], undefined, undefined),
				(err: unknown) => err === failure,
				'the write rejection must propagate unchanged, never a path to a file that was never written',
			);
		} finally {
			_setReviewReportDepsForTests({});
		}
	});

	it('an empty findings array still renders successfully with an explicit statement that no findings were produced this round', async () => {
		const call: ReviewReportDocgenCall = { reviewId: `review-empty-${process.pid}-${Date.now()}`, round: 1 };
		_setReviewReportDepsForTests({ resolveRepoRoot });

		try {
			const path = await renderReviewReport(call, [], undefined, undefined);
			const content = readFileSync(path, 'utf8');

			assert.match(content, /No findings were produced this round\./, 'an empty findings array must render an explicit statement, not an empty or malformed section');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', call.reviewId), { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});

	it('the path renderReviewReport returns points to a file that exists and is readable immediately after the call resolves, so insrc_present can open it with no further round-driver action', async () => {
		const call: ReviewReportDocgenCall = { reviewId: `review-readable-${process.pid}-${Date.now()}`, round: 1 };
		_setReviewReportDepsForTests({ resolveRepoRoot });

		try {
			const path = await renderReviewReport(call, [finding('f1')], undefined, undefined);

			assert.equal(existsSync(path), true, 'the returned path must exist on disk immediately after the call resolves');
			assert.doesNotThrow(() => readFileSync(path, 'utf8'), 'the returned path must be readable with no further action');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', call.reviewId), { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});
});
