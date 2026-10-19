import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { closeGraphStore, getGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { UnderstandingService } from '../service.js';
import type { AnswerAttempt, AssessmentView, AssessmentScope } from '../../shared/understanding.js';
import { writeAtomic, artifactJsonPath } from '../../workflow/storage.js';
import { handleDelivery } from '../../workflow/delivery/handlers.js';
import { owner } from './fixtures/crash-writer.js';

test('Crash recovery preserves personal history, leaves delivery unchanged and never grants a pass', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'understanding-crash-'));
  const hash = 'aaaaaaaaaaaaaaaa';
  const at = '2026-10-07T09:00:00.000Z';
  const meta = { epicHash: hash, epicSlug: 'test-epic', createdAt: at, epicCreatedAt: at, approvedAt: at };
  const artifacts = [
    { id: `DEF-${hash}`, meta: { ...meta, workflow: 'define' }, body: { stories: [{ id: 's1', title: 'Completed story' }] } },
    { id: `PLAN-${hash}-s1`, meta: { ...meta, workflow: 'plan', storyId: 's1' }, body: { tasks: [{ id: 't1', title: 'First task' }, { id: 't2', title: 'Second task' }] } },
    { id: `BUILD-${hash}-s1`, meta: { ...meta, workflow: 'build', storyId: 's1' }, body: { tasks: [{ id: 't1', passed: true }, { id: 't2', passed: true }] } },
  ];
  for (const artifact of artifacts) writeAtomic(artifactJsonPath(dir, artifact.id), JSON.stringify({ meta: artifact.meta, body: artifact.body, citations: [] }));
  const beforeBytes = artifacts.map(a => readFileSync(artifactJsonPath(dir, a.id), 'utf8'));
  const beforeDelivery = handleDelivery({ repo: dir }, undefined, { now: () => at });
  assert.ok(!('error' in beforeDelivery));
  assert.ok(beforeDelivery.items.some(item => item.kind === 'story' && item.stage.stage === 'complete'));
  assert.ok(beforeDelivery.items.some(item => item.kind === 'task'));
  const unchanged = () => {
    assert.deepEqual(artifacts.map(a => readFileSync(artifactJsonPath(dir, a.id), 'utf8')), beforeBytes);
    assert.deepEqual(handleDelivery({ repo: dir }, undefined, { now: () => at }), beforeDelivery);
  };
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  const child = fork(fileURLToPath(new URL('./fixtures/crash-writer.ts', import.meta.url)), [dir],
    { execArgv: ['--import', 'tsx'], env: childEnv, silent: true });
  child.stdout?.resume();
  child.stderr?.resume();
  const abort = AbortSignal.timeout(15_000);
  const socket = createServer();
  try {
    const [message] = await once(child, 'message', { signal: abort });
    const saved = message as { scope: AssessmentScope; id: string; attempts: AnswerAttempt[]; associations: AssessmentView['associations']; hostId: string };
    const exit = once(child, 'exit');
    child.kill('SIGKILL');
    await exit;
    await closeGraphStore();
    setGraphStorePath(join(dir, 'graph.lmdb'));
    rmSync(join(dir, 'daemon.sock'), { force: true });
    socket.listen(join(dir, 'daemon.sock'));
    await once(socket, 'listening');
    const service = await UnderstandingService.open(join(dir, 'daemon.sock'));
    unchanged();
    assert.equal(service.hostId, saved.hostId);
    assert.deepEqual(await service.history(owner, saved.id), saved.attempts);
    const recovered = await service.resume(owner, saved.id);
    assert.deepEqual(recovered.associations, saved.associations);
    assert.equal(recovered.state, 'error');
    assert.equal(recovered.outcome, 'unassessed');
    assert.equal(recovered.eligibility, 'unavailable');
    const cmd = { requestId: randomUUID(), assessmentId: saved.id, expectedRevision: recovered.revision, scope: saved.scope };
    await assert.rejects(service.requestOverride(owner, cmd), /unavailable/);
    const canceled = await service.cancel(owner, cmd);
    await service.delete(owner, { ...cmd, requestId: randomUUID(), expectedRevision: canceled.view.revision, confirmed: true });
    assert.deepEqual(await service.list(owner, saved.scope.repoId), []);
    assert.equal([...(await getGraphStore()).understandingReceipt.getRange()].length, 0);
    unchanged();
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await new Promise<void>(resolve => socket.close(() => resolve()));
    await closeGraphStore();
    rmSync(dir, { recursive: true, force: true });
  }
});
