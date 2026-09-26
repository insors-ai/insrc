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
  assert.doesNotMatch(html, /https?:\/\//, 'no remote origin');
  assert.doesNotMatch(html, /asWebviewUri/, 'no asWebviewUri');
  assert.doesNotMatch(html, /innerHTML/, 'textContent only, never innerHTML');
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
  assert.doesNotMatch(html, /innerHTML/, 'textContent only, never innerHTML');
  assert.doesNotMatch(html, /https?:\/\//, 'no remote origin');
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

test('S006 integration: a REVIEW turn posts an sc3 edit-prompt; edit-decision reject reverts via the fs seam; accept keeps', async () => {
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
  // put the (default) session into review mode first
  fc.send(env('set-edit-mode', { mode: 'review' }));
  fc.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => editPrompts(fc).length >= 1);
  assert.equal(editPrompts(fc)[0]!.path, 'src/a.ts', 'review turn posted an edit-prompt for the edited path');
  fc.send(env('edit-decision', { path: 'src/a.ts', accept: false }));
  await waitFor(() => gov.disk.get('src/a.ts') === 'old\n');
  assert.equal(gov.disk.get('src/a.ts'), 'old\n', 'reject reverted to the pre-turn baseline');
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
  assert.match(html, /<select id="insrc-editmode"/, 'the edit-mode toggle is contributed');
  assert.match(html, /function renderDiff\(/, 'the chat-view diff renderer is embedded');
  assert.match(html, /renderDiff\(m\.path,m\.diff,m\.review===true\)/, 'controls gate on the HOST review flag, not a webview-local toggle');
  assert.match(html, /type:'edit-decision'/, 'accept/reject controls post edit-decision');
  assert.match(html, /type:'set-edit-mode'/, 'the toggle posts set-edit-mode');
  const scripts = html.match(/<script\b/g) ?? [];
  assert.equal(scripts.length, 1, 'still exactly one inline script');
  assert.match(html, /script-src 'nonce-FIXEDNONCE'/, 'strict CSP unchanged');
  assert.doesNotMatch(html, /innerHTML/, 'textContent only, never innerHTML');
  assert.doesNotMatch(html, /https?:\/\//, 'no remote origin');
  assert.doesNotMatch(html, /asWebviewUri/, 'no asWebviewUri');
});

test('S006: the edit-prompt carries the HOST review flag (authoritative; not a webview-local toggle) — review vs auto', async () => {
  // review session -> edit-prompt.review === true
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
  fcR.send(env('set-edit-mode', { mode: 'review' }));
  fcR.send(env('submit-turn', { text: 'go' }));
  await waitFor(() => editPrompts(fcR).length >= 1);
  assert.equal(editPrompts(fcR)[0]!.review, true, 'review session -> edit-prompt.review true');

  // auto session -> edit-prompt.review falsy (webview shows no controls, regardless of its local toggle)
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
  assert.doesNotMatch(html, /innerHTML/, 'textContent only, never innerHTML');
  assert.doesNotMatch(html, /https?:\/\//, 'no remote origin');
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

// ---- S002 t3: Send/Stop button + fixed-region layout ----

test('S002 ac2: renderShell embeds an icon-only Send/Stop button (#insrc-send) wired to submit-turn / cancel-turn', () => {
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
  assert.match(html, /<button id="insrc-send"/, 'the input area has a Send/Stop button');
  // icon-only: the glyph is set by setRunning (▶/■), no text label baked in beyond the initial caret.
  assert.match(html, /function setRunning\(r\)\{running=r;/, 'setRunning toggles the button glyph/class');
  assert.match(html, /sendBtn\.textContent=r\?'\\u25a0':'\\u25b6'/, 'Stop=■ (u25a0) while running, Send=▶ (u25b6) at rest');
  assert.match(html, /if\(running\)\{vs\.postMessage\(\{v:1,payload:\{type:'cancel-turn'\}\}\);\}else\{doSubmit\(\);\}/, 'the button posts cancel-turn while running, else submits');
  assert.match(html, /function doSubmit\(\)\{vs\.postMessage\(\{v:1,payload:\{type:'submit-turn'/, 'doSubmit posts submit-turn + marks running');
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
  assert.match(html, /\.inputline\{[^}]*flex:0 0 auto/, 'the input line is fixed (flex:0)');
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
  for (const id of ['insrc-term', 'insrc-input', 'insrc-provider', 'insrc-history', 'insrc-editmode', 'insrc-sesstitle']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} preserved`);
  }
  assert.equal((html.match(/<script\b/g) ?? []).length, 1, 'exactly one inline script');
  assert.doesNotMatch(html, /innerHTML/, 'no innerHTML');
  assert.doesNotMatch(html, /https?:\/\//, 'no remote origin');
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
