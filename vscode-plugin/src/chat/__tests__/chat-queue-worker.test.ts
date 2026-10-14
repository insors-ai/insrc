// Epic E20261014613abdb3 Story S001 t2 — a window's chat queue worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Timers } from '../async-util.js';
import { createChatQueueStore, FULL_NOTE, LEASE_HEARTBEAT_MS, PRESENCE_GRACE_MS, LEASE_TAKEOVER_MS, QUEUE_RECORD_BOUND, StoreBusy, type ChatQueueLeases, type ChatQueueStore, type QueuedMessage, type SqliteDatabase, type TurnOutcome } from '../chat-queue-store.js';
import { RETRY_DELAYS_MS, MAX_INFRA_RETRIES } from '../chat-failure.js';
import { ACTION_NOTES, ACTIVE_POLL_MS, BUSY_GIVE_UP_MS, GIVE_UP_NOTE, IDLE_POLL_MS, createChatQueueWorker, type QueuedTurnRunner } from '../chat-queue-worker.js';

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
    assert.equal(storeB.windowAlive('w-A', t.now()), true, 'presence kept');
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

test("worker recovery: a lease left by a window that reloaded (same window key, old pid and its CLI gone) is freed at once, its message fails for resend, and the queued messages behind it run; another window's dead lease waits LEASE_TAKEOVER_MS", async () => {
  const r = repo();
  const t = fakeTime();
  const old = r.open(t.now);
  const store = r.open(t.now);
  const R = gatedRunner();
  const alive = new Set<number>();
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 202 }, runner: R.runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => 'n1' });
  try {
    // The pre-reload window (pid 101) was running message one, its CLI (pid 900) is gone; two is queued behind it.
    const one = old.enqueue({ key: 's1::a', sessionId: 's1', turnId: 'a', windowKey: 'w-A', origin: 'typed', text: 'one', attachments: [] });
    assert.ok(one.ok);
    assert.equal(old.acknowledge(one.message.seq, { windowKey: 'w-A', pid: 101 }), true);
    old.attachCli({ windowKey: 'w-A', pid: 101 }, { pid: 900 });
    assert.ok(w.submit(sub('s1', 'two')).ok);
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

test('worker recovery: a reloaded window reclaims a lease whose CLI lives and does not fail the message', async () => {
  const r = repo();
  const t = fakeTime();
  const old = r.open(t.now);
  const store = r.open(t.now);
  const R = gatedRunner();
  const alive = new Set<number>([900]);
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 202 }, runner: R.runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => 'n1' });
  try {
    const one = old.enqueue({ key: 's1::a', sessionId: 's1', turnId: 'a', windowKey: 'w-A', origin: 'typed', text: 'one', attachments: [] });
    assert.ok(one.ok);
    assert.equal(old.acknowledge(one.message.seq, { windowKey: 'w-A', pid: 101 }), true);
    old.attachCli({ windowKey: 'w-A', pid: 101 }, { pid: 900, startedAt: 4 });
    assert.ok(w.submit(sub('s1', 'two')).ok);
    await t.advance(ACTIVE_POLL_MS * 3);
    assert.equal(R.runs.length, 0, 'a live CLI keeps the lease: nothing else runs');
    assert.equal(store.list().find((m) => m.text === 'one')?.state, 'processing', 'the message is not failed');
    const lease = store.lease();
    assert.equal(lease?.seq, one.message.seq);
    assert.equal(lease?.pid, 202, 'the lease is re-homed to the reloaded window');
    assert.equal(lease?.cliPid, 900);
    assert.equal(lease?.cliStartedAt, 4);
    // The old window's pid 101 is gone, and the holder's own pid is never touched by the rules.
    assert.equal(store.list().find((m) => m.text === 'two')?.state, 'queued');
  } finally {
    w.dispose();
    store.close();
    old.close();
    r.done();
  }
});

test('worker recovery: a dead holder and dead CLI of another window is freed only after LEASE_TAKEOVER_MS and the next message runs', async () => {
  const r = repo();
  const t = fakeTime();
  const old = r.open(t.now);
  const store = r.open(t.now);
  const R = gatedRunner();
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 202 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers, newTurnId: () => 'n1' });
  try {
    const first = old.enqueue({ key: 's1::a', sessionId: 's1', turnId: 'a', windowKey: 'w-B', origin: 'typed', text: 'from the dead window', attachments: [] });
    assert.ok(first.ok);
    assert.equal(old.acknowledge(first.message.seq, { windowKey: 'w-B', pid: 303 }), true);
    assert.ok(w.submit(sub('s2', 'next')).ok);
    await t.advance(LEASE_TAKEOVER_MS - ACTIVE_POLL_MS * 4);
    assert.equal(store.lease()?.seq, first.message.seq, 'not stale yet');
    assert.equal(R.runs.length, 0);
    await t.advance(ACTIVE_POLL_MS * 8);
    assert.equal(store.list().find((m) => m.text === 'from the dead window')?.state, 'failed');
    assert.equal(store.list().find((m) => m.text === 'from the dead window')?.error, 'the window closed during the turn');
    assert.equal(R.runs.length, 1, 'the next message runs');
    assert.equal(R.runs[0]!.message.text, 'next');
  } finally {
    w.dispose();
    store.close();
    old.close();
    r.done();
  }
});

test('worker recovery: a holder that keeps heartbeating past LEASE_TAKEOVER_MS is never taken over', async () => {
  const r = repo();
  const t = fakeTime();
  const holder = r.open(t.now);
  const store = r.open(t.now);
  const R = gatedRunner();
  // The holder's process looks gone to this window (another host), but it heartbeats: it must never be taken over.
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 202 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers, newTurnId: () => 'n1' });
  try {
    const first = holder.enqueue({ key: 's1::a', sessionId: 's1', turnId: 'a', windowKey: 'w-B', origin: 'typed', text: 'long task', attachments: [] });
    assert.ok(first.ok);
    const B = { windowKey: 'w-B', pid: 303 };
    assert.equal(holder.acknowledge(first.message.seq, B), true);
    assert.ok(w.submit(sub('s2', 'waits')).ok);
    for (let i = 0; i < (LEASE_TAKEOVER_MS * 1.2) / LEASE_HEARTBEAT_MS; i++) {
      assert.equal(holder.heartbeat(B), true);
      await t.advance(LEASE_HEARTBEAT_MS);
    }
    assert.equal(store.lease()?.seq, first.message.seq, 'still held after more than LEASE_TAKEOVER_MS');
    assert.equal(store.list().find((m) => m.text === 'long task')?.state, 'processing');
    assert.equal(R.runs.length, 0);
  } finally {
    w.dispose();
    store.close();
    holder.close();
    r.done();
  }
});

// Epic E20261014613abdb3 Story S003 t5.
test('a reclaimed lease is heartbeated while the CLI lives, then finished as detached-ended and released when the CLI exits, and the next message runs', async () => {
  const r = repo();
  const t = fakeTime();
  const old = r.open(t.now);
  const store = r.open(t.now);
  const R = gatedRunner();
  const alive = new Set<number>([900]);
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 202 }, runner: R.runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => 'n1' });
  try {
    const one = old.enqueue({ key: 's1::a', sessionId: 's1', turnId: 'a', windowKey: 'w-A', origin: 'typed', text: 'one', attachments: [] });
    assert.ok(one.ok);
    assert.equal(old.acknowledge(one.message.seq, { windowKey: 'w-A', pid: 101 }), true);
    old.attachCli({ windowKey: 'w-A', pid: 101 }, { pid: 900 });
    assert.ok(w.submit(sub('s1', 'two')).ok);
    await t.advance(ACTIVE_POLL_MS * 3);
    const reclaimedAt = store.lease()!.heartbeatAt;
    await t.advance(LEASE_HEARTBEAT_MS * 3);
    assert.ok(store.lease()!.heartbeatAt > reclaimedAt, 'heartbeated while the CLI lives');
    assert.equal(R.runs.length, 0);
    alive.delete(900);
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(store.list().some((m) => m.text === 'one'), false, 'finished as detached-ended: its row is gone');
    assert.equal(R.runs.length, 1, 'the next message runs');
    assert.equal(R.runs[0]!.message.text, 'two');
    assert.equal(store.lease()?.seq !== one.message.seq, true, 'the reclaimed lease is released');
  } finally {
    w.dispose();
    store.close();
    old.close();
    r.done();
  }
});

test('a reclaimed lease lost to another window clears the marker and stops heartbeating', async () => {
  const r = repo();
  const t = fakeTime();
  const old = r.open(t.now);
  const store = r.open(t.now);
  const R = gatedRunner();
  const alive = new Set<number>([900]);
  const realHeartbeat = store.heartbeat.bind(store);
  let beats = 0;
  store.heartbeat = (c) => { beats += 1; return realHeartbeat(c); };
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 202 }, runner: R.runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => 'n1' });
  try {
    const one = old.enqueue({ key: 's1::a', sessionId: 's1', turnId: 'a', windowKey: 'w-A', origin: 'typed', text: 'one', attachments: [] });
    assert.ok(one.ok);
    assert.equal(old.acknowledge(one.message.seq, { windowKey: 'w-A', pid: 101 }), true);
    old.attachCli({ windowKey: 'w-A', pid: 101 }, { pid: 900 });
    await t.advance(ACTIVE_POLL_MS * 3);
    await t.advance(LEASE_HEARTBEAT_MS * 2);
    assert.ok(beats > 0, 'heartbeating the reclaimed lease');
    // The lease is lost: finished elsewhere and taken by another window for another message.
    old.finish(one.message.seq, { kind: 'detached-ended' });
    const two = old.enqueue({ key: 's2::b', sessionId: 's2', turnId: 'b', windowKey: 'w-B', origin: 'typed', text: 'two', attachments: [] });
    assert.ok(two.ok);
    assert.equal(old.acknowledge(two.message.seq, { windowKey: 'w-B', pid: 303 }), true);
    const before = beats;
    await t.advance(LEASE_HEARTBEAT_MS * 4);
    assert.equal(beats, before, 'no heartbeat for a lease that is no longer this window\'s');
    assert.equal(store.lease()?.windowKey, 'w-B');
  } finally {
    w.dispose();
    store.close();
    old.close();
    r.done();
  }
});

// Epic E20261014613abdb3 Story S003 t3.
test('dispose leaves the presence row in place and windowAlive stays true until PRESENCE_GRACE_MS passes', async () => {
  const r = repo();
  const t = fakeTime();
  const store = r.open(t.now);
  const watcher = r.open(t.now);
  const R = gatedRunner();
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers, newTurnId: () => 'n1' });
  try {
    await t.advance(0);
    assert.equal(watcher.windowAlive('w-A', t.now()), true, 'present while the worker runs');
    w.dispose();
    assert.equal(watcher.presenceOf('w-A')?.pid, 101, 'the row is still there after dispose');
    assert.equal(watcher.windowAlive('w-A', t.now()), true);
    await t.advance(PRESENCE_GRACE_MS - 1_000);
    assert.equal(watcher.windowAlive('w-A', t.now()), true, 'still within the grace');
    await t.advance(2_000);
    assert.equal(watcher.windowAlive('w-A', t.now()), false, 'aged out once PRESENCE_GRACE_MS has passed');
    // A reload: a new worker for the same window key refreshes the row on its first tick.
    const againStore = r.open(t.now);
    const again = createChatQueueWorker({ store: againStore, claim: { windowKey: 'w-A', pid: 202 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers, newTurnId: () => 'n2' });
    await t.advance(0);
    assert.equal(watcher.presenceOf('w-A')?.pid, 202);
    again.dispose();
    againStore.close();
  } finally {
    w.dispose();
    store.close();
    watcher.close();
    r.done();
  }
});

// Epic E20261014613abdb3 Story S003 t6 — the closed-window head rule. Window w-A is the one ticking; w-B owns the head.
const bMsg = (text: string, seq = 'a') => ({ key: `sB::${seq}`, sessionId: 'sB', turnId: seq, windowKey: 'w-B', origin: 'typed' as const, text, attachments: [] });

test('a head whose window stopped refreshing presence and whose pid is dead is marked not-delivered after PRESENCE_GRACE_MS and the next message runs', async () => {
  const r = repo();
  const t = fakeTime();
  const other = r.open(t.now);
  const store = r.open(t.now);
  const R = gatedRunner();
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers, newTurnId: () => 'n1' });
  try {
    other.presence({ windowKey: 'w-B', pid: 303 });
    const b = other.enqueue(bMsg('from the closed window'));
    assert.ok(b.ok);
    assert.ok(w.submit(sub('sA', 'mine')).ok);
    await t.advance(PRESENCE_GRACE_MS - ACTIVE_POLL_MS * 2);
    assert.equal(store.list().find((m) => m.text === 'from the closed window')?.state, 'queued', 'inside the grace');
    assert.equal(R.runs.length, 0);
    await t.advance(ACTIVE_POLL_MS * 6);
    const marked = store.list().find((m) => m.text === 'from the closed window');
    assert.equal(marked?.state, 'not-delivered');
    assert.equal(marked?.error, 'its window was closed');
    assert.equal(R.runs.length, 1, 'the next message runs');
    assert.equal(R.runs[0]!.message.text, 'mine');
    assert.ok(store.resendFrom(b.message.seq, 'r1', 'w-A').ok, 'resendable');
  } finally {
    w.dispose();
    store.close();
    other.close();
    r.done();
  }
});

test('a head whose window has a fresh presence row or a live pid is never marked; no presence row and a message younger than PRESENCE_GRACE_MS is not marked', async () => {
  // Fresh row, the pid looks gone to this window: refreshed every heartbeat, never marked.
  {
    const r = repo();
    const t = fakeTime();
    const other = r.open(t.now);
    const store = r.open(t.now);
    const R = gatedRunner();
    const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers, newTurnId: () => 'n1' });
    try {
      assert.ok(other.enqueue(bMsg('fresh')).ok);
      for (let i = 0; i < (PRESENCE_GRACE_MS * 3) / LEASE_HEARTBEAT_MS; i++) {
        other.presence({ windowKey: 'w-B', pid: 303 });
        await t.advance(LEASE_HEARTBEAT_MS);
      }
      assert.equal(store.list().find((m) => m.text === 'fresh')?.state, 'queued');
    } finally {
      w.dispose();
      store.close();
      other.close();
      r.done();
    }
  }
  // Stale row but the recorded pid is alive: not marked.
  {
    const r = repo();
    const t = fakeTime();
    const other = r.open(t.now);
    const store = r.open(t.now);
    const R = gatedRunner();
    const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner: R.runner, isAlive: (p) => p === 303, now: t.now, timers: t.timers, newTurnId: () => 'n1' });
    try {
      other.presence({ windowKey: 'w-B', pid: 303 });
      assert.ok(other.enqueue(bMsg('alive pid')).ok);
      await t.advance(PRESENCE_GRACE_MS * 3);
      assert.equal(store.list().find((m) => m.text === 'alive pid')?.state, 'queued');
    } finally {
      w.dispose();
      store.close();
      other.close();
      r.done();
    }
  }
  // No presence row at all: a message younger than the grace is left, an older one is marked.
  {
    const r = repo();
    const t = fakeTime();
    const other = r.open(t.now);
    const store = r.open(t.now);
    const R = gatedRunner();
    const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers, newTurnId: () => 'n1' });
    try {
      assert.ok(other.enqueue(bMsg('no row')).ok);
      await t.advance(PRESENCE_GRACE_MS - ACTIVE_POLL_MS * 4);
      assert.equal(store.list().find((m) => m.text === 'no row')?.state, 'queued', 'younger than the grace');
      await t.advance(ACTIVE_POLL_MS * 8);
      assert.equal(store.list().find((m) => m.text === 'no row')?.state, 'not-delivered', 'older than the grace');
    } finally {
      w.dispose();
      store.close();
      other.close();
      r.done();
    }
  }
});

test('dispose-and-recreate a worker with the same windowKey while a second window ticks, the head is not marked not-delivered', async () => {
  const r = repo();
  const t = fakeTime();
  const storeA = r.open(t.now);
  const storeB1 = r.open(t.now);
  const storeB2 = r.open(t.now);
  const A = gatedRunner();
  const B1 = gatedRunner();
  const B2 = gatedRunner();
  const alive = new Set<number>([101]);
  const wA = createChatQueueWorker({ store: storeA, claim: { windowKey: 'w-A', pid: 101 }, runner: A.runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => 'a1' });
  const wB1 = createChatQueueWorker({ store: storeB1, claim: { windowKey: 'w-B', pid: 303 }, runner: B1.runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => 'b1' });
  let wB2: ReturnType<typeof createChatQueueWorker> | undefined;
  try {
    // w-A runs a long turn; w-B's message waits behind it for longer than the presence grace.
    assert.ok(wA.submit(sub('sA', 'long')).ok);
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(A.runs.length, 1);
    assert.ok(wB1.submit(sub('sB', 'waits')).ok);
    await t.advance(PRESENCE_GRACE_MS + 10_000);
    // w-B reloads: its worker is disposed (the row is kept) and the old pid is gone.
    wB1.dispose();
    alive.delete(303);
    await t.advance(1_000);
    // w-A's turn ends: the lease is free while w-B has no worker. w-A ticks over w-B's head.
    A.runs[0]!.end({ kind: 'done' });
    await t.advance(ACTIVE_POLL_MS * 4);
    assert.equal(storeA.list().find((m) => m.text === 'waits')?.state, 'queued', 'not marked while the reloading window comes back');
    // The new worker of the same window takes it.
    alive.add(304);
    wB2 = createChatQueueWorker({ store: storeB2, claim: { windowKey: 'w-B', pid: 304 }, runner: B2.runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => 'b2' });
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(B2.runs.length, 1);
    assert.equal(B2.runs[0]!.message.text, 'waits');
    assert.equal(B1.runs.length, 0, 'the old worker never ran it');
  } finally {
    wA.dispose();
    wB1.dispose();
    wB2?.dispose();
    storeA.close();
    storeB1.close();
    storeB2.close();
    r.done();
  }
});

test('a reload slower than PRESENCE_GRACE_MS ends as not-delivered with a resend and no row is lost', async () => {
  const r = repo();
  const t = fakeTime();
  const storeA = r.open(t.now);
  const storeB = r.open(t.now);
  const A = gatedRunner();
  const B = gatedRunner();
  const alive = new Set<number>([101, 303]);
  const wA = createChatQueueWorker({ store: storeA, claim: { windowKey: 'w-A', pid: 101 }, runner: A.runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => 'a1' });
  const wB = createChatQueueWorker({ store: storeB, claim: { windowKey: 'w-B', pid: 303 }, runner: B.runner, isAlive: (p) => alive.has(p), now: t.now, timers: t.timers, newTurnId: () => 'b1' });
  try {
    assert.ok(wA.submit(sub('sA', 'long')).ok);
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.ok(wB.submit(sub('sB', 'waits')).ok);
    await t.advance(ACTIVE_POLL_MS * 2);
    wB.dispose();
    alive.delete(303); // the window reloads and takes longer than the grace to come back
    A.runs[0]!.end({ kind: 'done' });
    await t.advance(PRESENCE_GRACE_MS + 5_000);
    const rows = storeA.list();
    const marked = rows.find((m) => m.text === 'waits');
    assert.equal(marked?.state, 'not-delivered', 'marked once the row is stale and the pid is dead');
    assert.equal(rows.length, 1, 'no row is lost');
    // Resend: handed to the window that resends it.
    const again = storeA.resendFrom(marked!.seq, 'r1', 'w-A');
    assert.ok(again.ok);
    assert.equal(again.message.text, 'waits');
  } finally {
    wA.dispose();
    storeA.close();
    storeB.close();
    r.done();
  }
});

test("a previous-plugin window's dispose deleting its presence row: a head younger than PRESENCE_GRACE_MS is not marked, an older one is marked once", async () => {
  const r = repo();
  const t = fakeTime();
  const prev = r.open(t.now);
  const store = r.open(t.now);
  const R = gatedRunner();
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers, newTurnId: () => 'n1' });
  try {
    // The previous plugin's dispose ran leave(): the row is gone.
    prev.presence({ windowKey: 'w-B', pid: 303 });
    prev.leave({ windowKey: 'w-B', pid: 303 });
    assert.ok(prev.enqueue(bMsg('young', 'y')).ok);
    await t.advance(PRESENCE_GRACE_MS - ACTIVE_POLL_MS * 4);
    assert.equal(store.list().find((m) => m.text === 'young')?.state, 'queued', 'younger than the grace');
    await t.advance(ACTIVE_POLL_MS * 8);
    assert.equal(store.list().find((m) => m.text === 'young')?.state, 'not-delivered', 'an older one is marked');
    // Marked once: it stays one row, and later ticks leave it.
    await t.advance(PRESENCE_GRACE_MS);
    assert.equal(store.list().filter((m) => m.state === 'not-delivered').length, 1);
    assert.equal(store.list().length, 1);
  } finally {
    w.dispose();
    store.close();
    prev.close();
    r.done();
  }
});

// Epic E20261014613abdb3 Story S003 t7 — the unchanged bound (ac5), through the worker.
test('submit at the bound returns ok:false reason full', () => {
  const r = repo();
  const t = fakeTime();
  const store = r.open(t.now);
  const R = gatedRunner();
  let n = 0;
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner: R.runner, isAlive: () => true, now: t.now, timers: t.timers, newTurnId: () => `t${++n}` });
  try {
    for (let i = 0; i < QUEUE_RECORD_BOUND; i++) assert.ok(w.submit(sub(`s${i}`, `m${i}`)).ok, `row ${i}`);
    const refused = w.submit(sub('sx', 'one too many'));
    assert.equal(refused.ok, false);
    assert.equal(refused.ok ? undefined : refused.reason, 'full');
    assert.equal(refused.ok ? undefined : refused.note, FULL_NOTE);
    assert.equal(store.list().length, QUEUE_RECORD_BOUND, 'nothing already queued is lost');
  } finally {
    w.dispose();
    store.close();
    r.done();
  }
});

test('a finish that stays busy is retried each tick for 60 s, then retrying stops and one chat note is shown; a new worker for the same window frees the lease and fails the message with a resend', async () => {
  const r = repo();
  const t = fakeTime();
  const real = r.open(t.now);
  let busy = true;
  let attempts = 0;
  const store: Store = Object.assign(Object.create(real) as Store, {
    finish: (seq: number, outcome: TurnOutcome) => {
      attempts += 1;
      if (busy) throw new StoreBusy('database is locked');
      return real.finish(seq, outcome);
    },
  });
  const notes: string[] = [];
  const errors: string[] = [];
  const runs: { message: QueuedMessage; end: (o: TurnOutcome) => void }[] = [];
  const runner: QueuedTurnRunner = {
    run: (message) => new Promise<TurnOutcome>((end) => { runs.push({ message, end }); }),
    note: (_m, text) => void notes.push(text),
  };
  const log = { warn: () => {}, error: (m: string) => void errors.push(m) };
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner, isAlive: () => false, now: t.now, timers: t.timers, log });
  try {
    // INSIDE THE BOUND: the write lands as soon as the store frees up.
    assert.ok(w.submit(sub('s1', 'inside')).ok);
    await t.advance(0);
    runs[0]!.end({ kind: 'done' });
    await t.advance(ACTIVE_POLL_MS * 3);
    assert.ok(attempts >= 3, `retried on each tick (${attempts})`);
    busy = false;
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(real.list().some((m) => m.text === 'inside'), false, 'written once the store freed up (a done message leaves the list)');
    assert.equal(real.lease(), undefined, 'and the lease is released');
    assert.deepEqual(notes, [], 'no note inside the bound');

    // PAST THE BOUND: retrying stops and one note is shown.
    busy = true;
    attempts = 0;
    assert.ok(w.submit(sub('s1', 'stuck')).ok);
    await t.advance(0);
    runs[1]!.end({ kind: 'done' });
    await t.advance(BUSY_GIVE_UP_MS - ACTIVE_POLL_MS * 2);
    assert.deepEqual(notes, [], 'not yet');
    const before = attempts;
    assert.ok(before >= BUSY_GIVE_UP_MS / ACTIVE_POLL_MS - 4, `retried each tick (${before})`);
    await t.advance(ACTIVE_POLL_MS * 6);
    assert.deepEqual(notes, [GIVE_UP_NOTE], 'one note');
    assert.equal(errors.length, 1, 'one error logged');
    const stopped = attempts;
    await t.advance(ACTIVE_POLL_MS * 20);
    assert.equal(attempts, stopped, 'no more write attempts');
    assert.deepEqual(notes, [GIVE_UP_NOTE], 'still one note');
    assert.equal(real.list().find((m) => m.text === 'stuck')?.state, 'processing', 'the message is left as it was');

    // THE RELOAD: a new worker for the same window frees the lease, fails the message with a resend, and the next message runs.
    const fresh = r.open(t.now);
    const R2 = gatedRunner();
    const w2 = createChatQueueWorker({ store: fresh, claim: { windowKey: 'w-A', pid: 202 }, runner: R2.runner, isAlive: () => false, now: t.now, timers: t.timers });
    try {
      assert.ok(w2.submit(sub('s1', 'after')).ok);
      await t.advance(ACTIVE_POLL_MS * 3);
      assert.equal(fresh.list().find((m) => m.text === 'stuck')?.state, 'failed', 'failed for a resend');
      assert.equal(R2.runs.length, 1);
      assert.equal(R2.runs[0]!.message.text, 'after', 'the queue moved on');
    } finally {
      w2.dispose();
      fresh.close();
    }
  } finally {
    w.dispose();
    real.close();
    r.done();
  }
});

const overloaded: TurnOutcome = { kind: 'failed', error: 'API Error: 529 overloaded_error', acted: false, cause: 'overloaded' };
function retryWorker(t: ReturnType<typeof fakeTime>) {
  const r = repo();
  const store = r.open(t.now);
  const R = gatedRunner();
  const w = createChatQueueWorker({ store, claim: { windowKey: 'w-A', pid: 101 }, runner: R.runner, isAlive: () => false, now: t.now, timers: t.timers });
  return { r, store, R, w, close: () => { w.dispose(); store.close(); r.done(); } };
}

test('a retrying head is not taken before its due time, holds the queue behind it, and runs when due', async () => {
  const t = fakeTime();
  const h = retryWorker(t);
  try {
    assert.ok(h.w.submit(sub('s1', 'first')).ok);
    assert.ok(h.w.submit(sub('s1', 'second')).ok);
    await t.advance(0);
    h.R.runs[0]!.end(overloaded);
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(h.store.list().find((m) => m.text === 'first')?.state, 'retrying');
    await t.advance(RETRY_DELAYS_MS[0]! - ACTIVE_POLL_MS * 4);
    assert.equal(h.R.runs.length, 1, 'not taken before it is due, and the message behind it waits');
    await t.advance(ACTIVE_POLL_MS * 6);
    assert.equal(h.R.runs.length, 2);
    assert.equal(h.R.runs[1]!.message.text, 'first', 'the retried message runs first, once due');
    assert.equal(h.R.runs[1]!.message.attempts, 1);
    h.R.runs[1]!.end({ kind: 'done' });
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(h.R.runs[2]?.message.text, 'second', 'then the queue moves on');
  } finally {
    h.close();
  }
});

test('a message that fails three infrastructure retries ends failed and the next message runs', async () => {
  const t = fakeTime();
  const h = retryWorker(t);
  try {
    assert.ok(h.w.submit(sub('s1', 'flaky')).ok);
    assert.ok(h.w.submit(sub('s1', 'next')).ok);
    await t.advance(0);
    for (let i = 0; i < MAX_INFRA_RETRIES; i += 1) {
      h.R.runs[i]!.end(overloaded);
      await t.advance(ACTIVE_POLL_MS * 2);
      assert.equal(h.store.list().find((m) => m.text === 'flaky')?.state, 'retrying', `retry ${i + 1} is scheduled`);
      await t.advance(RETRY_DELAYS_MS[i]! + ACTIVE_POLL_MS * 2);
      assert.equal(h.R.runs.length, i + 2, `attempt ${i + 2} ran`);
    }
    h.R.runs[MAX_INFRA_RETRIES]!.end(overloaded); // the fourth failure
    await t.advance(ACTIVE_POLL_MS * 3);
    const flaky = h.store.list().find((m) => m.text === 'flaky');
    assert.equal(flaky?.state, 'failed');
    assert.equal(flaky?.attempts, MAX_INFRA_RETRIES);
    assert.equal(h.R.runs[MAX_INFRA_RETRIES + 1]?.message.text, 'next', 'the next message runs');
  } finally {
    h.close();
  }
});

test('act retry-now on a retrying row runs it at the next tick; on any other row it is refused with a note', async () => {
  const t = fakeTime();
  const h = retryWorker(t);
  try {
    assert.ok(h.w.submit(sub('s1', 'later')).ok);
    await t.advance(0);
    const seq = h.R.runs[0]!.message.seq;
    assert.deepEqual(h.w.act(seq, 'retry-now'), { ok: false, note: ACTION_NOTES.notRetrying }, 'a processing row is refused');
    h.R.runs[0]!.end(overloaded);
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(h.R.runs.length, 1, 'waiting for its delay');
    assert.deepEqual(h.w.act(seq, 'retry-now'), { ok: true });
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(h.R.runs.length, 2, 'ran at the next tick, long before its delay');
    assert.equal(h.R.runs[1]!.message.attempts, 1, 'retry-now does not change the attempt count');
    assert.deepEqual(h.w.act(999, 'retry-now'), { ok: false, note: ACTION_NOTES.notRetrying }, 'an unknown row is refused');
    h.R.runs[1]!.end({ kind: 'failed', error: 'something odd', acted: false, cause: 'other' });
    await t.advance(ACTIVE_POLL_MS * 2);
    assert.equal(h.w.act(seq, 'retry-now').ok, false, 'a failed row is refused');
    assert.equal(h.w.act(seq, 'retry-now').ok === false && (h.w.act(seq, 'retry-now') as { note: string }).note, ACTION_NOTES.notRetrying);
  } finally {
    h.close();
  }
});
