/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * s4 t8: the daemon's approval and review paths run through the repository's durable LifecycleService (its registry), refuse a
 * head that is ahead of its log, record the request's person (or the gate) as the actor, and refuse a repository that cannot
 * get a registry entry.
 *
 * Run: npx tsx --test src/daemon/__tests__/lifecycle-wiring.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';

// The review reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => {
	await closeGraphStore();
	rmSync(STORE_DIR, { recursive: true, force: true });
});

import type { IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import { artifact as makeArtifact, H } from '../../workflow/artifact-core/__tests__/store-kit.js';
import { FileSidecarStore } from '../../workflow/artifact-core/sidecar-store.js';
import type { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';
import type { Actor } from '../../workflow/artifact-core/types.js';
import { approveWorkflowTarget } from '../../workflow/gates.js';
import type { WorkflowApproveResult } from '../../workflow/gates.js';
import { handleReviewDecision } from '../../workflow/review-decision.js';
import type { ReviewDecisionResult } from '../../workflow/review-decision.js';
import { artifactJsonPath, writeArtifact } from '../../workflow/storage.js';
import { lifecycleFor, resetLifecycleRegistry } from '../lifecycle-registry.js';
import { handleWorkflowApprove } from '../workflow-approve.js';
import { workflowReviewStart } from '../workflow-review-rpc.js';
import { approveTarget } from '../../workflow/__tests__/helpers/approve.js';
import '../../workflow/__tests__/helpers/converted-repos.js';

const alice: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const PLAN_A = `PLAN-${H}-s1`;
const PLAN_B = `PLAN-${H}-s2`;
const PLAN_C = `PLAN-${H}-s3`;

const repos: string[] = [];
afterEach(() => { resetLifecycleRegistry(); for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true }); });

/** A repository with a Define and three PLAN drafts, written through the registry's durable store. */
async function seeded(): Promise<string> {
	const repo = mkdtempSync(join(tmpdir(), 'lifecycle-wiring-'));
	repos.push(repo);
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const { store } = lifecycleFor(repo);
	await store.write(makeArtifact(`DEF-${H}`), alice);
	for (const id of [PLAN_A, PLAN_B, PLAN_C]) await store.write(makeArtifact(id), alice);
	return repo;
}

const approving = (repo: string, id: string, actor?: unknown) =>
	handleWorkflowApprove({ repo, artifactPath: artifactJsonPath(repo, id), ...(actor !== undefined ? { actor } : {}) }) as Promise<WorkflowApproveResult>;

test('the daemon approve handler, the review-decision step and workflowReviewStart use the repository\'s durable LifecycleService, refuse a head ahead of its log, use the request\'s person actor or insrc:approval, and a repository whose registry entry cannot be created is refused', async () => {
	const repo = await seeded();

	// workflow.approve: the approval goes through the durable service, as the gate by default and as the person when the request names one.
	const byGate = await approving(repo, PLAN_A);
	assert.equal(byGate.approved.length, 1, JSON.stringify(byGate.skipped));
	const { store } = lifecycleFor(repo);
	assert.equal((await store.read(PLAN_A)).lifecycle.approval?.by.id, 'insrc:approval');
	const byPerson = await approving(repo, PLAN_B, { id: 'github:alice' });
	assert.equal(byPerson.approved.length, 1, JSON.stringify(byPerson.skipped));
	const approval = (await store.read(PLAN_B)).lifecycle.approval;
	assert.equal(approval?.by.id, 'github:alice');
	assert.equal(approval?.by.kind, 'person');
	assert.ok(existsSync(join(repo, '.insrc', 'artifacts', `${PLAN_B}.log.jsonl`)), 'the change log is a durable line file');
	assert.ok((await store.readWithHistory(PLAN_B)).changeLog.some(e => e.operation === 'approve' && e.actor.id === 'github:alice'));

	// A head that is ahead of its log is refused, not approved.
	const tail = (await store.readWithHistory(PLAN_C)).changeLog.at(-1);
	assert.ok(tail?.revision);
	await new FileSidecarStore(repo).appendRecord('log', {
		artifactId: PLAN_C,
		entry: { ...tail, id: 'from-another-clone', timestamp: new Date(Date.parse(tail.timestamp) + 1).toISOString(), revision: { number: tail.revision.number + 1, contentHash: tail.revision.contentHash } },
	});
	const refused = await approving(repo, PLAN_C);
	assert.equal(refused.approved.length, 0);
	assert.match(refused.skipped[0]?.reason ?? '', /log-ahead-of-head/);

	// An actor that is not a namespaced id is refused rather than replaced; a repository with no registry entry is refused and nothing is approved.
	assert.match(String(((await handleWorkflowApprove({ repo, artifactPath: artifactJsonPath(repo, PLAN_C), actor: { id: 'Alice' } })) as { error: string }).error), /actor/);
	let approveCalls = 0;
	const missing = join(tmpdir(), 'lifecycle-wiring-no-such-repo');
	const noEntry = await handleWorkflowApprove({ repo: missing, artifactPath: join(missing, '.insrc', 'artifacts', `${PLAN_A}.json`) }, { approve: () => { approveCalls++; return approveTarget({ repoPath: missing }); } });
	assert.match((noEntry as { error: string }).error, /no lifecycle store/);
	assert.equal(approveCalls, 0);

	// The review-decision step hands the approval the repository's service and the request's actor (the gate's when absent).
	const captured: { lifecycle?: LifecycleService | undefined; actor?: Actor | undefined }[] = [];
	const docs = join(repo, 'docs', 'standalone', 'demo');
	mkdirSync(docs, { recursive: true });
	writeFileSync(join(docs, 'PLAN.md'), `<!-- insrc:artifact ${PLAN_C} -->\n\n# Plan\n`);
	for (const actor of [undefined, { id: 'github:alice' }]) {
		const res = await handleReviewDecision({ repo, mdPath: 'docs/standalone/demo/PLAN.md', decision: 'approve', ...(actor !== undefined ? { actor } : {}) } as never, undefined, {
			reviewer: { gitUserName: () => 'Rev', osUserName: () => 'rev' },
			lifecycleFor: r => lifecycleFor(r).service,
			approve: async req => { captured.push({ lifecycle: req.lifecycle, actor: req.actor }); return { approved: [], skipped: [{ path: req.artifactPath ?? '', reason: 'stub' }], codeReview: [] }; },
		}) as ReviewDecisionResult;
		assert.equal(res.outcome, 'withheld', JSON.stringify(res));
	}
	assert.equal(captured.length, 2);
	assert.equal(captured[0]?.lifecycle, lifecycleFor(repo).service);
	assert.equal(captured[0]?.actor?.id, 'insrc:approval');
	assert.equal(captured[1]?.actor?.id, 'github:alice');

	// workflow.review hands the review the repository's service.
	const md = join(docs, 'PLAN.md');
	const sent: IpcStreamMessage[] = [];
	let reviewLifecycle: LifecycleService | undefined;
	await workflowReviewStart({ artifactPath: md, repo }, m => sent.push(m), new AbortController().signal, {
		resolveProvider: () => ({ provider: {} as LLMProvider, model: 'fake' }),
		lifecycleFor: r => lifecycleFor(r).service,
		review: async opts => {
			reviewLifecycle = opts.lifecycle;
			return { report: { verdict: 'pass', counts: { high: 0, med: 0, low: 0 }, findings: [], artifact: PLAN_C, stage: 'plan', model: 'fake', reviewedAt: '2026-10-21T00:00:00.000Z' }, applied: [], pendingUser: [] } as never;
		},
	});
	assert.equal(reviewLifecycle, lifecycleFor(repo).service);
	assert.ok(sent.some(m => m.stream === 'done'), JSON.stringify(sent));
});

test('one registry entry per repository however its path is written, and a single-artifact approval uses the repository the artifact sits in, not the environment\'s', async () => {
	const repo = await seeded();
	assert.equal(lifecycleFor(repo), lifecycleFor(`${repo}/`));
	assert.equal(lifecycleFor(repo), lifecycleFor(join(repo, '.', 'docs', '..')));
	const other = mkdtempSync(join(tmpdir(), 'lifecycle-wiring-other-'));
	repos.push(other);
	// the call names the repository: the approval runs through that repository's own store, and a call that names none is refused
	const refused = await handleWorkflowApprove({ artifactPath: artifactJsonPath(repo, PLAN_A) }) as { error: string };
	assert.match(refused.error, /`repo` is required/);
	const result = await handleWorkflowApprove({ repo, artifactPath: artifactJsonPath(repo, PLAN_A) }) as WorkflowApproveResult;
	assert.equal(result.approved.length, 1, JSON.stringify(result.skipped));
	assert.equal((await lifecycleFor(repo).store.read(PLAN_A)).lifecycle.status, 'approved');
});

/** What a raw writer does to a head: read it, change its body and write it back with writeArtifact kind 'content'. */
function rawRedraft(repo: string, id: string, change: (body: Record<string, unknown>) => Record<string, unknown>): number {
	const path = artifactJsonPath(repo, id);
	const head = JSON.parse(readFileSync(path, 'utf8')) as { body: Record<string, unknown>; meta: { lifecycle: { revision: { number: number } } } };
	writeArtifact(path, { ...head, body: change(head.body) }, 'content');
	return (JSON.parse(readFileSync(path, 'utf8')) as typeof head).meta.lifecycle.revision.number;
}

test('an approved artifact redrafted by a raw content write is approved again through the daemon approve handler', async () => {
	const repo = await seeded();
	const first = await approving(repo, PLAN_A);
	assert.equal(first.approved.length, 1, JSON.stringify(first.skipped));
	const { store } = lifecycleFor(repo);
	assert.equal((await store.read(PLAN_A)).lifecycle.status, 'approved');

	// the redraft: the head goes to draft at the next revision and the log still ends at the approved one
	const revision = rawRedraft(repo, PLAN_A, () => ({ text: 'the design run drafted this again' }));
	assert.equal(revision, 2);
	assert.equal((await store.read(PLAN_A)).lifecycle.status, 'draft');

	const again = await approving(repo, PLAN_A);
	assert.equal(again.approved.length, 1, JSON.stringify(again.skipped));
	const read = await store.readWithHistory(PLAN_A);
	assert.equal(read.lifecycle.status, 'approved');
	assert.equal(read.lifecycle.revision.number, 2);
	const log = read.changeLog;
	const adopted = log.filter(e => e.outcome?.result === 'adopted');
	assert.equal(adopted.length, 1);
	assert.equal(adopted[0]?.actor.id, 'insrc:system');
	assert.equal(adopted[0]?.revision?.number, 2);
	assert.deepEqual(log.slice(-2).map(e => e.operation), ['update', 'approve'], 'the adopted entry comes right before the approve');
});

test('the review-decision step approves a redrafted head at the new revision, with no head-ahead-of-log', async () => {
	const repo = await seeded();
	assert.equal((await approving(repo, PLAN_B)).approved.length, 1);
	assert.equal(rawRedraft(repo, PLAN_B, body => ({ ...body, text: 'a revise by a reviewer' })), 2);
	const docs = join(repo, 'docs', 'standalone', 'demo');
	mkdirSync(docs, { recursive: true });
	writeFileSync(join(docs, 'PLAN.md'), `<!-- insrc:artifact ${PLAN_B} -->\n\n# Plan\n`);
	const res = await handleReviewDecision({ repo, mdPath: 'docs/standalone/demo/PLAN.md', decision: 'approve' } as never, undefined, {
		reviewer: { gitUserName: () => 'Rev', osUserName: () => 'rev' },
		lifecycleFor: r => lifecycleFor(r).service,
	}) as ReviewDecisionResult;
	assert.doesNotMatch(JSON.stringify(res), /head-ahead-of-log/, JSON.stringify(res));
	const { store } = lifecycleFor(repo);
	const read = await store.readWithHistory(PLAN_B);
	assert.equal(read.lifecycle.status, 'approved', JSON.stringify(res));
	assert.equal(read.lifecycle.revision.number, 2);
	assert.equal(read.changeLog.filter(e => e.outcome?.result === 'adopted').length, 1);
});

test('a redraft by the design-run writer and a revise by resolve-comment each end approved through the service', async () => {
	const repo = await seeded();
	const { store } = lifecycleFor(repo);
	// the design run re-renders the whole artifact (synthesize) and resolve-comment appends to body.openQuestions: both are writeArtifact content writes
	for (const [id, change] of [
		[PLAN_A, () => ({ text: 'the whole body re-rendered by a design run' })],
		[PLAN_B, (body: Record<string, unknown>) => ({ ...body, openQuestions: ['[review comment] please say more'] })],
	] as const) {
		assert.equal((await approving(repo, id)).approved.length, 1);
		rawRedraft(repo, id, change);
		const again = await approving(repo, id);
		assert.equal(again.approved.length, 1, `${id}: ${JSON.stringify(again.skipped)}`);
		const read = await store.readWithHistory(id);
		assert.equal(read.lifecycle.status, 'approved', id);
		assert.equal(read.changeLog.filter(e => e.outcome?.result === 'adopted').length, 1, id);
	}
});
