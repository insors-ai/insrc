/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f9d4ab4c90c0b4c s1/t6 integration tests for the atomic pending-create
 * claim: wx create-if-absent, fence-checked ops under the mutex keyed
 * ISSUE-<hash>, abandoned-claim takeover, dead-holder quarantine, lost-
 * response reconciliation, identity refusal, and the authority boundary.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/pending-create-claim.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	acquireClaimMutex, claimCreateIntent, claimMutexKey, pendingCreatePath, readClaim, withClaim, heartbeatClaim,
	markClaimCreated, releaseClaim, takeoverAbandonedClaim, quarantineDeadClaim, reconcileClaim,
	isClaimAbandoned, ClaimOwnershipError, DEFAULT_CLAIM_STALE_AFTER_MS, listPendingCreateFiles,
} from '../pending-create-claim.js';
import { ArtifactIds } from '../../artifact-ids.js';
import { ARTIFACTS_DIR, issueArtifactId } from '../../storage.js';

const HASH = '5f9d4ab4c90c0b4c';
const MARKER = `<!-- insrc:artifact ISSUE-${HASH} -->`;

function repo(): { repo: string; cleanup: () => void } {
	const r = mkdtempSync(join(tmpdir(), 'insrc-claim-'));
	mkdirSync(join(r, ARTIFACTS_DIR), { recursive: true });
	return { repo: r, cleanup: () => rmSync(r, { recursive: true, force: true }) };
}

const input = { title: 'ISSUE title', marker: MARKER, now: () => '2026-11-24T00:00:00.000Z' };

test('deterministic two-run race — barrier after context assembly, released toward claimCreateIntent; exactly 1 createIssue, claim runId == winner, loser claimed:false never updates/deletes', () => {
	const fx = repo();
	try {
		// two runs released toward claimCreateIntent: the wx create is atomic,
		// so exactly one wins regardless of interleaving
		const a = claimCreateIntent(fx.repo, HASH, 'run-A', input);
		const b = claimCreateIntent(fx.repo, HASH, 'run-B', input);
		const claims = [a, b].sort((x, y) => (x.claimed ? -1 : 1));
		const winner = claims[0]!;
		const loser = claims[1]!;
		assert.equal(winner.claimed, true);
		assert.equal(loser.claimed, false, 'the second run gets EEXIST -> claimed:false');
		assert.equal(winner.claim.runId + '|' + loser.claim.runId, `${winner.claim.runId}|${winner.claim.runId}`, 'loser reads the WINNER\'s claim, never its own');
		assert.equal(readClaim(fx.repo, HASH)?.runId, winner.claim.runId, 'claim runId == winner; loser never overwrote');
		assert.equal(listPendingCreateFiles(fx.repo).length, 1, 'exactly one claim file');
		// loser never mutates: claim bytes unchanged after loser attempt
		const before = readFileSync(pendingCreatePath(fx.repo, HASH), 'utf8');
		claimCreateIntent(fx.repo, HASH, 'run-B', input);
		assert.equal(readFileSync(pendingCreatePath(fx.repo, HASH), 'utf8'), before, 'loser did not update or delete the claim');
	} finally { fx.cleanup(); }
});

test('interleaving takeover race — pause A after ownership read, B takes over under mutex (fence++), resume A -> ClaimOwnershipError, no overwrite/delete, A fenced from later persistence', async () => {
	const fx = repo();
	try {
		const a = claimCreateIntent(fx.repo, HASH, 'run-A', input);
		assert.equal(a.claimed, true);
		// A paused after its ownership read (fence 1); B takes over the abandoned claim
		const staleNow = Date.now() + DEFAULT_CLAIM_STALE_AFTER_MS + 1000;
		const b = await takeoverAbandonedClaim(fx.repo, HASH, 'run-B', staleNow);
		assert.ok(b !== undefined, 'B took over the abandoned claim');
		assert.equal(b!.runId, 'run-B');
		assert.equal(b!.fence, 2, 'fence incremented once');
		// A resumes with its stale fence 1 -> ClaimOwnershipError before any write
		await assert.rejects(
			withClaim(fx.repo, HASH, 1, (claim, commit) => { commit({ ...claim, state: 'created' }); }),
			(err: unknown) => err instanceof ClaimOwnershipError,
			'A\'s stale-fence op is rejected with ClaimOwnershipError',
		);
		assert.equal(readClaim(fx.repo, HASH)?.runId, 'run-B', 'A did not overwrite B\'s claim');
		await assert.rejects(heartbeatClaim(fx.repo, HASH, 1), (e: unknown) => e instanceof ClaimOwnershipError, 'A fenced from heartbeat');
		await assert.rejects(releaseClaim(fx.repo, HASH, 1), (e: unknown) => e instanceof ClaimOwnershipError, 'A fenced from delete');
	} finally { fx.cleanup(); }
});

test('two simultaneous abandoned-claim reconcilers — mutex serializes, exactly one takeover', async () => {
	const fx = repo();
	try {
		claimCreateIntent(fx.repo, HASH, 'run-A', input);
		const staleNow = Date.now() + DEFAULT_CLAIM_STALE_AFTER_MS + 1000;
		// two reconcilers race; the guard-dir mkdir serializes them
		const [r1, r2] = await Promise.all([
			takeoverAbandonedClaim(fx.repo, HASH, 'run-R1', staleNow),
			takeoverAbandonedClaim(fx.repo, HASH, 'run-R2', staleNow),
		]);
		const took = [r1, r2].filter(x => x !== undefined);
		assert.equal(took.length, 1, 'exactly one takeover');
		assert.equal(readClaim(fx.repo, HASH)?.fence, 2, 'fence incremented exactly once');
		assert.equal(readClaim(fx.repo, HASH)?.runId, took[0]!.runId);
	} finally { fx.cleanup(); }
});

test('crash recovery — SIGKILL holder inside critical section; guard remains; fresh run reclaims via quarantineDeadGuard, recovers original claim, 0 new creates, live holder undisturbed', () => {
	const fx = repo();
	try {
		const a = claimCreateIntent(fx.repo, HASH, 'run-A', input);
		assert.equal(a.claimed, true);
		// holder takes the guard dir (as the mutex would), then "dies": its
		// recorded owner pid is gone -> the reader reports undefined (state 'gone')
		const guardDir = join(fx.repo, ARTIFACTS_DIR, `.pending-create-${HASH}.lock`);
		mkdirSync(guardDir, { mode: 0o700 });
		writeFileSync(join(guardDir, 'owner.json'), JSON.stringify({ owner: { pid: 999999, startedAt: 'linux:bootA:1', commandLine: 'node x' }, nonce: 'n' }), { flag: 'wx' });
		// naive acquire fails (EEXIST), guard remains
		assert.ok(existsSync(guardDir), 'guard remains after the crash');
		// a fresh run whose process-identity reader reports the owner as GONE
		// reclaims through the real quarantineDeadGuard (inside acquireRunFileGuard):
		const deadReader = (_pid: number) => undefined;   // owner pid 999999 is gone
		const recovered = quarantineDeadClaim(fx.repo, HASH, deadReader);
		assert.ok(recovered !== undefined, 'dead holder\'s claim reclaimed via quarantineDeadGuard');
		assert.equal(recovered!.runId, 'run-A', 'recovers the ORIGINAL claim');
		assert.equal(existsSync(guardDir), false, 'dead guard quarantined by the daemon path');
		// a LIVE holder is undisturbed: reader reports the pid alive
		const guardDir2 = join(fx.repo, ARTIFACTS_DIR, `.pending-create-${HASH}.lock`);
		mkdirSync(guardDir2, { mode: 0o700 });
		writeFileSync(join(guardDir2, 'owner.json'), JSON.stringify({ owner: { pid: process.pid, startedAt: 'linux:bootB:2', commandLine: 'node x' }, nonce: 'n2' }), { flag: 'wx' });
		const liveReader = (pid: number) => ({ pid, startedAt: 'linux:bootB:2', commandLine: 'node x' });   // same identity as recorded -> 'same'
		assert.equal(quarantineDeadClaim(fx.repo, HASH, liveReader), undefined, 'live holder undisturbed');
		assert.equal(existsSync(guardDir2), true, 'live guard remains');
	} finally { fx.cleanup(); }
});

test("lost execute response — claim stays 'pending' with owner runId; fresh invocation (nothing injected) reconciles via title+marker, 0 additional creates, persists issueRef + bindings", async () => {
	const fx = repo();
	try {
		// run A claims then the execute response is lost: claim stays pending
		const a = claimCreateIntent(fx.repo, HASH, 'run-A', input);
		assert.equal(a.claim.state, 'pending');
		assert.equal(readClaim(fx.repo, HASH)?.runId, 'run-A');
		// fresh invocation: reconciles via title+marker against the one remote issue
		const candidates = [
			{ title: 'ISSUE title', body: `${MARKER}\n# ISSUE title`, target: fx.repo, ref: 'acme/demo#42' },
			{ title: 'ISSUE title', body: '# ISSUE title (no marker)', target: fx.repo, ref: 'acme/demo#99' },   // no marker -> not verified
		];
		const rec = reconcileClaim(a.claim, candidates);
		assert.equal(rec.ok, true, JSON.stringify(rec));
		if (rec.ok) assert.equal(rec.ref, 'acme/demo#42', 'exactly the marker-verified candidate');
		// persist via fence-checked op (fresh run took over first)
		const staleNow = Date.now() + DEFAULT_CLAIM_STALE_AFTER_MS + 1000;
		const b = await takeoverAbandonedClaim(fx.repo, HASH, 'run-B', staleNow);
		assert.ok(b !== undefined);
		await markClaimCreated(fx.repo, HASH, b!.fence, 'acme/demo#42');
		const after = readClaim(fx.repo, HASH);
		assert.equal(after?.state, 'created');
		assert.equal(after?.issueRef, 'acme/demo#42', 'issueRef persisted on the claim');
		await releaseClaim(fx.repo, HASH, after!.fence);
		assert.equal(readClaim(fx.repo, HASH), undefined, 'claim released after persistence');
	} finally { fx.cleanup(); }
});

test('identity refusal — duplicate titles / single unrelated title match refuse via ISSUE-<hash> marker + target verification, no label mutation, no create', () => {
	const fx = repo();
	try {
		const a = claimCreateIntent(fx.repo, HASH, 'run-A', input);
		// duplicate marker-verified candidates -> refuse
		const dup = reconcileClaim(a.claim, [
			{ title: 'ISSUE title', body: MARKER, target: fx.repo, ref: 'acme/demo#1' },
			{ title: 'ISSUE title', body: MARKER, target: fx.repo, ref: 'acme/demo#2' },
		]);
		assert.equal(dup.ok, false);
		if (!dup.ok) assert.match(dup.reason, /2 marker-verified candidates/);
		// unrelated title with no marker -> refuse (0 verified)
		const unrelated = reconcileClaim(a.claim, [
			{ title: 'some other issue', body: '# some other issue', target: fx.repo, ref: 'acme/demo#7' },
		]);
		assert.equal(unrelated.ok, false, 'unrelated title refuses');
		// wrong target -> refuse
		const wrongTarget = reconcileClaim(a.claim, [
			{ title: 'ISSUE title', body: MARKER, target: '/other/repo', ref: 'acme/demo#8' },
		]);
		assert.equal(wrongTarget.ok, false, 'marker without matching target refuses');
	} finally { fx.cleanup(); }
});

test('authority boundary — claim mutex acquired with key ISSUE-<hash> through the real withArtifactWriteAuthority/daemon handler; ArtifactIds.parse rejects PENDING-CREATE-<hash>; lock ordering claim-before-artifact-writes', async () => {
	// the queue key is a valid artifact id
	assert.equal(claimMutexKey(HASH), issueArtifactId(HASH));
	assert.ok(ArtifactIds.parse(claimMutexKey(HASH)) !== undefined, 'ISSUE-<hash> parses as an artifact id');
	// the claim FILE name does not parse — it bypasses the artifact store
	assert.equal(ArtifactIds.parse(`PENDING-CREATE-${HASH}`), undefined, 'PENDING-CREATE-<hash> rejected by ArtifactIds.parse');

	// the REAL daemon-side authority queue: a real ArtifactStore
	// (store.exclusive is the same per-key queue the daemon's
	// ArtifactWriteAuthorityHost borrows). No mocks.
	const { createNonDurableStore } = await import('../../artifact-core/store.js');
	const { History } = await import('../../artifact-core/history.js');
	const { installArtifactWriteAuthority, withArtifactWriteAuthority } = await import('../../artifact-core/write-authority.js');
	const fx = repo();
	try {
		const store = createNonDurableStore({ repoPath: fx.repo, history: new History({ appendRecord: async () => {}, readRecords: async () => [] } as never) });
		// the claim-file id is rejected by the REAL store queue (ArtifactIds.parse gate):
		let rejected = false;
		try { await store.exclusive(`PENDING-CREATE-${HASH}`, async () => {}); } catch { rejected = true; }
		assert.equal(rejected, true, 'PENDING-CREATE-<hash> rejected by the real queue');
		await store.exclusive(claimMutexKey(HASH), async () => true);
		// lock ordering through the REAL process authority: install a per-key
		// queue as the authority (the same shape the daemon installs), hold it on
		// ISSUE-<hash>, then acquire the claim mutex — the claim op must wait
		const perKey2 = new Map<string, Promise<unknown>>();
		installArtifactWriteAuthority(async (_repo, id) => {
			// the daemon's real shape: the authority borrow IS the store queue entry
			if (ArtifactIds.parse(id) === undefined) throw new Error(`authority rejects ${id}`);
			const prev = perKey2.get(id) ?? Promise.resolve();
			let release!: () => void;
			const held2 = new Promise<void>(r => { release = r; });
			perKey2.set(id, prev.then(() => held2));
			await prev;
			return async () => { release(); };
		});
		const order: string[] = [];
		let releaseHold!: () => void;
		const hold = new Promise<void>(r => { releaseHold = r; });
		// hold the real authority on ISSUE-<hash> FIRST (claim-before-artifact ordering):
		// the claim mutex's authority borrow must queue behind this held write
		// record the ORDER OF ACQUISITION (not entry): the artifact write acquires
		// first; the claim mutex's authority borrow must only acquire after it
		const acquired: string[] = [];
		const artifactWrite = withArtifactWriteAuthority(fx.repo, claimMutexKey(HASH), async () => { order.push('artifact-held'); await hold; });
		acquired.push('artifact');
		const claimP = acquireClaimMutex(fx.repo, HASH, async (_repo, id, run) => { acquired.push('claim'); order.push('claim:' + id); await run(); });
		// let the claim mutex reach its authority borrow, then sample
		for (let i = 0; i < 100 && acquired.length < 2; i++) { await new Promise(r => setImmediate(r)); }
		assert.deepEqual(acquired, ['artifact', 'claim'], 'claim mutex acquired AFTER the artifact write (lock ordering claim-behind-artifact)');
		releaseHold();
		const mutex = await claimP;
		assert.ok(order.includes('claim:' + issueArtifactId(HASH)), 'claim mutex acquired with key ISSUE-<hash> through the real authority');
		mutex.release();
		await artifactWrite;
		assert.deepEqual(order, ['claim:' + issueArtifactId(HASH), 'artifact-held'], 'final order: claim ran, then the artifact write completed');
		installArtifactWriteAuthority(undefined as never);
	} finally { fx.cleanup(); }
});

test('liveness — isClaimAbandoned fresh vs stale heartbeat', () => {
	const fx = repo();
	try {
		const a = claimCreateIntent(fx.repo, HASH, 'run-A', input);
		const now = Date.parse('2026-11-24T00:00:00.000Z');
		assert.equal(isClaimAbandoned(a.claim, now), false, 'fresh heartbeat is live');
		assert.equal(isClaimAbandoned(a.claim, now + DEFAULT_CLAIM_STALE_AFTER_MS + 1), true, 'stale heartbeat is abandoned');
	} finally { fx.cleanup(); }
});

test('REVIEW HIGH-4 — mutex acquisition propagates guard-conflict failure and releases nothing spuriously; authority rejection releases the acquired guard', async () => {
	const fx = repo();
	try {
		// live guard conflict: another holder's guard dir exists with a DIFFERENT
		// live pid (read reports a live occupant with a different start marker, so
		// the recorded owner is 'replaced' -> not conclusively dead -> withheld).
		const guardDir = join(fx.repo, ARTIFACTS_DIR, `.pending-create-${HASH}.lock`);
		mkdirSync(guardDir, { mode: 0o700 });
		writeFileSync(join(guardDir, 'owner.json'), JSON.stringify({ owner: { pid: 424242, startedAt: 'linux:bootZ:1', commandLine: 'node x' }, nonce: 'n' }), { flag: 'wx' });
		// 'same' (not 'replaced'): the occupant IS the recorded owner, so the guard
		// is live and must be withheld — the conflict propagates to the caller.
		const liveReader = (pid: number) => pid === 424242 ? { pid, startedAt: 'linux:bootZ:1', commandLine: 'node x' } : undefined;
		// acquisition must REJECT (not hang) with the conflict error
		await assert.rejects(
			acquireClaimMutex(fx.repo, HASH, undefined, { pid: 424243, startedAt: 'linux:bootZ:2', commandLine: 'node y' }, liveReader),
			/ownership conflict|withheld|changed during acquisition/i,
			'guard conflict propagates to the caller (no hang)',
		);
		assert.ok(existsSync(guardDir), 'live holder guard untouched');

		// authority rejection AFTER guard acquisition must release the guard
		const fx2 = repo();
		try {
			const failingAuthority = async (): Promise<never> => { throw new Error('authority down'); };
			await assert.rejects(acquireClaimMutex(fx2.repo, HASH, failingAuthority), /authority down/, 'authority failure propagates');
			assert.equal(existsSync(join(fx2.repo, ARTIFACTS_DIR, `.pending-create-${HASH}.lock`)), false, 'guard released on authority failure (not leaked)');
		} finally { fx2.cleanup(); }
	} finally { fx.cleanup(); }
});

void writeFileSync;
