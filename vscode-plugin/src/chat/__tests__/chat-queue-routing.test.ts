// Epic E20261014613abdb3 Story S001 t5 — the chat's messages go through the repository's queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createChatPanelHost, type ChatPanelChannel } from '../chat-panel.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import type { ProviderId, ProviderRegistry, RunOptions, StreamAdapter, TurnRequest } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import { createChatQueueStore, type SqliteDatabase } from '../chat-queue-store.js';
import { createChatQueueWorker } from '../chat-queue-worker.js';
import { fakeLiveProc, waitFor, type FakeLiveProc } from './fixtures.js';

interface Posted { v: number; payload: { type: string; [k: string]: unknown } }
function fakeChannel() {
  const posted: Posted[] = [];
  let onMsg: ((m: unknown) => void) | undefined;
  const channel: ChatPanelChannel = {
    setHtml: () => {}, postMessage: (m) => { posted.push(m as Posted); }, onMessage: (l) => { onMsg = l; },
    onDidDispose: () => {}, reveal: () => {}, dispose: () => {},
  };
  return { channel, posted, send: (type: string, extra: Record<string, unknown> = {}) => onMsg?.({ v: 1, payload: { type, ...extra } }) };
}
interface Run { readonly req: TurnRequest; readonly proc: FakeLiveProc; feed(ev: TurnEvent): void }
function spawningAdapter(decisions: string[]): { adapter: StreamAdapter; runs: Run[] } {
  const runs: Run[] = [];
  const adapter: StreamAdapter = {
    async *run(req: TurnRequest, o?: RunOptions): AsyncIterable<TurnEvent> {
      const n = runs.length + 1;
      const proc = fakeLiveProc(7000 + n) as FakeLiveProc & { cursor?: unknown };
      proc.cursor = { sessionId: o?.sessionId ?? '', turnId: `t${n}`, generation: 1, offset: 0 };
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
    decide: (_turnId, requestId, decision) => void decisions.push(`${requestId}:${decision}`),
    capabilities: { resume: true },
  };
  return { adapter, runs };
}
function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-chat-routing-'));
  const qstore = createChatQueueStore({ path: join(dir, 'repo.sqlite'), openDatabase: (p) => new DatabaseSync(p) as unknown as SqliteDatabase, now: () => Date.now(), pluginVersion: 't' });
  const fc = fakeChannel();
  const decisions: string[] = [];
  const { adapter, runs } = spawningAdapter(decisions);
  const registry: ProviderRegistry = { available: ['claude' as ProviderId], get: () => adapter };
  const host = createChatPanelHost({
    createPanel: () => fc.channel, providers: registry, store: createInMemoryChatSessionStore(), cwd: () => '/repo',
    queue: (runner) => createChatQueueWorker({ store: qstore, claim: { windowKey: 'w-1', pid: process.pid }, runner, isAlive: () => false, now: () => Date.now() }),
  });
  host.open();
  fc.send('ready');
  const done = (): void => { host.dispose(); qstore.close(); rmSync(dir, { recursive: true, force: true }); };
  return { fc, runs, host, qstore, decisions, done };
}
const doneEv = (turnId: string): TurnEvent => ({ kind: 'done', turnId, ok: true, sessionId: 'native-1' });
const deltas = (fc: { posted: Posted[] }): string[] =>
  fc.posted.filter((p) => p.payload.type === 'turn-event' && (p.payload['event'] as TurnEvent).kind === 'assistant-delta').map((p) => (p.payload['event'] as { text: string }).text);

test("chat host: a message sent while a turn runs waits in the queue, the running turn keeps reporting, and the message runs when the turn ends; a typed message no longer denies the running turn's waiting approval", async () => {
  const h = harness();
  try {
    h.fc.send('submit-turn', { text: 'first' });
    await waitFor(() => h.runs.length === 1, 3000);
    assert.equal(h.runs[0]!.req.prompt, 'first');
    h.runs[0]!.feed({ kind: 'assistant-delta', turnId: 't1', text: 'working on first' });
    // The running turn raises a permission request it waits on (in-turn).
    h.runs[0]!.feed({ kind: 'approval-request', turnId: 't1', requestId: 'perm-in', title: 'Permission: Bash', detail: 'Bash needs your permission', toolName: 'Bash', command: 'ls', resolution: 'in-turn' } as TurnEvent);
    await waitFor(() => h.fc.posted.some((p) => p.payload.type === 'turn-event' && (p.payload['event'] as TurnEvent).kind === 'approval-request'), 3000);

    // A second message, mid-turn: queued; the running turn and its card are untouched.
    h.fc.send('submit-turn', { text: 'second' });
    await waitFor(() => h.qstore.list().length === 2, 3000);
    assert.deepEqual(h.qstore.list().map((m) => [m.text, m.state]), [['first', 'processing'], ['second', 'queued']]);
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(h.runs.length, 1, 'the second waits');
    assert.deepEqual(h.decisions, [], 'the waiting approval was not answered with a no');
    // The card is still answerable, and the running turn keeps reporting.
    h.fc.send('permission-decision', { requestId: 'perm-in', decision: 'approve' });
    assert.deepEqual(h.decisions, ['perm-in:approve']);
    h.runs[0]!.feed({ kind: 'assistant-delta', turnId: 't1', text: 'more of first' });
    await waitFor(() => deltas(h.fc).includes('more of first'), 3000);

    // The turn ends: the waiting message runs.
    h.runs[0]!.feed(doneEv('t1'));
    h.runs[0]!.proc.exitNow();
    await waitFor(() => h.runs.length === 2, 3000);
    assert.equal(h.runs[1]!.req.prompt, 'second');
    assert.deepEqual(h.qstore.list().map((m) => [m.text, m.state]), [['second', 'processing']], 'the first is done and gone');
    h.runs[1]!.feed(doneEv('t2'));
    h.runs[1]!.proc.exitNow();
    await waitFor(() => h.qstore.list().length === 0, 3000);

    // A message the queue refuses (full) is said in the chat, and nothing runs for it.
    for (let i = 0; i < 500; i++) assert.ok(h.qstore.enqueue({ key: `other::f${i}`, sessionId: 'other', turnId: `f${i}`, windowKey: 'w-other', origin: 'typed', text: `filler ${i}`, attachments: [] }).ok);
    h.fc.send('submit-turn', { text: 'one too many' });
    await waitFor(() => deltas(h.fc).some((t) => t.includes('The chat queue for this repository is full')), 3000);
    assert.ok(!h.qstore.list().some((m) => m.text === 'one too many'));
  } finally {
    h.done();
  }
});

test("chat host: a queued message that starts after the previous turn ended tells the webview it is running, so Stop is offered; Stop ends the running turn, its message becomes failed with 'stopped by the user' and a resend even though the stopped CLI reports a terminal error, and the next waiting message runs", async () => {
  const h = harness();
  try {
    h.fc.send('submit-turn', { text: 'one' });
    await waitFor(() => h.runs.length === 1, 3000);
    h.fc.send('submit-turn', { text: 'two' });
    h.fc.send('submit-turn', { text: 'three' });
    await waitFor(() => h.qstore.list().length === 3, 3000);
    const runningBefore = h.fc.posted.filter((p) => p.payload.type === 'turn-running').length;
    h.runs[0]!.feed(doneEv('t1'));
    h.runs[0]!.proc.exitNow();
    await waitFor(() => h.runs.length === 2, 3000);
    // 'two' started after 'one' ended: the webview is told it is running (so Stop is offered).
    const doneAt = h.fc.posted.findIndex((p) => p.payload.type === 'turn-event' && (p.payload['event'] as TurnEvent).kind === 'done');
    const runningAt = h.fc.posted.findIndex((p, i) => i > doneAt && p.payload.type === 'turn-running');
    assert.ok(runningAt > doneAt, "'turn-running' after the first turn's done");
    assert.equal(h.fc.posted.filter((p) => p.payload.type === 'turn-running').length, runningBefore + 1);

    // Stop during 'two': its CLI is stopped and ends with an error, yet the message is 'stopped by the user'.
    h.runs[1]!.feed({ kind: 'assistant-delta', turnId: 't2', text: 'two is working' });
    await waitFor(() => deltas(h.fc).includes('two is working'), 3000);
    h.fc.send('cancel-turn');
    await waitFor(() => h.qstore.list().find((m) => m.text === 'two')?.state === 'failed', 3000);
    const two = h.qstore.list().find((m) => m.text === 'two')!;
    assert.equal(two.error, 'stopped by the user');
    assert.ok(h.runs[1]!.proc.exited(), 'the CLI was stopped');
    // A resend is possible: the row is kept.
    assert.ok(h.qstore.resend(two.seq, 'again').ok);
    // The next waiting message runs.
    await waitFor(() => h.runs.length === 3, 3000);
    assert.equal(h.runs[2]!.req.prompt, 'three');
    h.runs[2]!.feed(doneEv('t3'));
    h.runs[2]!.proc.exitNow();
    await waitFor(() => h.runs.length === 4, 3000);
    assert.equal(h.runs[3]!.req.prompt, 'two', 'the resent message runs after');
    h.runs[3]!.feed(doneEv('t4'));
    h.runs[3]!.proc.exitNow();
    await waitFor(() => h.qstore.list().length === 0, 3000);
  } finally {
    h.done();
  }
});
