/**
 * The approval and review paths with and without a LifecycleService. With one, the full integrity check runs, the approval is
 * applied through it, the change log is kept in step with the writers outside the store, and a BUILD approval completes the Story.
 * Without one the gates behave as they always have.
 *
 * Run: npx tsx --test src/workflow/__tests__/gates-lifecycle-service.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync as mkdtempRaw, readFileSync, rmSync as rmRaw, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after as afterAll, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { envelopeProvider } from '../review-pipeline/__tests__/enveloped.js';

// The review reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempRaw(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmRaw(STORE_DIR, { recursive: true, force: true });
});

import type { LLMMessage, LLMProvider, LLMResponse, StructuredCompletionOpts, StructuredSchema } from '../../shared/types.js';
import { createCompletionEvidence } from '../artifact-core/completion-evidence.js';
import { History } from '../artifact-core/history.js';
import { LifecycleService } from '../artifact-core/lifecycle-service.js';
import { LifecycleConflictError } from '../artifact-core/types.js';
import { createRepoLifecycle } from '../artifact-core/repo-lifecycle.js';
import { durableKit } from '../artifact-core/__tests__/durable-kit.js';
import { ackStaleArtifact, approveWorkflowTarget, rejectArtifactByJsonPath } from '../gates.js';
import { staleAckOf } from '../artifact-core/stale-ack.js';
import { reviewArtifactFile } from '../review/run-artifact.js';
import { artifactJsonPath } from '../storage.js';
import { H, alice, artifact, bob, clock, kit } from '../artifact-core/__tests__/store-kit.js';
import { EPIC, RECORDS, STORY, T1, T2, seedEpic } from '../artifact-core/__tests__/lifecycle-kit.js';
import { approveTarget } from './helpers/approve.js';

const BUILD = `BUILD-${H}-s1`;
const CR = `CR-${H}-s1`;
const PLAN = `PLAN-${H}-s2`;

function serviceFor(k: ReturnType<typeof kit>): LifecycleService {
	return new LifecycleService({ store: k.store, evidence: ctx => createCompletionEvidence(k.repo, { ...ctx, enforce: false, history: new History(k.sidecar) }), now: clock() });
}
const readHead = (k: ReturnType<typeof kit>, id: string) => JSON.parse(readFileSync(artifactJsonPath(k.repo, id), 'utf8')) as { meta: Record<string, unknown>; body: unknown };

test('with a service, an explicit override over an advisory-blocked code review completes the Story through a real approval and the reason is on the complete entry', async () => {
	const k = kit();
	try {
		await seedEpic(k);
		// the BUILD record says both Tasks passed; the code review blocks, but enforcement is off, so the gate only advises
		await k.store.write({ ...(await k.store.read(BUILD)), payload: { body: { tasks: [{ id: 't1', passed: true }, { id: 't2', passed: true }] }, citations: [] } }, alice);
		await k.store.write({ ...(await k.store.read(CR)), payload: { body: { verdict: 'block', counts: { high: 1, med: 0, low: 0 } }, citations: [] } }, alice);
		// each Task has its own head, so its build is judged by the rounds on its own log (s7)
		for (const t of [T1, T2]) {
			await new History(k.sidecar).appendLog(t, { id: `round-${t}`, actor: bob, timestamp: '2026-10-21T12:00:00.000Z', operation: 'update', outcome: { result: 'pass', summary: 'ok', data: { kind: 'build-round' } } });
		}
		const svc = serviceFor(k);
		await svc.completeIfRolledUp(T1, bob);
		await svc.completeIfRolledUp(T2, bob);
		assert.equal((await k.store.read(STORY)).lifecycle.status, 'draft', 'an advisory-blocked review holds the Story back');

		const result = await approveWorkflowTarget(
			{ repoPath: k.repo, artifactPath: artifactJsonPath(k.repo, BUILD), overrideReview: 'known gap, tracked elsewhere', lifecycle: svc, actor: bob },
			{ enforce: false },
		);
		assert.equal(result.skipped.length, 0, JSON.stringify(result.skipped));
		assert.equal(result.approved.length, 1);

		// the approval was applied through the service, with the override on it
		const build = await k.store.read(BUILD);
		assert.equal(build.lifecycle.status, 'completed', 'the BUILD record was completed with its Story');
		assert.equal(build.lifecycle.approval?.override?.reason, 'known gap, tracked elsewhere');
		assert.equal(readHead(k, BUILD).meta['approvedAt'], undefined, 'and no stamp follows');

		// the Story and then the Epic completed once, with the override reason on the Story's entry
		const story = await k.store.readWithHistory(STORY);
		assert.equal(story.lifecycle.status, 'completed');
		const completes = story.changeLog.filter(e => e.operation === 'complete');
		assert.equal(completes.length, 1);
		assert.deepEqual(completes[0]?.outcome?.data, { codeReviewOverride: 'known gap, tracked elsewhere' });
		assert.equal((await k.store.read(EPIC)).lifecycle.status, 'completed');
		for (const record of RECORDS) assert.equal((await k.store.read(record)).lifecycle.status, 'completed', record);
	} finally { k.done(); }
});

const ARTIFACT = '# Story s2\n\n- t1: extend the two exported constants in foo.\n';
const EXTRACT_JSON = {
	claims: [{ id: 'c-inv', ref: 's1/t1', kind: 'inventory', text: 'There are exactly two exported constants in foo.', anchors: ['src/foo.ts'], probe: { greps: ['^export const'] } }],
};
const fixProvider = (): LLMProvider => envelopeProvider({
	supportsTools: false,
	capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
	async complete(): Promise<LLMResponse> { return { text: '', stopReason: 'end_turn' }; },
	async *stream(): AsyncIterable<string> { /* unused */ },
	async embed(): Promise<number[]> { return []; },
	async completeStructured<T>(_m: LLMMessage[], schema: StructuredSchema, _o?: StructuredCompletionOpts): Promise<T> {
		const props = (schema as { properties?: Record<string, unknown> | undefined }).properties ?? {};
		return ('claims' in props ? EXTRACT_JSON : {
			severity: 'HIGH', evidence: 'ripgrep re-derived THREE `export const` sites, not two.', action: 'Correct the count to three.', fixability: 'auto',
			proposedFix: { rationale: 'Grep found three.', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] },
		}) as T;
	},
});

async function reviewedPlan(): Promise<{ approvalError: unknown; logTail: number | undefined; headRevision: number; reviewed: number | undefined; operations: string[] }> {
	const k = kit();
	try {
		await k.store.write(artifact(`DEF-${H}`), alice);
		await k.store.write(artifact(PLAN, { payload: { body: { tasks: ['extend the two exported constants in foo.'] }, citations: [] } }), alice);
		mkdirSync(join(k.repo, 'src'), { recursive: true });
		writeFileSync(join(k.repo, 'src', 'foo.ts'), 'export const alpha = 1;\nexport const beta = 2;\nexport const gamma = 3;\n');
		const md = join(k.repo, 'PLAN.md');
		writeFileSync(md, ARTIFACT);
		const svc = serviceFor(k);
		const res = await reviewArtifactFile({
			mdPath: md, jsonPath: artifactJsonPath(k.repo, PLAN), repo: k.repo, provider: fixProvider(), model: 'fake',
			reviewedAt: '2026-07-20T00:00:00.000Z', reReview: false, lifecycle: svc, actor: bob,
		});
		assert.equal(res.applied.length, 1, 'the auto-fix was applied');
		const head = await k.store.readWithHistory(PLAN);
		assert.equal(head.lifecycle.revision.number, 2, 'the auto-fix minted a revision');
		const tail = [...head.changeLog].reverse().find(e => e.revision !== undefined);
		const approvalError = await svc.apply(PLAN, 'approve', bob).then(() => undefined, (e: unknown) => e);
		return { approvalError, logTail: tail?.revision?.number, headRevision: head.lifecycle.revision.number, reviewed: head.lifecycle.review?.revision, operations: head.changeLog.map(e => e.operation) };
	} finally { k.done(); }
}

test('a review auto-fix or BUILD hook rewrite keeps the log in step so the next approval is not head-ahead-of-log', async () => {
	// with the service the auto-fix write is followed by its log entry, and the approval goes through
	const withService = await reviewedPlan();
	assert.equal(withService.logTail, withService.headRevision);
	assert.equal(withService.approvalError, undefined);
	// the review itself is recorded on the lifecycle too, bound to the revision the auto-fix left
	assert.equal(withService.reviewed, withService.headRevision);
	assert.deepEqual(withService.operations, ['create', 'update', 'review', 'review'], 'the review report is an entry of the log, and the lifecycle review that names it follows');

	// the BUILD hook: a record rewritten by ensureBuildRecordOnCompletion is followed by its entry as well
	const k = kit();
	try {
		await seedEpic(k);
		const svc = serviceFor(k);
		const before = (await k.store.readWithHistory(BUILD)).changeLog.length;
		const result = await approveWorkflowTarget({ repoPath: k.repo, artifactPath: artifactJsonPath(k.repo, BUILD), overrideReview: 'no code review yet', lifecycle: svc, actor: bob }, { enforce: false });
		assert.equal(result.skipped.length, 0, JSON.stringify(result.skipped));
		const build = await k.store.readWithHistory(BUILD);
		const tail = [...build.changeLog].reverse().find(e => e.revision !== undefined);
		assert.equal(tail?.revision?.contentHash, build.lifecycle.revision.contentHash, 'the log ends at the head the hook left');
		assert.ok(build.changeLog.length >= before + 1, 'the approval was logged');
		assert.equal(build.lifecycle.status, 'approved');
		// the hook added body.tasks, a content change: it went through the store as an update, before the approval
		assert.equal(build.lifecycle.revision.number, 2);
		assert.deepEqual(build.changeLog.slice(-2).map(e => e.operation), ['update', 'approve']);
		assert.equal(build.lifecycle.approval?.revision, 2, 'the approval is of the revision the hook left');
	} finally { k.done(); }
});

test('a service built over the repository files approves through the lifecycle, and the approval is the lifecycle\'s', async () => {
	const k = kit();
	try {
		await k.store.write(artifact(`DEF-${H}`), alice);
		await k.store.write(artifact(PLAN), alice);
		const result = await approveTarget({ repoPath: k.repo, artifactPath: artifactJsonPath(k.repo, PLAN) }, { enforce: false });
		assert.equal(result.approved.length, 1);
		assert.equal(result.skipped.length, 0);
		assert.equal(readHead(k, PLAN).meta['approvedAt'], undefined, 'no stamp');
		assert.equal((await k.store.read(PLAN)).lifecycle.status, 'approved', 'the lifecycle is approved');
		const log = await createRepoLifecycle(k.repo).history.log(PLAN);
		assert.equal(log.filter(e => e.operation === 'approve').length, 1, 'and the approval is logged, in the files of the repository');
	} finally { k.done(); }
});

test('with a service, an approval the service refuses leaves the head as it was, and a review bound to the revision lets it through', async () => {
	const k = kit();
	try {
		await k.store.write(artifact(`DEF-${H}`), alice);
		const lld = `LLD-${H}-s1`;
		await k.store.write(artifact(lld), alice);
		const path = artifactJsonPath(k.repo, lld);
		const before = readFileSync(path, 'utf8');
		const svc = serviceFor(k);

		// a design record with no review bound to its revision is refused
		const refused = await approveWorkflowTarget({ repoPath: k.repo, artifactPath: path, lifecycle: svc, actor: bob }, { enforce: false });
		assert.deepEqual(refused.approved, []);
		assert.equal(refused.skipped.length, 1);
		assert.match(refused.skipped[0]?.reason ?? '', /review/i);
		assert.equal(readFileSync(path, 'utf8'), before, 'the head is as it was');
		assert.equal((await k.store.read(lld)).lifecycle.status, 'draft');

		// the other party reviews it: the review is bound to the revision and the approval goes through
		await svc.apply(lld, 'review', bob, { review: { reviewer: bob, party: 'daemon', verdict: 'pass', counts: { high: 0, med: 0, low: 0 } } });
		const ok = await approveWorkflowTarget({ repoPath: k.repo, artifactPath: path, lifecycle: svc, actor: bob }, { enforce: false });
		assert.equal(ok.skipped.length, 0, JSON.stringify(ok.skipped));
		const approved = await k.store.read(lld);
		assert.equal(approved.lifecycle.status, 'approved');
		assert.equal(approved.lifecycle.review?.revision, approved.lifecycle.revision.number);
	} finally { k.done(); }
});

test('with a service, an artifact in a status the table has no approval from is refused and left as it is', async () => {
	const k = kit();
	try {
		await k.store.write(artifact(`DEF-${H}`), alice);
		await k.store.write(artifact(PLAN), alice);
		const svc = serviceFor(k);
		await svc.apply(PLAN, 'reject', bob, { reason: 'not this one' });
		const path = artifactJsonPath(k.repo, PLAN);
		const before = readFileSync(path, 'utf8');
		const result = await approveWorkflowTarget({ repoPath: k.repo, artifactPath: path, lifecycle: svc, actor: bob }, { enforce: false });
		assert.deepEqual(result.approved, []);
		assert.match(result.skipped[0]?.reason ?? '', /cannot be approved from rejected/);
		assert.equal(readFileSync(path, 'utf8'), before, 'nothing was written');
		assert.equal((await k.store.read(PLAN)).lifecycle.status, 'rejected');
	} finally { k.done(); }
});

test('gates-lifecycle-service.test.ts: rejection and stale acknowledgement go through LifecycleService', async () => {
	const k = durableKit();
	try {
		await k.store.write(artifact(`DEF-${H}`), alice);
		await k.store.write(artifact(`HLD-${H}`), alice);
		const lld = `LLD-${H}-s1`;
		await k.store.write(artifact(lld, { }), alice);
		const svc = new LifecycleService({ store: k.store, evidence: ctx => createCompletionEvidence(k.repo, { ...ctx, enforce: false, history: new History(k.sidecar) }), now: clock() });
		const path = artifactJsonPath(k.repo, lld);
		const stamps = ['approvedAt', 'rejectedAt', 'rejectReason', 'staleAckedAt', 'staleAckedReason', 'reviewOverride'];
		const noStamps = (): void => { for (const f of stamps) assert.equal(readHead(k, lld).meta[f], undefined, f); };

		// stale acknowledgement: the artifact is marked stale against its HLD, then acknowledged; the entry keeps the reason and the time
		const ack = await ackStaleArtifact(path, 'known inconsistency, scheduled', { lifecycle: svc, actor: bob });
		assert.equal(ack.path, path);
		assert.equal(ack.reason, 'known inconsistency, scheduled');
		const afterAck = await k.store.readWithHistory(lld);
		assert.deepEqual(afterAck.changeLog.filter(e => e.operation === 'mark-stale' || e.operation === 'ack-stale').map(e => e.operation), ['mark-stale', 'ack-stale']);
		assert.equal(afterAck.lifecycle.stale, undefined, 'the acknowledgement clears the stale mark');
		assert.deepEqual(staleAckOf(k.repo, lld), { at: ack.ackedAt, reason: 'known inconsistency, scheduled' });
		assert.equal(ack.ackedAt, afterAck.changeLog.find(e => e.operation === 'ack-stale')?.timestamp);
		noStamps();

		// rejection: the lifecycle takes the artifact to rejected and the entry keeps the reason
		const rejection = await rejectArtifactByJsonPath(path, 'not enough detail', { lifecycle: svc, actor: bob });
		assert.equal(rejection.rejectReason, 'not enough detail');
		const afterReject = await k.store.readWithHistory(lld);
		assert.equal(afterReject.lifecycle.status, 'rejected');
		const entry = afterReject.changeLog.find(e => e.operation === 'reject');
		assert.deepEqual([entry?.outcome?.result, entry?.outcome?.summary, entry?.actor.id], ['rejected', 'not enough detail', bob.id]);
		assert.equal(rejection.rejectedAt, entry?.timestamp);
		noStamps();

		// an empty reason is refused before the lifecycle is asked, and a rejected artifact cannot be rejected again
		await assert.rejects(rejectArtifactByJsonPath(path, '  ', { lifecycle: svc }), /non-empty/);
		await assert.rejects(rejectArtifactByJsonPath(path, 'again', { lifecycle: svc }), /not a step from rejected/);
		await assert.rejects(ackStaleArtifact(path, '', { lifecycle: svc }), /reason is required/);
	} finally { k.done(); }
});
