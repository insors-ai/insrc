/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f9d4ab4c90c0b4c s1/t6 — the atomic pending-create claim for
 * tracker.push on an ISSUE-anchored work item.
 *
 * Before dispatching the mutating execute step, a run claims the create
 * intent with an atomic create-if-absent (`writeFileSync` flag 'wx') on
 * `.insrc/artifacts/PENDING-CREATE-<epicHash>.json`. Only the run that got
 * `claimed: true` dispatches a create; a run that gets `claimed: false`
 * (EEXIST) never creates — it adopts/reconciles from the existing claim.
 *
 * In-process serialization uses the artifact write-authority queue keyed by
 * the VALID artifact id `ISSUE-<hash>` (PENDING-CREATE-<hash> is rejected by
 * ArtifactIds.parse, so the claim FILE keeps its name and bypasses the store
 * while the queue key parses). Lock ordering: the claim mutex is acquired
 * BEFORE any artifact write on ISSUE/EPIC/STORY-s1 heads.
 *
 * Fencing: the claim carries a monotonically increasing `fence` (starts at
 * 1). Every op re-reads the claim under the mutex, requires
 * `expectedFence === current`, and writes `fence+1` in the same critical
 * section. A displaced owner's op is rejected with ClaimOwnershipError before
 * any write and is fenced from all later persistence.
 *
 * Liveness: a claim is abandoned iff `heartbeatAt` is older than
 * `claimStaleAfterMs` (default 10 min). Crash recovery reuses the daemon's
 * guard-directory pattern (acquireRunFileGuard / quarantineDeadGuard): the
 * holder's pid is probed, a dead owner's claim is quarantined and reclaimed.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ArtifactIds } from '../artifact-ids.js';
import { ARTIFACTS_DIR, issueArtifactId } from '../storage.js';
import { acquireRunFileGuard, type RunFileGuard } from '../../shared/daemon-run-files.js';
import type { ProcessIdentity } from '../../shared/daemon-process.js';
import { requireProcessIdentity } from '../../shared/daemon-process.js';
import { withArtifactWriteAuthority } from '../artifact-core/write-authority.js';

// ---------------------------------------------------------------------------
// Types + errors
// ---------------------------------------------------------------------------

/** Thrown when an op's expected fence is stale — the owner was displaced. */
export class ClaimOwnershipError extends Error {
	constructor(message: string) { super(message); this.name = 'ClaimOwnershipError'; }
}

/** Claim format version. v2 claims carry an explicit `dispatchedAt` marker
 *  (absent = provably never dispatched). Claims written by older runners have
 *  NO version field — their dispatch history is UNKNOWN, so they must never
 *  be treated as confirmed pre-dispatch failures (REVIEW round-7 HIGH-1). */
export const CLAIM_VERSION = 2;

export interface PendingCreateClaim {
	readonly epicHash: string;
	readonly runId: string;
	readonly owner: string;
	readonly repo: string;
	/** Claim format version; absent on legacy (pre-v2) claims. */
	readonly version?: number | undefined;
	/** GitHub owner/repo the claim was created for — the recovery target check
	 *  compares the CANDIDATE's actual ref target against these, never against
	 *  the local checkout path (REVIEW round-6 MED). Absent on legacy claims,
	 *  which fall back to the `repo` path comparison. */
	readonly ghOwner?: string | undefined;
	readonly ghRepo?: string | undefined;
	readonly title: string;
	readonly marker: string;
	readonly state: 'pending' | 'created';
	readonly fence: number;
	readonly createdAt: string;
	readonly heartbeatAt: string;
	/** Set when the owning run dispatched the create execute step. A 'pending'
	 *  claim WITHOUT dispatchedAt proves the create was never dispatched
	 *  (REVIEW round-6 HIGH-2: confirmed pre-dispatch failure is recoverable). */
	readonly dispatchedAt?: string | undefined;
	readonly issueRef?: string | undefined;
}

export interface ClaimResult {
	readonly claimed: boolean;
	readonly claim: PendingCreateClaim;
	readonly path: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** The on-disk claim file. The name deliberately does NOT parse as an
 *  artifact id (ArtifactIds.parse rejects PENDING-CREATE-<hash>): the file
 *  bypasses the artifact store. */
export function pendingCreatePath(repoPath: string, epicHash: string): string {
	return join(repoPath, ARTIFACTS_DIR, `PENDING-CREATE-${epicHash}.json`);
}

/** The claim mutex's queue key: the valid ISSUE artifact id. */
export function claimMutexKey(epicHash: string): string {
	return ArtifactIds.make({ kind: 'ISSUE', epicHash });
}

/** The guard directory backing the claim's cross-process lock. */
function claimGuardDir(repoPath: string, epicHash: string): string {
	return join(repoPath, ARTIFACTS_DIR, `.pending-create-${epicHash}.lock`);
}

// ---------------------------------------------------------------------------
// Read/write
// ---------------------------------------------------------------------------

export function readClaim(repoPath: string, epicHash: string): PendingCreateClaim | undefined {
	const path = pendingCreatePath(repoPath, epicHash);
	if (!existsSync(path)) return undefined;
	try { return JSON.parse(readFileSync(path, 'utf8')) as PendingCreateClaim; } catch { return undefined; }
}

function writeClaim(path: string, claim: PendingCreateClaim): void {
	// atomic replace within the mutex
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, JSON.stringify(claim, null, 2) + '\n', { mode: 0o600 });
	renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// Liveness
// ---------------------------------------------------------------------------

export const DEFAULT_CLAIM_STALE_AFTER_MS = 10 * 60 * 1000;

/** A claim is abandoned iff its heartbeat is older than the staleness
 *  window. A still-executing op keeps its heartbeat fresh. */
export function isClaimAbandoned(claim: PendingCreateClaim, now: number, staleAfterMs: number = DEFAULT_CLAIM_STALE_AFTER_MS): boolean {
	const hb = Date.parse(claim.heartbeatAt);
	if (Number.isNaN(hb)) return true;
	return now - hb > staleAfterMs;
}

// ---------------------------------------------------------------------------
// claimCreateIntent — atomic create-if-absent BEFORE dispatching execute
// ---------------------------------------------------------------------------

/** Atomically claim the create intent. Returns `{ claimed: true, claim }`
 *  for the winner (wx create succeeded) or `{ claimed: false, claim }` with
 *  the EXISTING claim on EEXIST — the loser never overwrites or deletes it. */
export function claimCreateIntent(
	repoPath: string,
	epicHash: string,
	runId: string,
	input: { readonly title: string; readonly marker: string; readonly ghOwner?: string | undefined; readonly ghRepo?: string | undefined; readonly now?: (() => string) | undefined },
): ClaimResult {
	const path = pendingCreatePath(repoPath, epicHash);
	const now = input.now ?? (() => new Date().toISOString());
	const payload: PendingCreateClaim = {
		epicHash,
		runId,
		owner: `run:${runId}`,
		repo: repoPath,
		version: CLAIM_VERSION,
		...(input.ghOwner !== undefined ? { ghOwner: input.ghOwner } : {}),
		...(input.ghRepo !== undefined ? { ghRepo: input.ghRepo } : {}),
		title: input.title,
		marker: input.marker,
		state: 'pending',
		fence: 1,
		createdAt: now(),
		heartbeatAt: now(),
	};
	try {
		writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
		return { claimed: true, claim: payload, path };
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
			const existing = readClaim(repoPath, epicHash);
			if (existing === undefined) throw new Error(`claim file exists but is unreadable at ${path}`);
			return { claimed: false, claim: existing, path };
		}
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Mutex — claim key ISSUE-<hash> through the authority queue when installed,
// guard-directory lock for cross-process serialization otherwise.
// ---------------------------------------------------------------------------

export interface ClaimMutex {
	readonly key: string;
	release(): void;
}

/** Acquire the in-process claim mutex. The in-process half is a promise
 *  chain keyed by `ISSUE-<hash>` (the valid artifact id — the same key the
 *  artifact write-authority queue uses, so claim ops serialize with artifact
 *  writes on ISSUE/EPIC/STORY-s1 heads; lock ordering: claim first). The
 *  cross-process half is the guard directory (atomic mkdir; dead owners
 *  quarantined by the daemon's quarantineDeadGuard). */
const CLAIM_MUTEXES = new Map<string, Promise<unknown>>();

export async function acquireClaimMutex(
	repoPath: string,
	epicHash: string,
	authority?: ((repo: string, id: string, run: () => Promise<unknown>) => Promise<unknown>) | undefined,
	owner: ProcessIdentity = requireProcessIdentity(process.pid),
	read?: (pid: number) => ProcessIdentity | undefined,
): Promise<ClaimMutex> {
	const key = claimMutexKey(epicHash);
	const lockKey = `${repoPath}\0${key}`;
	// A single promise chain per lock key serializes ALL same-process holders.
	// The guard dir is taken inside the chain body (so only one holder ever
	// mkdirs it) but the acquire() promise resolves only after the chain body
	// has started holding — i.e. after the previous holder fully released.
	const previous = CLAIM_MUTEXES.get(lockKey) ?? Promise.resolve();
	let releaseQueue!: () => void;
	let releaseGuard: (() => void) | undefined;
	let chainStarted!: () => void;
	let chainFailed!: (err: unknown) => void;
	const started = new Promise<void>((resolve, reject) => { chainStarted = resolve; chainFailed = reject; });
	const held = new Promise<void>(resolve => { releaseQueue = resolve; });
	const next = previous.then(async () => {
		// cross-process half: guard dir (atomic mkdir; dead owners quarantined)
		let guard: RunFileGuard;
		try {
			guard = acquireRunFileGuard(claimGuardDir(repoPath, epicHash), owner, read);
		} catch (err) {
			// REVIEW-5f9d4ab4c90c0b4c HIGH-4: propagate the acquisition failure to
			// the caller instead of leaving `started` pending forever.
			chainFailed(err);
			throw err;
		}
		releaseGuard = () => { try { guard.release(); } catch { /* best effort */ } };
		// in-process half through the REAL withArtifactWriteAuthority on the
		// ISSUE-<hash> key (the daemon-installed handler when present): the
		// authority hold spans the entire critical section (until `held` resolves)
		const run = authority ?? withArtifactWriteAuthority;
		try {
			await run(repoPath, key, async () => { chainStarted(); await held; });
		} catch (err) {
			// HIGH-4: an authority failure after guard acquisition releases the
			// guard instead of leaking it, then propagates.
			releaseGuard();
			releaseGuard = undefined;
			chainFailed(err);
			throw err;
		}
	});
	const tail = next.catch(() => undefined);
	CLAIM_MUTEXES.set(lockKey, tail);
	await started;   // our turn: previous holder released (guard gone), we hold the chain; throws on acquisition failure
	let released = false;
	const release = (): void => {
		if (released) return;
		released = true;
		releaseQueue();
		if (releaseGuard !== undefined) releaseGuard();
		if (CLAIM_MUTEXES.get(lockKey) === tail) CLAIM_MUTEXES.delete(lockKey);
	};
	return { key, release };
}

// ---------------------------------------------------------------------------
// Ops under the mutex (fence-checked)
// ---------------------------------------------------------------------------

/** Run `op` under the claim mutex with fence + ownership checking. `op`
 *  receives the current claim + a writer that persists fence+1 atomically.
 *  A stale expectedFence throws ClaimOwnershipError BEFORE any write; when
 *  `expectedRunId` is given, a claim owned by a DIFFERENT run also throws
 *  before any write (REVIEW round-6 HIGH-1: the run id is checked alongside
 *  the fence on every write — a losing run can never advance a live claim). */
export async function withClaim<T>(
	repoPath: string,
	epicHash: string,
	expectedFence: number,
	op: (claim: PendingCreateClaim, commit: (next: PendingCreateClaim) => void) => T,
	authority?: ((repo: string, id: string, run: () => Promise<unknown>) => Promise<unknown>) | undefined,
	expectedRunId?: string | undefined,
): Promise<T> {
	const mutex = await acquireClaimMutex(repoPath, epicHash, authority);
	try {
		const path = pendingCreatePath(repoPath, epicHash);
		const claim = readClaim(repoPath, epicHash);
		if (claim === undefined) throw new Error(`no claim at ${path}`);
		if (claim.fence !== expectedFence) {
			throw new ClaimOwnershipError(`stale fence: expected ${expectedFence}, current ${claim.fence} — the claim was taken over at ${path}`);
		}
		if (expectedRunId !== undefined && claim.runId !== expectedRunId) {
			throw new ClaimOwnershipError(`not the claim owner: expected run ${expectedRunId}, claim owned by ${claim.runId} at ${path}`);
		}
		let committed = false;
		const commit = (next: PendingCreateClaim): void => {
			writeClaim(path, { ...next, fence: claim.fence + 1 });
			committed = true;
		};
		const result = op(claim, commit);
		if (committed) return result;
		// read-only op: no fence bump
		return result;
	} finally {
		mutex.release();
	}
}

/** Heartbeat: refresh heartbeatAt WITH the claim mutex held (fence-checked).
 *  A displaced owner's heartbeat throws ClaimOwnershipError before any write.
 *  Returns the COMMITTED fence (expectedFence + 1) — the ownership token the
 *  caller must carry into finalization (REVIEW round-2 HIGH-1). */
export async function heartbeatClaim(repoPath: string, epicHash: string, expectedFence: number, now: () => string = () => new Date().toISOString(), runId?: string | undefined): Promise<number> {
	let committed = expectedFence;
	await withClaim(repoPath, epicHash, expectedFence, (claim, commit) => {
		commit({ ...claim, heartbeatAt: now() });
		committed = claim.fence + 1;
	}, undefined, runId);
	return committed;
}

/** Record that the owning run DISPATCHED the create execute step (fence- and
 *  run-checked, under the mutex): sets `dispatchedAt` + heartbeat. A later
 *  run that finds a 'pending' claim with NO dispatchedAt knows the create was
 *  never dispatched (REVIEW round-6 HIGH-2). Returns the COMMITTED fence. */
export async function markClaimDispatched(repoPath: string, epicHash: string, expectedFence: number, runId: string, now: () => string = () => new Date().toISOString()): Promise<number> {
	let committed = expectedFence;
	await withClaim(repoPath, epicHash, expectedFence, (claim, commit) => {
		commit({ ...claim, dispatchedAt: now(), heartbeatAt: now() });
		committed = claim.fence + 1;
	}, undefined, runId);
	return committed;
}

/** Retarget the claim's persisted GitHub owner/repo when the repo
 *  configuration changed after the claim was written (REVIEW round-9
 *  HIGH-2): fence- + run-checked under the mutex, so the create decision
 *  reconciles against the NEW target instead of creating in a different
 *  repository than the one recorded on the claim. Returns the COMMITTED
 *  fence. */
export async function updateClaimTarget(repoPath: string, epicHash: string, expectedFence: number, runId: string, ghOwner: string, ghRepo: string): Promise<number> {
	let committed = expectedFence;
	await withClaim(repoPath, epicHash, expectedFence, (claim, commit) => {
		commit({ ...claim, ghOwner, ghRepo });
		committed = claim.fence + 1;
	}, undefined, runId);
	return committed;
}

/** Mark the claim 'created' with the remote ref (fence-checked, under mutex).
 *  Returns the COMMITTED fence (expectedFence + 1).
 *  REVIEW round-11 HIGH: a 'created' claim's saved issueRef is the recovery
 *  identity — re-marking the SAME ref is idempotent, but overwriting it with a
 *  DIFFERENT ref throws ClaimOwnershipError before any write. */
export async function markClaimCreated(repoPath: string, epicHash: string, expectedFence: number, issueRef: string, authority?: ((repo: string, id: string, run: () => Promise<unknown>) => Promise<unknown>) | undefined, runId?: string | undefined): Promise<number> {
	let committed = expectedFence;
	await withClaim(repoPath, epicHash, expectedFence, (claim, commit) => {
		if (claim.state === 'created' && claim.issueRef !== undefined && claim.issueRef !== issueRef) {
			throw new ClaimOwnershipError(`created claim already records ref ${claim.issueRef} — refusing to overwrite with ${issueRef}`);
		}
		commit({ ...claim, state: 'created', issueRef });
		committed = claim.fence + 1;
	}, authority, runId);
	return committed;
}

/** Same, with the conventional name for callers that want the fence back. */
export async function markClaimCreatedFence(repoPath: string, epicHash: string, expectedFence: number, issueRef: string, authority?: ((repo: string, id: string, run: () => Promise<unknown>) => Promise<unknown>) | undefined, runId?: string | undefined): Promise<number> {
	return markClaimCreated(repoPath, epicHash, expectedFence, issueRef, authority, runId);
}

/** Delete the claim after successful persistence (under the mutex,
 *  fence-checked — a displaced owner cannot delete the new owner's claim). */
export async function releaseClaim(repoPath: string, epicHash: string, expectedFence: number, runId?: string | undefined): Promise<void> {
	await withClaim(repoPath, epicHash, expectedFence, (claim, commit) => {
		void commit;
		unlinkSync(pendingCreatePath(repoPath, epicHash));
	}, undefined, runId);
}

/** Run `work` with the claim mutex ALREADY HELD by the caller, fence-verified
 *  atomically with the work — the check and the writes cannot be separated by a
 *  takeover (REVIEW round-2 HIGH-3). `expectedFence` is required — a missing
 *  fence never borrows current ownership. When `expectedRunId` is given, the
 *  claim must ALSO be owned by that run (REVIEW round-7 HIGH-3: the run id and
 *  the fence are checked together — a replacement claim from a delete-and-retry
 *  can reach the same fence number, so the fence alone proves nothing).
 *  Throws ClaimOwnershipError on stale/absent claim or wrong owner. The caller
 *  owns the mutex (acquire via acquireClaimMutex / withClaim) and releases it,
 *  so nested claim ops do not deadlock. */
export async function withOwnedFence<T>(
	repoPath: string,
	epicHash: string,
	expectedFence: number,
	work: (claim: PendingCreateClaim) => T | Promise<T>,
	expectedRunId?: string | undefined,
): Promise<T> {
	if (!Number.isSafeInteger(expectedFence) || expectedFence < 1) {
		throw new ClaimOwnershipError(`no carried fence for ${epicHash} — refusing to persist without verified claim ownership`);
	}
	const path = pendingCreatePath(repoPath, epicHash);
	const claim = readClaim(repoPath, epicHash);
	if (claim === undefined) {
		throw new ClaimOwnershipError(`no claim at ${path} — cannot verify ownership of fence ${expectedFence}`);
	}
	if (claim.fence !== expectedFence) {
		throw new ClaimOwnershipError(`stale fence: expected ${expectedFence}, current ${claim.fence} at ${path}`);
	}
	if (expectedRunId !== undefined && claim.runId !== expectedRunId) {
		throw new ClaimOwnershipError(`not the claim owner: expected run ${expectedRunId}, claim owned by ${claim.runId} at ${path} (fence ${expectedFence} matches but belongs to another run)`);
	}
	return await work(claim);
}

// ---------------------------------------------------------------------------
// Takeover of an abandoned claim (under the mutex, fence++)
// ---------------------------------------------------------------------------

/** Take over an abandoned claim: verify abandoned, write the new owner with
 *  fence+1. Returns the new claim, or undefined when the claim is live. */
export async function takeoverAbandonedClaim(
	repoPath: string,
	epicHash: string,
	newRunId: string,
	now: number,
	staleAfterMs: number = DEFAULT_CLAIM_STALE_AFTER_MS,
	authority?: ((repo: string, id: string, run: () => Promise<unknown>) => Promise<unknown>) | undefined,
): Promise<PendingCreateClaim | undefined> {
	const mutex = await acquireClaimMutex(repoPath, epicHash, authority);
	try {
		const claim = readClaim(repoPath, epicHash);
		if (claim === undefined) return undefined;
		if (!isClaimAbandoned(claim, now, staleAfterMs)) return undefined;
		const next: PendingCreateClaim = { ...claim, runId: newRunId, owner: `run:${newRunId}`, fence: claim.fence + 1, heartbeatAt: new Date(now).toISOString() };
		writeClaim(pendingCreatePath(repoPath, epicHash), next);
		return next;
	} finally {
		mutex.release();
	}
}

// ---------------------------------------------------------------------------
// Crash recovery — quarantine a dead holder's claim, reclaim with 0 creates
// ---------------------------------------------------------------------------

/** Reclaim a claim whose holder process is dead, THROUGH the daemon's own
 *  quarantineDeadGuard (via acquireRunFileGuard's EEXIST path): the guard dir
 *  is quarantined only when its recorded owner is conclusively dead, and the
 *  fresh acquire then succeeds. A LIVE holder is undisturbed (acquire throws
 *  the conflict and the claim is returned untouched). `read`/`probe` are
 *  injectable for tests; by default the real process-identity reader + a
 *  ReclaimProbe are used. Returns the original claim when reclaimed. */
export function quarantineDeadClaim(
	repoPath: string,
	epicHash: string,
	read?: (pid: number) => ProcessIdentity | undefined,
	probe?: (phase: 'after-verdict' | 'before-revalidation' | 'before-quarantine') => void,
	owner: ProcessIdentity = requireProcessIdentity(process.pid),
): PendingCreateClaim | undefined {
	const claim = readClaim(repoPath, epicHash);
	if (claim === undefined) return undefined;
	const guardDir = claimGuardDir(repoPath, epicHash);
	if (!existsSync(guardDir)) return claim;   // no guard held: nothing to quarantine
	let guard: RunFileGuard;
	try {
		guard = acquireRunFileGuard(guardDir, owner, read, probe);   // throws on a live holder; reclaims a dead one via quarantineDeadGuard
	} catch {
		return undefined;   // live holder or withheld conflict: undisturbed
	}
	// reclaimed: the dead guard was quarantined and our fresh guard now holds the
	// dir; release it immediately — the claim FILE is the record, not the guard
	try { guard.release(); } catch { /* best effort */ }
	return claim;
}

// ---------------------------------------------------------------------------
// Recovery-candidate verification — marker + target
// ---------------------------------------------------------------------------

/** A remote issue is the claim's issue iff its body carries the claim's
 *  `<!-- insrc:artifact ISSUE-<hash> -->` marker AND its target — the ACTUAL
 *  `owner/repo` parsed from the candidate's ref — matches the GitHub
 *  owner/repo persisted on the claim (REVIEW round-6 MED: the check must not
 *  compare the local checkout to itself; a marker match in a newly configured
 *  different repository must not pass an old claim's target check).
 *  REVIEW round-8 MED: a LEGACY claim without a persisted gh target has an
 *  UNKNOWN target — do not compare against the absolute checkout path
 *  (never equal to `owner/repo`); when the caller supplies `ghTarget` (the
 *  currently configured `owner/repo`), confirm the candidate against that
 *  instead. Only when neither is available does the repo-path compare remain. */
export function verifyRecoveryCandidate(claim: PendingCreateClaim, candidate: { readonly title: string; readonly body: string; readonly target: string }, ghTarget?: string | undefined): boolean {
	if (!candidate.body.includes(claim.marker)) return false;
	const want = claim.ghOwner !== undefined && claim.ghRepo !== undefined
		? `${claim.ghOwner}/${claim.ghRepo}`
		: (ghTarget ?? claim.repo);
	if (candidate.target !== want) return false;
	return true;
}

/** Reconcile: filter candidates through verifyRecoveryCandidate. Exactly
 *  one -> adoptable; 0 or >1 -> refuse. The failure result carries
 *  `verifiedCount` so the caller can distinguish a confirmed pre-dispatch
 *  failure (0 verified, claim never dispatched) from an ambiguous outcome.
 *  `ghTarget` is the currently configured `owner/repo`, used to confirm
 *  candidates for legacy claims whose own gh target is unknown. */
export function reconcileClaim(
	claim: PendingCreateClaim,
	candidates: readonly { readonly title: string; readonly body: string; readonly target: string; readonly ref: string }[],
	ghTarget?: string | undefined,
): { readonly ok: true; readonly ref: string } | { readonly ok: false; readonly reason: string; readonly verifiedCount: number } {
	const verified = candidates.filter(c => verifyRecoveryCandidate(claim, c, ghTarget));
	if (verified.length === 1) return { ok: true, ref: verified[0]!.ref };
	if (verified.length === 0) return { ok: false, verifiedCount: 0, reason: `no marker-verified candidate for ${pendingCreatePath(claim.repo, claim.epicHash)}` };
	return { ok: false, verifiedCount: verified.length, reason: `${verified.length} marker-verified candidates for ${pendingCreatePath(claim.repo, claim.epicHash)} (${verified.map(v => v.ref).join(', ')}); human resolves` };
}

// re-export for tests that inspect the artifacts dir
export function listPendingCreateFiles(repoPath: string): string[] {
	try { return readdirSync(join(repoPath, ARTIFACTS_DIR)).filter(f => f.startsWith('PENDING-CREATE-')); } catch { return []; }
}

void statSync;
void mkdirSync;
void issueArtifactId;
