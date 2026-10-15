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
function harness(opts: { pipe?: boolean; logs?: string[] } = {}) {
  const fc = fakeChannel();
  const { adapter, runs } = spawningAdapter(opts);
  const store = createInMemoryChatSessionStore();
  let panels = 0;
  const host = createChatPanelHost({
    createPanel: () => { panels += 1; return fc.channel; },
    providers: registry(adapter), store, cwd: () => '/repo', continuationWaitMs: 60,
    ...(opts.logs !== undefined ? { logger: { warn: (m: string) => void opts.logs!.push(`warn: ${m}`), error: (m: string) => void opts.logs!.push(`error: ${m}`) } } : {}),
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

// Epic E20261014613abdb3 Story S004 t3 — a done with ok:false is a failed turn, not a finished one.
test('a queued turn that ends with done ok:false resolves failed with the text, not done', async () => {
  // The provider's text rides on the done event (claude and codex report an overload as an is_error result).
  {
    const h = harness();
    h.host.open();
    h.fc.send('ready');
    const s = h.store.create('claude');
    h.store.save(s);
    const out = h.host.queueRunner.run(message(s.id, 'do the thing'), () => {});
    await waitFor(() => h.runs.length === 1);
    h.runs[0]!.feed({ kind: 'done', turnId: 't1', ok: false, message: 'API Error: 529 overloaded' });
    const outcome = await out;
    assert.equal(outcome.kind, 'failed', 'recorded as failed, not done: this is the regression the change fixes');
    assert.equal((outcome as { error: string }).error, 'API Error: 529 overloaded');
    h.runs[0]!.proc.exitNow();
  }
  // A done ok:false with no text still fails, with the generic text.
  {
    const h = harness();
    h.host.open();
    h.fc.send('ready');
    const s = h.store.create('claude');
    h.store.save(s);
    const out = h.host.queueRunner.run(message(s.id, 'do the thing'), () => {});
    await waitFor(() => h.runs.length === 1);
    h.runs[0]!.feed({ kind: 'done', turnId: 't1', ok: false });
    const outcome = await out;
    assert.equal(outcome.kind, 'failed');
    assert.equal((outcome as { error: string }).error, 'the turn ended with an error');
    h.runs[0]!.proc.exitNow();
  }
  // A successful done is still done.
  {
    const h = harness();
    h.host.open();
    h.fc.send('ready');
    const s = h.store.create('claude');
    h.store.save(s);
    const out = h.host.queueRunner.run(message(s.id, 'finish fine'), () => {});
    await waitFor(() => h.runs.length === 1);
    h.runs[0]!.feed(done('t1'));
    assert.deepEqual(await out, { kind: 'done' });
    h.runs[0]!.proc.exitNow();
  }
});

// Epic E20261014613abdb3 Story S004 t4 — whether the agent acted, why the turn failed, and the log line.
const toolCall = (turnId: string): TurnEvent => ({ kind: 'tool-call', turnId, tool: 'Bash', command: 'npm test' });
const fileEdit = (turnId: string): TurnEvent => ({ kind: 'file-edit', turnId, path: '/repo/a.ts', diff: { path: '/repo/a.ts', hunks: [] } });
const toolResult = (turnId: string): TurnEvent => ({ kind: 'tool-result', turnId, output: 'ok' });
const errorEv = (turnId: string, message: string): TurnEvent => ({ kind: 'error', turnId, message });
/** Runs one queued message through a fresh host and returns its outcome after the given events were fed. */
async function runWith(events: TurnEvent[], logs?: string[]): Promise<TurnOutcome> {
  const h = harness(logs !== undefined ? { logs } : {});
  h.host.open();
  h.fc.send('ready');
  const s = h.store.create('claude');
  h.store.save(s);
  const out = h.host.queueRunner.run(message(s.id, 'do the thing'), () => {});
  await waitFor(() => h.runs.length === 1);
  for (const ev of events) h.runs[0]!.feed(ev);
  const outcome = await out;
  h.runs[0]!.proc.exitNow();
  return outcome;
}
const asFailed = (o: TurnOutcome): { error: string; acted: boolean; cause?: string } => {
  assert.equal(o.kind, 'failed');
  return o as never;
};

test('a turn that emitted a tool-call, file-edit or tool-result before its error reports acted true; one that failed with none reports acted false with the classified cause', async () => {
  const overload = 'API Error: 529 overloaded';
  for (const [name, first] of [['tool-call', toolCall('t1')], ['file-edit', fileEdit('t1')], ['tool-result', toolResult('t1')]] as const) {
    const f = asFailed(await runWith([first, errorEv('t1', overload)]));
    assert.equal(f.acted, true, `${name} before the error`);
    assert.equal(f.cause, 'overloaded', name);
    assert.equal(f.error, overload);
  }
  // Streamed text only: not acting.
  const text = asFailed(await runWith([{ kind: 'assistant-delta', turnId: 't1', text: 'partial answer' }, errorEv('t1', overload)]));
  assert.equal(text.acted, false);
  assert.equal(text.cause, 'overloaded');
  // Nothing before the error, other causes.
  assert.deepEqual(
    (({ acted, cause }) => ({ acted, cause }))(asFailed(await runWith([errorEv('t1', 'claude is not authenticated — run its login command, then retry')]))),
    { acted: false, cause: 'auth' },
  );
  assert.deepEqual(
    (({ acted, cause }) => ({ acted, cause }))(asFailed(await runWith([errorEv('t1', 'I cannot do that')]))),
    { acted: false, cause: 'other' },
  );
  assert.deepEqual(
    (({ acted, cause }) => ({ acted, cause }))(asFailed(await runWith([errorEv('t1', 'claude CLI not found — install it or check your PATH')]))),
    { acted: false, cause: 'other' },
  );
  // acted stays true across an approval re-run of the same queued message.
  {
    const h = harness();
    h.host.open();
    h.fc.send('ready');
    const s = h.store.create('claude');
    h.store.save(s);
    const out = h.host.queueRunner.run(message(s.id, 'run the tests'), () => {});
    await waitFor(() => h.runs.length === 1);
    h.runs[0]!.feed(toolCall('t1'));
    h.runs[0]!.feed({ kind: 'approval-request', turnId: 't1', requestId: 'perm-9', title: 'Permission: Bash', detail: 'Bash needs your permission', toolName: 'Bash', command: 'npm test', resolution: 'turn-ended' } as TurnEvent);
    h.runs[0]!.feed(done('t1'));
    h.runs[0]!.proc.exitNow();
    assert.equal(await settle(out, 40), 'pending', 'held while the card waits');
    h.fc.send('permission-decision', { requestId: 'perm-9', decision: 'approve' });
    await waitFor(() => h.runs.length === 2);
    h.runs[1]!.feed(errorEv('t2', overload)); // the re-run itself acts on nothing before it fails
    const f = asFailed(await out);
    assert.equal(f.acted, true, 'the first turn acted, so the message is never retried');
    assert.equal(f.cause, 'overloaded');
    h.runs[1]!.proc.exitNow();
  }
  // The chat no longer exists: acted false, no cause.
  {
    const h = harness();
    h.host.open();
    h.fc.send('ready');
    const f = asFailed(await h.host.queueRunner.run(message('gone-session', 'hello'), () => {}));
    assert.equal(f.acted, false);
    assert.equal(f.cause, undefined);
    assert.equal(f.error, 'the chat no longer exists');
  }
});

test('a claude is_error result with an overload text before any tool call is reported failed with the overload cause; the same after a file edit reports acted true', async () => {
  const text = 'API Error: 529 {"type":"overloaded_error","message":"Overloaded"}';
  const before = asFailed(await runWith([{ kind: 'done', turnId: 't1', ok: false, message: text }]));
  assert.equal(before.cause, 'overloaded');
  assert.equal(before.acted, false);
  assert.equal(before.error, text);
  const after = asFailed(await runWith([fileEdit('t1'), { kind: 'done', turnId: 't1', ok: false, message: text }]));
  assert.equal(after.cause, 'overloaded');
  assert.equal(after.acted, true, 'a failure after an edit is never retried');
});

test("every failed turn's cause and error text are logged", async () => {
  const logs: string[] = [];
  await runWith([toolCall('t1'), errorEv('t1', 'API Error: 503 Service Unavailable')], logs);
  await runWith([errorEv('t1', 'something nobody planned for')], logs);
  const lines = logs.filter((l) => l.includes('[chat-queue]') && l.includes('failed'));
  assert.equal(lines.length, 2, 'one line per failed turn');
  assert.match(lines[0]!, /cause overloaded, acted true.*API Error: 503 Service Unavailable/);
  assert.match(lines[1]!, /cause other, acted false.*something nobody planned for/);
  // A successful turn logs no failure line.
  const quiet: string[] = [];
  await runWith([done('t1')], quiet);
  assert.equal(quiet.filter((l) => l.includes('failed')).length, 0);
});

// ---- Story S004 t5: a retried message --------------------------------------------------------
const overloadText = 'API Error: 529 overloaded_error';
/** A chat that already holds the first attempt of a message: its user row and the text it streamed. */
function retriedHarness() {
  const h = harness();
  h.host.open();
  h.fc.send('ready');
  const s = h.store.create('claude');
  s.transcript.push({ role: 'user', text: 'do the thing', at: 1 }, { role: 'assistant', text: 'partial answer', at: 2 });
  h.store.save(s);
  const retried: QueuedMessage = { ...message(s.id, 'do the thing'), attempts: 1, error: overloadText };
  return { h, s, retried };
}
const userRows = (h: ReturnType<typeof harness>, id: string): number => h.store.get(id)!.transcript.filter((r) => r.role === 'user').length;

test('a retried message is started with skipUserRow, so the stored transcript has a single user row after a retry while the prompt is still sent to the CLI', async () => {
  const { h, s, retried } = retriedHarness();
  const out = h.host.queueRunner.run(retried, () => {});
  await waitFor(() => h.runs.length === 1);
  assert.equal(h.runs[0]!.req.prompt, 'do the thing', 'the prompt is still sent to the CLI');
  h.runs[0]!.feed(done('t1'));
  assert.deepEqual(await out, { kind: 'done' });
  h.runs[0]!.proc.exitNow();
  assert.equal(userRows(h, s.id), 1, 'one user row in the stored transcript');
  assert.equal(h.fc.posted.filter((p) => p.payload.type === 'user-row').length, 0, 'no echo of a second user row');
});

test('a retry stores and posts one retrying line, still in the stored transcript after a reload, and a turn that streamed only text before an infrastructure failure is retried and keeps its partial text', async () => {
  const { h, s, retried } = retriedHarness();
  const out = h.host.queueRunner.run(retried, () => {});
  await waitFor(() => h.runs.length === 1);
  h.runs[0]!.feed(done('t1'));
  await out;
  h.runs[0]!.proc.exitNow();
  const line = 'the turn failed with overloaded; retrying (attempt 1 of 3)';
  // The done that closes the line is marked informational, so the page does not read it as the end of the turn (ISSUE-160fa1bb).
  const infoDones = h.fc.posted.filter((p) => p.payload.type === 'turn-event' && (p.payload['event'] as { kind?: string; turnId?: string }).kind === 'done' && String((p.payload['event'] as { turnId?: string }).turnId).startsWith('queue-retry-'));
  assert.ok(infoDones.length >= 1 && infoDones.every((p) => p.payload['info'] === true), 'the retry line closes with a marked done');
  const rows = h.store.get(s.id)!.transcript;
  assert.equal(rows.filter((r) => r.role === 'assistant' && r.text === line).length, 1, 'one stored retrying line');
  assert.ok(rows.some((r) => r.role === 'assistant' && r.text === 'partial answer'), 'the partial text is kept');
  assert.equal(h.fc.posted.filter((p) => p.payload.type === 'turn-event' && JSON.stringify(p.payload).includes(line)).length, 1, 'posted once');
  h.fc.send('ready'); // a reload
  const restored = h.fc.posted.filter((p) => p.payload.type === 'session-restored').at(-1)!;
  assert.ok(JSON.stringify(restored.payload['transcript']).includes(line), 'present after a reload');
  // A text-only failed first attempt is retried by the queue's rule.
  const failed = asFailed(await runWith([{ kind: 'assistant-delta', turnId: 't1', text: 'partial' }, errorEv('t1', overloadText)]));
  assert.deepEqual({ acted: failed.acted, cause: failed.cause }, { acted: false, cause: 'overloaded' });
});

test('an auth failure stores and posts a sign-in line in the chat', async () => {
  const h = harness();
  h.host.open();
  h.fc.send('ready');
  const s = h.store.create('claude');
  h.store.save(s);
  const out = h.host.queueRunner.run(message(s.id, 'hello'), () => {});
  await waitFor(() => h.runs.length === 1);
  h.runs[0]!.feed(errorEv('t1', 'claude is not authenticated — run its login command, then retry'));
  assert.equal(asFailed(await out).cause, 'auth');
  h.runs[0]!.proc.exitNow();
  const sign = h.store.get(s.id)!.transcript.filter((r) => r.role === 'assistant' && /not signed in/.test(r.text));
  assert.equal(sign.length, 1, 'one stored sign-in line');
  assert.match(sign[0]!.text, /run `claude` in a terminal and sign in with \/login/);
  assert.ok(h.fc.posted.some((p) => p.payload.type === 'turn-event' && JSON.stringify(p.payload).includes('not signed in')), 'posted');
  h.fc.send('ready');
  const restored = h.fc.posted.filter((p) => p.payload.type === 'session-restored').at(-1)!;
  assert.ok(JSON.stringify(restored.payload['transcript']).includes('not signed in'), 'present after a reload');
});

test('a normal turn still pushes and echoes its user row exactly as before', async () => {
  const h = harness();
  h.host.open();
  h.fc.send('ready');
  const s = h.store.create('claude');
  h.store.save(s);
  const out = h.host.queueRunner.run(message(s.id, 'first words'), () => {});
  await waitFor(() => h.runs.length === 1);
  h.runs[0]!.feed(done('t1'));
  await out;
  h.runs[0]!.proc.exitNow();
  assert.equal(userRows(h, s.id), 1);
  const echoes = h.fc.posted.filter((p) => p.payload.type === 'user-row');
  assert.equal(echoes.length, 1, 'echoed once');
  assert.equal(echoes[0]!.payload['text'], 'first words');
  assert.equal(h.store.get(s.id)!.title, 'first words', 'the title is still derived');
  assert.equal(h.fc.posted.some((p) => JSON.stringify(p.payload).includes('retrying')), false, 'no retrying line on a first attempt');
});

test('the worker give-up note is shown live and is not stored in the transcript', async () => {
  const h = harness();
  h.host.open();
  h.fc.send('ready');
  const s = h.store.create('claude');
  h.store.save(s);
  const before = h.store.get(s.id)!.transcript.length;
  const out = h.host.queueRunner.run(message(s.id, 'x'), () => {});
  await waitFor(() => h.runs.length === 1);
  h.runs[0]!.feed(done('t1'));
  await out;
  h.runs[0]!.proc.exitNow();
  const afterTurn = h.store.get(s.id)!.transcript.length;
  h.host.queueRunner.note!(message(s.id, 'x'), 'the queue could not record the result');
  assert.equal(h.store.get(s.id)!.transcript.length, afterTurn, 'nothing stored');
  assert.ok(afterTurn > before);
  assert.ok(h.fc.posted.some((p) => p.payload.type === 'turn-event' && JSON.stringify(p.payload).includes('the queue could not record the result')), 'shown live');
});

// ISSUE-de069d56d76eaacd: a rebuilt page (a second 'ready', as when another tab covered the chat's tab) is told
// that a turn is running, so the progress widget and Stop come back.
const runningPosts = (h: ReturnType<typeof harness>): number => h.fc.posted.filter((p) => p.payload.type === 'turn-running').length;

test('a chat page rebuilt while a turn runs is told the turn is running, and one rebuilt when nothing runs is not', async () => {
  const h = harness();
  h.host.open();
  h.fc.send('ready');
  const s = h.store.create('claude');
  h.store.save(s);
  const out = h.host.queueRunner.run(message(s.id, 'a long answer'), () => {});
  await waitFor(() => h.runs.length === 1);
  assert.equal(runningPosts(h), 1, 'told once, when the message started');

  // The page is discarded and rebuilt while the turn runs: it posts 'ready' again.
  h.fc.send('ready');
  const after = h.fc.posted.slice(h.fc.posted.map((p) => p.payload.type).lastIndexOf('session-restored'));
  assert.ok(after.some((p) => p.payload.type === 'turn-running' && p.payload['sessionId'] === s.id), 'the rebuilt page is told the turn is running, after its session-restored');
  assert.equal(runningPosts(h), 2);

  // The turn ends; a page rebuilt now is idle.
  h.runs[0]!.feed(done('t1'));
  assert.deepEqual(await out, { kind: 'done' });
  h.runs[0]!.proc.exitNow();
  await settle(out, 20);
  h.fc.send('ready');
  assert.equal(runningPosts(h), 2, 'nothing is running, so nothing is told');
});
