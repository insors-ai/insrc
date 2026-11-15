/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGitTools } from '../../../../daemon/tools/builtins/git/index.js';
import { RegistryReviewSources } from '../sources.js';
import { TaskReviewInputError } from '../contracts.js';
import type { ReviewPacket } from '../contracts.js';
import { prepareReviewAdmission } from '../admission.js';
import { saveCheckpoint } from '../checkpoint.js';
import { CodePreparation } from '../../../review/code-preparation.js';
import { reviewPreparationLimits } from '../../../../config/review.js';
import { ReviewPreparationCapacity } from '../../../review/source-session.js';
import { PreparedContextReader } from '../../../review/prepared-context.js';
import { prepareReviewPacket } from '../packet.js';

registerGitTools();
import { routeFixture as fixture, artifact, ISSUE_ONLY, LLD_ONLY, PLAN_STORY, NO_BUILD, BUILD_ONLY, DEF_STORY } from './helpers/route-fixture.js';
const refused = (promise: Promise<unknown>, message: RegExp) => assert.rejects(promise, (error: unknown) => error instanceof TaskReviewInputError && message.test(error.message));

test('src/workflow/code-review/task-review/__tests__/route-admission.test.ts: admission builds the route from the Story\'s stored artifacts and refuses a packet that does not match it', async () => {
	const f = fixture();
	try {
		const issue = await f.admit(f.packetWith({ issue: f.at(`ISSUE-${ISSUE_ONLY}`) }), ISSUE_ONLY);
		assert.equal(issue.prepared.tasks.length, 1);
		assert.equal(issue.prepared.tasks[0]!.id, 's1');
		const lld = await f.admit(f.packetWith({ lld: f.at(`LLD-${LLD_ONLY}-s1`) }), LLD_ONLY);
		assert.equal(lld.prepared.tasks.length, 1);
		const plan = await f.admit(f.packetWith({ lld: f.at(`LLD-${PLAN_STORY}-s1`), plan: f.at(`PLAN-${PLAN_STORY}-s1`) }), PLAN_STORY);
		assert.deepEqual(plan.prepared.tasks.map(task => task.id), ['t1']);
		const trivial = await f.admit(f.packetWith({}), BUILD_ONLY);
		assert.deepEqual(trivial.prepared.tasks.map(task => task.id), ['s1'], 'a Story with only a BUILD admits the no-document route');
		assert.deepEqual(trivial.prepared.tasks[0]!.acceptanceChecks, ['Change the behaviour'], 'its check is the BUILD focus');
		await refused(f.admit(f.packetWith({ lld: f.at(`LLD-${BUILD_ONLY}-s1`) }), BUILD_ONLY), /Expected the documents none .* got lld/);
		const epic = await f.admit(f.packetWith({ story: f.at(`DEF-${DEF_STORY}`), lld: f.at(`LLD-${DEF_STORY}-s1`), plan: f.at(`PLAN-${DEF_STORY}-s1`) }), DEF_STORY);
		assert.deepEqual(epic.prepared.tasks.map(task => task.id), ['t1'], 'a Story whose epic has a DEF admits the story role');
		await refused(f.admit(f.packetWith({ lld: f.at(`LLD-${DEF_STORY}-s1`), plan: f.at(`PLAN-${DEF_STORY}-s1`) }), DEF_STORY), /Expected the documents story, lld, plan .* got lld, plan/);
		await refused(f.admit(f.packetWith({ story: f.at(`DEF-${DEF_STORY}`), lld: f.at(`LLD-${PLAN_STORY}-s1`), plan: f.at(`PLAN-${PLAN_STORY}-s1`) }), PLAN_STORY), /Expected the documents lld, plan .* got story, lld, plan/);
		await refused(f.admit(f.packetWith({}), ISSUE_ONLY), /Expected the documents issue .* got none/);
		await refused(f.admit(f.packetWith({ lld: f.at(`LLD-${LLD_ONLY}-s1`), issue: f.at(`ISSUE-${ISSUE_ONLY}`) }), LLD_ONLY), /Expected the documents lld .* got lld, issue/);
		await refused(f.admit(f.packetWith({ lld: f.at(`LLD-${PLAN_STORY}-s1`) }), PLAN_STORY), /Expected the documents lld, plan .* got lld/);
	} finally { f.cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/route-admission.test.ts: a Story with no BUILD record is refused before anything is admitted', async () => {
	const f = fixture();
	try {
		await refused(f.admit(f.packetWith({ issue: f.at(`ISSUE-${NO_BUILD}`) }), NO_BUILD, 'review-nobuild'), /exactly one task/);
		assert.equal(existsSync(join(f.repo, '.insrc', 'tmp', 'code-review')), false, 'nothing was written');
	} finally { f.cleanup(); }
});

test('src/workflow/code-review/task-review/__tests__/route-admission.test.ts: resume and publication of a stored review read no route', async () => {
	const f = fixture();
	try {
		const admitted = await f.admit(f.packetWith({ issue: f.at(`ISSUE-${ISSUE_ONLY}`) }), ISSUE_ONLY);
		await saveCheckpoint(admitted.path, { ...admitted.checkpoint });
		// the Story's artifacts change after the review started: a route read now would say something else
		rmSync(join(f.repo, artifact(`ISSUE-${ISSUE_ONLY}`)));
		const resumed = await prepareReviewAdmission(f.repo, 'review-1', 1, undefined, 'daemon', f.sources, { operation: 'resume', epicHash: ISSUE_ONLY });
		assert.deepEqual(resumed.prepared.tasks.map(task => task.id), ['s1']);
		assert.equal(admitted.attempt.header.derived?.epicHash, ISSUE_ONLY, 'admission kept the epic and the unit it derived');
		const stored = await prepareReviewPacket(admitted.attempt.submitted, f.sources, true, undefined, admitted.attempt.header.derived);
		assert.deepEqual(stored.tasks.map(task => task.id), ['s1']);
		assert.deepEqual(stored.tasks[0]!.acceptanceChecks, ['Fix it']);
		assert.equal(stored.epicHash, ISSUE_ONLY);
	} finally { f.cleanup(); }
});


test('shared preparation retains route-qualified views for pinned recovery without native refetch', async () => {
 const f = fixture();
 try {
  const limits = reviewPreparationLimits(join(f.repo, 'missing-config.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
  const key = { project: f.repo, family: 'code' as const, reviewId: 'shared-recovery' };
  const preparation = await CodePreparation.create(key, f.sources, limits, capacity);
  const packet = f.packetWith({ issue: f.at(`ISSUE-${ISSUE_ONLY}`) });
  const admitted = await preparation.prepare(f.repo, key.reviewId, 1, packet, 'daemon', f.sources, { epicHash: ISSUE_ONLY });
  await saveCheckpoint(admitted.path, admitted.checkpoint);
  const expected = await prepareReviewPacket(admitted.attempt.submitted, preparation.sources, true, undefined, admitted.attempt.header.derived);
  const receipt = await preparation.seal(admitted);
  await preparation.close();
  rmSync(join(f.repo, artifact(`ISSUE-${ISSUE_ONLY}`)));
  const reader = await PreparedContextReader.open(receipt, limits, async () => {}, async error => { throw error; });
  let nativeCalls = 0;
  const sources: typeof f.sources = new Proxy(f.sources, { get() { return async () => { nativeCalls++; throw new Error('Native access forbidden on warm recovery'); }; } });
  const cachedSources = {
   commit: (oid: string) => reader.query('commit', [oid]),
   file: (oid: string, path: string) => reader.query('file', [oid, path]),
   isAncestor: (a: string, b: string) => reader.query('isAncestor', [a, b]),
   changedRanges: (oid: string, parent: string | null, paths: readonly string[]) => reader.query('changedRanges', [oid, parent, paths]),
   pathChanges: (a: string, b: string, path: string) => reader.query('pathChanges', [a, b, path]),
  } as import('../sources.js').ReviewSources;
  const recovered = await CodePreparation.reuse(key, reader, cachedSources, limits, capacity);
  const resumed = await recovered.prepare(f.repo, key.reviewId, 1, undefined, 'daemon', sources, { operation: 'resume', epicHash: ISSUE_ONLY });
  assert.deepEqual(resumed.prepared, structuredClone(expected));
  const workerResumed = await recovered.workerPrepare(f.repo, key.reviewId, 1, undefined, 'daemon', sources, { operation: 'resume', epicHash: ISSUE_ONLY });
  assert.deepEqual(workerResumed.prepared, resumed.prepared);
  assert.equal(nativeCalls, 0);
  const changed = structuredClone(packet); changed.functionalSummary = 'changed pinned input';
  await assert.rejects(recovered.prepare(f.repo, key.reviewId, 1, changed, 'daemon', sources, { operation: 'resume', epicHash: ISSUE_ONLY }), /pinned/);
  await recovered.close();
 } finally { f.cleanup(); }
});


test('shared preparation preserves task selection and canonical story aliases across every route', async () => {
 const f = fixture();
 try {
  const routes = [
   { hash: ISSUE_ONLY, documents: { issue: f.at(`ISSUE-${ISSUE_ONLY}`) }, unit: 's1' },
   { hash: LLD_ONLY, documents: { lld: f.at(`LLD-${LLD_ONLY}-s1`) }, unit: 's1' },
   { hash: BUILD_ONLY, documents: {}, unit: 's1' },
   { hash: PLAN_STORY, documents: { lld: f.at(`LLD-${PLAN_STORY}-s1`), plan: f.at(`PLAN-${PLAN_STORY}-s1`) }, unit: 't1' },
   { hash: DEF_STORY, documents: { story: f.at(`DEF-${DEF_STORY}`), lld: f.at(`LLD-${DEF_STORY}-s1`), plan: f.at(`PLAN-${DEF_STORY}-s1`) }, unit: 't1' },
  ];
  let id = 0;
  for (const route of routes) for (const storyId of ['s1', `STORY-${route.hash}-s1`]) for (const taskId of [undefined, route.unit]) {
   const packet = { ...f.packetWith(route.documents), storyId, ...(taskId ? { taskId } : {}) };
   const admitted = await f.admit(packet, route.hash, `route-${id++}`);
   assert.deepEqual(admitted.attempt.header.selectedTaskIds, [route.unit]);
   assert.equal(admitted.prepared.packet.storyId, storyId);
   assert.equal(admitted.prepared.packet.taskId, taskId);
   assert.deepEqual(admitted.prepared.packet.reviewSet, packet.reviewSet);
   assert.deepEqual(admitted.prepared.projection!.entries[0]!.segments, [{ after: [1, 1] }]);
   assert.equal(admitted.prepared.projection!.entries.length, 1);
  }
 } finally { f.cleanup(); }
});
