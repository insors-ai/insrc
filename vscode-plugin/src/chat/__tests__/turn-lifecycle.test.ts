/**
 * Story E202610108ca7382b:S001 — the chat turn lifecycle (turn-lifecycle.ts), without a panel.
 *
 * Memory session locks, a scripted StreamAdapter whose turns the test feeds event by event (each
 * turn reports a fake CLI process through onSpawn), an in-memory store and a recording sink.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnLifecycle, CURSOR_SAVE_MS, trySaveSession, type FollowSink, type TurnLifecycle, type TurnSink } from '../turn-lifecycle.js';
import { createMemorySessionLocks, type SessionLocks } from '../session-lock.js';
import type { ProviderRegistry, ResumeRequest, RunOptions, StreamAdapter, TurnProcess, TurnRequest } from '../cli-adapter.js';
import type { ChatSession, LiveTurn } from '../session-store.js';
import type { TurnEvent } from '../stream-events.js';
import { fakeLiveProc, tick, waitFor, type FakeLiveProc } from './fixtures.js';

/** An event channel the test pushes into and a turn reads from. */
interface Feed {
  push(ev: TurnEvent): void;
  end(): void;
  next(): Promise<IteratorResult<TurnEvent>>;
}
function feed(): Feed {
  const queue: TurnEvent[] = [];
  let ended = false;
  let wake: (() => void) | undefined;
  return {
    push(ev) {
      queue.push(ev);
      wake?.();
    },
    end() {
      ended = true;
      wake?.();
    },
    async next() {
      for (;;) {
        const ev = queue.shift();
        if (ev !== undefined) return { done: false, value: ev };
        if (ended) return { done: true, value: undefined };
        await new Promise<void>((r) => (wake = r));
        wake = undefined;
      }
    },
  };
}

type Proc = FakeLiveProc & { cursor?: TurnProcess['cursor'] };
interface Resume {
  readonly req: ResumeRequest;
  readonly proc: Proc;
  readonly feed: Feed;
}
interface Run {
  readonly turnId: string;
  readonly proc: Proc;
  readonly feed: Feed;
  readonly req: TurnRequest;
}

/**
 * Each run starts a fake CLI process (with a session-file cursor unless `pipe`), then yields what
 * the test feeds; the turn's output ends when its process exits.
 */
function scriptedAdapter(opts: { pipe?: boolean; noSpawn?: boolean; cancelThrows?: boolean; stopThrows?: boolean; resumeThrows?: boolean } = {}): {
  adapter: StreamAdapter;
  runs: Run[];
  cancels: string[];
  resumes: Resume[];
} {
  const runs: Run[] = [];
  const cancels: string[] = [];
  const resumes: Resume[] = [];
  const adapter: StreamAdapter = {
    async *run(req: TurnRequest, o?: RunOptions): AsyncIterable<TurnEvent> {
      const turnId = `t${runs.length + 1}`;
      const proc: Proc = fakeLiveProc(1000 + runs.length + 1);
      if (opts.pipe !== true) proc.cursor = { sessionId: o?.sessionId ?? '', turnId, generation: 1, offset: 0 };
      if (opts.stopThrows === true) {
        proc.stop = async () => {
          proc.signals.push('stop');
          throw new Error('not signalable');
        };
      }
      const f = feed();
      void proc.exit.then(() => f.end());
      runs.push({ turnId, proc, feed: f, req });
      if (opts.noSpawn !== true) o?.onSpawn?.(proc);
      let offset = 0;
      for (;;) {
        const r = await f.next();
        if (r.done === true) return;
        yield r.value;
        offset += 10;
        o?.onProgress?.({ sessionId: o.sessionId ?? '', turnId, generation: 1, offset });
      }
    },
    async *resume(req, o): AsyncIterable<TurnEvent> {
      if (opts.resumeThrows === true) throw new Error('segment unreadable');
      const proc: Proc = fakeLiveProc(2000 + resumes.length + 1);
      const f = feed();
      void proc.exit.then(() => f.end());
      o?.signal?.addEventListener('abort', () => f.end());
      resumes.push({ req, proc, feed: f });
      o?.onAttach?.(proc);
      let offset = req.cursor.offset;
      for (;;) {
        const r = await f.next();
        if (r.done === true) return;
        yield r.value;
        offset += 10;
        o?.onProgress?.({ ...req.cursor, offset });
      }
    },
    cancel: async (turnId) => {
      cancels.push(turnId);
      if (opts.cancelThrows === true) throw new Error('provider gone');
    },
    decide: () => {},
    capabilities: { resume: true },
  };
  return { adapter, runs, cancels, resumes };
}

function registry(adapter: StreamAdapter): ProviderRegistry {
  return { get: () => adapter, available: ['claude'] };
}

/** A sink that records what it was told, in order. */
function recSink(over: Partial<TurnSink> = {}): { sink: TurnSink; calls: string[] } {
  const calls: string[] = [];
  const sink: TurnSink = {
    onWaiting: () => calls.push('waiting'),
    beforeRun: async () => {
      calls.push('beforeRun');
    },
    onEvent: (ev) => calls.push(`event:${ev.kind}`),
    onTerminal: (ev) => calls.push(`terminal:${ev.kind}`),
    onError: (message, turnId) => calls.push(`error:${message}|${turnId}`),
    ...over,
  };
  return { sink, calls };
}

interface Harness {
  readonly lc: TurnLifecycle;
  readonly session: ChatSession;
  /** liveTurn as it was at each save. */
  readonly saves: Array<LiveTurn | undefined>;
  open: boolean;
}
function harness(o: { providers: ProviderRegistry; locks?: SessionLocks; isAlive?: (pid: number) => boolean; warnings?: string[] }): Harness {
  const saves: Array<LiveTurn | undefined> = [];
  const h: Harness = {
    open: true,
    saves,
    session: { id: 'sess-1', provider: 'claude', createdAt: 't', title: '', editMode: 'auto', transcript: [] },
    lc: undefined as unknown as TurnLifecycle,
  };
  (h as { lc: TurnLifecycle }).lc = createTurnLifecycle({
    providers: o.providers,
    store: { save: (s) => void saves.push(s.liveTurn === undefined ? undefined : { ...s.liveTurn }) },
    locks: o.locks ?? createMemorySessionLocks({ graceMs: 50 }),
    lockTimeoutMs: () => 60_000,
    hostPid: 7,
    processStartTime: (pid) => pid + 1,
    isAlive: o.isAlive ?? (() => true),
    isOpen: () => h.open,
    logger: { warn: (m) => void o.warnings?.push(m), error: () => {} },
  });
  return h;
}

const REQ: TurnRequest = { provider: 'claude', prompt: 'hi', cwd: '/' };
const delta = (turnId: string, text = 'x'): TurnEvent => ({ kind: 'assistant-delta', turnId, text });
const done = (turnId: string, sessionId?: string): TurnEvent => ({ kind: 'done', turnId, ok: true, ...(sessionId !== undefined ? { sessionId } : {}) });

test('start waits for the session lease, reports waiting, runs, and releases the lease when the process exits', async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const a = recSink();
  const first = h.lc.start(h.session, REQ, a.sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(delta('t1'));
  runs[0]!.feed.push(done('t1'));
  await first;
  assert.deepEqual(a.calls, ['beforeRun', 'event:assistant-delta', 'event:done', 'terminal:done']);
  assert.equal(runs[0]!.proc.exited(), false, 'the CLI keeps running after its answer');

  const b = recSink();
  const second = h.lc.start(h.session, REQ, b.sink);
  await waitFor(() => b.calls.includes('waiting'));
  await tick(20);
  assert.equal(runs.length, 1, 'the second turn waits while the first process is alive (the lease is not released at done)');
  assert.deepEqual(runs[0]!.proc.signals, [], 'the first process is not stopped');

  runs[0]!.proc.exitNow();
  await waitFor(() => runs.length === 2);
  runs[1]!.feed.push(done('t2'));
  await second;
  assert.deepEqual(b.calls, ['waiting', 'beforeRun', 'event:done', 'terminal:done']);
});

test('a second start drops a turn still waiting for its lease', async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const first = h.lc.start(h.session, REQ, recSink().sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(done('t1'));
  await first;

  const b = recSink();
  const second = h.lc.start(h.session, REQ, b.sink);
  await waitFor(() => b.calls.includes('waiting'));
  const c = recSink();
  const third = h.lc.start(h.session, REQ, c.sink);
  await second; // dropped: it returns without running
  assert.deepEqual(b.calls, ['waiting'], 'the dropped turn is told nothing more');

  runs[0]!.proc.exitNow();
  await waitFor(() => runs.length === 2);
  runs[1]!.feed.push(done('t2'));
  await third;
  assert.equal(runs.length, 2, 'only the newest turn ran');
  assert.deepEqual(c.calls, ['waiting', 'beforeRun', 'event:done', 'terminal:done']);
});

test('a superseded turn reports nothing, reads to its end and clears its cursor', async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const a = recSink();
  const first = h.lc.start(h.session, REQ, a.sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(delta('t1'));
  await waitFor(() => a.calls.includes('event:assistant-delta'));
  assert.equal(h.session.liveTurn?.cursor.turnId, 't1');

  const b = recSink();
  void h.lc.start(h.session, REQ, b.sink); // waits for t1's process
  await waitFor(() => b.calls.includes('waiting'));
  runs[0]!.feed.push(delta('t1', 'late'));
  runs[0]!.feed.push(done('t1'));
  await first; // the superseded turn read to its terminal event
  assert.deepEqual(a.calls, ['beforeRun', 'event:assistant-delta'], 'nothing after the supersede is reported');
  assert.equal(h.session.liveTurn, undefined, "the superseded turn's cursor is cleared at its terminal event");
  runs[0]!.proc.exitNow();
  await waitFor(() => runs.length === 2);
  runs[1]!.proc.exitNow();
});

test('a lease granted after the turn stopped being current is released', async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const first = h.lc.start(h.session, REQ, recSink().sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(done('t1'));
  await first;

  const b = recSink();
  const second = h.lc.start(h.session, REQ, b.sink);
  await waitFor(() => b.calls.includes('waiting'));
  h.lc.invalidate(); // a chat switch: the waiting turn is no longer current
  runs[0]!.proc.exitNow();
  await Promise.race([second, tick(100)]);
  assert.equal(runs.length, 1, 'the no-longer-current turn did not run');
  assert.deepEqual(b.calls, ['waiting']);

  const c = recSink();
  const third = h.lc.start(h.session, REQ, c.sink);
  await waitFor(() => runs.length === 2);
  assert.ok(!c.calls.includes('waiting'), 'the released lease is free at once');
  runs[1]!.feed.push(done('t2'));
  await third;
  runs[1]!.proc.exitNow();
});

test('a lock failure and a missing adapter are reported through onError', async () => {
  const locks: SessionLocks = { acquire: async () => Promise.reject(new Error('disk full')) };
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter), locks });
  const a = recSink();
  await h.lc.start(h.session, REQ, a.sink);
  assert.deepEqual(a.calls, ['error:could not lock chat session: disk full|none']);
  assert.equal(runs.length, 0);

  const noAdapter: ProviderRegistry = {
    get: () => {
      throw new Error('not installed');
    },
    available: [],
  };
  const h2 = harness({ providers: noAdapter });
  const b = recSink();
  await h2.lc.start(h2.session, REQ, b.sink);
  assert.deepEqual(b.calls, ['error:no adapter for provider claude|none']);
});

test('a beforeRun failure is reported, the session saved and the lease released', async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const a = recSink({
    beforeRun: async () => {
      throw new Error('baseline failed');
    },
  });
  await h.lc.start(h.session, REQ, a.sink);
  assert.deepEqual(a.calls, ['error:baseline failed|none']);
  assert.equal(h.saves.length, 1, 'the session is saved after the error');
  assert.equal(runs.length, 0, 'no CLI started');

  // The lease was released: a turn whose adapter never attaches a process does not wait either.
  const { adapter: noSpawn, runs: noSpawnRuns } = scriptedAdapter({ noSpawn: true });
  const h3 = harness({ providers: registry(noSpawn) });
  const b = recSink();
  const p = h3.lc.start(h3.session, REQ, b.sink);
  await waitFor(() => noSpawnRuns.length === 1);
  noSpawnRuns[0]!.feed.push(done('t1'));
  await p;
  const c = recSink();
  const q = h3.lc.start(h3.session, REQ, c.sink);
  await waitFor(() => noSpawnRuns.length === 2);
  assert.ok(!c.calls.includes('waiting'), 'a turn that attached no process released its lease on return');
  noSpawnRuns[1]!.feed.push(done('t2'));
  await q;

  const d = recSink();
  const r = h.lc.start(h.session, REQ, d.sink);
  await waitFor(() => runs.length === 1);
  assert.ok(!d.calls.includes('waiting'), 'the lease of the failed turn was released');
  runs[0]!.feed.push(done('t1'));
  await r;
  runs[0]!.proc.exitNow();
});

test('the cursor is saved on spawn, throttled on progress and cleared before onTerminal', async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  let atTerminal: { liveTurn: LiveTurn | undefined; nativeSessionId: string | undefined } | undefined;
  const a = recSink({
    onTerminal: () => {
      atTerminal = { liveTurn: h.session.liveTurn, nativeSessionId: h.session.nativeSessionId };
    },
  });
  const p = h.lc.start(h.session, REQ, a.sink);
  await waitFor(() => runs.length === 1);
  assert.deepEqual(h.saves, [{ cursor: { turnId: 't1', generation: 1, offset: 0 }, ownerHostPid: 7, pid: 1001, startedAt: 1002 }], 'saved at spawn, owned by this host');

  for (let i = 0; i < 5; i++) runs[0]!.feed.push(delta('t1'));
  await waitFor(() => h.session.liveTurn?.cursor.offset === 50);
  assert.equal(h.saves.length, 1, `progress within ${CURSOR_SAVE_MS} ms of the last save is not saved again`);
  await tick(CURSOR_SAVE_MS + 20);
  runs[0]!.feed.push(delta('t1'));
  await waitFor(() => h.saves.length === 2);
  assert.equal(h.saves[1]?.cursor.offset, 60, 'progress after the throttle window is saved');

  runs[0]!.feed.push(done('t1', 'native-9'));
  await p;
  assert.deepEqual(atTerminal, { liveTurn: undefined, nativeSessionId: 'native-9' }, 'cursor cleared and nativeSessionId set before onTerminal');
  runs[0]!.proc.exitNow();
});

test('invalidate and a closed panel suppress all sink calls; live names the turn being read', async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const a = recSink();
  const p = h.lc.start(h.session, REQ, a.sink);
  await waitFor(() => runs.length === 1);
  assert.equal(h.lc.live, undefined, 'no live turn before its first event');
  runs[0]!.feed.push(delta('t1'));
  await waitFor(() => a.calls.includes('event:assistant-delta'));
  assert.deepEqual(h.lc.live, { provider: 'claude', turnId: 't1' });

  h.lc.invalidate();
  runs[0]!.feed.push(delta('t1'));
  runs[0]!.feed.push(done('t1'));
  await p;
  assert.deepEqual(a.calls, ['beforeRun', 'event:assistant-delta'], 'nothing is reported after invalidate');

  // A closed panel: a turn queued behind t1's live process is not told it waits, and once the
  // lease comes it is released without running.
  h.open = false;
  const b = recSink();
  const q = h.lc.start(h.session, REQ, b.sink);
  await tick(20);
  runs[0]!.proc.exitNow();
  await q;
  assert.deepEqual(b.calls, [], 'a closed panel is told nothing');
  assert.equal(runs.length, 1, 'nothing runs for a closed panel');
});

test('a panel closed while a turn is read is told nothing more', async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const a = recSink();
  const p = h.lc.start(h.session, REQ, a.sink);
  await waitFor(() => runs.length === 1);
  h.open = false;
  runs[0]!.feed.push(delta('t1'));
  runs[0]!.feed.push(done('t1'));
  await p;
  assert.deepEqual(a.calls, ['beforeRun']);
  assert.equal(h.session.liveTurn, undefined, 'its cursor is still cleared at the terminal event');
  runs[0]!.proc.exitNow();
});

test('stop cancels the provider turn and stops the live process; idempotent with nothing running', async () => {
  const { adapter, runs, cancels } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const a = recSink();
  const p = h.lc.start(h.session, REQ, a.sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(delta('t1'));
  await waitFor(() => h.lc.live !== undefined);
  await h.lc.stop();
  assert.deepEqual(cancels, ['t1'], "the provider's turn is cancelled");
  assert.deepEqual(runs[0]!.proc.signals, ['SIGTERM']);
  assert.equal(runs[0]!.proc.exited(), true, 'stop resolves once the process has exited');
  assert.equal(h.lc.live, undefined);
  await p;

  await h.lc.stop(); // nothing running now
  const idle = harness({ providers: registry(scriptedAdapter().adapter) });
  await idle.lc.stop();
  assert.equal(idle.lc.live, undefined);
});

test('stop and detach drop a turn waiting for its lease', async () => {
  for (const end of ['stop', 'detach'] as const) {
    const { adapter, runs } = scriptedAdapter();
    const h = harness({ providers: registry(adapter) });
    const first = h.lc.start(h.session, REQ, recSink().sink);
    await waitFor(() => runs.length === 1);
    runs[0]!.feed.push(done('t1'));
    await first; // its process keeps running after the answer
    const b = recSink();
    const second = h.lc.start(h.session, REQ, b.sink);
    await waitFor(() => b.calls.includes('waiting'));
    await h.lc[end]();
    await second;
    await tick(20);
    assert.deepEqual(b.calls, ['waiting'], `${end}: the waiting turn is dropped silently`);
    assert.equal(runs.length, 1, `${end}: the waiting turn never runs`);
    runs[0]!.proc.exitNow();
  }

  // Detaching from a session-file turn that is still being read drops a turn queued behind it too.
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  void h.lc.start(h.session, REQ, recSink().sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(delta('t1'));
  await waitFor(() => h.lc.live !== undefined);
  const b = recSink();
  const second = h.lc.start(h.session, REQ, b.sink);
  await waitFor(() => b.calls.includes('waiting'));
  await h.lc.detach();
  await Promise.race([second, tick(50)]);
  runs[0]!.proc.exitNow();
  await tick(20);
  assert.deepEqual(b.calls, ['waiting'], 'detach from a reading turn: the waiting turn is dropped');
  assert.equal(runs.length, 1);
});

test('detach leaves a session-file turn running with its cursor saved and stops a pipe turn', async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const a = recSink();
  const p = h.lc.start(h.session, REQ, a.sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(delta('t1'));
  await waitFor(() => h.lc.live !== undefined);
  const savesBefore = h.saves.length;
  await h.lc.detach();
  assert.deepEqual(runs[0]!.proc.signals, [], 'the session-file turn keeps running');
  assert.equal(h.lc.live, undefined);
  assert.ok(h.saves.length > savesBefore, 'the cursor is saved at detach');
  assert.deepEqual(h.saves.at(-1)?.cursor, { turnId: 't1', generation: 1, offset: 10 });
  assert.equal(h.session.liveTurn?.cursor.turnId, 't1', 'the cursor stays saved for a later follow');
  runs[0]!.feed.push(delta('t1'));
  await p; // the read in flight at detach ends with the next line, unreported
  assert.deepEqual(a.calls, ['beforeRun', 'event:assistant-delta'], 'nothing is reported after detach');

  // The lease stays with the running process: the next turn waits for it.
  const b = recSink();
  const q = h.lc.start(h.session, REQ, b.sink);
  await waitFor(() => b.calls.includes('waiting'));
  runs[0]!.proc.exitNow();
  await waitFor(() => runs.length === 2);
  runs[1]!.feed.push(done('t2'));
  await q;
  runs[1]!.proc.exitNow();

  // A pipe turn cannot be resumed: detach stops it.
  const pipe = scriptedAdapter({ pipe: true });
  const h2 = harness({ providers: registry(pipe.adapter) });
  const r = h2.lc.start(h2.session, REQ, recSink().sink);
  await waitFor(() => pipe.runs.length === 1);
  pipe.runs[0]!.feed.push(delta('t1'));
  await waitFor(() => h2.lc.live !== undefined);
  await h2.lc.detach();
  await r;
  assert.deepEqual(pipe.runs[0]!.proc.signals, ['SIGTERM'], 'the pipe turn is stopped');
  assert.equal(pipe.runs[0]!.proc.exited(), true);
  assert.deepEqual(pipe.cancels, ['t1']);
});

test('stop continues past a failing cancel or process stop', async () => {
  const { adapter, runs, cancels } = scriptedAdapter({ cancelThrows: true, stopThrows: true });
  const h = harness({ providers: registry(adapter) });
  const p = h.lc.start(h.session, REQ, recSink().sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(delta('t1'));
  await waitFor(() => h.lc.live !== undefined);
  await h.lc.stop(); // never rejects
  assert.deepEqual(cancels, ['t1'], 'cancel was tried');
  assert.deepEqual(runs[0]!.proc.signals, ['stop'], 'the process stop was still tried after cancel failed');
  assert.equal(h.lc.live, undefined);
  runs[0]!.proc.exitNow();
  await p;
});

/** A follow sink recording events, and the session's cursor as it was at onEnd. */
function followSink(h: Harness): { sink: FollowSink; calls: string[]; cursorAtEnd: Array<LiveTurn | undefined> } {
  const calls: string[] = [];
  const cursorAtEnd: Array<LiveTurn | undefined> = [];
  return {
    calls,
    cursorAtEnd,
    sink: {
      onEvent: (ev) => calls.push(`event:${ev.kind}`),
      onEnd: (outcome) => {
        calls.push(outcome === 'failed' ? 'end:failed' : 'end');
        cursorAtEnd.push(h.session.liveTurn);
      },
    },
  };
}
const savedTurn = (ownerHostPid: number): LiveTurn => ({ cursor: { turnId: 'old', generation: 2, offset: 100 }, ownerHostPid, pid: 900, startedAt: 5 });

test('follow skips a running turn, a turn already followed and a turn owned by a live host', async () => {
  // No saved turn.
  const none = scriptedAdapter();
  const h0 = harness({ providers: registry(none.adapter) });
  h0.lc.follow(h0.session, followSink(h0).sink);
  // Owned by another extension host that is still alive.
  const other = scriptedAdapter();
  const h1 = harness({ providers: registry(other.adapter), isAlive: (pid) => pid === 99 });
  h1.session.liveTurn = savedTurn(99);
  h1.lc.follow(h1.session, followSink(h1).sink);
  await tick(10);
  assert.equal(none.resumes.length, 0, 'no saved turn: nothing to follow');
  assert.equal(other.resumes.length, 0, "another live window's turn is not followed");
  assert.equal(h1.session.liveTurn?.ownerHostPid, 99, 'ownership is not taken from a live host');

  // Already followed: a second follow of the same session does not resume it again.
  const twice = scriptedAdapter();
  const h2 = harness({ providers: registry(twice.adapter), isAlive: () => false });
  h2.session.liveTurn = savedTurn(99);
  h2.lc.follow(h2.session, followSink(h2).sink);
  h2.lc.follow(h2.session, followSink(h2).sink);
  await waitFor(() => twice.resumes.length === 1);
  await tick(10);
  assert.equal(twice.resumes.length, 1, 'a session already followed is not followed twice');
  await h2.lc.stop();

  // A turn this host is running live is read by start, not followed.
  const live = scriptedAdapter();
  const h3 = harness({ providers: registry(live.adapter) });
  const p = h3.lc.start(h3.session, REQ, recSink().sink);
  await waitFor(() => live.runs.length === 1);
  assert.equal(h3.session.liveTurn?.cursor.turnId, 't1');
  h3.lc.follow(h3.session, followSink(h3).sink);
  await tick(10);
  assert.equal(live.resumes.length, 0, 'a turn running in this host is not followed');
  live.runs[0]!.feed.push(done('t1'));
  await p;
  live.runs[0]!.proc.exitNow();
});

test('follow takes ownership from a dead host, reports every event, clears the cursor and calls onEnd', async () => {
  const { adapter, resumes } = scriptedAdapter();
  const h = harness({ providers: registry(adapter), isAlive: () => false });
  h.session.liveTurn = savedTurn(99);
  const f = followSink(h);
  h.lc.follow(h.session, f.sink);
  await waitFor(() => resumes.length === 1);
  assert.deepEqual(resumes[0]!.req, { cursor: { sessionId: 'sess-1', turnId: 'old', generation: 2, offset: 100 }, pid: 900, startedAt: 5 }, 'resumed from the saved cursor');
  assert.equal(h.saves[0]?.ownerHostPid, 7, 'ownership is taken (and saved) before reading');

  resumes[0]!.feed.push(delta('old'));
  resumes[0]!.feed.push(delta('old'));
  resumes[0]!.feed.push(done('old', 'native-3'));
  await waitFor(() => f.calls.includes('end'));
  assert.deepEqual(f.calls, ['event:assistant-delta', 'event:assistant-delta', 'event:done', 'end']);
  assert.deepEqual(f.cursorAtEnd, [undefined], 'the cursor is cleared before onEnd');
  assert.equal(h.saves.at(-1), undefined, 'and the cleared session saved');
  assert.equal(h.session.nativeSessionId, 'native-3');
});

test('a failing resume keeps the cursor saved', async () => {
  const warnings: string[] = [];
  const { adapter } = scriptedAdapter({ resumeThrows: true });
  const h = harness({ providers: registry(adapter), isAlive: () => false, warnings });
  h.session.liveTurn = savedTurn(99);
  const f = followSink(h);
  h.lc.follow(h.session, f.sink);
  await waitFor(() => warnings.length === 1);
  assert.match(warnings[0]!, /could not resume turn old: segment unreadable/);
  assert.equal(h.session.liveTurn?.cursor.turnId, 'old', 'the cursor stays saved');
  assert.deepEqual(f.calls, ['end:failed'], 'the end is reported as failed');
  // Following has been released: a later follow tries again.
  h.lc.follow(h.session, f.sink);
  await waitFor(() => warnings.length === 2);
});

test("stop ends a followed turn's process; detach leaves it running", async () => {
  const { adapter, resumes } = scriptedAdapter();
  const h = harness({ providers: registry(adapter), isAlive: () => false });
  h.session.liveTurn = savedTurn(99);
  const f = followSink(h);
  h.lc.follow(h.session, f.sink);
  await waitFor(() => resumes.length === 1);
  await h.lc.stop();
  assert.deepEqual(resumes[0]!.proc.signals, ['SIGTERM'], "Stop ends the followed turn's process");
  assert.equal(resumes[0]!.proc.exited(), true);
  await tick(10);
  assert.deepEqual(f.calls, [], 'a stopped follow does not end the turn');

  const d = scriptedAdapter();
  const h2 = harness({ providers: registry(d.adapter), isAlive: () => false });
  h2.session.liveTurn = savedTurn(99);
  const g = followSink(h2);
  h2.lc.follow(h2.session, g.sink);
  await waitFor(() => d.resumes.length === 1);
  await h2.lc.detach();
  await tick(10);
  assert.deepEqual(d.resumes[0]!.proc.signals, [], 'detach leaves the followed process running');
  assert.deepEqual(g.calls, [], 'and does not end the turn');
  assert.equal(h2.session.liveTurn?.cursor.turnId, 'old', 'its cursor stays saved');
  h2.lc.follow(h2.session, g.sink);
  await waitFor(() => d.resumes.length === 2);
  d.resumes[1]!.proc.exitNow();
  d.resumes[0]!.proc.exitNow();
});

test('a detached session-file turn is resumed by follow', async () => {
  const { adapter, runs, resumes } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const p = h.lc.start(h.session, REQ, recSink().sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(delta('t1'));
  await waitFor(() => h.lc.live !== undefined);
  await h.lc.detach();
  runs[0]!.feed.push(delta('t1'));
  await p;

  const f = followSink(h);
  h.lc.follow(h.session, f.sink);
  await waitFor(() => resumes.length === 1);
  assert.deepEqual(resumes[0]!.req.cursor, { sessionId: 'sess-1', turnId: 't1', generation: 1, offset: 10 }, 'followed from where the detach left it');
  assert.equal(resumes[0]!.req.pid, 1001, "the turn's own process");
  resumes[0]!.feed.push(done('t1'));
  await waitFor(() => f.calls.includes('end'));
  assert.equal(h.session.liveTurn, undefined);
  runs[0]!.proc.exitNow();
  resumes[0]!.proc.exitNow();
});

test('trySaveSession logs a failing save and never throws', () => {
  const warnings: string[] = [];
  const session = { id: 'sess-9', provider: 'claude', createdAt: 't', title: '', editMode: 'auto', transcript: [] } as ChatSession;
  const failing = {
    save: () => {
      throw new Error('quota exceeded');
    },
  };
  assert.doesNotThrow(() => trySaveSession(failing, { warn: (m) => warnings.push(m), error: () => {} }, session));
  assert.deepEqual(warnings, ['[chat] session sess-9 not saved: quota exceeded']);
  const saved: string[] = [];
  trySaveSession({ save: (s) => void saved.push(s.id) }, { warn: (m) => warnings.push(m), error: () => {} }, session);
  assert.deepEqual(saved, ['sess-9'], 'a working save is passed through');
  assert.equal(warnings.length, 1);
});

test("a generator whose cleanup throws when the turn finishes it is not an unhandled rejection", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => void unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const proc = fakeLiveProc(3001);
    const f = feed();
    void proc.exit.then(() => f.end());
    const adapter: StreamAdapter = {
      async *run(_req, o): AsyncIterable<TurnEvent> {
        o?.onSpawn?.(proc);
        try {
          for (;;) {
            const r = await f.next();
            if (r.done === true) return;
            yield r.value;
          }
        } finally {
          // eslint-disable-next-line no-unsafe-finally
          throw new Error('cleanup failed');
        }
      },
      async *resume(): AsyncIterable<TurnEvent> {},
      cancel: async () => {},
      decide: () => {},
      capabilities: { resume: true },
    };
    const h = harness({ providers: registry(adapter) });
    const a = recSink();
    const p = h.lc.start(h.session, REQ, a.sink);
    f.push(delta('t1'));
    f.push(done('t1')); // the terminal event: the turn returns the generator while it is parked at a yield
    await p;
    await tick(20);
    assert.deepEqual(a.calls, ['beforeRun', 'event:assistant-delta', 'event:done', 'terminal:done']);
    assert.deepEqual(unhandled, [], 'the rejected return() is handled');
    proc.exitNow();
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('a turn superseded or stopped while beforeRun runs starts no CLI', async () => {
  let releaseA!: () => void;
  const gateA = new Promise<void>((r) => (releaseA = r));
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const pa = h.lc.start(h.session, { ...REQ, prompt: 'first' }, recSink({ beforeRun: () => gateA }).sink);
  await tick(10); // the first turn holds the lease and is in beforeRun
  const b = recSink();
  const pb = h.lc.start(h.session, { ...REQ, prompt: 'second' }, b.sink);
  await waitFor(() => b.calls.includes('waiting'));
  releaseA();
  await Promise.race([pa, tick(100)]);
  await waitFor(() => runs.length === 1);
  assert.equal(runs[0]!.req.prompt, 'second', 'the superseded turn never started its CLI');
  runs[0]!.feed.push(done('t1'));
  await pb;
  runs[0]!.proc.exitNow();

  let releaseC!: () => void;
  const gateC = new Promise<void>((r) => (releaseC = r));
  const c = scriptedAdapter();
  const h2 = harness({ providers: registry(c.adapter) });
  const pc = h2.lc.start(h2.session, REQ, recSink({ beforeRun: () => gateC }).sink);
  await tick(10);
  await h2.lc.stop(); // Stop while the turn sets up
  releaseC();
  await Promise.race([pc, tick(100)]);
  await tick(10);
  assert.equal(c.runs.length, 0, 'a turn stopped during beforeRun starts no CLI');
  const d = recSink();
  const pd = h2.lc.start(h2.session, REQ, d.sink);
  await waitFor(() => c.runs.length === 1);
  assert.ok(!d.calls.includes('waiting'), "the stopped turn's lease was released");
  c.runs[0]!.feed.push(done('t1'));
  await pd;
  c.runs[0]!.proc.exitNow();
});

test("a superseded turn's end saves its cleared cursor and keeps its native session", async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const pa = h.lc.start(h.session, REQ, recSink().sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(delta('t1'));
  await waitFor(() => h.session.liveTurn?.cursor.offset === 10);
  const b = recSink();
  const pb = h.lc.start(h.session, REQ, b.sink);
  await waitFor(() => b.calls.includes('waiting'));
  runs[0]!.feed.push(done('t1', 'native-A'));
  await pa;
  assert.equal(h.saves.at(-1), undefined, 'the session is saved with the cursor cleared');
  assert.equal(h.session.nativeSessionId, 'native-A');
  await h.lc.stop(); // drops the waiting turn and ends the first process
  await pb;
});

test('a throwing onTerminal is logged, still finishes the generator and is not a turn error', async () => {
  const warnings: string[] = [];
  const proc = fakeLiveProc(3101);
  const f = feed();
  let cleanedUp = false;
  const adapter: StreamAdapter = {
    async *run(_req, o): AsyncIterable<TurnEvent> {
      o?.onSpawn?.(proc);
      try {
        for (;;) {
          const r = await f.next();
          if (r.done === true) return;
          yield r.value;
        }
      } finally {
        cleanedUp = true;
      }
    },
    async *resume(): AsyncIterable<TurnEvent> {},
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  const h = harness({ providers: registry(adapter), warnings });
  const a = recSink({
    onTerminal: () => {
      throw new Error('history refresh failed');
    },
  });
  const p = h.lc.start(h.session, REQ, a.sink);
  f.push(done('t1'));
  await p;
  await tick(10);
  assert.deepEqual(a.calls, ['beforeRun', 'event:done'], 'a finished turn is not reported as an error');
  assert.equal(cleanedUp, true, "the adapter's generator is finished");
  assert.match(warnings.join('\n'), /after turn t1 ended: history refresh failed/);
  proc.exitNow();
});

test("an aborted follow unwinding late does not drop the next follow's process, so Stop still ends it", async () => {
  const procA = fakeLiveProc(4001);
  const procB = fakeLiveProc(4002);
  let releaseA!: () => void;
  const gateA = new Promise<void>((r) => (releaseA = r));
  const attached: number[] = [];
  const adapter: StreamAdapter = {
    async *run(): AsyncIterable<TurnEvent> {},
    async *resume(req, o): AsyncIterable<TurnEvent> {
      const proc = req.cursor.sessionId === 'A' ? procA : procB;
      o?.onAttach?.(proc);
      attached.push(proc.pid);
      if (proc === procA) {
        await gateA; // A unwinds only when the test lets it, after B attached
        return;
      }
      await proc.exit;
    },
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  const h = harness({ providers: registry(adapter), isAlive: () => false });
  const sessionA: ChatSession = { ...h.session, id: 'A', liveTurn: savedTurn(99) };
  const sessionB: ChatSession = { ...h.session, id: 'B', liveTurn: savedTurn(99) };
  h.lc.follow(sessionA, followSink(h).sink);
  await waitFor(() => attached.includes(4001));
  await h.lc.detach(); // a chat switch: A is no longer followed (its loop has not unwound yet)
  h.lc.follow(sessionB, followSink(h).sink);
  await waitFor(() => attached.includes(4002));
  releaseA();
  await tick(10);
  await h.lc.stop();
  assert.deepEqual(procB.signals, ['SIGTERM'], "Stop ends the followed session's process");
  assert.deepEqual(procA.signals, [], "the detached session's process is left running");
  procA.exitNow();
});

test("a throwing onEvent is reported and the turn's generator is finished", async () => {
  const proc = fakeLiveProc(3201);
  const f = feed();
  let cleanedUp = false;
  const adapter: StreamAdapter = {
    async *run(_req, o): AsyncIterable<TurnEvent> {
      o?.onSpawn?.(proc);
      try {
        for (;;) {
          const r = await f.next();
          if (r.done === true) return;
          yield r.value;
        }
      } finally {
        cleanedUp = true;
      }
    },
    async *resume(): AsyncIterable<TurnEvent> {},
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  const h = harness({ providers: registry(adapter) });
  const a = recSink({
    onEvent: () => {
      throw new Error('post failed');
    },
  });
  const p = h.lc.start(h.session, REQ, a.sink);
  f.push(delta('t1'));
  await p;
  await tick(10);
  assert.deepEqual(a.calls, ['beforeRun', 'error:post failed|t1'], 'the failure is reported against the turn');
  assert.equal(cleanedUp, true, 'the abandoned turn has its generator finished');
  proc.exitNow();
});

test('a failing onError report is logged and start never rejects', async () => {
  const warnings: string[] = [];
  const locks: SessionLocks = { acquire: async () => Promise.reject(new Error('disk full')) };
  const h = harness({ providers: registry(scriptedAdapter().adapter), locks, warnings });
  const sink = recSink({
    onError: () => {
      throw new Error('webview gone');
    },
  }).sink;
  await assert.doesNotReject(h.lc.start(h.session, REQ, sink));
  assert.match(warnings.join('\n'), /could not report "could not lock chat session: disk full": webview gone/);

  // A missing adapter is not reported to a closed panel.
  const noAdapter: ProviderRegistry = {
    get: () => {
      throw new Error('not installed');
    },
    available: [],
  };
  const h2 = harness({ providers: noAdapter });
  h2.open = false;
  const b = recSink();
  await h2.lc.start(h2.session, REQ, b.sink);
  assert.deepEqual(b.calls, [], 'a closed panel is told nothing');
});

test('a failing follow onEvent is logged and the follow still ends the turn', async () => {
  const warnings: string[] = [];
  const { adapter, resumes } = scriptedAdapter();
  const h = harness({ providers: registry(adapter), isAlive: () => false, warnings });
  h.session.liveTurn = savedTurn(99);
  const calls: string[] = [];
  h.lc.follow(h.session, {
    onEvent: (ev) => {
      calls.push(`event:${ev.kind}`);
      if (ev.kind === 'assistant-delta') throw new Error('append failed');
    },
    onEnd: () => calls.push('end'),
  });
  await waitFor(() => resumes.length === 1);
  resumes[0]!.feed.push(delta('old'));
  resumes[0]!.feed.push(done('old'));
  await waitFor(() => calls.includes('end'));
  assert.deepEqual(calls, ['event:assistant-delta', 'event:done', 'end']);
  assert.equal(h.session.liveTurn, undefined, 'the cursor is cleared, so the turn is never replayed');
  assert.match(warnings.join('\n'), /turn old: an event was not handled: append failed/);
});

test('a turn whose output ends without a done or error event ends as an error', async () => {
  const { adapter, runs } = scriptedAdapter();
  const h = harness({ providers: registry(adapter) });
  const a = recSink();
  const p = h.lc.start(h.session, REQ, a.sink);
  await waitFor(() => runs.length === 1);
  runs[0]!.feed.push(delta('t1'));
  await waitFor(() => a.calls.includes('event:assistant-delta'));
  runs[0]!.proc.exitNow(); // the output ends with no terminal event
  await p;
  assert.deepEqual(a.calls, ['beforeRun', 'event:assistant-delta', 'event:error', 'terminal:error'], 'the panel is told the turn ended');
  assert.equal(h.session.liveTurn, undefined, 'its cursor is cleared, so a reload does not follow it');

  // A superseded turn whose output ends that way: its cursor is cleared and saved, nothing reported.
  const s2 = scriptedAdapter();
  const h2 = harness({ providers: registry(s2.adapter) });
  const b = recSink();
  const pb = h2.lc.start(h2.session, REQ, b.sink);
  await waitFor(() => s2.runs.length === 1);
  s2.runs[0]!.feed.push(delta('t1'));
  await waitFor(() => h2.session.liveTurn?.cursor.offset === 10);
  const c = recSink();
  const pc = h2.lc.start(h2.session, REQ, c.sink);
  await waitFor(() => c.calls.includes('waiting'));
  s2.runs[0]!.proc.exitNow();
  await pb;
  assert.deepEqual(b.calls, ['beforeRun', 'event:assistant-delta']);
  assert.ok(h2.saves.includes(undefined), 'the cleared cursor is saved');
  await waitFor(() => s2.runs.length === 2);
  s2.runs[1]!.feed.push(done('t2'));
  await pc;
  s2.runs[1]!.proc.exitNow();
});

// ---------------------------------------------------------------------------
// Story E202610138d4b90c9:S001 t5 — busy(), and a follow that fails reports its end
// ---------------------------------------------------------------------------

test('turn lifecycle: busy is true while a started turn waits, sets up or is read and while a follow is read; false after the terminal event is handed over, after a follow ends, after stop and detach, and when follow returns without following; a superseding turn keeps it true', async () => {
  // A started turn: setting up, being read, and its terminal event.
  {
    const { adapter, runs } = scriptedAdapter();
    const h = harness({ providers: registry(adapter) });
    assert.equal(h.lc.busy(), false, 'nothing has started');
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const seen: string[] = [];
    const a = recSink({
      beforeRun: async () => {
        seen.push(`beforeRun:${h.lc.busy()}`);
        await held;
      },
      onEvent: (ev) => seen.push(`event:${ev.kind}:${h.lc.busy()}`),
      onTerminal: (ev) => seen.push(`terminal:${ev.kind}:${h.lc.busy()}`),
    });
    const first = h.lc.start(h.session, REQ, a.sink);
    assert.equal(h.lc.busy(), true, 'from the call on');
    await waitFor(() => seen.length === 1);
    assert.equal(h.lc.busy(), true, 'while it sets up');
    release();
    await waitFor(() => runs.length === 1);
    runs[0]!.feed.push(delta('t1'));
    await waitFor(() => seen.length === 2);
    assert.equal(h.lc.busy(), true, 'while it is read');
    runs[0]!.feed.push(done('t1'));
    await first;
    assert.deepEqual(seen, ['beforeRun:true', 'event:assistant-delta:true', 'event:done:true', 'terminal:done:false'], 'false once the terminal event is handed over, before onTerminal');
    assert.equal(h.lc.busy(), false);

    // Waiting for its lease behind the first turn's process, then superseded by a third turn.
    const b = recSink();
    const second = h.lc.start(h.session, REQ, b.sink);
    await waitFor(() => b.calls.includes('waiting'));
    assert.equal(h.lc.busy(), true, 'while it waits for its lease');
    const c = recSink();
    const third = h.lc.start(h.session, REQ, c.sink);
    await second; // dropped while waiting
    assert.equal(h.lc.busy(), true, 'the superseding turn keeps it true');
    runs[0]!.proc.exitNow();
    await waitFor(() => runs.length === 2);
    assert.equal(h.lc.busy(), true);
    runs[1]!.feed.push(done('t2'));
    await third;
    assert.equal(h.lc.busy(), false);
    runs[1]!.proc.exitNow();
  }

  // A turn superseded while it is read: its end does not make busy false.
  {
    const { adapter, runs } = scriptedAdapter({ pipe: true });
    const h = harness({ providers: registry(adapter) });
    const first = h.lc.start(h.session, REQ, recSink().sink);
    await waitFor(() => runs.length === 1);
    runs[0]!.feed.push(delta('t1'));
    await waitFor(() => h.lc.live !== undefined);
    const b = recSink();
    const second = h.lc.start(h.session, REQ, b.sink);
    await waitFor(() => b.calls.includes('waiting'));
    runs[0]!.feed.push(done('t1')); // the superseded turn ends, unreported
    await first;
    assert.equal(h.lc.busy(), true, 'the superseded turn ended; its successor is still in progress');
    runs[0]!.proc.exitNow();
    await waitFor(() => runs.length === 2);
    runs[1]!.feed.push(done('t2'));
    await second;
    assert.equal(h.lc.busy(), false);
    runs[1]!.proc.exitNow();
  }

  // stop, detach and a chat switch (detach with invalidate), while a turn is read and while one waits.
  for (const end of ['stop', 'detach'] as const) {
    const { adapter, runs } = scriptedAdapter();
    const h = harness({ providers: registry(adapter) });
    const first = h.lc.start(h.session, REQ, recSink().sink);
    await waitFor(() => runs.length === 1);
    runs[0]!.feed.push(delta('t1'));
    await waitFor(() => h.lc.live !== undefined);
    assert.equal(h.lc.busy(), true);
    const ended = h.lc[end]();
    if (end === 'detach') h.lc.invalidate();
    assert.equal(h.lc.busy(), false, `${end}: false as soon as it is called`);
    await ended;
    assert.equal(h.lc.busy(), false, `${end}: and after it has taken effect`);
    runs[0]!.proc.exitNow();
    await Promise.race([first, tick(50)]);
    assert.equal(h.lc.busy(), false);

    const b = recSink();
    const second = h.lc.start(h.session, REQ, b.sink);
    assert.equal(h.lc.busy(), true, `${end}: a later turn is in progress again`);
    await waitFor(() => runs.length === 2);
    runs[1]!.feed.push(done('t2'));
    await second;
    assert.equal(h.lc.busy(), false);
    runs[1]!.proc.exitNow();
  }
  for (const end of ['stop', 'detach'] as const) {
    const { adapter, runs } = scriptedAdapter();
    const h = harness({ providers: registry(adapter) });
    const first = h.lc.start(h.session, REQ, recSink().sink);
    await waitFor(() => runs.length === 1);
    runs[0]!.feed.push(done('t1'));
    await first;
    const b = recSink();
    const second = h.lc.start(h.session, REQ, b.sink);
    await waitFor(() => b.calls.includes('waiting'));
    assert.equal(h.lc.busy(), true);
    await h.lc[end]();
    assert.equal(h.lc.busy(), false, `${end}: a waiting turn that was dropped is not in progress`);
    await second;
    assert.equal(h.lc.busy(), false);
    runs[0]!.proc.exitNow();
  }

  // A turn that cannot start is not in progress once start has returned.
  {
    const h = harness({ providers: { get: () => { throw new Error('no adapter'); }, available: [] } });
    await h.lc.start(h.session, REQ, recSink().sink);
    assert.equal(h.lc.busy(), false, 'no adapter');
    const { adapter } = scriptedAdapter();
    const h2 = harness({ providers: registry(adapter) });
    await h2.lc.start(h2.session, REQ, recSink({ beforeRun: async () => { throw new Error('setup failed'); } }).sink);
    assert.equal(h2.lc.busy(), false, 'a failed setup');
  }

  // A follow: true while it is read, false before onEnd.
  {
    const { adapter, resumes } = scriptedAdapter();
    const h = harness({ providers: registry(adapter), isAlive: () => false });
    h.session.liveTurn = savedTurn(99);
    const seen: string[] = [];
    h.lc.follow(h.session, {
      onEvent: (ev) => seen.push(`event:${ev.kind}:${h.lc.busy()}`),
      onEnd: (outcome) => seen.push(`end:${outcome}:${h.lc.busy()}`),
    });
    assert.equal(h.lc.busy(), true, 'from the call on');
    await waitFor(() => resumes.length === 1);
    resumes[0]!.feed.push(delta('old'));
    await waitFor(() => seen.length === 1);
    assert.equal(h.lc.busy(), true, 'while the follow is read');
    resumes[0]!.feed.push(done('old'));
    await waitFor(() => seen.length === 3);
    assert.deepEqual(seen, ['event:assistant-delta:true', 'event:done:true', 'end:ended:false'], 'false once the follow has ended, before onEnd');
    assert.equal(h.lc.busy(), false);
  }

  // stop and detach end a follow: false at once, and onEnd is not called.
  for (const end of ['stop', 'detach'] as const) {
    const { adapter, resumes } = scriptedAdapter();
    const h = harness({ providers: registry(adapter), isAlive: () => false });
    h.session.liveTurn = savedTurn(99);
    const f = followSink(h);
    h.lc.follow(h.session, f.sink);
    await waitFor(() => resumes.length === 1);
    assert.equal(h.lc.busy(), true);
    const ended = h.lc[end]();
    assert.equal(h.lc.busy(), false, `${end}: a follow it ended is not in progress`);
    await ended;
    await tick(20);
    assert.equal(h.lc.busy(), false);
    assert.deepEqual(f.calls, [], `${end}: its end is not reported`);
    resumes[0]!.proc.exitNow();
  }

  // follow returns without following: no saved turn, a turn owned by a live host, no adapter.
  {
    const { adapter } = scriptedAdapter();
    const h = harness({ providers: registry(adapter), isAlive: () => true });
    const f = followSink(h);
    h.lc.follow(h.session, f.sink);
    assert.equal(h.lc.busy(), false, 'no saved turn');
    h.session.liveTurn = savedTurn(99);
    h.lc.follow(h.session, f.sink);
    assert.equal(h.lc.busy(), false, "another live window's turn");
    const h2 = harness({ providers: { get: () => { throw new Error('no adapter'); }, available: [] }, isAlive: () => false });
    h2.session.liveTurn = savedTurn(99);
    h2.lc.follow(h2.session, f.sink);
    assert.equal(h2.lc.busy(), false, 'no adapter');
    await tick(10);
    assert.deepEqual(f.calls, [], 'and no end is reported for a follow that did not begin');
  }
});

test('turn lifecycle: a follow whose resume fails calls its end callback exactly once, and busy is false when it is called', async () => {
  const warnings: string[] = [];
  const { adapter } = scriptedAdapter({ resumeThrows: true });
  const h = harness({ providers: registry(adapter), isAlive: () => false, warnings });
  h.session.liveTurn = savedTurn(99);
  const ends: Array<{ outcome: string; busy: boolean; cursor: string | undefined }> = [];
  const events: string[] = [];
  h.lc.follow(h.session, {
    onEvent: (ev) => events.push(ev.kind),
    onEnd: (outcome) => ends.push({ outcome, busy: h.lc.busy(), cursor: h.session.liveTurn?.cursor.turnId }),
  });
  assert.equal(h.lc.busy(), true, 'in progress until the resume has failed');
  await waitFor(() => ends.length === 1);
  await tick(20);
  assert.deepEqual(ends, [{ outcome: 'failed', busy: false, cursor: 'old' }], 'once, as failed, not in progress, the cursor still saved');
  assert.deepEqual(events, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /could not resume turn old: segment unreadable/);
  assert.equal(h.lc.busy(), false);

  // A resume that fails part-way, after an event, is reported once too.
  const failing: StreamAdapter = {
    ...adapter,
    async *resume(): AsyncIterable<TurnEvent> {
      yield delta('old');
      throw new Error('segment truncated');
    },
  };
  const h2 = harness({ providers: registry(failing), isAlive: () => false, warnings });
  h2.session.liveTurn = savedTurn(99);
  const f2 = followSink(h2);
  h2.lc.follow(h2.session, f2.sink);
  await waitFor(() => f2.calls.includes('end:failed'));
  await tick(20);
  assert.deepEqual(f2.calls, ['event:assistant-delta', 'end:failed']);
  assert.equal(h2.lc.busy(), false);

  // A throwing end callback is logged, and the follow is released: a later follow tries again.
  const h3 = harness({ providers: registry(adapter), isAlive: () => false, warnings });
  h3.session.liveTurn = savedTurn(99);
  let calls = 0;
  const throwing: FollowSink = {
    onEvent: () => {},
    onEnd: () => {
      calls += 1;
      throw new Error('panel gone');
    },
  };
  const before = warnings.length;
  h3.lc.follow(h3.session, throwing);
  await waitFor(() => warnings.length === before + 2);
  assert.match(warnings.at(-1)!, /after the follow of turn old failed: panel gone/);
  assert.equal(h3.lc.busy(), false);
  h3.lc.follow(h3.session, throwing);
  await waitFor(() => calls === 2);

  // A follow that stop() ended while its resume was failing is not reported.
  let rejectResume!: (e: Error) => void;
  const pending: StreamAdapter = {
    ...adapter,
    // eslint-disable-next-line require-yield
    async *resume(): AsyncIterable<TurnEvent> {
      await new Promise<void>((_, rej) => (rejectResume = rej));
    },
  };
  const h4 = harness({ providers: registry(pending), isAlive: () => false, warnings });
  h4.session.liveTurn = savedTurn(99);
  const f4 = followSink(h4);
  h4.lc.follow(h4.session, f4.sink);
  await waitFor(() => rejectResume !== undefined);
  await h4.lc.stop();
  rejectResume(new Error('read aborted'));
  await tick(20);
  assert.deepEqual(f4.calls, [], 'stopped: no end is reported');
});
