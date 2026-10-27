/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * s4 t9: the controller's verdicts phase through the repository's durable LifecycleService: an applied fix is stored through
 * the service (logged, revisioned), the review is recorded on the lifecycle, and a head that is ahead of its log is
 * refused before anything is recorded.
 *
 * Run: npx tsx --test --test-force-exit src/daemon/steps/review-step/__tests__/verdicts-lifecycle.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';

const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => {
	await closeGraphStore();
	rmSync(STORE_DIR, { recursive: true, force: true });
});

import { artifact, alice, H } from '../../../../workflow/artifact-core/__tests__/store-kit.js';
import { FileSidecarStore } from '../../../../workflow/artifact-core/sidecar-store.js';
import { readReviewRecordOf } from '../../../../workflow/review/report-file.js';
import { artifactJsonPath } from '../../../../workflow/storage.js';
import { lifecycleFor, resetLifecycleRegistry } from '../../../lifecycle-registry.js';
import { fixtureReviewClient as handleReviewStep, rawReviewCall, seedTerminalFixture, CONTROLLER_DECLARATION } from './terminal-client.js';
import { _clearReviewStateStoreForTests } from '../state-store.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

const PLAN = `PLAN-${H}-s1`;
const MD = `<!-- insrc:artifact ${PLAN} -->\n\n# Story s1\n\n- t1: extend the two exported constants in foo.\n`;
const CLAIMS = {
	claims: [{ id: 'c-inv', ref: 's1/t1', kind: 'inventory', text: 'There are exactly two exported constants in foo.', anchors: ['src/foo.ts'], probe: { greps: ['^export const'] } }],
};
const WITH_AUTO_FIX = {
	verdicts: [{
		claimId: 'c-inv', severity: 'HIGH', evidence: 'ripgrep re-derived THREE `export const` sites.', action: 'Correct the count.', fixability: 'auto',
		proposedFix: { rationale: 'three', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] },
	}],
};

const repos: string[] = [];
afterEach(() => { resetLifecycleRegistry(); _clearReviewStateStoreForTests(); for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true }); });

/** A repository with a daemon-authored PLAN draft in the durable store and its markdown under docs/. */
async function fixture(): Promise<{ repo: string; md: string }> {
	const repo = mkdtempSync(join(tmpdir(), 'verdicts-lifecycle-'));
	repos.push(repo);
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, 'src', 'foo.ts'), 'export const alpha = 1;\nexport const beta = 2;\nexport const gamma = 3;\n');
	const { store } = lifecycleFor(repo);
	await store.write(artifact(`DEF-${H}`), alice);
	await store.write(artifact(PLAN, { payload: { body: { tasks: ['extend the two exported constants in foo.'] }, citations: [] } }), alice);
	// the party that authored the plan is the daemon, so the controller reviews it
	const head = JSON.parse(readFileSync(artifactJsonPath(repo, PLAN), 'utf8')) as { meta: Record<string, unknown> };
	writeFileSync(artifactJsonPath(repo, PLAN), JSON.stringify({ ...head, meta: { ...head.meta, authoredBy: 'daemon', workflow: 'plan' } }, null, 2) + '\n');
	const dir = join(repo, 'docs', 'epics', 'demo-E2026102100000000', 'S001');
	mkdirSync(dir, { recursive: true });
	const md = join(dir, 'PLAN.md');
	writeFileSync(md, MD);
	return { repo, md };
}

async function verdicts(fx: { repo: string; md: string }): Promise<{ next: string; applied?: number; error?: { message: string } }> {
	const parse = (env: Awaited<ReturnType<typeof handleReviewStep>>) => JSON.parse(env.content[0]!.text) as { state: string; next: string; applied?: number; error?: { message: string } };
	const start = parse(await handleReviewStep({ phase: 'start', artifact: fx.md, repo: fx.repo }));
	await handleReviewStep({ phase: 'claims', claims: CLAIMS, state: start.state });
	return parse(await handleReviewStep({ phase: 'verdicts', verdicts: WITH_AUTO_FIX, state: start.state } as never));
}

test('handleVerdicts with a service stores an applied fix through the service and records the review on the lifecycle, and refuses a head that is ahead of its log', async () => {
	const fx = await fixture();
	const { store } = lifecycleFor(fx.repo);
	const before = await store.readWithHistory(PLAN);

	const done = await verdicts(fx);
	assert.equal(done.next, 'done', JSON.stringify(done));
	assert.equal(done.applied, 1);

	const after = await store.readWithHistory(PLAN);
	// the fix went through the store: a logged update by the review, with the next revision
	const update = after.changeLog.at(-2);
	assert.equal(after.lifecycle.revision.number, before.lifecycle.revision.number + 1);
	assert.ok(after.changeLog.some(e => e.operation === 'update' && e.actor.id === 'insrc:review' && e.revision?.number === after.lifecycle.revision.number), JSON.stringify(update));
	assert.deepEqual((after.payload.body as { tasks: string[] }).tasks, ['extend the three exported constants in foo.']);
	// the review is stamped on the head and recorded on the lifecycle by the controller
	const stamped = JSON.parse(readFileSync(artifactJsonPath(fx.repo, PLAN), 'utf8')) as { meta: Record<string, unknown> };
	assert.equal(stamped.meta['review'], undefined, 'the head carries no review stamp');
	assert.equal(readReviewRecordOf(artifactJsonPath(fx.repo, PLAN))?.report.model, 'client', 'the report is the review entry of the log');
	assert.equal(after.lifecycle.review?.party, 'controller');
	assert.equal(after.lifecycle.review?.revision, after.lifecycle.revision.number);
	assert.ok(after.changeLog.some(e => e.operation === 'review'));
	assert.equal((await lifecycleFor(fx.repo).service.inspect(PLAN))?.integrity.ok, true);

	// A head whose log is ahead of it (a merge brought in a later entry) is refused before anything is recorded.
	const tail = after.changeLog.at(-1);
	assert.ok(tail?.revision);
	await new FileSidecarStore(fx.repo).appendRecord('log', {
		artifactId: PLAN,
		entry: { ...tail, id: 'from-another-clone', timestamp: new Date(Date.parse(tail.timestamp) + 1).toISOString(), revision: { number: tail.revision.number + 1, contentHash: tail.revision.contentHash } },
	});
	const headBefore = readFileSync(artifactJsonPath(fx.repo, PLAN), 'utf8');
	const mdBefore = readFileSync(fx.md, 'utf8');
	const refused = await verdicts(fx);
	assert.equal(refused.next, 'error');
	assert.match(refused.error?.message ?? '', /log-ahead-of-head/);
	assert.equal(readFileSync(artifactJsonPath(fx.repo, PLAN), 'utf8'), headBefore, 'nothing was recorded');
	assert.equal(readFileSync(fx.md, 'utf8'), mdBefore);
});

test('exact expected claim and assigned subset sets reject empty partial duplicate unknown and replayed verdicts before writes', async () => {
	const { getStepStateStore } = await import('../../../threads/step-state.js');
	const { loadState } = await import('../state-store.js');
	const parse = (env: Awaited<ReturnType<typeof rawReviewCall>>) => JSON.parse(env.content[0]!.text) as { next: string; error?: { code: string } };
	const fx = await fixture();
	const start = JSON.parse((await rawReviewCall({ phase: 'start', artifact: fx.md, repo: fx.repo })).content[0]!.text) as { state: string };
	const payload = await loadState(start.state);
	const first = CLAIMS.claims[0]!;
	const claims = [first, { ...first, id: 'c-second', text: 'A second complete extracted claim.' }];
	const state = { ...payload, claims, evidence: [] } as import('../types.js').ReviewStepStatePayload;
	const good = claims.map(claim => ({ claimId: claim.id, severity: 'LOW', evidence: 'read the source', action: 'none', fixability: 'manual' }));
	const seeded = await seedTerminalFixture(state, 'verdicts');
	const beforeHead = readFileSync(artifactJsonPath(fx.repo, PLAN), 'utf8');
	const beforeMd = readFileSync(fx.md, 'utf8');
	let lifecycleLookups = 0;
	const deps = { lifecycleFor: () => { lifecycleLookups++; return lifecycleFor(fx.repo).service; } };
	for (const received of [[], [good[0]!], [good[0]!, good[0]!], [good[0]!, { ...good[1]!, claimId: 'unknown' }], [good[1]!, good[1]!]]) {
		const out = parse(await rawReviewCall(seeded.input({ verdicts: received }), deps));
		assert.equal(out.next, 'error'); assert.equal(out.error?.code, 'review-verdict-set-mismatch');
		assert.equal(readFileSync(artifactJsonPath(fx.repo, PLAN), 'utf8'), beforeHead);
		assert.equal(readFileSync(fx.md, 'utf8'), beforeMd);
	}
	assert.equal(lifecycleLookups, 0, 'exact-set failures precede even inspect/repair');
	const partial = await seedTerminalFixture(state, 'verdicts', { assignedClaimIds: ['c-second'], completedVerdicts: [] });
	assert.equal(parse(await rawReviewCall(partial.input({ verdicts: [good[1]!] }), deps)).error?.code, 'review-verdict-set-mismatch', 'a correct assigned subset cannot prematurely complete the full review');
	const subset = await seedTerminalFixture(state, 'verdicts', { assignedClaimIds: ['c-second'], completedVerdicts: [good[0]!] });
	assert.equal(parse(await rawReviewCall(subset.input({ verdicts: [good[0]!] }), deps)).error?.code, 'review-verdict-set-mismatch', 'wrong assigned subset refuses even a known claim');
	const unextracted = await seedTerminalFixture({ ...payload, claims: [], evidence: [] }, 'verdicts', { extractionComplete: false });
	assert.equal(parse(await rawReviewCall(unextracted.input({ verdicts: [] }), deps)).error?.code, 'review-extraction-incomplete');
	assert.equal(lifecycleLookups, 0);
	const missing = parse(await rawReviewCall({ ...seeded.input({ verdicts: good }), reviewBudget: undefined }, deps));
	assert.equal(missing.error?.code, 'controller-budget-required');
	const legacy = parse(await rawReviewCall({ phase: 'verdicts', state: seeded.token, reviewBudget: CONTROLLER_DECLARATION, verdicts: { verdicts: good } }, deps));
	assert.equal(legacy.error?.code, 'controller-budget-incompatible');
	assert.equal(lifecycleLookups, 0);
	const done = parse(await rawReviewCall(seeded.input({ verdicts: good }), deps));
	assert.equal(done.next, 'done');
	const history = await lifecycleFor(fx.repo).store.readWithHistory(PLAN);
	const reviewCount = history.changeLog.filter(entry => entry.operation === 'review').length;
	assert.equal(parse(await rawReviewCall(seeded.input({ verdicts: good }), deps)).next, 'already_completed');
	assert.equal((await lifecycleFor(fx.repo).store.readWithHistory(PLAN)).changeLog.filter(entry => entry.operation === 'review').length, reviewCount, 'replay writes no second review entry');
	assert.equal((await getStepStateStore().read('review', seeded.token))!.payload, undefined);
	assert.equal(parse(await rawReviewCall(subset.input({ verdicts: [good[1]!] }), deps)).next, 'done', 'completed+assigned union is the full immutable set');
	const empty = await seedTerminalFixture({ ...payload, claims: [], evidence: [] }, 'verdicts', { extractionComplete: true });
	assert.equal(parse(await rawReviewCall(empty.input({ verdicts: [] }), deps)).next, 'done', 'genuine empty requires completed extraction');
});
