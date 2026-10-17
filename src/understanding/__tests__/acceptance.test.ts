import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { closeGraphStore, getGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { UnderstandingService } from '../service.js';
import type { AnswerAttempt, AssessmentView } from '../../shared/understanding.js';
import { owner, scope } from './fixtures/crash-writer.js';

test('Crash recovery preserves personal history, leaves delivery unchanged and never grants a pass', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'understanding-crash-'));
  const delivery = join(dir, 'delivery.json');
  const original = JSON.stringify({ epic: 'approved', story: 'done', task: 'closed', approval: 'unchanged' });
  writeFileSync(delivery, original);
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
    const saved = message as { id: string; attempts: AnswerAttempt[]; associations: AssessmentView['associations']; hostId: string };
    const exit = once(child, 'exit');
    child.kill('SIGKILL');
    await exit;
    await closeGraphStore();
    setGraphStorePath(join(dir, 'graph.lmdb'));
    rmSync(join(dir, 'daemon.sock'), { force: true });
    socket.listen(join(dir, 'daemon.sock'));
    await once(socket, 'listening');
    const service = await UnderstandingService.open(join(dir, 'daemon.sock'));
    assert.equal(service.hostId, saved.hostId);
    assert.deepEqual(await service.history(owner, saved.id), saved.attempts);
    const recovered = await service.resume(owner, saved.id);
    assert.deepEqual(recovered.associations, saved.associations);
    assert.equal(recovered.state, 'error');
    assert.equal(recovered.outcome, 'unassessed');
    assert.equal(recovered.eligibility, 'unavailable');
    const cmd = { requestId: randomUUID(), assessmentId: saved.id, expectedRevision: recovered.revision, scope };
    await assert.rejects(service.requestOverride(owner, cmd), /unavailable/);
    const canceled = await service.cancel(owner, cmd);
    await service.delete(owner, { ...cmd, requestId: randomUUID(), expectedRevision: canceled.view.revision, confirmed: true });
    assert.deepEqual(await service.list(owner, scope.repoId), []);
    assert.equal([...(await getGraphStore()).understandingReceipt.getRange()].length, 0);
    assert.equal(readFileSync(delivery, 'utf8'), original);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await new Promise<void>(resolve => socket.close(() => resolve()));
    await closeGraphStore();
    rmSync(dir, { recursive: true, force: true });
  }
});
