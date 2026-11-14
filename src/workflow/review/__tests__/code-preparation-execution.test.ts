import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fixture, hash } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { TaskReviewCoordinator } from '../../code-review/task-review/coordinator.js';
import { CodeReviewWorker } from '../../code-review/task-review/worker-admission.js';
import { persistReviewWorkerAdmission } from '../../../daemon/threads/review-worker-admission.js';
import type { ReviewBootstrapInput } from '../../../daemon/threads/review-worker-contract.js';
import type { AdmittedReview } from '../../code-review/task-review/execution.js';
import type { LLMProvider } from '../../../shared/types.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import { ReviewPreparationCapacity } from '../source-session.js';
import { CodePreparation } from '../code-preparation.js';

for (const full of [false, true]) test(`shared preparation executes ${full ? 'story' : 'task'} through coordinator and fresh durable worker admission`, async t => {
 for (const workerMode of [false, true]) await t.test(workerMode ? 'worker' : 'coordinator', async () => {
  const f = await fixture(full, full ? 2 : 1), id = workerMode ? 'shared-worker' : 'shared-coordinator';
  const key = { project: f.repo, family: 'code' as const, reviewId: id };
  const limits = reviewPreparationLimits(join(f.repo, 'missing-config.json'));
  const preparation = await CodePreparation.create(key, f.deps.sources, limits, new ReviewPreparationCapacity(limits.cacheMaxBytes));
  let prepared: AdmittedReview | undefined, prepareCalls = 0, modelCalls = 0;
  const selected = full ? ['t1', 't2'] : ['t1'];
  const provider = { capabilities: { reviewActivity: true }, runReviewSession: async (prompt: string) => {
   modelCalls++;
   assert.ok(prepared, 'qualification completed before provider dispatch');
   const stored = f.read(prepared.path);
   assert.deepEqual(stored.attempts.at(-1)!.submitted, f.packet);
   if (prompt.startsWith('Derive task attribution')) return { tasks: selected.map(taskId => ({ taskId, changeIndexes: [0], testIndexes: [0] })) };
   const taskId = /"taskId":"(t\d+)"/.exec(prompt)?.[1]; assert.ok(taskId);
   return { ...structuredClone(f.result), taskId };
  } } as unknown as LLMProvider;
  const prepare: typeof preparation.prepare = async (...args) => {
   prepareCalls++; prepared = await (workerMode ? preparation.workerPrepare : preparation.prepare)(...args); return prepared;
  };
  try {
   if (workerMode) {
    const input: ReviewBootstrapInput = { key, incarnation: 'fixture-worker', attempt: 1, actionId: id, reviewer: 'daemon', submitted: f.packet, epicHash: hash, operation: 'start' };
    await persistReviewWorkerAdmission(input);
    const worker = new CodeReviewWorker(input, { sources: preparation.sources, provider: () => provider, prepare }, hash);
    worker.execute(); await worker.settled();
   } else {
    const coordinator = new TaskReviewCoordinator({ sources: preparation.sources, provider: () => provider, prepare });
    await coordinator.start(f.repo, id, 1, f.packet, { epicHash: hash }); await coordinator.settled(f.repo, id);
   }
   assert.equal(prepareCalls, 1); assert.ok(prepared);
   const done = f.read(prepared.path), attempt = done.attempts.at(-1)!;
   assert.equal(attempt.header.status, 'passed');
   assert.deepEqual(attempt['review-response'].tasks.map(task => task.taskId), selected);
   assert.equal(modelCalls, selected.length + (full ? 1 : 0));
   assert.deepEqual(attempt.submitted.reviewSet, f.packet.reviewSet);
   const receipt = await preparation.seal(prepared);
   assert.equal(receipt.attempt, 1); assert.equal(receipt.key.reviewId, id);
  } finally { await preparation.close(); f.cleanup(); }
 });
});
