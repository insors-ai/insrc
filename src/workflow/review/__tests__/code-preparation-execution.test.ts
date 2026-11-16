import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fixture, hash } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { CodeReviewWorker } from '../../code-review/task-review/worker-admission.js';
import { persistReviewWorkerAdmission } from '../../../daemon/threads/review-worker-admission.js';
import type { ReviewBootstrapInput } from '../../../daemon/threads/review-worker-contract.js';
import type { AdmittedReview } from '../../code-review/task-review/execution.js';
import type { LLMProvider } from '../../../shared/types.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import { ReviewPreparationCapacity } from '../source-session.js';
import { CodePreparation } from '../code-preparation.js';
import { preparationDigest } from '../prepared-context.js';
import { PreparedViewReader } from '../prepared-views.js';
import { ReviewMemoryBudget } from '../preparation-memory.js';

for (const full of [false, true]) test(`source-light preparation executes ${full ? 'story' : 'task'} through fresh durable worker admission`, async () => {
  const f = await fixture(full, full ? 2 : 1), id = 'shared-worker';
  const key = { project: f.repo, family: 'code' as const, reviewId: id };
  const limits = reviewPreparationLimits(join(f.repo, 'missing-config.json'));
  const preparation = await CodePreparation.create(key, f.deps.sources, limits, new ReviewPreparationCapacity(limits.cacheMaxBytes));
  let prepared: AdmittedReview | undefined, execution: CodePreparation | undefined, sealed: Awaited<ReturnType<CodePreparation['seal']>> | undefined;
  let prepareCalls = 0, modelCalls = 0;
  const selected = full ? ['t1', 't2'] : ['t1'];
  const provider = { capabilities: { reviewActivity: true }, runReviewSession: async (prompt: string) => {
   modelCalls++;
   assert.ok(prepared, 'qualification completed before provider dispatch');
   const stored = f.read(prepared.path);
   assert.deepEqual(stored.attempts.at(-1)!.submitted, f.packet);
   if (prompt.startsWith('Derive task attribution')) return { tasks: selected.map(taskId => ({ taskId, changeIndexes: [0], testIndexes: [0] })) };
   const taskId = /"taskId":"(t\d+)"/.exec(prompt)?.[1]; assert.ok(taskId);
   assert.match(prompt, /Behavior/); assert.match(prompt, /not_run/); assert.match(prompt, /Schema\/queue fixture, not a model review/);
   return { ...structuredClone(f.result), taskId };
  } } as unknown as LLMProvider;
  const prepare: typeof preparation.workerPrepare = async (...args) => {
   prepareCalls++;
   prepared = await preparation.workerPrepare(...args);
   sealed = await preparation.seal(prepared);
   const reader = await PreparedViewReader.open(sealed, limits, new ReviewMemoryBudget(limits.memoryMaxBytes), async () => {}, async error => { throw error; });
   execution = await CodePreparation.reuse(key, reader, preparation.sources, limits, new ReviewPreparationCapacity(limits.cacheMaxBytes));
   return prepared;
  };
  try {
   const input: ReviewBootstrapInput = { key, incarnation: 'fixture-worker', attempt: 1, actionId: id, reviewer: 'daemon', submitted: f.packet, epicHash: hash, operation: 'start' };
   await persistReviewWorkerAdmission(input);
   const worker = new CodeReviewWorker(input, { sources: preparation.sources, provider: () => provider, prepare,
    taskPrompt: (...args) => {
     if (!execution) throw new Error('Source-light execution handoff missing');
     return execution.taskPrompt(...args);
    } }, hash);
   worker.execute(); await worker.settled();
   assert.equal(prepareCalls, 1); assert.ok(prepared);
   const done = f.read(prepared.path), attempt = done.attempts.at(-1)!;
   assert.equal(attempt.header.status, 'passed', JSON.stringify(attempt));
   assert.deepEqual(attempt['review-response'].tasks.map(task => task.taskId), selected);
   assert.equal(modelCalls, selected.length + (full ? 1 : 0));
   assert.deepEqual(attempt.submitted.reviewSet, f.packet.reviewSet);
   const receipt = sealed ?? await preparation.seal(prepared);
   const qualifiedIdentity = preparation.qualificationIdentity();
   assert.equal(preparationDigest(qualifiedIdentity), receipt.identityDigest);
   qualifiedIdentity.key.reviewId = 'caller-mutated-copy';
   assert.equal(preparation.qualificationIdentity().key.reviewId, receipt.key.reviewId);
   assert.equal(receipt.attempt, 1); assert.equal(receipt.key.reviewId, id);
  } finally { await execution?.close(); await preparation.close(); f.cleanup(); }
});

test('code preparation exposes no eager admission or publication fallback', async () => {
 const f = await fixture(false, 1), key = { project: f.repo, family: 'code' as const, reviewId: 'no-eager-fallback' };
 const limits = reviewPreparationLimits(join(f.repo, 'missing-config.json'));
 const preparation = await CodePreparation.create(key, f.deps.sources, limits, new ReviewPreparationCapacity(limits.cacheMaxBytes));
 try {
  assert.equal('prepare' in preparation, false);
  assert.equal('context' in preparation, false);
  await assert.rejects(preparation.publicationPacket(f.packet, preparation.sources), /cold requalification is required/);
 } finally { await preparation.close(); f.cleanup(); }
});
