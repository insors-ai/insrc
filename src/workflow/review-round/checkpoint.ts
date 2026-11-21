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
	closeSync, constants as fsConstants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync,
	rmdirSync, unlinkSync, writeFileSync,
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
 * Publishes `content` as `filename` inside `dir` without ever reading
 * through, following, or truncating-in-place whatever currently occupies
 * that name -- matches review-report.ts's own publishGuarded (the primitive
 * its P2 fix established): a freshly created, uniquely named sibling file
 * (O_CREAT|O_EXCL|O_NOFOLLOW) is written first, then renamed onto the final
 * name. rename(2) never dereferences its destination and never writes
 * through a shared inode, so a crash mid-write can only ever leave the
 * complete prior checkpoint or the complete new one, never a partial file.
 *
 * `dir` is expected to be a pinDirectory-returned path (a /proc/self/fd/<fd>
 * alias on Linux, binding every operation here to the exact directory that
 * was already validated, never re-resolving its mutable name) -- see
 * pinDirectory's own doc for why that matters.
 *
 * Externally reported P2: atomic *publication* (the rename) is not the same
 * guarantee as *durability* across a host crash or power loss -- a rename
 * only reorders which inode a name points at; whether that reordering, or the
 * file's own data, has actually reached disk depends on the OS's own write
 * caching, which fsync(2) is what forces. Without it, a crash immediately
 * after this function returns could still lose the write entirely, or leave
 * the directory entry pointing at the new inode while its data never made it
 * to disk. Fixed by fsync-ing the temp file's own data before the rename
 * (so the content is durable before it is ever linked under its final name),
 * and fsync-ing the containing DIRECTORY after the rename (so the directory
 * entry update itself -- a separate piece of metadata from the file's own
 * data -- is durable too; fsync on a file descriptor never implies this).
 */
function publishGuarded(dir: string, filename: string, content: string): void {
	const tempPath = join(dir, `.checkpoint-${randomBytes(8).toString('hex')}.tmp`);
	const finalPath = join(dir, filename);
	const fd = openSync(tempPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW);
	try {
		writeFileSync(fd, content, 'utf8');
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	try {
		renameSync(tempPath, finalPath);
	} catch (err) {
		try { unlinkSync(tempPath); } catch { /* best effort cleanup; the rename's own error is what matters */ }
		throw err;
	}
	const dirFd = openSync(dir, fsConstants.O_RDONLY);
	try {
		fsyncSync(dirFd);
	} finally {
		closeSync(dirFd);
	}
}

/**
 * `/proc/self/fd/<fd>` (Linux) and `/dev/fd/<fd>` (also present on Linux, and
 * the only form macOS/BSD expose) are magic symlinks the kernel resolves
 * directly to the OPEN fd's own pinned inode, not by re-looking up whatever
 * name the fd was originally opened through -- the mechanism pinDirectory
 * relies on. Resolved once, at module load, preferring /proc when both
 * exist (Linux) since it is the more specifically documented of the two.
 * Externally reported P2: an earlier version pinned Linux only and silently
 * fell back to the bare mutable path everywhere else, including macOS --
 * reproduced directly: that fallback gave zero protection (every operation
 * still re-resolved the swappable name), while LOOKING identical to the
 * protected path from the caller's side. /dev/fd closes this for macOS too;
 * a platform with neither (e.g. Windows) now REFUSES rather than silently
 * degrading -- see pinDirectory's own doc.
 */
const FD_ALIAS_ROOT = existsSync('/proc/self/fd') ? '/proc/self/fd' : existsSync('/dev/fd') ? '/dev/fd' : undefined;

/**
 * Opens `dir` with O_DIRECTORY|O_NOFOLLOW (fails with ELOOP if `dir` is a
 * symlink, ENOENT if it does not exist yet) and returns a `<FD_ALIAS_ROOT>/
 * <fd>` alias alongside the fd itself. CALLER MUST CLOSE THE FD. Every
 * subsequent operation built on `.path` (never on the original `dir` string
 * again) is resolved by the kernel directly against the pinned inode this
 * call opened -- not by re-looking up `dir`'s own name -- so nothing that
 * happens to the name `dir` itself afterward (including being replaced with
 * a symlink to somewhere else entirely) can redirect those operations. This
 * is what "binding publication and cleanup to a validated directory's own
 * identity throughout the operation" concretely means in Node: externally
 * reported P2, reproduced against the original fix -- a bare lstat-based
 * check immediately followed by a separate mkdir/open/rename/rmSync call
 * still re-resolves the mutable path from scratch on every one of those
 * later calls, leaving the exact same check-then-act gap open just as
 * before, no matter how many times the check itself is repeated or how
 * tightly it is sequenced.
 *
 * On a platform with neither alias root available, this THROWS rather than
 * falling back to the unprotected `dir` string -- a second externally
 * reported P2: a silent fallback gives every caller the false impression
 * that its operations are bound to a validated identity when they are not
 * bound to anything at all. Node's fs module exposes no portable openat/
 * mkdirat/unlinkat-family alternative, so a platform lacking both alias
 * roots genuinely cannot make this guarantee; refusing honestly is the only
 * correct behaviour left, not a quieter version of the same gap.
 */
interface PinnedDir {
	readonly fd:   number;
	readonly path: string;
}

function pinDirectory(dir: string): PinnedDir {
	const fd = openSync(dir, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
	if (FD_ALIAS_ROOT === undefined) {
		closeSync(fd);
		throw new Error('checkpoint: this platform exposes neither /proc/self/fd nor /dev/fd, so operations cannot be safely bound to a validated directory\'s own identity -- refusing rather than silently falling back to an unprotected path');
	}
	return { fd, path: `${FD_ALIAS_ROOT}/${fd}` };
}

/**
 * Pins repoRoot, then pins each of `segments` in turn, each one built on the
 * PREVIOUS segment's own already-pinned alias rather than a freshly
 * constructed path string -- so no ancestor anywhere in the chain, not just
 * the final leaf, is ever resolved against its own mutable name after the
 * very first step. Externally reported P2, round 3: pinning only the final
 * directory (e.g. the review directory itself) left every ancestor ABOVE it
 * (e.g. .insrc/tmp) still resolved fresh on that one open call, so replacing
 * an ancestor between requireNoSymlinkInPath's check and this call could
 * still redirect it. Chaining the pin one level at a time closes that gap at
 * every level: once a directory is open, its fd (and /proc alias) remain
 * valid regardless of what later happens to the path used to open it -- a
 * fundamental POSIX guarantee, not something that needs re-checking.
 *
 * repoRoot itself is the one link this chain cannot pin ahead of time (it is
 * the trusted root the daemon's own registry resolved, not attacker-
 * influenced content under the repository); every segment after it is fully
 * protected. Returns undefined (closing anything already opened) when any
 * segment does not exist yet; rethrows any other failure (including a
 * symlinked segment, caught via O_NOFOLLOW) after the same cleanup.
 */
interface PinnedChain {
	/** Every link, in order from repoRoot to the leaf. */
	readonly links:  readonly PinnedDir[];
	readonly leaf:   PinnedDir;
	readonly parent: PinnedDir;
	readonly close:  () => void;
}

function pinDirectoryChain(repoRoot: string, ...segments: readonly string[]): PinnedChain | undefined {
	const links: PinnedDir[] = [];
	try {
		let current = pinDirectory(repoRoot);
		links.push(current);
		let parent = current;
		for (const segment of segments) {
			parent = current;
			current = pinDirectory(join(current.path, segment));
			links.push(current);
		}
		return { links, leaf: current, parent, close: () => { for (const link of links) closeSync(link.fd); } };
	} catch (err) {
		for (const link of links) closeSync(link.fd);
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw err;
	}
}

/**
 * fsyncs every directory in `chain`, not just the leaf. Externally reported
 * P2: publishGuarded's own fsync (the output file, then its immediate
 * containing directory) only makes that one directory's own entries
 * durable -- it says nothing about whether that directory's OWN existence,
 * as an entry inside ITS parent, is durable. mkdirSync's recursive:true can
 * silently create any number of new ancestor directories (e.g. .insrc/
 * artifacts, the first time a review finalizes); each one is new metadata
 * in its own parent that needs its own fsync to survive a crash, not just
 * the leaf's content. fsync-ing a directory that was already durable is a
 * harmless no-op, so syncing the whole chain unconditionally (rather than
 * tracking which segments mkdirSync actually just created) is the simplest
 * correct behaviour.
 */
function fsyncDirectoryChain(chain: PinnedChain): void {
	for (const link of chain.links) fsyncSync(link.fd);
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
	const dir = reviewDir(repoRoot, reviewId);
	const path = checkpointPath(repoRoot, reviewId);

	requireNoSymlinkInPath(repoRoot, path);
	mkdirSync(dir, { recursive: true });
	// Re-checked after mkdirSync, matching review-report.ts's own convention.
	requireNoSymlinkInPath(repoRoot, path);

	// Pinned immediately before use, all the way from repoRoot: every
	// subsequent operation goes through this chain's own identity, never
	// re-resolving any ancestor's mutable name again (see pinDirectoryChain's
	// own doc). mkdirSync just created `dir`, so ENOENT here would mean it
	// disappeared again immediately -- a genuine race this call cannot
	// safely proceed through.
	const chain = pinDirectoryChain(repoRoot, '.insrc', 'tmp', reviewId);
	if (chain === undefined) throw new Error(`checkpoint: ${dir} disappeared before it could be pinned`);
	try {
		const checkpoint: ReviewCheckpoint = { reviewId, lastCompletedUnit };
		publishGuarded(chain.leaf.path, 'checkpoint.json', JSON.stringify(checkpoint));
		fsyncDirectoryChain(chain);
	} finally {
		chain.close();
	}
}

/**
 * Reads this review's last-written checkpoint, or undefined when none exists
 * yet (a fresh review, ac2) -- a missing OR malformed file (truncated,
 * disk-level corruption) is treated identically, never thrown: a review must
 * always still be able to resume, from the start in the worst case, rather
 * than being permanently stuck on an unreadable checkpoint.
 *
 * Externally reported P2, three rounds: (1) readFileSync on its own follows a
 * symlink at `path`, which could hand back a different file entirely (another
 * review's own checkpoint, reached through a symlink planted at this
 * reviewId's expected location) -- the first fix added a requireNoSymlinkInPath
 * walk, treating a symlink the same as a missing/corrupted checkpoint
 * (undefined), consistent with this function's own established "never throw
 * on a data-integrity issue" contract. (2) that check and the separate
 * readFileSync call were still two syscalls re-resolving the same mutable
 * path, so substituting the checkpoint after the check but before the read
 * could still redirect it -- reproduced directly: a checkpoint initially
 * naming this reviewId, swapped to an outside record that (by construction)
 * also happened to carry this reviewId, still got read, since the identity
 * check alone cannot detect a substitution that correctly names the id it
 * was swapped onto. Fixed the same way writeCheckpoint/finalizeAndCleanup
 * already are: pin the ancestor chain, then open the leaf file itself with
 * O_NOFOLLOW (failing on a symlink rather than following it) and read
 * through that descriptor, never through a second, separately-resolved path
 * lookup. (3) even without any symlink involved, nothing previously checked
 * that the record's OWN reviewId field actually matched the one requested --
 * a mismatched record (e.g. a caller bug elsewhere writing under the wrong
 * identity) would silently hand back another review's lastCompletedUnit,
 * letting a resume skip work that was never actually done for THIS review.
 * Fixed by requiring an exact match before trusting the parsed record.
 */
export async function readCheckpoint(reviewId: string): Promise<ReviewCheckpoint | undefined> {
	requireValidReviewId(reviewId);
	const resolveRepoRoot = testDeps.resolveRepoRoot ?? defaultResolveRepoRoot;
	const repoRoot = await resolveRepoRoot();

	const chain = pinDirectoryChain(repoRoot, '.insrc', 'tmp', reviewId);
	if (chain === undefined) return undefined; // no review directory at all yet -- a fresh review

	let raw: string;
	try {
		raw = readThroughPinnedLeaf(chain.leaf.path, 'checkpoint.json');
	} catch {
		return undefined; // missing, or a symlink -- both treated as absent, never followed
	} finally {
		chain.close();
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (!isReviewCheckpointShape(parsed)) return undefined;
	if (parsed.reviewId !== reviewId) return undefined;
	return parsed;
}

/** Opens `filename` inside the already-pinned `dir` with O_NOFOLLOW (so a
 *  symlink at that exact name fails rather than being followed) and reads
 *  it through the resulting descriptor -- never a second, separately
 *  resolved path lookup the way a plain readFileSync(path) would be. */
function readThroughPinnedLeaf(dir: string, filename: string): string {
	const fd = openSync(join(dir, filename), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
	try {
		return readFileSync(fd, 'utf8');
	} finally {
		closeSync(fd);
	}
}

/**
 * Test-only direct access to readThroughPinnedLeaf's own guarantee, mirroring
 * review-report.ts's own `_publishGuardedForTests` convention. readCheckpoint's
 * own pinDirectoryChain call would refuse a pre-existing symlinked review
 * directory before ever reaching this, so that path alone cannot exercise
 * this function's independent guarantee at the FILE level -- which holds
 * regardless of WHEN a symlink came to occupy `filename`'s name, not just
 * whether one existed before the call started. Exported solely so a test can
 * exercise this guarantee directly and deterministically, without needing a
 * real concurrent race.
 */
export function _readThroughPinnedLeafForTests(dir: string, filename: string): string {
	return readThroughPinnedLeaf(dir, filename);
}

function defaultWriteDurableCopy(repoRoot: string, reviewId: string, finalOutput: unknown): void {
	const path = durablePath(repoRoot, reviewId);
	const dir = dirname(path);
	requireNoSymlinkInPath(repoRoot, path);
	mkdirSync(dir, { recursive: true });
	requireNoSymlinkInPath(repoRoot, path);

	const chain = pinDirectoryChain(repoRoot, '.insrc', 'artifacts');
	if (chain === undefined) throw new Error(`checkpoint: ${dir} disappeared before it could be pinned`);
	try {
		publishGuarded(chain.leaf.path, `REVIEW-${reviewId}.json`, JSON.stringify(finalOutput));
		fsyncDirectoryChain(chain);
	} finally {
		chain.close();
	}
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
	// Pinned immediately before the recursive delete, all the way from
	// repoRoot: emptying the contents is bound to the exact inode this call
	// opens, never re-resolving any ancestor's mutable name again (see
	// pinDirectoryChain's own doc) -- so even a name swapped mid-operation
	// anywhere in the chain, not just the review directory itself, leaves
	// whatever is now actually named there untouched, with only the original
	// directory this call validated ever emptied.
	const chain = pinDirectoryChain(repoRoot, '.insrc', 'tmp', reviewId);
	if (chain === undefined) return; // already cleaned up, or never started -- nothing to delete
	try {
		emptyDirectoryContents(chain.leaf.path);
		// rmdir(2) refuses a /proc/self/fd alias for removing the directory
		// the fd itself refers to (only child lookups underneath it are
		// supported), so the now-empty directory's own final removal still
		// has to name it relative to a parent -- using the PINNED parent
		// alias (not the raw mutable `dir` string) means even this last
		// name-based lookup cannot be redirected by a swapped .insrc/tmp.
		// Safe even so regardless, since rmdir only ever removes a name that
		// is itself literally an empty directory: swapped to a symlink, a
		// non-empty directory, or a plain file, it refuses rather than
		// destroying whatever is actually there.
		try {
			rmdirSync(join(chain.parent.path, reviewId));
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
		}
	} finally {
		chain.close();
	}
}

/**
 * Recursively empties `dirPath`'s own contents (files and subdirectories),
 * without ever removing `dirPath` itself. A symlinked entry (file or
 * directory) is unlinked as the link it is, never followed into whatever it
 * points at -- unlink(2) never follows a symlink regardless, so a plain file
 * entry needs no further pinning before removal.
 *
 * A subdirectory entry, however, is pinned via pinDirectory before recursing
 * into it, exactly as the top-level directory is in finalizeAndCleanup --
 * externally reported P2, round 2: emptying contents by re-deriving each
 * child's path from readdirSync's own Dirent list and recursing into that
 * path directly (without re-pinning) left the identical check-then-act gap
 * open one level down, for every nested directory a review's own scratch
 * folder might contain, not just the top-level one. Pinning recursively at
 * every level closes it the same way at every depth.
 */
function emptyDirectoryContents(dirPath: string): void {
	for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
		const childPath = join(dirPath, entry.name);
		if (entry.isSymbolicLink()) {
			unlinkSync(childPath);
			continue;
		}
		if (!entry.isDirectory()) {
			unlinkSync(childPath);
			continue;
		}
		let child: { readonly fd: number; readonly path: string };
		try {
			child = pinDirectory(childPath);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue; // raced away already -- nothing left to empty
			throw err;
		}
		try {
			emptyDirectoryContents(child.path);
		} finally {
			closeSync(child.fd);
		}
		try {
			rmdirSync(childPath);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
		}
	}
}
