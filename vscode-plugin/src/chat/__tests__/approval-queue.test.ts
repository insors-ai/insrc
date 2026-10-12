/**
 * ISSUE-6a811b8a S001/t1 — the chat's approval queue.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/approval-queue.test.ts
 *
 * Pure unit suite: requests from one or two turns, decided in and out of order.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalQueue, type QueuedApproval } from '../approval-queue.js';

const req = (requestId: string, over: Partial<QueuedApproval> = {}): QueuedApproval => ({
  requestId,
  turnId: 'turn-1',
  title: `${requestId} needs permission`,
  detail: '',
  toolName: 'Edit',
  blockKind: 'tool-gate',
  resolution: 'turn-ended',
  ...over,
});

test('approval queue: requests are kept in arrival order and only the head is actionable; a decision for any other id is refused', () => {
  const q = createApprovalQueue();
  q.enqueue(req('a'));
  q.enqueue(req('b'));
  q.enqueue(req('c'));
  q.enqueue(req('b')); // a duplicate id is ignored
  assert.deepEqual(q.head(), { request: req('a'), position: 1, total: 3 });

  assert.deepEqual(q.decide('b', 'approve'), { ok: false, reason: 'not-head' });
  assert.deepEqual(q.decide('zzz', 'approve'), { ok: false, reason: 'unknown' });
  assert.equal(q.head()?.request.requestId, 'a', 'a refused decision changes nothing');
  assert.equal(q.head()?.total, 3);

  assert.deepEqual(q.decide('a', 'deny'), { ok: true, decided: req('a') });
  assert.deepEqual(q.head(), { request: req('b'), position: 1, total: 2 });
  assert.deepEqual(q.decide('a', 'approve'), { ok: false, reason: 'unknown' }, 'a decided request cannot be decided again');
  assert.equal(q.has('c'), true);
  assert.equal(q.has('a'), false);
});

test('approval queue: a batch is complete only when its turn has ended and every request is decided', () => {
  const q = createApprovalQueue();
  q.enqueue(req('a'));
  q.enqueue(req('b'));
  q.decide('a', 'approve');
  assert.equal(q.takeCompletedBatch(), undefined, 'b is undecided and the turn has not ended');
  q.decide('b', 'deny');
  assert.equal(q.takeCompletedBatch(), undefined, 'all decided, but the turn has not ended');
  q.endTurn('turn-1');
  const batch = q.takeCompletedBatch();
  assert.deepEqual(batch, { turnId: 'turn-1', decisions: [{ request: req('a'), decision: 'approve' }, { request: req('b'), decision: 'deny' }] });
  assert.equal(q.takeCompletedBatch(), undefined, 'a batch is handed out once');

  // Ended first, decided later; in-turn requests never form a batch.
  q.enqueue(req('c', { turnId: 'turn-2' }));
  q.enqueue(req('d', { turnId: 'turn-2', resolution: 'in-turn' }));
  q.endTurn('turn-2');
  assert.equal(q.takeCompletedBatch(), undefined);
  q.decide('c', 'approve');
  q.decide('d', 'approve');
  assert.deepEqual(q.takeCompletedBatch(), { turnId: 'turn-2', decisions: [{ request: req('c', { turnId: 'turn-2' }), decision: 'approve' }] });

  // A turn with only in-turn requests has no batch at all.
  q.enqueue(req('e', { turnId: 'turn-3', resolution: 'in-turn' }));
  q.decide('e', 'approve');
  q.endTurn('turn-3');
  assert.equal(q.takeCompletedBatch(), undefined);
});

test('approval queue: the grant chain accumulates approved tool names once each and resets on clear()', () => {
  const q = createApprovalQueue();
  q.enqueue(req('a', { toolName: 'Edit' }));
  q.enqueue(req('b', { toolName: 'Bash', command: 'npm test' }));
  q.enqueue(req('c', { toolName: 'Edit' }));
  q.enqueue(req('d', { toolName: 'Write', blockKind: 'dir-block' }));
  q.enqueue(req('e', { toolName: 'Read' }));
  q.enqueue(req('f', { toolName: 'Grep', resolution: 'in-turn' }));
  q.decide('a', 'approve');
  q.decide('b', 'approve');
  q.decide('c', 'approve');
  q.decide('d', 'approve'); // a directory block is never a grant
  q.decide('e', 'deny');
  q.decide('f', 'approve'); // an in-turn approval is relayed, not chained
  assert.deepEqual(q.grantChain(), ['Edit', 'Bash']);

  // The chain survives a completed batch (it carries into the next batch's follow-up).
  q.endTurn('turn-1');
  assert.ok(q.takeCompletedBatch());
  assert.deepEqual(q.grantChain(), ['Edit', 'Bash']);

  q.enqueue(req('g', { turnId: 'turn-2' }));
  q.enqueue(req('h', { turnId: 'turn-2' }));
  const dropped = q.clear();
  assert.deepEqual(dropped.map((r) => r.requestId), ['g', 'h'], 'clear() returns the undecided requests');
  assert.deepEqual(q.grantChain(), []);
  assert.equal(q.head(), undefined);
  q.endTurn('turn-2');
  assert.equal(q.takeCompletedBatch(), undefined, 'a cleared batch never completes');
});
