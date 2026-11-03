/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A raw writer (writeArtifact kind 'content') redrafts an approved artifact, which leaves its head one revision past its log.
 * The daemon's approve handler and the review-decision step approve it again: the service logs the redraft as an adopted
 * update first. The design-run writer's redraft and resolve-comment's revise are both writeArtifact content writes, made here
 * in the shape each makes them.
 *
 * Run: npx tsx --test src/daemon/__tests__/lifecycle-adopt-wiring.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';

// The approval reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => {
	await closeGraphStore();
	rmSync(STORE_DIR, { recursive: true, force: true });
});

import { artifact as makeArtifact, H } from '../../workflow/artifact-core/__tests__/store-kit.js';
import type { Actor } from '../../workflow/artifact-core/types.js';
import type { WorkflowApproveResult } from '../../workflow/gates.js';
import { handleReviewDecision } from '../../workflow/review-decision.js';
import type { ReviewDecisionResult } from '../../workflow/review-decision.js';
import { artifactJsonPath, writeArtifact } from '../../workflow/storage.js';
import { lifecycleFor, resetLifecycleRegistry } from '../lifecycle-registry.js';
import { handleWorkflowApprove } from '../workflow-approve.js';
import '../../workflow/__tests__/helpers/converted-repos.js';

const alice: Actor = { id: 'github:alice', kind: 'person', properties: {} };
const PLAN_A = `PLAN-${H}-s1`;
const PLAN_B = `PLAN-${H}-s2`;

const repos: string[] = [];
afterEach(() => { resetLifecycleRegistry(); for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true }); });

/** A repository with a Define and two PLAN drafts, written through the registry's durable store. */
async function seeded(): Promise<string> {
	const repo = mkdtempSync(join(tmpdir(), 'lifecycle-adopt-wiring-'));
	repos.push(repo);
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const { store } = lifecycleFor(repo);
	await store.write(makeArtifact(`DEF-${H}`), alice);
	for (const id of [PLAN_A, PLAN_B]) await store.write(makeArtifact(id), alice);
	return repo;
}

const approving = (repo: string, id: string) =>
	handleWorkflowApprove({ repo, artifactPath: artifactJsonPath(repo, id) }) as Promise<WorkflowApproveResult>;

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
