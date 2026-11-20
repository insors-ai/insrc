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
		_setReconciliationDepsForTests({ classify });

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
			_setReconciliationDepsForTests({ classify });

			await reconcileRound(reviewId, [finding('prior-1', 'correctness', 'HIGH')], [finding('other-1', 'correctness', 'HIGH')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, auditTrailContent, 'a category+severity coincidence must still be ambiguous enough to read the audit trail');
		} finally {
			rmSync(dir, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

	it('outside any bound request, the audit trail and the classification provider fall back to the process\'s own INSRC_REPO, not its cwd', async () => {
		const reviewId = `review-repo-${process.pid}-${Date.now()}`;
		const pinnedRepo = mkdtempSync(join(tmpdir(), 'insrc-reconciliation-repo-'));
		const dir = join(pinnedRepo, '.insrc/tmp', reviewId);
		const auditTrailContent = JSON.stringify({ note: 'pinned-repo audit trail' });
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'audit-trail.json'), auditTrailContent, 'utf8');

		const previousRepo = process.env.INSRC_REPO;
		process.env.INSRC_REPO = pinnedRepo;
		try {
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify });

			await reconcileRound(reviewId, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, auditTrailContent, 'the audit trail must be read from INSRC_REPO\'s .insrc/tmp/<reviewId>/, not the process cwd, when INSRC_REPO is pinned to a different repository');
		} finally {
			if (previousRepo === undefined) delete process.env.INSRC_REPO; else process.env.INSRC_REPO = previousRepo;
			rmSync(pinnedRepo, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

	it('a bound request\'s own repository wins over a process-wide INSRC_REPO pin -- repo resolution is per-request, not process-global', async () => {
		const reviewId = `review-perreq-${process.pid}-${Date.now()}`;
		const globalPinRepo = mkdtempSync(join(tmpdir(), 'insrc-reconciliation-global-'));
		const requestRepo = mkdtempSync(join(tmpdir(), 'insrc-reconciliation-request-'));
		const requestDir = join(requestRepo, '.insrc/tmp', reviewId);
		const requestAuditTrail = JSON.stringify({ note: 'request-repo audit trail, must win over the global pin' });
		mkdirSync(requestDir, { recursive: true });
		writeFileSync(join(requestDir, 'audit-trail.json'), requestAuditTrail, 'utf8');
		// Deliberately do NOT create a matching .insrc/tmp/<reviewId>/ under globalPinRepo:
		// if resolution fell through to the global pin, the read would simply find nothing.

		const previousRepo = process.env.INSRC_REPO;
		process.env.INSRC_REPO = globalPinRepo;
		try {
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify });

			await runInStepContext({ cwd: requestRepo, envRepo: requestRepo }, () =>
				reconcileRound(reviewId, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]));

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, requestAuditTrail, 'the bound request\'s own repo must be used, not the process-wide INSRC_REPO pin');
		} finally {
			if (previousRepo === undefined) delete process.env.INSRC_REPO; else process.env.INSRC_REPO = previousRepo;
			rmSync(globalPinRepo, { recursive: true, force: true });
			rmSync(requestRepo, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

	it('a bound request\'s own cwd is used even with no envRepo and no global INSRC_REPO pin -- never the daemon process\'s own cwd', async () => {
		const reviewId = `review-perreqcwd-${process.pid}-${Date.now()}`;
		const requestRepo = mkdtempSync(join(tmpdir(), 'insrc-reconciliation-request-cwd-'));
		const requestDir = join(requestRepo, '.insrc/tmp', reviewId);
		const requestAuditTrail = JSON.stringify({ note: 'request-cwd audit trail' });
		mkdirSync(requestDir, { recursive: true });
		writeFileSync(join(requestDir, 'audit-trail.json'), requestAuditTrail, 'utf8');

		const previousRepo = process.env.INSRC_REPO;
		delete process.env.INSRC_REPO;
		try {
			const { classify, calls } = stubClassify(['still-open']);
			_setReconciliationDepsForTests({ classify });

			await runInStepContext({ cwd: requestRepo }, () =>
				reconcileRound(reviewId, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]));

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, requestAuditTrail, 'the bound request\'s own cwd must be used, not the daemon process\'s own cwd');
		} finally {
			if (previousRepo === undefined) delete process.env.INSRC_REPO; else process.env.INSRC_REPO = previousRepo;
			rmSync(requestRepo, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});

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
			_setReconciliationDepsForTests({ classify });

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
			_setReconciliationDepsForTests({ classify });

			await reconcileRound(reviewId, [finding('f1', 'correctness', 'HIGH')], [finding('f2', 'security', 'MED')]);

			assert.equal(calls.length, 1);
			assert.equal(calls[0]!.auditTrail, undefined, 'a symlinked audit-trail.json escaping .insrc/tmp must never have its target content read');
		} finally {
			rmSync(reviewDir, { recursive: true, force: true });
			rmSync(secretDir, { recursive: true, force: true });
			_setReconciliationDepsForTests({});
		}
	});
});
