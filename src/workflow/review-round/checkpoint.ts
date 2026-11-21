/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review checkpoint record (HLD sc5, owned by this Story): a generic JSON
 * side-record under each review's own .insrc/tmp/<reviewId>/ folder, written
 * automatically once per completed round or Task (ac1), read back to resume
 * only the in-flight unit of work after a crash (ac2), and finalized by
 * copying the final round's output into durable storage before the scratch
 * folder is deleted (ac3). reviewId is the sole identity (ac4, k8): the same
 * bare string names both the temp folder and the checkpoint record's own
 * reviewId field, exactly as runReviewRound (driver.ts) and the other
 * review-round/ modules already use it -- no ReviewContext type exists
 * anywhere in this codebase to carry that field instead (confirmed directly
 * against the real graph during this Story's design phase).
 *
 * Checkpoint granularity (round vs Task) is never decided here: the caller
 * (s1's round-driver) supplies lastCompletedUnit.kind from its own
 * RoundDriverHooks.checkpointGranularity (sc1); this module stays a dumb,
 * generic side-record, per sc5's own boundary note.
 */

import {
	closeSync, constants as fsConstants, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

import { resolveRepoPath } from '../../daemon/steps/resolve-repo.js';

/** sc5's HLD interfaceSketch, unmodified. */
export interface ReviewCheckpoint {
	readonly reviewId:          string;
	readonly lastCompletedUnit: { readonly kind: 'round' | 'task'; readonly ref: number | string };
}

/** Injectable for tests (matching reconciliation.ts's and review-report.ts's own
 *  _set*DepsForTests convention). `resolveRepoRoot` is resolved once per call;
 *  `writeDurableCopy` is finalizeAndCleanup's durable-persistence step, overridable
 *  so unit tests never touch a real daemon client or real durable artifact storage. */
export interface CheckpointDeps {
	readonly resolveRepoRoot?:   (() => Promise<string>) | undefined;
	readonly writeDurableCopy?: ((repoRoot: string, reviewId: string, finalOutput: unknown) => void) | undefined;
}

let testDeps: CheckpointDeps = {};

/** Test seam: inject the repo-resolution and the durable-copy step; no argument resets. */
export function _setCheckpointDepsForTests(deps: CheckpointDeps = {}): void { testDeps = deps; }

/** A literal review identifier only -- matching reconciliation.ts's and review-report.ts's
 *  own requireValidReviewId, since every function here joins reviewId into a filesystem path. */
const REVIEW_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function requireValidReviewId(reviewId: string): void {
	if (!REVIEW_ID_PATTERN.test(reviewId)) {
		throw new Error(`checkpoint: invalid reviewId ${JSON.stringify(reviewId)} -- expected a literal identifier, got a value that cannot be a path segment`);
	}
}

/** The repository the review belongs to, resolved through the one canonical
 *  precedence chain (resolveRepoPath) -- never the daemon process's own cwd. */
async function defaultResolveRepoRoot(): Promise<string> {
	const repo = await resolveRepoPath(undefined);
	if (repo === undefined) {
		throw new Error('checkpoint: could not resolve the reviewed repository (no registered repo for the request\'s cwd, and no INSRC_REPO fallback)');
	}
	return repo;
}

function reviewDir(repoRoot: string, reviewId: string): string {
	return join(repoRoot, '.insrc/tmp', reviewId);
}

function checkpointPath(repoRoot: string, reviewId: string): string {
	return join(reviewDir(repoRoot, reviewId), 'checkpoint.json');
}

/** The review's durable artifact storage location for its final output --
 *  survives after .insrc/tmp/<reviewId>/ is deleted (ac3, k7). */
function durablePath(repoRoot: string, reviewId: string): string {
	return join(repoRoot, '.insrc/artifacts', `REVIEW-${reviewId}.json`);
}

/**
 * Rejects if ANY path segment between repoRoot and the target is itself a
 * symlink -- matches review-report.ts's own requireNoSymlinkInPath verbatim
 * (lstat-based, so a dangling symlink is caught too, unlike an existsSync-gated
 * check). Walking every segment, rather than just the leaf, also catches a
 * symlinked ancestor (even .insrc/tmp or .insrc/artifacts itself).
 */
function requireNoSymlinkInPath(repoRoot: string, target: string): void {
	const rel = relative(repoRoot, target);
	let current = repoRoot;
	for (const segment of rel.split(sep)) {
		current = join(current, segment);
		let stat;
		try {
			stat = lstatSync(current);
		} catch {
			continue; // does not exist at all -- nothing to follow, safe to create
		}
		if (stat.isSymbolicLink()) {
			throw new Error(`checkpoint: ${current} is a symlink -- refusing to write through it`);
		}
	}
}

/**
 * Publishes `content` at `path` without ever reading through, following, or
 * truncating-in-place whatever currently occupies that name -- matches
 * review-report.ts's own publishGuarded verbatim (the primitive its P2 fix
 * established): a freshly created, uniquely named sibling file
 * (O_CREAT|O_EXCL|O_NOFOLLOW) is written first, then renamed onto `path`.
 * rename(2) never dereferences its destination and never writes through a
 * shared inode, so a crash mid-write can only ever leave the complete prior
 * checkpoint or the complete new one, never a partial file.
 */
function publishGuarded(path: string, content: string): void {
	const tempPath = join(dirname(path), `.checkpoint-${randomBytes(8).toString('hex')}.tmp`);
	const fd = openSync(tempPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW);
	try {
		writeFileSync(fd, content, 'utf8');
	} finally {
		closeSync(fd);
	}
	try {
		renameSync(tempPath, path);
	} catch (err) {
		try { unlinkSync(tempPath); } catch { /* best effort cleanup; the rename's own error is what matters */ }
		throw err;
	}
}

function isReviewCheckpointShape(v: unknown): v is ReviewCheckpoint {
	if (typeof v !== 'object' || v === null) return false;
	const o = v as Record<string, unknown>;
	if (typeof o['reviewId'] !== 'string') return false;
	const unit = o['lastCompletedUnit'];
	if (typeof unit !== 'object' || unit === null) return false;
	const u = unit as Record<string, unknown>;
	if (u['kind'] !== 'round' && u['kind'] !== 'task') return false;
	return typeof u['ref'] === 'number' || typeof u['ref'] === 'string';
}

/**
 * Writes this review's checkpoint, overwriting any prior one for the same
 * reviewId (ac1) -- never a growing history. Published through publishGuarded,
 * so a crash mid-write cannot leave a corrupted file behind.
 */
export async function writeCheckpoint(
	reviewId: string, lastCompletedUnit: ReviewCheckpoint['lastCompletedUnit'],
): Promise<void> {
	requireValidReviewId(reviewId);
	const resolveRepoRoot = testDeps.resolveRepoRoot ?? defaultResolveRepoRoot;
	const repoRoot = await resolveRepoRoot();
	const path = checkpointPath(repoRoot, reviewId);

	requireNoSymlinkInPath(repoRoot, path);
	mkdirSync(dirname(path), { recursive: true });
	// Re-checked after mkdirSync, matching review-report.ts's own convention;
	// publishGuarded closes the remainder, since it never checks-then-writes
	// `path` itself.
	requireNoSymlinkInPath(repoRoot, path);

	const checkpoint: ReviewCheckpoint = { reviewId, lastCompletedUnit };
	publishGuarded(path, JSON.stringify(checkpoint));
}

/**
 * Reads this review's last-written checkpoint, or undefined when none exists
 * yet (a fresh review, ac2) -- a missing OR malformed file (truncated,
 * disk-level corruption) is treated identically, never thrown: a review must
 * always still be able to resume, from the start in the worst case, rather
 * than being permanently stuck on an unreadable checkpoint.
 */
export async function readCheckpoint(reviewId: string): Promise<ReviewCheckpoint | undefined> {
	requireValidReviewId(reviewId);
	const resolveRepoRoot = testDeps.resolveRepoRoot ?? defaultResolveRepoRoot;
	const repoRoot = await resolveRepoRoot();
	const path = checkpointPath(repoRoot, reviewId);

	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	return isReviewCheckpointShape(parsed) ? parsed : undefined;
}

function defaultWriteDurableCopy(repoRoot: string, reviewId: string, finalOutput: unknown): void {
	const path = durablePath(repoRoot, reviewId);
	requireNoSymlinkInPath(repoRoot, path);
	mkdirSync(dirname(path), { recursive: true });
	requireNoSymlinkInPath(repoRoot, path);
	publishGuarded(path, JSON.stringify(finalOutput));
}

/**
 * Copies finalOutput into durable artifact storage, THEN deletes the review's
 * .insrc/tmp/<reviewId>/ folder as a whole -- never the reverse (ac3, k7): a
 * durable-copy failure leaves the temp folder intact rather than losing the
 * only copy of the review's result. Idempotent: a second call for an already
 * -cleaned-up reviewId re-runs the durable copy (harmless overwrite) and finds
 * nothing left to delete.
 */
export async function finalizeAndCleanup(reviewId: string, finalOutput: unknown): Promise<void> {
	requireValidReviewId(reviewId);
	const resolveRepoRoot = testDeps.resolveRepoRoot ?? defaultResolveRepoRoot;
	const writeDurableCopy = testDeps.writeDurableCopy ?? defaultWriteDurableCopy;
	const repoRoot = await resolveRepoRoot();

	writeDurableCopy(repoRoot, reviewId, finalOutput);

	const dir = reviewDir(repoRoot, reviewId);
	requireNoSymlinkInPath(repoRoot, dir);
	rmSync(dir, { recursive: true, force: true });
}
