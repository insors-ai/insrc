/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _readThroughPinnedLeafForTests, _setCheckpointDepsForTests, finalizeAndCleanup, readCheckpoint, writeCheckpoint } from '../checkpoint.js';
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
		const finalOutput = { reviewId, findings: ['f1'] };
		let tempDirExistedWhenCopyRan: boolean | undefined;
		// A spy, not a stand-in: it observes whether tempDir still exists at the
		// instant it's called (proving copy genuinely precedes delete, not just
		// that both end states happen to hold), then performs the real durable
		// write itself, so the deletion that follows is for real too.
		_setCheckpointDepsForTests({
			resolveRepoRoot,
			writeDurableCopy: (repoRoot, id, output) => {
				tempDirExistedWhenCopyRan = existsSync(tempDir);
				mkdirSync(dirname(durablePath), { recursive: true });
				writeFileSync(durablePath, JSON.stringify(output), 'utf8');
				void repoRoot; void id;
			},
		});

		try {
			await finalizeAndCleanup(reviewId, finalOutput);
			assert.equal(tempDirExistedWhenCopyRan, true, 'the temp folder must still exist at the moment the durable copy runs -- proving copy genuinely precedes delete, not merely that both end states hold');
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
		const nestedDir = join(tempDir, 'rounds', 'round-1');
		mkdirSync(nestedDir, { recursive: true });
		writeFileSync(join(tempDir, 'round-1-output.json'), JSON.stringify({ findings: [] }), 'utf8');
		// A nested subdirectory, several levels deep -- the gate caught that the
		// first emptyDirectoryContents implementation only pinned the TOP-level
		// directory, leaving every NESTED directory it recursed into unpinned.
		writeFileSync(join(nestedDir, 'findings.json'), JSON.stringify({ findings: ['f1'] }), 'utf8');
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			await finalizeAndCleanup(reviewId, { reviewId, final: true });
			assert.equal(existsSync(durablePath), true, 'the durable copy must still be written');
			assert.equal(existsSync(tempDir), false, 'the whole temp folder, including every nested subdirectory, must be deleted, with no checkpoint.json ever required to exist');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
			rmSync(durablePath, { force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it("readCheckpoint rejects a mismatched identity: a checkpoint.json whose own reviewId field does not match the one requested is treated as though no checkpoint exists", async () => {
		const reviewId = `review-mismatch-${process.pid}-${Date.now()}`;
		const otherReviewId = `review-other-${process.pid}-${Date.now()}`;
		const dir = join(ROOT, '.insrc/tmp', reviewId);
		mkdirSync(dir, { recursive: true });
		// A record that is well-formed and passes the shape check, but whose
		// own reviewId field names a DIFFERENT review -- simulating a caller
		// bug elsewhere, or content reached via a mechanism other than this
		// review's own writeCheckpoint call.
		writeFileSync(join(dir, 'checkpoint.json'), JSON.stringify({ reviewId: otherReviewId, lastCompletedUnit: { kind: 'task', ref: 't9' } }), 'utf8');
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			const result = await readCheckpoint(reviewId);
			assert.equal(result, undefined, "a mismatched reviewId must never be handed back as though it were this review's own progress");
		} finally {
			rmSync(dir, { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it('readCheckpoint never follows a symlinked checkpoint.json into another review\'s own record, even when the symlinked record is well-formed and would otherwise pass every other check', async () => {
		const victimReviewId = `review-victim-${process.pid}-${Date.now()}`;
		const realDir = join(ROOT, '.insrc/tmp', `review-real-${process.pid}-${Date.now()}`);
		mkdirSync(realDir, { recursive: true });
		const realPath = join(realDir, 'checkpoint.json');
		// The symlinked-at record deliberately carries victimReviewId -- the
		// READER's OWN requested id -- as its reviewId field, so the separate
		// reviewId-match check alone (without a symlink check) would NOT catch
		// this: isolating what the symlink defense specifically must catch.
		writeFileSync(realPath, JSON.stringify({ reviewId: victimReviewId, lastCompletedUnit: { kind: 'round', ref: 7 } }), 'utf8');

		const victimDir = join(ROOT, '.insrc/tmp', victimReviewId);
		mkdirSync(victimDir, { recursive: true });
		symlinkSync(realPath, join(victimDir, 'checkpoint.json'), 'file');

		_setCheckpointDepsForTests({ resolveRepoRoot });
		try {
			const result = await readCheckpoint(victimReviewId);
			assert.equal(result, undefined, "a symlinked checkpoint.json must never be followed into another review's own record, regardless of what that record itself claims");
		} finally {
			rmSync(realDir, { recursive: true, force: true });
			rmSync(victimDir, { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it('readCheckpoint never returns a substituted record even when the original checkpoint already existed and the substitution carries the same identity as both the requested reviewId and the checkpoint it replaced', async () => {
		const reviewId = `review-substituted-${process.pid}-${Date.now()}`;
		const dir = join(ROOT, '.insrc/tmp', reviewId);
		const path = join(dir, 'checkpoint.json');
		mkdirSync(dir, { recursive: true });
		// A genuine prior checkpoint exists first, exactly as a real resumed
		// review would leave one -- round 1.
		writeFileSync(path, JSON.stringify({ reviewId, lastCompletedUnit: { kind: 'round', ref: 1 } }), 'utf8');

		const outsideDir = mkdtempSync(join(tmpdir(), 'insrc-checkpoint-substituted-'));
		const outsidePath = join(outsideDir, 'checkpoint.json');
		// The substituted record carries the SAME reviewId as the one being
		// requested (and as the checkpoint it replaced) -- a record that would
		// pass the identity check on its own content alone, isolating what
		// only reading through an O_NOFOLLOW-opened, pinned descriptor (never
		// a second, separately resolved readFileSync(path)) can actually catch.
		writeFileSync(outsidePath, JSON.stringify({ reviewId, lastCompletedUnit: { kind: 'round', ref: 77 } }), 'utf8');
		rmSync(path, { force: true });
		symlinkSync(outsidePath, path, 'file');

		_setCheckpointDepsForTests({ resolveRepoRoot });
		try {
			const result = await readCheckpoint(reviewId);
			assert.equal(result, undefined, 'a checkpoint substituted after it already existed must never be read, even with a matching identity -- round 77 must never surface in place of the refused read');
		} finally {
			rmSync(dir, { recursive: true, force: true });
			rmSync(outsideDir, { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it('readThroughPinnedLeaf refuses a symlink already occupying the destination, proven directly -- readCheckpoint\'s own pinDirectoryChain call would otherwise refuse before ever reaching this, the exact state a symlink substituted after that last check would leave behind', () => {
		const dir = mkdtempSync(join(tmpdir(), 'insrc-checkpoint-leafread-'));
		const outsidePath = join(dir, 'outside.json');
		const content = JSON.stringify({ reviewId: 'review-outside', lastCompletedUnit: { kind: 'round', ref: 77 } });
		writeFileSync(outsidePath, content, 'utf8');
		symlinkSync(outsidePath, join(dir, 'checkpoint.json'), 'file');

		try {
			assert.throws(
				() => _readThroughPinnedLeafForTests(dir, 'checkpoint.json'),
				/ELOOP|EMLINK/,
				'a symlink occupying the exact file name must be refused by the open itself, never followed and read',
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('readCheckpoint resolves to undefined, rather than rejecting, when the review directory itself is a symlink -- an ancestor-symlink failure is treated the same as an absent checkpoint, allowing a fresh start instead of aborting recovery', async () => {
		const reviewId = `review-ancestorsymlink-${process.pid}-${Date.now()}`;
		const tmpRoot = join(ROOT, '.insrc/tmp');
		mkdirSync(tmpRoot, { recursive: true });
		const outsideDir = mkdtempSync(join(tmpdir(), 'insrc-checkpoint-ancestorsymlink-'));
		writeFileSync(join(outsideDir, 'checkpoint.json'), JSON.stringify({ reviewId, lastCompletedUnit: { kind: 'round', ref: 77 } }), 'utf8');
		const linkPath = join(tmpRoot, reviewId);
		symlinkSync(outsideDir, linkPath, 'dir');

		_setCheckpointDepsForTests({ resolveRepoRoot });
		try {
			const result = await readCheckpoint(reviewId);
			assert.equal(result, undefined, 'a symlinked ancestor (the review directory itself) must resolve to undefined -- never a rejection that aborts recovery, and never the outside content either');
		} finally {
			rmSync(linkPath, { force: true });
			rmSync(outsideDir, { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});

	it('a review directory replaced by a symlink during the narrow window between writeCheckpoint\'s/finalizeAndCleanup\'s own checks and their actual use is never written through or deleted through outside the repository (best-effort concurrent regression)', async () => {
		const reviewId = `review-race-${process.pid}-${Date.now()}`;
		const reviewDirPath = join(ROOT, '.insrc/tmp', reviewId);
		const outsideDir = mkdtempSync(join(tmpdir(), 'insrc-checkpoint-race-'));
		_setCheckpointDepsForTests({ resolveRepoRoot });

		// A background process races to replace reviewDirPath with a symlink to
		// outsideDir as fast as it can, for a short bounded window -- a
		// best-effort probe for the externally-reported ancestor-substitution
		// race. pinDirectoryChain (checkpoint.ts) closes this structurally on
		// Linux by binding every operation to each ancestor's own pinned fd,
		// never re-resolving a mutable name once pinned; on a platform with no
		// /proc, the same best-effort, narrowed-not-eliminated gap as before
		// remains, documented as a platform limitation. Absence of a detected
		// escape within this bounded window is not a formal proof, only that
		// no violation was observed in however many attempts this window
		// allowed.
		const racer = spawn(process.execPath, ['-e', `
			const fs = require('node:fs');
			const target = ${JSON.stringify(reviewDirPath)};
			const outside = ${JSON.stringify(outsideDir)};
			const end = Date.now() + 600;
			while (Date.now() < end) {
				try { fs.rmSync(target, { recursive: true, force: true }); } catch {}
				try { fs.symlinkSync(outside, target, 'dir'); } catch {}
			}
		`], { stdio: 'ignore' });

		try {
			const deadline = Date.now() + 600;
			while (Date.now() < deadline) {
				try { await writeCheckpoint(reviewId, { kind: 'round', ref: 1 }); } catch { /* a refusal is a safe outcome too */ }
				try {
					const read = await readCheckpoint(reviewId);
					if (read !== undefined) assert.equal(read.reviewId, reviewId, 'a read that returns a record at all must never return one naming a different reviewId -- a sign it was read through a redirected location');
				} catch { /* a refusal is a safe outcome too */ }
				try { await finalizeAndCleanup(reviewId, { reviewId }); } catch { /* a refusal is a safe outcome too */ }
			}
			assert.equal(existsSync(join(outsideDir, 'checkpoint.json')), false, 'no checkpoint must ever land inside the symlink target outside the repository');
			const durablePath = join(ROOT, '.insrc/artifacts', `REVIEW-${reviewId}.json`);
			rmSync(durablePath, { force: true });
		} finally {
			racer.kill();
			rmSync(reviewDirPath, { force: true });
			rmSync(outsideDir, { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});
});
