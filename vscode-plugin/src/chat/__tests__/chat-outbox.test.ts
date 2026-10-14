// Epic E20261014613abdb3 Story S002 t3 — the outbox projection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectOutbox } from '../chat-outbox.js';
import type { QueuedMessage } from '../chat-queue-store.js';

let next = 0;
const row = (sessionId: string, state: QueuedMessage['state'], text: string, extra: Partial<QueuedMessage> = {}): QueuedMessage => {
  next += 1;
  return { seq: next, key: `${sessionId}::t${next}`, sessionId, turnId: `t${next}`, windowKey: 'w-A', origin: 'typed', text, attachments: [], state, attempts: 0, createdAt: next, updatedAt: next, ...extra };
};
const titles: Record<string, string> = { mine: 'my chat', other: 'board search', third: 'docs' };
const titleOf = (id: string): string | undefined => titles[id];

test("outbox projection: with a turn running, the chat's two waiting messages show places 2 and 3, one message from another chat is ahead, and the running chat is named", () => {
  const rows = [
    row('other', 'processing', 'fix the board search', { windowKey: 'w-B' }),
    row('third', 'queued', 'update docs'),
    row('mine', 'queued', 'add a test'),
    row('mine', 'queued', 'then the docs'),
  ];
  const view = projectOutbox(rows, 'mine', { titleOf, here: (m) => m.windowKey === 'w-A' });
  assert.deepEqual(view.rows.map((r) => [r.text, r.position, r.state]), [['add a test', 2, 'queued'], ['then the docs', 3, 'queued']]);
  assert.equal(view.aheadFromOtherChats, 1);
  assert.deepEqual(view.runningChat, { title: 'board search', here: false });
  assert.equal(view.blockedBy, undefined, 'no card is waiting');
  assert.equal(view.sessionId, 'mine');

  // The same queue seen by the window that runs the other chat's message.
  assert.deepEqual(projectOutbox(rows, 'mine', { titleOf, here: (m) => m.windowKey === 'w-B' }).runningChat, { title: 'board search', here: true });
});

test('outbox projection: processing rows are dropped, failed and not-delivered rows have no place, blockedBy comes from another chat\'s processing row, attachments are counted and the note is carried', () => {
  const ref = { id: 'a', name: 'a.png', kind: 'image' as const, size: 1, path: '/a' };
  const rows = [
    row('mine', 'failed', 'stopped one', { error: 'stopped by the user', attachments: [ref, ref] }),
    row('other', 'processing', 'needs approval', { waitingOn: 'approval' }),
    row('mine', 'not-delivered', 'lost one', { error: 'its window was closed' }),
    row('mine', 'retrying', 'retry me', { attempts: 2, nextAttemptAt: 99 }),
    row('other', 'queued', 'after'),
  ];
  const view = projectOutbox(rows, 'mine', { titleOf, note: 'That message is no longer in the outbox.' });
  assert.deepEqual(
    view.rows.map((r) => ({ text: r.text, position: r.position, state: r.state, attachments: r.attachments, error: r.error })),
    [
      { text: 'stopped one', position: undefined, state: 'failed', attachments: 2, error: 'stopped by the user' },
      { text: 'lost one', position: undefined, state: 'not-delivered', attachments: 0, error: 'its window was closed' },
      { text: 'retry me', position: 1, state: 'retrying', attachments: 0, error: undefined },
    ],
  );
  assert.equal(view.rows[2]?.attempt, 2);
  assert.equal(view.rows[2]?.nextAttemptAt, 99);
  assert.equal(view.aheadFromOtherChats, 0, 'the other chat\'s waiting message is behind');
  assert.deepEqual(view.blockedBy, { chatTitle: 'board search', reason: 'approval' });
  assert.deepEqual(view.runningChat, { title: 'board search', here: false });
  assert.equal(view.note, 'That message is no longer in the outbox.');

  // The running chat itself: its processing row is in its transcript; no blockedBy about itself.
  const own = projectOutbox(rows, 'other', { titleOf });
  assert.deepEqual(own.rows.map((r) => r.text), ['after']);
  assert.equal(own.blockedBy, undefined);
  assert.equal(own.runningChat, undefined);
  assert.equal(own.aheadFromOtherChats, 1, "this chat's retrying message runs first");

  // A chat with nothing waiting counts every other chat's waiting message; an untitled chat is named plainly.
  const none = projectOutbox(rows, 'third', { titleOf: () => undefined });
  assert.deepEqual(none.rows, []);
  assert.equal(none.aheadFromOtherChats, 2);
  assert.deepEqual(none.blockedBy, { chatTitle: 'another chat', reason: 'approval' });
});
