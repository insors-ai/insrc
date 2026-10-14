// Epic E20261014613abdb3 Story S002 t4 — the chat host posts the outbox and handles its actions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createChatPanelHost, type ChatPanelChannel } from '../chat-panel.js';
import { createInMemoryChatSessionStore, type ChatSessionStore } from '../session-store.js';
import type { ProviderId, ProviderRegistry, RunOptions, StreamAdapter, TurnRequest } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import { createChatQueueStore, type ChatQueueLeases, type ChatQueueStore, type SqliteDatabase } from '../chat-queue-store.js';
import { ACTION_NOTES, createChatQueueWorker } from '../chat-queue-worker.js';
import type { OutboxView } from '../chat-outbox.js';
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
type QStore = ChatQueueStore & ChatQueueLeases;
/** A queue file in a temp dir; hosts are added over it, each one window. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-chat-outbox-'));
  const path = join(dir, 'repo.sqlite');
  const stores: QStore[] = [];
  const open = (): QStore => {
    const s = createChatQueueStore({ path, openDatabase: (p) => new DatabaseSync(p) as unknown as SqliteDatabase, now: () => Date.now(), pluginVersion: 't' });
    stores.push(s);
    return s;
  };
  const qstore = open();
  const sessions = createInMemoryChatSessionStore();
  const hosts: Array<{ dispose(): void }> = [];
  function host(windowKey: string, store: ChatSessionStore = sessions) {
    const fc = fakeChannel();
    const decisions: string[] = [];
    const { adapter, runs } = spawningAdapter(decisions);
    const registry: ProviderRegistry = { available: ['claude' as ProviderId], get: () => adapter };
    const own = open();
    const h = createChatPanelHost({
      createPanel: () => fc.channel, providers: registry, store, cwd: () => '/repo',
      queue: (runner) => createChatQueueWorker({ store: own, claim: { windowKey, pid: process.pid }, runner, isAlive: () => false, now: () => Date.now() }),
    });
    hosts.push(h);
    h.open();
    fc.send('ready');
    const shown = (): string => {
      const r = [...fc.posted].reverse().find((p) => p.payload.type === 'session-restored');
      return String(r?.payload['sessionId']);
    };
    const outbox = (): OutboxView | undefined => [...fc.posted].reverse().find((p) => p.payload.type === 'outbox')?.payload['view'] as OutboxView | undefined;
    return { fc, runs, decisions, host: h, shown, outbox };
  }
  const done = (): void => {
    for (const h of hosts) h.dispose();
    for (const s of stores) s.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { qstore, sessions, host, done };
}
const doneEv = (turnId: string): TurnEvent => ({ kind: 'done', turnId, ok: true, sessionId: 'native-1' });
const rowsOf = (v: OutboxView | undefined): Array<[string, number | undefined, string]> => (v?.rows ?? []).map((r) => [r.text, r.position, r.state]);
/** Another chat's message, from a window that is not running here (it never runs in these tests). */
const elsewhere = (q: QStore, text: string, sessionId = 'other-chat') =>
  q.enqueue({ key: `${sessionId}::${text}`, sessionId, turnId: text, windowKey: 'w-elsewhere', origin: 'typed', text, attachments: [] });

test('chat host outbox: two messages sent while a turn runs are posted in the outbox with their places, and another chat\'s earlier message is counted ahead', async () => {
  const r = repo();
  try {
    const a = r.host('w-1');
    a.fc.send('submit-turn', { text: 'first' });
    await waitFor(() => a.runs.length === 1, 3000);
    assert.ok(elsewhere(r.qstore, 'theirs').ok);
    a.fc.send('submit-turn', { text: 'second' });
    a.fc.send('submit-turn', { text: 'third' });
    await waitFor(() => rowsOf(a.outbox()).length === 2, 3000);
    assert.deepEqual(rowsOf(a.outbox()), [['second', 2, 'queued'], ['third', 3, 'queued']]);
    assert.equal(a.outbox()?.aheadFromOtherChats, 1);
    assert.equal(a.outbox()?.sessionId, a.shown());
    assert.equal(a.outbox()?.runningChat, undefined, 'the running message is this chat\'s own, in its transcript');

    // Shown another chat, with no change to the queue: the outbox follows the switch at once, and
    // names the first chat as running in this window.
    a.fc.send('new-chat', { provider: 'claude' });
    assert.equal(a.outbox()?.sessionId, a.shown(), 'posted with the switch');
    assert.deepEqual(rowsOf(a.outbox()), []);
    assert.equal(a.outbox()?.runningChat?.here, true, 'the running message is this window\'s');
    assert.equal(a.outbox()?.aheadFromOtherChats, 3, 'everything waiting runs before a chat with nothing waiting');

    // Without the queue, nothing about an outbox is posted.
    const fc = fakeChannel();
    const { adapter } = spawningAdapter([]);
    const plain = createChatPanelHost({ createPanel: () => fc.channel, providers: { available: ['claude' as ProviderId], get: () => adapter }, store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
    try {
      plain.open();
      fc.send('ready');
      fc.send('open-chat', { chatId: 'none' });
      assert.ok(fc.posted.length > 0);
      assert.ok(!fc.posted.some((p) => p.payload.type === 'outbox'));
    } finally {
      plain.dispose();
    }
  } finally {
    r.done();
  }
});

test('chat host outbox: cancelling a waiting message removes it from the queue and the outbox, and it never runs', async () => {
  const r = repo();
  try {
    const a = r.host('w-1');
    a.fc.send('submit-turn', { text: 'first' });
    await waitFor(() => a.runs.length === 1, 3000);
    a.fc.send('submit-turn', { text: 'take me back' });
    await waitFor(() => rowsOf(a.outbox()).length === 1, 3000);
    const seq = a.outbox()!.rows[0]!.seq;
    a.fc.send('outbox-cancel', { seq });
    await waitFor(() => rowsOf(a.outbox()).length === 0, 3000);
    assert.ok(!r.qstore.list().some((m) => m.text === 'take me back'));
    a.runs[0]!.feed(doneEv('t1'));
    a.runs[0]!.proc.exitNow();
    await waitFor(() => r.qstore.list().length === 0, 3000);
    await new Promise((res) => setTimeout(res, 700));
    assert.equal(a.runs.length, 1, 'the cancelled message never ran');
  } finally {
    r.done();
  }
});

test("chat host outbox: resending a failed message queues the same text and attachments at the back under this window's key, and it runs", async () => {
  const r = repo();
  try {
    const a = r.host('w-1');
    const sid = a.shown();
    // A message of this chat that failed in a window now closed.
    const ref = { id: 'a1', name: 'shot.png', kind: 'image' as const, size: 10, path: '/att/x/a1.png' };
    const lost = r.qstore.enqueue({ key: `${sid}::old`, sessionId: sid, turnId: 'old', windowKey: 'w-closed', origin: 'typed', text: 'again please', attachments: [ref] });
    assert.ok(lost.ok);
    assert.equal(r.qstore.acknowledge(lost.message.seq, { windowKey: 'w-closed', pid: 1 }), true);
    r.qstore.finish(lost.message.seq, { kind: 'not-delivered', reason: 'window-closed' });
    await waitFor(() => rowsOf(a.outbox()).length === 1, 3000);
    assert.deepEqual(rowsOf(a.outbox()), [['again please', undefined, 'not-delivered']]);
    assert.equal(a.outbox()!.rows[0]!.attachments, 1);

    a.fc.send('outbox-resend', { seq: lost.message.seq });
    await waitFor(() => a.runs.length === 1, 3000);
    const row = r.qstore.list().find((m) => m.text === 'again please');
    assert.equal(row?.windowKey, 'w-1', "this window's key");
    assert.deepEqual(row?.attachments, [ref]);
    assert.ok(row!.seq > lost.message.seq, 'at the back');
    assert.match(a.runs[0]!.req.prompt, /again please[\s\S]*\/att\/x\/a1\.png/, 'it ran with its attachment');
  } finally {
    r.done();
  }
});

test('chat host outbox: a refused action is re-posted with its note, a seq of another chat is ignored, and a taken message leaves the outbox', async () => {
  const r = repo();
  try {
    const a = r.host('w-1');
    a.fc.send('submit-turn', { text: 'first' });
    await waitFor(() => a.runs.length === 1, 3000);
    a.fc.send('submit-turn', { text: 'second' });
    await waitFor(() => rowsOf(a.outbox()).length === 1, 3000);
    const second = a.outbox()!.rows[0]!.seq;

    // Taken: the first ends, the second runs and leaves the outbox.
    a.runs[0]!.feed(doneEv('t1'));
    a.runs[0]!.proc.exitNow();
    await waitFor(() => a.runs.length === 2, 3000);
    await waitFor(() => rowsOf(a.outbox()).length === 0, 3000);

    // Refused: it has started, so the outbox says so.
    a.fc.send('outbox-cancel', { seq: second });
    await waitFor(() => a.outbox()?.note === ACTION_NOTES.started, 3000);
    assert.ok(r.qstore.list().some((m) => m.seq === second && m.state === 'processing'));

    // Another chat's row is not this outbox's to change.
    const theirs = elsewhere(r.qstore, 'not yours');
    assert.ok(theirs.ok);
    await waitFor(() => (a.outbox()?.aheadFromOtherChats ?? 0) === 1, 3000);
    a.fc.send('outbox-cancel', { seq: theirs.message.seq });
    await new Promise((res) => setTimeout(res, 100));
    assert.ok(r.qstore.list().some((m) => m.seq === theirs.message.seq), 'still queued');
  } finally {
    r.done();
  }
});

test('chat host outbox: after the host is rebuilt over the same queue file and its webview is ready, the outbox shows the same messages in the same places', async () => {
  const r = repo();
  try {
    const a = r.host('w-1');
    const sid = a.shown();
    a.fc.send('submit-turn', { text: 'first' });
    await waitFor(() => a.runs.length === 1, 3000);
    // Another chat waits ahead, so this window's messages stay in place across the rebuild.
    assert.ok(elsewhere(r.qstore, 'theirs').ok);
    a.fc.send('submit-turn', { text: 'second' });
    a.fc.send('submit-turn', { text: 'third' });
    await waitFor(() => rowsOf(a.outbox()).length === 2, 3000);
    // The window goes away mid-turn: its running message is left failed.
    a.host.dispose();
    await waitFor(() => r.qstore.list().some((m) => m.text === 'first' && m.state === 'failed'), 3000);
    const before = r.qstore.list().map((m) => [m.text, m.state]);

    const b = r.host('w-1'); // the reloaded window: same window key, same chats
    b.fc.send('open-chat', { chatId: sid });
    await waitFor(() => b.outbox()?.sessionId === sid && rowsOf(b.outbox()).length === 3, 3000);
    assert.deepEqual(rowsOf(b.outbox()), [['first', undefined, 'failed'], ['second', 2, 'queued'], ['third', 3, 'queued']]);
    assert.equal(b.outbox()?.aheadFromOtherChats, 1);
    assert.deepEqual(r.qstore.list().map((m) => [m.text, m.state]), before, 'nothing moved');
  } finally {
    r.done();
  }
});
