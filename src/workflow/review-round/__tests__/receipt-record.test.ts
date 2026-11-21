/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { persistVerificationReceipt, readReceiptRecord, ReceiptRecordUnreadableError, renderReceiptRecordMd } from '../receipt-record.js';
import type { VerificationReceipt } from '../receipt-record.js';
import { isTestRecordJsonPath, NotApprovableError, approveArtifactByJsonPath } from '../../gates.js';
import type { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import { TerminalArtifactError } from '../../artifact-core/types.js';
import type { Reference } from '../../artifact-core/types.js';
import { artifactJsonPath, receiptsArtifactId } from '../../storage.js';
import { makeRiskFamilyVerdictFinding } from '../security-finding.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import type { RoundWriter } from '../../runners/build/round-writer.js';
import { EPIC, STORY, T1, T2, TASKS, service, stubEvidence } from '../../artifact-core/__tests__/lifecycle-kit.js';
import { H, alice, bob, artifact, kit } from '../../artifact-core/__tests__/store-kit.js';

const HASH = 'abc123def4567890';
const T0 = '2026-03-01T10:00:00.000Z';

async function withRepo(fn: (repo: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-receipt-record-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	try { await fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

function receipt(id: string, over: Partial<VerificationReceipt> = {}): VerificationReceipt {
	return { id, result: 'pass', ranAt: T0, ...over };
}

describe('VerificationReceipt and its RECEIPTS record', () => {
	it('VerificationReceipt record shape (pass/fail/evidence linkage by id)', async () => {
		await withRepo(async (repo) => {
			const r = receipt('receipt-1', { result: 'fail', environment: 'docker:node22' });
			assert.equal(r.id, 'receipt-1');
			assert.equal(r.result, 'fail');
			assert.equal(r.environment, 'docker:node22');
			assert.equal(r.ranAt, T0);

			await persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: T0 }, r);
			const rec = readReceiptRecord(repo, HASH, 's1');
			assert.ok(rec);
			assert.deepEqual(rec.body.receipts, [r]);

			// A corroborated SecurityFinding references the receipt by id -- never the receipt object itself.
			const finding = makeRiskFamilyVerdictFinding('verdict-1', 'sast', 'applicable', 'server-side code present');
			const corroborated = { ...finding, receiptId: r.id };
			assert.equal(corroborated.receiptId, rec.body.receipts[0]!.id);
		});
	});

	it('RECEIPTS.md write for a security review round', async () => {
		await withRepo(async (repo) => {
			// Simulates the sandbox/mutation checkpoint of a security review's round 1
			// and round 2, each writing its own receipt as soon as it completes -- no
			// SecurityFinding object exists anywhere in this test, proving the write
			// is unconditional (pass or fail) and never gated on corroboration.
			const round1 = await persistVerificationReceipt(
				repo, { epicHash: HASH, storyId: 's1', now: T0 },
				receipt('review-sec1-round-1-sandbox', { result: 'pass', environment: 'docker:node22' }),
			);
			assert.equal(basename(round1.json), `RECEIPTS-${HASH}-s1.json`);
			assert.equal(basename(round1.md), 'RECEIPTS.md');
			let md = readFileSync(round1.md, 'utf8');
			assert.match(md, /review-sec1-round-1-sandbox/);
			assert.match(md, /pass/);
			assert.match(md, new RegExp(`insrc:artifact ${receiptsArtifactId(HASH, 's1')}`));

			// Round 2's checkpoint fails -- still recorded, unconditionally, in the same
			// Story's receipt record, independent of whether anything corroborates it.
			await persistVerificationReceipt(
				repo, { epicHash: HASH, storyId: 's1', now: T0 },
				receipt('review-sec1-round-2-sandbox', { result: 'fail', environment: 'docker:node22' }),
			);
			const rec = readReceiptRecord(repo, HASH, 's1')!;
			assert.deepEqual(
				rec.body.receipts.map(r => [r.id, r.result]),
				[['review-sec1-round-1-sandbox', 'pass'], ['review-sec1-round-2-sandbox', 'fail']],
				'both rounds\' receipts persist, pass and fail alike, with no SecurityFinding involved at any point',
			);
			md = readFileSync(round1.md, 'utf8');
			assert.match(md, /review-sec1-round-1-sandbox/);
			assert.match(md, /review-sec1-round-2-sandbox/);
			assert.match(renderReceiptRecordMd(rec), /fail/);
		});
	});

	it('an unreadable existing record is refused, not silently replaced', async () => {
		await withRepo(async (repo) => {
			await persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: T0 }, receipt('r1', { result: 'fail' }));
			const jsonPath = artifactJsonPath(repo, receiptsArtifactId(HASH, 's1'));
			const stored = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta: { createdAt: unknown } };
			stored.meta.createdAt = 12345; // damaged: createdAt is no longer a string, so the record cannot be read as one
			writeFileSync(jsonPath, JSON.stringify(stored));

			await assert.rejects(
				persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: '2026-03-01T11:00:00.000Z' }, receipt('r2')),
				(err: unknown) => err instanceof ReceiptRecordUnreadableError,
				'persisting over a record that cannot be read must be refused, never treated as absent',
			);
			// the earlier receipt's data is untouched: the refusal happened before any replacement was written
			const onDisk = JSON.parse(readFileSync(jsonPath, 'utf8')) as { body: { receipts: VerificationReceipt[] } };
			assert.deepEqual(onDisk.body.receipts.map(r => r.id), ['r1'], 'the damaged-but-intact record is left exactly as it was, not replaced');
		});
	});

	it('registered codec: first creation, a later update, decoding and history through the real lifecycle service', async () => {
		await withRepo(async (repo) => {
			// A standalone LLD head stamps the anchor RECEIPTS reads, exactly as a real Story's does.
			writeFileSync(
				join(repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`),
				`${JSON.stringify({ meta: { workflow: 'design.story', epicHash: HASH, storyId: 's1', createdAt: T0, epicCreatedAt: T0, standalone: true }, body: {} }, null, 2)}\n`,
			);
			const { store, service } = createRepoLifecycle(repo);
			const through: RoundWriter = { writer: service, actor: { id: 'insrc:build', kind: 'system', properties: {} } };
			const id = receiptsArtifactId(HASH, 's1');

			// First creation: the codec must be registered for the lifecycle-backed write to succeed at all.
			await persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: T0 }, receipt('r1'), through);
			const first = await store.read(id);
			assert.deepEqual((first.payload.body as { receipts: readonly VerificationReceipt[] }).receipts.map(r => r.id), ['r1']);

			// A subsequent update, through the same lifecycle service, appends rather than replacing.
			await persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: '2026-03-01T11:00:00.000Z' }, receipt('r2', { result: 'fail' }), through);
			const second = await store.read(id);
			assert.deepEqual((second.payload.body as { receipts: readonly VerificationReceipt[] }).receipts.map(r => r.id), ['r1', 'r2'], 'the second round appends; the first round is not lost');

			// History: both rounds are in the change log, so the earlier receipt is still readable there too.
			const { changeLog } = await store.readWithHistory(id);
			assert.equal(changeLog.length, 2, 'both lifecycle-backed writes are recorded in the change log');
		});
	});

	it("Story completion freezes RECEIPTS, and persisting after that is refused on both paths -- never silently stripping the stamp", async () => {
		const k = kit();
		try {
			const ref = (entityId: string, type: string): Reference => ({ entityId, type, relation: 'derived-from' });
			await k.store.write(artifact(`DEF-${H}`), alice);
			await k.store.write(artifact(EPIC), alice);
			await k.store.write(artifact(STORY, { parent: ref(EPIC, 'EPIC') }), alice);
			for (const t of [T1, T2]) await k.store.write(artifact(t, { parent: ref(STORY, 'STORY') }), alice);
			await k.store.write(artifact(TASKS, { parent: ref(STORY, 'STORY') }), alice);

			const svc = service(k, stubEvidence([T1, T2]));
			const through: RoundWriter = { writer: svc, actor: bob };
			const id = receiptsArtifactId(H, 's1');

			await persistVerificationReceipt(k.repo, { epicHash: H, storyId: 's1', now: T0 }, receipt('seed'), through);
			await svc.apply(STORY, 'complete', bob);
			assert.equal((await k.store.read(id)).lifecycle.status, 'completed', "the Story's completion cascade freezes RECEIPTS too, exactly like TESTS/BUILD");

			// Through the lifecycle service: the store's own terminal-content check refuses the content change.
			await assert.rejects(
				persistVerificationReceipt(k.repo, { epicHash: H, storyId: 's1', now: '2026-10-21T00:00:00.000Z' }, receipt('after-1'), through),
				TerminalArtifactError,
				'a lifecycle-backed append after completion must be refused, not silently accepted',
			);

			// The raw path (no RoundWriter) must enforce the SAME freeze -- not bypass it by never looking at the stored lifecycle.
			await assert.rejects(
				persistVerificationReceipt(k.repo, { epicHash: H, storyId: 's1', now: '2026-10-21T00:00:01.000Z' }, receipt('after-2')),
				TerminalArtifactError,
				'the raw persistence path must enforce the completed-record freeze too, not drop the stamp and succeed',
			);

			// Either way: nothing was lost, changed or silently stripped.
			const after = await k.store.read(id);
			assert.equal(after.lifecycle.status, 'completed');
			assert.deepEqual((after.payload.body as { receipts: readonly VerificationReceipt[] }).receipts.map(r => r.id), ['seed']);
		} finally { k.done(); }
	});

	it('concurrent appends through the real lifecycle service: both receipts survive, serialized rather than racing', async () => {
		await withRepo(async (repo) => {
			writeFileSync(
				join(repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`),
				`${JSON.stringify({ meta: { workflow: 'design.story', epicHash: HASH, storyId: 's1', createdAt: T0, epicCreatedAt: T0, standalone: true }, body: {} }, null, 2)}\n`,
			);
			const { store, service: svc } = createRepoLifecycle(repo);
			const through: RoundWriter = { writer: svc, actor: { id: 'insrc:build', kind: 'system', properties: {} } };
			const id = receiptsArtifactId(HASH, 's1');

			await persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: T0 }, receipt('seed'), through);

			// Two overlapping appends for the same Story's receipts: each one's own lifecycle write is serialized by
			// the store's per-id queue, but the business-level read-merge-write around it was not -- without the fix,
			// both read the same snapshot and the second write's full receipt list silently drops the first's addition.
			await Promise.all([
				persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: '2026-03-01T11:00:00.000Z' }, receipt('concurrent-a'), through),
				persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: '2026-03-01T11:00:01.000Z' }, receipt('concurrent-b'), through),
			]);

			const after = await store.read(id);
			assert.deepEqual(
				(after.payload.body as { receipts: readonly VerificationReceipt[] }).receipts.map(r => r.id).sort(),
				['concurrent-a', 'concurrent-b', 'seed'],
				'both overlapping appends must survive; neither may silently overwrite the other',
			);
			const { changeLog } = await store.readWithHistory(id);
			assert.equal(changeLog.length, 3, 'all three writes -- the seed and both concurrent appends -- are in the change log');
		});
	});

	it('concurrent appends through equivalent repoPath spellings for the same repository still serialize, not race', async () => {
		await withRepo(async (repo) => {
			writeFileSync(
				join(repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`),
				`${JSON.stringify({ meta: { workflow: 'design.story', epicHash: HASH, storyId: 's1', createdAt: T0, epicCreatedAt: T0, standalone: true }, body: {} }, null, 2)}\n`,
			);
			const { store, service: svc } = createRepoLifecycle(repo);
			const through: RoundWriter = { writer: svc, actor: { id: 'insrc:build', kind: 'system', properties: {} } };
			const id = receiptsArtifactId(HASH, 's1');

			await persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: T0 }, receipt('seed'), through);

			// The two calls below name the SAME repository under two different spellings
			// (a bare path and one with a trailing slash). The lock key has to canonicalize
			// `repoPath` -- a verbatim string key would put these on two different queues,
			// letting them race exactly like the unserialized case the prior fix addressed.
			await Promise.all([
				persistVerificationReceipt(repo, { epicHash: HASH, storyId: 's1', now: '2026-03-01T11:00:00.000Z' }, receipt('alias-a'), through),
				persistVerificationReceipt(`${repo}/`, { epicHash: HASH, storyId: 's1', now: '2026-03-01T11:00:01.000Z' }, receipt('alias-b'), through),
			]);

			const after = await store.read(id);
			assert.deepEqual(
				(after.payload.body as { receipts: readonly VerificationReceipt[] }).receipts.map(r => r.id).sort(),
				['alias-a', 'alias-b', 'seed'],
				'both overlapping appends must survive even when one call spells the repo path with a trailing slash',
			);
			const { changeLog } = await store.readWithHistory(id);
			assert.equal(changeLog.length, 3, 'all three writes are in the change log');
		});
	});

	it('approval attempt against a RECEIPTS.md/VerificationReceipt record is refused', async () => {
		const jsonPath = join('/does/not/matter', `${receiptsArtifactId(HASH, 's1')}.json`);
		assert.equal(isTestRecordJsonPath(jsonPath), true, 'a RECEIPTS json path must be recognized as a non-approvable record, matching TESTS.md\'s own prefix check');

		// approveArtifactByJsonPath refuses a non-approvable record BEFORE it ever
		// touches `opts.lifecycle` (the real approval route's own guarantee) -- a
		// cast placeholder is safe here, proven by the rejection itself.
		await assert.rejects(
			approveArtifactByJsonPath(jsonPath, { lifecycle: undefined as unknown as LifecycleService }),
			(err: unknown) => err instanceof NotApprovableError,
			'a RECEIPTS record must be refused the same way a TESTS record already is',
		);
	});
});
