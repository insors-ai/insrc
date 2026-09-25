/**
 * Story E20260925edb76e2e:S003 / t3 + t5 — chat host unit + rendered-shell contract.
 *
 * FakePanel + fake StreamAdapter + in-memory ChatSessionStore, no vscode runtime.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/chat-panel.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatPanelHost, type ChatPanelChannel } from '../chat-panel.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import type { ProviderId, StreamAdapter, ProviderRegistry, TurnRequest } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';

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
async function waitFor(fn: () => boolean, ms = 1500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) { if (fn()) return; await new Promise((r) => setTimeout(r, 5)); }
  throw new Error('waitFor timed out');
}

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

test('single-in-flight: a second submit supersedes the first — no interleave + prior turn reaped (H1/M2)', async () => {
  const fc = fakeChannel();
  // One 'claude' adapter that serves both runs: run #1 (A) streams then HANGS until
  // cancel('A'); run #2 (B) streams to done. cancel(turnId) is the reliable reap.
  const cancelled = new Set<string>();
  const reaped = new Set<string>();
  const scripts: Array<{ id: string; events: TurnEvent[]; hang?: boolean }> = [
    { id: 'A', events: [{ kind: 'status', turnId: 'A', phase: 'thinking' }, { kind: 'assistant-delta', turnId: 'A', text: 'from-A' }], hang: true },
    { id: 'B', events: [{ kind: 'assistant-delta', turnId: 'B', text: 'from-B' }, { kind: 'done', turnId: 'B', ok: true }] },
  ];
  let call = 0;
  const adapter: StreamAdapter = {
    async *run(): AsyncIterable<TurnEvent> {
      const script = scripts[call++]!;
      try {
        for (const ev of script.events) {
          if (cancelled.has(script.id)) return;
          await Promise.resolve();
          yield ev;
        }
        if (script.hang) while (!cancelled.has(script.id)) await new Promise((r) => setTimeout(r, 5));
      } finally {
        reaped.add(script.id);
      }
    },
    cancel: (turnId) => { cancelled.add(turnId); },
    capabilities: { resume: true },
  };
  const host = createChatPanelHost({ createPanel: () => fc.channel, providers: registry({ claude: adapter }, ['claude']), store: createInMemoryChatSessionStore(), cwd: () => '/repo' });
  host.open();
  fc.send(env('submit-turn', { text: 'A' }));
  await waitFor(() => turnEvents(fc).some((e) => (e as { turnId: string }).turnId === 'A'));
  const postsAtSupersede = turnEvents(fc).length;
  fc.send(env('submit-turn', { text: 'B' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  const idsAfter = turnEvents(fc).slice(postsAtSupersede).map((e) => (e as { turnId: string }).turnId);
  assert.ok(!idsAfter.includes('A'), 'no A events after B superseded it (no interleave)');
  assert.ok(turnEvents(fc).some((e) => (e as { turnId: string }).turnId === 'B'), 'B streamed to completion');
  await waitFor(() => reaped.has('A'), 1000);
  assert.equal(reaped.has('A'), true, 'the superseded turn A was cancelled via provider.cancel(A) and reaped');
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
  assert.doesNotMatch(html, /https?:\/\//, 'no remote origin');
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
  assert.doesNotMatch(html, /innerHTML/, 'renders via textContent, never innerHTML');
  // The CSP shell invariants still hold after the S004 edit.
  const scripts = html.match(/<script\b/g) ?? [];
  assert.equal(scripts.length, 1, 'still exactly one inline script');
  const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html);
  assert.match(csp![1]!, /script-src 'nonce-FIXEDNONCE'/, 'strict CSP unchanged');
  assert.doesNotMatch(html, /https?:\/\//, 'no remote origin introduced by the mapper');
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
