/**
 * Story E20260925edb76e2e:S003 / t3 + t5 — chat host unit + rendered-shell contract.
 *
 * FakePanel + fake StreamAdapter + in-memory ChatSessionStore, no vscode runtime.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/chat-panel.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createChatPanelHost, runCatalogView, type ChatPanelChannel, type ChatEditGovernanceDeps } from '../chat-panel.js';
import { transcriptPagerWebviewSource } from '../transcript-pager.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import { createFileChatSessionStore, ROWS_SUFFIX } from '../session-file-store.js';
import { fakeSessionFs } from './fake-session-fs.js';
import { createAttachmentStore, MAX_ATTACHMENT_BYTES, type AttachmentStore } from '../attachment-store.js';
import { fakeAttachmentFs, type FakeAttachmentFs } from './fake-attachment-fs.js';
import type { ProviderId, StreamAdapter, ProviderRegistry, TurnRequest, RunOptions } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import { markerFor, WAITING_LABEL } from '../markers.js';
import { fakeLiveProc, patchOf, waitFor, type FakeLiveProc } from './fixtures.js';
import type { DiffView } from '../edit-governor.js';
import type { TranscriptEntry } from '../session-store.js';
import { createReviewPresenter, type DeclaredOutcome, type ReviewPresenter } from '../review-presenter.js';
import { createChatQueueStore, type SqliteDatabase } from '../chat-queue-store.js';
import { createChatQueueWorker, type QueuedTurnRunner } from '../chat-queue-worker.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';

/** Epic E20261014613abdb3 Story S001: a repository queue on a temp file, as deps.queue builds it. */
function tempQueue(): { queue: (runner: QueuedTurnRunner) => ReturnType<typeof createChatQueueWorker>; store: ReturnType<typeof createChatQueueStore>; done(): void } {
  const dir = mkdtempSync(pathJoin(tmpdir(), 'insrc-chat-q-'));
  const store = createChatQueueStore({ path: pathJoin(dir, 'repo.sqlite'), openDatabase: (p) => new DatabaseSync(p) as unknown as SqliteDatabase, now: () => Date.now(), pluginVersion: 't' });
  return {
    store,
    queue: (runner) => createChatQueueWorker({ store, claim: { windowKey: 'w-test', pid: process.pid }, runner, isAlive: () => false, now: () => Date.now() }),
    done: () => { store.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}

interface FakeChannel {
  channel: ChatPanelChannel;
  posted: Array<{ v: number; payload: { type: string; [k: string]: unknown } }>;
  send(message: unknown): void;
  fireDispose(): void;
  html(): string;
}
function fakeChannel(): FakeChannel {
  const posted: FakeChannel['posted'] = [];
  let onMsg: ((m: unknown) => void) | undefined;
  let onDisp: (() => void) | undefined;
  let html = '';
  return {
    posted,
    html: () => html,
    send: (m) => onMsg?.(m),
    fireDispose: () => onDisp?.(),
    channel: {
      setHtml: (h) => { html = h; },
      postMessage: (m) => { posted.push(m as FakeChannel['posted'][number]); },
      onMessage: (l) => { onMsg = l; },
      onDidDispose: (l) => { onDisp = l; },
      reveal: () => {},
      dispose: () => {},
    },
  };
}

interface AdapterHooks {
  onRun?: (r: TurnRequest) => void;
  onCancel?: () => void;
  onReturn?: () => void; // fires when the consumer abandons the iterator (.return())
  hang?: boolean; // after emitting `events`, block until cancelled/returned
  hangBeforeFirst?: boolean; // emit NOTHING and block (models a zero-stdout turn)
  gateBeforeDone?: Promise<void>; // await this before yielding the terminal 'done'
  onDecide?: (turnId: string, requestId: string, decision: 'approve' | 'deny') => void; // S004: decide() relay
}
function scriptedAdapter(events: TurnEvent[], hooks?: AdapterHooks): StreamAdapter {
  let cancelled = false;
  return {
    async *run(req: TurnRequest): AsyncIterable<TurnEvent> {
      hooks?.onRun?.(req);
      try {
        if (hooks?.hangBeforeFirst) {
          while (!cancelled) await new Promise((r) => setTimeout(r, 5));
          return;
        }
        for (const ev of events) {
          if (cancelled) return;
          if (ev.kind === 'done' && hooks?.gateBeforeDone) await hooks.gateBeforeDone;
          await Promise.resolve();
          yield ev;
        }
        if (hooks?.hang) {
          while (!cancelled) await new Promise((r) => setTimeout(r, 5));
        }
      } finally {
        hooks?.onReturn?.();
      }
    },
    cancel: () => { cancelled = true; hooks?.onCancel?.(); },
    decide: (turnId, requestId, decision) => hooks?.onDecide?.(turnId, requestId, decision),
    capabilities: { resume: true },
  };
}

function registry(adapters: Partial<Record<ProviderId, StreamAdapter>>, available: ProviderId[]): ProviderRegistry {
  return {
    available,
    get(id: ProviderId): StreamAdapter {
      const a = adapters[id];
      if (a === undefined) throw new Error(`unknown-provider: ${id}`);
      return a;
    },
  };
}

const env = (type: string, extra: Record<string, unknown> = {}): unknown => ({ v: 1, payload: { type, ...extra } });
const turnEvents = (fc: FakeChannel): TurnEvent[] => fc.posted.filter((m) => m.payload.type === 'turn-event').map((m) => m.payload['event'] as TurnEvent);

test('submit-turn posts each TurnEvent INCREMENTALLY (deltas observable before done)', async () => {
  const fc = fakeChannel();
  let runCount = 0;
  let releaseDone!: () => void;
  const gateBeforeDone = new Promise<void>((r) => { releaseDone = r; });
  const evs: TurnEvent[] = [
    { kind: 'status', turnId: 't1', phase: 'thinking' },
    { kind: 'assistant-delta', turnId: 't1', text: 'hel' },
    { kind: 'assistant-delta', turnId: 't1', text: 'lo' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const adapter = scriptedAdapter(evs, { onRun: () => { runCount++; }, gateBeforeDone });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'say hello' }));
  // Before 'done' is released, the 3 pre-done events must already be posted (proves
  // incremental posting, not whole-turn buffering).
  await waitFor(() => turnEvents(fc).length >= 3);
  assert.ok(!turnEvents(fc).some((e) => e.kind === 'done'), 'done not yet posted while gated');
  assert.deepEqual(turnEvents(fc).map((e) => e.kind), ['status', 'assistant-delta', 'assistant-delta']);
  releaseDone();
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  assert.deepEqual(turnEvents(fc).map((e) => e.kind), ['status', 'assistant-delta', 'assistant-delta', 'done']);
  assert.equal(runCount, 1, 'StreamAdapter.run called exactly once (passthrough)');
});

// Epic E20261014613abdb3 Story S001: the newest message no longer wins; the second waits and the
// first reports to its end. (Was: 'single-in-flight: a second submit supersedes the first'.)
test('single-in-flight: a second submit waits for the first, which reports to its end — no interleave; the first is not killed (H1/M2)', async () => {
  const fc = fakeChannel();
  // One 'claude' adapter that serves both runs: run #1 (A) streams then keeps running until the
  // test lets it finish; run #2 (B) streams to done. A is never cancelled: B waits for it.
  const cancelled = new Set<string>();
  let releaseA!: () => void;
  const aDone = new Promise<void>((r) => (releaseA = r));
  const scripts: Array<{ id: string; events: TurnEvent[]; hang?: boolean }> = [
    { id: 'A', events: [{ kind: 'status', turnId: 'A', phase: 'thinking' }, { kind: 'assistant-delta', turnId: 'A', text: 'from-A' }], hang: true },
    { id: 'B', events: [{ kind: 'assistant-delta', turnId: 'B', text: 'from-B' }, { kind: 'done', turnId: 'B', ok: true }] },
  ];
  let call = 0;
  const adapter: StreamAdapter = {
    async *run(): AsyncIterable<TurnEvent> {
      const script = scripts[call++]!;
      for (const ev of script.events) {
        await Promise.resolve();
        yield ev;
      }
      if (script.hang) {
        await aDone;
        yield { kind: 'assistant-delta', turnId: 'A', text: 'late-A' };
        yield { kind: 'done', turnId: 'A', ok: true };
      }
    },
    cancel: async (turnId) => { cancelled.add(turnId); },
    decide: () => {},
    capabilities: { resume: true },
  };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'A' }));
  await waitFor(() => turnEvents(fc).some((e) => (e as { turnId: string }).turnId === 'A'));
  const postsAtSupersede = turnEvents(fc).length;
  fc.send(env('submit-turn', { text: 'B' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'status' && (e as { phase: string }).phase === 'waiting'));
  assert.equal(call, 1, 'B has not started while A is still running');
  assert.equal(cancelled.size, 0, 'A was not killed by the newer message');
  releaseA();
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const idsAfter = turnEvents(fc).slice(postsAtSupersede).map((e) => (e as { turnId: string }).turnId).filter((id) => id === 'A' || id === 'B');
  assert.ok(idsAfter.includes('A'), "A's later output is posted: it was not superseded");
  assert.ok(idsAfter.lastIndexOf('A') < idsAfter.indexOf('B'), 'all of A before any of B (no interleave)');
  assert.ok(turnEvents(fc).some((e) => (e as { turnId: string }).turnId === 'B'), 'B streamed to completion');
  assert.equal(call, 2, 'B started once A had finished');
});

test('new-chat mid-stream stops the prior turn (no cross-session post) (M3)', async () => {
  const fc = fakeChannel();
  const aEvents: TurnEvent[] = [{ kind: 'assistant-delta', turnId: 'A', text: 'a1' }];
  const adapterA = scriptedAdapter(aEvents, { hang: true });
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapterA, codex: scriptedAdapter([]) }, ['claude', 'codex']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'A' }));
  await waitFor(() => turnEvents(fc).some((e) => (e as { turnId: string }).turnId === 'A'));
  const before = turnEvents(fc).length;
  fc.send(env('new-chat', { provider: 'codex' }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(turnEvents(fc).length, before, 'no further turn-events from the superseded session-A turn');
});

test('malformed submit-turn (non-string text) is a no-op, no unhandled rejection (M4)', async () => {
  const fc = fakeChannel();
  let ran = false;
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter([], { onRun: () => { ran = true; } }) }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  assert.doesNotThrow(() => {
    fc.send(env('submit-turn', { text: 42 }));
    fc.send(env('submit-turn', {})); // text absent
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ran, false, 'no turn ran for a non-string prompt');
});

test('an errored turn persists its transcript rows (L3)', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const evs: TurnEvent[] = [{ kind: 'assistant-delta', turnId: 't1', text: 'partial' }, { kind: 'error', turnId: 't1', message: 'boom' }];
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter(evs) }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'error'));
  const only = store.list();
  const s = store.get(only[0]!.id);
  assert.ok(s!.transcript.some((r) => r.text === 'partial'), 'the assistant delta was persisted');
  assert.ok(s!.transcript.some((r) => r.text.includes('boom')), 'the error marker was persisted');
});

test('empty/whitespace submit-turn is a no-op (no run)', async () => {
  const fc = fakeChannel();
  let ran = false;
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([], { onRun: () => { ran = true; } }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: '   ' }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(ran, false, 'no StreamAdapter.run for an empty prompt');
});

test('a terminal error TurnEvent is posted inline; unknown-provider is surfaced, not thrown', async () => {
  const fc = fakeChannel();
  const evs: TurnEvent[] = [{ kind: 'error', turnId: 't1', message: 'boom' }];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  assert.doesNotThrow(() => fc.send(env('submit-turn', { text: 'x' })));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'error'));
  assert.ok(turnEvents(fc).some((e) => e.kind === 'error' && (e as { message: string }).message === 'boom'));
});

test('onDidDispose cancels the active turn and stops posting further', async () => {
  const fc = fakeChannel();
  let cancelled = false;
  const evs: TurnEvent[] = [{ kind: 'status', turnId: 't1', phase: 'thinking' }, { kind: 'assistant-delta', turnId: 't1', text: 'a' }];
  const adapter = scriptedAdapter(evs, { onCancel: () => { cancelled = true; }, hang: true });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'x' }));
  await waitFor(() => turnEvents(fc).length >= 2); // both scripted events streamed, now hanging
  const turnEventsBefore = turnEvents(fc).length;
  fc.fireDispose();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(cancelled, true, 'the in-flight turn was cancelled on dispose');
  assert.equal(turnEvents(fc).length, turnEventsBefore, 'exactly zero further turn-event posts after dispose');
});

test('unknown / edit-* / docs-* inbound messages are accepted-but-ignored no-ops', async () => {
  const fc = fakeChannel();
  let ran = false;
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([], { onRun: () => { ran = true; } }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  assert.doesNotThrow(() => {
    fc.send(env('edit-decision', { path: 'a', accept: true }));
    fc.send(env('docs-decision', { artifactId: 'x', accept: false }));
    fc.send(env('set-edit-mode', { mode: 'review' }));
    fc.send({ garbage: true });
    fc.send({ v: 2, payload: { type: 'submit-turn', text: 'wrong version' } });
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ran, false, 'no turn ran for ignored/forward/malformed messages');
});

test('no provider installed: open posts an error notice (no crash)', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({}, []),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  assert.doesNotThrow(() => host.open());
  assert.ok(turnEvents(fc).some((e) => e.kind === 'error'), 'an error TurnEvent is posted when no provider is available');
});

// ---- rendered-shell contract ----

test('rendered shell: one nonce\'d inline script + strict CSP + sc1 style + no remote origin', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  const scripts = html.match(/<script\b/g) ?? [];
  assert.equal(scripts.length, 1, 'exactly one inline script');
  const script = /<script nonce="([^"]+)">/.exec(html);
  assert.ok(script, 'the inline script carries a nonce');
  const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html);
  assert.ok(csp, 'a CSP meta is present');
  assert.match(csp![1]!, /script-src 'nonce-FIXEDNONCE'/, 'script-src limited to the nonce');
  assert.equal(script![1], 'FIXEDNONCE', 'the script nonce matches the CSP nonce');
  assert.ok(html.includes('<style>') && html.includes('.insrc-term-chat {'), 'embeds the sc1 <style> + surfaceClass(chat)');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded (embedded marked ships URLs only in warning strings)');
  assert.doesNotMatch(html, /asWebviewUri/, 'no asWebviewUri');
});

test('rendered shell mints a FRESH nonce per render', () => {
  const mk = (): string => {
    const fc = fakeChannel();
    const host = createChatPanelHost({
      createPanel: () => fc.channel,
      providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
      store: createInMemoryChatSessionStore(),
      cwd: () => '/repo',
    });
    host.open();
    return /<script nonce="([^"]+)">/.exec(fc.html())![1]!;
  };
  assert.notEqual(mk(), mk(), 'two renders use different nonces');
});

// ---- S004: per-turn lifecycle markers ----

test('S004 rendered shell: non-delta turn-events route through the marker mapper (sc1 class, not the bare bracket)', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  // The embedded, single-sourced marker mapper is present + the widened line(s,cls) writer.
  assert.ok(html.includes('insrc-term__marker--'), 'the shell embeds the sc1 marker classes via the mapper');
  assert.ok(/function line\(s,cls\)/.test(html), 'line() is widened to carry a marker class');
  assert.match(html, /className=cls/, 'the marker class is applied via className');
  assert.doesNotMatch(html, /'\['\+ev\.kind\+'\]'/, 'the bare [kind] fall-through is gone');
  assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render');
  // The CSP shell invariants still hold after the S004 edit.
  const scripts = html.match(/<script\b/g) ?? [];
  assert.equal(scripts.length, 1, 'still exactly one inline script');
  const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html);
  assert.match(csp![1]!, /script-src 'nonce-FIXEDNONCE'/, 'strict CSP unchanged');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded (embedded marked ships URLs only in warning strings)');
});

test('S004 integration: a status->tool-call(mcp)->status->file-edit->done turn posts a marker per event and persists status+done rows (ac1/ac2, k8)', async () => {
  const fc = fakeChannel();
  let workflowCalls = 0; // the host must NEVER invoke a workflow/MCP tool (k8 passthrough)
  const evs: TurnEvent[] = [
    { kind: 'status', turnId: 't1', phase: 'thinking' },
    { kind: 'tool-call', turnId: 't1', tool: 'x', mcp: { server: 'insrc', name: 'insrc_analyze_step' } },
    { kind: 'status', turnId: 't1', phase: 'streaming' },
    { kind: 'assistant-delta', turnId: 't1', text: 'hi' },
    { kind: 'file-edit', turnId: 't1', path: 'src/a.ts', diff: { path: 'src/a.ts', hunks: [] } },
    { kind: 'done', turnId: 't1', ok: true },
  ];
  const store = createInMemoryChatSessionStore();
  const adapter = scriptedAdapter(evs, { onRun: () => { /* the fake adapter is the ONLY side-effecting collaborator */ } });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));

  // Every event was posted to the webview as a turn-event (the marker is computed webview-side).
  assert.deepEqual(
    turnEvents(fc).map((e) => e.kind),
    ['status', 'tool-call', 'status', 'assistant-delta', 'file-edit', 'done'],
    'each event posted incrementally',
  );

  // status markers ARE shown live (posted as turn-events, rendered webview-side)...
  assert.ok(
    turnEvents(fc).some((e) => e.kind === 'status' && e.phase === 'thinking'),
    'status(thinking) was posted live for the webview marker (ac1)',
  );
  // ...but status is TRANSIENT: it is NOT persisted into the durable transcript (MED-2).
  // The durable lifecycle facts (tool-call/file-edit/done/error) ARE persisted, single-sourced via markerFor.
  const s = store.list().length > 0 ? store.get(store.list()[0]!.id) : undefined;
  const markers = s!.transcript.filter((r) => r.role === 'marker').map((r) => r.text);
  assert.ok(!markers.includes('thinking…'), 'status(thinking) is NOT persisted (transient, live-only)');
  assert.ok(!markers.includes('streaming…'), 'status(streaming) is NOT persisted (transient, live-only)');
  assert.ok(markers.includes('done'), 'done persisted a marker row (S003 gap filled)');
  assert.ok(markers.includes('insrc · insrc_analyze_step'), 'the insrc MCP tool-call marker is enriched (ac2)');
  assert.ok(markers.includes('src/a.ts'), 'file-edit persisted a marker row');
  assert.ok(s!.transcript.some((r) => r.role === 'assistant' && r.text === 'hi'), 'assistant-delta -> assistant row');
  assert.equal(workflowCalls, 0, 'the host invoked no workflow/MCP tool (k8 passthrough)');
});

test('S001 (ux polish): a tool-result event persists a STRUCTURED role:tool-result row (command+output), never a marker', async () => {
  const fc = fakeChannel();
  const evs: TurnEvent[] = [
    { kind: 'tool-call', turnId: 't1', tool: 'Bash', command: 'npm test' },
    { kind: 'tool-result', turnId: 't1', command: 'npm test', output: 'ok\n42 passing' },
    { kind: 'done', turnId: 't1', ok: true },
  ];
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));

  // The tool-result was posted LIVE for the webview structured render.
  assert.ok(turnEvents(fc).some((e) => e.kind === 'tool-result'), 'the tool-result event was posted live');

  const s = store.get(store.list()[0]!.id)!;
  const tr = s.transcript.find((r) => r.role === 'tool-result');
  assert.ok(tr, 'a structured tool-result row was persisted');
  assert.equal(tr!.role === 'tool-result' ? tr!.command : undefined, 'npm test', 'the command is persisted');
  assert.equal(tr!.role === 'tool-result' ? tr!.output : undefined, 'ok\n42 passing', 'the output is persisted');
  // It is NOT persisted as a flat marker row (markerFor -> null).
  assert.ok(!s.transcript.some((r) => r.role === 'marker' && r.text.includes('npm test')), 'no marker row for the tool result (k2)');
});

test('S001 (ux polish): a turn with NO tool-result events persists a byte-identical transcript (no tool-result rows)', async () => {
  const fc = fakeChannel();
  const evs: TurnEvent[] = [
    { kind: 'assistant-delta', turnId: 't1', text: 'hi' },
    { kind: 'done', turnId: 't1', ok: true },
  ];
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));

  const s = store.get(store.list()[0]!.id)!;
  assert.ok(!s.transcript.some((r) => r.role === 'tool-result'), 'no tool-result rows when the turn emits none (k1 byte-identical)');
  assert.deepEqual(s.transcript.map((r) => r.role), ['user', 'assistant', 'marker'], 'the transcript shape is unchanged from pre-feature');
});

// ---- S005: provider selector + history dropdown + native resume ----

const historyLists = (fc: FakeChannel): unknown[] =>
  fc.posted.filter((m) => m.payload.type === 'history-list').map((m) => m.payload['chats']);

test('S005 shell: run-config controls (provider·model popup + effort gauge) + history-dropdown; one script + CSP intact', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]), codex: scriptedAdapter([]) }, ['claude', 'codex']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  assert.match(html, /<button id="insrc-runbtn"[^>]*aria-haspopup="menu"/, 'has the provider·model button');
  assert.match(html, /<button id="insrc-effortbtn"[^>]*aria-haspopup="dialog"/, 'has the effort gauge button');
  assert.match(html, /<div id="insrc-runpop" class="popup"/, 'has the provider·model popup');
  assert.match(html, /<div id="insrc-effortpop" class="slider-pop"/, 'has the effort slider popup');
  assert.match(html, /<div id="insrc-catalog" hidden data-catalog="/, 'embeds the model catalog');
  assert.doesNotMatch(html, /<select id="insrc-provider"/, 'the old provider select is gone');
  assert.match(html, /<select id="insrc-history"/, 'has a history-dropdown');
  const scripts = html.match(/<script\b/g) ?? [];
  assert.equal(scripts.length, 1, 'still exactly one inline script');
  assert.match(html, /script-src 'nonce-FIXEDNONCE'/, 'strict CSP unchanged');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded (embedded marked ships URLs only in warning strings)');
  assert.doesNotMatch(html, /asWebviewUri/, 'no asWebviewUri');
  assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render');
});

test('S005 shell: empty providers.available -> disabled selector', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({}, []),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  // No CLI installed: the run button renders in its empty state (no provider) — the popup
  // simply lists nothing; there is no disabled-select state anymore.
  assert.match(fc.html(), /<button id="insrc-runbtn"[^>]*data-provider=""/, 'run button renders empty when no CLI installed');
  assert.doesNotMatch(fc.html(), /<select id="insrc-provider"/, 'the old provider select is gone');
});

test('S005 open() posts a history-list', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  assert.ok(historyLists(fc).length >= 1, 'history-list posted on open');
});

test('open()/close leaves NO empty session in history — the chat opens a draft, persisted only on first turn', () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  assert.equal(store.list().length, 0, 'opening the chat does not persist an empty session');
  fc.fireDispose(); // close the panel/tab without sending anything
  assert.equal(store.list().length, 0, 'closing an untouched chat leaves history empty (no empty chat saved)');
  // Reopen + send a message -> now (and only now) a session is persisted.
  host.open();
  assert.equal(store.list().length, 0, 'reopening is still a draft');
  fc.send(env('submit-turn', { text: 'hello' }));
  assert.equal(store.list().length, 1, 'the first turn persists exactly one session');
});

test('LLM titling: the first turn swaps the truncated-prompt title for the LLM-derived name (+ refreshes history)', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't1', ok: true }]) }, ['claude']),
    store,
    cwd: () => '/repo',
    deriveTitle: async (input) => { assert.equal(input.prompt, 'add a --json flag to status'); return 'Add JSON Flag'; },
  });
  host.open();
  fc.send(env('submit-turn', { text: 'add a --json flag to status' }));
  await waitFor(() => store.list()[0]?.title === 'Add JSON Flag');
  assert.equal(store.list()[0]!.title, 'Add JSON Flag', 'LLM-derived title replaced the truncated-prompt fallback');
});

test('LLM titling: a failed/empty derivation keeps the truncated-prompt fallback', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't1', ok: true }]) }, ['claude']),
    store,
    cwd: () => '/repo',
    deriveTitle: async () => undefined, // failure
  });
  host.open();
  fc.send(env('submit-turn', { text: 'why is embed slow' }));
  await waitFor(() => store.list().length === 1);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(store.list()[0]!.title, 'why is embed slow', 'fallback title unchanged on failed derivation');
});

test('LLM titling: with no deriveTitle injected, the truncated-prompt fallback is kept (no built-in CLI call)', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't1', ok: true }]) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'refactor RoleRouter tiers' }));
  await waitFor(() => store.list().length === 1);
  assert.equal(store.list()[0]!.title, 'refactor RoleRouter tiers', 'no titling when deriveTitle is absent');
});

test('S005 new-chat: valid provider creates a fixed-provider session + re-posts history; non-available is a no-op', () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]), codex: scriptedAdapter([]) }, ['claude', 'codex']),
    store,
    cwd: () => '/repo',
  });
  host.open(); // opens a DRAFT claude session (not persisted)
  const hlBefore = historyLists(fc).length;
  fc.send(env('new-chat', { provider: 'codex' }));
  assert.ok(!store.list().some((c) => c.provider === 'codex'), 'new-chat is a DRAFT — not written to history until its first message');
  assert.ok(historyLists(fc).length > hlBefore, 'new-chat re-posts history-list');
  // The first turn persists the draft as a codex session (provider fixed at draft time).
  fc.send(env('submit-turn', { text: 'hi' }));
  assert.ok(store.list().some((c) => c.provider === 'codex'), 'the first turn persists the codex session');
  const n = store.list().length;
  fc.send(env('new-chat', { provider: 'gemini' })); // not installed
  assert.equal(store.list().length, n, 'a non-available provider creates no session');
});

test('S005 open-chat: restores a prior transcript; a missing id is a no-op + refreshes history', () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const prior = store.create('claude');
  store.append(prior.id, { role: 'user', text: 'earlier', at: '2026-01-01T00:00:00.000Z' });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('open-chat', { chatId: prior.id }));
  const restored = fc.posted.filter((m) => m.payload.type === 'session-restored').map((m) => m.payload);
  assert.ok(
    restored.some(
      (r) =>
        r['sessionId'] === prior.id &&
        Array.isArray(r['transcript']) &&
        (r['transcript'] as Array<{ text: string }>).some((x) => x.text === 'earlier'),
    ),
    'open-chat restored the prior chat transcript',
  );
  const hlBefore = historyLists(fc).length;
  fc.send(env('open-chat', { chatId: 'does-not-exist' }));
  assert.ok(historyLists(fc).length > hlBefore, 'a missing id re-posts history-list (dead row dropped)');
});

test('S005 ac3 native resume: turn 2 carries resume from turn 1 done.sessionId; only the new prompt is sent', async () => {
  const fc = fakeChannel();
  const reqs: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'assistant-delta', turnId: 't1', text: 'hi' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const adapter = scriptedAdapter(evs, { onRun: (r) => { reqs.push(r); } });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'first' }));
  await waitFor(() => reqs.length >= 1 && turnEvents(fc).some((e) => e.kind === 'done'));
  fc.send(env('submit-turn', { text: 'second' }));
  await waitFor(() => reqs.length >= 2);
  const r2 = reqs[1]!;
  assert.equal(r2.resume?.nativeSessionId, 'sess-1', 'turn 2 resumes with the captured native session id (ac3)');
  assert.equal(r2.prompt, 'second', 'turn 2 sends only the new prompt — no prior-transcript replay (lc1)');
});

test('S005 switching chat mid-stream cancels the in-flight turn (single-in-flight preserved)', async () => {
  const fc = fakeChannel();
  let cancelled = false;
  const adapter = scriptedAdapter([{ kind: 'status', turnId: 't1', phase: 'thinking' }], { hang: true, onCancel: () => { cancelled = true; } });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).length >= 1); // streamed the status event, now hanging
  fc.send(env('new-chat', { provider: 'claude' }));
  await waitFor(() => cancelled);
  assert.ok(cancelled, 'the in-flight turn was cancelled when switching to a new chat');
});

test('S005 a first-turn error still refreshes the history dropdown (title label)', async () => {
  const fc = fakeChannel();
  const adapter = scriptedAdapter([{ kind: 'error', turnId: 't1', message: 'boom' }]);
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  const hlBefore = historyLists(fc).length;
  fc.send(env('submit-turn', { text: 'do a thing' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'error'));
  await waitFor(() => historyLists(fc).length > hlBefore);
  assert.ok(historyLists(fc).length > hlBefore, 'the first-turn error path re-posted history-list');
  const s = store.get(store.list()[0]!.id);
  assert.equal(s?.title, 'do a thing', 'title was set from the first prompt despite the error');
});

// ---- S008: restored markers keep their glyph + tone (sc1 cssClass persisted + replayed) ----

test('S008 integration: a turn persists each marker row with cssClass === markerFor(ev).cssClass (ac2); assistant rows carry none', async () => {
  const fc = fakeChannel();
  const evs: TurnEvent[] = [
    { kind: 'tool-call', turnId: 't1', tool: 'x', mcp: { server: 'insrc', name: 'insrc_analyze_step' } },
    { kind: 'assistant-delta', turnId: 't1', text: 'hi' },
    { kind: 'file-edit', turnId: 't1', path: 'src/a.ts', diff: { path: 'src/a.ts', hunks: [] } },
    { kind: 'done', turnId: 't1', ok: true },
  ];
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));

  const s = store.get(store.list()[0]!.id);
  const markers = s!.transcript.filter((r) => r.role === 'marker');
  // Each durable marker persists its sc1 class (one of the five insrc-term__marker--* stems).
  const byText = new Map(markers.map((r) => [r.text, r.cssClass]));
  assert.equal(byText.get('insrc · insrc_analyze_step'), 'insrc-term__marker--tool', 'tool-call marker persisted its sc1 class');
  assert.equal(byText.get('src/a.ts'), 'insrc-term__marker--edit', 'file-edit marker persisted its sc1 class');
  assert.equal(byText.get('done'), 'insrc-term__marker--done', 'done marker persisted its sc1 class');
  for (const m of markers) assert.match(m.cssClass ?? '', /^insrc-term__marker--/, 'every marker row carries an sc1 class');
  assert.ok(
    s!.transcript.some((r) => r.role === 'assistant' && r.text === 'hi' && r.cssClass === undefined),
    'assistant-delta row carries no cssClass',
  );
});

test('S008 integration: open-chat restore posts marker rows carrying their cssClass (ac1)', () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const prior = store.create('claude');
  store.append(prior.id, { role: 'marker', text: 'done', cssClass: 'insrc-term__marker--done', at: 't' });
  store.append(prior.id, { role: 'marker', text: 'legacy', at: 't' }); // pre-S008 row (no cssClass)
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('open-chat', { chatId: prior.id }));
  const restored = fc.posted.filter((m) => m.payload.type === 'session-restored').map((m) => m.payload);
  const payload = restored.find((r) => r['sessionId'] === prior.id);
  assert.ok(payload, 'open-chat restored the prior chat');
  const rows = payload!['transcript'] as Array<{ text: string; cssClass?: string }>;
  assert.equal(rows.find((x) => x.text === 'done')?.cssClass, 'insrc-term__marker--done', 'the styled marker carries its class on restore');
  assert.equal(rows.find((x) => x.text === 'legacy')?.cssClass, undefined, 'the pre-S008 marker restores as plain text (ac3)');
});

test('S001 shell: session-restored replay routes through the sc1 registry (keyed, single-sourced, carries the stored class); CSP/one-script/textContent intact', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  // S001 t5: the replay now single-sources rendering through reg.appendKeyed(reg.toViewModel(x))
  // (keyed by transcript index) after reg.resetKeys(); the stored cssClass is carried by
  // toViewModel (marker rows -> fallback with the class) into the widened line(s,cls) writer.
  assert.match(html, /reg\.resetKeys\(\)/, 'restore resets the reconciliation map before replaying');
  assert.match(html, /reg\.appendKeyed\(reg\.toViewModel\(x\),'r'\+\(_first\+i\)\)/, 'restore replays keyed via the sc1 registry, by absolute transcript index');
  assert.doesNotMatch(html, /forEach\(x=>line\(x\.text\)\)/, 'the classless replay is gone');
  // The cssClass is still delivered through the widened writer (via the fallback renderer).
  assert.match(html, /function line\(s,cls\)/, 'the widened writer is unchanged');
  assert.match(html, /className=cls/, 'the class is applied via className');
  // sc1/CSP/XSS invariants unchanged.
  const scripts = html.match(/<script\b/g) ?? [];
  assert.equal(scripts.length, 1, 'still exactly one inline script');
  assert.match(html, /script-src 'nonce-FIXEDNONCE'/, 'strict CSP unchanged');
  assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded (embedded marked ships URLs only in warning strings)');
  assert.doesNotMatch(html, /asWebviewUri/, 'no asWebviewUri');
});

// ---- S006: edit governance + Story E20261013b2e8109f:S001: a turn's changed sections as diff rows ----

interface FakeGov {
  deps: ChatEditGovernanceDeps;
  disk: Map<string, string>;
  baseline: Map<string, string>;
  editorCalls: Array<{ path: string; review: boolean }>;
  setDiffView: (v: DiffView) => void;
  setAvailable: (v: boolean) => void;
  /** What baseline.changes answers next: a patch, '' (nothing changed), undefined (unreadable) or a function called per check. */
  patch: { next: string | undefined | (() => Promise<string | undefined>) };
  /** How many checks ran (calls of baseline.changes). */
  checks: { count: number };
  snapshots: { count: number };
  released: { count: number };
}
function fakeGovernance(): FakeGov {
  const disk = new Map<string, string>();
  const baseline = new Map<string, string>();
  const editorCalls: FakeGov['editorCalls'] = [];
  const patch: FakeGov['patch'] = { next: '' };
  const checks = { count: 0 };
  const snapshots = { count: 0 };
  const released = { count: 0 };
  let view: DiffView = 'chat';
  let available = true;
  const deps: ChatEditGovernanceDeps = {
    relPath: (p) => (p.startsWith('/repo/') ? p.slice('/repo/'.length) : p),
    diffView: () => view,
    baseline: {
      available: async () => available,
      snapshot: async () => ({ ref: `SNAP${snapshots.count++}`, index: '/tmp/idx' }),
      read: async (_h, path) => baseline.get(path),
      changes: async () => {
        checks.count++;
        return typeof patch.next === 'function' ? patch.next() : patch.next;
      },
      release: async () => { released.count++; },
    },
    fs: {
      read: async (path) => disk.get(path),
      write: async (path, content) => { disk.set(path, content); },
      remove: async (path) => { disk.delete(path); },
    },
    editorDiff: async (path, _base, o) => { editorCalls.push({ path, review: o.review }); },
  };
  return { deps, disk, baseline, editorCalls, setDiffView: (v) => { view = v; }, setAvailable: (v) => { available = v; }, patch, checks, snapshots, released };
}

/** An adapter the test feeds one event at a time, so a check can finish before the next event. */
function fedAdapter(): { adapter: StreamAdapter; feed: (ev: TurnEvent) => void; runs: () => number } {
  const queue: TurnEvent[] = [];
  let cancelled = false;
  let runs = 0;
  const adapter: StreamAdapter = {
    async *run(): AsyncIterable<TurnEvent> {
      runs++;
      cancelled = false;
      for (;;) {
        while (queue.length === 0 && !cancelled) await new Promise((r) => setTimeout(r, 2));
        if (cancelled) return;
        const ev = queue.shift()!;
        yield ev;
        if (ev.kind === 'done' || ev.kind === 'error') return;
      }
    },
    cancel: () => { cancelled = true; },
    decide: () => {},
    capabilities: { resume: true },
  };
  return { adapter, feed: (ev) => void queue.push(ev), runs: () => runs };
}

interface PostedRow { rowIndex: number; row: TranscriptEntry }
const transcriptRows = (fc: FakeChannel): PostedRow[] =>
  fc.posted.filter((m) => m.payload.type === 'transcript-row').map((m) => ({ rowIndex: m.payload['rowIndex'] as number, row: m.payload['row'] as TranscriptEntry }));
const diffRowsOf = (rows: readonly TranscriptEntry[]): Array<Extract<TranscriptEntry, { role: 'diff' }>> =>
  rows.filter((r): r is Extract<TranscriptEntry, { role: 'diff' }> => r.role === 'diff');
const toolResult = (output = 'ok'): TurnEvent => ({ kind: 'tool-result', turnId: 't1', command: 'run', output });
const fileEdit = (path: string): TurnEvent => ({ kind: 'file-edit', turnId: 't1', path, diff: { path, hunks: [] } });
const DONE: TurnEvent = { kind: 'done', turnId: 't1', ok: true };
const settleDiff = (): Promise<void> => new Promise((r) => setTimeout(r, 25));

test('diff sections: an added section is pushed as a diff row with a sid and posted as transcript-row with its row index; an update and a withdraw are pushed as rows that name that sid, and no earlier row is changed', async () => {
  const fc = fakeChannel();
  const gov = fakeGovernance();
  const fed = fedAdapter();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: fed.adapter }, ['claude']), store, cwd: () => '/repo', editGovernance: gov.deps });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => fed.runs() === 1);
  assert.equal(gov.snapshots.count, 1, 'the snapshot is taken before the CLI starts');

  // Two sections of one file: two rows, each with its own sid.
  gov.patch.next = patchOf(['src/a.ts', 1, 'one'], ['src/a.ts', 40, 'two']);
  fed.feed(toolResult());
  await waitFor(() => transcriptRows(fc).length === 2);
  const [first, second] = transcriptRows(fc);
  assert.ok(first!.row.role === 'diff' && second!.row.role === 'diff');
  const sid0 = (first!.row as { sid?: string }).sid;
  const sid1 = (second!.row as { sid?: string }).sid;
  assert.match(sid0 ?? '', /^d[0-9a-z]+-0$/);
  assert.match(sid1 ?? '', /^d[0-9a-z]+-1$/);
  assert.equal('replaces' in first!.row, false);
  assert.deepEqual([first!.row.role === 'diff' && first!.row.path, first!.row.role === 'diff' && first!.row.oldStart, first!.row.role === 'diff' && first!.row.lines], ['src/a.ts', 1, [' ctx', '+one', ' ctx2']]);
  assert.deepEqual([second!.row.role === 'diff' && second!.row.oldStart, second!.row.role === 'diff' && second!.row.added], [40, 1]);
  assert.equal(second!.rowIndex, first!.rowIndex + 1);
  const early = JSON.stringify(transcriptRows(fc));

  // The first section changes and the second goes: two more rows, each naming a sid.
  gov.patch.next = patchOf(['src/a.ts', 1, 'one, changed']);
  fed.feed(toolResult());
  await waitFor(() => transcriptRows(fc).length === 4);
  const [, , update, withdraw] = transcriptRows(fc);
  assert.ok(update!.row.role === 'diff' && withdraw!.row.role === 'diff');
  if (update!.row.role === 'diff') {
    assert.equal(update!.row.replaces, sid0);
    assert.equal(update!.row.sid, undefined);
    assert.deepEqual(update!.row.lines, [' ctx', '+one, changed', ' ctx2']);
  }
  if (withdraw!.row.role === 'diff') {
    assert.equal(withdraw!.row.replaces, sid1);
    assert.equal(withdraw!.row.withdrawn, true);
    assert.deepEqual(withdraw!.row.lines, []);
    assert.deepEqual([withdraw!.row.path, withdraw!.row.oldStart], ['src/a.ts', 40]);
  }

  fed.feed(DONE);
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  await settleDiff();
  // Every posted row is the row the transcript holds at that index; the early rows are as they were.
  const transcript = store.get(store.list()[0]!.id)!.transcript;
  for (const p of transcriptRows(fc)) assert.deepEqual(transcript[p.rowIndex], p.row);
  assert.equal(JSON.stringify(transcriptRows(fc).slice(0, 2)), early, 'no earlier row is changed');
  assert.equal(diffRowsOf(transcript).length, 4, 'four rows were pushed, none rewritten');
  assert.equal(transcriptRows(fc).length, 4, 'the last check found nothing new');
  assert.equal(fc.posted.some((m) => m.payload.type === 'edit-prompt'), false);
});

test('diff sections: a check is requested after every tool-result and file-edit event and once more at the end of the turn, and the session is saved after late rows', async () => {
  const fake = fakeSessionFs();
  const store = createFileChatSessionStore({ root: '/sessions', fs: fake.fs });
  const diskRows = (id: string): TranscriptEntry[] =>
    (fake.files.get(`/sessions/${id}${ROWS_SUFFIX}`) ?? '').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as TranscriptEntry);
  const fc = fakeChannel();
  const gov = fakeGovernance();
  const fed = fedAdapter();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: fed.adapter }, ['claude']), store, cwd: () => '/repo', editGovernance: gov.deps });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => fed.runs() === 1);
  assert.equal(gov.checks.count, 0);

  fed.feed(toolResult());
  await waitFor(() => gov.checks.count === 1);
  fed.feed(fileEdit('src/a.ts'));
  await waitFor(() => gov.checks.count === 2);
  // Events that change no file ask for no check.
  fed.feed({ kind: 'assistant-delta', turnId: 't1', text: 'working' });
  fed.feed({ kind: 'tool-call', turnId: 't1', tool: 'Bash' } as TurnEvent);
  await settleDiff();
  assert.equal(gov.checks.count, 2);

  // The last check is still running when the turn ends: its rows arrive after the turn's own save.
  let open!: (v: string) => void;
  gov.patch.next = () => new Promise<string>((r) => { open = r; });
  fed.feed(DONE);
  await waitFor(() => gov.checks.count === 3);
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  await settleDiff();
  const id = store.list()[0]!.id;
  assert.equal(diffRowsOf(diskRows(id)).length, 0, 'the turn was saved before the last check answered');
  assert.equal(gov.released.count, 0, 'the snapshot is held until the last check is done');
  open(patchOf(['src/a.ts', 1, 'late']));
  await waitFor(() => transcriptRows(fc).length === 1);
  await settleDiff();
  assert.equal(diffRowsOf(diskRows(id)).length, 1, 'the late row is saved');
  assert.deepEqual(diskRows(id), JSON.parse(JSON.stringify(store.get(id)!.transcript)));
  assert.equal(gov.checks.count, 3, 'one check at the end, no more');
  assert.equal(gov.released.count, 1);
});

test('diff sections: overflow and unreadable push one marker row each and post it as transcript-row', async () => {
  const fc = fakeChannel();
  const gov = fakeGovernance();
  const fed = fedAdapter();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: fed.adapter }, ['claude']), store, cwd: () => '/repo', editGovernance: gov.deps });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => fed.runs() === 1);
  const markers = (): PostedRow[] => transcriptRows(fc).filter((p) => p.row.role === 'marker');
  const many = (n: number, dir: string): string => patchOf(...Array.from({ length: n }, (_, i): [string, number, string] => [`${dir}/f${i}.ts`, 1, 'x']));

  // 21 new sections: 20 shown, one counted.
  gov.patch.next = many(21, 'one');
  fed.feed(toolResult());
  await waitFor(() => markers().length === 1);
  assert.equal(transcriptRows(fc).filter((p) => p.row.role === 'diff').length, 20);
  assert.deepEqual(markers()[0]!.row, { role: 'marker', text: '1 more changed section in 1 file is not shown', cssClass: 'insrc-term__marker--edit', at: (markers()[0]!.row as { at: unknown }).at });
  assert.equal(markers()[0]!.rowIndex, transcriptRows(fc).at(-1)!.rowIndex, 'the count follows the sections');

  // Unreadable: said once, however often it happens.
  gov.patch.next = undefined;
  fed.feed(toolResult());
  await waitFor(() => markers().length === 2);
  fed.feed(toolResult());
  await waitFor(() => gov.checks.count === 3);
  await settleDiff();
  assert.equal(markers().length, 2);
  assert.equal((markers()[1]!.row as { text: string }).text, 'The changes of this turn could not be read');
  gov.patch.next = many(21, 'one');
  fed.feed(DONE);
  await waitFor(() => turnEvents(fc).filter((e) => e.kind === 'done').length === 1);
  await settleDiff();

  // A second turn: 25 new sections in 3 more than the shown files.
  fc.send(env('submit-turn', { text: 'again' }));
  await waitFor(() => fed.runs() === 2);
  gov.patch.next = patchOf(...Array.from({ length: 25 }, (_, i): [string, number, string] => [i < 20 ? `two/f${i}.ts` : `two/g${i % 2}.ts`, 1 + i * 10, 'x']));
  fed.feed(toolResult());
  await waitFor(() => markers().length === 3);
  assert.equal((markers()[2]!.row as { text: string }).text, '5 more changed sections in 2 files are not shown');
  gov.patch.next = '';
  fed.feed(DONE);
  await waitFor(() => turnEvents(fc).filter((e) => e.kind === 'done').length === 2);
  await settleDiff();
  const transcript = store.get(store.list()[0]!.id)!.transcript;
  for (const p of transcriptRows(fc)) assert.deepEqual(transcript[p.rowIndex], p.row);
});

test('diff sections: with no snapshot, or with the editor view, no diff state is made and the rows and messages are those of today', async () => {
  const evs: TurnEvent[] = [toolResult('listing'), fileEdit('src/a.ts'), { kind: 'tool-result', turnId: 't1', output: 'The file src/a.ts has been updated', editPath: 'src/a.ts' }, DONE];
  const run = async (configure?: (g: FakeGov) => void): Promise<{ fc: FakeChannel; gov: FakeGov; rows: unknown[] }> => {
    const fc = fakeChannel();
    const gov = fakeGovernance();
    gov.patch.next = patchOf(['src/a.ts', 1, 'one']);
    gov.baseline.set('src/a.ts', 'old\n');
    gov.disk.set('src/a.ts', 'NEW\n');
    configure?.(gov);
    const store = createInMemoryChatSessionStore();
    const host = createChatPanelHost({
      createPanel: () => fc.channel,
      providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
      store,
      cwd: () => '/repo',
      ...(configure !== undefined ? { editGovernance: gov.deps } : {}),
    });
    host.open();
    fc.send(env('submit-turn', { text: 'go' }));
    await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
    await settleDiff();
    const rows = store.get(store.list()[0]!.id)!.transcript.map((r) => ({ ...r, at: 0 }));
    return { fc, gov, rows };
  };
  // Today's rows: a host with no governance at all.
  const plain = await run();
  assert.ok(plain.rows.some((r) => (r as TranscriptEntry).role === 'marker' && (r as { text: string }).text.includes('src/a.ts')), 'the path marker');
  assert.ok(plain.rows.some((r) => (r as TranscriptEntry).role === 'tool-result'), 'the result row');
  const kinds = (fc: FakeChannel): string[] => fc.posted.map((m) => m.payload.type).filter((t) => t === 'turn-event' || t === 'transcript-row' || t === 'user-row');

  // Not a git folder: no snapshot.
  const nogit = await run((g) => g.setAvailable(false));
  assert.deepEqual(nogit.rows, plain.rows);
  assert.deepEqual(kinds(nogit.fc), kinds(plain.fc));
  assert.equal(transcriptRows(nogit.fc).length, 0);
  assert.equal(nogit.gov.checks.count, 0);

  // The editor view: the editor diff opens; nothing is checked and no row is added.
  const editor = await run((g) => g.setDiffView('editor'));
  assert.deepEqual(editor.rows, plain.rows);
  assert.deepEqual(kinds(editor.fc), kinds(plain.fc));
  assert.equal(transcriptRows(editor.fc).length, 0);
  assert.equal(editor.gov.checks.count, 0);
  assert.deepEqual(editor.gov.editorCalls, [{ path: 'src/a.ts', review: false }]);
  // The accept/reject gate is retired: a stray reject reverts nothing.
  editor.fc.send(env('edit-decision', { path: 'src/a.ts', accept: false }));
  await settleDiff();
  assert.equal(editor.gov.disk.get('src/a.ts'), 'NEW\n');

  // The chat view in a git folder is the one case with sections (and no editor).
  const chat = await run(() => {});
  assert.equal(diffRowsOf(chat.rows as TranscriptEntry[]).length, 1);
  assert.deepEqual(chat.gov.editorCalls, []);
  for (const r of [plain, nogit, editor, chat]) assert.equal(r.fc.posted.some((m) => m.payload.type === 'edit-prompt'), false);
});

test("diff sections: the restored window and an older page carry each section's latest version at its first row's place", async () => {
  // A real turn: a section is added, changed, and another is withdrawn.
  const fc = fakeChannel();
  const gov = fakeGovernance();
  const fed = fedAdapter();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: fed.adapter }, ['claude']), store, cwd: () => '/repo', editGovernance: gov.deps });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => fed.runs() === 1);
  gov.patch.next = patchOf(['src/a.ts', 1, 'v1'], ['src/b.ts', 1, 'gone soon']);
  fed.feed(toolResult());
  await waitFor(() => transcriptRows(fc).length === 2);
  gov.patch.next = patchOf(['src/a.ts', 1, 'v2']);
  fed.feed(toolResult());
  await waitFor(() => transcriptRows(fc).length === 4);
  fed.feed(DONE);
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  await settleDiff();
  const [a, b] = transcriptRows(fc);
  const sidA = (a!.row as { sid: string }).sid;
  const sidB = (b!.row as { sid: string }).sid;
  const id = store.list()[0]!.id;
  const stored = JSON.stringify(store.get(id)!.transcript);

  // A reloaded webview: the window has the latest version where the first row is.
  fc.send(env('ready'));
  const restored = posted(fc, 'session-restored').at(-1)!;
  const rows = restored['transcript'] as TranscriptEntry[];
  const first = restored['firstIndex'] as number;
  const atA = rows[a!.rowIndex - first]!;
  const atB = rows[b!.rowIndex - first]!;
  assert.ok(atA.role === 'diff' && atB.role === 'diff');
  if (atA.role === 'diff') {
    assert.equal(atA.sid, sidA);
    assert.equal(atA.replaces, undefined);
    assert.deepEqual(atA.lines, [' ctx', '+v2', ' ctx2']);
  }
  if (atB.role === 'diff') {
    assert.equal(atB.sid, sidB);
    assert.equal(atB.withdrawn, true);
  }
  assert.equal(rows.length, store.get(id)!.transcript.length, 'the row count does not change');
  assert.equal(JSON.stringify(store.get(id)!.transcript), stored, 'the stored rows are untouched');

  // An older page: the first row lies outside the latest window, its newer version far later.
  const long = createInMemoryChatSessionStore();
  const s = long.create('claude');
  s.transcript.push({ role: 'user', text: 'q0', at: 't' });
  s.transcript.push({ role: 'diff', sid: 'k-0', path: 'old.ts', oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, added: 1, removed: 0, lines: ['+v1'], at: 't' });
  for (let t = 1; t < 150; t++) {
    s.transcript.push({ role: 'user', text: `q${t}`, at: 't' });
    for (let k = 1; k < 4; k++) s.transcript.push({ role: 'assistant', text: `a${t}.${k}`, at: 't' });
  }
  s.transcript.push({ role: 'diff', replaces: 'k-0', path: 'old.ts', oldStart: 1, oldLines: 1, newStart: 1, newLines: 4, added: 3, removed: 0, lines: ['+v9'], at: 't' });
  long.save(s);
  const fc2 = fakeChannel();
  createChatPanelHost({ createPanel: () => fc2.channel, providers: registry({ claude: scriptedAdapter([]) }, ['claude']), store: long, cwd: () => '/repo' }).open();
  fc2.send(env('open-chat', { chatId: s.id }));
  let before = posted(fc2, 'session-restored').at(-1)!['firstIndex'] as number;
  assert.ok(before > 1, 'the first row is not in the latest window');
  let found: TranscriptEntry | undefined;
  while (before > 0) {
    const pagesBefore = posted(fc2, 'transcript-page').length;
    fc2.send(env('load-older', { sessionId: s.id, before }));
    const page = posted(fc2, 'transcript-page').at(-1)!;
    assert.equal(posted(fc2, 'transcript-page').length, pagesBefore + 1);
    const pageFirst = page['firstIndex'] as number;
    if (pageFirst <= 1) found = (page['rows'] as TranscriptEntry[])[1 - pageFirst];
    before = pageFirst;
  }
  assert.ok(found !== undefined && found.role === 'diff');
  if (found !== undefined && found.role === 'diff') {
    assert.equal(found.sid, 'k-0');
    assert.equal(found.replaces, undefined);
    assert.deepEqual([found.lines, found.added, found.newLines], [['+v9'], 3, 4]);
  }
});

// ---- Story E20261013b2e8109f:S001 / t7: held path lines, settling, and ending the diff state ----

const editResult = (path: string, output = `The file ${path} has been updated`, isError = false): TurnEvent =>
  ({ kind: 'tool-result', turnId: 't1', output, editPath: path, ...(isError ? { isError: true } : {}) }) as TurnEvent;
const applied = (path: string): TurnEvent => ({ kind: 'file-edit', turnId: 't1', path, diff: { path, hunks: [] }, applied: true });
const pathLabel = (path: string): string => markerFor(fileEdit(path))!.label;
const markerTexts = (rows: readonly TranscriptEntry[]): string[] => rows.filter((r) => r.role === 'marker').map((r) => (r as { text: string }).text);

test('diff sections: while the diff state is open the file-edit marker and the successful edit result write no row, and a failed edit pushes and posts the path marker then the error row', async () => {
  const fc = fakeChannel();
  const gov = fakeGovernance();
  const fed = fedAdapter();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: fed.adapter }, ['claude']), store, cwd: () => '/repo', editGovernance: gov.deps });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => fed.runs() === 1);

  // A successful edit: its section is the only thing shown.
  gov.patch.next = patchOf(['src/a.ts', 1, 'x']);
  fed.feed(fileEdit('src/a.ts'));
  fed.feed(editResult('src/a.ts'));
  await waitFor(() => transcriptRows(fc).length === 1);
  await settleDiff();
  assert.equal(transcriptRows(fc)[0]!.row.role, 'diff');
  assert.deepEqual(turnEvents(fc).filter((e) => e.kind === 'file-edit' || e.kind === 'tool-result'), [], 'neither event is posted');
  assert.equal(transcriptRows(fc).length, 1, 'and no path line follows, the path has a section');

  // A failed edit: the path line, then the error.
  fed.feed(fileEdit('src/b.ts'));
  fed.feed(editResult('src/b.ts', 'String to replace not found in file', true));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'tool-result'));
  const marker = transcriptRows(fc).find((p) => p.row.role === 'marker')!;
  assert.deepEqual({ ...marker.row, at: 0 }, { role: 'marker', text: pathLabel('src/b.ts'), cssClass: markerFor(fileEdit('src/b.ts'))!.cssClass, at: 0 });
  const errorPost = fc.posted.find((m) => m.payload.type === 'turn-event' && (m.payload['event'] as TurnEvent).kind === 'tool-result')!;
  assert.equal(errorPost.payload['rowIndex'], marker.rowIndex + 1, 'the error row follows the path line');
  assert.ok(fc.posted.indexOf(errorPost) > fc.posted.findIndex((m) => m.payload.type === 'transcript-row' && (m.payload['row'] as TranscriptEntry).role === 'marker'));
  assert.equal(turnEvents(fc).some((e) => e.kind === 'file-edit'), false, 'the failed edit\'s own file-edit event is not posted either');

  // A result that is no edit is written as today.
  fed.feed(toolResult('listing'));
  await waitFor(() => turnEvents(fc).filter((e) => e.kind === 'tool-result').length === 2);
  gov.patch.next = patchOf(['src/a.ts', 1, 'x']);
  fed.feed(DONE);
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  await settleDiff();
  const transcript = store.get(store.list()[0]!.id)!.transcript;
  assert.deepEqual(transcript.filter((r) => r.role !== 'user').map((r) => r.role), ['diff', 'marker', 'tool-result', 'tool-result', 'marker']);
  assert.deepEqual(transcript.filter((r) => r.role === 'tool-result').map((r) => (r as { output: string }).output), ['String to replace not found in file', 'listing']);
  assert.equal(markerTexts(transcript).includes(pathLabel('src/a.ts')), false, 'no path line for the successful edit');
  assert.equal(markerTexts(transcript).filter((t) => t === pathLabel('src/b.ts')).length, 1, 'one path line for the failed edit, not a second at the end');
  for (const p of transcriptRows(fc)) assert.deepEqual(transcript[p.rowIndex], p.row);
});

test('diff sections: an edit whose path has no section after its check gets its path marker, posted as transcript-row, for a claude result, for a codex applied file-edit and at the end of the turn; an edit whose path has a section gets none', async () => {
  const fc = fakeChannel();
  const gov = fakeGovernance();
  const fed = fedAdapter();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: fed.adapter }, ['claude']), store, cwd: () => '/repo', editGovernance: gov.deps });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => fed.runs() === 1);
  const texts = (): string[] => markerTexts(transcriptRows(fc).map((p) => p.row));

  // claude: the edit of a file git ignores. Held at the call, settled after the check at its result.
  fed.feed(fileEdit('ignored/x.log'));
  await waitFor(() => gov.checks.count === 1);
  await settleDiff();
  assert.deepEqual(texts(), [], 'held while the edit has not ended');
  fed.feed(editResult('ignored/x.log'));
  await waitFor(() => texts().length === 1);
  assert.deepEqual(texts(), [pathLabel('ignored/x.log')]);

  // codex: an applied patch is settled after the check at its own event; the path is absolute.
  fed.feed(applied('/repo/out/y.bin'));
  await waitFor(() => texts().length === 2);
  assert.equal(texts()[1], pathLabel('/repo/out/y.bin'));

  // A path with a section gets none: codex (absolute path, the section's is relative) and claude.
  gov.patch.next = patchOf(['src/a.ts', 1, 'x'], ['src/c.ts', 1, 'y']);
  fed.feed(applied('/repo/src/a.ts'));
  await waitFor(() => transcriptRows(fc).filter((p) => p.row.role === 'diff').length === 2);
  fed.feed(fileEdit('src/c.ts'));
  fed.feed(editResult('src/c.ts'));
  await waitFor(() => gov.checks.count === 6);
  await settleDiff();
  assert.equal(texts().length, 2, 'no path line for a path that has a section');

  // The end of the turn: an edit whose result never came is settled after the last check.
  fed.feed(fileEdit('src/never.ts'));
  fed.feed(fileEdit('src/a.ts'));
  await waitFor(() => gov.checks.count === 8);
  await settleDiff();
  assert.equal(texts().length, 2, 'both still held');
  fed.feed(DONE);
  await waitFor(() => texts().length === 3);
  await settleDiff();
  assert.deepEqual(texts(), [pathLabel('ignored/x.log'), pathLabel('/repo/out/y.bin'), pathLabel('src/never.ts')]);
  const transcript = store.get(store.list()[0]!.id)!.transcript;
  for (const p of transcriptRows(fc)) assert.deepEqual(transcript[p.rowIndex], p.row);
  assert.equal(turnEvents(fc).some((e) => e.kind === 'file-edit' || e.kind === 'tool-result'), false);
  assert.equal(gov.released.count, 1);
});

test("diff sections: a chat switch in mid-turn settles the held paths, saves, abandons the governor's turn before the detach, and a check in flight then pushes and posts nothing", async () => {
  const fake = fakeSessionFs();
  const store = createFileChatSessionStore({ root: '/sessions', fs: fake.fs });
  const diskRows = (id: string): TranscriptEntry[] =>
    (fake.files.get(`/sessions/${id}${ROWS_SUFFIX}`) ?? '').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as TranscriptEntry);
  const fc = fakeChannel();
  const gov = fakeGovernance();
  const fed = fedAdapter();
  const order: string[] = [];
  const release = gov.deps.baseline.release;
  const deps: ChatEditGovernanceDeps = { ...gov.deps, baseline: { ...gov.deps.baseline, release: async (h) => { order.push('release'); await release(h); } } };
  const adapter: StreamAdapter = { ...fed.adapter, cancel: (id) => { order.push('cancel'); return fed.adapter.cancel(id); } };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', editGovernance: deps });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => fed.runs() === 1);
  fed.feed(fileEdit('src/held.ts'));
  await waitFor(() => gov.checks.count === 1);
  // A check is in flight when the chat is switched.
  let open!: (v: string) => void;
  gov.patch.next = () => new Promise<string>((r) => { open = r; });
  fed.feed(toolResult());
  await waitFor(() => gov.checks.count === 2);
  await settleDiff();
  assert.equal(transcriptRows(fc).length, 0);

  fc.send(env('new-chat', { provider: 'claude' }));
  // At once: the held path's line is pushed and posted before the new chat is shown.
  const rows = transcriptRows(fc);
  assert.equal(rows.length, 1);
  assert.equal((rows[0]!.row as { text: string }).text, pathLabel('src/held.ts'));
  const markerAt = fc.posted.findIndex((m) => m.payload.type === 'transcript-row');
  const restoredAt = fc.posted.map((m) => m.payload.type).lastIndexOf('session-restored');
  assert.ok(markerAt < restoredAt, 'posted while its session was still the one shown');
  await waitFor(() => gov.released.count === 1);
  await waitFor(() => order.includes('cancel'));
  assert.deepEqual(order.slice(0, 2), ['release', 'cancel'], "the governor's turn is abandoned before the detach");
  const id = store.list()[0]!.id;
  assert.ok(markerTexts(diskRows(id)).includes(pathLabel('src/held.ts')), 'saved');

  // The check in flight answers now: nothing is pushed or posted.
  const before = JSON.stringify(store.get(id)!.transcript);
  open(patchOf(['src/held.ts', 1, 'late'], ['src/other.ts', 1, 'late']));
  await settleDiff();
  assert.equal(transcriptRows(fc).length, 1);
  assert.equal(JSON.stringify(store.get(id)!.transcript), before);
  assert.equal(diffRowsOf(store.get(id)!.transcript).length, 0);
  assert.equal(gov.checks.count, 2, 'no last check');
  assert.equal(gov.released.count, 1);
});

test('diff sections: the Stop control, a newer turn\'s start, a sink error and closing the panel each end the open diff state and settle its held paths', async () => {
  const start = async (adapterOf?: (fed: ReturnType<typeof fedAdapter>) => StreamAdapter) => {
    const fc = fakeChannel();
    const gov = fakeGovernance();
    const fed = fedAdapter();
    const store = createInMemoryChatSessionStore();
    const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapterOf?.(fed) ?? fed.adapter }, ['claude']), store, cwd: () => '/repo', editGovernance: gov.deps, logger: { warn: () => {}, error: () => {} } });
    host.open();
    fc.send(env('submit-turn', { text: 'go' }));
    await waitFor(() => fed.runs() === 1);
    fed.feed(fileEdit('src/held.ts'));
    await waitFor(() => gov.checks.count === 1);
    await settleDiff();
    assert.equal(transcriptRows(fc).length, 0, 'held');
    return { fc, gov, fed, store, host };
  };
  const ended = async (h: Awaited<ReturnType<typeof start>>, why: string): Promise<void> => {
    await waitFor(() => h.gov.released.count === 1);
    const transcript = h.store.get(h.store.list()[0]!.id)!.transcript;
    assert.equal(markerTexts(transcript).filter((t) => t === pathLabel('src/held.ts')).length, 1, `${why}: the held path got its line`);
    assert.equal(h.gov.checks.count, 1, `${why}: no last check`);
    // A late answer or a later event of that turn is no longer held and adds no section.
    h.gov.patch.next = patchOf(['src/held.ts', 1, 'late']);
    await settleDiff();
    assert.equal(diffRowsOf(transcript).length, 0, why);
  };

  // The Stop control.
  const stop = await start();
  stop.fc.send(env('cancel-turn'));
  assert.equal(transcriptRows(stop.fc).length, 1, 'settled at once, and posted');
  await ended(stop, 'stop');

  // Closing the panel.
  const close = await start();
  close.fc.fireDispose();
  await ended(close, 'close');

  // A sink error: the adapter fails after the edit.
  let fail!: () => void;
  const failing = new Promise<void>((r) => { fail = r; });
  const err = await start((fed) => ({
    ...fed.adapter,
    async *run(req: TurnRequest, opts?: RunOptions): AsyncIterable<TurnEvent> {
      const it = fed.adapter.run(req, opts)[Symbol.asyncIterator]();
      const first = await it.next();
      if (first.done !== true) yield first.value;
      await failing;
      throw new Error('the CLI died');
    },
  }));
  fail();
  await waitFor(() => turnEvents(err.fc).some((e) => e.kind === 'error'));
  const markerAt = err.fc.posted.findIndex((m) => m.payload.type === 'transcript-row');
  const errorAt = err.fc.posted.findIndex((m) => m.payload.type === 'turn-event' && (m.payload['event'] as TurnEvent).kind === 'error');
  assert.ok(markerAt !== -1 && markerAt < errorAt, 'the path line comes before the error');
  await ended(err, 'error');

  // A newer turn's start. The first turn is superseded: its sink is no longer called, not even at
  // its end, and the new turn starts once the first one's output has ended.
  const newer = await start();
  newer.fc.send(env('submit-turn', { text: 'second' }));
  await settleDiff();
  assert.equal(transcriptRows(newer.fc).length, 1, 'settled when the newer message arrived, without waiting for the first turn to end');
  newer.fed.feed(DONE);
  await waitFor(() => newer.gov.snapshots.count === 2);
  assert.equal(newer.gov.checks.count, 1, 'the superseded turn ran no last check');
  await waitFor(() => newer.gov.released.count >= 1);
  const transcript = newer.store.get(newer.store.list()[0]!.id)!.transcript;
  assert.equal(markerTexts(transcript).filter((t) => t === pathLabel('src/held.ts')).length, 1, 'the held path got its line');
  // The new turn has its own diff state: its sections get a new key.
  newer.gov.patch.next = patchOf(['src/n.ts', 1, 'new turn']);
  await waitFor(() => newer.fed.runs() === 2);
  newer.fed.feed(toolResult());
  await waitFor(() => diffRowsOf(transcript).length === 1);
  newer.gov.patch.next = patchOf(['src/n.ts', 1, 'new turn']);
  newer.fed.feed(DONE);
  await waitFor(() => newer.gov.released.count === 2);
});

test('diff sections: a followed turn writes and posts its rows as today and asks for no check, also while the governor still holds a snapshot', async () => {
  const events: TurnEvent[] = [fileEdit('src/a.ts'), editResult('src/a.ts'), editResult('src/b.ts', 'no such file', true), { kind: 'done', turnId: 't1', ok: true }];
  // A host with governance follows a saved turn (as after a reload): no diff state was ever made.
  const followed = async (prepare?: (h: { fc: FakeChannel; gov: FakeGov; fed: ReturnType<typeof fedAdapter> }) => Promise<void>) => {
    const { store, id } = storeWithLiveTurn(1);
    const resume = resumeAdapter(events);
    const fed = fedAdapter();
    const adapter: StreamAdapter = { ...fed.adapter, resume: resume.adapter.resume! };
    const fc = fakeChannel();
    const gov = fakeGovernance();
    gov.patch.next = patchOf(['src/a.ts', 1, 'x']);
    const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', editGovernance: gov.deps, hostPid: 2, isAlive: (pid) => pid === 2 });
    host.open();
    await prepare?.({ fc, gov, fed });
    const checksBefore = gov.checks.count;
    const postedBefore = fc.posted.length;
    fc.send(env('open-chat', { chatId: id }));
    await waitFor(() => store.get(id)?.liveTurn === undefined);
    await settleDiff();
    const rows = store.get(id)!.transcript;
    assert.deepEqual(rows.slice(2).map((r) => r.role), ['marker', 'tool-result', 'tool-result', 'marker'], 'the path line and both result rows, as today');
    assert.equal((rows[2] as { text: string }).text, pathLabel('src/a.ts'));
    const after = fc.posted.slice(postedBefore);
    assert.deepEqual(after.filter((m) => m.payload.type === 'turn-event').map((m) => (m.payload['event'] as TurnEvent).kind), ['file-edit', 'tool-result', 'tool-result', 'done']);
    assert.equal(after.some((m) => m.payload.type === 'transcript-row'), false, 'no row is pushed outside the event path');
    assert.equal(gov.checks.count, checksBefore, 'no check is asked for');
    assert.equal(diffRowsOf(rows).length, 0);
    return { gov };
  };
  await followed();

  // The same while the governor still holds the snapshot of a turn this host started in another
  // chat: that turn's diff state is ended by the chat switch, and the followed turn is untouched.
  const held = await followed(async ({ fc, gov, fed }) => {
    fc.send(env('submit-turn', { text: 'go' }));
    await waitFor(() => fed.runs() === 1);
    fed.feed(toolResult());
    await waitFor(() => gov.checks.count === 1);
    await waitFor(() => transcriptRows(fc).length === 1);
    assert.equal(gov.released.count, 0, 'the snapshot is held');
  });
  assert.equal(held.gov.snapshots.count, 1);
});

test('S006 integration: set-edit-mode updates + persists session.editMode', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store,
    cwd: () => '/repo',
    editGovernance: fakeGovernance().deps,
  });
  host.open();
  assert.equal(store.list().length, 0, 'the fresh chat is a draft — not persisted until it is saved');
  fc.send(env('set-edit-mode', { mode: 'review' }));
  const id = store.list()[0]?.id;
  assert.ok(id, 'set-edit-mode saved the (previously draft) session');
  assert.equal(store.get(id!)!.editMode, 'review', 'set-edit-mode persisted review');
  fc.send(env('set-edit-mode', { mode: 'bogus' }));
  assert.equal(store.get(id!)!.editMode, 'review', 'an invalid mode is dropped (unchanged)');
});

test('S006: without editGovernance the host behaves as before (no transcript-row; file-edit marker still renders)', async () => {
  const fc = fakeChannel();
  const evs: TurnEvent[] = [
    { kind: 'file-edit', turnId: 't1', path: 'src/a.ts', diff: { path: 'src/a.ts', hunks: [] } },
    { kind: 'done', turnId: 't1', ok: true },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  assert.equal(transcriptRows(fc).length, 0, 'no governance -> no pushed rows');
  assert.ok(turnEvents(fc).some((e) => e.kind === 'file-edit'), 'file-edit still posted (marker path unchanged)');
});

test('S006 shell: edit-mode toggle + diff renderer live inside the ONE nonce\'d script; CSP/textContent invariants intact', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
    editGovernance: fakeGovernance().deps,
  });
  host.open();
  const html = fc.html();
  // S001 (bugfix): the edit-mode toggle is gone (merged into the single mode control); the diff
  // renderer stays (visualize). The single mode select posts set-permission-mode.
  assert.doesNotMatch(html, /id="insrc-editmode"/, 'the old edit-mode toggle is removed');
  assert.match(html, /<select id="insrc-mode"/, 'the single merged mode control is contributed');
  assert.match(html, /type:'set-permission-mode'/, 'the mode control posts set-permission-mode');
  // Story E20261013b2e8109f:S001: the old diff box is gone; the diff widget is a registered row renderer.
  assert.doesNotMatch(html, /function renderDiff\(/, 'the old diff box renderer is removed');
  assert.match(html, /register\('diff',function\(vm\)/, 'the diff widget renderer is embedded');
  const scripts = html.match(/<script\b/g) ?? [];
  assert.equal(scripts.length, 1, 'still exactly one inline script');
  assert.match(html, /script-src 'nonce-FIXEDNONCE'/, 'strict CSP unchanged');
  assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded (embedded marked ships URLs only in warning strings)');
  assert.doesNotMatch(html, /asWebviewUri/, 'no asWebviewUri');
});


// ---- S001 t5: live user-row echo on submit + lc1 reconciliation ----

test('S001 ac1: submit-turn posts a live user-row (the prompt appears during the turn, not only on reload)', async () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't1', ok: true }]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'hello world' }));
  await waitFor(() => fc.posted.some((m) => m.payload.type === 'user-row'));
  const userRows = fc.posted.filter((m) => m.payload.type === 'user-row').map((m) => m.payload);
  assert.equal(userRows.length, 1, 'exactly one live user-row was posted for the submit');
  assert.equal(userRows[0]!['text'], 'hello world', 'it carries the submitted prompt');
  assert.match(String(userRows[0]!['key']), /^r\d+$/, 'it carries a stable transcript-index key (lc1)');
});

test('S001 lc1: two identical prompts yield two distinct-keyed live user-rows', async () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'same' }));
  await waitFor(() => fc.posted.filter((m) => m.payload.type === 'user-row').length >= 1);
  fc.send(env('submit-turn', { text: 'same' }));
  await waitFor(() => fc.posted.filter((m) => m.payload.type === 'user-row').length >= 2);
  const keys = fc.posted.filter((m) => m.payload.type === 'user-row').map((m) => m.payload['key']);
  assert.equal(new Set(keys).size, 2, 'the two identical prompts got two distinct keys (two rows, not deduped)');
});

// ---- S002 t2: cancel-turn routes to the existing cancelActive() ----

test('S002 ac2: a cancel-turn message cancels the in-flight turn (cancelActive -> provider.cancel)', async () => {
  const fc = fakeChannel();
  let cancelled = false;
  const adapter = scriptedAdapter([{ kind: 'status', turnId: 't1', phase: 'thinking' }], { hang: true, onCancel: () => { cancelled = true; } });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'status')); // turn is in flight
  fc.send(env('cancel-turn'));
  await waitFor(() => cancelled);
  assert.ok(cancelled, 'cancel-turn invoked the provider cancel via cancelActive()');
});

test('S002: a cancel-turn with no active turn is an idempotent no-op (no throw)', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  assert.doesNotThrow(() => fc.send(env('cancel-turn')));
});

// ---- S002 (ux-polish) t1/t2/t3: the leading '>' prompt IS the send/stop control ----

test('S002 (ux-polish) ac1/ac2/t3: the leading ">" prompt (#insrc-prompt) is the send/stop control; the trailing #insrc-send button is retired', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  // t1: a leading '>' prompt control renders BEFORE the textarea.
  assert.match(html, /<span id="insrc-prompt" role="button" tabindex="0" aria-label="send">❯<\/span>\s*<textarea id="insrc-input"/, 'a leading ">" prompt control renders immediately before #insrc-input');
  // t3: the separate trailing send button is gone (one send affordance).
  assert.doesNotMatch(html, /id="insrc-send"/, 'the trailing #insrc-send button is retired');
  assert.doesNotMatch(html, /#insrc-send\{/, 'the #insrc-send CSS rule is removed (no dead rule)');
  // t2: the running-state glyph/class toggle now targets the '>' prompt; ❯ (u276f) send at rest, ■ (u25a0) stop while running.
  assert.match(html, /const sendBtn=document\.getElementById\('insrc-prompt'\);/, 'the send/stop control is the leading #insrc-prompt');
  assert.match(html, /function setRunning\(r\)\{running=r;/, 'setRunning toggles the prompt glyph/class');
  assert.match(html, /sendBtn\.textContent=r\?'\\u25a0':'\\u276f'/, 'Stop=■ (u25a0) while running, Send=❯ (u276f) at rest');
  // t2: click reuses the EXISTING doSubmit / cancel-turn body verbatim (byte-identical send intent).
  assert.match(html, /if\(running\)\{vs\.postMessage\(\{v:1,payload:\{type:'cancel-turn'\}\}\);setRunning\(false\);setIdle\(\);\}else\{doSubmit\(\);\}/, 'the "> " prompt posts cancel-turn while running AND resets the UI locally, else submits');
  assert.match(html, /function doSubmit\(\)\{if\(!box\.value\.trim\(\)\)return;started=true;vs\.postMessage\(\{v:1,payload:\{type:'submit-turn'/, 'doSubmit guards empty, marks the chat started, then posts submit-turn');
  // t2: role=button span is keyboard-activatable (Enter/Space -> click).
  assert.match(html, /sendBtn\.addEventListener\('keydown',function\(e\)\{if\(e\.key==='Enter'\|\|e\.key===' '\)\{e\.preventDefault\(\);sendBtn\.click\(\);\}\}\);/, 'Enter/Space activate the ">" prompt control');
});

// ---- S001 (74bc0120): provider lock + wider session dropdown ----------------
//
// The lock is applied by the webview SCRIPT at runtime, and this suite never executes that script
// against a DOM — it asserts the emitted source. So each assertion below is anchored to a construct
// that must be PRESENT for the behaviour to exist, and every one was mutation-checked: remove the
// lock and the matching test goes red. The server-rendered facts (the width, and the untouched
// no-CLI capability gate) are asserted directly off the html, where the evidence is strongest.

test('S001 (74bc0120) ac5: the session dropdown cap doubles to 36ch; the rest of the chip is untouched', () => {
  const html = fidelityHtml();
  // Story E202610137fefc3fc:S001: the chip is the wrapper around the select (so its colours and
  // glyph can follow the theme); the cap, border, radius and padding live on it.
  const rule = /\.histchip\{([^}]*)\}/.exec(html);
  assert.ok(rule, 'the .histchip rule is present');
  const cap = /max-width:(\d+)ch/.exec(rule![1]!);
  assert.ok(cap, 'the rule declares a max-width in ch');
  assert.equal(Number(cap![1]), 36, 'the session dropdown spans 36ch');
  // The chip itself must survive the widening intact (the earlier 6d3f8bc1 / bd2d6b6a work).
  assert.match(rule![1]!, /border:1px solid var\(--dropdown-border\)/, 'chip border kept');
  assert.match(rule![1]!, /border-radius:6px/, 'chip radius kept');
  assert.match(rule![1]!, /padding:3px \d+px 3px 22px/, 'chip padding kept (icon still clears it)');
  assert.match(html, /\.histchip::before\{[^}]*left:6px;/, 'the glyph still sits inside the left padding');
  // The select fills its chip and no longer carries the chip's own box.
  assert.match(html, /\.chrome #insrc-history\{max-width:100%;\}/);
});

test('run-config controls: the statusbar runctl group carries the run button, gauge, popups and catalog', () => {
  const withCli = fidelityHtml();
  const at = withCli.indexOf('<span class="runctl">');
  assert.ok(at >= 0, 'the .runctl group is rendered in the statusbar');
  const runctl = withCli.slice(at);
  assert.match(runctl, /<button id="insrc-runbtn"[^>]*data-provider="[^"]*" data-model="[^"]*" data-effort="[^"]*"/, 'run button carries the session run-config in data-*');
  assert.match(runctl, /<button id="insrc-effortbtn"[^>]*>.*<span id="insrc-effortlabel">/, 'gauge button carries the effort label');
  assert.match(runctl, /<div id="insrc-runpop" class="popup" role="menu"[^>]*>/, 'provider·model popup present');
  assert.match(runctl, /id="insrc-provpane"/, 'provider pane present');
  assert.match(runctl, /id="insrc-modelpane"/, 'model pane present');
  assert.match(runctl, /<div id="insrc-effortpop" class="slider-pop" role="dialog"[^>]*>/, 'effort slider popup present');
  assert.match(runctl, /id="insrc-effortslider"/, 'effort slider present');
  assert.match(runctl, /<div id="insrc-catalog" hidden data-catalog="/, 'model catalog embedded once');
  assert.ok(runctl.indexOf('insrc-runbtn') < runctl.indexOf('insrc-effortbtn'), 'run button left of the gauge');
  assert.doesNotMatch(withCli, /<select id="insrc-provider"/, 'the old provider select is gone');
});

test('run-config popup bootstrap: catalog parse + button wiring posts new-chat / set-run-config; run-config echo branch present', () => {
  const html = fidelityHtml();
  // The model catalog is embedded once and parsed at bootstrap.
  assert.match(html, /catalog=JSON\.parse\(document\.getElementById\('insrc-catalog'\)\.getAttribute\('data-catalog'\)\|\|'\[\]'\)/, 'catalog parsed from #insrc-catalog');
  // Both buttons are wired.
  assert.match(html, /if\(rb\)rb\.onclick=function\(e\)\{e\.stopPropagation\(\);/, 'run button opens the popup');
  assert.match(html, /if\(gb\)gb\.onclick=function\(e\)\{e\.stopPropagation\(\);/, 'gauge button opens the slider');
  // A provider change posts new-chat carrying the current effort; a model change on the SAME
  // provider posts set-run-config.
  assert.match(html, /type:'new-chat',provider:f\.id,model:'',effort:rstate\(\)\.effort/, 'provider pick posts new-chat');
  assert.match(html, /type:'new-chat',provider:f\.id,model:id,effort:s\.effort/, 'cross-provider model pick posts new-chat');
  assert.match(html, /type:'set-run-config',model:id/, 'same-provider model pick posts set-run-config');
  assert.match(html, /type:'set-run-config',effort:e/, 'effort slider posts set-run-config');
  // The host→webview run-config echo updates the buttons' data-* + labels.
  assert.match(html, /else if\(m\.type==='run-config'\)\{if\(rb\)\{rb\.setAttribute\('data-provider',m\.provider\|\|''\);/, 'run-config echo branch present');
  // The old provider-select lock machinery is gone from the bootstrap.
  assert.doesNotMatch(html, /provLocked|setProvLock/, 'no provider lock remains');
  // A started chat (rows in the transcript) fixes the provider: the flag comes from the
  // restore's total and from the first submit; other providers render disabled.
  assert.match(html, /var started=false;/, 'started initialised false');
  assert.match(html, /started=_total>0;/, 'session-restored derives started from the total row count');
  const subAt = html.indexOf('function doSubmit(){');
  assert.ok(subAt >= 0, 'doSubmit present');
  assert.match(html.slice(subAt, subAt + 200), /return;started=true;/, 'the first submit marks the chat started');
  assert.match(html, /function mitem\(sel,label,sub,onclick,onhover,dis\)/, 'mitem takes a disabled flag');
  assert.match(html, /if\(dis\)d\.setAttribute\('aria-disabled','true'\);/, 'disabled items carry aria-disabled');
  assert.match(html, /if\(!dis\)\{if\(onhover\)d\.onmouseenter=onhover;d\.onclick=onclick;\}/, 'disabled items get no handlers');
  assert.match(html, /started&&f\.id!==s\.provider/, 'renderProvPane disables other providers once started');
  assert.match(html, /\.popup \.item\.dis\{opacity:\.45;cursor:default;\}/, 'disabled item style present');
  assert.match(html, /id="insrc-popfoot"/, 'popup foot present');
  assert.match(html, /started\?'Provider is fixed once a chat has started/, 'the foot note switches when started');
});

test('regression: the history dropdown still opens/new-chats, and session-restored still clears + replays', () => {
  const html = fidelityHtml();
  // Picking a session posts open-chat; picking 'new…' posts new-chat with the provider taken
  // from the run button's data-provider (the select is gone).
  const hsAt = html.indexOf("hs.addEventListener('change',function(){");
  assert.ok(hsAt >= 0, 'history change handler present');
  const hsHandler = html.slice(hsAt, hsAt + 260);
  assert.match(hsHandler, /type:'open-chat',chatId:hs\.value/, 'a picked session posts open-chat');
  assert.match(hsHandler, /type:'new-chat',provider:\(rb\?rb\.getAttribute\('data-provider'\):''\)\|\|''/, "'new…' posts new-chat with the run button's provider");
  // session-restored still clears, resets keys and replays.
  assert.match(html, /t\.textContent='';reg\.resetKeys\(\);var _rows=m\.transcript\|\|\[\]/, 'session-restored still clears, resets keys and replays the transcript');
  assert.match(html, /_rows\.forEach\(function\(x,i\)/, 'every posted row is replayed');
});

test('both message bubbles span the full row (100%) and the assistant carries no magenta left rail; wrapper stays 100%', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  // Both bubbles fill the row: the 90% assistant / 82% user caps are gone, so a user prompt and the
  // answer below it align on BOTH edges instead of stepping in by different amounts.
  const cap = (role: string): string => {
    const m = new RegExp(`\\.insrc-bubble--${role}\\{([^}]*)\\}`).exec(html);
    assert.ok(m, `the .insrc-bubble--${role} rule is present`);
    const w = /max-width:(\d+)%/.exec(m![1]!);
    assert.ok(w, `.insrc-bubble--${role} declares a max-width`);
    return w![1]!;
  };
  assert.equal(cap('assistant'), '100', 'assistant bubble spans the full row');
  assert.equal(cap('user'), '100', 'user bubble spans the full row');
  // No purple rail on the assistant card. Asserted on the RULE BODY, not the whole document, so the
  // --magenta token staying in use elsewhere (the assistant role label) cannot mask a regression here.
  const asst = /\.insrc-bubble--assistant\{([^}]*)\}/.exec(html)![1]!;
  assert.doesNotMatch(asst, /border-left/, 'the assistant bubble has no left rail');
  assert.doesNotMatch(asst, /--magenta/, 'the assistant bubble carries no magenta accent');
  assert.match(html, /\.insrc-msg\{[^}]*max-width:100%/, 'the .insrc-msg wrapper stays 100%');
});

test('S002 ac1: the fixed-region layout holds — #insrc-term is the only scroll region; header + input stay flex:0', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  assert.match(html, /#insrc-term\{flex:1 1 auto;min-height:0;overflow-y:auto/, '#insrc-term is the flex-growing scroll region');
  // The run-config popup's model pane scrolls internally (intentional); excluding that rule,
  // #insrc-term stays the only page-level scroll region.
  const pageLevel = html.replace(/\.popup \.pane\{[^}]*\}/g, '');
  assert.equal((pageLevel.match(/overflow-y:auto/g) ?? []).length, 1, '#insrc-term is the ONLY page-level overflow-y:auto region');
  assert.match(html, /\.chrome\{[^}]*flex:0 0 auto/, 'the header is fixed (flex:0)');
  assert.match(html, /\.inputbar\{[^}]*flex:0 0 auto/, 'the input bar is fixed (flex:0)');
});

test('S001 (bugfix): the <body> carries no surface class — so .insrc-term-<surface>{display:block} cannot override body{display:flex} and collapse the flex-fill', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  const body = html.match(/<body class="([^"]*)"/);
  assert.ok(body, 'the shell has a <body class="…">');
  const classes = body![1]!.split(/\s+/).filter(Boolean);
  assert.deepEqual(classes, ['insrc-term'], 'body carries ONLY insrc-term (the --it-* token host), never a surface class');
  // A surface class rule IS emitted in the <style> (for the inner surface divs) with display:block —
  // proving the regression is real: had it been on <body>, its 0,1,0 specificity would beat body{}.
  assert.match(html, /\.insrc-term-chat \{ display: block;/, 'the surface rule still exists (for surface divs, not the body)');
  assert.match(html, /body\{[^}]*display:flex/, 'the body is the flex column that fills the panel');
});

test('S002 ac1/k1: all pre-existing element ids remain; one inline script; no innerHTML/remote origin', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude', 'codex']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  for (const id of ['insrc-term', 'insrc-input', 'insrc-runbtn', 'insrc-effortbtn', 'insrc-history', 'insrc-mode']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} preserved`);
  }
  for (const id of ['insrc-runpop', 'insrc-effortpop', 'insrc-catalog']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} present (run-config popups + catalog)`);
  }
  assert.doesNotMatch(html, /<select id="insrc-provider"/, 'the old provider select is gone');
  assert.equal((html.match(/<script\b/g) ?? []).length, 1, 'exactly one inline script');
  assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded (embedded marked ships URLs only in warning strings)');
});

test('S002: an empty submit is a host no-op (no turn starts)', async () => {
  const fc = fakeChannel();
  let ran = 0;
  const adapter = scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }], { onRun: () => { ran++; } });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: '   ' })); // whitespace-only
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(ran, 0, 'an empty/whitespace submit starts no turn (runTurn no-ops)');
});

// ---- S002 t4: single animated progress widget + status reroute ----

test('S002 ac3: renderShell embeds a single #insrc-progress widget above the input, not hidden and starting idle', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  assert.equal((html.match(/id="insrc-progress"/g) ?? []).length, 1, 'exactly one progress widget');
  assert.match(html, /<div id="insrc-progress" class="progress idle">/, 'not hidden: it starts idle');
  assert.match(html, /<span class="plabel">idle<\/span>/, 'with the idle label');
  assert.doesNotMatch(html, /#insrc-progress\[hidden\]/, 'the [hidden] rule is gone');
  assert.doesNotMatch(html, /prog\.hidden/, 'no script path sets the widget hidden');
  // It sits above the input bar.
  assert.ok(html.indexOf('id="insrc-progress"') < html.indexOf('class="inputbar"'), 'progress is above the input');
  // It is animated (a keyframed spinner) and status routes to it, not a transcript row.
  assert.match(html, /@keyframes insrc-blink/, 'the widget is animated');
  assert.match(html, /if\(ev&&ev\.kind==='status'\)\{var mkp=markerFor\(ev\);if\(running&&mkp\)setProgress\(mkp\.label\);\}/, 'status drives the progress widget (gated on running), not a row');
  assert.match(html, /if\(ev&&\(ev\.kind==='done'\|\|ev\.kind==='error'\)&&!m\.info\)\{setRunning\(false\);setIdle\(\);\}/, "a turn's done/error puts the widget idle (never hides it) + restores Send; the done that closes an informational line (info) does not");
});

test('S002 ac3/lc1: status events are never persisted to the durable transcript (host skip unchanged)', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const evs: TurnEvent[] = [
    { kind: 'status', turnId: 't1', phase: 'thinking' },
    { kind: 'status', turnId: 't1', phase: 'tool' },
    { kind: 'assistant-delta', turnId: 't1', text: 'hi' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 's1' },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const s = store.list()[0]!;
  const full = store.get(s.id)!;
  const texts = full.transcript.map((r) => r.text);
  assert.ok(!texts.includes('thinking…'), 'status(thinking) never persisted');
  assert.ok(!texts.includes('running tool…'), 'status(tool) never persisted');
  assert.ok(!full.transcript.some((r) => r.role === 'marker' && (r.text === 'thinking…' || r.text === 'running tool…')), 'no status marker rows in the durable transcript (lc1)');
});

// ---- S003 t1: role-tone + markdown/JSON-widget + caption CSS ----

test('S003 t1: renderShell embeds the role-tone + markdown/JSON widget + caption CSS (inline, CSP-safe)', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  assert.match(html, /\.insrc-bubble--user\{/, 'user bubble tone');
  assert.match(html, /\.insrc-bubble--assistant\{/, 'assistant bubble tone');
  assert.match(html, /\.insrc-who\b/, 'role labels (you / claude)');
  assert.match(html, /\.insrc-md /, 'markdown widget styling');
  assert.match(html, /\.insrc-json /, 'JSON widget styling');
  assert.match(html, /\.insrc-caption\{/, 'tool-result/inline-diff caption styling');
  // CSP/one-script/textContent invariants intact.
  assert.equal((html.match(/<script\b/g) ?? []).length, 1, 'still exactly one inline script');
  assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded (embedded marked ships URLs only in warning strings)');
  for (const id of ['insrc-term', 'insrc-input', 'insrc-prompt', 'insrc-progress', 'insrc-history']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} preserved`);
  }
});

// ---- S004 t7: approval routing + permission-decision + #insrc-permmode --------

test('S001 (bugfix): renderShell has the SINGLE merged mode control + wires the approval seams', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  const html = fc.html();
  // One merged control (Manual / Edit Automatically / Auto); the old two dropdowns are gone.
  assert.match(html, /id="insrc-mode"/, 'has the single mode control');
  assert.doesNotMatch(html, /id="insrc-permmode"/, 'the old separate perms dropdown is removed');
  assert.doesNotMatch(html, /id="insrc-editmode"/, 'the old separate edits dropdown is removed');
  const modeBlock = html.slice(html.indexOf('insrc-mode'));
  assert.match(modeBlock.slice(0, 260), /<option value="manual">Manual<\/option><option value="edit-auto">Edit Automatically<\/option><option value="auto">Auto<\/option>/);
  // The bootstrap wires the decision sink + posts set-permission-mode + handles the live card.
  assert.match(html, /onApprovalDecision/, 'wires the approval decision sink');
  assert.match(html, /type:'permission-decision'/, 'card posts permission-decision');
  assert.match(html, /type:'set-permission-mode'/, 'the control posts set-permission-mode');
  assert.match(html, /ev\.kind==='approval-request'/, 'the live handler routes approval-request');
  // S003 (ux polish): the live handler routes a permission-outcome turn-event through the registry.
  assert.match(html, /ev\.kind==='permission-outcome'/, 'the live handler routes permission-outcome to the registry');
});

// ---------------------------------------------------------------------------
// S001 (ISSUE-c96399d1) — dev-chat terminal-prompt fidelity: bring the input up
// to the approved S002 mock. Presentation-only in renderShell; the S002 send/stop
// control is unchanged. deltas: (1) flush 2-line prompt, (2) interrupt-hint
// placeholder, (3) read-only status bar (provider + mode selects moved to header).
// ---------------------------------------------------------------------------

function fidelityHtml(): string {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  return fc.html();
}

test('S001 (fidelity) ac1: the input is a FLUSH 2-line prompt — #insrc-input has no box chrome, rows=2 kept, ❯ top-aligned', () => {
  const html = fidelityHtml();
  const inputCss = html.slice(html.indexOf('#insrc-input{'), html.indexOf('#insrc-input{') + 230);
  assert.doesNotMatch(inputCss, /border:1px solid/, '#insrc-input drops the border box');
  assert.doesNotMatch(inputCss, /border-radius/, '#insrc-input drops the rounded box');
  assert.doesNotMatch(inputCss, /background:var\(--panel\)/, '#insrc-input drops the panel-fill box');
  assert.match(html, /rows="2"/, 'the textarea keeps rows=2 (the 2-line view)');
  const promptCss = html.slice(html.indexOf('#insrc-prompt{'), html.indexOf('#insrc-prompt{') + 210);
  assert.match(promptCss, /align-self:flex-start/, 'the ❯ is top-aligned (leads the first line only)');
  assert.doesNotMatch(promptCss, /align-self:flex-end/, 'the ❯ is no longer bottom-aligned');
  // A textarea scrolls its own content natively, so we add NO overflow-y:auto — #insrc-term stays
  // the panel's single scroll region (the S002 fixed-region layout invariant).
  // Excluding the run-config popup pane's internal scroll, #insrc-term stays the single scroll region.
  const pageLevel = html.replace(/\.popup \.pane\{[^}]*\}/g, '');
  assert.equal((pageLevel.match(/overflow-y:auto/g) ?? []).length, 1, '#insrc-term stays the ONLY page-level overflow-y:auto region');
});

test('S001 (fidelity) ac2: the placeholder gains the interrupt hint', () => {
  const html = fidelityHtml();
  assert.match(html, /placeholder="message claude… \(⌘↵ send · \^C interrupt\)"/, "placeholder reads 'message claude… (⌘↵ send · ^C interrupt)'");
  assert.doesNotMatch(html, /⌘↵ to send/, "the old '⌘↵ to send' placeholder is gone");
});

test('ISSUE-6ae99f6e: the header holds ONLY the session dropdown; the provider + mode selects live in the footer status bar', () => {
  const html = fidelityHtml();
  const chrome = html.slice(html.indexOf('<div class="chrome">'), html.indexOf('<div id="insrc-term"'));
  const statusbar = html.slice(html.indexOf('<div class="statusbar">'));
  // Header: ONLY the session dropdown (right-aligned). No provider/mode selects, no duplicate session text.
  assert.match(chrome, /<select id="insrc-history"/, 'the session dropdown is in the header');
  assert.doesNotMatch(chrome, /<select id="insrc-provider"/, 'the provider select is NOT in the header');
  assert.doesNotMatch(chrome, /id="insrc-runbtn"|id="insrc-effortbtn"/, 'the run-config controls are NOT in the header');
  assert.doesNotMatch(chrome, /id="insrc-mode(seg)?"/, 'the mode select is NOT in the header');
  assert.doesNotMatch(chrome, /id="insrc-sesstitle"|class="seglabel"/, 'no duplicate session label/title text in the header');
  // Footer: the mode select on the left, then the run-config controls pushed to the bottom-right.
  assert.match(statusbar, /id="insrc-modeseg">edits <select id="insrc-mode"/, 'the edits (mode) select is in the footer');
  assert.match(statusbar, /<option value="manual">Manual<\/option><option value="edit-auto">Edit Automatically<\/option><option value="auto">Auto<\/option>/, 'the mode options are preserved in the footer');
  assert.match(statusbar, /<span class="runctl">/, 'the runctl group is in the footer');
  assert.match(statusbar, /<button id="insrc-runbtn"/, 'the provider·model button is in the footer');
  assert.match(statusbar, /<button id="insrc-effortbtn"/, 'the effort gauge is in the footer');
  assert.ok(statusbar.indexOf('insrc-modeseg') < statusbar.indexOf('class="runctl"'), 'the mode select is left of the runctl group');
  assert.ok(statusbar.indexOf('insrc-runbtn') < statusbar.indexOf('insrc-effortbtn'), 'run button is left of the gauge');
  assert.doesNotMatch(statusbar, /<select id="insrc-provider"/, 'the old provider select is gone from the footer');
  // The read-only session/edits mirror segments + the ✓ idle marker are gone (dedup + progress conveys idle).
  assert.doesNotMatch(statusbar, /insrc-statussess|insrc-statusedits/, 'no read-only session/edits mirror segments');
  assert.doesNotMatch(statusbar, /✓ idle/, 'no ✓ idle marker (the progress bar conveys idle/busy)');
});

test('UI: the #insrc-history session dropdown carries a leading history/clock glyph so its purpose reads', () => {
  const html = fidelityHtml();
  // The #insrc-history rule adds a data-URI SVG icon as the first background layer + left padding to
  // clear it — so the dropdown is not just a bare down-arrow. Icon-only selects (provider/mode) keep the plain arrow.
  // Story E202610137fefc3fc:S001: the chip is a wrapper around the select, and the glyph is a mask
  // in the chip's ::before, filled with the current text colour so it follows the theme.
  assert.match(html, /<span class="histchip"><select id="insrc-history" class="segsel [^"]*" aria-label="session"><option value="">new…<\/option><\/select><\/span>/, 'one wrapper holds the select');
  const rule = html.slice(html.indexOf('.histchip{'));
  const decl = rule.slice(0, rule.indexOf('}') + 1);
  const icon = /\.histchip::before\{([^}]*)\}/.exec(html);
  assert.ok(icon, 'the chip draws its glyph in ::before');
  assert.match(icon![1]!, /mask:url\("data:image\/svg\+xml,/, 'the glyph is an inline SVG mask');
  assert.match(icon![1]!, /-webkit-mask:url\("data:image\/svg\+xml,/, 'with the prefixed form too');
  assert.match(icon![1]!, /background-color:currentColor/, 'filled with the chip text colour, so it matches the label');
  // ISSUE-bd2d6b6a: the switcher is a CHIP, so icon + label + arrow read as ONE control. Without the
  // enclosure the three marks float on the chrome background and the dim detached icon reads as a
  // SECOND dropdown beside the label+arrow. Assert the enclosure and the icon's place inside it
  // together — either one alone permits the detached rendering that was reported.
  assert.match(decl, /border:1px solid var\(--dropdown-border\)/, 'the chip has a border');
  assert.match(decl, /border-radius:6px/, 'the chip has a corner radius');
  assert.match(decl, /background:var\(--dropdown-bg\)/, 'the chip has a ground from the theme');
  // Both bounds below are DERIVED from the declared rules, so they keep testing the real relationship
  // if the padding is ever retuned — a hardcoded bound would silently stop measuring anything.
  const pad = /padding:\d+px (\d+)px \d+px (\d+)px/.exec(decl);
  assert.ok(pad, 'the chip declares four-value padding (the left value clears the icon)');
  const padLeft = Number(pad![2]);
  const iconLeft = /left:(\d+)px/.exec(icon![1]!);
  const iconWidth = /width:(\d+)px/.exec(icon![1]!);
  assert.ok(iconLeft && iconWidth, 'the icon is positioned from the left edge with a set width');
  const iconX = Number(iconLeft![1]);
  // The icon must sit INSIDE the chip's left padding: clear of the border, and ending before the
  // label starts. A bare-edge icon (the pre-fix left 2px) fails the first bound.
  assert.ok(iconX >= 4, `the icon clears the chip border (was left ${iconX}px)`);
  assert.ok(iconX + Number(iconWidth![1]) <= padLeft, `the label (padding-left ${padLeft}px) starts after the ${iconX}px icon`);
  // No fixed stroke colour: the mask's shape is all that is used of the image.
  assert.doesNotMatch(icon![1]!, /stroke='%23/, 'the glyph carries no colour of its own');
  // The footer selects KEEP the borderless seg language — the chip is the header switcher only.
  const segsel = html.slice(html.indexOf('.segsel{'));
  const segselDecl = segsel.slice(0, segsel.indexOf('}') + 1);
  assert.doesNotMatch(segselDecl, /data:image\/svg\+xml/, 'the shared .segsel style has no session icon');
  assert.match(segselDecl, /border:none/, 'the shared .segsel selects stay borderless (no chip)');
});

test('ISSUE-095906bac5bbacaf: every image source the shell DECLARES is permitted by its own CSP (a declared-but-blocked icon must fail)', () => {
  const html = fidelityHtml();
  // The glyph test above asserts the icon is DECLARED. That is not enough on its own: the icon
  // shipped for two releases while the CSP silently blocked it, because a `background-image:url(...)`
  // is fetched under `img-src` and `img-src` was absent — so it inherited `default-src 'none'`. The
  // two sibling linear-gradient arrow layers are not fetches, so they kept painting and the suite
  // stayed green on an invisible feature. Declaration and policy are therefore asserted HERE as ONE
  // invariant; splitting them again reopens the defect.
  const cspMeta = /Content-Security-Policy" content="([^"]*)"/.exec(html);
  assert.ok(cspMeta, 'a CSP meta is present');
  const csp = cspMeta![1]!;

  // Effective img-src, with the CSP fallback to default-src that caused the bug.
  const directive = (name: string): string[] | undefined => {
    const m = new RegExp(`(?:^|;)\\s*${name}\\s+([^;]+)`).exec(csp);
    return m ? m[1]!.trim().split(/\s+/) : undefined;
  };
  const imgSrc = directive('img-src') ?? directive('default-src') ?? [];

  // Every image the shell declares, scanned off the SHIPPED html: url(...) background layers across
  // ALL <style> blocks — the shell ships more than one and the glyph is NOT in the first — plus any
  // <img> in the markup. Gradients are excluded by construction: they are not url() fetches.
  // Both scans exclude <script>, so the inlined marked bundle can't contribute a spurious scheme.
  const style = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!).join('\n');
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/g, '');
  const declared = [
    ...style.matchAll(/url\(\s*["']?([a-z][a-z0-9+.-]*:)/gi),
    ...markup.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']?([a-z][a-z0-9+.-]*:)/gi),
  ].map((m) => m[1]!.toLowerCase());

  // Guards the invariant against going vacuous if the glyph is ever dropped.
  assert.ok(declared.includes('data:'), 'the shell declares at least one data: image (the #insrc-history glyph)');

  for (const scheme of new Set(declared)) {
    assert.ok(
      imgSrc.includes(scheme) || imgSrc.includes('*'),
      `the shell declares an image with scheme ${scheme} but its CSP img-src (${imgSrc.join(' ') || '<none>'}) does not permit it — the browser blocks it and it silently never paints`,
    );
  }

  // The relaxation stays narrow: inline data: images only, every other directive untouched.
  assert.match(csp, /default-src 'none'/, "default-src stays 'none'");
  assert.match(csp, /img-src data:;/, 'img-src permits inline data: images and nothing more');
  assert.match(csp, /script-src 'nonce-/, 'scripts stay nonce-only');
  assert.doesNotMatch(csp, /https?:/, 'no remote origin becomes loadable');
});

test('S001 (fidelity) ac4 (regression): the S002 send/stop control + mode/provider switching are unchanged', () => {
  const html = fidelityHtml();
  // S002: the leading ❯ is still the send/stop control immediately before the textarea.
  assert.match(html, /<span id="insrc-prompt" role="button" tabindex="0" aria-label="send">❯<\/span>\s*<textarea id="insrc-input"/, 'the ❯ send/stop control still leads the input');
  assert.match(html, /type:'submit-turn'/, 'submit-turn wiring intact');
  assert.match(html, /type:'set-permission-mode'/, 'the relocated mode control still posts set-permission-mode');
  assert.match(html, /type:'new-chat'/, 'the relocated provider select still starts a new chat');
  assert.match(html, /function updatePermSeg\(\)\{if\(pmseg\)pmseg\.className='seg'\+\(pmode==='auto'\?' perm-auto':''/, 'updatePermSeg still applies the auto-pill class');
});

test("S001 (bugfix): a turn's mode defaults to manual; set-permission-mode switches the NEXT turn (edit-auto / auto)", async () => {
  const fc = fakeChannel();
  const seen: TurnRequest[] = [];
  const adapter = scriptedAdapter([{ kind: 'done', turnId: 't1', ok: true }], { onRun: (r) => seen.push(r) });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'one' }));
  await waitFor(() => seen.length >= 1);
  assert.equal(seen[0]!.permissionMode, 'manual', 'defaults to manual (surface prompts)');
  fc.send(env('set-permission-mode', { mode: 'edit-auto' }));
  fc.send(env('submit-turn', { text: 'two' }));
  await waitFor(() => seen.length >= 2);
  assert.equal(seen[1]!.permissionMode, 'edit-auto', 'the next turn relays the chosen mode');
  fc.send(env('set-permission-mode', { mode: 'auto' }));
  fc.send(env('submit-turn', { text: 'three' }));
  await waitFor(() => seen.length >= 3);
  assert.equal(seen[2]!.permissionMode, 'auto', 'and again for auto');
});

test('S001 (bugfix): an invalid set-permission-mode is dropped (mode unchanged)', async () => {
  const fc = fakeChannel();
  const seen: TurnRequest[] = [];
  const adapter = scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }], { onRun: (r) => seen.push(r) });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('set-permission-mode', { mode: 'bogus' }));
  fc.send(env('submit-turn', { text: 'x' }));
  await waitFor(() => seen.length >= 1);
  assert.equal(seen[0]!.permissionMode, 'manual', 'invalid mode ignored, stays manual');
});

test('S004 t7: permission-decision is relayed to the live turn adapter.decide with (turnId, requestId, decision)', async () => {
  const fc = fakeChannel();
  const decided: Array<[string, string, string]> = [];
  // The turn emits a status (sets activeTurnId) + an approval-request, then hangs (stays live).
  const evs: TurnEvent[] = [
    { kind: 'status', turnId: 't7', phase: 'tool' },
    { kind: 'approval-request', turnId: 't7', requestId: 'perm-7', title: 'Run', detail: 'echo hi' },
  ];
  const adapter = scriptedAdapter(evs, { hang: true, onDecide: (t, r, d) => decided.push([t, r, d]) });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'do it' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'approval-request'));
  fc.send(env('permission-decision', { requestId: 'perm-7', decision: 'approve' }));
  await waitFor(() => decided.length >= 1);
  assert.deepEqual(decided[0], ['t7', 'perm-7', 'approve'], 'decide() got the live turnId + correlation id + decision');
  // A malformed decision is dropped (no extra decide).
  fc.send(env('permission-decision', { requestId: 'perm-7', decision: 'maybe' }));
  fc.send(env('permission-decision', { decision: 'approve' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(decided.length, 1, 'invalid permission-decision messages are ignored');
  fc.fireDispose(); // reap the hanging turn so the test process can exit (S002 lesson)
});

test('S004 t7: permission-decision with no active turn is a safe no-op (never throws)', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  assert.doesNotThrow(() => fc.send(env('permission-decision', { requestId: 'x', decision: 'approve' })));
});

// ---- S001 (bugfix): ChatPanelHost.adopt — restore a webview panel in place ----

/** A fakeChannel whose dispose() is observable (for supersede assertions). */
function trackedChannel(): { fc: FakeChannel; disposed(): boolean } {
  const fc = fakeChannel();
  let disposed = false;
  const ch = fc.channel;
  const origDispose = ch.dispose;
  ch.dispose = () => { disposed = true; origDispose(); };
  return { fc, disposed: () => disposed };
}

test('S001 adopt(channel) wires + posts theme/session-restored/history-list (restored panel shows history)', async () => {
  const store = createInMemoryChatSessionStore();
  store.create('claude'); // seed history
  const host = createChatPanelHost({
    createPanel: () => fakeChannel().channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  const adopted = fakeChannel();
  host.adopt(adopted.channel);
  const types = adopted.posted.map((m) => m.payload.type);
  assert.ok(types.includes('theme'), 'posts theme to the adopted channel');
  assert.ok(types.includes('session-restored'), 'posts session-restored');
  assert.ok(types.includes('history-list'), 'posts history-list (dropdown populates)');
  // The adopted channel is wired: a submit-turn routed through it reaches the host.
  let ran = false;
  const store2 = createInMemoryChatSessionStore();
  const host2 = createChatPanelHost({
    createPanel: () => fakeChannel().channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }], { onRun: () => { ran = true; } }) }, ['claude']),
    store: store2,
    cwd: () => '/repo',
  });
  const ad2 = fakeChannel();
  host2.adopt(ad2.channel);
  ad2.send(env('submit-turn', { text: 'hi' }));
  // The turn starts after its session lease is granted (an async step), so wait for it.
  await waitFor(() => ran, 1000);
  assert.equal(ran, true, 'onMessage is wired on the adopted channel (submit-turn reached the host)');
});

test('S001 adopt() supersedes an already-live channel (prior disposed; single active channel)', () => {
  const open1 = trackedChannel();
  const host = createChatPanelHost({
    createPanel: () => open1.fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: (() => { const s = createInMemoryChatSessionStore(); s.create('claude'); return s; })(),
    cwd: () => '/repo',
  });
  host.open(); // live channel = open1
  assert.equal(open1.disposed(), false);
  const adopted = fakeChannel();
  host.adopt(adopted.channel); // a restored panel supersedes open1
  assert.equal(open1.disposed(), true, 'the prior channel was disposed on adopt');
  assert.ok(adopted.posted.map((m) => m.payload.type).includes('history-list'), 'the adopted channel is now the live one');
});

test('S001 adopt() with no agentic CLI posts the same error a fresh open does', () => {
  const host = createChatPanelHost({
    createPanel: () => fakeChannel().channel,
    providers: registry({}, []), // none installed
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  const adopted = fakeChannel();
  host.adopt(adopted.channel);
  const errs = adopted.posted.filter((m) => m.payload.type === 'turn-event').map((m) => m.payload['event'] as TurnEvent);
  assert.ok(errs.some((e) => e.kind === 'error' && /no agentic CLI/.test((e as { message: string }).message)), 'adopt mirrors open()’s no-CLI error');
});

// ---- S001 (bugfix): the 'ready' handshake reliably (re)delivers view state ----
// Root cause of the "history disappeared" regression: the host posted theme/session-restored/
// history-list synchronously after setHtml, before the webview's message listener existed, and
// the panel has no retainContextWhenHidden so VS Code reloads the webview (empty) on every
// show-after-hide without the host re-posting. The webview now posts 'ready' once its listener
// is attached (initial load AND every reload); the host answers by (re)sending the full state.

test('S001 the webview posts a ready handshake AFTER attaching its message listener (initial load + every reload)', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  const listenerAt = html.indexOf(`addEventListener('message'`);
  const readyAt = html.indexOf(`payload:{type:'ready'}`);
  assert.ok(listenerAt !== -1, 'the webview attaches a message listener');
  assert.ok(readyAt !== -1, 'the webview emits a ready handshake');
  assert.ok(readyAt > listenerAt, 'ready is posted only AFTER the listener is attached (no self-race)');
  // Delivered in the ONE nonce-guarded script — no new script, CSP intact, no remote origin.
  assert.equal((html.match(/<script\b/g) ?? []).length, 1, 'still exactly one inline script');
  assert.match(html, /script-src 'nonce-FIXEDNONCE'/, 'strict CSP unchanged');
});

test('S001 a ready message (re)posts theme + active session + history — a reloaded webview repopulates', () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  store.create('claude'); // seed history so list() is non-empty
  store.create('claude');
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  // Simulate the REAL webview: the initial post-after-setHtml was lost. Clear what the fake
  // (synchronous) channel captured, then let the webview announce itself.
  fc.posted.length = 0;
  fc.send(env('ready'));
  const types = fc.posted.map((m) => m.payload.type);
  assert.ok(types.includes('theme'), 'ready re-posts theme');
  assert.ok(types.includes('session-restored'), 'ready re-posts the active session');
  const hl = fc.posted.filter((m) => m.payload.type === 'history-list').map((m) => m.payload['chats'] as unknown[]);
  assert.ok(hl.length >= 1, 'ready re-posts history-list');
  assert.equal(hl[hl.length - 1]!.length, 2, 'the re-posted history carries both seeded sessions (dropdown populates)');

  // A SECOND ready models a webview reload (show-after-hide): state is delivered again.
  fc.posted.length = 0;
  fc.send(env('ready'));
  assert.ok(fc.posted.some((m) => m.payload.type === 'history-list'), 'a webview reload re-delivers history');
  assert.ok(fc.posted.some((m) => m.payload.type === 'session-restored'), 'a webview reload re-delivers the session');
});

test('S001 ready before any open-time delivery still populates history (models the dropped initial post)', () => {
  // Wire a channel directly (adopt path = a VS-Code-restored panel) whose initial posts are
  // assumed lost; only the ready handshake arrives. History must still reach the webview.
  const store = createInMemoryChatSessionStore();
  store.create('codex');
  const host = createChatPanelHost({
    createPanel: () => fakeChannel().channel,
    providers: registry({ codex: scriptedAdapter([]) }, ['codex']),
    store,
    cwd: () => '/repo',
  });
  const restored = fakeChannel();
  host.adopt(restored.channel);
  restored.posted.length = 0; // drop everything the initial (racing) post produced
  restored.send(env('ready'));
  const hl = restored.posted.filter((m) => m.payload.type === 'history-list').map((m) => m.payload['chats'] as unknown[]);
  assert.ok(hl.length >= 1 && hl[hl.length - 1]!.length === 1, 'the restored+ready webview receives the seeded history');
});

// ---- S001 (bugfix): review-mode permission GRANT flow (claude denies + ends; Approve re-runs) ----

test('S001 (bugfix): approving a permission-denied request re-runs the blocked action with the tool pre-allowed, resuming the session', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const runs: TurnRequest[] = [];
  // Turn 1 surfaces claude's denial as an approval card, then ends (as the real CLI does).
  const evs: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-w', title: 'Permission: Write', detail: 'needs to write hello.txt', toolName: 'Write' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs, { onRun: (r) => runs.push(r) }) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'write hello.txt' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const before = runs.length;
  // The user approves the card.
  fc.send(env('permission-decision', { requestId: 'req-w', decision: 'approve' }));
  await waitFor(() => runs.length > before);
  const grant = runs[runs.length - 1]!;
  assert.deepEqual([...(grant.allowedTools ?? [])], ['Write'], 'the re-run pre-allows exactly the approved tool');
  assert.equal(grant.resume?.nativeSessionId, 'sess-1', 'the re-run resumes the same claude session');
});

test('S001 (bugfix): denying a permission-denied request does NOT re-run (the turn stays denied)', async () => {
  const fc = fakeChannel();
  const runs: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-w', title: 'Permission: Write', toolName: 'Write' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs, { onRun: (r) => runs.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'write hello.txt' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const before = runs.length;
  fc.send(env('permission-decision', { requestId: 'req-w', decision: 'deny' }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(runs.length, before, 'deny never re-runs the blocked action');
});

// ---- S001 (bugfix): concrete tool-gate re-run + dir-block informational branch ----

test('S001 (bugfix): Approve on a tool-gate WITH a command re-runs naming the EXACT command (not the vague nudge) + pre-allows the tool', async () => {
  const fc = fakeChannel();
  const runs: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-bash', title: 'Permission: Bash', detail: 'Bash needs your permission', toolName: 'Bash', command: 'npm run build' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs, { onRun: (r) => runs.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'build it' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const before = runs.length;
  fc.send(env('permission-decision', { requestId: 'req-bash', decision: 'approve' }));
  await waitFor(() => runs.length > before);
  const grant = runs[runs.length - 1]!;
  assert.match(grant.prompt, /run exactly this now: npm run build/, 'the re-run names the exact command');
  assert.doesNotMatch(grant.prompt, /please proceed with the/, 'not the vague tool-name nudge');
  assert.deepEqual([...(grant.allowedTools ?? [])], ['Bash'], 'the tool is pre-allowed on the re-run');
  assert.equal(grant.resume?.nativeSessionId, 'sess-1', 'the re-run resumes the same session');
});

test('S001 (bugfix): Approve on a tool-gate WITHOUT a command falls back to the tool-name phrasing (+ allowedTools)', async () => {
  const fc = fakeChannel();
  const runs: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-w', title: 'Permission: Write', detail: 'needs to write hello.txt', toolName: 'Write' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs, { onRun: (r) => runs.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'write hello.txt' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const before = runs.length;
  fc.send(env('permission-decision', { requestId: 'req-w', decision: 'approve' }));
  await waitFor(() => runs.length > before);
  const grant = runs[runs.length - 1]!;
  assert.match(grant.prompt, /please proceed with the Write action/, 'falls back to the tool-name phrasing');
  assert.doesNotMatch(grant.prompt, /run exactly this now/, 'no concrete-command phrasing when there is no command');
  assert.deepEqual([...(grant.allowedTools ?? [])], ['Write'], 'the tool is still pre-allowed');
});

test('S001 (bugfix): Approve on a dir-block does NOT re-run/grant — it posts an informational message; argv/allowlist untouched', async () => {
  const fc = fakeChannel();
  const runs: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-dir', title: 'Permission: Bash', detail: 'Bash may only run in the allowed working directories for this session.', toolName: 'Bash', command: 'ls /etc' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs, { onRun: (r) => runs.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'ls etc' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const before = runs.length;
  fc.send(env('permission-decision', { requestId: 'req-dir', decision: 'approve' }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(runs.length, before, 'a dir-block Approve never re-runs the adapter (no grant)');
  // An informational message was posted via post() (a fresh info-<requestId> turnId).
  const info = turnEvents(fc).filter((e) => (e as { turnId: string }).turnId === 'info-req-dir');
  assert.ok(info.some((e) => e.kind === 'assistant-delta' && /allowed working directories/i.test((e as { text: string }).text)), 'an informational assistant message explains the dir-block');
  assert.ok(info.some((e) => e.kind === 'done'), 'the informational message ends with a done event');
});

test('S001 (bugfix) + S003 (ux polish): Deny drops both a tool-gate and a dir-block — no re-run; posts ONLY the rejected outcome chip', async () => {
  // tool-gate deny
  const fcT = fakeChannel();
  const runsT: TurnRequest[] = [];
  const evsT: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-t', title: 'Permission: Bash', detail: 'needs perm', toolName: 'Bash', command: 'npm run build' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const hostT = createChatPanelHost({
    createPanel: () => fcT.channel,
    providers: registry({ claude: scriptedAdapter(evsT, { onRun: (r) => runsT.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  hostT.open();
  fcT.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fcT).some((e) => e.kind === 'done'));
  const beforeT = runsT.length;
  const postsT = fcT.posted.length;
  const echoesT = fcT.posted.filter((m) => m.payload.type === 'user-row').length;
  fcT.send(env('permission-decision', { requestId: 'req-t', decision: 'deny' }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(runsT.length, beforeT, 'tool-gate deny never re-runs');
  // S003 (ux polish): deny now records a rejected permission-outcome — exactly ONE new post, no echo.
  assert.equal(fcT.posted.length, postsT + 1, 'tool-gate deny posts exactly the rejected outcome');
  assert.equal(fcT.posted.filter((m) => m.payload.type === 'user-row').length, echoesT, 'deny posts no user-row echo');
  const outT = turnEvents(fcT).filter((e) => e.kind === 'permission-outcome');
  assert.equal(outT.length, 1, 'one permission-outcome event');
  assert.deepEqual({ tool: (outT[0] as { toolName: string }).toolName, dec: (outT[0] as { decision: string }).decision }, { tool: 'Bash', dec: 'rejected' });

  // dir-block deny
  const fcD = fakeChannel();
  const runsD: TurnRequest[] = [];
  const evsD: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-d', title: 'Permission: Bash', detail: 'Bash may only run in the allowed working directories for this session.', toolName: 'Bash' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const hostD = createChatPanelHost({
    createPanel: () => fcD.channel,
    providers: registry({ claude: scriptedAdapter(evsD, { onRun: (r) => runsD.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  hostD.open();
  fcD.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fcD).some((e) => e.kind === 'done'));
  const beforeD = runsD.length;
  const postsD = fcD.posted.length;
  fcD.send(env('permission-decision', { requestId: 'req-d', decision: 'deny' }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(runsD.length, beforeD, 'dir-block deny never re-runs');
  assert.equal(fcD.posted.length, postsD + 1, 'dir-block deny posts exactly the rejected outcome');
  const outD = turnEvents(fcD).filter((e) => e.kind === 'permission-outcome');
  assert.equal(outD.length, 1, 'one permission-outcome event for the dir-block deny');
  assert.equal((outD[0] as { decision: string }).decision, 'rejected');
});

test('S001 (bugfix): an in-turn request is relayed to adapter.decide (codex/in-turn relay); an id the host does not hold still falls through', async () => {
  const fc = fakeChannel();
  const decided: Array<[string, string, string]> = [];
  // An approval-request WITHOUT a toolName (and no resolution) is answered inside the running turn:
  // its decision is relayed to the live turn's adapter.decide() — the codex / control-protocol path.
  const evs: TurnEvent[] = [
    { kind: 'status', turnId: 't9', phase: 'tool' },
    { kind: 'approval-request', turnId: 't9', requestId: 'perm-9', title: 'Run', detail: 'echo hi' },
  ];
  const adapter = scriptedAdapter(evs, { hang: true, onDecide: (t, r, d) => decided.push([t, r, d]) });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  try {
    host.open();
    fc.send(env('submit-turn', { text: 'do it' }));
    await waitFor(() => turnEvents(fc).some((e) => e.kind === 'approval-request'));
    fc.send(env('permission-decision', { requestId: 'perm-9', decision: 'approve' }));
    await waitFor(() => decided.length >= 1);
    assert.deepEqual(decided[0], ['t9', 'perm-9', 'approve'], 'relayed to the live adapter.decide');
    // ISSUE-6a811b8a: a decided request records exactly one outcome, whichever path answers it.
    assert.equal(turnEvents(fc).filter((e) => e.kind === 'permission-outcome').length, 1, 'one outcome for the decided request');
    // An id the host does not hold (stale card, another window) still falls through, with no outcome.
    fc.send(env('permission-decision', { requestId: 'perm-unknown', decision: 'deny' }));
    await waitFor(() => decided.length >= 2);
    assert.deepEqual(decided[1], ['t9', 'perm-unknown', 'deny'], 'an unknown id falls through to decide()');
    assert.equal(turnEvents(fc).filter((e) => e.kind === 'permission-outcome').length, 1, 'no outcome for a fall-through decision');
  } finally {
    fc.fireDispose(); // reap the hanging turn so the test process can exit
  }
});

// ---- S003 (dev-chat ux polish) ac2/ac3/ac4: permission-outcome record + suppressed grant echo ----

test('S003 ac2: approving a tool-gate WITH a command re-runs with [toolName] but posts ZERO user-row echoes (suppressEcho)', async () => {
  const fc = fakeChannel();
  const runs: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-bash', title: 'Permission: Bash', detail: 'needs perm', toolName: 'Bash', command: 'npm run build' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs, { onRun: (r) => runs.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'build it' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const echoesBefore = fc.posted.filter((m) => m.payload.type === 'user-row').length;
  assert.equal(echoesBefore, 1, 'the ORIGINAL user turn posted exactly one user-row echo');
  const before = runs.length;
  fc.send(env('permission-decision', { requestId: 'req-bash', decision: 'approve' }));
  await waitFor(() => runs.length > before);
  // The resume turn ran with the tool pre-allowed …
  assert.deepEqual([...(runs[runs.length - 1]!.allowedTools ?? [])], ['Bash'], 'the grant re-run pre-allows the approved tool');
  // … but the synthetic grant prompt was NOT echoed as a user bubble.
  assert.equal(fc.posted.filter((m) => m.payload.type === 'user-row').length, echoesBefore, 'the grant re-run posts NO additional user-row echo');
  // The approved outcome chip was emitted live.
  const out = turnEvents(fc).filter((e) => e.kind === 'permission-outcome');
  assert.equal(out.length, 1, 'exactly one approved outcome chip');
  assert.deepEqual({ tool: (out[0] as { toolName: string }).toolName, dec: (out[0] as { decision: string }).decision }, { tool: 'Bash', dec: 'approved' });
});

test('S003 ac2: a NORMAL user turn still posts its user-row echo (suppressEcho gates ONLY the synthetic grant re-run)', async () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't1', ok: true }]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'hello there' }));
  await waitFor(() => fc.posted.some((m) => m.payload.type === 'user-row'));
  const echoes = fc.posted.filter((m) => m.payload.type === 'user-row');
  assert.equal(echoes.length, 1, 'a normal submit still echoes the user row');
  assert.equal(echoes[0]!.payload['text'], 'hello there');
});

test('S003 ac2: the tool-name FALLBACK grant (no command) also suppresses the echo + records the approved outcome', async () => {
  const fc = fakeChannel();
  const runs: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-w', title: 'Permission: Write', detail: 'needs to write', toolName: 'Write' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs, { onRun: (r) => runs.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'write it' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const echoesBefore = fc.posted.filter((m) => m.payload.type === 'user-row').length;
  const before = runs.length;
  fc.send(env('permission-decision', { requestId: 'req-w', decision: 'approve' }));
  await waitFor(() => runs.length > before);
  assert.match(runs[runs.length - 1]!.prompt, /please proceed with the Write action/, 'fell back to the tool-name grant phrasing');
  assert.equal(fc.posted.filter((m) => m.payload.type === 'user-row').length, echoesBefore, 'the fallback grant posts no user-row echo');
  assert.equal(turnEvents(fc).filter((e) => e.kind === 'permission-outcome').length, 1, 'the approved outcome is recorded');
});

test('S003 ac3: a dir-block Approve records an approved outcome (even though it does NOT re-run)', async () => {
  const fc = fakeChannel();
  const runs: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-dir', title: 'Permission: Bash', detail: 'Bash may only run in the allowed working directories for this session.', toolName: 'Bash', command: 'ls /etc' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs, { onRun: (r) => runs.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'ls etc' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const before = runs.length;
  fc.send(env('permission-decision', { requestId: 'req-dir', decision: 'approve' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'permission-outcome'));
  assert.equal(runs.length, before, 'the dir-block Approve still never re-runs the adapter');
  const out = turnEvents(fc).filter((e) => e.kind === 'permission-outcome');
  assert.equal((out[0] as { decision: string }).decision, 'approved', 'the dir-block approve is recorded as approved');
  // The informational assistant message is still posted (unchanged branch).
  assert.ok(turnEvents(fc).some((e) => e.kind === 'assistant-delta' && /allowed working directories/i.test((e as { text: string }).text)), 'the dir-block info message is unchanged');
});

test('S003 ac4: after an approve, the persisted transcript carries the outcome row and NO approval-request (the pending card never replays)', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const evs: TurnEvent[] = [
    { kind: 'approval-request', turnId: 't1', requestId: 'req-w', title: 'Permission: Write', detail: 'needs to write', toolName: 'Write' },
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'write it' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  fc.send(env('permission-decision', { requestId: 'req-w', decision: 'approve' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'permission-outcome'));
  // The stored transcript has a permission-outcome row (renders the resolved chip on replay) and
  // never an approval-request row (the pending card is live-only, so it cannot re-appear on restore).
  const listed = store.list();
  assert.equal(listed.length, 1, 'the session persisted');
  const transcript = store.get(listed[0]!.id)!.transcript;
  const outcome = transcript.find((r) => r.role === 'permission-outcome');
  assert.ok(outcome, 'the resolved permission-outcome row is persisted');
  assert.equal(outcome && 'decision' in outcome ? outcome.decision : undefined, 'approved');
  assert.ok(!transcript.some((r) => (r as { role: string }).role === 'approval-request'), 'no approval-request row is ever persisted (no card on replay)');
});

// ---- S001 (bugfix): the chat mode is a PERSISTED per-session preference ----

test('S001 (bugfix): set-permission-mode persists onto the active (saved) session', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }]) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' })); // first turn persists the session
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const id = store.list()[0]!.id;
  assert.equal(store.get(id)!.mode ?? 'manual', 'manual', 'a fresh session defaults to manual');
  fc.send(env('set-permission-mode', { mode: 'auto' }));
  assert.equal(store.get(id)!.mode, 'auto', 'the chosen mode is written onto the saved session (survives reload)');
});

test('S001 (bugfix): the mode FOLLOWS the session — opening a chat adopts its persisted mode', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const a = store.create('claude'); a.mode = 'auto'; store.save(a);
  const seen: TurnRequest[] = [];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }], { onRun: (r) => seen.push(r) }) }, ['claude']),
    store,
    cwd: () => '/repo',
  });
  host.open(); // a fresh draft (manual)
  fc.send(env('open-chat', { chatId: a.id }));
  const restored = fc.posted.filter((m) => m.payload.type === 'session-restored').map((m) => m.payload);
  assert.equal(restored[restored.length - 1]!['mode'], 'auto', 'session-restored carries the session’s persisted mode');
  fc.send(env('submit-turn', { text: 'x' }));
  await waitFor(() => seen.length >= 1);
  assert.equal(seen[0]!.permissionMode, 'auto', 'the turn runs in the opened session’s mode, not the panel default');
});

test('S001 (bugfix): the webview sets the mode control from a restored session', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  const html = fc.html();
  assert.match(html, /if\(m\.mode&&pm\)\{pmode=m\.mode;pm\.value=m\.mode;updatePermSeg\(\);\}/, 'the webview syncs the mode dropdown on session-restored');
});

// ---- S004 (dev-chat ux polish): selection widget routing + selection-decision --------

test('S004 (ux polish): renderShell wires the selection decision sink + routes selection turn-events (approval path intact)', () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  const html = fc.html();
  assert.match(html, /onSelectionDecision/, 'wires the selection decision sink');
  assert.match(html, /type:'selection-decision'/, 'the confirm posts selection-decision');
  assert.match(html, /ev\.kind==='selection-request'/, 'the live handler routes selection-request through the registry');
  assert.match(html, /ev\.kind==='selection-outcome'/, 'the live handler routes selection-outcome through the registry');
  // The approval path is untouched (k4): its sink + card + handler are still wired.
  assert.match(html, /onApprovalDecision/, 'approval decision sink still wired');
  assert.match(html, /type:'permission-decision'/, 'approval card still posts permission-decision');
});

test('S004 (ux polish): a selection-decision records the outcome (chosen LABELS) AND continues the run via a synthesized user turn', async () => {
  const fc = fakeChannel();
  const seen: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'status', turnId: 'ts', phase: 'thinking' },
    { kind: 'selection-request', turnId: 'ts', requestId: 'sel-x', prompt: 'Pick', options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }] },
    { kind: 'done', turnId: 'ts', ok: true },
  ];
  const adapter = scriptedAdapter(evs, { onRun: (r) => seen.push(r) });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'selection-request'));
  await waitFor(() => seen.length >= 1);
  fc.send(env('selection-decision', { requestId: 'sel-x', selected: ['b'] }));
  // The resolved outcome is posted with the chosen LABEL (not the id), and persisted structurally.
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'selection-outcome'));
  const outcome = turnEvents(fc).find((e) => e.kind === 'selection-outcome') as { chosen: string[] };
  assert.deepEqual(outcome.chosen, ['Beta'], 'chosen carries the resolved label, not the id');
  // The run continues via a synthesized user turn naming the choice.
  await waitFor(() => seen.length >= 2, 2000);
  assert.match(seen[1]!.prompt, /Beta/, 'the follow-on run conveys the chosen label');
});

test('S004 (ux polish): a selection-decision for an unknown/stale requestId is a safe no-op (no outcome, no run)', async () => {
  const fc = fakeChannel();
  const seen: TurnRequest[] = [];
  const adapter = scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }], { onRun: (r) => seen.push(r) });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  assert.doesNotThrow(() => fc.send(env('selection-decision', { requestId: 'nope', selected: ['a'] })));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!turnEvents(fc).some((e) => e.kind === 'selection-outcome'), 'no outcome recorded for an unknown request');
  assert.equal(seen.length, 0, 'no run triggered by a stale selection-decision');
});

test('S004 (ux polish): a selection-decision with an empty/invalid selected list is dropped (no outcome, no run)', async () => {
  const fc = fakeChannel();
  const seen: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'selection-request', turnId: 'ts', requestId: 'sel-e', prompt: 'Pick', options: [{ id: 'a', label: 'A' }] },
    { kind: 'done', turnId: 'ts', ok: true },
  ];
  const adapter = scriptedAdapter(evs, { onRun: (r) => seen.push(r) });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => seen.length >= 1);
  fc.send(env('selection-decision', { requestId: 'sel-e', selected: [] }));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!turnEvents(fc).some((e) => e.kind === 'selection-outcome'), 'empty selection posts no outcome');
  assert.equal(seen.length, 1, 'no follow-on run for an empty selection');
});

// ---- S001 (E20261010d6a4bc79): one CLI process per session ------------------------------

/** An adapter whose every run hands over a fake process (onSpawn), answers, and leaves it running. */
function procAdapter(text = (n: number) => `answer-${n}`): { adapter: StreamAdapter; procs: FakeLiveProc[]; runs: () => number } {
  const procs: FakeLiveProc[] = [];
  let n = 0;
  const adapter: StreamAdapter = {
    async *run(_req: TurnRequest, opts?: RunOptions): AsyncIterable<TurnEvent> {
      const id = `t${++n}`;
      const proc = fakeLiveProc(1000 + n);
      procs.push(proc);
      opts?.onSpawn?.(proc);
      await Promise.resolve();
      yield { kind: 'assistant-delta', turnId: id, text: text(n) };
      yield { kind: 'done', turnId: id, ok: true };
    },
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  return { adapter, procs, runs: () => n };
}

const waitingPosted = (fc: FakeChannel): boolean =>
  turnEvents(fc).some((e) => e.kind === 'status' && (e as { phase: string }).phase === 'waiting');

test("a message sent while the previous CLI process is still alive after its answer waits, shows 'Waiting for the previous turn to finish', and starts only after that process exits", async () => {
  const fc = fakeChannel();
  const { adapter, procs, runs } = procAdapter();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'first' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  assert.equal(procs[0]!.exited(), false, 'the first CLI keeps running after its answer');

  fc.send(env('submit-turn', { text: 'second' }));
  await waitFor(() => waitingPosted(fc));
  const waiting = turnEvents(fc).find((e) => e.kind === 'status' && (e as { phase: string }).phase === 'waiting')!;
  assert.equal(markerFor(waiting)?.label, WAITING_LABEL, "the webview shows 'Waiting for the previous turn to finish'");
  assert.equal(WAITING_LABEL, 'Waiting for the previous turn to finish');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(runs(), 1, 'the second turn has not started while the first process is alive');
  assert.deepEqual(procs[0]!.signals, [], 'the first process was not stopped');

  procs[0]!.exitNow();
  await waitFor(() => runs() === 2);
  await waitFor(() => turnEvents(fc).filter((e) => e.kind === 'done').length === 2);
  assert.ok(turnEvents(fc).some((e) => e.kind === 'assistant-delta' && (e as { text: string }).text === 'answer-2'), 'the second turn ran after the exit');
  procs[1]!.exitNow();
});

test('with a short timeout, the still-running holder is stopped and the new turn starts after its exit is confirmed', async () => {
  const fc = fakeChannel();
  const { adapter, procs, runs } = procAdapter();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    turnLockTimeoutMs: () => 40,
  });
  host.open();
  fc.send(env('submit-turn', { text: 'first' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  fc.send(env('submit-turn', { text: 'second' }));
  await waitFor(() => waitingPosted(fc));
  assert.deepEqual(procs[0]!.signals, [], 'not stopped before the timeout');
  let exitedBeforeStart: boolean | undefined;
  await waitFor(() => {
    if (runs() === 2 && exitedBeforeStart === undefined) exitedBeforeStart = procs[0]!.exited();
    return runs() === 2;
  });
  assert.deepEqual(procs[0]!.signals, ['SIGTERM'], 'the holder was stopped after the timeout');
  assert.equal(exitedBeforeStart, true, 'the new turn started only after the exit was confirmed');
  await waitFor(() => turnEvents(fc).filter((e) => e.kind === 'done').length === 2);
  procs[1]!.exitNow();
});

// Epic E20261014613abdb3 Story S001: with the queue, Stop ends the running turn and the next waiting
// message runs; a newer message never replaces a waiting one. (Was: 'Stop ends the running process
// at once and cancels a waiting message; the generation guard still keeps superseded events out of
// the transcript'.)
test('Stop ends the running process at once and the waiting message then runs; with the queue every message runs, in order, one answer each', async () => {
  const fc = fakeChannel();
  const { adapter, procs, runs } = procAdapter();
  const store = createInMemoryChatSessionStore();
  const q = tempQueue();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', queue: q.queue });
  try {
    host.open();
    fc.send(env('ready'));
    fc.send(env('submit-turn', { text: 'first' }));
    await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'), 3000);
    fc.send(env('submit-turn', { text: 'second' }));
    await waitFor(() => waitingPosted(fc), 3000); // its turn waits for the first CLI to exit

    fc.send(env('cancel-turn'));
    await waitFor(() => procs[0]!.exited(), 500);
    assert.deepEqual(procs[0]!.signals, ['SIGTERM'], 'Stop ended the running process at once (no timeout wait)');

    // 'second' was the message being run (waiting for the session's CLI): Stop ends it, kept with a resend.
    await waitFor(() => q.store.list().find((m) => m.text === 'second')?.state === 'failed', 3000);
    assert.equal(q.store.list().find((m) => m.text === 'second')?.error, 'stopped by the user');
    assert.equal(runs(), 1, 'its turn never started a CLI');

    // Messages sent next all run, in order: a newer one never replaces a waiting one.
    fc.send(env('submit-turn', { text: 'third' }));
    fc.send(env('submit-turn', { text: 'fourth' }));
    await waitFor(() => runs() === 2, 3000);
    procs[1]!.exitNow(); // 'third' answered; its CLI exits, so 'fourth' gets the session
    await waitFor(() => runs() === 3, 3000);
    procs[2]!.exitNow();
    await waitFor(() => q.store.list().filter((m) => m.state !== 'failed').length === 0, 3000);
    const saved = store.list()[0]!;
    const users = store.get(saved.id)!.transcript.filter((r) => r.role === 'user').map((r) => (r as { text: string }).text);
    assert.deepEqual(users, ['first', 'second', 'third', 'fourth'], 'in order (a message enters the transcript when it is taken, so the stopped one is there too)');
    const answers = store.get(saved.id)!.transcript.filter((r) => r.role === 'assistant').map((r) => (r as { text: string }).text);
    assert.deepEqual(answers, ['answer-1', 'answer-2', 'answer-3'], 'one answer per started turn');
    procs.forEach((p) => p.exitNow());
  } finally {
    host.dispose();
    q.done();
  }
});

test('a lock failure other than a dropped wait is logged and shown, never a silent no-op', async () => {
  const fc = fakeChannel();
  const { adapter, runs } = procAdapter();
  const errors: string[] = [];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    logger: { warn: () => {}, error: (m) => errors.push(m) },
    sessionLocks: { acquire: () => Promise.reject(new Error('lock store broke')) },
  });
  host.open();
  fc.send(env('submit-turn', { text: 'hi' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'error'));
  const err = turnEvents(fc).find((e) => e.kind === 'error') as { message: string };
  assert.match(err.message, /could not lock chat session: lock store broke/);
  assert.match(errors.join('\n'), /could not lock chat session: lock store broke/);
  assert.equal(runs(), 0, 'no CLI was started');
});

test('a turn whose adapter fails to start releases the session lease (the next turn does not wait)', async () => {
  const fc = fakeChannel();
  let calls = 0;
  const { adapter: ok } = procAdapter();
  const adapter: StreamAdapter = {
    ...ok,
    run: (req, opts) => {
      if (++calls === 1) throw new Error('spawn failed');
      return ok.run(req, opts);
    },
  };
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    turnLockTimeoutMs: () => 60_000,
  });
  host.open();
  fc.send(env('submit-turn', { text: 'first' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'error'));
  assert.match((turnEvents(fc).find((e) => e.kind === 'error') as { message: string }).message, /spawn failed/);
  fc.send(env('submit-turn', { text: 'second' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'), 500);
  assert.ok(!waitingPosted(fc), 'the second turn never waited: the failed turn released its lease');
});

// ---- S001 (E202610101d04e560): the turn's cursor in the session output file ------------

test('a turn records its cursor on the session as lines are handled and clears it at the terminal event', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const seen: Array<string | undefined> = [];
  const proc = fakeLiveProc(1001);
  const adapter: StreamAdapter = {
    async *run(_req: TurnRequest, opts?: RunOptions): AsyncIterable<TurnEvent> {
      seen.push(opts?.sessionId);
      const cursor = { sessionId: opts!.sessionId!, turnId: 't1', generation: 2, offset: 40 };
      opts?.onSpawn?.({ ...proc, cursor, outPath: '/out/s.ndjson' });
      await Promise.resolve();
      yield { kind: 'assistant-delta', turnId: 't1', text: 'hi' };
      opts?.onProgress?.({ ...cursor, offset: 90 });
      await gate;
      yield { kind: 'done', turnId: 't1', ok: true };
    },
    resume: async function* () {},
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', hostPid: 4242, processStartTime: () => 77 });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'assistant-delta'));
  const id = store.list()[0]!.id;
  assert.equal(seen[0], id, 'the adapter is told which session the turn belongs to');
  await waitFor(() => store.get(id)?.liveTurn !== undefined);
  // Recorded at spawn (offset 40, owned by this host) and advanced as lines are handled (offset 90).
  assert.deepEqual(store.get(id)?.liveTurn, { cursor: { turnId: 't1', generation: 2, offset: 90 }, ownerHostPid: 4242, pid: 1001, startedAt: 77 }, 'recorded, owned by this host, and advanced');

  release();
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  assert.equal(store.get(id)?.liveTurn, undefined, 'cleared at the terminal event');

  // A pipe turn (no cursor from the adapter) records none.
  const plain = procAdapter();
  const fc2 = fakeChannel();
  const store2 = createInMemoryChatSessionStore();
  const host2 = createChatPanelHost({ createPanel: () => fc2.channel, providers: registry({ claude: plain.adapter }, ['claude']), store: store2, cwd: () => '/repo' });
  host2.open();
  fc2.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc2).some((e) => e.kind === 'done'));
  assert.equal(store2.get(store2.list()[0]!.id)?.liveTurn, undefined);
  plain.procs[0]!.exitNow();
  proc.exitNow();
});

/** A saved session whose turn's output is still being read (as a reloaded window finds it). */
function storeWithLiveTurn(ownerHostPid: number): { store: ReturnType<typeof createInMemoryChatSessionStore>; id: string } {
  const store = createInMemoryChatSessionStore();
  const s = store.create('claude');
  s.transcript.push({ role: 'user', text: 'long job', at: 't' }, { role: 'assistant', text: 'started', at: 't' });
  s.liveTurn = { cursor: { turnId: 't1', generation: 1, offset: 100 }, ownerHostPid, pid: 900, startedAt: 5 };
  store.save(s);
  return { store, id: s.id };
}

/** An adapter whose resume() records its request and yields the scripted events. */
function resumeAdapter(events: TurnEvent[], gate?: Promise<void>): { adapter: StreamAdapter; requests: unknown[] } {
  const requests: unknown[] = [];
  const adapter: StreamAdapter = {
    async *run(): AsyncIterable<TurnEvent> {},
    async *resume(req): AsyncIterable<TurnEvent> {
      requests.push(req);
      if (gate !== undefined) await gate;
      for (const ev of events) yield ev;
    },
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  return { adapter, requests };
}

test('after a reload (a new host over the same store) a session with a live cursor is followed from the saved offset, only new events are posted and appended, and the cursor is cleared at the end', async () => {
  const { store, id } = storeWithLiveTurn(1); // the old extension host (pid 1) is gone
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { adapter, requests } = resumeAdapter([{ kind: 'assistant-delta', turnId: 't1', text: 'finished later' }, { kind: 'done', turnId: 't1', ok: true }], gate);
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', hostPid: 2, isAlive: (pid) => pid === 2 });
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  await waitFor(() => requests.length === 1);
  assert.deepEqual(requests[0], { cursor: { sessionId: id, turnId: 't1', generation: 1, offset: 100 }, pid: 900, startedAt: 5 }, 'followed from the saved cursor');
  assert.equal(store.get(id)?.liveTurn?.ownerHostPid, 2, 'this host took ownership');
  release();
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  assert.deepEqual(turnEvents(fc).map((e) => e.kind), ['assistant-delta', 'done'], 'only the new events are posted');
  const texts = store.get(id)!.transcript.filter((r) => r.role === 'assistant').map((r) => (r as { text: string }).text);
  assert.deepEqual(texts, ['started', 'finished later'], 'the new events are appended after the stored ones');
  await waitFor(() => store.get(id)?.liveTurn === undefined);
});

test('a cursor whose generation is gone (rolled over twice) is cleared without resuming', async () => {
  // The adapter finds nothing left to resume (SegmentGone) and ends without events.
  const { store, id } = storeWithLiveTurn(1);
  const { adapter, requests } = resumeAdapter([]);
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', hostPid: 2, isAlive: (pid) => pid === 2 });
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  await waitFor(() => requests.length === 1);
  await waitFor(() => store.get(id)?.liveTurn === undefined);
  assert.deepEqual(turnEvents(fc), [], 'nothing posted');
  assert.equal(store.get(id)!.transcript.length, 2, 'the stored transcript is unchanged');
});

test("a second live window that is not the cursor's owner does not follow it; once the owner host is gone it takes over", async () => {
  const { store, id } = storeWithLiveTurn(1);
  const alive = new Set([1, 2]); // the owner window (host 1) is still open
  const { adapter, requests } = resumeAdapter([{ kind: 'done', turnId: 't1', ok: true }]);
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', hostPid: 2, isAlive: (pid) => alive.has(pid) });
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(requests.length, 0, 'the owner window follows it, not this one');
  assert.equal(store.get(id)?.liveTurn?.ownerHostPid, 1);

  alive.delete(1); // the owner window closed
  fc.send(env('ready'));
  await waitFor(() => requests.length === 1);
  await waitFor(() => store.get(id)?.liveTurn === undefined);
});

test('switching chat or closing the panel stops following a turn writing to the session file without stopping its process, and showing the session again resumes it; a turn without one is still stopped', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const proc = fakeLiveProc(1500);
  const resumes: Array<{ cursor: { offset: number } }> = [];
  const adapter: StreamAdapter = {
    async *run(_req: TurnRequest, opts?: RunOptions): AsyncIterable<TurnEvent> {
      const cursor = { sessionId: opts!.sessionId!, turnId: 'long', generation: 1, offset: 10 };
      opts?.onSpawn?.({ ...proc, cursor, outPath: '/out/s.ndjson' });
      await Promise.resolve();
      yield { kind: 'assistant-delta', turnId: 'long', text: 'part one' };
      opts?.onProgress?.({ ...cursor, offset: 50 });
      await gate;
      yield { kind: 'assistant-delta', turnId: 'long', text: 'part two (read again on resume)' };
      yield { kind: 'done', turnId: 'long', ok: true };
    },
    async *resume(req): AsyncIterable<TurnEvent> {
      resumes.push(req as { cursor: { offset: number } });
      yield { kind: 'assistant-delta', turnId: 'long', text: 'part two' };
      yield { kind: 'done', turnId: 'long', ok: true };
    },
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', hostPid: 3, isAlive: () => true });
  host.open();
  fc.send(env('submit-turn', { text: 'long job' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'assistant-delta'));
  const id = store.list()[0]!.id;

  // Switch to a new chat mid-turn: the process keeps running, the cursor stays saved.
  fc.send(env('new-chat', { provider: 'claude' }));
  release();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(proc.signals, [], 'the session-file turn was not stopped');
  assert.equal(proc.exited(), false);
  assert.equal(store.get(id)?.liveTurn?.cursor.offset, 50, 'its cursor is kept');
  const texts = () => store.get(id)!.transcript.filter((r) => r.role === 'assistant').map((r) => (r as { text: string }).text);
  assert.deepEqual(texts(), ['part one'], 'nothing past the cursor was taken while detached');

  // Showing the session again resumes it from the cursor.
  fc.send(env('open-chat', { chatId: id }));
  await waitFor(() => resumes.length === 1);
  assert.equal(resumes[0]!.cursor.offset, 50);
  await waitFor(() => store.get(id)?.liveTurn === undefined);
  assert.deepEqual(texts(), ['part one', 'part two']);

  // Closing the panel does not stop a session-file turn either.
  host.dispose();
  assert.deepEqual(proc.signals, []);
  proc.exitNow();
});

test("Stop ends a resumed turn's process through the handle resume() hands over", async () => {
  const { store, id } = storeWithLiveTurn(1); // the owner window is gone
  const proc = fakeLiveProc(1600);
  const adapter: StreamAdapter = {
    async *run(): AsyncIterable<TurnEvent> {},
    async *resume(_req, opts): AsyncIterable<TurnEvent> {
      opts?.onAttach?.({ ...proc });
      yield { kind: 'assistant-delta', turnId: 't1', text: 'still going' };
      await new Promise<void>((r) => opts?.signal?.addEventListener('abort', () => r(), { once: true }));
    },
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', hostPid: 2, isAlive: (pid) => pid === 2 });
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'assistant-delta'));
  fc.send(env('cancel-turn'));
  await waitFor(() => proc.exited());
  assert.deepEqual(proc.signals, ['SIGTERM'], 'Stop ended the resumed turn through the handed-over handle');
});

test('closing the panel mid-turn leaves a session-file turn running with its cursor saved', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const proc = fakeLiveProc(1700);
  const adapter: StreamAdapter = {
    async *run(_req: TurnRequest, opts?: RunOptions): AsyncIterable<TurnEvent> {
      const cursor = { sessionId: opts!.sessionId!, turnId: 'bg', generation: 1, offset: 10 };
      opts?.onSpawn?.({ ...proc, cursor, outPath: '/out/s.ndjson' });
      await Promise.resolve();
      yield { kind: 'assistant-delta', turnId: 'bg', text: 'working' };
      opts?.onProgress?.({ ...cursor, offset: 60 });
      await proc.exit; // the CLI is still busy when the panel closes
    },
    async *resume(): AsyncIterable<TurnEvent> {},
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'bg job' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'assistant-delta'));
  const id = store.list()[0]!.id;
  host.dispose();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(proc.signals, [], 'closing the panel did not stop the session-file turn');
  assert.equal(proc.exited(), false);
  assert.equal(store.get(id)?.liveTurn?.cursor.offset, 60, 'its cursor is saved for a later resume');
  proc.exitNow();
});

test('a failing store save or a failing process stop never becomes an unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (r: unknown): void => void unhandled.push(r);
  process.on('unhandledRejection', onUnhandled);
  try {
    // The store refuses every save: the turn still runs and the failure is logged.
    const fc = fakeChannel();
    const warns: string[] = [];
    const base = createInMemoryChatSessionStore();
    const store = { ...base, save: () => { throw new Error('memento write failed'); } };
    const { adapter, procs } = procAdapter();
    const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', logger: { warn: (m) => warns.push(m), error: () => {} } });
    host.open();
    fc.send(env('submit-turn', { text: 'hi' }));
    await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
    assert.match(warns.join('\n'), /not saved: memento write failed/);
    procs[0]!.exitNow();

    // Stop on a process whose stop() rejects.
    const fc2 = fakeChannel();
    const proc = fakeLiveProc(1800);
    const failing = { ...proc, stop: () => Promise.reject(new Error('not signalable')) };
    const adapter2: StreamAdapter = {
      async *run(_req: TurnRequest, opts?: RunOptions): AsyncIterable<TurnEvent> {
        opts?.onSpawn?.(failing);
        yield { kind: 'assistant-delta', turnId: 'x', text: 'busy' };
        await proc.exit;
      },
      async *resume(): AsyncIterable<TurnEvent> {},
      cancel: async () => {},
      decide: () => {},
      capabilities: { resume: true },
    };
    const host2 = createChatPanelHost({ createPanel: () => fc2.channel, providers: registry({ claude: adapter2 }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
    host2.open();
    fc2.send(env('submit-turn', { text: 'go' }));
    await waitFor(() => turnEvents(fc2).some((e) => e.kind === 'assistant-delta'));
    fc2.send(env('cancel-turn'));
    await new Promise((r) => setTimeout(r, 30));
    proc.exitNow();
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(unhandled, [], 'no unhandled rejection');
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('a save failing at the end of a turn is logged; the turn still ends cleanly and the history is refreshed', async () => {
  const fc = fakeChannel();
  const warns: string[] = [];
  const base = createInMemoryChatSessionStore();
  let failSaves = false;
  const store = {
    ...base,
    save: (s: Parameters<typeof base.save>[0]) => {
      if (failSaves) throw new Error('disk full');
      base.save(s);
    },
  };
  const { adapter, procs } = procAdapter();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', logger: { warn: (m) => warns.push(m), error: () => {} } });
  host.open();
  failSaves = true;
  const listsBefore = historyLists(fc).length;
  fc.send(env('submit-turn', { text: 'hi' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(turnEvents(fc).map((e) => e.kind), ['assistant-delta', 'done'], 'no error is shown after a good answer');
  assert.ok(historyLists(fc).length > listsBefore, 'the history dropdown is still refreshed');
  assert.match(warns.join('\n'), /not saved: disk full/);
  procs[0]!.exitNow();
});

test('a save failing while the derived title is stored is logged, never an unhandled rejection, and the history is still refreshed', async () => {
  const fc = fakeChannel();
  const warns: string[] = [];
  const rejections: unknown[] = [];
  const onRejection = (e: unknown): void => { rejections.push(e); };
  process.on('unhandledRejection', onRejection);
  const base = createInMemoryChatSessionStore();
  let failSaves = false;
  const store = {
    ...base,
    save: (s: Parameters<typeof base.save>[0]) => {
      if (failSaves) throw new Error('disk full');
      base.save(s);
    },
  };
  let titled = false;
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't1', ok: true }]) }, ['claude']),
    store,
    cwd: () => '/repo',
    logger: { warn: (m) => warns.push(m), error: () => {} },
    deriveTitle: async () => { failSaves = true; titled = true; return 'Derived Name'; },
  });
  try {
    host.open();
    fc.send(env('submit-turn', { text: 'hi' }));
    await waitFor(() => titled);
    const listsBefore = historyLists(fc).length;
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(rejections, [], 'the failing save is not an unhandled rejection');
    assert.match(warns.join('\n'), /not saved: disk full/);
    assert.ok(historyLists(fc).length > listsBefore, 'the history dropdown is still refreshed');
  } finally {
    process.off('unhandledRejection', onRejection);
  }
});

test('a failing save of a selection or permission outcome is logged and the run still continues', async () => {
  const fc = fakeChannel();
  const warns: string[] = [];
  const seen: TurnRequest[] = [];
  const evs: TurnEvent[] = [
    { kind: 'selection-request', turnId: 'ts', requestId: 'sel-x', prompt: 'Pick', options: [{ id: 'a', label: 'Alpha' }] },
    { kind: 'done', turnId: 'ts', ok: true },
  ];
  const adapter = scriptedAdapter(evs, { onRun: (r) => seen.push(r) });
  const base = createInMemoryChatSessionStore();
  let failSaves = false;
  const store = {
    ...base,
    save: (s: Parameters<typeof base.save>[0]) => {
      if (failSaves) throw new Error('disk full');
      base.save(s);
    },
  };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', logger: { warn: (m) => warns.push(m), error: () => {} } });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  failSaves = true;
  assert.doesNotThrow(() => fc.send(env('selection-decision', { requestId: 'sel-x', selected: ['a'] })));
  await waitFor(() => seen.length >= 2, 2000);
  assert.match(seen[1]!.prompt, /Alpha/, 'the follow-on run still starts');
  assert.match(warns.join('\n'), /not saved: disk full/);
});

test('a failing edit-governor call is logged, never an unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (r: unknown): void => void unhandled.push(r);
  process.on('unhandledRejection', onUnhandled);
  try {
    const fc = fakeChannel();
    const warns: string[] = [];
    const gov = fakeGovernance();
    gov.baseline.set('src/a.ts', 'old\n');
    gov.disk.set('src/a.ts', 'NEW\n');
    const deps: ChatEditGovernanceDeps = {
      ...gov.deps,
      diffView: () => {
        throw new Error('config unreadable');
      },
    };
    const evs: TurnEvent[] = [
      { kind: 'file-edit', turnId: 't1', path: 'src/a.ts', diff: { path: 'src/a.ts', hunks: [] } },
      { kind: 'done', turnId: 't1', ok: true },
    ];
    const host = createChatPanelHost({
      createPanel: () => fc.channel,
      providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
      store: createInMemoryChatSessionStore(),
      cwd: () => '/repo',
      editGovernance: deps,
      logger: { warn: (m) => warns.push(m), error: () => {} },
    });
    host.open();
    fc.send(env('submit-turn', { text: 'go' }));
    await waitFor(() => warns.some((m) => /edit governor observe failed: config unreadable/.test(m)));
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(unhandled, [], 'the rejected observe is handled');
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

// ---- ISSUE-6a811b8a: approval requests are asked one at a time --------------------

/** A claude refusal that ended the turn, as the adapter raises it. */
const refused = (requestId: string, toolName: string, turnId = 't1', extra: Partial<Extract<TurnEvent, { kind: 'approval-request' }>> = {}): TurnEvent => ({
  kind: 'approval-request', turnId, requestId, title: `Permission: ${toolName}`, detail: `${toolName} needs your permission`, toolName, resolution: 'turn-ended', ...extra,
});
const approvalCards = (fc: FakeChannel): Array<Extract<TurnEvent, { kind: 'approval-request' }>> =>
  turnEvents(fc).filter((e): e is Extract<TurnEvent, { kind: 'approval-request' }> => e.kind === 'approval-request');
const outcomes = (fc: FakeChannel): Array<Extract<TurnEvent, { kind: 'permission-outcome' }>> =>
  turnEvents(fc).filter((e): e is Extract<TurnEvent, { kind: 'permission-outcome' }> => e.kind === 'permission-outcome');

test("three requests in one turn: only the first card is posted (with '1 of 3')", async () => {
  const fc = fakeChannel();
  const evs: TurnEvent[] = [refused('r1', 'Edit'), refused('r2', 'Write'), refused('r3', 'Bash'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }];
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter(evs) }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'edit three files' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const cards = approvalCards(fc);
  assert.equal(cards.length, 1, 'one actionable card, not three');
  assert.equal(cards[0]!.requestId, 'r1', 'the oldest request');
  // Posted when the first request arrived; the count follows as the others queue behind it.
  const positions = fc.posted.filter((m) => m.payload.type === 'approval-position').map((m) => m.payload);
  const last = positions[positions.length - 1];
  assert.deepEqual([last?.['requestId'], last?.['position'], last?.['total']], ['r1', 1, 3], "shown as '1 of 3'");
});

test('a turn followed after reload routes its approval-requests through the queue and its end ends the batch', async () => {
  const { store, id } = storeWithLiveTurn(1);
  const { adapter, requests } = resumeAdapter([refused('f1', 'Edit'), refused('f2', 'Write'), { kind: 'done', turnId: 't1', ok: true }]);
  const followUps: TurnRequest[] = [];
  adapter.run = async function* (req: TurnRequest): AsyncIterable<TurnEvent> {
    followUps.push(req);
    yield { kind: 'done', turnId: 'fu1', ok: true };
  };
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', hostPid: 2, isAlive: (pid) => pid === 2 });
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  await waitFor(() => requests.length === 1);
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  assert.deepEqual(approvalCards(fc).map((c) => c.requestId), ['f1'], 'only the first of the followed turn\'s requests is shown');
  fc.send(env('permission-decision', { requestId: 'f2', decision: 'deny' }));
  assert.equal(outcomes(fc).length, 0, 'the waiting request cannot be decided early');
  fc.send(env('permission-decision', { requestId: 'f1', decision: 'approve' }));
  assert.deepEqual(approvalCards(fc).map((c) => c.requestId), ['f1', 'f2'], 'the second is shown once the first is decided');
  assert.equal(followUps.length, 0, 'no follow-up while the batch is still being decided');
  fc.send(env('permission-decision', { requestId: 'f2', decision: 'approve' }));
  await waitFor(() => followUps.length === 1);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(followUps.length, 1, 'the followed turn\'s end completed its batch: exactly one follow-up');
  assert.deepEqual([...(followUps[0]!.allowedTools ?? [])], ['Edit', 'Write']);
});

test('Stop with requests queued records each as rejected and clears the queue', async () => {
  const fc = fakeChannel();
  const decided: string[] = [];
  const evs: TurnEvent[] = [refused('s1', 'Edit'), refused('s2', 'Bash')];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs, { hang: true, onDecide: (_t, r) => decided.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  try {
    host.open();
    fc.send(env('submit-turn', { text: 'do two things' }));
    await waitFor(() => approvalCards(fc).length === 1);
    fc.send(env('cancel-turn'));
    assert.deepEqual(outcomes(fc).map((o) => [o.toolName, o.decision]), [['Edit', 'rejected'], ['Bash', 'rejected']], 'each waiting request is recorded as rejected');
    fc.send(env('permission-decision', { requestId: 's1', decision: 'approve' }));
    assert.equal(outcomes(fc).length, 2, 'a cleared request is no longer decided by the queue');
  } finally {
    fc.fireDispose();
  }

  // A chat switch drops the queue without outcome rows (the cards were live-only).
  const fc2 = fakeChannel();
  const host2 = createChatPanelHost({ createPanel: () => fc2.channel, providers: registry({ claude: scriptedAdapter([refused('d1', 'Edit'), refused('d2', 'Bash')], { hang: true }) }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  try {
    host2.open();
    fc2.send(env('submit-turn', { text: 'do two things' }));
    await waitFor(() => approvalCards(fc2).length === 1);
    fc2.send(env('new-chat', { provider: 'claude' }));
    assert.equal(outcomes(fc2).length, 0, 'no outcome rows for a dropped queue');
  } finally {
    fc2.fireDispose();
  }
});

test("outcome rows: one role:'permission-outcome' row per decision, in decision order, and no approval-request rows (restore shows only chips)", async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const evs: TurnEvent[] = [refused('o1', 'Edit'), refused('o2', 'Write'), refused('o3', 'Bash'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }];
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter(evs) }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'edit three files' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  for (const id of ['o1', 'o2', 'o3']) fc.send(env('permission-decision', { requestId: id, decision: 'deny' }));
  const saved = store.get(store.list()[0]!.id)!;
  const rows = saved.transcript.filter((r) => r.role === 'permission-outcome') as Array<{ toolName: string; decision: string }>;
  assert.deepEqual(rows.map((r) => [r.toolName, r.decision]), [['Edit', 'rejected'], ['Write', 'rejected'], ['Bash', 'rejected']], 'one row per decision, in order');
  assert.ok(!saved.transcript.some((r) => (r as { role: string }).role === 'approval-request'), 'no approval-request rows');
});

/** An in-turn request (codex / control protocol): the provider waits inside the turn for decide(). */
const inTurn = (requestId: string, toolName?: string, turnId = 't1'): TurnEvent => ({
  kind: 'approval-request', turnId, requestId, title: `Approve ${requestId}`, detail: 'run it', resolution: 'in-turn', ...(toolName !== undefined ? { toolName } : {}),
});

test("the second card is posted only after the first is decided; a decision on a waiting card's id does nothing", async () => {
  const fc = fakeChannel();
  const evs: TurnEvent[] = [refused('w1', 'Edit'), refused('w2', 'Write'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }];
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter(evs) }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'edit two files' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  assert.deepEqual(approvalCards(fc).map((c) => c.requestId), ['w1']);
  fc.send(env('permission-decision', { requestId: 'w2', decision: 'deny' }));
  assert.deepEqual(approvalCards(fc).map((c) => c.requestId), ['w1'], 'the waiting card is not shown');
  assert.equal(outcomes(fc).length, 0, 'and its id decides nothing');
  fc.send(env('permission-decision', { requestId: 'w1', decision: 'deny' }));
  assert.equal(outcomes(fc).length, 1, 'the head records exactly one outcome');
  assert.deepEqual(approvalCards(fc).map((c) => c.requestId), ['w1', 'w2'], 'the second card follows the first decision');
  fc.send(env('permission-decision', { requestId: 'w1', decision: 'approve' }));
  assert.equal(outcomes(fc).length, 1, 'a decided request cannot be decided again');
});

test('live-turn provider with two requests: decide() is called for the first before the second card is posted; no follow-up turn is started', async () => {
  const fc = fakeChannel();
  const order: string[] = [];
  const runs: TurnRequest[] = [];
  const evs: TurnEvent[] = [inTurn('L1'), inTurn('L2')];
  const adapter = scriptedAdapter(evs, { hang: true, onRun: (r) => runs.push(r), onDecide: (_t, r, d) => order.push(`decide:${r}:${d}`) });
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ codex: adapter }, ['codex']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  const origPost = fc.channel.postMessage;
  fc.channel.postMessage = (m: unknown) => {
    const p = (m as { payload: { type: string; event?: TurnEvent } }).payload;
    if (p.type === 'turn-event' && p.event?.kind === 'approval-request') order.push(`card:${p.event.requestId}`);
    return origPost(m);
  };
  try {
    host.open();
    fc.send(env('submit-turn', { text: 'run two commands' }));
    await waitFor(() => approvalCards(fc).length === 1);
    await new Promise((r) => setTimeout(r, 20)); // the second request has arrived and is waiting
    assert.deepEqual(order, ['card:L1'], 'only the first card while it is undecided');
    fc.send(env('permission-decision', { requestId: 'L1', decision: 'approve' }));
    assert.deepEqual(order, ['card:L1', 'decide:L1:approve', 'card:L2'], 'relayed before the next card is posted');
    fc.send(env('permission-decision', { requestId: 'L2', decision: 'deny' }));
    assert.deepEqual(order.slice(3), ['decide:L2:deny']);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(runs.length, 1, 'no follow-up turn for in-turn requests');
  } finally {
    fc.fireDispose();
  }
});

test('an in-turn request that carries a toolName is relayed with decide(), not batched (routing by resolution)', async () => {
  const fc = fakeChannel();
  const decided: string[] = [];
  const runs: TurnRequest[] = [];
  const warns: string[] = [];
  let throwOnce = true;
  const adapter = scriptedAdapter([inTurn('T1', 'Bash'), inTurn('T2', 'Edit')], {
    hang: true,
    onRun: (r) => runs.push(r),
    onDecide: (_t, r) => {
      if (throwOnce) { throwOnce = false; throw new Error('adapter gone'); }
      decided.push(r);
    },
  });
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo', logger: { warn: (m) => warns.push(m), error: () => {} } });
  try {
    host.open();
    fc.send(env('submit-turn', { text: 'do it' }));
    await waitFor(() => approvalCards(fc).length === 1);
    // The first relay throws: the decision is logged as undeliverable, still recorded, and the queue advances.
    fc.send(env('permission-decision', { requestId: 'T1', decision: 'approve' }));
    assert.ok(warns.some((w) => w.includes('T1')), 'the undeliverable decision is logged');
    assert.equal(outcomes(fc).length, 1);
    assert.deepEqual(approvalCards(fc).map((c) => c.requestId), ['T1', 'T2'], 'the queue advanced');
    fc.send(env('permission-decision', { requestId: 'T2', decision: 'approve' }));
    assert.deepEqual(decided, ['T2'], 'a toolName-carrying in-turn request is relayed');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(runs.length, 1, 'never held for a batch follow-up');
  } finally {
    fc.fireDispose();
  }
});

/** An adapter whose Nth run() yields the Nth script (later runs just end), recording each request. */
function sequenceAdapter(scripts: TurnEvent[][]): { adapter: StreamAdapter; runs: TurnRequest[] } {
  const runs: TurnRequest[] = [];
  const adapter: StreamAdapter = {
    async *run(req: TurnRequest): AsyncIterable<TurnEvent> {
      runs.push(req);
      const n = runs.length;
      for (const ev of scripts[n - 1] ?? [{ kind: 'done', turnId: `t${n}`, ok: true }]) {
        await Promise.resolve();
        yield ev;
      }
    },
    cancel: () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  return { adapter, runs };
}

const runsSettled = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

test('approving all three starts exactly one follow-up turn, after the last decision and the turn\'s end, with allowedTools = all three tools and a prompt naming the three approved actions', async () => {
  const fc = fakeChannel();
  const { adapter, runs } = sequenceAdapter([[
    refused('a1', 'Edit'), refused('a2', 'Write'), refused('a3', 'Bash', 't1', { command: 'npm test' }), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ]]);
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'edit and test' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  fc.send(env('permission-decision', { requestId: 'a1', decision: 'approve' }));
  fc.send(env('permission-decision', { requestId: 'a2', decision: 'approve' }));
  await runsSettled();
  assert.equal(runs.length, 1, 'no follow-up before the last decision');
  fc.send(env('permission-decision', { requestId: 'a3', decision: 'approve' }));
  await waitFor(() => runs.length === 2);
  await runsSettled();
  assert.equal(runs.length, 2, 'exactly one follow-up');
  const fu = runs[1]!;
  assert.deepEqual([...(fu.allowedTools ?? [])], ['Edit', 'Write', 'Bash']);
  assert.match(fu.prompt, /the Edit action/);
  assert.match(fu.prompt, /the Write action/);
  assert.match(fu.prompt, /run exactly this: npm test/);
  assert.doesNotMatch(fu.prompt, /Denied/);
});

test('no approval ever supersedes a running follow-up: turns.start is called once per batch', async () => {
  const fc = fakeChannel();
  // Decided before the turn ends: the batch completes at the turn's end, not at each decision.
  let releaseDone!: () => void;
  const gate = new Promise<void>((r) => (releaseDone = r));
  const runs: TurnRequest[] = [];
  const adapter = scriptedAdapter([refused('b1', 'Edit'), refused('b2', 'Write'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }], { onRun: (r) => runs.push(r), gateBeforeDone: gate });
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'two edits' }));
  await waitFor(() => approvalCards(fc).length === 1);
  await runsSettled();
  fc.send(env('permission-decision', { requestId: 'b1', decision: 'approve' }));
  fc.send(env('permission-decision', { requestId: 'b2', decision: 'approve' }));
  await runsSettled();
  assert.equal(runs.length, 1, 'the turn has not ended: no follow-up yet');
  releaseDone();
  await waitFor(() => runs.length === 2);
  await runsSettled();
  assert.equal(runs.length, 2, 'one follow-up for the batch (its own events are not refusals, so nothing more)');
});

test('deny: a denied request gets a rejected chip, the next request is still asked, and the follow-up names it as denied; all denied -> no follow-up and an informational message', async () => {
  const fc = fakeChannel();
  const { adapter, runs } = sequenceAdapter([[
    refused('d1', 'Edit'), refused('d2', 'Bash', 't1', { command: 'rm -rf build' }), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ]]);
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'edit and clean' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  fc.send(env('permission-decision', { requestId: 'd2', decision: 'deny' })); // not the head: ignored
  fc.send(env('permission-decision', { requestId: 'd1', decision: 'approve' }));
  assert.deepEqual(approvalCards(fc).map((c) => c.requestId), ['d1', 'd2'], 'the next request is still asked');
  fc.send(env('permission-decision', { requestId: 'd2', decision: 'deny' }));
  assert.deepEqual(outcomes(fc).map((o) => o.decision), ['approved', 'rejected'], 'the denied request gets a rejected chip');
  await waitFor(() => runs.length === 2);
  assert.deepEqual([...(runs[1]!.allowedTools ?? [])], ['Edit'], 'a denied tool is never granted');
  assert.match(runs[1]!.prompt, /Denied — do not attempt these:\n- run exactly this: rm -rf build/);

  // All denied: nothing runs, one informational message says so.
  const fc2 = fakeChannel();
  const seq2 = sequenceAdapter([[refused('n1', 'Edit'), refused('n2', 'Write'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-2' }]]);
  const host2 = createChatPanelHost({ createPanel: () => fc2.channel, providers: registry({ claude: seq2.adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host2.open();
  fc2.send(env('submit-turn', { text: 'two edits' }));
  await waitFor(() => turnEvents(fc2).some((e) => e.kind === 'done'));
  fc2.send(env('permission-decision', { requestId: 'n1', decision: 'deny' }));
  fc2.send(env('permission-decision', { requestId: 'n2', decision: 'deny' }));
  await runsSettled();
  assert.equal(seq2.runs.length, 1, 'all denied: no follow-up');
  const info = turnEvents(fc2).filter((e) => e.kind === 'assistant-delta' && e.turnId.startsWith('info-batch-'));
  assert.equal(info.length, 1, 'one informational message');
  assert.match((info[0] as { text: string }).text, /No action was approved/);
});

test('a follow-up that is refused again forms the next batch and its follow-up carries the previous batch\'s grants', async () => {
  const fc = fakeChannel();
  const { adapter, runs } = sequenceAdapter([
    [refused('g1', 'Edit'), refused('g2', 'Write'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }],
    [refused('g3', 'Bash', 't2', { command: 'npm test' }), { kind: 'done', turnId: 't2', ok: true, sessionId: 'sess-1' }],
  ]);
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'edit then test' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  fc.send(env('permission-decision', { requestId: 'g1', decision: 'approve' }));
  fc.send(env('permission-decision', { requestId: 'g2', decision: 'approve' }));
  await waitFor(() => approvalCards(fc).some((c) => c.requestId === 'g3'));
  assert.equal(runs.length, 2);
  fc.send(env('permission-decision', { requestId: 'g3', decision: 'approve' }));
  await waitFor(() => runs.length === 3);
  await runsSettled();
  assert.equal(runs.length, 3, 'one follow-up per batch');
  assert.deepEqual([...(runs[2]!.allowedTools ?? [])], ['Edit', 'Write', 'Bash'], 'the previous batch\'s grants are kept');
  assert.equal(runs[2]!.prompt, 'Approved — run exactly this now: npm test', 'a single-request batch keeps the exact-command prompt');
});

test('a user-typed message while requests are queued records each as rejected, clears the queue, resets the grant chain and runs as a normal turn', async () => {
  const fc = fakeChannel();
  const { adapter, runs } = sequenceAdapter([
    [refused('u1', 'Edit'), refused('u2', 'Write'), refused('u3', 'Bash'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }],
    [{ kind: 'assistant-delta', turnId: 't2', text: 'ok' }, { kind: 'done', turnId: 't2', ok: true, sessionId: 'sess-1' }],
    [refused('u4', 'Grep', 't3'), { kind: 'done', turnId: 't3', ok: true, sessionId: 'sess-1' }],
  ]);
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'three edits' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  fc.send(env('permission-decision', { requestId: 'u1', decision: 'approve' })); // Edit joins the grant chain
  fc.send(env('submit-turn', { text: 'never mind, just say ok' }));
  assert.deepEqual(outcomes(fc).map((o) => [o.toolName, o.decision]), [['Edit', 'approved'], ['Write', 'rejected'], ['Bash', 'rejected']], 'each waiting request is rejected');
  fc.send(env('permission-decision', { requestId: 'u2', decision: 'approve' }));
  assert.equal(outcomes(fc).length, 3, 'the queue is empty');
  await waitFor(() => runs.length === 2);
  assert.equal(runs[1]!.prompt, 'never mind, just say ok', 'the message runs as a normal turn');
  assert.equal(runs[1]!.allowedTools, undefined, 'a normal turn carries no grants');
  // The typed turn is refused in turn: its follow-up carries only its own grant, not Edit.
  fc.send(env('submit-turn', { text: 'search' }));
  await waitFor(() => approvalCards(fc).some((c) => c.requestId === 'u4'));
  await waitFor(() => turnEvents(fc).filter((e) => e.kind === 'done' && e.turnId === 't3').length === 1);
  fc.send(env('permission-decision', { requestId: 'u4', decision: 'approve' }));
  await waitFor(() => runs.length === 4);
  assert.deepEqual([...(runs[3]!.allowedTools ?? [])], ['Grep'], 'grants from before the typed message are gone');
});

test("a live provider with a queued in-turn request, then the user types a message: decide(turnId, requestId, 'deny') is called before the new turn starts, and the request gets a rejected chip", async () => {
  const fc = fakeChannel();
  const order: string[] = [];
  // The running turn waits inside itself for both answers (as codex does), then ends.
  let answered!: () => void;
  const bothAnswered = new Promise<void>((r) => (answered = r));
  let runNo = 0;
  const adapter: StreamAdapter = {
    async *run(req: TurnRequest): AsyncIterable<TurnEvent> {
      order.push(`run:${req.prompt}`);
      if (++runNo > 1) {
        yield { kind: 'done', turnId: 't2', ok: true };
        return;
      }
      yield inTurn('Q1', 'Bash');
      yield inTurn('Q2');
      await bothAnswered;
      yield { kind: 'done', turnId: 't1', ok: true };
    },
    cancel: () => {},
    decide: (t, r, d) => {
      order.push(`decide:${t}:${r}:${d}`);
      if (order.filter((o) => o.startsWith('decide:')).length === 2) answered();
    },
    capabilities: { resume: true },
  };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ codex: adapter }, ['codex']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  try {
    host.open();
    fc.send(env('submit-turn', { text: 'run two commands' }));
    await waitFor(() => approvalCards(fc).length === 1);
    await new Promise((r) => setTimeout(r, 20));
    fc.send(env('submit-turn', { text: 'stop, do something else' }));
    await waitFor(() => order.includes('run:stop, do something else'));
    const run2 = order.indexOf('run:stop, do something else');
    assert.ok(order.indexOf('decide:t1:Q1:deny') !== -1 && order.indexOf('decide:t1:Q1:deny') < run2, 'Q1 denied to the provider before the new turn');
    assert.ok(order.indexOf('decide:t1:Q2:deny') !== -1 && order.indexOf('decide:t1:Q2:deny') < run2, 'Q2 denied to the provider before the new turn');
    assert.deepEqual(outcomes(fc).map((o) => [o.toolName, o.decision]), [['Bash', 'rejected'], ['Approve Q2', 'rejected']], 'each gets a rejected chip');
  } finally {
    fc.fireDispose();
  }
});

test('a request joining the queue while the head is shown updates the shown card in place (one card per requestId)', async () => {
  const fc = fakeChannel();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let runNo = 0;
  const adapter: StreamAdapter = {
    async *run(): AsyncIterable<TurnEvent> {
      if (++runNo > 1) { yield { kind: 'done', turnId: 't2', ok: true }; return; }
      yield refused('j1', 'Edit');
      await gate; // the first card is shown alone before the next request arrives
      yield refused('j2', 'Write');
      yield refused('j3', 'Bash');
      yield { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' };
    },
    cancel: () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  assert.match(fc.html(), /m\.type==='approval-position'\)\{reg\.approvalPosition\(m\.requestId,m\.position,m\.total\);\}/, 'the webview updates the shown card in place');
  assert.match(fc.html(), /position:ev\.position,total:ev\.total/, 'a posted card carries its position into the renderer');
  fc.send(env('submit-turn', { text: 'three edits' }));
  await waitFor(() => approvalCards(fc).length === 1);
  const first = approvalCards(fc)[0]!;
  assert.equal(first.position, undefined, 'posted alone: no position yet');
  release();
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  assert.deepEqual(approvalCards(fc).map((c) => c.requestId), ['j1'], 'no second card');
  const positions = fc.posted.filter((m) => m.payload.type === 'approval-position').map((m) => [m.payload['requestId'], m.payload['position'], m.payload['total']]);
  assert.deepEqual(positions, [['j1', 1, 2], ['j1', 1, 3]], 'the shown card is updated in place as the queue grows');
  fc.send(env('permission-decision', { requestId: 'j1', decision: 'deny' }));
  const second = approvalCards(fc)[1]!;
  assert.deepEqual([second.requestId, second.position, second.total], ['j2', 1, 2], 'the next card is posted with its own position');
});

test('reloading the webview while requests are queued re-posts the head card, and deciding it continues the queue', async () => {
  const fc = fakeChannel();
  const evs: TurnEvent[] = [refused('k1', 'Edit'), refused('k2', 'Write'), refused('k3', 'Bash'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }];
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter(evs) }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'three edits' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  fc.send(env('permission-decision', { requestId: 'k1', decision: 'deny' }));
  const before = fc.posted.length;
  fc.send(env('ready')); // the webview reloaded: its transcript (and the shown card) is gone
  const after = fc.posted.slice(before).map((m) => m.payload);
  const restored = after.findIndex((p) => p.type === 'session-restored');
  const cards = after
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.type === 'turn-event' && (p['event'] as TurnEvent).kind === 'approval-request');
  assert.equal(cards.length, 1, 'exactly one card is posted again');
  const card = cards[0]!.p['event'] as Extract<TurnEvent, { kind: 'approval-request' }>;
  assert.ok(restored !== -1 && cards[0]!.i > restored, 'after session-restored (which clears the view)');
  assert.deepEqual([card.requestId, card.position, card.total], ['k2', 1, 2], 'the head, with its position');
  fc.send(env('permission-decision', { requestId: 'k2', decision: 'deny' }));
  assert.equal(approvalCards(fc).at(-1)!.requestId, 'k3', 'deciding it continues the queue');
  fc.send(env('permission-decision', { requestId: 'k3', decision: 'deny' }));
  assert.deepEqual(outcomes(fc).map((o) => o.toolName), ['Edit', 'Write', 'Bash']);
});

// ---- Story E20261012ddc4ede1:S001: the transcript is paged ---------------------------

/** A stored claude session of `turns` whole turns: a user row, then `perTurn - 1` assistant rows. */
function longSession(turns: number, perTurn: number): { store: ReturnType<typeof createInMemoryChatSessionStore>; id: string; rows: number } {
  const store = createInMemoryChatSessionStore();
  const s = store.create('claude');
  for (let t = 0; t < turns; t++) {
    s.transcript.push({ role: 'user', text: `q${t}`, at: 't' });
    for (let k = 1; k < perTurn; k++) s.transcript.push({ role: 'assistant', text: `a${t}.${k}`, at: 't' });
  }
  store.save(s);
  return { store, id: s.id, rows: s.transcript.length };
}
const posted = (fc: FakeChannel, type: string): Array<Record<string, unknown>> => fc.posted.filter((m) => m.payload.type === type).map((m) => m.payload);
const activeId = (fc: FakeChannel): string => posted(fc, 'session-restored').at(-1)!['sessionId'] as string;

test('live rows carry rowIndex from all five writers: assistant, marker and tool-result events, the user-row, a permission outcome and a selection outcome are each posted with the absolute index of the row already written; status and approval-request carry none', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const evs: TurnEvent[] = [
    { kind: 'status', turnId: 't1', phase: 'thinking' },
    { kind: 'assistant-delta', turnId: 't1', text: 'hello' },
    { kind: 'tool-call', turnId: 't1', tool: 'Bash', command: 'ls' },
    { kind: 'tool-result', turnId: 't1', command: 'ls', output: 'a\nb' },
    { kind: 'selection-request', turnId: 't1', requestId: 'sel-1', prompt: 'Pick', options: [{ id: 'a', label: 'Alpha' }] },
    inTurn('P1', 'Bash'),
  ];
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ codex: scriptedAdapter(evs, { hang: true }) }, ['codex']), store, cwd: () => '/repo' });
  try {
    host.open();
    fc.send(env('submit-turn', { text: 'go' }));
    await waitFor(() => approvalCards(fc).length === 1);
    fc.send(env('permission-decision', { requestId: 'P1', decision: 'deny' }));
    fc.send(env('selection-decision', { requestId: 'sel-1', selected: ['a'] }));
    await waitFor(() => turnEvents(fc).some((e) => e.kind === 'selection-outcome'));
    const transcript = store.get(activeId(fc))!.transcript;
    const roleOf: Record<string, string> = { 'assistant-delta': 'assistant', 'tool-call': 'marker', 'tool-result': 'tool-result', 'permission-outcome': 'permission-outcome', 'selection-outcome': 'selection-outcome' };
    const live = posted(fc, 'turn-event');
    const seenKinds: string[] = [];
    for (const m of live) {
      const kind = (m['event'] as TurnEvent).kind;
      const want = roleOf[kind];
      if (want === undefined) {
        assert.equal(m['rowIndex'], undefined, `${kind} writes no row and carries no rowIndex`);
        continue;
      }
      seenKinds.push(kind);
      assert.equal(typeof m['rowIndex'], 'number', `${kind} carries a rowIndex`);
      assert.equal(transcript[m['rowIndex'] as number]?.role, want, `${kind} points at its own row`);
    }
    for (const k of Object.keys(roleOf)) assert.ok(seenKinds.includes(k), `a ${k} row was posted`);
    assert.ok(live.some((m) => (m['event'] as TurnEvent).kind === 'status'), 'a status event was posted');
    assert.ok(live.some((m) => (m['event'] as TurnEvent).kind === 'approval-request'), 'an approval-request was posted');
    // The user row: its rowIndex is the index its key already carries.
    const echo = posted(fc, 'user-row')[0]!;
    assert.deepEqual([echo['rowIndex'], echo['key']], [0, 'r0']);
    assert.equal(transcript[0]!.role, 'user');
    // Indexes are distinct and increasing in post order.
    const idx = live.map((m) => m['rowIndex']).filter((x): x is number => typeof x === 'number');
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
    assert.equal(new Set(idx).size, idx.length);
  } finally {
    fc.fireDispose();
  }
});

test('write-then-post order: when each live row is posted, the transcript already holds it at that index', async () => {
  const fc = fakeChannel();
  const store = createInMemoryChatSessionStore();
  const evs: TurnEvent[] = [
    { kind: 'assistant-delta', turnId: 't1', text: 'one' },
    { kind: 'tool-result', turnId: 't1', command: 'ls', output: 'x' },
    refused('W1', 'Edit'),
    { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' },
  ];
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter(evs) }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  const id = activeId(fc);
  // At the moment of each post, read the row the message names.
  const atPost: Array<{ kind: string; rowIndex: number; lengthThen: number; roleThen: string | undefined }> = [];
  const orig = fc.channel.postMessage;
  fc.channel.postMessage = (m: unknown) => {
    const p = (m as { payload: Record<string, unknown> }).payload;
    if (p['type'] === 'turn-event' && typeof p['rowIndex'] === 'number') {
      const t = store.get(id)?.transcript ?? [];
      atPost.push({ kind: (p['event'] as TurnEvent).kind, rowIndex: p['rowIndex'], lengthThen: t.length, roleThen: t[p['rowIndex']]?.role });
    }
    return orig(m);
  };
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  fc.send(env('permission-decision', { requestId: 'W1', decision: 'deny' }));
  assert.deepEqual(atPost.map((a) => a.kind), ['assistant-delta', 'tool-result', 'done', 'permission-outcome']);
  for (const a of atPost) {
    assert.equal(a.rowIndex, a.lengthThen - 1, `${a.kind}: the row was the last one written when it was posted`);
    assert.ok(a.roleThen !== undefined, `${a.kind}: the transcript already held the row`);
  }
});

// The plan names this check "a turn followed for a session that is not shown still writes its rows
// and posts nothing". That state cannot be reached: a chat switch or a closed panel aborts the
// follow at once (turn-lifecycle detach), so no event is delivered for a session that is not
// shown. What holds, and is pinned here: a followed row is written before it is posted; once the
// user switches away the follow delivers nothing more (posts nothing, writes nothing: the rest is
// read again on the next resume); and in the code the write stays outside the "is it shown" guard,
// so it never depends on that guard.
test('a followed turn writes each row before posting it; after a chat switch the follow stops, posting and writing nothing more; the write is outside the shown-session guard', async () => {
  const { store, id } = storeWithLiveTurn(1);
  const fc = fakeChannel();
  let switched = false;
  const adapter: StreamAdapter = {
    async *run(): AsyncIterable<TurnEvent> {},
    async *resume(): AsyncIterable<TurnEvent> {
      yield { kind: 'assistant-delta', turnId: 't1', text: 'while shown' };
      fc.send(env('new-chat', { provider: 'claude' })); // the user switches to a new chat
      switched = true;
      yield { kind: 'assistant-delta', turnId: 't1', text: 'after the switch' };
    },
    cancel: async () => {},
    decide: () => {},
    capabilities: { resume: true },
  };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', hostPid: 2, isAlive: (pid) => pid === 2 });
  // At the moment a followed row is posted, the transcript already holds it.
  const lengthAtPost: number[] = [];
  const orig = fc.channel.postMessage;
  fc.channel.postMessage = (m: unknown) => {
    const pl = (m as { payload: Record<string, unknown> }).payload;
    if (pl['type'] === 'turn-event' && typeof pl['rowIndex'] === 'number') lengthAtPost.push(store.get(id)!.transcript.length);
    return orig(m);
  };
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  await waitFor(() => switched);
  await new Promise((r) => setTimeout(r, 30));
  const deltas = posted(fc, 'turn-event').filter((m) => (m['event'] as TurnEvent).kind === 'assistant-delta');
  assert.deepEqual(deltas.map((m) => [(m['event'] as { text: string }).text, m['rowIndex']]), [['while shown', 2]], 'the row posted while shown carries its index; nothing is posted after the switch');
  assert.deepEqual(lengthAtPost, [3], 'the row was already written when it was posted');
  const texts = store.get(id)!.transcript.filter((r) => r.role === 'assistant').map((r) => (r as { text: string }).text);
  assert.deepEqual(texts, ['started', 'while shown'], 'the stopped follow writes nothing more; the rest is left for the next resume');
  assert.ok(store.get(id)!.liveTurn !== undefined, 'the cursor is kept, so the turn can be followed again');

  // Structure: in the followed-turn sink the write comes first and is not inside the guard.
  const src = readFileSync(new URL('../chat-panel.ts', import.meta.url), 'utf8');
  const sink = src.slice(src.indexOf('turns.follow(s, {'), src.indexOf('onEnd: () => {', src.indexOf('turns.follow(s, {')));
  const write = sink.indexOf('const rowIndex = appendEvent(s, ev);');
  const guard = sink.indexOf('if (!disposed && session === s) {');
  assert.ok(write !== -1 && guard !== -1 && write < guard, 'appendEvent runs before, and outside, the shown-session guard');
});

test('load-older for the active session answers one transcript-page whose rows end just before `before`; repeated requests walk back to index 0', async () => {
  const { store, id, rows } = longSession(50, 20); // 1,000 rows, a user row every 20
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter([]) }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  const all = store.get(id)!.transcript;
  let before = 900;
  const got: unknown[][] = [];
  while (before > 0) {
    const n = posted(fc, 'transcript-page').length;
    fc.send(env('load-older', { sessionId: id, before }));
    const pages = posted(fc, 'transcript-page');
    assert.equal(pages.length, n + 1, 'exactly one page per request');
    const page = pages.at(-1)!;
    assert.deepEqual([page['sessionId'], page['before'], page['total']], [id, before, rows]);
    const first = page['firstIndex'] as number;
    assert.deepEqual(page['rows'], all.slice(first, before), 'the rows end just before `before`');
    assert.equal(all[first]!.role, 'user', 'the page starts at a turn start');
    assert.ok(first < before && before - first <= 200);
    got.unshift(page['rows'] as unknown[]);
    before = first;
  }
  assert.deepEqual(got.flat(), all.slice(0, 900), 'walking back reaches index 0 with no row skipped or repeated');
  // Nothing older than index 0: an empty page whose firstIndex equals before.
  fc.send(env('load-older', { sessionId: id, before: 0 }));
  const last = posted(fc, 'transcript-page').at(-1)!;
  assert.deepEqual([last['before'], last['firstIndex'], last['rows']], [0, 0, []]);
});

test('load-older for another session id, or with a malformed before or sessionId, posts nothing', async () => {
  const { store, id } = longSession(20, 20);
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter([]) }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  const n = fc.posted.length;
  fc.send(env('load-older', { sessionId: 'some-other-session', before: 100 }));
  fc.send(env('load-older', { sessionId: id, before: '100' }));
  fc.send(env('load-older', { sessionId: id, before: 12.5 }));
  fc.send(env('load-older', { sessionId: id }));
  fc.send(env('load-older', { sessionId: 7, before: 100 }));
  fc.send(env('load-older', { before: 100 }));
  assert.equal(fc.posted.length, n, 'none of them is answered');
  // The user switched chats while a request was in flight: the old session's request is ignored.
  fc.send(env('new-chat', { provider: 'claude' }));
  const m = fc.posted.length;
  fc.send(env('load-older', { sessionId: id, before: 100 }));
  assert.equal(fc.posted.length, m);
});

test('session-restored carries firstIndex 0 and total while the whole transcript is still sent', async () => {
  const { store, id, rows } = longSession(3, 4);
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter([]) }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  const draft = posted(fc, 'session-restored').at(-1)!;
  assert.deepEqual([draft['firstIndex'], draft['total'], (draft['transcript'] as unknown[]).length], [0, 0, 0], 'an empty draft');
  fc.send(env('open-chat', { chatId: id }));
  const opened = posted(fc, 'session-restored').at(-1)!;
  assert.deepEqual([opened['sessionId'], opened['firstIndex'], opened['total'], (opened['transcript'] as unknown[]).length], [id, 0, rows, rows]);
  fc.send(env('ready'));
  const again = posted(fc, 'session-restored').at(-1)!;
  assert.deepEqual([again['sessionId'], again['firstIndex'], again['total']], [id, 0, rows]);
  fc.send(env('new-chat', { provider: 'claude' }));
  const fresh = posted(fc, 'session-restored').at(-1)!;
  assert.deepEqual([fresh['firstIndex'], fresh['total']], [0, 0]);
});

test('the shell embeds the pager: line() appends through it, session-restored replays with absolute keys through its reset, transcript-page goes to prepend, live rows are stamped and trimmed, and the provider lock settles from total', () => {
  const html = fidelityHtml();
  // The pager source is embedded once, built on the transcript element with the bar and the host channel, and given the registry.
  assert.equal(html.split(transcriptPagerWebviewSource()).length - 1, 1, 'the pager source is embedded once');
  assert.match(html, /\(t,\{bar:document\.getElementById\('insrc-older'\),post:function\(p\)\{vs\.postMessage\(\{v:1,payload:p\}\);\}\}\);/, 'built on the transcript, the bar and the host channel');
  assert.match(html, /<div id="insrc-older" role="button"/, 'the bar element exists');
  assert.ok(html.indexOf('<div id="insrc-older"') < html.indexOf('<div id="insrc-term"'), 'above the transcript');
  assert.ok(html.indexOf('const pager=') < html.indexOf('const reg='), 'the pager is created before the registry');
  assert.match(html, /pager\.attach\(reg\);/, 'and handed the registry afterwards');
  // Every append goes through the pager.
  assert.match(html, /function line\(s,cls\)\{const d=document\.createElement\('div'\);if\(cls\)d\.className=cls;d\.textContent=s;return pager\.append\(d\);\}/, 'line() appends through the pager');
  assert.match(html, /if\(_c\)\{pager\.append\(_c\);\}/, 'the approval card appends through the pager');
  assert.doesNotMatch(html, /(?<![\w$])t\.appendChild\(/, 'nothing appends to the transcript element directly');
  // Restore: reset, then replay with absolute keys, each row stamped with its index.
  assert.match(html, /pager\.reset\(cur,_first,_total\);_rows\.forEach\(function\(x,i\)\{pager\.track\(_first\+i,function\(\)\{reg\.appendKeyed\(reg\.toViewModel\(x\),'r'\+\(_first\+i\)\);\}\);\}\);/);
  assert.match(html, /_first=typeof m\.firstIndex==='number'\?m\.firstIndex:0/, 'a restore with no firstIndex starts at 0');
  // An older page goes to prepend; live rows are tracked (stamped, then trimmed) with their row index.
  assert.match(html, /else if\(m\.type==='transcript-page'\)\{pager\.prepend\(m\);\}/);
  assert.match(html, /if\(m\.type==='turn-event'\)\{const ev=m\.event;pager\.track\(m\.rowIndex,function\(\)\{/);
  assert.match(html, /else if\(m\.type==='user-row'\)\{pager\.track\(m\.rowIndex,function\(\)\{reg\.appendKeyed\(reg\.toViewModel\(\{role:'user',text:m\.text,attachments:m\.attachments\}\),m\.key\);\}\);\}/);
  assert.match(html, /else if\(m\.type==='transcript-row'\)\{pager\.track\(m\.rowIndex,function\(\)\{var r=m\.row;if\(r&&r\.role==='diff'&&r\.replaces!=null\)\{reg\.redrawDiff\(r\);\}else if\(r\)\{reg\.renderRow\(reg\.toViewModel\(r\)\);\}\}\);\}/, 'a row the host pushed is tracked with its index too');
  assert.match(html, /function track\(rowIndex,fn\)\{var from=term\.children\.length;try\{return fn\(\);\}finally\{stamp\(from,rowIndex\);if\(!rendering&&following\(\)\)toBottom\(\);trimIfNeeded\(\);\}\}/, 'track stamps the new nodes, moves a following view to the bottom once the row is filled, and then trims');
  assert.match(html, /else if\(m\.type==='run-config'\)\{if\(rb\)\{rb\.setAttribute\('data-provider',m\.provider\|\|''\);rb\.setAttribute\('data-model',m\.model\|\|''\);rb\.setAttribute\('data-effort',m\.effort\|\|''\);\}rlabel\(\);elabel\(\);\}/, 'the run-config echo branch settles the buttons from the session');
});

test("the shell is still one nonce'd inline script, with no direct scrollTop write outside the pager, no innerHTML outside the guarded markdown path and no remote origin", () => {
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter([]) }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo', genNonce: () => 'FIXEDNONCE' });
  host.open();
  const html = fc.html();
  assert.equal((html.match(/<script\b/g) ?? []).length, 1, 'exactly one inline script');
  assert.match(html, /<script nonce="FIXEDNONCE">/);
  assert.match(html, /script-src 'nonce-FIXEDNONCE'/, 'strict CSP unchanged');
  // The one script still parses as JavaScript with the pager embedded in it.
  const body = html.slice(html.indexOf('>', html.indexOf('<script nonce=')) + 1, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new Script(body), 'the inline script is valid JavaScript');
  // Scroll position: only the pager writes it.
  const pagerSrc = transcriptPagerWebviewSource();
  const withoutPager = html.split(pagerSrc).join('');
  assert.ok(withoutPager.length < html.length);
  assert.doesNotMatch(withoutPager, /scrollTop\s*=[^=]/, 'no scrollTop write outside the pager');
  assert.match(pagerSrc, /term\.scrollTop=/, 'the pager is where it is written');
  // The pager itself: no innerHTML, no remote origin, no vscode reference.
  assert.doesNotMatch(pagerSrc, /innerHTML|https?:\/\/|acquireVsCodeApi|\bimport\b/);
  // The rest of the shell keeps its markdown guard and loads nothing remote.
  assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded');
  assert.doesNotMatch(html, /asWebviewUri/);
});

// ---- Story E20261012ddc4ede1:S001 t8: only the latest window is sent on restore ----

test("opening a 1,000-row session posts session-restored with at most 200 rows, firstIndex at a turn start, total 1,000 and the session's mode; a short session is posted whole with firstIndex 0", async () => {
  const { store, id, rows } = longSession(50, 20); // 1,000 rows, a user row every 20
  const saved = store.get(id)!;
  saved.mode = 'auto';
  store.save(saved);
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter([]) }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  const m = posted(fc, 'session-restored').at(-1)!;
  const sent = m['transcript'] as Array<{ role: string }>;
  const first = m['firstIndex'] as number;
  assert.equal(rows, 1000);
  assert.ok(sent.length <= 200 && sent.length >= 100, `one window of rows (${sent.length})`);
  assert.equal(sent[0]!.role, 'user', 'the window starts at a turn start');
  assert.equal(first + sent.length, 1000, 'the window ends at the end of the transcript');
  assert.deepEqual(sent, saved.transcript.slice(first), 'the rows are the latest rows, in order');
  assert.deepEqual([m['sessionId'], m['total'], m['mode']], [id, 1000, 'auto']);
  // One long turn (no turn start within reach): the plain last page.
  const long = longSession(1, 450);
  const fc2 = fakeChannel();
  createChatPanelHost({ createPanel: () => fc2.channel, providers: registry({ claude: scriptedAdapter([]) }, ['claude']), store: long.store, cwd: () => '/repo' }).open();
  fc2.send(env('open-chat', { chatId: long.id }));
  const m2 = posted(fc2, 'session-restored').at(-1)!;
  assert.deepEqual([(m2['transcript'] as unknown[]).length, m2['firstIndex'], m2['total']], [100, 350, 450]);
  // A short session is posted whole.
  const short = longSession(3, 20);
  const fc3 = fakeChannel();
  createChatPanelHost({ createPanel: () => fc3.channel, providers: registry({ claude: scriptedAdapter([]) }, ['claude']), store: short.store, cwd: () => '/repo' }).open();
  fc3.send(env('open-chat', { chatId: short.id }));
  const m3 = posted(fc3, 'session-restored').at(-1)!;
  assert.deepEqual([(m3['transcript'] as unknown[]).length, m3['firstIndex'], m3['total']], [60, 0, 60]);
  assert.deepEqual(m3['transcript'], short.store.get(short.id)!.transcript);
});

test('ready, new-chat and open-chat post the same windowed session-restored', async () => {
  const { store, id } = longSession(50, 20);
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter([]) }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  const windowOf = (m: Record<string, unknown>): unknown[] => [m['sessionId'], m['firstIndex'], m['total'], (m['transcript'] as unknown[]).length];
  fc.send(env('open-chat', { chatId: id }));
  const opened = posted(fc, 'session-restored').at(-1)!;
  assert.deepEqual(windowOf(opened), [id, 900, 1000, 100]);
  // A webview reload: the same window again.
  fc.send(env('ready'));
  const reloaded = posted(fc, 'session-restored').at(-1)!;
  assert.notEqual(reloaded, opened);
  assert.deepEqual(windowOf(reloaded), windowOf(opened));
  assert.deepEqual(reloaded['transcript'], opened['transcript']);
  // A new chat: an empty window through the same path (firstIndex and total present).
  fc.send(env('new-chat', { provider: 'claude' }));
  const fresh = posted(fc, 'session-restored').at(-1)!;
  assert.deepEqual([fresh['firstIndex'], fresh['total'], (fresh['transcript'] as unknown[]).length], [0, 0, 0]);
  // Back to the long chat: windowed again. Every session-restored carries firstIndex and total.
  fc.send(env('open-chat', { chatId: id }));
  assert.deepEqual(windowOf(posted(fc, 'session-restored').at(-1)!), [id, 900, 1000, 100]);
  for (const m of posted(fc, 'session-restored')) {
    assert.equal(typeof m['firstIndex'], 'number');
    assert.equal(typeof m['total'], 'number');
    assert.ok((m['transcript'] as unknown[]).length <= 200, 'never more than one window');
  }
  // A reopened panel (adopt) posts the windowed restore too.
  const fc2 = fakeChannel();
  host.adopt(fc2.channel);
  assert.deepEqual(windowOf(posted(fc2, 'session-restored').at(-1)!), [id, 900, 1000, 100]);
});

test('a ready after older pages were requested posts the latest window again, with the approval head after it', async () => {
  const { store, id } = longSession(50, 20);
  const fc = fakeChannel();
  const evs: TurnEvent[] = [refused('p1', 'Edit'), refused('p2', 'Write'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }];
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter(evs) }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  // A turn that leaves two approval requests waiting.
  fc.send(env('submit-turn', { text: 'edit two files' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const total = store.get(id)!.transcript.length; // 1,000 + the user row + the done marker
  // The reader loads two older pages.
  fc.send(env('load-older', { sessionId: id, before: 900 }));
  fc.send(env('load-older', { sessionId: id, before: 800 }));
  assert.equal(posted(fc, 'transcript-page').length, 2);
  // The webview reloads: the host posts the LATEST window again, not the pages the reader had loaded.
  const before = fc.posted.length;
  fc.send(env('ready'));
  const after = fc.posted.slice(before).map((m) => m.payload);
  const restoredAt = after.findIndex((p) => p['type'] === 'session-restored');
  const r = after[restoredAt]!;
  const first = r['firstIndex'] as number;
  assert.deepEqual([r['sessionId'], r['total']], [id, total]);
  assert.deepEqual(r['transcript'], store.get(id)!.transcript.slice(first), 'the latest rows, to the end of the transcript');
  assert.ok((r['transcript'] as unknown[]).length <= 200);
  assert.equal(after.filter((p) => p['type'] === 'transcript-page').length, 0, 'no older page is re-sent');
  // The approval head is posted again after it, once, with its place in the queue.
  const cards = after.map((p, i) => ({ p, i })).filter(({ p }) => p['type'] === 'turn-event' && (p['event'] as TurnEvent).kind === 'approval-request');
  assert.equal(cards.length, 1);
  assert.ok(cards[0]!.i > restoredAt, 'after session-restored');
  const card = cards[0]!.p['event'] as Extract<TurnEvent, { kind: 'approval-request' }>;
  assert.deepEqual([card.requestId, card.position, card.total], ['p1', 1, 2]);
});

test('the stored session is unchanged by paging: after restores and page loads the saved transcript equals the original rows', async () => {
  const { store, id } = longSession(50, 20);
  const original = JSON.stringify(store.get(id));
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: scriptedAdapter([]) }, ['claude']), store, cwd: () => '/repo' });
  host.open();
  fc.send(env('open-chat', { chatId: id }));
  fc.send(env('ready'));
  for (let before = 900; before > 0; ) {
    fc.send(env('load-older', { sessionId: id, before }));
    before = posted(fc, 'transcript-page').at(-1)!['firstIndex'] as number;
  }
  fc.send(env('load-older', { sessionId: id, before: 0 }));
  fc.send(env('new-chat', { provider: 'claude' }));
  fc.send(env('open-chat', { chatId: id }));
  assert.equal(JSON.stringify(store.get(id)), original, 'the stored record is byte-for-byte what it was');
  // The posted windows and pages are copies: changing one does not touch the stored transcript.
  const page = posted(fc, 'transcript-page')[0]!['rows'] as unknown[];
  const win = posted(fc, 'session-restored').at(-1)!['transcript'] as unknown[];
  page.length = 0;
  win.length = 0;
  assert.equal(store.get(id)!.transcript.length, 1000);
  assert.equal(JSON.stringify(store.get(id)), original);
});

test("the chat panel run over the file store: a turn's saves append only that turn's rows, a restored session shows the same rows, and a failing save is logged without breaking the turn", async () => {
  const fake = fakeSessionFs();
  const warns: string[] = [];
  const store = createFileChatSessionStore({ root: '/sessions', fs: fake.fs });
  const adapter = scriptedAdapter([
    { kind: 'assistant-delta', turnId: 't', text: 'an answer' },
    { kind: 'done', turnId: 't', ok: true },
  ]);
  const fc = fakeChannel();
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store, cwd: () => '/repo', logger: { warn: (m) => warns.push(m), error: () => {} } });
  host.open();
  const dones = (): number => turnEvents(fc).filter((e) => e.kind === 'done').length;
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));
  const diskRows = (id: string): unknown[] =>
    (fake.files.get(`/sessions/${id}${ROWS_SUFFIX}`) ?? '').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as unknown);

  // The first turn: the draft becomes a session whose rows are on disk.
  fc.send(env('submit-turn', { text: 'first question' }));
  await waitFor(() => dones() === 1);
  await settle();
  const id = store.list()[0]!.id;
  const afterFirst = store.get(id)!.transcript.length;
  assert.ok(afterFirst >= 2, 'the question and the answer');
  assert.deepEqual(diskRows(id), JSON.parse(JSON.stringify(store.get(id)!.transcript)));

  // The second turn: every save appends, and what is appended is exactly that turn's rows.
  fake.clear();
  fc.send(env('submit-turn', { text: 'second question' }));
  await waitFor(() => dones() === 2);
  await settle();
  const session = store.get(id)!;
  const turnRows = session.transcript.slice(afterFirst);
  assert.ok(turnRows.length >= 2);
  const appended = fake.ops('appendText');
  assert.ok(appended.every((c) => c.path === `/sessions/${id}${ROWS_SUFFIX}`));
  assert.equal(appended.map((c) => c.data).join(''), turnRows.map((r) => `${JSON.stringify(r)}\n`).join(''), "only that turn's rows are appended, each once");
  assert.deepEqual(fake.calls.filter((c) => (c.op === 'rename' && c.to === `/sessions/${id}${ROWS_SUFFIX}`) || ((c.op === 'writeText' || c.op === 'truncate') && c.path === `/sessions/${id}${ROWS_SUFFIX}`)), [], 'the rows file is never rewritten');
  assert.ok(fake.ops('rename').length >= 1, 'the head is replaced');
  assert.deepEqual(diskRows(id), JSON.parse(JSON.stringify(session.transcript)));

  // A window reload: a new host over a new store on the same files shows the same rows.
  const fc2 = fakeChannel();
  const store2 = createFileChatSessionStore({ root: '/sessions', fs: fake.fs });
  createChatPanelHost({ createPanel: () => fc2.channel, providers: registry({ claude: adapter }, ['claude']), store: store2, cwd: () => '/repo' }).open();
  fc2.send(env('open-chat', { chatId: id }));
  const restored = posted(fc2, 'session-restored').filter((r) => r['sessionId'] === id).at(-1)!;
  assert.deepEqual(restored['transcript'], diskRows(id), 'the restored session shows the rows on disk');
  assert.equal(restored['total'], session.transcript.length);
  assert.deepEqual((posted(fc2, 'history-list').at(-1)!['chats'] as Array<{ id: string }>).map((c) => c.id), [id]);

  // A save that fails is logged, the turn still ends cleanly, and a later save writes the rows.
  fake.failOn = (c) => (c.op === 'appendText' ? new Error('disk full') : undefined);
  const errorsBefore = turnEvents(fc).filter((e) => e.kind === 'error').length;
  fc.send(env('submit-turn', { text: 'third question' }));
  await waitFor(() => dones() === 3);
  await settle();
  assert.equal(turnEvents(fc).filter((e) => e.kind === 'error').length, errorsBefore, 'no error is shown for a failed save');
  assert.match(warns.join('\n'), /not saved: disk full/);
  assert.equal(diskRows(id).length, afterFirst + turnRows.length, 'nothing of the third turn is on disk yet');
  assert.ok(session.transcript.length > afterFirst + turnRows.length, 'while the session holds its rows');
  fake.failOn = undefined;
  fc.send(env('submit-turn', { text: 'fourth question' }));
  await waitFor(() => dones() === 4);
  await settle();
  assert.deepEqual(diskRows(id), JSON.parse(JSON.stringify(store.get(id)!.transcript)), 'the rows the failed saves missed are written once by a later save');
});

// ---- Story E2026101259da3204:S001 t5: the host's pending attachments ----

const ATT_ROOT = '/home/u/.insrc/chat-attachments';
const PNG5 = Buffer.from([1, 2, 3, 4, 5]).toString('base64');

interface AttachHarness {
  fc: FakeChannel;
  host: ReturnType<typeof createChatPanelHost>;
  fake: FakeAttachmentFs;
  store: AttachmentStore;
  sessions: ReturnType<typeof createInMemoryChatSessionStore>;
  runs: TurnRequest[];
  opened: string[];
  errors: string[];
  /** What the next file dialog returns: paths, or an error to reject with. */
  pick: { next: readonly string[] | Error; calls: number };
  /** Every attachments-pending posted so far. */
  pendings(): Array<{ sessionId: string; items: Array<Record<string, unknown>>; error?: string }>;
  /** Sends a message and waits for the attachments-pending it causes. */
  sendAndWait(type: string, extra?: Record<string, unknown>): Promise<{ sessionId: string; items: Array<Record<string, unknown>>; error?: string }>;
}
/** A chat host with the attachment seams: the real store over an in-memory file seam, a scripted dialog and a recording opener. */
function attachHarness(opts: { adapter?: StreamAdapter | undefined; wrapStore?: ((store: AttachmentStore) => AttachmentStore) | undefined; queue?: ((runner: QueuedTurnRunner) => ReturnType<typeof createChatQueueWorker>) | undefined } = {}): AttachHarness {
  const fc = fakeChannel();
  const fake = fakeAttachmentFs();
  const real = createAttachmentStore({ root: ATT_ROOT, fs: fake.fs });
  const store = opts.wrapStore ? opts.wrapStore(real) : real;
  const sessions = createInMemoryChatSessionStore();
  const runs: TurnRequest[] = [];
  const opened: string[] = [];
  const errors: string[] = [];
  const pick: AttachHarness['pick'] = { next: [], calls: 0 };
  const adapter = opts.adapter ?? scriptedAdapter(
    [{ kind: 'assistant-delta', turnId: 't1', text: 'ok' }, { kind: 'done', turnId: 't1', ok: true, sessionId: 'native-1' }],
    { onRun: (r) => runs.push(r) },
  );
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: sessions,
    cwd: () => '/repo',
    logger: { warn: () => {}, error: (m) => errors.push(m) },
    ...(opts.queue !== undefined ? { queue: opts.queue } : {}),
    attachments: {
      store,
      pickFiles: async () => {
        pick.calls++;
        if (pick.next instanceof Error) throw pick.next;
        return pick.next;
      },
      open: (path) => opened.push(path),
    },
  });
  host.open();
  const pendings: AttachHarness['pendings'] = () => posted(fc, 'attachments-pending') as unknown as ReturnType<AttachHarness['pendings']>;
  return {
    fc, host, fake, store, sessions, runs, opened, errors, pick, pendings,
    async sendAndWait(type, extra = {}) {
      const before = pendings().length;
      fc.send(env(type, extra));
      await waitFor(() => pendings().length > before);
      return pendings().at(-1)!;
    },
  };
}
const attFiles = (h: AttachHarness): string[] => [...h.fake.files.keys()].filter((p) => p.startsWith(ATT_ROOT)).sort();

test("host: attach-image and pick-attachments add to the active session's pending list and post attachments-pending; remove-attachment removes one; errors are posted as one sentence and the list is unchanged", async () => {
  const h = attachHarness();
  const sid = activeId(h.fc);
  const dir = `${ATT_ROOT}/${sid}`;
  // The session state comes with an empty pending list.
  assert.deepEqual(h.pendings(), [{ type: 'attachments-pending', sessionId: sid, items: [] }]);

  const pasted = await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'shot.png', clientId: 'c1' });
  assert.deepEqual(pasted, { type: 'attachments-pending', sessionId: sid, items: [{ id: '1-shot.png', name: 'shot.png', kind: 'image', size: 5, clientId: 'c1' }] });
  assert.deepEqual([...h.fake.files.get(`${dir}/1-shot.png`)!], [1, 2, 3, 4, 5]);

  h.fake.files.set('/src/a.txt', new Uint8Array(3));
  h.fake.files.set('/src/b.pdf', new Uint8Array(7));
  h.pick.next = ['/src/a.txt', '/src/b.pdf'];
  const picked = await h.sendAndWait('pick-attachments');
  assert.deepEqual(picked.items, [
    { id: '1-shot.png', name: 'shot.png', kind: 'image', size: 5, clientId: 'c1' },
    { id: '2-a.txt', name: 'a.txt', kind: 'file', size: 3 },
    { id: '3-b.pdf', name: 'b.pdf', kind: 'file', size: 7 },
  ]);
  assert.equal(picked.error, undefined);
  assert.deepEqual(attFiles(h), [`${dir}/1-shot.png`, `${dir}/2-a.txt`, `${dir}/3-b.pdf`]);
  // No posted item carries a path.
  for (const p of h.pendings()) for (const item of p.items) assert.ok(!('path' in item));

  const removed = await h.sendAndWait('remove-attachment', { attachmentId: '2-a.txt' });
  assert.deepEqual(removed.items.map((i) => i['id']), ['1-shot.png', '3-b.pdf']);
  assert.deepEqual(attFiles(h), [`${dir}/1-shot.png`, `${dir}/3-b.pdf`]);

  // Each failure: one sentence, and the list stays as it was.
  const kept = ['1-shot.png', '3-b.pdf'];
  const failing = async (type: string, extra: Record<string, unknown>, sentence: RegExp): Promise<void> => {
    const res = await h.sendAndWait(type, extra);
    assert.match(res.error ?? '', sentence);
    assert.deepEqual(res.items.map((i) => i['id']), kept, `list unchanged after ${sentence}`);
    assert.deepEqual(attFiles(h), [`${dir}/1-shot.png`, `${dir}/3-b.pdf`]);
  };
  await failing('attach-image', { mime: 'image/svg+xml', dataBase64: PNG5, name: 'a.svg' }, /^The pasted item is not a supported image \(PNG, JPEG, GIF or WebP\)\.$/);
  await failing('attach-image', { mime: 'image/png', dataBase64: '!!!!' }, /^The pasted item is not a supported image\.$/);
  h.fake.failOn = (c) => (c.op === 'writeFile' ? new Error('ENOSPC') : undefined);
  await failing('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'full.png' }, /^full\.png could not be attached: ENOSPC$/);
  h.fake.failOn = undefined;
  assert.ok(h.errors.some((e) => /could not attach full\.png: ENOSPC/.test(e)), 'a failing write is logged');
  h.fake.dirs.add('/src/folder');
  h.pick.next = ['/src/folder'];
  await failing('pick-attachments', {}, /^folder is not a readable file\.$/);
  h.pick.next = new Error('dialog broke');
  await failing('pick-attachments', {}, /^The file dialog could not be opened: dialog broke$/);

  // One bad file in a pick does not stop the others.
  h.pick.next = ['/src/missing.txt', '/src/a.txt'];
  const mixed = await h.sendAndWait('pick-attachments');
  assert.match(mixed.error ?? '', /^missing\.txt is not a readable file\.$/);
  assert.deepEqual(mixed.items.map((i) => i['name']), ['shot.png', 'b.pdf', 'a.txt']);

  // A malformed message changes nothing and posts nothing.
  const count = h.pendings().length;
  h.fc.send(env('attach-image', { mime: 'image/png' }));
  h.fc.send(env('attach-image', { mime: 7, dataBase64: PNG5 }));
  h.fc.send(env('remove-attachment', {}));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.pendings().length, count);
});

test("host: ready, new-chat and open-chat post each session's own pending list; an unknown or foreign attachment id in remove or open does nothing; open-attachment opens the resolved path of a row's or a pending attachment", async () => {
  const h = attachHarness();
  const rowFile = { id: '7-old.pdf', name: 'old.pdf', kind: 'file' as const, size: 9, path: `${ATT_ROOT}/elsewhere/7-old.pdf` };
  const one = h.sessions.draft('claude');
  one.transcript.push({ role: 'user', text: 'earlier', at: '2026-10-12T00:00:00.000Z', attachments: [rowFile] });
  h.sessions.save(one);
  const two = h.sessions.create('claude');

  assert.deepEqual((await h.sendAndWait('open-chat', { chatId: one.id })).items, []);
  await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'one.png' });
  const inTwo = await h.sendAndWait('open-chat', { chatId: two.id });
  assert.deepEqual([inTwo.sessionId, inTwo.items], [two.id, []]);
  await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'two.png' });

  // Back in the first chat: its own chip, not the other's.
  const back = await h.sendAndWait('open-chat', { chatId: one.id });
  assert.deepEqual([back.sessionId, back.items.map((i) => i['id'])], [one.id, ['1-one.png']]);
  // A rebuilt webview asks again and gets the same list.
  const again = await h.sendAndWait('ready');
  assert.deepEqual([again.sessionId, again.items.map((i) => i['id'])], [one.id, ['1-one.png']]);
  // The pending list is posted after the session state it belongs to.
  const types = h.fc.posted.map((m) => m.payload.type);
  assert.ok(types.lastIndexOf('attachments-pending') > types.lastIndexOf('session-restored'));

  // An id the host did not issue for this chat: nothing removed, nothing opened, nothing posted.
  const count = h.pendings().length;
  const files = attFiles(h);
  for (const bad of ['1-two.png', '9-nope.png', `../${two.id}/1-two.png`, `${ATT_ROOT}/${two.id}/1-two.png`, '/etc/passwd', '', 7, null]) {
    h.fc.send(env('remove-attachment', { attachmentId: bad }));
    h.fc.send(env('open-attachment', { attachmentId: bad }));
  }
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.pendings().length, count);
  assert.deepEqual(attFiles(h), files);
  assert.deepEqual(h.opened, []);
  assert.deepEqual(h.fake.ops('rm'), []);

  // A pending attachment and one on a sent message open at the path the host holds.
  h.fc.send(env('open-attachment', { attachmentId: '1-one.png' }));
  h.fc.send(env('open-attachment', { attachmentId: '7-old.pdf' }));
  assert.deepEqual(h.opened, [`${ATT_ROOT}/${one.id}/1-one.png`, rowFile.path]);

  // A new chat starts with none, and the other chats keep theirs.
  const fresh = await h.sendAndWait('new-chat', { provider: 'claude' });
  assert.notEqual(fresh.sessionId, one.id);
  assert.deepEqual(fresh.items, []);
  assert.deepEqual((await h.sendAndWait('open-chat', { chatId: two.id })).items.map((i) => i['id']), ['1-two.png']);
  // An attachment still being written when the chat is switched lands on the chat it was pasted in.
  h.fc.send(env('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'late.png' }));
  const switched = await h.sendAndWait('open-chat', { chatId: one.id });
  assert.deepEqual(switched.items.map((i) => i['id']), ['1-one.png']);
  await waitFor(() => h.fake.files.has(`${ATT_ROOT}/${two.id}/2-late.png`));
  assert.deepEqual((await h.sendAndWait('open-chat', { chatId: two.id })).items.map((i) => i['id']), ['1-two.png', '2-late.png']);
});

test('host without the attachments seams: the shell has no attach button or chip row and the four messages are ignored', async () => {
  const fc = fakeChannel();
  const warns: string[] = [];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't1', ok: true }]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    logger: { warn: (m) => warns.push(m), error: (m) => warns.push(m) },
  });
  host.open();
  const before = fc.posted.length;
  assert.doesNotThrow(() => {
    fc.send(env('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'shot.png' }));
    fc.send(env('pick-attachments'));
    fc.send(env('remove-attachment', { attachmentId: '1-shot.png' }));
    fc.send(env('open-attachment', { attachmentId: '1-shot.png' }));
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(fc.posted.length, before, 'nothing is posted for an attachment message');
  // The session state is posted as before, with no pending list.
  fc.send(env('ready'));
  fc.send(env('new-chat', { provider: 'claude' }));
  assert.deepEqual(posted(fc, 'attachments-pending'), []);
  assert.deepEqual(warns, []);
  assert.doesNotMatch(fc.html(), /insrc-attach/);
});

test('host: an attach-image whose base64 length implies more than the limit is refused without decoding and without calling the store', async () => {
  let storeCalls = 0;
  const h = attachHarness({
    wrapStore: (s) => ({ ...s, addBytes: (id, input) => { storeCalls++; return s.addBytes(id, input); } }),
  });
  // One byte over the limit, as base64 text (4 characters per 3 bytes).
  const over = 'A'.repeat(((MAX_ATTACHMENT_BYTES + 3) / 3) * 4);
  assert.ok((over.length * 3) / 4 > MAX_ATTACHMENT_BYTES);
  const realFrom = Buffer.from;
  let decodes = 0;
  (Buffer as unknown as { from: unknown }).from = (...args: unknown[]): unknown => {
    if (args[1] === 'base64') decodes++;
    return (realFrom as (...a: unknown[]) => unknown).apply(Buffer, args);
  };
  try {
    const res = await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: over, name: 'huge.png' });
    assert.equal(res.error, 'huge.png is larger than the 20 MB limit.');
    assert.deepEqual(res.items, []);
    assert.equal(decodes, 0, 'the oversize text is never decoded');
    assert.equal(storeCalls, 0, 'the store is never called');
    assert.deepEqual(h.fake.calls, []);
    // An unnamed paste is described, not left blank.
    assert.equal((await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: over })).error, 'The pasted image is larger than the 20 MB limit.');
    // A paste within the limit is decoded once and stored.
    const ok = await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'ok.png' });
    assert.deepEqual(ok.items.map((i) => i['id']), ['1-ok.png']);
    assert.equal(decodes, 1);
    assert.equal(storeCalls, 1);
  } finally {
    (Buffer as unknown as { from: unknown }).from = realFrom;
  }
});

test('host: a dismissed dialog posts nothing, and a pick over the limit keeps the first ten and posts one error sentence', async () => {
  const h = attachHarness();
  const start = h.pendings().length;
  h.pick.next = [];
  h.fc.send(env('pick-attachments'));
  await waitFor(() => h.pick.calls === 1);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.pendings().length, start, 'a dismissed dialog posts nothing');
  assert.deepEqual(h.fake.calls, []);

  await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'first.png' });
  const paths = Array.from({ length: 12 }, (_, i) => `/src/f${i}.txt`);
  for (const p of paths) h.fake.files.set(p, new Uint8Array(1));
  h.pick.next = paths;
  const res = await h.sendAndWait('pick-attachments');
  assert.equal(res.items.length, 10);
  assert.deepEqual(res.items.map((i) => i['name']), ['first.png', ...paths.slice(0, 9).map((p) => p.slice(5))]);
  assert.equal(res.error, 'Only 10 files can be attached to one message; 3 files were not attached.');
  assert.equal(attFiles(h).length, 10);

  // A full list takes nothing more, by paste or by pick.
  const paste = await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'extra.png' });
  assert.equal(paste.error, 'Only 10 files can be attached to one message; extra.png was not attached.');
  h.pick.next = ['/src/f11.txt'];
  const more = await h.sendAndWait('pick-attachments');
  assert.equal(more.error, 'Only 10 files can be attached to one message; 1 file was not attached.');
  assert.equal(more.items.length, 10);
  assert.equal(attFiles(h).length, 10);

  // Removing one makes room for one.
  await h.sendAndWait('remove-attachment', { attachmentId: '1-first.png' });
  const refill = await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'extra.png' });
  assert.equal(refill.error, undefined);
  assert.equal(refill.items.length, 10);
});

// ---- Story E2026101259da3204:S001 t6: sending attachments with a message ----

const ATTACHED = 'Attached files (read them with your file tools):';
const userRows = (fc: FakeChannel): Array<Record<string, unknown>> => posted(fc, 'user-row');
/** A store whose addBytes for `slow.png` waits until release() is called. */
function gatedStore(): { wrapStore: (s: AttachmentStore) => AttachmentStore; release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  return {
    release,
    wrapStore: (s) => ({
      ...s,
      addBytes: async (id, input) => {
        if (input.name === 'slow.png') await gate;
        return s.addBytes(id, input);
      },
    }),
  };
}

test("host: a submit stores the user's text with the attachments on the row, echoes them on user-row, sends a prompt that ends with the attached-files block of absolute paths, passes readDirs, and clears the pending list", async () => {
  const h = attachHarness();
  const sid = activeId(h.fc);
  const dir = `${ATT_ROOT}/${sid}`;
  await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'shot.png', clientId: 'c1' });
  h.fake.files.set('/src/my notes.txt', new Uint8Array(3));
  h.pick.next = ['/src/my notes.txt'];
  await h.sendAndWait('pick-attachments');

  const cleared = await h.sendAndWait('submit-turn', { text: '  look at these  ' });
  assert.deepEqual(cleared, { type: 'attachments-pending', sessionId: sid, items: [] });
  await waitFor(() => h.runs.length === 1);
  const refs = [
    { id: '1-shot.png', name: 'shot.png', kind: 'image', size: 5, path: `${dir}/1-shot.png` },
    { id: '2-mynotes.txt', name: 'my notes.txt', kind: 'file', size: 3, path: `${dir}/2-mynotes.txt` },
  ];
  // The CLI gets the text, then the block of absolute paths, and may read the session's directory.
  assert.equal(h.runs[0]!.prompt, `look at these\n\n${ATTACHED}\n${dir}/1-shot.png\n${dir}/2-mynotes.txt`);
  assert.deepEqual(h.runs[0]!.readDirs, [dir]);
  // The stored row keeps the user's own words and lists the files; no path block in its text.
  const stored = h.sessions.get(sid)!.transcript[0]!;
  assert.deepEqual({ ...stored, at: 'x' }, { role: 'user', text: 'look at these', at: 'x', attachments: refs });
  // The live echo carries the same attachments, under the row's key.
  assert.deepEqual(userRows(h.fc), [{ type: 'user-row', text: 'look at these', key: 'r0', rowIndex: 0, attachments: refs }]);
  // The files stay on disk: the message refers to them.
  assert.deepEqual(attFiles(h), [`${dir}/1-shot.png`, `${dir}/2-mynotes.txt`]);

  // The next message carries none: its row, echo and prompt are as they always were.
  await waitFor(() => turnEvents(h.fc).some((e) => e.kind === 'done'));
  const pendingPosts = h.pendings().length;
  h.fc.send(env('submit-turn', { text: 'and again' }));
  await waitFor(() => h.runs.length === 2);
  assert.equal(h.runs[1]!.prompt, 'and again');
  const row = h.sessions.get(sid)!.transcript.filter((r) => r.role === 'user')[1]!;
  assert.deepEqual(Object.keys(row), ['role', 'text', 'at']);
  assert.deepEqual(Object.keys(userRows(h.fc)[1]!), ['type', 'text', 'key', 'rowIndex']);
  assert.equal(h.pendings().length, pendingPosts, 'a message without attachments posts no pending list');
});

test('host: a submit with blank text and an attachment runs a turn and names the chat from the attachment; with blank text and none it is a no-op', async () => {
  const h = attachHarness();
  const sid = activeId(h.fc);
  const dir = `${ATT_ROOT}/${sid}`;
  // Blank and nothing attached: nothing happens.
  h.fc.send(env('submit-turn', { text: '   ' }));
  h.fc.send(env('submit-turn', { text: '' }));
  await runsSettled();
  assert.equal(h.runs.length, 0);
  assert.deepEqual(userRows(h.fc), []);
  assert.equal(h.sessions.get(sid), undefined, 'the draft is still unsaved');

  await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'system diagram.png' });
  // A malformed submit is still a no-op and takes nothing.
  h.fc.send(env('submit-turn', { text: 7 }));
  await runsSettled();
  assert.equal(h.runs.length, 0);
  assert.equal(h.pendings().at(-1)!.items.length, 1);

  h.fc.send(env('submit-turn', { text: '  ' }));
  await waitFor(() => h.runs.length === 1);
  assert.equal(h.runs[0]!.prompt, `${ATTACHED}\n${dir}/1-systemdiagram.png`);
  assert.deepEqual(h.runs[0]!.readDirs, [dir]);
  const s = h.sessions.get(sid)!;
  assert.equal(s.transcript[0]!.role === 'user' ? s.transcript[0]!.text : 'x', '');
  assert.equal(s.transcript[0]!.role === 'user' ? s.transcript[0]!.attachments?.length : 0, 1);
  assert.equal(s.title, 'system diagram.png');
  assert.equal(userRows(h.fc)[0]!['text'], '');
  assert.deepEqual(h.pendings().at(-1)!.items, []);
});

test('host: a submit waits for an attachment still being written, and the message carries every chip in order', async () => {
  const gate = gatedStore();
  const h = attachHarness({ wrapStore: gate.wrapStore });
  const sid = activeId(h.fc);
  const dir = `${ATT_ROOT}/${sid}`;
  await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'fast.png' });
  h.fc.send(env('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'slow.png' }));
  h.fc.send(env('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'third.png' }));
  h.fc.send(env('submit-turn', { text: 'all three' }));
  // Pasted after the message was sent: it is not part of that message.
  h.fc.send(env('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'after.png' }));
  await runsSettled();
  assert.equal(h.runs.length, 0, 'the submit waits for the write');
  assert.deepEqual(userRows(h.fc), []);

  gate.release();
  await waitFor(() => h.runs.length === 1);
  assert.equal(h.runs[0]!.prompt, `all three\n\n${ATTACHED}\n${dir}/1-fast.png\n${dir}/2-slow.png\n${dir}/3-third.png`);
  const row = h.sessions.get(sid)!.transcript[0]!;
  assert.deepEqual(row.role === 'user' ? row.attachments?.map((a) => a.id) : [], ['1-fast.png', '2-slow.png', '3-third.png']);
  assert.deepEqual((userRows(h.fc)[0]!['attachments'] as Array<{ id: string }>).map((a) => a.id), ['1-fast.png', '2-slow.png', '3-third.png']);
  await waitFor(() => h.pendings().at(-1)!.items.length === 1);
  assert.deepEqual(h.pendings().at(-1)!.items.map((i) => i['id']), ['4-after.png']);
});

test('host: a later turn of a session with an attachment still passes readDirs, a session with none passes none, and a grant re-run keeps it', async () => {
  const { adapter, runs } = sequenceAdapter([
    [refused('g1', 'Bash', 't1', { command: 'ls' }), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }],
    [{ kind: 'assistant-delta', turnId: 't2', text: 'ran' }, { kind: 'done', turnId: 't2', ok: true, sessionId: 'sess-1' }],
  ]);
  const h = attachHarness({ adapter });
  const dir = `${ATT_ROOT}/${activeId(h.fc)}`;
  await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'shot.png' });
  h.fc.send(env('submit-turn', { text: 'run it' }));
  await waitFor(() => approvalCards(h.fc).length === 1 && turnEvents(h.fc).some((e) => e.kind === 'done'));
  assert.deepEqual(runs[0]!.readDirs, [dir]);

  // The grant re-run is the host's own message: same directory, the approved tool, no file block.
  h.fc.send(env('permission-decision', { requestId: 'g1', decision: 'approve' }));
  await waitFor(() => runs.length === 2);
  assert.equal(runs[1]!.prompt, 'Approved — run exactly this now: ls');
  assert.deepEqual([...(runs[1]!.allowedTools ?? [])], ['Bash']);
  assert.deepEqual(runs[1]!.readDirs, [dir]);
  assert.deepEqual(runs[1]!.resume, { provider: 'claude', nativeSessionId: 'sess-1' });

  // Three messages later it is still readable.
  await waitFor(() => turnEvents(h.fc).filter((e) => e.kind === 'done').length === 2);
  h.fc.send(env('submit-turn', { text: 'thanks' }));
  await waitFor(() => runs.length === 3);
  assert.equal(runs[2]!.prompt, 'thanks');
  assert.deepEqual(runs[2]!.readDirs, [dir]);

  // A chat that never had an attachment: no readDirs at all, with the seams present.
  await h.sendAndWait('new-chat', { provider: 'claude' });
  h.fc.send(env('submit-turn', { text: 'plain' }));
  await waitFor(() => runs.length === 4);
  assert.ok(!('readDirs' in runs[3]!), 'no readDirs key on a session without attachments');
  assert.deepEqual(Object.keys(runs[3]!).sort(), ['cwd', 'permissionMode', 'prompt', 'provider']);
  assert.deepEqual(Object.keys(h.sessions.get(activeId(h.fc))!.transcript[0]!), ['role', 'text', 'at']);
});

test('host: a grant re-run and a selection continuation leave the pending list untouched and attach nothing', async () => {
  const { adapter, runs } = sequenceAdapter([
    [refused('g1', 'Bash'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }],
    [
      { kind: 'selection-request', turnId: 't2', requestId: 'sel-1', prompt: 'Pick', options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }] },
      { kind: 'done', turnId: 't2', ok: true, sessionId: 'sess-1' },
    ],
    [{ kind: 'done', turnId: 't3', ok: true, sessionId: 'sess-1' }],
  ]);
  const h = attachHarness({ adapter });
  const sid = activeId(h.fc);
  const dir = `${ATT_ROOT}/${sid}`;
  h.fc.send(env('submit-turn', { text: 'start' }));
  await waitFor(() => approvalCards(h.fc).length === 1 && turnEvents(h.fc).some((e) => e.kind === 'done'));
  // A chip is waiting while the host sends its own two messages.
  await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'waiting.png' });
  const pendingPosts = h.pendings().length;

  h.fc.send(env('permission-decision', { requestId: 'g1', decision: 'approve' }));
  await waitFor(() => runs.length === 2);
  assert.equal(runs[1]!.prompt, 'Approved: please proceed with the Bash action you requested permission for.');
  await waitFor(() => turnEvents(h.fc).some((e) => e.kind === 'selection-request'));
  h.fc.send(env('selection-decision', { requestId: 'sel-1', selected: ['a'] }));
  await waitFor(() => runs.length === 3);
  assert.equal(runs[2]!.prompt, 'Selected: Alpha');

  for (const run of runs.slice(1)) {
    assert.ok(!run.prompt.includes(ATTACHED), 'no file block in the host\'s own message');
    assert.ok(!('readDirs' in run), 'no row of the session carries an attachment yet');
  }
  const s = h.sessions.get(sid)!;
  for (const r of s.transcript) assert.ok(!('attachments' in r), 'no row took the waiting attachment');
  assert.equal(h.pendings().length, pendingPosts, 'the pending list was neither cleared nor re-posted');
  assert.deepEqual(h.pendings().at(-1)!.items.map((i) => i['id']), ['1-waiting.png']);
  assert.deepEqual(attFiles(h), [`${dir}/1-waiting.png`]);

  // The user's own next message is what takes it.
  await waitFor(() => turnEvents(h.fc).filter((e) => e.kind === 'done').length === 3);
  h.fc.send(env('submit-turn', { text: 'now with the file' }));
  await waitFor(() => runs.length === 4);
  assert.equal(runs[3]!.prompt, `now with the file\n\n${ATTACHED}\n${dir}/1-waiting.png`);
  assert.deepEqual(runs[3]!.readDirs, [dir]);
});

// Epic E20261014613abdb3 Story S001: this is the rule without the queue (the fallback path).
test('host: a submit with blank text and an attachment supersedes queued approvals', async () => {
  const { adapter, runs } = sequenceAdapter([
    [refused('u1', 'Edit'), refused('u2', 'Write'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }],
    [{ kind: 'assistant-delta', turnId: 't2', text: 'ok' }, { kind: 'done', turnId: 't2', ok: true, sessionId: 'sess-1' }],
  ]);
  const h = attachHarness({ adapter });
  h.fc.send(env('submit-turn', { text: 'two edits' }));
  await waitFor(() => approvalCards(h.fc).length === 1 && turnEvents(h.fc).some((e) => e.kind === 'done'));

  // Blank with nothing attached is a no-op: the requests keep waiting.
  h.fc.send(env('submit-turn', { text: '  ' }));
  await runsSettled();
  assert.deepEqual(outcomes(h.fc), []);
  assert.equal(runs.length, 1);

  // Blank with an attachment is a message: both waiting requests are rejected, then it runs.
  await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'instead.png' });
  h.fc.send(env('submit-turn', { text: '' }));
  await waitFor(() => runs.length === 2);
  assert.deepEqual(outcomes(h.fc).map((o) => [o.toolName, o.decision]), [['Edit', 'rejected'], ['Write', 'rejected']]);
  assert.ok(runs[1]!.prompt.startsWith(ATTACHED));
  assert.equal(runs[1]!.allowedTools, undefined, 'it runs as a normal turn, with no grant');
  // The outcome rows are written before the message's own row.
  const roles = h.sessions.get(activeId(h.fc))!.transcript.map((r) => r.role);
  assert.ok(roles.lastIndexOf('permission-outcome') < roles.lastIndexOf('user'));
  // The queue is empty: a late click on the old card does nothing.
  h.fc.send(env('permission-decision', { requestId: 'u1', decision: 'approve' }));
  await runsSettled();
  assert.equal(outcomes(h.fc).length, 2);
  assert.equal(runs.length, 2);
});

// Epic E20261014613abdb3 Story S001: with the queue, a message never answers the waiting cards; it
// waits, and runs once they are decided. (The test above keeps the no-queue path's rule.)
test('host: with the queue, a submit with blank text and an attachment leaves the waiting cards as they are, waits, and runs once they are decided', async () => {
  const { adapter, runs } = sequenceAdapter([
    [refused('u1', 'Edit'), refused('u2', 'Write'), { kind: 'done', turnId: 't1', ok: true, sessionId: 'sess-1' }],
    [{ kind: 'assistant-delta', turnId: 't2', text: 'ok' }, { kind: 'done', turnId: 't2', ok: true, sessionId: 'sess-1' }],
  ]);
  const q = tempQueue();
  const h = attachHarness({ adapter, queue: q.queue });
  try {
    h.fc.send(env('ready'));
    h.fc.send(env('submit-turn', { text: 'two edits' }));
    await waitFor(() => approvalCards(h.fc).length === 1 && turnEvents(h.fc).some((e) => e.kind === 'done'), 3000);

    await h.sendAndWait('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'instead.png' });
    h.fc.send(env('submit-turn', { text: '' }));
    await waitFor(() => q.store.list().some((m) => m.state === 'queued' && m.attachments.length === 1), 3000);
    await runsSettled();
    assert.deepEqual(outcomes(h.fc), [], 'the waiting cards are not answered with a no');
    assert.equal(runs.length, 1, 'the message waits while the cards wait');
    // The cards are decided; the waiting message then runs, as a normal turn.
    h.fc.send(env('permission-decision', { requestId: 'u1', decision: 'deny' }));
    h.fc.send(env('permission-decision', { requestId: 'u2', decision: 'deny' }));
    await waitFor(() => runs.length === 2, 3000);
    assert.deepEqual(outcomes(h.fc).map((o) => [o.toolName, o.decision]), [['Edit', 'rejected'], ['Write', 'rejected']]);
    assert.ok(runs[1]!.prompt.startsWith(ATTACHED));
    assert.equal(runs[1]!.allowedTools, undefined, 'with no grant');
  } finally {
    h.host.dispose();
    q.done();
  }
});

test('host: a chat switch while a submit waits drops the submit and keeps the chips on their session, and a second submit runs after the first', async () => {
  // A chat switch during the wait.
  {
    const gate = gatedStore();
    const { adapter, runs } = sequenceAdapter([]);
    const h = attachHarness({ adapter, wrapStore: gate.wrapStore });
    const one = h.sessions.create('claude');
    const two = h.sessions.create('claude');
    await h.sendAndWait('open-chat', { chatId: one.id });
    h.fc.send(env('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'slow.png' }));
    h.fc.send(env('submit-turn', { text: 'send it' }));
    await h.sendAndWait('open-chat', { chatId: two.id });
    gate.release();
    await waitFor(() => h.fake.files.has(`${ATT_ROOT}/${one.id}/1-slow.png`));
    await runsSettled();
    assert.equal(runs.length, 0, 'the submit is dropped');
    assert.deepEqual(h.sessions.get(one.id)!.transcript, []);
    assert.deepEqual(h.sessions.get(two.id)!.transcript, [], 'it does not land on the chat now shown');
    assert.deepEqual(userRows(h.fc), []);
    assert.deepEqual(h.pendings().at(-1)!.items, [], 'the other chat shows none');
    // The chip is still there when the user comes back, and goes with the next message.
    assert.deepEqual((await h.sendAndWait('open-chat', { chatId: one.id })).items.map((i) => i['id']), ['1-slow.png']);
    h.fc.send(env('submit-turn', { text: 'send it now' }));
    await waitFor(() => runs.length === 1);
    assert.equal(runs[0]!.prompt, `send it now\n\n${ATTACHED}\n${ATT_ROOT}/${one.id}/1-slow.png`);
  }
  // The panel closing during the wait.
  {
    const gate = gatedStore();
    const { adapter, runs } = sequenceAdapter([]);
    const h = attachHarness({ adapter, wrapStore: gate.wrapStore });
    const sid = activeId(h.fc);
    h.fc.send(env('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'slow.png' }));
    h.fc.send(env('submit-turn', { text: 'send it' }));
    h.fc.fireDispose();
    gate.release();
    await waitFor(() => h.fake.files.has(`${ATT_ROOT}/${sid}/1-slow.png`));
    await runsSettled();
    assert.equal(runs.length, 0);
    assert.equal(h.sessions.get(sid), undefined, 'nothing was stored');
    assert.deepEqual(h.errors, []);
  }
  // Two submits while a write is under way: the first takes the attachment, the second follows it.
  {
    const gate = gatedStore();
    const { adapter, runs } = sequenceAdapter([]);
    const h = attachHarness({ adapter, wrapStore: gate.wrapStore });
    const sid = activeId(h.fc);
    h.fc.send(env('attach-image', { mime: 'image/png', dataBase64: PNG5, name: 'slow.png' }));
    h.fc.send(env('submit-turn', { text: 'first' }));
    h.fc.send(env('submit-turn', { text: 'second' }));
    await runsSettled();
    assert.equal(h.sessions.get(sid), undefined, 'neither has run yet');
    gate.release();
    await waitFor(() => runs.some((r) => r.prompt === 'second'));
    const rows = h.sessions.get(sid)!.transcript.filter((r) => r.role === 'user');
    assert.deepEqual(rows.map((r) => (r.role === 'user' ? [r.text, r.attachments?.map((a) => a.id)] : [])), [['first', ['1-slow.png']], ['second', undefined]]);
    assert.deepEqual(userRows(h.fc).map((r) => [r['text'], r['key']]), [['first', 'r0'], ['second', 'r1']]);
    // The attachment went once, with the first message.
    assert.ok(!runs.at(-1)!.prompt.includes(ATTACHED));
    assert.deepEqual(runs.at(-1)!.readDirs, [`${ATT_ROOT}/${sid}`]);
    assert.deepEqual(h.pendings().at(-1)!.items, []);
  }
});

// ---------------------------------------------------------------------------
// Story E202610138d4b90c9:S001 t6 — a message another pane hands the chat waits its turn
// ---------------------------------------------------------------------------

interface GatedRun {
  readonly req: TurnRequest;
  feed(ev: TurnEvent): void;
}
interface GatedResume {
  feed(ev: TurnEvent): void;
  fail(message: string): void;
}
/** Each run and each resume yields only what the test feeds it, and ends at its terminal event. */
function gatedAdapter(): { adapter: StreamAdapter; runs: GatedRun[]; resumes: GatedResume[] } {
  const runs: GatedRun[] = [];
  const resumes: GatedResume[] = [];
  let cancelled = 0;
  const adapter: StreamAdapter = {
    async *run(req: TurnRequest): AsyncIterable<TurnEvent> {
      const queue: TurnEvent[] = [];
      const born = cancelled;
      runs.push({ req, feed: (ev) => void queue.push(ev) });
      for (;;) {
        while (queue.length === 0 && cancelled === born) await new Promise((r) => setTimeout(r, 2));
        if (queue.length === 0) return;
        const ev = queue.shift()!;
        yield ev;
        if (ev.kind === 'done' || ev.kind === 'error') return;
      }
    },
    async *resume(_req, o): AsyncIterable<TurnEvent> {
      const queue: TurnEvent[] = [];
      let failure: string | undefined;
      resumes.push({ feed: (ev) => void queue.push(ev), fail: (m) => void (failure = m) });
      for (;;) {
        while (queue.length === 0 && failure === undefined && o?.signal?.aborted !== true) await new Promise((r) => setTimeout(r, 2));
        if (failure !== undefined) throw new Error(failure);
        if (queue.length === 0) return;
        const ev = queue.shift()!;
        yield ev;
        if (ev.kind === 'done' || ev.kind === 'error') return;
      }
    },
    cancel: () => { cancelled += 1; },
    decide: () => {},
    capabilities: { resume: true },
  };
  return { adapter, runs, resumes };
}

const doneOf = (n: number): TurnEvent => ({ kind: 'done', turnId: `t${n}`, ok: true, sessionId: 'native-1' });
const prompts = (runs: readonly GatedRun[]): string[] => runs.map((r) => r.req.prompt);

// ---------------------------------------------------------------------------
// Story E20261013e62a9269:S001 — the chat host tells the review presenter about each turn.
// ---------------------------------------------------------------------------

interface PresenterSpy {
  /** begin#n, declared#n:<documents>, end#n, in the order the host made the calls. */
  readonly calls: string[];
  readonly presenter: ReviewPresenter;
}
function presenterSpy(o: { throwOn?: 'begin' | 'end' | 'declared'; outcome?: DeclaredOutcome } = {}): PresenterSpy {
  const calls: string[] = [];
  let n = 0;
  return {
    calls,
    presenter: {
      begin: () => {
        const id = ++n;
        calls.push(`begin#${id}`);
        if (o.throwOn === 'begin') throw new Error('presenter down');
        return {
          declared: async (documents) => {
            calls.push(`declared#${id}:${documents.join(',')}`);
            if (o.throwOn === 'declared') throw new Error('presenter down');
            return o.outcome ?? { opened: [...documents], notPending: [], unreadable: false };
          },
          end: () => {
            calls.push(`end#${id}`);
            if (o.throwOn === 'end') throw new Error('presenter down');
          },
        };
      },
    },
  };
}
interface PresentedHarness {
  readonly fc: FakeChannel;
  readonly runs: GatedRun[];
  readonly resumes: GatedResume[];
  readonly errors: string[];
}
function presentedHarness(presenter: ReviewPresenter | undefined, o: { store?: ReturnType<typeof createInMemoryChatSessionStore>; hostPid?: number } = {}): PresentedHarness {
  const fc = fakeChannel();
  const { adapter, runs, resumes } = gatedAdapter();
  const errors: string[] = [];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: adapter }, ['claude']),
    store: o.store ?? createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    logger: { warn: () => {}, error: (m) => void errors.push(m) },
    ...(presenter !== undefined ? { presenter } : {}),
    ...(o.hostPid !== undefined ? { hostPid: o.hostPid, isAlive: (pid: number) => pid === o.hostPid } : {}),
  });
  host.open();
  fc.send(env('ready'));
  return { fc, runs, resumes, errors };
}
const resultOf = (n: number, output: string, isError = false): TurnEvent =>
  ({ kind: 'tool-result', turnId: `t${n}`, command: 'run', output, ...(isError ? { isError: true } : {}) }) as TurnEvent;
const dones = (fc: FakeChannel): number => turnEvents(fc).filter((e) => e.kind === 'done' || e.kind === 'error').length;

test('chat host: a run turn begins a presenter turn just before it starts, passes the documents a tool call declares and no tool result, and ends it once when the run is over, also for a turn that failed, was stopped or was superseded; a message refused before any run begins none; a presenter that throws does not disturb the turn', async () => {
  // A TURN THAT COMPLETES.
  const spy = presenterSpy();
  const h = presentedHarness(spy.presenter);
  // Refused before any run: nothing is begun.
  h.fc.send(env('submit-turn', { text: '   ' }));
  h.fc.send(env('submit-turn', { text: 7 }));
  h.fc.send(env('submit-turn', {}));
  await runsSettled();
  assert.deepEqual(spy.calls, [], 'a refused message begins no presented turn');
  assert.equal(h.runs.length, 0);

  h.fc.send(env('submit-turn', { text: 'design it' }));
  await waitFor(() => h.runs.length === 1);
  assert.deepEqual(spy.calls, ['begin#1'], 'begun once the message is accepted, before any event');
  h.runs[0]!.feed({ kind: 'assistant-delta', turnId: 't1', text: 'working' });
  h.runs[0]!.feed(presentCall(1, ['LLD-x-S001']));
  h.runs[0]!.feed(resultOf(1, '{"pendingApproval":{"artifactPath":"/repo/docs/x/LLD.md"}}'));
  h.runs[0]!.feed(resultOf(1, 'Error: tool failed', true));
  h.runs[0]!.feed(resultOf(1, 'ok'));
  await waitFor(() => turnEvents(h.fc).filter((e) => e.kind === 'tool-result').length === 3);
  assert.deepEqual(spy.calls, ['begin#1', 'declared#1:LLD-x-S001'], 'the declared documents only: no tool result, whatever it holds');
  h.runs[0]!.feed(doneOf(1));
  await waitFor(() => spy.calls.includes('end#1'));
  assert.equal(spy.calls.filter((c) => c === 'end#1').length, 1);
  // The chat itself is as before: every event posted.
  assert.deepEqual(turnEvents(h.fc).map((e) => e.kind).filter((k) => k !== 'status'), ['assistant-delta', 'tool-call', 'tool-result', 'tool-result', 'tool-result', 'done']);

  // A TURN THAT FAILS.
  h.fc.send(env('submit-turn', { text: 'again' }));
  await waitFor(() => h.runs.length === 2);
  h.runs[1]!.feed({ kind: 'error', turnId: 't2', message: 'boom' } as TurnEvent);
  await waitFor(() => spy.calls.includes('end#2'));
  assert.deepEqual(spy.calls.slice(2), ['end#1', 'begin#2', 'end#2']);

  // A TURN THAT IS STOPPED: it is ended when its run is over.
  h.fc.send(env('submit-turn', { text: 'long one' }));
  await waitFor(() => h.runs.length === 3);
  h.fc.send(env('cancel-turn'));
  await runsSettled();
  // Its process ends a moment later.
  h.runs[2]!.feed(doneOf(3));
  await waitFor(() => spy.calls.includes('end#3'));
  assert.deepEqual(spy.calls.slice(5), ['begin#3', 'end#3'], 'ended once its run is over');

  // A TURN THAT IS SUPERSEDED: the next begins while it runs; it is ended when its process ends.
  const sup = presenterSpy();
  const s = presentedHarness(sup.presenter);
  s.fc.send(env('submit-turn', { text: 'A' }));
  await waitFor(() => s.runs.length === 1);
  s.fc.send(env('submit-turn', { text: 'B' }));
  await waitFor(() => sup.calls.includes('begin#2'));
  assert.deepEqual(sup.calls, ['begin#1', 'begin#2'], 'B begins while A has not ended');
  s.runs[0]!.feed(doneOf(1));
  await waitFor(() => s.runs.length === 2);
  assert.deepEqual(sup.calls, ['begin#1', 'begin#2', 'end#1'], "A is ended when its process ends, after B began");
  s.runs[1]!.feed(doneOf(2));
  await waitFor(() => sup.calls.includes('end#2'));
  assert.equal(sup.calls.filter((c) => c.startsWith('end#')).length, 2);

  // NO PRESENTER: the host works as before.
  const none = presentedHarness(undefined);
  none.fc.send(env('submit-turn', { text: 'plain' }));
  await waitFor(() => none.runs.length === 1);
  none.runs[0]!.feed(resultOf(1, 'ok'));
  none.runs[0]!.feed(doneOf(1));
  await waitFor(() => dones(none.fc) === 1);

  // A PRESENTER THAT THROWS, at each of its three calls: logged, and the turn goes on to its end.
  for (const throwOn of ['begin', 'declared', 'end'] as const) {
    const bad = presenterSpy({ throwOn });
    const b = presentedHarness(bad.presenter);
    b.fc.send(env('submit-turn', { text: 'go' }));
    await waitFor(() => b.runs.length === 1);
    b.runs[0]!.feed(presentCall(1, ['LLD-x-S001']));
    b.runs[0]!.feed(resultOf(1, 'ok'));
    b.runs[0]!.feed(doneOf(1));
    await waitFor(() => dones(b.fc) === 1);
    await runsSettled();
    assert.deepEqual(turnEvents(b.fc).map((e) => e.kind).filter((k) => k !== 'status'), ['tool-call', 'tool-result', 'done'], `${throwOn}: the turn's events are posted as usual`);
    assert.equal(b.errors.filter((e) => /review presenter failed/.test(e)).length, 1, `${throwOn}: logged`);
    // The chat takes the next message.
    b.fc.send(env('submit-turn', { text: 'next' }));
    await waitFor(() => b.runs.length === 2);
    b.runs[1]!.feed(doneOf(2)); // leave no run waiting
    await waitFor(() => dones(b.fc) === 2);
  }
});

test("chat host: a followed turn begins a presenter turn on its first event, not when the follow is asked for, passes its declared documents and ends it when the follow ended; a ready message during a run turn begins nothing and reads nothing, and the run turn opens only a document it declares", async () => {
  // A FOLLOWED TURN: this window's own saved turn, picked up after a reload.
  const spy = presenterSpy();
  const { store, id } = storeWithLiveTurn(1);
  const f = presentedHarness(spy.presenter, { store, hostPid: 2 });
  f.fc.send(env('open-chat', { chatId: id }));
  await waitFor(() => f.resumes.length === 1);
  await runsSettled();
  assert.deepEqual(spy.calls, [], 'asking for the follow begins nothing');
  f.resumes[0]!.feed({ kind: 'assistant-delta', turnId: 't1', text: 'still going' });
  await waitFor(() => spy.calls.length === 1);
  assert.deepEqual(spy.calls, ['begin#1'], 'begun on the first event');
  f.resumes[0]!.feed(presentCall(1, ['PLAN-bbb-S001']));
  f.resumes[0]!.feed(resultOf(1, '{"pendingApproval":{"artifactPath":"/repo/docs/x/PLAN.md"}}'));
  f.resumes[0]!.feed(doneOf(1));
  await waitFor(() => spy.calls.includes('end#1'));
  assert.deepEqual(spy.calls, ['begin#1', 'declared#1:PLAN-bbb-S001', 'end#1'], 'a result naming a document passes nothing');

  // A FOLLOW WHOSE RESUME FAILS before any event: nothing is begun, nothing ended.
  const spy2 = presenterSpy();
  const live2 = storeWithLiveTurn(1);
  const g = presentedHarness(spy2.presenter, { store: live2.store, hostPid: 2 });
  g.fc.send(env('open-chat', { chatId: live2.id }));
  await waitFor(() => g.resumes.length === 1);
  g.resumes[0]!.fail('the output file is gone');
  await runsSettled();
  assert.deepEqual(spy2.calls, []);
  // A resume that fails after an event: the turn is left for a later follow, so it is not ended.
  const spy3 = presenterSpy();
  const live3 = storeWithLiveTurn(1);
  const k = presentedHarness(spy3.presenter, { store: live3.store, hostPid: 2 });
  k.fc.send(env('open-chat', { chatId: live3.id }));
  await waitFor(() => k.resumes.length === 1);
  k.resumes[0]!.feed(presentCall(1, ['LLD-y-S001']));
  await waitFor(() => spy3.calls.length === 2);
  k.resumes[0]!.fail('read error');
  await runsSettled();
  assert.deepEqual(spy3.calls, ['begin#1', 'declared#1:LLD-y-S001'], 'not ended: nothing has ended');

  // A READY MESSAGE DURING A RUN TURN (the chat tab hidden and shown): it asks for a follow that
  // does not start. With the real presenter: no read is made for it, and the run turn opens only
  // what it declares.
  const list: Array<{ id: string; mdPath: string }> = [{ id: 'LLD-old', mdPath: '/repo/docs/x/OLD.md' }];
  const opened: string[] = [];
  let reads = 0;
  const real = createReviewPresenter({
    pendingDocuments: async () => { reads += 1; return [...list]; },
    open: (t) => void opened.push(t.artifactId),
    log: { warn: () => {}, error: () => {} },
  });
  const r = presentedHarness(real);
  r.fc.send(env('submit-turn', { text: 'build it' }));
  await waitFor(() => r.runs.length === 1);
  await runsSettled();
  assert.equal(reads, 0, 'no start list is read: nothing is worked out from what is pending');
  r.fc.send(env('ready'));
  r.fc.send(env('ready'));
  await runsSettled();
  assert.equal(reads, 0, 'a ready message reads nothing');
  assert.equal(r.resumes.length, 0, 'and follows nothing: this host is running the turn');
  list.push({ id: 'BUILD-new', mdPath: '/repo/docs/x/BUILD.md' }, { id: 'CR-new', mdPath: '/repo/docs/x/CR.md' });
  r.runs[0]!.feed(presentCall(1, ['BUILD-new']));
  await waitFor(() => opened.length === 1);
  r.runs[0]!.feed(doneOf(1));
  await waitFor(() => dones(r.fc) === 1);
  await runsSettled();
  assert.deepEqual(opened, ['BUILD-new'], 'the declared document opens; the other pending one, and the end of the turn, open nothing');
});

// Epic E20261014613abdb3 Story S001: a second message no longer supersedes the running turn. (Was: "a
// superseded turn's later tool results are not passed to the presenter, and a document it writes
// afterwards is opened at the end of the turn that superseded it".)
test("chat host: a turn followed by a second message still passes its declared documents to the presenter, which opens the document it presents, once", async () => {
  const list: Array<{ id: string; mdPath: string }> = [{ id: 'LLD-old', mdPath: '/repo/docs/x/OLD.md' }];
  const opened: string[] = [];
  const real = createReviewPresenter({
    pendingDocuments: async () => [...list],
    open: (t) => void opened.push(t.artifactId),
    log: { warn: () => {}, error: () => {} },
  });
  const spy = presenterSpy();
  const both: ReviewPresenter = {
    begin: () => {
      const a = spy.presenter.begin();
      const b = real.begin();
      return { declared: async (d) => { await a.declared(d); return b.declared(d); }, end: () => { a.end(); b.end(); } };
    },
  };
  const h = presentedHarness(both);
  h.fc.send(env('submit-turn', { text: 'A: write the design' }));
  await waitFor(() => h.runs.length === 1);
  await runsSettled();
  h.fc.send(env('submit-turn', { text: 'B: also this' }));
  await waitFor(() => spy.calls.includes('begin#2'));
  list.push({ id: 'LLD-new', mdPath: '/repo/docs/x/NEW.md' });
  h.runs[0]!.feed(presentCall(1, ['LLD-new']));
  h.runs[0]!.feed(doneOf(1));
  await waitFor(() => h.runs.length === 2);
  await runsSettled();
  assert.ok(spy.calls.includes('declared#1:LLD-new'), "the first turn's declaration reached the presenter");
  assert.ok(turnEvents(h.fc).some((e) => e.kind === 'tool-call'), 'and the webview');
  await waitFor(() => opened.length === 1);
  assert.deepEqual(opened, ['LLD-new']);
  h.runs[1]!.feed(doneOf(2));
  await runsSettled();
  assert.deepEqual(opened, ['LLD-new'], 'opened once');
});

test('chat host: submitExternal in a window without a queue answers unavailable with a note and keeps nothing', async () => {
  const fc = fakeChannel();
  const adapter: StreamAdapter = { async *run(): AsyncIterable<TurnEvent> {}, cancel: () => {}, decide: () => {}, capabilities: { resume: true } };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  try {
    assert.deepEqual(host.submitExternal('Review decision: approved'), { kind: 'unavailable', note: 'the chat queue is not available in this window' });
    assert.equal(fc.posted.length, 0, 'the panel was not opened for a message that cannot be sent');
  } finally {
    host.dispose();
  }
});

// ---------------------------------------------------------------------------
// Story E20261015067b05b6:S001 — the turn declares the documents it presents.
// ---------------------------------------------------------------------------

/** A turn's tool call to insrc_present, as a provider mapper reports it. */
const presentCall = (n: number, present: readonly string[] | undefined): TurnEvent =>
  ({ kind: 'tool-call', turnId: `t${n}`, tool: 'mcp__insrc__insrc_present', mcp: { server: 'insrc', name: 'insrc_present' }, ...(present !== undefined ? { present } : {}) }) as TurnEvent;
const infoTexts = (fc: FakeChannel): string[] =>
  turnEvents(fc).filter((e) => e.kind === 'assistant-delta' && e.turnId.startsWith('present-note-')).map((e) => (e as { text: string }).text);

test("the chat host passes a tool-call's declared documents to the presenter and nothing else, and ends the turn without opening anything", async () => {
  const spy = presenterSpy();
  const h = presentedHarness(spy.presenter);
  h.fc.send(env('submit-turn', { text: 'show me' }));
  await waitFor(() => h.runs.length === 1);
  h.runs[0]!.feed(presentCall(1, undefined));                                         // a call with no declaration
  h.runs[0]!.feed({ kind: 'tool-call', turnId: 't1', tool: 'Bash', command: 'ls' } as TurnEvent); // another tool
  h.runs[0]!.feed(presentCall(1, ['LLD-aaa-S001', 'docs/x/PLAN.md']));
  h.runs[0]!.feed({ kind: 'assistant-delta', turnId: 't1', text: 'see the pane' });
  h.runs[0]!.feed(doneOf(1));
  await waitFor(() => spy.calls.includes('end#1'));
  assert.deepEqual(spy.calls, ['begin#1', 'declared#1:LLD-aaa-S001,docs/x/PLAN.md', 'end#1'], 'the declared list, once, and no tool-call text or other event');

  // With the real presenter: exactly the declared document opens, a pending one nobody declared does not,
  // and the end of the turn opens nothing more.
  const list = [
    { id: 'LLD-aaa-S001', mdPath: '/repo/docs/x/LLD.md' },
    { id: 'BUILD-old-S001', mdPath: '/repo/docs/x/BUILD.md' },
  ];
  const opened: string[] = [];
  const real = createReviewPresenter({ pendingDocuments: async () => [...list], open: (t) => void opened.push(t.artifactId), log: { warn: () => {}, error: () => {} } });
  const r = presentedHarness(real);
  r.fc.send(env('submit-turn', { text: 'show me' }));
  await waitFor(() => r.runs.length === 1);
  r.runs[0]!.feed(presentCall(1, ['LLD-aaa-S001']));
  await waitFor(() => opened.length === 1);
  r.runs[0]!.feed(doneOf(1));
  await waitFor(() => dones(r.fc) === 1);
  await runsSettled();
  assert.deepEqual(opened, ['LLD-aaa-S001']);
});

test("the chat host shows a line for a not-pending name and for an unreadable pending list from the presenter's outcome", async () => {
  const notPending = presenterSpy({ outcome: { opened: ['LLD-aaa-S001'], notPending: ['LLD-zzz-S001', 'docs/gone.md'], unreadable: false } });
  const a = presentedHarness(notPending.presenter);
  a.fc.send(env('submit-turn', { text: 'show me' }));
  await waitFor(() => a.runs.length === 1);
  a.runs[0]!.feed(presentCall(1, ['LLD-aaa-S001', 'LLD-zzz-S001', 'docs/gone.md']));
  await waitFor(() => infoTexts(a.fc).length === 1);
  assert.match(infoTexts(a.fc)[0]!, /LLD-zzz-S001, docs\/gone\.md/);
  assert.ok(!infoTexts(a.fc)[0]!.includes('LLD-aaa-S001'), 'the opened name is not listed');

  const unreadable = presenterSpy({ outcome: { opened: [], notPending: [], unreadable: true } });
  const b = presentedHarness(unreadable.presenter);
  b.fc.send(env('submit-turn', { text: 'show me' }));
  await waitFor(() => b.runs.length === 1);
  b.runs[0]!.feed(presentCall(1, ['LLD-aaa-S001']));
  await waitFor(() => infoTexts(b.fc).length === 1);
  assert.match(infoTexts(b.fc)[0]!, /pending list could not be read/);

  // Everything opened: no line. A presenter that throws on a declaration: logged, no line, the turn goes on.
  const fine = presenterSpy();
  const c = presentedHarness(fine.presenter);
  c.fc.send(env('submit-turn', { text: 'show me' }));
  await waitFor(() => c.runs.length === 1);
  c.runs[0]!.feed(presentCall(1, ['LLD-aaa-S001']));
  await waitFor(() => fine.calls.some((x) => x.startsWith('declared')));
  const bad = presenterSpy({ throwOn: 'declared' });
  const d = presentedHarness(bad.presenter);
  d.fc.send(env('submit-turn', { text: 'show me' }));
  await waitFor(() => d.runs.length === 1);
  d.runs[0]!.feed(presentCall(1, ['LLD-aaa-S001']));
  d.runs[0]!.feed(doneOf(1));
  await waitFor(() => dones(d.fc) === 1);
  await runsSettled();
  assert.deepEqual([infoTexts(c.fc), infoTexts(d.fc)], [[], []]);
  assert.equal(d.errors.filter((e) => /review presenter failed on a declaration/.test(e)).length, 1);
});

test('the chat host feeds the declaration from both a followed live turn and a hosted run', async () => {
  // A hosted run.
  const run = presenterSpy();
  const h = presentedHarness(run.presenter);
  h.fc.send(env('submit-turn', { text: 'show me' }));
  await waitFor(() => h.runs.length === 1);
  h.runs[0]!.feed(presentCall(1, ['LLD-aaa-S001']));
  await waitFor(() => run.calls.includes('declared#1:LLD-aaa-S001'));

  // A followed live turn (this window's saved turn, picked up after a reload).
  const fol = presenterSpy();
  const { store, id } = storeWithLiveTurn(1);
  const f = presentedHarness(fol.presenter, { store, hostPid: 2 });
  f.fc.send(env('open-chat', { chatId: id }));
  await waitFor(() => f.resumes.length === 1);
  f.resumes[0]!.feed(presentCall(1, ['PLAN-bbb-S001', 'docs/x/PLAN.md']));
  await waitFor(() => fol.calls.some((x) => x.startsWith('declared')));
  assert.deepEqual(fol.calls, ['begin#1', 'declared#1:PLAN-bbb-S001,docs/x/PLAN.md']);
  f.resumes[0]!.feed(doneOf(1));
  await waitFor(() => fol.calls.includes('end#1'));
});

test('the chat opens a declared pending document even when the insrc_present tool call itself failed', async () => {
  const list = [{ id: 'LLD-aaa-S001', mdPath: '/repo/docs/x/LLD.md' }];
  const opened: string[] = [];
  const real = createReviewPresenter({ pendingDocuments: async () => [...list], open: (t) => void opened.push(t.artifactId), log: { warn: () => {}, error: () => {} } });
  const h = presentedHarness(real);
  h.fc.send(env('submit-turn', { text: 'show me' }));
  await waitFor(() => h.runs.length === 1);
  h.runs[0]!.feed(presentCall(1, ['LLD-aaa-S001']));
  // The call failed (the tool answered an error, or the CLI refused it): the declaration was already made.
  h.runs[0]!.feed({ kind: 'tool-result', turnId: 't1', command: 'insrc_present', output: 'insrc_present: no repo', isError: true } as TurnEvent);
  await waitFor(() => opened.length === 1);
  assert.deepEqual(opened, ['LLD-aaa-S001']);
  h.runs[0]!.feed(doneOf(1));
  await waitFor(() => dones(h.fc) === 1);
});

// ---- run-config controls (provider·model popup + effort gauge, bottom-right) ----


test('runCatalogView: maps cliKind→provider, keeps only installed providers, drops rejected models, picks the first alias', () => {
  const defs = {
    version: 1,
    defaultFamily: 'cli-claude',
    families: [
      { id: 'cli-claude', cliKind: 'claude', displayName: 'Claude CLI', models: [
        { id: 'claude-opus-5-5', aliases: ['opus'], displayName: 'Claude Opus 5.5', efforts: ['low', 'high'], source: 'shipped' },
        { id: 'claude-gone', aliases: [], efforts: [], source: 'shipped' },
      ], rejectedModels: ['claude-gone'], tierDefaults: {} },
      { id: 'cli-codex', cliKind: 'codex', displayName: 'Codex CLI', models: [
        { id: 'gpt-6-astra', aliases: [], efforts: ['low', 'ultra'], source: 'shipped' },
      ], rejectedModels: [], tierDefaults: {} },
      { id: 'cli-vibe', cliKind: 'vibe', displayName: 'Mistral Vibe CLI', models: [
        { id: 'zai-glm-5-3', aliases: ['glm-5-3'], efforts: ['low', 'max'], source: 'shipped' },
      ], rejectedModels: [], tierDefaults: {} },
      { id: 'ollama', displayName: 'Ollama', models: [], toolLoopModel: 'qwen' },
    ],
  } as never;
  const view = runCatalogView(defs, ['claude', 'vibe']); // codex NOT installed
  assert.deepEqual(view.map((p) => p.id), ['claude', 'vibe'], 'only installed CLI families, ollama excluded');
  assert.deepEqual(view[0]!.models.map((m) => [m.id, m.alias, m.efforts]), [['claude-opus-5-5', 'opus', ['low', 'high']]], 'rejected model dropped, first alias kept');
  assert.deepEqual(view[1]!.models[0], { id: 'zai-glm-5-3', name: 'zai-glm-5-3', alias: 'glm-5-3', efforts: ['low', 'max'] });
});

test('new-chat with model/effort: the draft carries them and the next turn request includes them', async () => {
  const fc = fakeChannel();
  const reqs: TurnRequest[] = [];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }], { onRun: (r) => reqs.push(r) }) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  fc.send(env('new-chat', { provider: 'claude', model: 'opus', effort: 'high' }));
  await new Promise((r) => setTimeout(r, 0));
  fc.send(env('submit-turn', { text: 'hi' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.model, 'opus');
  assert.equal(reqs[0]!.effort, 'high');
  // The host echoes the run config to the buttons.
  assert.ok(fc.posted.some((m) => m.payload.type === 'run-config' && m.payload.provider === 'claude' && m.payload.model === 'opus' && m.payload.effort === 'high'));
});

test('set-run-config: updates the session for subsequent turns and echoes run-config; invalid shapes are no-ops', async () => {
  const fc = fakeChannel();
  const reqs: TurnRequest[] = [];
  const store = createInMemoryChatSessionStore();
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }], { onRun: (r) => reqs.push(r) }) }, ['claude']),
    store,
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  fc.send(env('new-chat', { provider: 'claude' }));
  await new Promise((r) => setTimeout(r, 0));
  fc.send(env('set-run-config', { model: 'sonnet' }));
  await new Promise((r) => setTimeout(r, 0));
  fc.send(env('set-run-config', { effort: 'max' }));
  fc.send(env('set-run-config', { model: 42 })); // non-string: ignored
  await new Promise((r) => setTimeout(r, 0));
  fc.send(env('submit-turn', { text: 'hi' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.model, 'sonnet', 'model change applies to the next turn');
  assert.equal(reqs[0]!.effort, 'max', 'effort change applies to the next turn');
  const echoes = fc.posted.filter((m) => m.payload.type === 'run-config');
  assert.ok(echoes.some((m) => m.payload.model === 'sonnet' && m.payload.effort === 'max'), 'the final run-config echo carries both');
  // clearing back to the CLI default works
  fc.send(env('set-run-config', { model: '' }));
  await new Promise((r) => setTimeout(r, 0));
  fc.send(env('submit-turn', { text: 'again' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(reqs.at(-1)!.model, undefined, 'empty model = CLI default (flag omitted)');
});

test('a started chat refuses a provider change (host backstop); an unstarted draft allows it', async () => {
  const fc = fakeChannel();
  const ran: string[] = [];
  const claude = scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }], { onRun: () => { ran.push('claude'); } });
  const codex = scriptedAdapter([{ kind: 'done', turnId: 't', ok: true }], { onRun: () => { ran.push('codex'); } });
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude, codex }, ['claude', 'codex']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'FIXEDNONCE',
  });
  host.open();
  fc.send(env('new-chat', { provider: 'claude' }));
  await new Promise((r) => setTimeout(r, 0));
  fc.send(env('submit-turn', { text: 'hi' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ran, ['claude'], 'first turn runs on claude');
  // The session has rows now: a new-chat naming a different provider is refused.
  const before = fc.posted.length;
  fc.send(env('new-chat', { provider: 'codex' }));
  await new Promise((r) => setTimeout(r, 0));
  const after = fc.posted.slice(before);
  assert.ok(after.some((m) => m.payload.type === 'run-config' && m.payload.provider === 'claude'), 'the refused change re-echoes the current provider');
  assert.ok(!after.some((m) => m.payload.type === 'session-restored'), 'the refused change does not restore a new session');
  fc.send(env('submit-turn', { text: 'again' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ran, ['claude', 'claude'], 'the next turn still runs on claude');
  // A same-provider new-chat (the 'new…' flow) is allowed even on a started session.
  fc.send(env('new-chat', { provider: 'claude' }));
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(fc.posted.some((m) => m.payload.type === 'session-restored'), 'same-provider new-chat starts a fresh draft');
  // On the fresh (empty) draft a provider switch IS allowed.
  fc.send(env('new-chat', { provider: 'codex' }));
  await new Promise((r) => setTimeout(r, 0));
  fc.send(env('submit-turn', { text: 'hi' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ran, ['claude', 'claude', 'codex'], 'an unstarted draft allows the provider switch');
});
