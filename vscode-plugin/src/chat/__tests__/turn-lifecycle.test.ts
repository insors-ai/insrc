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
import { createTurnLifecycle, CURSOR_SAVE_MS, type TurnLifecycle, type TurnSink } from '../turn-lifecycle.js';
import { createMemorySessionLocks, type SessionLocks } from '../session-lock.js';
import type { ProviderRegistry, RunOptions, StreamAdapter, TurnProcess, TurnRequest } from '../cli-adapter.js';
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
function scriptedAdapter(opts: { pipe?: boolean; noSpawn?: boolean; cancelThrows?: boolean; stopThrows?: boolean } = {}): {
  adapter: StreamAdapter;
  runs: Run[];
  cancels: string[];
} {
  const runs: Run[] = [];
  const cancels: string[] = [];
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
    async *resume(): AsyncIterable<TurnEvent> {},
    cancel: async (turnId) => {
      cancels.push(turnId);
      if (opts.cancelThrows === true) throw new Error('provider gone');
    },
    decide: () => {},
    capabilities: { resume: true },
  };
  return { adapter, runs, cancels };
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
function harness(o: { providers: ProviderRegistry; locks?: SessionLocks }): Harness {
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
    isAlive: () => true,
    isOpen: () => h.open,
    logger: { warn: () => {}, error: () => {} },
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
