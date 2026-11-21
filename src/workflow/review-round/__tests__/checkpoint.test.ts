/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _setCheckpointDepsForTests, finalizeAndCleanup, readCheckpoint, writeCheckpoint } from '../checkpoint.js';
import type { ReviewCheckpoint } from '../checkpoint.js';
import { _setResolveForCwdForTests } from '../../../daemon/steps/resolve-repo.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const FIXTURE = 'src/workflow/review-round/__type-tests__/checkpoint.typecheck.ts';

/**
 * tsconfig.json excludes `__type-tests__` from the main build, so this runs tsc itself against
 * a throwaway project that extends the root config with just the fixture included.
 */
function typecheckFixture(): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-checkpoint-typecheck-'));
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

/** The resolveRepoRoot dep every test not specifically exercising repo resolution itself injects. */
const resolveRepoRoot = async (): Promise<string> => ROOT;

describe('writeCheckpoint/readCheckpoint/finalizeAndCleanup and ReviewCheckpoint', () => {
	it('writeCheckpoint writes a ReviewCheckpoint JSON record to .insrc/tmp/<reviewId>/checkpoint.json containing exactly {reviewId, lastCompletedUnit}, overwriting any prior checkpoint for the same reviewId', async () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);

		const reviewId = `review-t1-${process.pid}-${Date.now()}`;
		const path = join(ROOT, '.insrc/tmp', reviewId, 'checkpoint.json');
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			await writeCheckpoint(reviewId, { kind: 'round', ref: 1 });
			const first: ReviewCheckpoint = JSON.parse(readFileSync(path, 'utf8'));
			assert.deepEqual(first, { reviewId, lastCompletedUnit: { kind: 'round', ref: 1 } });

			await writeCheckpoint(reviewId, { kind: 'round', ref: 2 });
			const second: ReviewCheckpoint = JSON.parse(readFileSync(path, 'utf8'));
			assert.deepEqual(second, { reviewId, lastCompletedUnit: { kind: 'round', ref: 2 } }, 'the second write must overwrite the first, not accumulate a history');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', reviewId), { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it('readCheckpoint resolves to undefined when no checkpoint file exists yet for a reviewId, rather than throwing', async () => {
		const reviewId = `review-nocheckpoint-${process.pid}-${Date.now()}`;
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			const result = await readCheckpoint(reviewId);
			assert.equal(result, undefined, 'a reviewId with no checkpoint.json yet must resolve to undefined, not throw');
		} finally {
			_setCheckpointDepsForTests({});
		}
	});

	it("readCheckpoint resolves to the last-written ReviewCheckpoint after writeCheckpoint has been called, so a resumed review can continue from lastCompletedUnit rather than re-running completed units", async () => {
		const reviewId = `review-resume-${process.pid}-${Date.now()}`;
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			await writeCheckpoint(reviewId, { kind: 'task', ref: 't3' });
			const result = await readCheckpoint(reviewId);
			assert.deepEqual(result, { reviewId, lastCompletedUnit: { kind: 'task', ref: 't3' } }, 'readCheckpoint must resolve to exactly the last-written record');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', reviewId), { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it("readCheckpoint's own reviewId field, read back from the checkpoint record, is exactly the identity k8 requires -- the same string as both the temp folder name and the record's own content", async () => {
		const reviewId = `review-identity-${process.pid}-${Date.now()}`;
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			await writeCheckpoint(reviewId, { kind: 'round', ref: 2 });
			assert.equal(existsSync(join(ROOT, '.insrc/tmp', reviewId)), true, 'the folder named exactly reviewId must exist');
			const result = await readCheckpoint(reviewId);
			assert.equal(result?.reviewId, reviewId, "the checkpoint record's own reviewId field must be the identical string naming the temp folder");
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', reviewId), { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it("finalizeAndCleanup copies finalOutput into durable artifact storage before deleting the .insrc/tmp/<reviewId>/ folder, in that order", async () => {
		const reviewId = `review-finalize-${process.pid}-${Date.now()}`;
		const tempDir = join(ROOT, '.insrc/tmp', reviewId);
		const durablePath = join(ROOT, '.insrc/artifacts', `REVIEW-${reviewId}.json`);
		mkdirSync(tempDir, { recursive: true });
		writeFileSync(join(tempDir, 'checkpoint.json'), JSON.stringify({ reviewId, lastCompletedUnit: { kind: 'round', ref: 1 } }));
		_setCheckpointDepsForTests({ resolveRepoRoot });
		const finalOutput = { reviewId, findings: ['f1'] };

		try {
			await finalizeAndCleanup(reviewId, finalOutput);
			assert.deepEqual(JSON.parse(readFileSync(durablePath, 'utf8')), finalOutput, 'the durable copy must contain exactly finalOutput');
			assert.equal(existsSync(tempDir), false, 'the temp folder must be deleted once the durable copy has been written');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
			rmSync(durablePath, { force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it("if finalizeAndCleanup's durable copy write fails, the .insrc/tmp/<reviewId>/ folder is not deleted", async () => {
		const reviewId = `review-finalizefail-${process.pid}-${Date.now()}`;
		const tempDir = join(ROOT, '.insrc/tmp', reviewId);
		mkdirSync(tempDir, { recursive: true });
		writeFileSync(join(tempDir, 'checkpoint.json'), JSON.stringify({ reviewId, lastCompletedUnit: { kind: 'round', ref: 1 } }));
		const failure = new Error('disk full');
		_setCheckpointDepsForTests({ resolveRepoRoot, writeDurableCopy: () => { throw failure; } });

		try {
			await assert.rejects(
				() => finalizeAndCleanup(reviewId, { reviewId }),
				(err: unknown) => err === failure,
				'the durable-copy rejection must propagate unchanged',
			);
			assert.equal(existsSync(tempDir), true, 'the temp folder must survive a durable-copy failure, preserving k7\'s ordering');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it("finalizeAndCleanup is idempotent: calling it a second time for a reviewId whose temp folder was already deleted by an earlier successful call succeeds without error", async () => {
		const reviewId = `review-idempotent-${process.pid}-${Date.now()}`;
		const tempDir = join(ROOT, '.insrc/tmp', reviewId);
		const durablePath = join(ROOT, '.insrc/artifacts', `REVIEW-${reviewId}.json`);
		mkdirSync(tempDir, { recursive: true });
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			await finalizeAndCleanup(reviewId, { reviewId, attempt: 1 });
			assert.equal(existsSync(tempDir), false);
			await assert.doesNotReject(
				() => finalizeAndCleanup(reviewId, { reviewId, attempt: 2 }),
				'a second call for an already-cleaned-up reviewId must succeed, not throw',
			);
			assert.deepEqual(JSON.parse(readFileSync(durablePath, 'utf8')), { reviewId, attempt: 2 }, 'the second call\'s durable overwrite must be the one that stands');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
			rmSync(durablePath, { force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it('writeCheckpoint called repeatedly for the same reviewId overwrites the prior checkpoint rather than accumulating a history', async () => {
		const reviewId = `review-repeated-${process.pid}-${Date.now()}`;
		const path = join(ROOT, '.insrc/tmp', reviewId, 'checkpoint.json');
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			await writeCheckpoint(reviewId, { kind: 'round', ref: 1 });
			await writeCheckpoint(reviewId, { kind: 'round', ref: 2 });
			await writeCheckpoint(reviewId, { kind: 'task', ref: 't5' });
			const raw = readFileSync(path, 'utf8');
			assert.deepEqual(JSON.parse(raw), { reviewId, lastCompletedUnit: { kind: 'task', ref: 't5' } }, 'only the single most recent checkpoint must be kept');
			assert.equal(raw.trim().startsWith('['), false, 'the file must never become an array / growing history');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', reviewId), { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it('a reviewId containing a path-traversal segment is rejected before any filesystem access, for writeCheckpoint, readCheckpoint, and finalizeAndCleanup alike', async () => {
		let repoRootResolved = false;
		_setCheckpointDepsForTests({ resolveRepoRoot: async () => { repoRootResolved = true; return ROOT; } });

		try {
			await assert.rejects(() => writeCheckpoint('../../../private', { kind: 'round', ref: 1 }), /invalid reviewId/);
			await assert.rejects(() => readCheckpoint('../../../private'), /invalid reviewId/);
			await assert.rejects(() => finalizeAndCleanup('../../../private', {}), /invalid reviewId/);
			assert.equal(repoRootResolved, false, 'reviewId validation must run before the repository is even resolved, for every function');
		} finally {
			_setCheckpointDepsForTests({});
		}
	});

	it("when the reviewed repository cannot be resolved, writeCheckpoint/readCheckpoint/finalizeAndCleanup reject rather than silently defaulting to the daemon process's own cwd", async () => {
		const previousRepo = process.env.INSRC_REPO;
		delete process.env.INSRC_REPO;
		_setResolveForCwdForTests(async () => null);
		_setCheckpointDepsForTests({});

		try {
			await assert.rejects(() => writeCheckpoint('review-unresolved', { kind: 'round', ref: 1 }), /could not resolve the reviewed repository/);
			await assert.rejects(() => readCheckpoint('review-unresolved'), /could not resolve the reviewed repository/);
			await assert.rejects(() => finalizeAndCleanup('review-unresolved', {}), /could not resolve the reviewed repository/);
		} finally {
			if (previousRepo === undefined) delete process.env.INSRC_REPO; else process.env.INSRC_REPO = previousRepo;
			_setResolveForCwdForTests(undefined);
			_setCheckpointDepsForTests({});
		}
	});

	it('a symlinked review directory or checkpoint file is never written through by writeCheckpoint, even outside .insrc/tmp', async () => {
		const reviewIdDir = `review-symlinkdir-${process.pid}-${Date.now()}`;
		const outsideDir = mkdtempSync(join(tmpdir(), 'insrc-checkpoint-outside-'));
		const tmpRoot = join(ROOT, '.insrc/tmp');
		mkdirSync(tmpRoot, { recursive: true });
		const dirLinkPath = join(tmpRoot, reviewIdDir);
		symlinkSync(outsideDir, dirLinkPath, 'dir');

		const reviewIdFile = `review-symlinkfile-${process.pid}-${Date.now()}`;
		const reviewDir = join(tmpRoot, reviewIdFile);
		mkdirSync(reviewDir, { recursive: true });
		const externalFile = join(mkdtempSync(join(tmpdir(), 'insrc-checkpoint-external-')), 'victim.txt');
		const originalContent = 'do not overwrite me';
		writeFileSync(externalFile, originalContent, 'utf8');
		symlinkSync(externalFile, join(reviewDir, 'checkpoint.json'), 'file');

		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			await assert.rejects(
				() => writeCheckpoint(reviewIdDir, { kind: 'round', ref: 1 }),
				/is a symlink/,
				'a symlinked review directory must be rejected, never written through',
			);
			assert.equal(existsSync(join(outsideDir, 'checkpoint.json')), false, 'no file must ever land in the symlink target outside the repository');

			await assert.rejects(
				() => writeCheckpoint(reviewIdFile, { kind: 'round', ref: 1 }),
				/is a symlink/,
				'a symlinked checkpoint.json file must be rejected, never written through',
			);
			assert.equal(readFileSync(externalFile, 'utf8'), originalContent, 'the external file the symlink pointed to must be left untouched');
		} finally {
			rmSync(dirLinkPath, { force: true });
			rmSync(outsideDir, { recursive: true, force: true });
			rmSync(reviewDir, { recursive: true, force: true });
			rmSync(dirname(externalFile), { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it('a symlinked .insrc/tmp/<reviewId>/ directory is never deleted through by finalizeAndCleanup', async () => {
		const reviewId = `review-symlinkdelete-${process.pid}-${Date.now()}`;
		const outsideDir = mkdtempSync(join(tmpdir(), 'insrc-checkpoint-outside-delete-'));
		const sentinelPath = join(outsideDir, 'sentinel.txt');
		writeFileSync(sentinelPath, 'do not delete me', 'utf8');
		const tmpRoot = join(ROOT, '.insrc/tmp');
		mkdirSync(tmpRoot, { recursive: true });
		const linkPath = join(tmpRoot, reviewId);
		symlinkSync(outsideDir, linkPath, 'dir');
		const durablePath = join(ROOT, '.insrc/artifacts', `REVIEW-${reviewId}.json`);
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			await assert.rejects(
				() => finalizeAndCleanup(reviewId, { reviewId }),
				/is a symlink/,
				'a symlinked temp folder must be rejected, never deleted through',
			);
			assert.equal(existsSync(sentinelPath), true, 'the symlink target\'s own contents must survive, since the delete must never follow the link');
		} finally {
			rmSync(linkPath, { force: true });
			rmSync(outsideDir, { recursive: true, force: true });
			rmSync(durablePath, { force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it("a checkpoint.json file that is not valid JSON, or does not match ReviewCheckpoint's shape, is treated by readCheckpoint as though no checkpoint exists, rather than throwing or returning unvalidated data", async () => {
		const reviewIdA = `review-badjson-${process.pid}-${Date.now()}`;
		const dirA = join(ROOT, '.insrc/tmp', reviewIdA);
		mkdirSync(dirA, { recursive: true });
		writeFileSync(join(dirA, 'checkpoint.json'), '{not valid json', 'utf8');

		const reviewIdB = `review-badshape-${process.pid}-${Date.now()}`;
		const dirB = join(ROOT, '.insrc/tmp', reviewIdB);
		mkdirSync(dirB, { recursive: true });
		writeFileSync(join(dirB, 'checkpoint.json'), JSON.stringify({ reviewId: reviewIdB, lastCompletedUnit: { kind: 'phase', ref: 1 } }), 'utf8');

		_setCheckpointDepsForTests({ resolveRepoRoot });
		try {
			assert.equal(await readCheckpoint(reviewIdA), undefined, 'invalid JSON must be treated as no checkpoint, never thrown');
			assert.equal(await readCheckpoint(reviewIdB), undefined, 'a parsed value with the wrong shape must be treated as no checkpoint, never returned unvalidated');
		} finally {
			rmSync(dirA, { recursive: true, force: true });
			rmSync(dirB, { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it('finalizeAndCleanup succeeds even when checkpoint.json was never written at all, deleting whatever the .insrc/tmp/<reviewId>/ folder currently contains as a whole', async () => {
		const reviewId = `review-nocheckpointfinalize-${process.pid}-${Date.now()}`;
		const tempDir = join(ROOT, '.insrc/tmp', reviewId);
		const durablePath = join(ROOT, '.insrc/artifacts', `REVIEW-${reviewId}.json`);
		mkdirSync(tempDir, { recursive: true });
		writeFileSync(join(tempDir, 'round-1-output.json'), JSON.stringify({ findings: [] }), 'utf8');
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			await finalizeAndCleanup(reviewId, { reviewId, final: true });
			assert.equal(existsSync(durablePath), true, 'the durable copy must still be written');
			assert.equal(existsSync(tempDir), false, 'the whole temp folder must be deleted, with no checkpoint.json ever required to exist');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
			rmSync(durablePath, { force: true });
			_setCheckpointDepsForTests({});
		}
	});
});
