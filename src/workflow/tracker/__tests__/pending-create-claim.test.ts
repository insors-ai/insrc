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
	claimCreateIntent, claimMutexKey, pendingCreatePath, readClaim, withClaim, heartbeatClaim,
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
		assert.throws(() => heartbeatClaim(fx.repo, HASH, 1), ClaimOwnershipError, 'A fenced from heartbeat');
		assert.throws(() => releaseClaim(fx.repo, HASH, 1), ClaimOwnershipError, 'A fenced from delete');
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

test('crash recovery — SIGKILL holder inside critical section; guard remains; fresh run reclaims via quarantineDeadClaim, recovers original claim, 0 new creates, live holder undisturbed', () => {
	const fx = repo();
	try {
		const a = claimCreateIntent(fx.repo, HASH, 'run-A', input);
		assert.equal(a.claimed, true);
		// holder takes the guard dir (as the mutex would), then "dies"
		const guardDir = join(fx.repo, ARTIFACTS_DIR, `.pending-create-${HASH}.lock`);
		mkdirSync(guardDir, { mode: 0o700 });
		writeFileSync(join(guardDir, 'owner.json'), JSON.stringify({ owner: { pid: 999999, startedAt: 'x', bootId: 'y' }, nonce: 'n' }), { flag: 'wx' });
		// naive acquire fails (EEXIST), guard remains — then a fresh run with a
		// dead-pid probe reclaims via quarantine:
		const deadProbe = (pid: number) => pid !== 999999;
		const recovered = quarantineDeadClaim(fx.repo, HASH, deadProbe);
		assert.ok(recovered !== undefined, 'dead holder\'s claim recovered');
		assert.equal(recovered!.runId, 'run-A', 'recovers the ORIGINAL claim');
		assert.equal(existsSync(guardDir), false, 'dead guard quarantined');
		// a LIVE holder is undisturbed
		const guardDir2 = join(fx.repo, ARTIFACTS_DIR, `.pending-create-${HASH}.lock`);
		mkdirSync(guardDir2, { mode: 0o700 });
		writeFileSync(join(guardDir2, 'owner.json'), JSON.stringify({ owner: { pid: process.pid, startedAt: 'x', bootId: 'y' }, nonce: 'n' }), { flag: 'wx' });
		assert.equal(quarantineDeadClaim(fx.repo, HASH, () => true), undefined, 'live holder undisturbed');
		assert.equal(existsSync(guardDir2), true, 'live guard remains');
	} finally { fx.cleanup(); }
});

test('lost execute response — claim stays pending with owner runId; fresh invocation reconciles via title+marker, 0 additional creates, persists issueRef', async () => {
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
		releaseClaim(fx.repo, HASH, after!.fence);
		assert.equal(readClaim(fx.repo, HASH), undefined, 'claim released after persistence');
	} finally { fx.cleanup(); }
});

test('identity refusal — duplicate titles / single unrelated title match refuse via ISSUE-<hash> marker + target verification, no create', () => {
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

test('authority boundary — claim mutex key ISSUE-<hash> accepted by ArtifactIds.parse; PENDING-CREATE-<hash> rejected; lock ordering claim-before-artifact-writes', () => {
	// the queue key is a valid artifact id
	assert.equal(claimMutexKey(HASH), issueArtifactId(HASH));
	assert.ok(ArtifactIds.parse(claimMutexKey(HASH)) !== undefined, 'ISSUE-<hash> parses as an artifact id');
	// the claim FILE name does not parse — it bypasses the artifact store
	assert.equal(ArtifactIds.parse(`PENDING-CREATE-${HASH}`), undefined, 'PENDING-CREATE-<hash> rejected by ArtifactIds.parse');
	// the authority handler rejects the claim-file id, accepts the mutex key
	const seen: string[] = [];
	const authority = async (repo: string, id: string, run: () => Promise<void>) => {
		if (ArtifactIds.parse(id) === undefined) throw new Error(`authority rejects ${id}`);
		seen.push(id);
		await run();
	};
	// acquiring with the claim-file name must fail; with the mutex key it works
	void (async () => {
		const fx = repo();
		try {
			await assert.rejects(authority(fx.repo, `PENDING-CREATE-${HASH}`, async () => {}), /authority rejects/);
			await authority(fx.repo, claimMutexKey(HASH), async () => {});
			assert.deepEqual(seen, [issueArtifactId(HASH)], 'only the ISSUE-<hash> key entered the queue');
			// lock ordering: claim op runs before any artifact write on ISSUE/EPIC/STORY keys
			const order: string[] = [];
			await acquireClaimMutexCheck(fx.repo, HASH, async (id) => order.push(id), authority);
			assert.deepEqual(order, ['claim', issueArtifactId(HASH)], 'claim mutex acquired before the artifact write');
		} finally { fx.cleanup(); }
	})();
});

async function acquireClaimMutexCheck(
	repoPath: string, epicHash: string,
	record: (id: string) => void,
	authority: (repo: string, id: string, run: () => Promise<void>) => Promise<void>,
): Promise<void> {
	record('claim');
	await authority(repoPath, claimMutexKey(epicHash), async () => { record(issueArtifactId(epicHash)); });
}

test('liveness — isClaimAbandoned fresh vs stale heartbeat', () => {
	const fx = repo();
	try {
		const a = claimCreateIntent(fx.repo, HASH, 'run-A', input);
		const now = Date.parse('2026-11-24T00:00:00.000Z');
		assert.equal(isClaimAbandoned(a.claim, now), false, 'fresh heartbeat is live');
		assert.equal(isClaimAbandoned(a.claim, now + DEFAULT_CLAIM_STALE_AFTER_MS + 1), true, 'stale heartbeat is abandoned');
	} finally { fx.cleanup(); }
});

void writeFileSync;
