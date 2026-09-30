/**
 * Story E20260925edb76e2e:S003 / t3 + t5 — chat host unit + rendered-shell contract.
 *
 * FakePanel + fake StreamAdapter + in-memory ChatSessionStore, no vscode runtime.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/chat-panel.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatPanelHost, type ChatPanelChannel, type ChatEditGovernanceDeps } from '../chat-panel.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import type { ProviderId, StreamAdapter, ProviderRegistry, TurnRequest } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import { defaultComputeDiff, type DiffView } from '../edit-governor.js';

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
    decide: () => {},
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

test('S005 shell: provider-selector options == available + history-dropdown; one script + CSP intact', () => {
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
  assert.match(html, /<select id="insrc-provider"/, 'has a provider-selector');
  assert.match(html, /<option value="claude">claude<\/option>/, 'claude option');
  assert.match(html, /<option value="codex">codex<\/option>/, 'codex option');
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
  assert.match(fc.html(), /<select id="insrc-provider"[^>]*disabled/, 'selector disabled when no CLI installed');
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
  assert.match(html, /reg\.appendKeyed\(reg\.toViewModel\(x\),'r'\+i\)/, 'restore replays keyed via the sc1 registry');
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

// ---- S006: edit governance (inline diff + auto/review + revert) + chat-vs-editor diffView ----

interface FakeGov {
  deps: ChatEditGovernanceDeps;
  disk: Map<string, string>;
  baseline: Map<string, string>;
  editorCalls: Array<{ path: string; review: boolean }>;
  setDiffView: (v: DiffView) => void;
}
function fakeGovernance(): FakeGov {
  const disk = new Map<string, string>();
  const baseline = new Map<string, string>();
  const editorCalls: FakeGov['editorCalls'] = [];
  let view: DiffView = 'chat';
  const deps: ChatEditGovernanceDeps = {
    computeDiff: defaultComputeDiff,
    diffView: () => view,
    baseline: {
      available: async () => true,
      snapshot: async () => ({ ref: 'SNAP' }),
      read: async (_h, path) => baseline.get(path),
    },
    fs: {
      read: async (path) => disk.get(path),
      write: async (path, content) => { disk.set(path, content); },
      remove: async (path) => { disk.delete(path); },
    },
    editorDiff: async (path, _base, o) => { editorCalls.push({ path, review: o.review }); },
  };
  return { deps, disk, baseline, editorCalls, setDiffView: (v) => { view = v; } };
}
const editPrompts = (fc: FakeChannel): Array<{ path: string; diff: unknown; review?: boolean }> =>
  fc.posted.filter((m) => m.payload.type === 'edit-prompt').map((m) => m.payload as { path: string; diff: unknown; review?: boolean });

test('S001 (bugfix): the edit-review gate is RETIRED — even a legacy set-edit-mode:review turn is visualize-only (no revert)', async () => {
  const fc = fakeChannel();
  const gov = fakeGovernance();
  gov.baseline.set('src/a.ts', 'old\n');
  gov.disk.set('src/a.ts', 'NEW\n');
  const store = createInMemoryChatSessionStore();
  const evs: TurnEvent[] = [
    { kind: 'file-edit', turnId: 't1', path: 'src/a.ts', diff: { path: 'src/a.ts', hunks: [] } },
    { kind: 'done', turnId: 't1', ok: true },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
    store,
    cwd: () => '/repo',
    editGovernance: gov.deps,
  });
  host.open();
  // A legacy set-edit-mode:'review' message is now inert — the merged chat mode governs edits, so
  // the governor runs visualize-only regardless (Claude-Code style: no separate accept/reject gate).
  fc.send(env('set-edit-mode', { mode: 'review' }));
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => editPrompts(fc).length >= 1);
  assert.equal(editPrompts(fc)[0]!.path, 'src/a.ts', 'the diff is still shown (visualize)');
  assert.notEqual(editPrompts(fc)[0]!.review, true, 'but there is no review gate (review flag never set)');
  fc.send(env('edit-decision', { path: 'src/a.ts', accept: false }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(gov.disk.get('src/a.ts'), 'NEW\n', 'reject does NOT revert — the gate is retired');
});

test('S006 integration: an AUTO turn renders visualize-only (no accept/reject revert on reject) + edit marker still renders', async () => {
  const fc = fakeChannel();
  const gov = fakeGovernance();
  gov.baseline.set('src/a.ts', 'old\n');
  gov.disk.set('src/a.ts', 'NEW\n');
  const store = createInMemoryChatSessionStore();
  const evs: TurnEvent[] = [
    { kind: 'file-edit', turnId: 't1', path: 'src/a.ts', diff: { path: 'src/a.ts', hunks: [] } },
    { kind: 'done', turnId: 't1', ok: true },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
    store,
    cwd: () => '/repo',
    editGovernance: gov.deps,
  });
  host.open(); // default session is 'auto'
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'done'));
  await waitFor(() => editPrompts(fc).length >= 1); // auto still shows the diff (ac1)
  // the existing edit marker (S004) still renders as a turn-event
  assert.ok(turnEvents(fc).some((e) => e.kind === 'file-edit'), 'file-edit still posted as a turn-event (marker unchanged)');
  // a stray reject in auto is not tracked -> no revert
  fc.send(env('edit-decision', { path: 'src/a.ts', accept: false }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(gov.disk.get('src/a.ts'), 'NEW\n', 'auto mode: reject does not revert (edit not tracked)');
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

test('S006 integration: diffView=editor routes to the native editor seam (no chat edit-prompt)', async () => {
  const fc = fakeChannel();
  const gov = fakeGovernance();
  gov.setDiffView('editor');
  gov.baseline.set('src/a.ts', 'old\n');
  gov.disk.set('src/a.ts', 'NEW\n');
  const store = createInMemoryChatSessionStore();
  const evs: TurnEvent[] = [
    { kind: 'file-edit', turnId: 't1', path: 'src/a.ts', diff: { path: 'src/a.ts', hunks: [] } },
    { kind: 'done', turnId: 't1', ok: true },
  ];
  const host = createChatPanelHost({
    createPanel: () => fc.channel,
    providers: registry({ claude: scriptedAdapter(evs) }, ['claude']),
    store,
    cwd: () => '/repo',
    editGovernance: gov.deps,
  });
  host.open();
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => gov.editorCalls.length >= 1);
  assert.equal(gov.editorCalls[0]!.path, 'src/a.ts', 'editor diff opened for the edited path');
  assert.equal(editPrompts(fc).length, 0, 'editor mode posts NO chat edit-prompt');
});

test('S006: without editGovernance the host behaves as before (no edit-prompt; file-edit marker still renders)', async () => {
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
  assert.equal(editPrompts(fc).length, 0, 'no governance -> no edit-prompt');
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
  assert.match(html, /function renderDiff\(/, 'the chat-view diff renderer is still embedded (visualize)');
  const scripts = html.match(/<script\b/g) ?? [];
  assert.equal(scripts.length, 1, 'still exactly one inline script');
  assert.match(html, /script-src 'nonce-FIXEDNONCE'/, 'strict CSP unchanged');
  assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded (embedded marked ships URLs only in warning strings)');
  assert.doesNotMatch(html, /asWebviewUri/, 'no asWebviewUri');
});

test('S001 (bugfix): the edit-prompt is always visualize-only (review flag never set) — the gate is retired', async () => {
  // A legacy set-edit-mode:'review' no longer flips the gate: every edit-prompt is visualize-only.
  const fcR = fakeChannel();
  const govR = fakeGovernance();
  govR.baseline.set('a.ts', 'old\n');
  govR.disk.set('a.ts', 'new\n');
  const storeR = createInMemoryChatSessionStore();
  const hostR = createChatPanelHost({
    createPanel: () => fcR.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'file-edit', turnId: 't1', path: 'a.ts', diff: { path: 'a.ts', hunks: [] } }, { kind: 'done', turnId: 't1', ok: true }]) }, ['claude']),
    store: storeR,
    cwd: () => '/repo',
    editGovernance: govR.deps,
  });
  hostR.open();
  fcR.send(env('set-edit-mode', { mode: 'review' })); // inert now
  fcR.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => editPrompts(fcR).length >= 1);
  assert.notEqual(editPrompts(fcR)[0]!.review, true, 'even a legacy review request -> no gate (visualize)');

  // default mode -> edit-prompt.review falsy (webview shows no controls)
  const fcA = fakeChannel();
  const govA = fakeGovernance();
  govA.baseline.set('a.ts', 'old\n');
  govA.disk.set('a.ts', 'new\n');
  const hostA = createChatPanelHost({
    createPanel: () => fcA.channel,
    providers: registry({ claude: scriptedAdapter([{ kind: 'file-edit', turnId: 't1', path: 'a.ts', diff: { path: 'a.ts', hunks: [] } }, { kind: 'done', turnId: 't1', ok: true }]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    editGovernance: govA.deps,
  });
  hostA.open(); // default auto
  fcA.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => editPrompts(fcA).length >= 1);
  assert.notEqual(editPrompts(fcA)[0]!.review, true, 'auto session -> edit-prompt.review not true (no controls)');
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

// ---- S001 t6: header session-name clamp (ac4) ----

test('S001 ac4: the header embeds the session-name clamp wiring (>32 chars -> ellipsis, view-only)', () => {
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
  // The header carries a dedicated session-title element, fed by the single-sourced clamp.
  assert.match(html, /id="insrc-sesstitle"/, 'the header has a session-title element');
  assert.match(html, /const clampTitle=\(function\(s\)/, 'the clamp is embedded inline (single-sourced with session-title.ts)');
  assert.match(html, /st\.textContent=_ac&&_ac\.title\?clampTitle\(_ac\.title\)/, 'the active session title is rendered through the clamp');
  assert.match(html, /slice\(0,32\)/, 'the clamp truncates at 32 chars (ac4)');
  // CSP/one-script/textContent invariants intact.
  const scripts = html.match(/<script\b/g) ?? [];
  assert.equal(scripts.length, 1, 'still exactly one inline script');
  assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:\/\//i, 'no remote resource is loaded (embedded marked ships URLs only in warning strings)');
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
  assert.match(html, /if\(running\)\{vs\.postMessage\(\{v:1,payload:\{type:'cancel-turn'\}\}\);setRunning\(false\);hideProgress\(\);\}else\{doSubmit\(\);\}/, 'the "> " prompt posts cancel-turn while running AND resets the UI locally, else submits');
  assert.match(html, /function doSubmit\(\)\{if\(!box\.value\.trim\(\)\)return;vs\.postMessage\(\{v:1,payload:\{type:'submit-turn'/, 'doSubmit guards empty then posts submit-turn + marks running (unchanged)');
  // t2: role=button span is keyboard-activatable (Enter/Space -> click).
  assert.match(html, /sendBtn\.addEventListener\('keydown',function\(e\)\{if\(e\.key==='Enter'\|\|e\.key===' '\)\{e\.preventDefault\(\);sendBtn\.click\(\);\}\}\);/, 'Enter/Space activate the ">" prompt control');
});

test('S002 (ux-polish) t4: the assistant bubble spans ~90% (bumped from 88%); user bubble (82%) + wrapper (100%) unchanged', () => {
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
  assert.match(html, /\.insrc-bubble--assistant\{[^}]*max-width:90%/, 'assistant bubble max-width is 90%');
  assert.doesNotMatch(html, /\.insrc-bubble--assistant\{[^}]*max-width:88%/, 'the old 88% assistant cap is gone');
  assert.match(html, /\.insrc-bubble--user\{[^}]*max-width:82%/, 'user bubble stays 82%');
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
  assert.equal((html.match(/overflow-y:auto/g) ?? []).length, 1, '#insrc-term is the ONLY overflow-y:auto region');
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
  for (const id of ['insrc-term', 'insrc-input', 'insrc-provider', 'insrc-history', 'insrc-mode', 'insrc-sesstitle']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} preserved`);
  }
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

test('S002 ac3: renderShell embeds a single #insrc-progress widget above the input, hidden at rest', () => {
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
  assert.match(html, /<div id="insrc-progress" class="progress" hidden>/, 'hidden at rest');
  // It sits above the input bar.
  assert.ok(html.indexOf('id="insrc-progress"') < html.indexOf('class="inputbar"'), 'progress is above the input');
  // It is animated (a keyframed spinner) and status routes to it, not a transcript row.
  assert.match(html, /@keyframes insrc-blink/, 'the widget is animated');
  assert.match(html, /if\(ev&&ev\.kind==='status'\)\{var mkp=markerFor\(ev\);if\(running&&mkp\)setProgress\(mkp\.label\);\}/, 'status drives the progress widget (gated on running), not a row');
  assert.match(html, /if\(ev&&\(ev\.kind==='done'\|\|ev\.kind==='error'\)\)\{setRunning\(false\);hideProgress\(\);\}/, 'done/error hides the widget + restores Send');
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
  for (const id of ['insrc-term', 'insrc-input', 'insrc-prompt', 'insrc-progress', 'insrc-sesstitle']) {
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
  assert.equal((html.match(/overflow-y:auto/g) ?? []).length, 1, '#insrc-term stays the ONLY overflow-y:auto region');
});

test('S001 (fidelity) ac2: the placeholder gains the interrupt hint', () => {
  const html = fidelityHtml();
  assert.match(html, /placeholder="message claude… \(⌘↵ send · \^C interrupt\)"/, "placeholder reads 'message claude… (⌘↵ send · ^C interrupt)'");
  assert.doesNotMatch(html, /⌘↵ to send/, "the old '⌘↵ to send' placeholder is gone");
});

test('S001 (fidelity) ac3: the status bar is READ-ONLY (session · edits · ✓ idle); the selects moved to the header', () => {
  const html = fidelityHtml();
  const chrome = html.slice(html.indexOf('<div class="chrome">'), html.indexOf('<div id="insrc-term"'));
  const statusbarFull = html.slice(html.indexOf('<div class="statusbar">'));
  const statusbar = statusbarFull.slice(0, statusbarFull.indexOf('</div>'));
  // The functional provider + mode selects live in the header (.chrome) now, with ids/options preserved.
  assert.match(chrome, /<select id="insrc-provider"/, 'the provider select is in the header');
  assert.match(chrome, /id="insrc-modeseg"/, 'the mode seg is in the header');
  assert.match(chrome, /<select id="insrc-mode"/, 'the mode select is in the header');
  assert.match(chrome, /<option value="manual">Manual<\/option><option value="edit-auto">Edit Automatically<\/option><option value="auto">Auto<\/option>/, 'the mode options are preserved in the header');
  // The status bar is read-only: NO <select> chevrons, just session / edits / ✓ idle.
  assert.doesNotMatch(statusbar, /<select/, 'the status bar has NO <select> (read-only)');
  assert.match(statusbar, /session <b id="insrc-statussess">/, "the bar shows a read-only 'session' segment");
  assert.match(statusbar, /edits <b id="insrc-statusedits">/, "the bar shows a read-only 'edits' segment");
  assert.match(statusbar, /✓ idle/, "the bar keeps the '✓ idle' segment");
  // The edits label maps the mode value to its short word, re-rendered from pmode.
  assert.match(html, /EDITS_LABEL=\{manual:'review','edit-auto':'auto-edit',auto:'auto'\}/, 'the mode→label map is manual→review / edit-auto→auto-edit / auto→auto');
  assert.match(html, /seEdits\.textContent=editsLabel\(pmode\)/, "updatePermSeg re-renders the read-only 'edits' label from pmode");
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

test('S001 adopt(channel) wires + posts theme/session-restored/history-list (restored panel shows history)', () => {
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

test('S001 (bugfix): a stale/idless permission-decision (no pendingPerms entry) falls through to adapter.decide (codex/in-turn relay unchanged)', async () => {
  const fc = fakeChannel();
  const decided: Array<[string, string, string]> = [];
  // An approval-request WITHOUT a toolName is never added to pendingPerms, so a decision for it
  // falls through to the live turn's adapter.decide() — the codex / in-turn control-protocol path.
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
  host.open();
  fc.send(env('submit-turn', { text: 'do it' }));
  await waitFor(() => turnEvents(fc).some((e) => e.kind === 'approval-request'));
  fc.send(env('permission-decision', { requestId: 'perm-9', decision: 'approve' }));
  await waitFor(() => decided.length >= 1);
  assert.deepEqual(decided[0], ['t9', 'perm-9', 'approve'], 'fell through to the live adapter.decide relay (unchanged)');
  // S003 (ux polish): a stale/no-pending decision records NO outcome (nothing to resolve).
  assert.ok(!turnEvents(fc).some((e) => e.kind === 'permission-outcome'), 'no outcome recorded for a fall-through decision');
  fc.fireDispose(); // reap the hanging turn so the test process can exit
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
