/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _setReconciliationDepsForTests, reconcileRound } from '../reconciliation.js';
import type { ReconciliationVerdict } from '../reconciliation.js';
import type { Finding } from '../finding.js';
import { _setResolveForCwdForTests } from '../../../daemon/steps/resolve-repo.js';
import { runInStepContext } from '../../../shared/step-context.js';

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
	const calls: Array<{ reviewId: string; priorFindings: readonly Finding[]; currentFindings: readonly Finding[]; auditTrail: string | undefined; repoRoot: string }> = [];
	const classify = async (reviewId: string, priorFindings: readonly Finding[], currentFindings: readonly Finding[], auditTrail: string | undefined, repoRoot: string): Promise<readonly ReconciliationVerdict[]> => {
		calls.push({ reviewId, priorFindings, currentFindings, auditTrail, repoRoot });
		return verdicts;
	};
	return { classify, calls };
}

/** Every test not specifically exercising repo resolution itself injects this fixed root,
 *  bypassing the canonical resolver's own daemon-client/registry plumbing entirely. */
const resolveRepoRoot = async (): Promise<string> => ROOT;

describe('reconcileRound and ReconciliationResult', () => {
	it("reconcileRound produces exactly one ReconciliationResult per entry in priorFindings, keyed by that finding's own id", async () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);

		const priorFindings = [finding('f1'), finding('f2'), finding('f3')];
		const currentFindings = [finding('f4')];
		const { classify } = stubClassify(['confirmed', 'still-open', 'no-longer-surfaced']);
		_setReconciliationDepsForTests({ classify, auditTrailExists: () => false, resolveRepoRoot });

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
		_setReconciliationDepsForTests({ classify, auditTrailExists: () => false, resolveRepoRoot });

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
		_setReconciliationDepsForTests({ classify, auditTrailExists: () => false, resolveRepoRoot });

		await assert.rejects(
			() => reconcileRound('review-reject', [finding('f1'), finding('f2')], []),
			(err: unknown) => err === failure,
			'the rejection must propagate unchanged, with no partial or fabricated result returned instead',
		);

		_setReconciliationDepsForTests({});
	});

	it('priorFindings as an empty array returns an empty array, not an error', async () => {
		const { classify, calls } = stubClassify([]);
		_setReconciliationDepsForTests({ classify, auditTrailExists: () => false, resolveRepoRoot });

		const results = await reconcileRound('review-empty', [], [finding('f1')]);

		assert.deepEqual(results, []);
		assert.equal(calls.length, 0, 'an empty priorFindings never needs to call classify at all');

		_setReconciliationDepsForTests({});
	});

	it('two priorFindings entries with identical category and severity but different id values still produce two separate ReconciliationResult entries, keyed by their distinct ids', async () => {
		const priorFindings = [finding('f1', 'correctness', 'HIGH'), finding('f2', 'correctness', 'HIGH')];
		const currentFindings = [finding('f3', 'correctness', 'HIGH')];
		const { classify } = stubClassify(['confirmed', 'confirmed']);
		_setReconciliationDepsForTests({ classify, auditTrailExists: () => false, resolveRepoRoot });

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
			// No auditTrailExists/readAuditTrail override here: this exercises the real default
			// implementation, proving reconcileRound reads it internally -- its own signature
			// (proven above) has no auditTrail parameter for a caller to fill.
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify, resolveRepoRoot });

			// Ambiguous: no currentFindings entry shares this prior finding's own id.
			await reconcileRound(reviewId, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, auditTrailContent, 'the audit trail read from .insrc/tmp/<reviewId>/audit-trail.json must be the one passed through to classify');
		} finally {
			rmSync(dir, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

	it('a reviewId containing a path-traversal segment is rejected before any filesystem access, rather than being joined into the audit-trail path unvalidated', async () => {
		const { classify, calls } = stubClassify(['confirmed']);
		_setReconciliationDepsForTests({ classify, resolveRepoRoot });

		try {
			await assert.rejects(
				() => reconcileRound('../../../private', [finding('f1')], []),
				/invalid reviewId/,
				'a reviewId with a traversal segment must be rejected, not joined into a filesystem path',
			);
			assert.equal(calls.length, 0, 'classify must never run once reviewId validation has failed');
		} finally {
			_setReconciliationDepsForTests({});
		}
	});

	it('two findings sharing category and severity but with different ids are NOT treated as a recurrence -- only a matching id is unambiguous', async () => {
		const reviewId = `review-identity-${process.pid}-${Date.now()}`;
		const dir = join(ROOT, '.insrc/tmp', reviewId);
		const auditTrailContent = JSON.stringify({ note: 'identity-ambiguity audit trail' });
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'audit-trail.json'), auditTrailContent, 'utf8');

		try {
			// Same category+severity, different id -- must be ambiguous (reads the audit trail),
			// not treated as a literal recurrence the way a category+severity match alone would be.
			const { classify, calls } = stubClassify(['contradicted']);
			_setReconciliationDepsForTests({ classify, resolveRepoRoot });

			await reconcileRound(reviewId, [finding('prior-1', 'correctness', 'HIGH')], [finding('other-1', 'correctness', 'HIGH')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, auditTrailContent, 'a category+severity coincidence must still be ambiguous enough to read the audit trail');
		} finally {
			rmSync(dir, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

	// --- Repo resolution: the real defaultResolveRepoRoot, through the canonical
	// precedence chain (explicit > registered-repo-for-cwd > envRepo > undefined),
	// resolveForCwd mocked per test via _setResolveForCwdForTests. ---

	it('outside any bound request, with no registered repo for the process cwd, the audit trail and the classify provider fall back to the process\'s own INSRC_REPO', async () => {
		const reviewId = `review-repo-${process.pid}-${Date.now()}`;
		const pinnedRepo = mkdtempSync(join(tmpdir(), 'insrc-reconciliation-repo-'));
		const dir = join(pinnedRepo, '.insrc/tmp', reviewId);
		const auditTrailContent = JSON.stringify({ note: 'pinned-repo audit trail' });
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'audit-trail.json'), auditTrailContent, 'utf8');

		const previousRepo = process.env.INSRC_REPO;
		process.env.INSRC_REPO = pinnedRepo;
		_setResolveForCwdForTests(async () => null); // no registered repo matches any cwd
		try {
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify });

			await reconcileRound(reviewId, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, auditTrailContent, 'the audit trail must be read from INSRC_REPO\'s .insrc/tmp/<reviewId>/ when no registered repo matches cwd');
			assert.equal(calls[0]!.repoRoot, pinnedRepo);
		} finally {
			if (previousRepo === undefined) delete process.env.INSRC_REPO; else process.env.INSRC_REPO = previousRepo;
			_setResolveForCwdForTests(undefined);
			rmSync(pinnedRepo, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

	it('the registered repo for the request\'s cwd wins over its own envRepo pin -- the canonical precedence, not envRepo-first', async () => {
		const reviewId = `review-precedence-${process.pid}-${Date.now()}`;
		const repoB = mkdtempSync(join(tmpdir(), 'insrc-reconciliation-repob-'));
		const repoA = mkdtempSync(join(tmpdir(), 'insrc-reconciliation-repoa-'));
		const dirB = join(repoB, '.insrc/tmp', reviewId);
		const auditTrailB = JSON.stringify({ note: 'repo B audit trail -- must win' });
		mkdirSync(dirB, { recursive: true });
		writeFileSync(join(dirB, 'audit-trail.json'), auditTrailB, 'utf8');
		// Deliberately no matching .insrc/tmp/<reviewId>/ under repoA: if resolution fell
		// through to envRepo instead of the registered cwd match, the read would find nothing.

		const requestCwd = join(repoB, 'some', 'nested', 'dir');
		mkdirSync(requestCwd, { recursive: true });
		_setResolveForCwdForTests(async (cwd) => (cwd === requestCwd ? repoB : null));
		try {
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify });

			await runInStepContext({ cwd: requestCwd, envRepo: repoA }, () =>
				reconcileRound(reviewId, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]));

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.repoRoot, repoB, 'the registered repo for cwd must be used as the resolved root, not envRepo');
			assert.equal(calls[0]!.auditTrail, auditTrailB, 'repo B\'s audit trail must be read, not repo A\'s (envRepo), even though cwd is only a subdirectory of B');
		} finally {
			_setResolveForCwdForTests(undefined);
			rmSync(repoB, { recursive: true, force: true });
			rmSync(repoA, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

	it('when neither a registered repo for cwd nor an envRepo/INSRC_REPO pin resolves, reconcileRound rejects rather than silently defaulting to cwd', async () => {
		const previousRepo = process.env.INSRC_REPO;
		delete process.env.INSRC_REPO;
		_setResolveForCwdForTests(async () => null);
		try {
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify });

			await assert.rejects(
				() => runInStepContext({ cwd: mkdtempSync(join(tmpdir(), 'insrc-reconciliation-unresolved-')) }, () =>
					reconcileRound(`review-unresolved-${process.pid}-${Date.now()}`, [finding('f1')], [])),
				/could not resolve the reviewed repository/,
				'with nothing resolving, reconcileRound must reject rather than quietly using the daemon\'s own cwd',
			);
			assert.equal(calls.length, 0, 'classify must never run once repo resolution has failed');
		} finally {
			if (previousRepo === undefined) delete process.env.INSRC_REPO; else process.env.INSRC_REPO = previousRepo;
			_setResolveForCwdForTests(undefined);
			_setReconciliationDepsForTests({});
		}
	});

	// --- Symlink containment: both an escape outside .insrc/tmp entirely, and an
	// alias to a SIBLING review's own genuine directory/file within it. ---

	it('a symlinked review directory pointing outside .insrc/tmp is not followed -- its audit trail is never read', async () => {
		const reviewId = `review-symlinkdir-${process.pid}-${Date.now()}`;
		const secretDir = mkdtempSync(join(tmpdir(), 'insrc-reconciliation-secret-'));
		const secretContent = JSON.stringify({ note: 'secret outside .insrc/tmp' });
		writeFileSync(join(secretDir, 'audit-trail.json'), secretContent, 'utf8');

		const tmpRoot = join(ROOT, '.insrc/tmp');
		mkdirSync(tmpRoot, { recursive: true });
		const reviewDir = join(tmpRoot, reviewId);
		symlinkSync(secretDir, reviewDir, 'dir');

		try {
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify, resolveRepoRoot });

			await reconcileRound(reviewId, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, undefined, 'a symlinked review directory escaping .insrc/tmp must never have its content read');
		} finally {
			rmSync(reviewDir, { force: true });
			rmSync(secretDir, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

	it('a symlinked audit-trail.json pointing outside .insrc/tmp is not followed -- its target content is never read', async () => {
		const reviewId = `review-symlinkfile-${process.pid}-${Date.now()}`;
		const secretDir = mkdtempSync(join(tmpdir(), 'insrc-reconciliation-secretfile-'));
		const secretContent = JSON.stringify({ note: 'secret file outside .insrc/tmp' });
		const secretFile = join(secretDir, 'secret.json');
		writeFileSync(secretFile, secretContent, 'utf8');

		const reviewDir = join(ROOT, '.insrc/tmp', reviewId);
		mkdirSync(reviewDir, { recursive: true });
		symlinkSync(secretFile, join(reviewDir, 'audit-trail.json'), 'file');

		try {
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify, resolveRepoRoot });

			await reconcileRound(reviewId, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, undefined, 'a symlinked audit-trail.json escaping .insrc/tmp must never have its target content read');
		} finally {
			rmSync(reviewDir, { recursive: true, force: true });
			rmSync(secretDir, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

	it('review A\'s own directory aliased (via symlink) to sibling review B\'s genuine directory is rejected -- B\'s audit trail never reaches A\'s classification', async () => {
		const reviewIdB = `review-siblingdir-b-${process.pid}-${Date.now()}`;
		const reviewIdA = `review-siblingdir-a-${process.pid}-${Date.now()}`;
		const tmpRoot = join(ROOT, '.insrc/tmp');
		mkdirSync(tmpRoot, { recursive: true });
		const dirB = join(tmpRoot, reviewIdB);
		const dirA = join(tmpRoot, reviewIdA);
		const auditTrailB = JSON.stringify({ note: 'sibling review B\'s own genuine audit trail' });
		mkdirSync(dirB, { recursive: true });
		writeFileSync(join(dirB, 'audit-trail.json'), auditTrailB, 'utf8');
		// review A's own directory IS a symlink, but to a SIBLING's genuine directory --
		// still legitimately inside .insrc/tmp, so a root-containment check alone would pass it.
		symlinkSync(dirB, dirA, 'dir');

		try {
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify, resolveRepoRoot });

			await reconcileRound(reviewIdA, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, undefined, 'review A must never receive review B\'s audit trail through a directory alias');
		} finally {
			rmSync(dirA, { force: true });
			rmSync(dirB, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

	it('review A\'s own audit-trail.json aliased (via symlink) to sibling review B\'s genuine audit-trail.json is rejected', async () => {
		const reviewIdB = `review-siblingfile-b-${process.pid}-${Date.now()}`;
		const reviewIdA = `review-siblingfile-a-${process.pid}-${Date.now()}`;
		const tmpRoot = join(ROOT, '.insrc/tmp');
		const dirB = join(tmpRoot, reviewIdB);
		const dirA = join(tmpRoot, reviewIdA);
		const auditTrailB = JSON.stringify({ note: 'sibling review B\'s own genuine audit trail' });
		mkdirSync(dirB, { recursive: true });
		mkdirSync(dirA, { recursive: true });
		writeFileSync(join(dirB, 'audit-trail.json'), auditTrailB, 'utf8');
		// review A's own directory is genuine; only its audit-trail.json is a symlink to B's.
		symlinkSync(join(dirB, 'audit-trail.json'), join(dirA, 'audit-trail.json'), 'file');

		try {
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify, resolveRepoRoot });

			await reconcileRound(reviewIdA, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, undefined, 'review A must never receive review B\'s audit trail through a file alias');
		} finally {
			rmSync(dirA, { recursive: true, force: true });
			rmSync(dirB, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});
});
