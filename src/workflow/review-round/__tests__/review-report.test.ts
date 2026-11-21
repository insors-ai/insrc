/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _setReviewReportDepsForTests, renderReviewReport } from '../review-report.js';
import type { ReviewReportDocgenCall } from '../review-report.js';
import type { Finding } from '../finding.js';
import type { ReconciliationResult } from '../reconciliation.js';
import { _setResolveForCwdForTests } from '../../../daemon/steps/resolve-repo.js';
import { handleInsrcPresent } from '../../../mcp/server.js';

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

/** A daemon stand-in answering `workflow.pending` -- matches src/mcp/__tests__/present-dispatch.test.ts's
 *  own fakeDaemon convention, so handleInsrcPresent is exercised against its real matching logic. */
async function fakePendingDaemon(result: unknown): Promise<{ connect: () => Socket; close: () => Promise<void> }> {
	const path = join(tmpdir(), `insrc-review-report-present-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`);
	try { rmSync(path); } catch { /* ignore */ }
	const server: Server = createServer((socket) => {
		let buffer = '';
		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				const req = JSON.parse(line) as { id: number };
				socket.write(JSON.stringify({ id: req.id, result }) + '\n');
			}
		});
		socket.on('error', () => { /* client vanished */ });
	});
	await new Promise<void>((res) => server.listen(path, () => res()));
	return {
		connect: () => createConnection(path),
		close: () => new Promise<void>((res) => { server.close(() => { try { rmSync(path); } catch { /* ignore */ } res(); }); }),
	};
}

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
			const { path, markdown } = await renderReviewReport(call, findings, reconciliation, priorFindings);

			assert.equal(path, expectedPath, 'the returned path must be exactly the persisted file under .insrc/tmp/<reviewId>/');
			assert.equal(existsSync(path), true, 'the file must actually exist on disk after the call resolves');
			const content = readFileSync(path, 'utf8');
			assert.equal(markdown, content, 'the returned markdown must be exactly what was written to disk');
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
			const { markdown: content } = await renderReviewReport(call, findings, undefined, undefined);

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
			const { markdown: content } = await renderReviewReport(call, [finding('f1')], undefined, undefined);

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
			const { markdown: content } = await renderReviewReport(call, [finding('f1')], reconciliation, priorFindings);

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
		let repoRootResolved = false;
		_setReviewReportDepsForTests({
			resolveRepoRoot: async () => { repoRootResolved = true; return ROOT; },
			writeReport: () => { writeAttempted = true; },
		});

		try {
			await assert.rejects(
				() => renderReviewReport({ reviewId: '../../../private', round: 1 }, [finding('f1')], undefined, undefined),
				/invalid reviewId/,
				'a reviewId with a traversal segment must be rejected, not joined into a filesystem path',
			);
			assert.equal(repoRootResolved, false, 'reviewId validation must run before the repository is even resolved, so no filesystem/IPC access of any kind is attempted');
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
			const { markdown: content } = await renderReviewReport(call, [], undefined, undefined);

			assert.match(content, /No findings were produced this round\./, 'an empty findings array must render an explicit statement, not an empty or malformed section');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', call.reviewId), { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});

	it('the returned markdown is exactly the persisted file\'s own content, which the caller presents directly to satisfy ac3 -- insrc_present (confirmed against its real handler) never applies to a review-report', async () => {
		// insrc_present's own matching (handleInsrcPresent, src/mcp/server.ts) is scoped
		// entirely to the daemon's pending-workflow-artifact list -- confirmed here against
		// the REAL handler, not assumed. A review-report is never pending approval (ac3
		// itself: "no response required from the user"), so it can never appear there, and
		// this is the deliberate, documented design (see review-report.ts's module doc),
		// not an oversight. What actually satisfies ac3 is the returned `markdown`: the
		// caller presents that directly in its own response, which this proves is exactly
		// what was written to the (also still readable) persisted file -- no tool call needed.
		const call: ReviewReportDocgenCall = { reviewId: `review-readable-${process.pid}-${Date.now()}`, round: 1 };
		_setReviewReportDepsForTests({ resolveRepoRoot });

		try {
			const { path, markdown } = await renderReviewReport(call, [finding('f1')], undefined, undefined);

			assert.equal(existsSync(path), true, 'the returned path must exist on disk immediately after the call resolves');
			assert.equal(readFileSync(path, 'utf8'), markdown, 'the returned markdown must be exactly the persisted file\'s own content');

			const daemon = await fakePendingDaemon({ artifacts: [] });
			try {
				const relativePath = `.insrc/tmp/${call.reviewId}/review-report-round-1.md`;
				const out = await handleInsrcPresent(
					{ documents: [relativePath] },
					{ connect: daemon.connect, resolveRepo: async () => ROOT },
				);
				assert.deepEqual(JSON.parse((out.content[0] as { text: string }).text), { presented: [], notPending: [relativePath] });
			} finally {
				await daemon.close();
			}
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', call.reviewId), { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});

	it('a symlinked review directory is never written through, even outside .insrc/tmp', async () => {
		const reviewId = `review-symlinkdir-${process.pid}-${Date.now()}`;
		const outsideDir = mkdtempSync(join(tmpdir(), 'insrc-review-report-outside-'));
		const tmpRoot = join(ROOT, '.insrc/tmp');
		mkdirSync(tmpRoot, { recursive: true });
		const reviewDir = join(tmpRoot, reviewId);
		symlinkSync(outsideDir, reviewDir, 'dir');
		_setReviewReportDepsForTests({ resolveRepoRoot });

		try {
			await assert.rejects(
				() => renderReviewReport({ reviewId, round: 1 }, [finding('f1')], undefined, undefined),
				/is a symlink/,
				'a symlinked review directory must be rejected, never written through',
			);
			assert.equal(existsSync(join(outsideDir, `review-report-round-1.md`)), false, 'no file must ever land in the symlink target outside the repository');
		} finally {
			rmSync(reviewDir, { force: true });
			rmSync(outsideDir, { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});

	it('a symlinked report file is never written through -- it must not truncate or overwrite an unrelated external file', async () => {
		const reviewId = `review-symlinkfile-${process.pid}-${Date.now()}`;
		const reviewDir = join(ROOT, '.insrc/tmp', reviewId);
		mkdirSync(reviewDir, { recursive: true });
		const externalFile = join(mkdtempSync(join(tmpdir(), 'insrc-review-report-external-')), 'victim.txt');
		const originalContent = 'do not overwrite me';
		writeFileSync(externalFile, originalContent, 'utf8');
		symlinkSync(externalFile, join(reviewDir, 'review-report-round-1.md'), 'file');
		_setReviewReportDepsForTests({ resolveRepoRoot });

		try {
			await assert.rejects(
				() => renderReviewReport({ reviewId, round: 1 }, [finding('f1')], undefined, undefined),
				/is a symlink/,
				'a symlinked report file must be rejected, never written through',
			);
			assert.equal(readFileSync(externalFile, 'utf8'), originalContent, 'the external file the symlink pointed to must be left untouched');
		} finally {
			rmSync(reviewDir, { recursive: true, force: true });
			rmSync(dirname(externalFile), { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});

	it('a DANGLING symlinked report file (target does not yet exist) is never written through -- existsSync alone cannot see it', async () => {
		const reviewId = `review-symlinkdangling-${process.pid}-${Date.now()}`;
		const reviewDir = join(ROOT, '.insrc/tmp', reviewId);
		mkdirSync(reviewDir, { recursive: true });
		const outsideDir = mkdtempSync(join(tmpdir(), 'insrc-review-report-dangling-'));
		// The symlink's target (victim.md) is deliberately never created -- existsSync
		// on the symlink itself follows it and reports false for a dangling link,
		// which would skip an existsSync-guarded lstatSync check entirely.
		const danglingTarget = join(outsideDir, 'victim.md');
		symlinkSync(danglingTarget, join(reviewDir, 'review-report-round-1.md'), 'file');
		_setReviewReportDepsForTests({ resolveRepoRoot });

		try {
			await assert.rejects(
				() => renderReviewReport({ reviewId, round: 1 }, [finding('f1')], undefined, undefined),
				/is a symlink/,
				'a dangling symlinked report file must be rejected, never written through',
			);
			assert.equal(existsSync(danglingTarget), false, 'the dangling symlink\'s target must never be created by the write');
		} finally {
			rmSync(reviewDir, { recursive: true, force: true });
			rmSync(outsideDir, { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});

	it("review A's own directory aliased (via symlink) to sibling review B's genuine directory is rejected, not written through", async () => {
		const reviewIdB = `review-siblingdir-b-${process.pid}-${Date.now()}`;
		const reviewIdA = `review-siblingdir-a-${process.pid}-${Date.now()}`;
		const tmpRoot = join(ROOT, '.insrc/tmp');
		mkdirSync(tmpRoot, { recursive: true });
		const dirB = join(tmpRoot, reviewIdB);
		const dirA = join(tmpRoot, reviewIdA);
		mkdirSync(dirB, { recursive: true });
		// review A's own directory IS a symlink, but to a SIBLING's genuine directory --
		// still legitimately inside .insrc/tmp, so a root-containment check alone would pass it.
		symlinkSync(dirB, dirA, 'dir');
		_setReviewReportDepsForTests({ resolveRepoRoot });

		try {
			await assert.rejects(
				() => renderReviewReport({ reviewId: reviewIdA, round: 1 }, [finding('f1')], undefined, undefined),
				/is a symlink/,
				'review A must never write through a directory alias to review B, even though B is a genuine sibling directory',
			);
			assert.equal(existsSync(join(dirB, 'review-report-round-1.md')), false, 'review B\'s own directory must never receive a write made in review A\'s name');
		} finally {
			rmSync(dirA, { force: true });
			rmSync(dirB, { recursive: true, force: true });
			_setReviewReportDepsForTests({});
		}
	});
});
