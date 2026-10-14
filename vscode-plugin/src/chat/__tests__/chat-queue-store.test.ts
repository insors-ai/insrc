// Epic E20261014613abdb3 Story S001 t1 — the repository's chat queue store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  createChatQueueStore, FULL_NOTE, QUEUE_RECORD_BOUND, StoreUnavailable,
  type NewMessage, type SqliteDatabase,
} from '../chat-queue-store.js';

const open = (p: string): SqliteDatabase => new DatabaseSync(p) as unknown as SqliteDatabase;
function temp(): { dir: string; path: string; done(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-chat-queue-'));
  return { dir, path: join(dir, 'q', 'repo.sqlite'), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const msg = (session: string, turn: string, text = `${session}/${turn}`, windowKey = 'w-A'): NewMessage =>
  ({ key: `${session}::${turn}`, sessionId: session, turnId: turn, windowKey, origin: 'typed', text, attachments: [] });
const A = { windowKey: 'w-A', pid: 101 };
const B = { windowKey: 'w-B', pid: 202 };

test("chat queue store: enqueue, head, acknowledge and finish keep seq order, acknowledge a message at most once and only with the lease free, delete a done message, turn a stopped one into failed with a resend, and refuse an enqueue with a note at 500 live rows", () => {
  const t = temp();
  let clock = 1_000;
  const store = createChatQueueStore({ path: t.path, openDatabase: open, now: () => clock, pluginVersion: '0.5.14' });
  try {
    // Order: the head is the first sent; attachments are kept as the store's refs.
    const ref = { id: 'a1', name: 'shot.png', kind: 'image' as const, size: 10, path: '/att/s1/a1.png' };
    const m1 = store.enqueue({ ...msg('s1', 't1'), attachments: [ref] });
    const m2 = store.enqueue(msg('s2', 't1', 'second', 'w-B'));
    const m3 = store.enqueue(msg('s1', 't2'));
    assert.ok(m1.ok && m2.ok && m3.ok);
    assert.deepEqual(store.list().map((m) => m.key), ['s1::t1', 's2::t1', 's1::t2']);
    assert.equal(store.head()?.seq, m1.message.seq);
    assert.deepEqual(store.head()?.attachments, [ref], 'the attachment ref as given');
    assert.equal(store.head()?.state, 'queued');

    // Only the head, only with the lease free, only once.
    assert.equal(store.acknowledge(m2.message.seq, B), false, 'not the head');
    assert.equal(store.acknowledge(m1.message.seq, A), true);
    assert.equal(store.list()[0]?.state, 'processing');
    assert.deepEqual(store.lease(), { windowKey: 'w-A', pid: 101, seq: m1.message.seq, heartbeatAt: 1_000 });
    assert.equal(store.acknowledge(m1.message.seq, A), false, 'never twice');
    assert.equal(store.head()?.seq, m2.message.seq, 'the head moves on past a processing row');
    assert.equal(store.acknowledge(m2.message.seq, B), false, 'the lease is held');

    // The lease: the CLI is recorded, heartbeats are the holder's only.
    assert.equal(store.attachCli(A, { pid: 555, startedAt: 7 }), true);
    clock = 2_000;
    assert.equal(store.heartbeat(B), false);
    assert.equal(store.heartbeat(A), true);
    assert.equal(store.lease()?.cliPid, 555);
    assert.equal(store.lease()?.heartbeatAt, 2_000);

    // done: deleted, lease cleared.
    assert.equal(store.finish(m1.message.seq, { kind: 'done' }), undefined);
    assert.equal(store.lease(), undefined);
    assert.deepEqual(store.list().map((m) => m.key), ['s2::t1', 's1::t2']);

    // stopped: failed with the reason and kept for a resend; failed keeps its error.
    assert.equal(store.acknowledge(m2.message.seq, B), true);
    const stopped = store.finish(m2.message.seq, { kind: 'stopped' });
    assert.equal(stopped?.state, 'failed');
    assert.equal(stopped?.error, 'stopped by the user');
    assert.equal(store.acknowledge(m3.message.seq, A), true);
    assert.equal(store.finish(m3.message.seq, { kind: 'failed', error: 'boom', acted: true })?.error, 'boom');
    assert.equal(store.finish(m3.message.seq, { kind: 'detached-ended' }), undefined, 'detached-ended is finished like done');
    assert.equal(store.head(), undefined, 'a failed row is never the head');

    // Resend: the failed message goes to the back under a new turn id; dismiss and cancel.
    const again = store.resend(m2.message.seq, 't9');
    assert.ok(again.ok);
    assert.equal(again.message.key, 's2::t9');
    assert.equal(again.message.text, 'second');
    assert.equal(again.message.state, 'queued');
    assert.ok(again.message.seq > m3.message.seq, 'at the back');
    assert.equal(store.resend(again.message.seq, 't10').ok, false, 'only a failed or not-delivered message is resent');
    const m4 = store.enqueue(msg('s3', 't1'));
    assert.ok(m4.ok);
    assert.equal(store.dismiss(m4.message.seq), false, 'a queued message is cancelled, not dismissed');
    assert.equal(store.cancel(m4.message.seq), true);
    assert.equal(store.cancel(m4.message.seq), false);
    assert.equal(store.acknowledge(again.message.seq, B), true);
    store.finish(again.message.seq, { kind: 'not-delivered', reason: 'window-closed' });
    assert.equal(store.list().at(-1)?.state, 'not-delivered');
    assert.equal(store.dismiss(again.message.seq), true);
    assert.deepEqual(store.list(), []);

    // The bound: 500 live rows; the 501st is refused with the note, nothing lost.
    for (let i = 0; i < QUEUE_RECORD_BOUND; i++) assert.ok(store.enqueue(msg('bulk', `t${i}`)).ok);
    const over = store.enqueue(msg('bulk', 'over'));
    assert.deepEqual(over, { ok: false, reason: 'full', note: FULL_NOTE });
    assert.equal(store.list().length, QUEUE_RECORD_BOUND);
    // A retrying head that is not yet due holds the queue (Story S004 writes the state).
    const db = new DatabaseSync(t.path);
    const first = store.head()!;
    db.prepare(`UPDATE messages SET state = 'retrying', next_attempt_at = ? WHERE seq = ?`).run(10_000, first.seq);
    db.close();
    assert.equal(store.head()?.seq, first.seq, 'never skipped');
    assert.equal(store.acknowledge(first.seq, A), false, 'not yet due');
    clock = 10_000;
    assert.equal(store.acknowledge(first.seq, A), true, 'due');

    // Own writes are counted; data_version changes only for another connection's commit.
    const before = { own: store.ownWrites(), dv: store.dataVersion() };
    store.heartbeat(A);
    assert.equal(store.ownWrites(), before.own + 1);
    assert.equal(store.dataVersion(), before.dv);
    const other = new DatabaseSync(t.path);
    other.exec(`UPDATE presence SET heartbeat_at = 1`);
    other.exec(`INSERT INTO presence (window_key, pid, heartbeat_at) VALUES ('w-C', 1, 1)`);
    other.close();
    assert.notEqual(store.dataVersion(), before.dv);
  } finally {
    store.close();
    t.done();
  }

  // A newer schema, or a database that cannot be opened, is unavailable.
  const u = temp();
  try {
    const s = createChatQueueStore({ path: u.path, openDatabase: open, now: () => 1, pluginVersion: 'x' });
    s.close();
    const db = new DatabaseSync(u.path);
    db.exec(`UPDATE meta SET value = '99' WHERE key = 'schema_version'`);
    db.close();
    assert.throws(() => createChatQueueStore({ path: u.path, openDatabase: open, now: () => 1, pluginVersion: 'x' }), StoreUnavailable);
    assert.throws(() => createChatQueueStore({ path: u.path, openDatabase: () => { throw new Error('no node:sqlite'); }, now: () => 1, pluginVersion: 'x' }), /could not be opened: no node:sqlite/);
  } finally {
    u.done();
  }
});

test('chat queue store: two processes on one database file acknowledging the same head at the same moment: exactly one succeeds and the message is processing once', async () => {
  const child = fileURLToPath(new URL('./fixtures/queue-ack-child.mts', import.meta.url));
  for (let round = 0; round < 5; round++) {
    const t = temp();
    const store = createChatQueueStore({ path: t.path, openDatabase: open, now: () => Date.now(), pluginVersion: 'test' });
    try {
      assert.ok(store.enqueue(msg('s1', `t${round}`)).ok);
      const kids = ['w-X', 'w-Y'].map((w) => fork(child, [t.path, w], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] }));
      await Promise.all(kids.map((k) => new Promise<void>((res) => k.once('message', () => res()))));
      const results = await Promise.all(kids.map((k) => new Promise<{ ok: boolean; error?: string }>((res) => {
        k.once('message', (m) => res(m as { ok: boolean; error?: string }));
        k.send('go');
      })));
      await Promise.all(kids.map((k) => new Promise((res) => (k.exitCode !== null ? res(null) : k.once('exit', res)))));
      assert.equal(results.filter((r) => r.ok).length, 1, `round ${round}: exactly one acknowledged (${JSON.stringify(results)})`);
      assert.ok(results.every((r) => r.error === undefined), 'neither failed: the busy timeout made one wait');
      const rows = store.list();
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.state, 'processing');
      assert.ok(['w-X', 'w-Y'].includes(store.lease()!.windowKey));
    } finally {
      store.close();
      t.done();
    }
  }
});
