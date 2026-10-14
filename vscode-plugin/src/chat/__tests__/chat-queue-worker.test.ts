// Epic E20261014613abdb3 Story S001 t2 — a window's chat queue worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Timers } from '../async-util.js';
import { createChatQueueStore, LEASE_HEARTBEAT_MS, LEASE_TAKEOVER_MS, StoreBusy, type ChatQueueLeases, type ChatQueueStore, type QueuedMessage, type SqliteDatabase, type TurnOutcome } from '../chat-queue-store.js';
import { ACTION_NOTES, ACTIVE_POLL_MS, IDLE_POLL_MS, createChatQueueWorker, type QueuedTurnRunner } from '../chat-queue-worker.js';

/** Fake timers over a fake clock: advance() runs what is due, in order. */
function fakeTime() {
  let clock = 1_000;
  let id = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    setTimeout: (fn, ms) => { id += 1; due.set(id, { at: clock + ms, fn }); return id; },
    clearTimeout: (h) => void due.delete(h as number),
  };
  async function advance(ms: number): Promise<void> {
    const end = clock + ms;
    for (;;) {
      const next = [...due.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (next === undefined) break;
      due.delete(next[0]);
      clock = Math.max(clock, next[1].at);
      next[1].fn();
      await new Promise((r) => setImmediate(r));
    }
    clock = end;
    await new Promise((r) => setImmediate(r));
  }
  return { timers, now: () => clock, advance };
}

type Store = ChatQueueStore & ChatQueueLeases;
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-chat-worker-'));
  const path = join(dir, 'repo.sqlite');
  return { path, open: (now: () => number): Store => createChatQueueStore({ path, openDatabase: (p) => new DatabaseSync(p) as unknown as SqliteDatabase, now, pluginVersion: 't' }), done: () => rmSync(dir, { recursive: true, force: true }) };
}
/** A runner whose runs the test ends by hand. */
function gatedRunner() {
  const runs: { message: QueuedMessage; spawn: (cli: { pid?: number; startedAt?: number }) => void; end: (o: TurnOutcome) => void }[] = [];
  const runner: QueuedTurnRunner = { run: (message, spawn) => new Promise<TurnOutcome>((end) => { runs.push({ message, spawn, end }); }) };
  return { runner, runs };
}
const sub = (sessionId: string, text: string) => ({ sessionId, text, origin: 'typed' as const, attachments: [] });

test("chat queue worker: the window whose message is at the front takes the lease, runs it through the runner with onSpawn recording the CLI, heartbeats the lease while it runs, finishes it and releases the lease; another window's message at the front is left alone; a submit in one window is seen by another within one poll; a finish that fails is retried on the next poll before any new message is taken; dispose releases the lease when the turn's CLI has exited and leaves it when it still runs; onChange fires after this window's own submit and after another window's commit", async () => {
  const r = repo();
  const t = fakeTime();
  const storeA = r.open(t.now);
  const storeB = r.open(t.now);
  const A = gatedRunner();
  const B = gatedRunner();
  const alive = new Set<number>();
  let turn = 0;
  const mk = (store: Store, windowKey: string, pid: number, runner: QueuedTurnRunner) =>
    createChatQueueWorker({ store, claim: { windowKey, pid }, runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => `t${++turn}` });
  const wA = mk(storeA, 'w-A', 101, A.runner);
  const wB = mk(storeB, 'w-B', 202, B.runner);
  const seenB: string[][] = [];
  const seenA: string[][] = [];
  wB.onChange((rows) => seenB.push(rows.map((m) => `${m.text}:${m.state}`)));
  wA.onChange((rows) => seenA.push(rows.map((m) => `${m.text}:${m.state}`)));
  try {
    // A window alone on a repository: its own writes, which SQLite's data_version does not
    // reflect for the writing connection, still fire its onChange.
    {
      const solo = repo();
      const soloStore = solo.open(t.now);
      const R = gatedRunner();
      const w = createChatQueueWorker({ store: soloStore, claim: { windowKey: 'w-S', pid: 404 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers, newTurnId: () => 'solo-1' });
      const seen: string[][] = [];
      w.onChange((rows) => seen.push(rows.map((m) => `${m.text}:${m.state}`)));
      await t.advance(0);
      const before = seen.length;
      assert.ok(w.submit(sub('sS', 'alone')).ok);
      await t.advance(0);
      assert.ok(seen.slice(before).some((rows) => rows.some((x) => x.startsWith('alone:'))), 'its own submit fired onChange');
      w.dispose();
      soloStore.close();
      solo.done();
    }
    await t.advance(0);
    // Window A submits: its own write fires its onChange, B sees it within one poll.
    const a1 = wA.submit(sub('sA', 'first from A'));
    assert.ok(a1.ok);
    await t.advance(0);
    assert.ok(seenA.some((rows) => rows.includes('first from A:queued') || rows.includes('first from A:processing')), "A's own submit fired its onChange");
    // B's queue was empty, so it was polling at the idle rate: it sees A's commit within that poll.
    await t.advance(IDLE_POLL_MS);
    assert.ok(seenB.some((rows) => rows.some((x) => x.startsWith('first from A'))), "B saw A's commit within a poll");

    // A's message is at the front: A takes the lease and runs it; B leaves it alone.
    assert.equal(A.runs.length, 1);
    assert.equal(B.runs.length, 0);
    assert.equal(A.runs[0]!.message.text, 'first from A');
    assert.equal(storeB.lease()?.windowKey, 'w-A');
    assert.equal(wA.running(), true);
    // onSpawn records the CLI; the lease is heartbeated while it runs.
    A.runs[0]!.spawn({ pid: 900, startedAt: 5 });
    assert.equal(storeB.lease()?.cliPid, 900);
    const firstBeat = storeB.lease()!.heartbeatAt;
    await t.advance(LEASE_HEARTBEAT_MS);
    assert.ok(storeB.lease()!.heartbeatAt > firstBeat, 'heartbeated');

    // B submits meanwhile; it waits (A holds the lease). A's turn ends: finished and released.
    assert.ok(wB.submit(sub('sB', 'from B')).ok);
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(B.runs.length, 0, 'B waits for the lease');
    A.runs[0]!.end({ kind: 'done' });
    await t.advance(0);
    assert.equal(storeA.lease()?.windowKey === 'w-A', false, 'released');
    assert.deepEqual(storeA.list().map((m) => m.text), ['from B'], 'the done message is gone');
    await t.advance(ACTIVE_POLL_MS);
    assert.equal(B.runs.length, 1, "B's message runs once A released");
    assert.equal(A.runs.length, 1, "A never ran B's message");

    // A message of A queued behind B's: A leaves it while B runs, then runs it.
    assert.ok(wA.submit(sub('sA', 'second from A')).ok);
    await t.advance(ACTIVE_POLL_MS);
    assert.equal(A.runs.length, 1);
    B.runs[0]!.end({ kind: 'stopped' });
    await t.advance(ACTIVE_POLL_MS);
    assert.equal(storeA.list().find((m) => m.text === 'from B')?.state, 'failed', 'stopped -> failed with a resend');
    assert.equal(A.runs.length, 2);

    // A finish that fails is kept and retried before any new message is taken.
    const realFinish = storeA.finish.bind(storeA);
    let failing = 2; // the finish after the turn and the retry on the immediate check both fail
    storeA.finish = (seq, outcome) => { if (failing > 0) { failing -= 1; throw new Error('database is locked'); } return realFinish(seq, outcome); };
    assert.ok(wA.submit(sub('sA', 'third from A')).ok);
    A.runs[1]!.end({ kind: 'done' });
    await t.advance(0);
    assert.equal(A.runs.length, 2, 'no new message while the finish is pending');
    assert.equal(storeB.list().find((m) => m.text === 'second from A')?.state, 'processing', 'not yet written');
    await t.advance(ACTIVE_POLL_MS);
    assert.equal(storeB.list().some((m) => m.text === 'second from A'), false, 'written on the next poll');
    await t.advance(ACTIVE_POLL_MS);
    assert.equal(A.runs.length, 3, 'then the next message is taken');
    storeA.finish = realFinish;

    // dispose while the turn's CLI still runs: the lease stays.
    A.runs[2]!.spawn({ pid: 901 });
    alive.add(901);
    wA.dispose();
    assert.equal(storeB.lease()?.windowKey, 'w-A', 'left to its heartbeat timeout');
    assert.equal(storeB.windowAlive('w-A', t.now()), false, 'presence removed');
    // A new worker for a window whose CLI has exited: dispose finishes and releases.
    const storeC = r.open(t.now);
    const C = gatedRunner();
    const wC = mk(storeC, 'w-C', 303, C.runner);
    storeB.release({ windowKey: 'w-A', pid: 101 });
    storeB.finish(storeB.list().find((m) => m.text === 'third from A')!.seq, { kind: 'done' });
    assert.ok(wC.submit(sub('sC', 'from C')).ok);
    await t.advance(ACTIVE_POLL_MS);
    assert.equal(C.runs.length, 1);
    C.runs[0]!.spawn({ pid: 950 });
    wC.dispose(); // 950 is not alive
    assert.equal(storeB.lease(), undefined, 'released');
    assert.equal(storeB.list().find((m) => m.text === 'from C')?.error, 'the window closed during the turn');
    storeC.close();
  } finally {
    wA.dispose();
    wB.dispose();
    storeA.close();
    storeB.close();
    r.done();
  }
});

// Epic E20261014613abdb3 Story S002 t2 — the worker's act and the runner's onWaiting.
test("worker act: cancel removes a waiting message and is refused once the message has started; dismiss and resend refuse rows in the wrong state; resend takes this window's key; a successful act is seen by onChange at once", async () => {
  const r = repo();
  const t = fakeTime();
  const store = r.open(t.now);
  const other = r.open(t.now);
  const R = gatedRunner();
  let turn = 0;
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers, newTurnId: () => `n${++turn}` });
  const seen: string[][] = [];
  w.onChange((rows) => seen.push(rows.map((m) => `${m.text}:${m.state}`)));
  try {
    const first = w.submit(sub('s1', 'first'));
    const second = w.submit(sub('s1', 'second'));
    assert.ok(first.ok && second.ok);
    await t.advance(0);
    assert.equal(R.runs.length, 1, 'the first message runs');

    // Cancel: a waiting message leaves the queue; a started one is refused with a sentence.
    assert.deepEqual(w.act(first.message.seq, 'cancel'), { ok: false, note: ACTION_NOTES.started });
    const before = seen.length;
    assert.deepEqual(w.act(second.message.seq, 'cancel'), { ok: true });
    await t.advance(0); // the immediate tick, well before a poll
    assert.ok(seen.length > before, 'onChange fired at once');
    assert.deepEqual(seen.at(-1), ['first:processing']);
    assert.deepEqual(w.act(second.message.seq, 'cancel'), { ok: false, note: ACTION_NOTES.gone });

    // Dismiss and resend refuse a row in the wrong state.
    assert.equal(w.act(first.message.seq, 'dismiss').ok, false, 'a processing message is not dismissed');
    assert.equal(w.act(first.message.seq, 'resend').ok, false, 'a processing message is not resent');

    // A not-delivered message of another (closed) window, resent here, becomes this window's.
    R.runs[0]!.end({ kind: 'stopped' });
    await t.advance(0);
    const lost = other.enqueue({ key: 's2::x', sessionId: 's2', turnId: 'x', windowKey: 'w-gone', origin: 'typed', text: 'lost', attachments: [] });
    assert.ok(lost.ok);
    assert.equal(other.acknowledge(lost.message.seq, { windowKey: 'w-gone', pid: 9 }), true);
    other.finish(lost.message.seq, { kind: 'not-delivered', reason: 'window-closed' });
    assert.deepEqual(w.act(lost.message.seq, 'resend'), { ok: true });
    const resent = store.list().find((m) => m.text === 'lost');
    assert.equal(resent?.windowKey, 'w-A');
    assert.equal(resent?.state, 'queued');
    assert.equal(resent?.key, `s2::n${turn}`);

    // The stopped first message is dismissed.
    assert.deepEqual(w.act(first.message.seq, 'dismiss'), { ok: true });
    assert.equal(store.list().some((m) => m.seq === first.message.seq), false);
  } finally {
    w.dispose();
    store.close();
    other.close();
    r.done();
  }
});

test("worker onWaiting: the runner's card report sets and clears waitingOn on the running message, and a busy write is retried on the next tick", async () => {
  const r = repo();
  const t = fakeTime();
  const real = r.open(t.now);
  let busy = 0;
  // A store whose next markWaiting fails as busy, as another window's long write would.
  const store: Store = Object.assign(Object.create(real) as Store, {
    markWaiting: (seq: number, on: 'approval' | 'selection' | undefined) => {
      if (busy > 0) {
        busy -= 1;
        throw new StoreBusy('database is locked');
      }
      return real.markWaiting(seq, on);
    },
  });
  const runs: { message: QueuedMessage; waiting?: ((on: 'approval' | 'selection' | undefined) => void) | undefined; end: (o: TurnOutcome) => void }[] = [];
  const runner: QueuedTurnRunner = { run: (message, _spawn, waiting) => new Promise<TurnOutcome>((end) => { runs.push({ message, waiting, end }); }) };
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner, isAlive: () => false, now: t.now, timers: t.timers });
  try {
    assert.ok(w.submit(sub('s1', 'runs')).ok);
    await t.advance(0);
    assert.equal(runs.length, 1);
    assert.equal(typeof runs[0]!.waiting, 'function', 'the runner is given onWaiting');
    const seq = runs[0]!.message.seq;

    runs[0]!.waiting!('approval');
    assert.equal(real.list()[0]?.waitingOn, 'approval');
    runs[0]!.waiting!(undefined);
    assert.equal(real.list()[0]?.waitingOn, undefined, 'cleared');

    // A busy write is kept and written on the next tick.
    busy = 1;
    runs[0]!.waiting!('selection');
    assert.equal(real.list()[0]?.waitingOn, undefined, 'not written yet');
    await t.advance(ACTIVE_POLL_MS);
    assert.equal(real.list()[0]?.waitingOn, 'selection', 'written on the next tick');

    // After the message ends, a late report is ignored.
    runs[0]!.end({ kind: 'stopped' });
    await t.advance(0);
    runs[0]!.waiting!('approval');
    assert.equal(real.list().find((m) => m.seq === seq)?.waitingOn, undefined);
  } finally {
    w.dispose();
    real.close();
    r.done();
  }
});

test("worker recovery: a lease left by a window that reloaded (same window key, old pid and its CLI gone) is freed at once, its message fails for resend, and the queued messages behind it run; a live CLI keeps the lease; another window's dead lease waits LEASE_TAKEOVER_MS", async () => {
  const r = repo();
  const t = fakeTime();
  const old = r.open(t.now);
  const store = r.open(t.now);
  const R = gatedRunner();
  const alive = new Set<number>([900]);
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 202 }, runner: R.runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => 'n1' });
  try {
    // The pre-reload window (pid 101) is running message one, its CLI (pid 900) still alive; two is queued behind it.
    const one = old.enqueue({ key: 's1::a', sessionId: 's1', turnId: 'a', windowKey: 'w-A', origin: 'typed', text: 'one', attachments: [] });
    assert.ok(one.ok);
    assert.equal(old.acknowledge(one.message.seq, { windowKey: 'w-A', pid: 101 }), true);
    old.attachCli({ windowKey: 'w-A', pid: 101 }, { pid: 900 });
    assert.ok(w.submit(sub('s1', 'two')).ok);
    await t.advance(ACTIVE_POLL_MS * 3);
    assert.equal(R.runs.length, 0, 'a live CLI keeps the lease');
    assert.equal(store.lease()?.seq, one.message.seq);

    // The CLI exits: the lease is freed, one fails (resendable) and two runs.
    alive.delete(900);
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(store.list().find((m) => m.text === 'one')?.state, 'failed');
    assert.equal(R.runs.length, 1);
    assert.equal(R.runs[0]!.message.text, 'two');
    R.runs[0]!.end({ kind: 'done' });
    await t.advance(0);

    // Another window's dead lease is taken over only after LEASE_TAKEOVER_MS without a heartbeat.
    const three = old.enqueue({ key: 's2::b', sessionId: 's2', turnId: 'b', windowKey: 'w-B', origin: 'typed', text: 'three', attachments: [] });
    assert.ok(three.ok);
    assert.equal(old.acknowledge(three.message.seq, { windowKey: 'w-B', pid: 303 }), true);
    await t.advance(LEASE_TAKEOVER_MS - ACTIVE_POLL_MS * 4);
    assert.equal(store.lease()?.seq, three.message.seq, 'not yet');
    await t.advance(ACTIVE_POLL_MS * 8);
    assert.equal(store.lease(), undefined, 'taken over');
    assert.equal(store.list().find((m) => m.text === 'three')?.state, 'failed');
  } finally {
    w.dispose();
    store.close();
    old.close();
    r.done();
  }
});
