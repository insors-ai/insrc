/**
 * Story E20260926be8708a9:S001 — WebviewView->ChatPanelChannel adapter + sidebar provider.
 *
 * Fake WebviewView + fake host/deps, no VS Code runtime. Proves the adapter maps every
 * ChatPanelChannel method onto the view's webview, a fake view drives the existing
 * createChatPanelHost end to end, the provider enables scripts + rebuilds on re-resolution,
 * and the module is runtime-vscode-free.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/chat-view-channel.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  webviewViewToChannel,
  createChatSidebarViewProvider,
  type ChatSidebarViewDeps,
} from '../chat-view-channel.js';
import { createChatPanelHost, type ChatPanelChannel, type ChatPanelHost } from '../chat-panel.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import type { ProviderId, StreamAdapter, ProviderRegistry, TurnRequest } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';

type ViewArg = import('vscode').WebviewView;

interface FakeView {
  view: ViewArg;
  webview: { html: string; options: unknown; posted: unknown[] };
  fireMessage(m: unknown): void;
  fireDispose(): void;
  shownWith: boolean[];
}
function fakeWebviewView(): FakeView {
  let disposed = false;
  let msgListener: ((m: unknown) => unknown) | undefined;
  let dispListener: (() => unknown) | undefined;
  const shownWith: boolean[] = [];
  const webview = {
    html: '',
    options: undefined as unknown,
    posted: [] as unknown[],
    postMessage(m: unknown): PromiseLike<boolean> {
      if (disposed) return Promise.reject(new Error('view disposed'));
      webview.posted.push(m);
      return Promise.resolve(true);
    },
    onDidReceiveMessage(l: (m: unknown) => unknown) {
      msgListener = l;
      return { dispose() {} };
    },
  };
  const view = {
    webview,
    visible: true,
    onDidDispose(l: () => unknown) {
      dispListener = l;
      return { dispose() {} };
    },
    show(preserveFocus?: boolean) {
      shownWith.push(preserveFocus === true);
    },
  } as unknown as ViewArg;
  return {
    view,
    webview,
    fireMessage: (m) => msgListener?.(m),
    fireDispose: () => {
      disposed = true;
      dispListener?.();
    },
    shownWith,
  };
}

function scriptedAdapter(events: TurnEvent[]): StreamAdapter {
  let cancelled = false;
  return {
    async *run(_req: TurnRequest): AsyncIterable<TurnEvent> {
      for (const ev of events) {
        if (cancelled) return;
        await Promise.resolve();
        yield ev;
      }
    },
    cancel: () => { cancelled = true; },
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
const tick = () => new Promise((r) => setTimeout(r, 0));

test('webviewViewToChannel maps every ChatPanelChannel method onto the view/webview', () => {
  const fv = fakeWebviewView();
  const ch = webviewViewToChannel(fv.view);
  ch.setHtml('<html>x</html>');
  assert.equal(fv.webview.html, '<html>x</html>');
  ch.postMessage({ v: 1 });
  assert.deepEqual(fv.webview.posted, [{ v: 1 }]);
  let got: unknown;
  ch.onMessage((m) => { got = m; });
  fv.fireMessage({ hello: true });
  assert.deepEqual(got, { hello: true });
  let disposed = false;
  ch.onDidDispose(() => { disposed = true; });
  ch.reveal();
  assert.deepEqual(fv.shownWith, [true], 'reveal -> view.show(true)');
  assert.doesNotThrow(() => ch.dispose(), 'dispose is a no-op');
  fv.fireDispose();
  assert.equal(disposed, true, 'onDidDispose forwarded');
});

test('postMessage after the view is disposed is swallowed (never throws inward)', async () => {
  const fv = fakeWebviewView();
  const ch = webviewViewToChannel(fv.view);
  fv.fireDispose();
  assert.doesNotThrow(() => ch.postMessage({ v: 1 }), 'no synchronous throw');
  await tick(); // let the rejected postMessage promise settle (must be swallowed, no unhandled rejection)
});

test('createChatPanelHost driven by a view-backed channel renders the shell + posts session-restored', async () => {
  const fv = fakeWebviewView();
  const host = createChatPanelHost({
    createPanel: () => webviewViewToChannel(fv.view),
    providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
  });
  host.open();
  await tick();
  assert.match(fv.webview.html, /<script/, 'the nonce’d shell was rendered into the view');
  const types = fv.webview.posted.map((m) => (m as { payload?: { type?: string } }).payload?.type);
  assert.ok(types.includes('session-restored'), 'posted session-restored into the sidebar view');
});

test('provider enables scripts, builds+opens a host, and rebuilds (disposing the old host) on re-resolution', async () => {
  const events: string[] = [];
  const hosts: Array<{ id: number; disposed: boolean }> = [];
  let n = 0;
  const deps: ChatSidebarViewDeps = {
    toChannel: (view) => webviewViewToChannel(view),
    makeHost: (_createPanel): ChatPanelHost => {
      const rec = { id: ++n, disposed: false };
      hosts.push(rec);
      return {
        open: () => { events.push(`open:${rec.id}`); },
        dispose: () => { rec.disposed = true; events.push(`dispose:${rec.id}`); },
      };
    },
    enableScripts: (view) => {
      (view.webview as { options: unknown }).options = { enableScripts: true };
      events.push('enableScripts');
    },
  };
  const provider = createChatSidebarViewProvider(deps);

  const fv1 = fakeWebviewView();
  provider.resolveWebviewView(fv1.view, undefined, undefined);
  assert.deepEqual((fv1.webview as { options: unknown }).options, { enableScripts: true });
  assert.deepEqual(events, ['enableScripts', 'open:1'], 'scripts enabled before the host opens');

  // Re-resolution with a fresh view rebuilds: the first host is disposed, a second opened.
  const fv2 = fakeWebviewView();
  provider.resolveWebviewView(fv2.view, undefined, undefined);
  assert.equal(hosts[0]!.disposed, true, 'the stale host was disposed on re-resolution');
  assert.deepEqual(events, ['enableScripts', 'open:1', 'dispose:1', 'enableScripts', 'open:2']);

  // Disposing the current view disposes its host.
  fv2.fireDispose();
  assert.equal(hosts[1]!.disposed, true, 'disposing the view disposes the current host');
});

test('H1: a rebuilt host resumes the prior conversation (does not silently start an empty chat)', async () => {
  // Two real hosts across two resolves over a SHARED store, with the sidebar persisting +
  // resuming the active session id (as extension.ts wires globalState). The second resolve
  // must show the SAME session, not a fresh empty one.
  const store = createInMemoryChatSessionStore();
  let lastSession: string | undefined;
  const makeHost = (createPanel: () => ChatPanelChannel): ChatPanelHost =>
    createChatPanelHost({
      createPanel,
      providers: registry({ claude: scriptedAdapter([]) }, ['claude']),
      store,
      cwd: () => '/repo',
      resumeSessionId: () => lastSession,
    });
  const deps: ChatSidebarViewDeps = {
    toChannel: (view) => webviewViewToChannel(view),
    makeHost,
    enableScripts: (view) => { (view.webview as { options: unknown }).options = { enableScripts: true }; },
    onActiveSession: (id) => { lastSession = id; },
  };
  const provider = createChatSidebarViewProvider(deps);

  const fv1 = fakeWebviewView();
  provider.resolveWebviewView(fv1.view, undefined, undefined);
  await tick();
  const firstId = lastSession;
  assert.ok(firstId, 'first resolve established an active session');
  // Give that session a user turn so it is a non-empty, identifiable conversation.
  const s = store.get(firstId!)!;
  s.transcript.push({ role: 'user', text: 'remember me', at: '2026-09-26T00:00:00Z' });
  store.save(s);

  // Re-resolution (e.g. window reload / view move) builds a fresh host.
  const fv2 = fakeWebviewView();
  provider.resolveWebviewView(fv2.view, undefined, undefined);
  await tick();
  const restored = fv2.webview.posted
    .map((m) => (m as { payload?: { type?: string; sessionId?: string; transcript?: Array<{ text: string }> } }).payload)
    .find((p) => p?.type === 'session-restored');
  assert.ok(restored, 'second resolve posted session-restored');
  assert.equal(restored!.sessionId, firstId, 'the rebuilt host RESUMED the prior session (not a new empty one)');
  assert.ok((restored!.transcript ?? []).some((t) => t.text === 'remember me'), 'the prior conversation transcript survived the rebuild');
  assert.equal(store.list().length, 1, 'no stray empty session was created on rebuild');
});

test('chat-view-channel.ts is runtime-vscode-free (only a type-only vscode import)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'chat-view-channel.ts'), 'utf8');
  assert.doesNotMatch(src, /import\s+\{[^}]*\}\s+from ['"]vscode['"]/, 'no value import from vscode');
  assert.doesNotMatch(src, /import\s+\*\s+as\s+\w+\s+from ['"]vscode['"]/, 'no namespace import from vscode');
  assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, 'no vscode require');
  assert.match(src, /import type \{[^}]*\} from ['"]vscode['"]/, 'the vscode import is type-only');
});
