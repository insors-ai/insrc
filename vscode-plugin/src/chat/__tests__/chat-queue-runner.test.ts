// Epic E20261014613abdb3 Story S001 t4 — the chat host's runner for queued messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatPanelHost, type ChatPanelChannel } from '../chat-panel.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import type { ProviderId, ProviderRegistry, RunOptions, StreamAdapter, TurnRequest } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import type { QueuedMessage, TurnOutcome } from '../chat-queue-store.js';
import { fakeLiveProc, waitFor, type FakeLiveProc } from './fixtures.js';

interface Posted { v: number; payload: { type: string; [k: string]: unknown } }
function fakeChannel() {
  const posted: Posted[] = [];
  let onMsg: ((m: unknown) => void) | undefined;
  let onDisp: (() => void) | undefined;
  const channel: ChatPanelChannel = {
    setHtml: () => {},
    postMessage: (m) => { posted.push(m as Posted); },
    onMessage: (l) => { onMsg = l; },
    onDidDispose: (l) => { onDisp = l; },
    reveal: () => {},
    dispose: () => {},
  };
  return { channel, posted, send: (type: string, extra: Record<string, unknown> = {}) => onMsg?.({ v: 1, payload: { type, ...extra } }), close: () => onDisp?.() };
}
interface Run { readonly req: TurnRequest; readonly proc: FakeLiveProc; feed(ev: TurnEvent): void }
/** Each run spawns a fake CLI (a session-file one unless pipe) and yields what the test feeds it. */
function spawningAdapter(opts: { pipe?: boolean } = {}): { adapter: StreamAdapter; runs: Run[] } {
  const runs: Run[] = [];
  const adapter: StreamAdapter = {
    async *run(req: TurnRequest, o?: RunOptions): AsyncIterable<TurnEvent> {
      const n = runs.length + 1;
      const proc = fakeLiveProc(5000 + n) as FakeLiveProc & { cursor?: unknown };
      if (opts.pipe !== true) proc.cursor = { sessionId: o?.sessionId ?? '', turnId: `t${n}`, generation: 1, offset: 0 };
      const queue: TurnEvent[] = [];
      let wake: (() => void) | undefined;
      let ended = false;
      void proc.exit.then(() => { ended = true; wake?.(); });
      runs.push({ req, proc, feed: (ev) => { queue.push(ev); wake?.(); } });
      o?.onSpawn?.(proc as never);
      for (;;) {
        while (queue.length === 0 && !ended) await new Promise<void>((r) => (wake = r));
        const ev = queue.shift();
        if (ev === undefined) return;
        yield ev;
        if (ev.kind === 'done' || ev.kind === 'error') return;
      }
    },
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  return { adapter, runs };
}
function registry(adapter: StreamAdapter): ProviderRegistry {
  return { available: ['claude' as ProviderId], get: () => adapter };
}
function harness(opts: { pipe?: boolean } = {}) {
  const fc = fakeChannel();
  const { adapter, runs } = spawningAdapter(opts);
  const store = createInMemoryChatSessionStore();
  let panels = 0;
  const host = createChatPanelHost({
    createPanel: () => { panels += 1; return fc.channel; },
    providers: registry(adapter), store, cwd: () => '/repo', continuationWaitMs: 60,
  });
  return { fc, runs, store, host, panels: () => panels };
}
let seq = 0;
const message = (sessionId: string, text: string): QueuedMessage => {
  seq += 1;
  return { seq, key: `${sessionId}::q${seq}`, sessionId, turnId: `q${seq}`, windowKey: 'w', origin: 'typed', text, attachments: [], state: 'processing', attempts: 0, createdAt: 1, updatedAt: 1 };
};
const done = (turnId: string): TurnEvent => ({ kind: 'done', turnId, ok: true, sessionId: 'native-1' });
const types = (fc: { posted: Posted[] }): string[] => fc.posted.map((p) => p.payload.type);
const settle = <T>(p: Promise<T>, ms = 300): Promise<T | 'pending'> => Promise.race([p, new Promise<'pending'>((r) => setTimeout(() => r('pending'), ms))]);

test("chat host: the queued turn runner shows the message's chat (opening the panel when it is closed), resolves only after a grant re-run continuation ends, resolves stopped when a waiting card gets no answer within the wait, resolves detached-ended only after a detached CLI exits and stopped for a pipe turn, resolves stopped when the turn is dropped before it starts (a chat switch during the session-lease wait), and fails a message whose chat no longer exists", async () => {
  // THE PANEL IS CLOSED and another chat would be shown: it is opened on the message's chat.
  {
    const h = harness();
    const s1 = h.store.create('claude');
    s1.title = 'Queue work';
    h.store.save(s1);
    const spawned: unknown[] = [];
    const out = h.host.queueRunner.run(message(s1.id, 'hello from the queue'), (cli) => void spawned.push(cli));
    assert.equal(h.panels(), 1, 'the panel was opened');
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(h.runs.length, 0, 'nothing runs before the webview is ready');
    h.fc.send('ready');
    await waitFor(() => h.runs.length === 1);
    assert.equal(h.runs[0]!.req.prompt, 'hello from the queue');
    const restored = h.fc.posted.filter((p) => p.payload.type === 'session-restored').at(-1)!;
    assert.equal(restored.payload['sessionId'], s1.id, "the message's chat is shown");
    assert.ok(h.fc.posted.some((p) => p.payload.type === 'turn-event' && JSON.stringify(p.payload).includes('Running your queued message in \\"Queue work\\"')), 'with a note');
    const running = h.fc.posted.filter((p) => p.payload.type === 'turn-running');
    assert.deepEqual(running.map((p) => p.payload['sessionId']), [s1.id], 'the webview is told the turn is running');
    assert.ok(types(h.fc).indexOf('turn-running') < types(h.fc).lastIndexOf('user-row'), 'before the user row is echoed');
    assert.equal(spawned.length, 1, "the CLI is reported for the lease");
    assert.equal((spawned[0] as { pid: number }).pid, h.runs[0]!.proc.pid);
    h.runs[0]!.feed(done('t1'));
    assert.deepEqual(await out, { kind: 'done' });
    h.runs[0]!.proc.exitNow();
  }

  // A GRANT RE-RUN: the turn ends on a refused tool; the message ends only after the approved re-run.
  {
    const h = harness();
    h.host.open();
    h.fc.send('ready');
    const s = h.store.create('claude');
    h.store.save(s);
    const out = h.host.queueRunner.run(message(s.id, 'run the tests'), () => {});
    await waitFor(() => h.runs.length === 1);
    h.runs[0]!.feed({ kind: 'approval-request', turnId: 't1', requestId: 'perm-1', title: 'Permission: Bash', detail: 'Bash needs your permission', toolName: 'Bash', command: 'npm test', resolution: 'turn-ended' } as TurnEvent);
    h.runs[0]!.feed(done('t1'));
    h.runs[0]!.proc.exitNow();
    assert.equal(await settle(out, 40), 'pending', 'held while the card waits');
    h.fc.send('permission-decision', { requestId: 'perm-1', decision: 'approve' });
    await waitFor(() => h.runs.length === 2);
    assert.match(h.runs[1]!.req.prompt, /Approved — run exactly this now: npm test/);
    assert.ok((h.runs[1]!.req.allowedTools ?? []).length > 0, 'with the grant');
    assert.equal(await settle(out, 40), 'pending', 'held while the re-run runs');
    h.runs[1]!.feed(done('t2'));
    assert.deepEqual(await out, { kind: 'done' });
    h.runs[1]!.proc.exitNow();
  }

  // A WAITING CARD WITH NO ANSWER within the wait: stopped.
  {
    const h = harness();
    h.host.open();
    h.fc.send('ready');
    const s = h.store.create('claude');
    h.store.save(s);
    const out = h.host.queueRunner.run(message(s.id, 'do it'), () => {});
    await waitFor(() => h.runs.length === 1);
    h.runs[0]!.feed({ kind: 'approval-request', turnId: 't1', requestId: 'perm-2', title: 'Permission: Write', detail: 'Write needs your permission', toolName: 'Write', resolution: 'turn-ended' } as TurnEvent);
    h.runs[0]!.feed(done('t1'));
    h.runs[0]!.proc.exitNow();
    assert.deepEqual(await out, { kind: 'stopped', reason: 'no answer to the approval' });
  }

  // A DETACHED SESSION-FILE TURN: a chat switch leaves its CLI running; the message ends when it exits.
  {
    const h = harness();
    h.host.open();
    h.fc.send('ready');
    const s = h.store.create('claude');
    h.store.save(s);
    const other = h.store.create('claude');
    h.store.save(other);
    const out = h.host.queueRunner.run(message(s.id, 'long job'), () => {});
    await waitFor(() => h.runs.length === 1);
    h.runs[0]!.feed({ kind: 'assistant-delta', turnId: 't1', text: 'working' });
    await new Promise((r) => setTimeout(r, 20));
    h.fc.send('open-chat', { chatId: other.id });
    assert.equal(await settle(out, 60), 'pending', 'held while the detached CLI runs');
    h.runs[0]!.proc.exitNow();
    assert.deepEqual(await out, { kind: 'detached-ended' });
  }

  // A PIPE TURN (no session output): the chat switch stops it; the message ends stopped.
  {
    const h = harness({ pipe: true });
    h.host.open();
    h.fc.send('ready');
    const s = h.store.create('claude');
    h.store.save(s);
    const other = h.store.create('claude');
    h.store.save(other);
    const out = h.host.queueRunner.run(message(s.id, 'pipe job'), () => {});
    await waitFor(() => h.runs.length === 1);
    h.runs[0]!.feed({ kind: 'assistant-delta', turnId: 't1', text: 'working' });
    await new Promise((r) => setTimeout(r, 20));
    h.fc.send('open-chat', { chatId: other.id });
    const o = await out;
    assert.equal(o.kind, 'stopped');
    assert.ok(h.runs[0]!.proc.signals.length > 0 || h.runs[0]!.proc.exited(), 'the pipe turn was stopped');
  }

  // DROPPED BEFORE IT STARTS: the session's previous CLI still holds the lease; a chat switch during the wait.
  {
    const h = harness();
    h.host.open();
    h.fc.send('ready');
    const s = h.store.create('claude');
    h.store.save(s);
    const other = h.store.create('claude');
    h.store.save(other);
    const first = h.host.queueRunner.run(message(s.id, 'first'), () => {});
    await waitFor(() => h.runs.length === 1);
    h.runs[0]!.feed(done('t1')); // answered; its CLI keeps running and holds the session lease
    assert.deepEqual(await first, { kind: 'done' });
    const second = h.host.queueRunner.run(message(s.id, 'second'), () => {});
    await waitFor(() => types(h.fc).filter((t) => t === 'turn-running').length === 2);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(h.runs.length, 1, 'waiting for the lease');
    h.fc.send('open-chat', { chatId: other.id });
    const o: TurnOutcome = await second;
    assert.deepEqual(o, { kind: 'stopped', reason: 'the turn was dropped before it started' });
    assert.equal(h.runs.length, 1, 'it never spawned');
    h.runs[0]!.proc.exitNow();
  }

  // A MESSAGE WHOSE CHAT NO LONGER EXISTS: failed, nothing runs.
  {
    const h = harness();
    h.host.open();
    h.fc.send('ready');
    const o = await h.host.queueRunner.run(message('gone-session', 'hello'), () => {});
    assert.deepEqual(o, { kind: 'failed', error: 'the chat no longer exists', acted: false });
    assert.equal(h.runs.length, 0);
  }
});
