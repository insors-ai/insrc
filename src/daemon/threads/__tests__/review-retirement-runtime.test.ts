import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ThreadServices, DAEMON_INFO_OP } from '../main-services.js';
import { HubClient } from '../channel.js';
import { HubStepStateStore, LocalStepStateStore, stepStateHubHandlers } from '../step-state.js';
import { servedOnSharedState } from '../method-class.js';
import { validateAllDetails } from '../../task-progress/detail-compatibility.js';

const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
test('daemon startup shutdown and dispatch allocate no review runtime or hooks', () => {
  for (const file of ['../../index.ts', '../main-services.ts', '../worker-entry.ts', '../router.ts', '../status-board.ts', '../../task-progress/detail-compatibility.ts']) {
    assert.doesNotMatch(source(file), /ProductionReviews|installProductionReviews|bindReviewTask|registerReviewProducers|installReviewCleanupOwner|setReviewProgressSource|review-request-owner|review\.lifecycle\.cleanup|worker-progress-source/);
  }
  for (const method of ['codeReview.run', 'codeReview.grounding', 'codeReview.task.start']) assert.equal(servedOnSharedState(method), false);
  const handlers = stepStateHubHandlers(new LocalStepStateStore());
  assert.equal(Object.keys(handlers).some(k => k.startsWith('step.review.')), false);
});

test('shared worker hub step state and historical progress survive without review hooks', async () => {
  const services = new ThreadServices(() => ({ startedAt: 1000, modelState: { status: 'ready' } }));
  const connection = services.connectWorker();
  const hub = new HubClient(connection.workerData.hubPort);
  try {
    assert.equal((await hub.request(DAEMON_INFO_OP, null) as { startedAt: number }).startedAt, 1000);
    const steps = new HubStepStateStore(hub);
    for (const kind of ['analyze', 'workflow'] as const) {
      const a = await steps.mint(kind, { n: 1 });
      const b = await steps.update(kind, a, { n: 2 });
      assert.notEqual(a, b);
      assert.equal(await steps.read(kind, a), undefined);
      assert.deepEqual((await steps.read(kind, b))?.payload, { n: 2 });
      await steps.release(kind, b);
      assert.equal(await steps.read(kind, b), undefined);
    }
    for (const op of ['review.lifecycle.cleanup', 'board.reviewProgress', 'step.review.mint']) await assert.rejects(hub.request(op, null), /no hub service/);
    assert.deepEqual(services.board.snapshot().threads, []);
    assert.equal(validateAllDetails('code-review', { kind: 'code-review', target: 'CR-old', initial: null, followUp: null, retries: null, publication: 'complete' }), true);
    assert.equal(validateAllDetails('code-review', { kind: 'code-review', target: 'CR-old', initial: null, followUp: null, retries: null, publication: 'invented' }), false);
  } finally { connection.disconnect(); connection.workerData.hubPort.close(); }
});
