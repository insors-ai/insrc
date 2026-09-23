/**
 * Story E20260922401ae5fb:S004 / t4 — sc9 WebviewPanelHost tests.
 * The host is exercised over FAKE injected boundaries — no editor host, no daemon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWebviewPanelHost } from '../webview-host.js';
import {
  GatewayReadError,
  type DaemonDataGateway,
  type MenuItem,
  type PanelHandle,
  type TabController,
  type WebviewPanelHostDeps,
} from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A fake webview panel that records the calls the host makes on it. */
class FakePanel implements PanelHandle {
  html = '';
  reveals = 0;
  disposed = false;
  readonly posted: unknown[] = [];
  private disposeListener: (() => void) | undefined;
  private messageListener: ((message: unknown) => void) | undefined;
  constructor(readonly viewType: string, readonly title: string) {}
  setHtml(html: string): void {
    this.html = html;
  }
  reveal(): void {
    this.reveals += 1;
  }
  onDidDispose(listener: () => void): void {
    this.disposeListener = listener;
  }
  onMessage(listener: (message: unknown) => void): void {
    this.messageListener = listener;
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  dispose(): void {
    this.disposed = true;
  }
  /** Simulate the user closing the panel (fires the host's dispose handler). */
  userClose(): void {
    this.disposeListener?.();
  }
  /** Simulate a webview->host message (drives the host's onMessage handler). */
  injectMessage(message: unknown): void {
    this.messageListener?.(message);
  }
}

/** A recording fake gateway; only `status` matters to the host tests. */
function fakeGateway(overrides: Partial<DaemonDataGateway> = {}): DaemonDataGateway {
  return {
    status: async () => ({ state: 'running', detail: 'uptime 5s · 2 repos · queue 0' }),
    workflowChain: async () => ({ rows: [] }),
    mcpClients: async () => [],
    registeredRepos: async () => [],
    scanOrphans: async () => [],
    ...overrides,
  };
}

/** Build a host over fakes, exposing the created panels + picker/log capture. */
function makeHost(opts: {
  pick?: MenuItem | undefined;
  gateway?: DaemonDataGateway;
  detailRenderers?: WebviewPanelHostDeps['detailRenderers'];
  tabControllers?: WebviewPanelHostDeps['tabControllers'];
  onDetailAction?: WebviewPanelHostDeps['onDetailAction'];
} = {}): {
  host: ReturnType<typeof createWebviewPanelHost>;
  created: FakePanel[];
  offered: MenuItem[][];
  warns: string[];
} {
  const created: FakePanel[] = [];
  const offered: MenuItem[][] = [];
  const warns: string[] = [];
  const deps: WebviewPanelHostDeps = {
    panels: ({ viewType, title }) => {
      const p = new FakePanel(viewType, title);
      created.push(p);
      return p;
    },
    pickMenu: async (items) => {
      offered.push([...items]);
      return opts.pick;
    },
    gateway: opts.gateway ?? fakeGateway(),
    logger: { warn: (m) => warns.push(m) },
    detailRenderers: opts.detailRenderers,
    tabControllers: opts.tabControllers,
    onDetailAction: opts.onDetailAction,
  };
  return { host: createWebviewPanelHost(deps), created, offered, warns };
}

/** Flush pending microtasks/timers so the host's async render lands. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

test('showStatusMenu offers EXACTLY two items and routes each choice to the matching panel (ac1)', async () => {
  // Detailed Status choice → opens the detailed panel.
  const detailed = makeHost({ pick: { label: 'Detailed Status', action: 'detailed' } });
  await detailed.host.showStatusMenu();
  await tick();
  assert.equal(detailed.offered.length, 1);
  assert.deepEqual(detailed.offered[0]!.map((i) => i.label), ['Detailed Status', 'Repo Configuration']);
  assert.equal(detailed.created.length, 1, 'the detailed panel was created');
  assert.equal(detailed.created[0]!.viewType, 'insrc.detailedStatus');

  // Repo Configuration choice → opens the repo panel.
  const repo = makeHost({ pick: { label: 'Repo Configuration', action: 'repoConfig' } });
  await repo.host.showStatusMenu();
  assert.equal(repo.created.length, 1);
  assert.equal(repo.created[0]!.viewType, 'insrc.repoConfiguration');
});

test('Cancel path: a dismissed menu (undefined) opens no panel (ac1)', async () => {
  const { host, created } = makeHost({ pick: undefined });
  await host.showStatusMenu();
  await tick();
  assert.equal(created.length, 0, 'nothing opened on cancel');
});

test('openDetailedStatus creates ONE panel with the daemon/workflows/debug tabs, defaults to daemon, renders gateway.status() (ac2)', async () => {
  const { host, created } = makeHost();
  host.openDetailedStatus();
  await tick();
  assert.equal(created.length, 1);
  const html = created[0]!.html;
  for (const label of ['Daemon', 'Workflows', 'Debug']) assert.match(html, new RegExp(label), `tab ${label} present`);
  assert.match(html, /class="tab active"[^>]*data-tab="daemon"/, 'daemon is the active default tab');
  assert.match(html, /uptime 5s/, 'the daemon body renders the gateway.status() detail');
  assert.doesNotMatch(html, /coming soon/, 'the daemon tab is not a placeholder');
});

test('Degraded render: a rejected gateway.status() still opens the panel + tabs with an error body and never throws', async () => {
  const gateway = fakeGateway({
    status: async () => {
      throw new GatewayReadError('daemon.status failed: daemon is not running');
    },
  });
  const { host, created, warns } = makeHost({ gateway });
  assert.doesNotThrow(() => host.openDetailedStatus());
  await tick();
  assert.equal(created.length, 1, 'the panel still opens');
  assert.match(created[0]!.html, /Daemon/, 'the tabs still appear');
  assert.match(created[0]!.html, /daemon unreachable/, 'the daemon body shows an error state');
  assert.ok(warns.some((w) => /daemon status/.test(w)), 'the failure was logged (never thrown)');
});

test('a setHtml throw (e.g. panel disposed mid-render) degrades to a logged no-op — never an unhandled rejection or a sync throw', async () => {
  const warns: string[] = [];
  const host = createWebviewPanelHost({
    panels: ({ viewType, title }) => {
      const p = new FakePanel(viewType, title);
      p.setHtml = () => {
        throw new Error('panel disposed');
      };
      return p;
    },
    pickMenu: async () => undefined,
    gateway: fakeGateway(),
    logger: { warn: (m) => warns.push(m) },
  });
  assert.doesNotThrow(() => host.openDetailedStatus(), 'openDetailedStatus does not throw synchronously');
  assert.doesNotThrow(() => host.openRepoConfiguration(), 'openRepoConfiguration does not throw synchronously');
  await tick();
  assert.ok(warns.some((w) => /Detailed Status panel/.test(w)), 'the detailed-render throw was caught + logged');
  assert.ok(warns.some((w) => /Repo Configuration panel/.test(w)), 'the repo-render throw was caught + logged');
});

test('single-instance: a second open reveals the same panel + switches tab, and after user-close a later open creates fresh', async () => {
  const { host, created } = makeHost();
  host.openDetailedStatus();
  await tick();
  assert.equal(created.length, 1);
  const first = created[0]!;
  const revealsAfterFirst = first.reveals;

  host.openDetailedStatus('debug');
  await tick();
  assert.equal(created.length, 1, 'no duplicate panel');
  assert.ok(first.reveals > revealsAfterFirst, 'the existing panel was revealed again');
  assert.match(first.html, /class="tab active"[^>]*data-tab="debug"/, 'the tab switched to debug');
  assert.match(first.html, /coming soon/, 'the debug tab is a placeholder (s6 fills it)');

  first.userClose();
  host.openDetailedStatus();
  await tick();
  assert.equal(created.length, 2, 'after the user closed it, a later open creates a fresh panel');
});

test('openRepoConfiguration creates/reveals the separate Repo Configuration shell (single-instance)', async () => {
  const { host, created } = makeHost();
  host.openRepoConfiguration();
  assert.equal(created.length, 1);
  assert.equal(created[0]!.viewType, 'insrc.repoConfiguration');
  assert.match(created[0]!.html, /Repo Configuration/);
  host.openRepoConfiguration();
  assert.equal(created.length, 1, 'the repo panel is single-instance');
});

// ---- S005: detailRenderers injection + on-demand message bridge -----------

/** Renderers that count their invocations, for the on-demand / no-poll assertions. */
function countingRenderers(): {
  detailRenderers: NonNullable<WebviewPanelHostDeps['detailRenderers']>;
  counts: { daemon: number; workflows: number };
} {
  const counts = { daemon: 0, workflows: 0 };
  return {
    counts,
    detailRenderers: {
      daemon: async () => {
        counts.daemon += 1;
        return `<p class="daemon-view">daemon body</p>`;
      },
      workflows: async () => {
        counts.workflows += 1;
        return `<p class="workflows-view">workflows body</p>`;
      },
    },
  };
}

test('S005: openDetailedStatus renders the daemon tab from detailRenderers.daemon (ac1)', async () => {
  const { detailRenderers } = countingRenderers();
  const { host, created } = makeHost({ detailRenderers });
  host.openDetailedStatus();
  await tick();
  assert.match(created[0]!.html, /daemon body/, 'the daemon body comes from detailRenderers.daemon');
  assert.doesNotMatch(created[0]!.html, /coming soon/);
});

test("S005: a {switchTab:'workflows'} message re-invokes the workflows renderer exactly once and re-sets the html (ac2/ac3)", async () => {
  const { detailRenderers, counts } = countingRenderers();
  const { host, created } = makeHost({ detailRenderers });
  host.openDetailedStatus();
  await tick();
  assert.equal(counts.daemon, 1, 'daemon rendered once on open');
  assert.equal(counts.workflows, 0);

  created[0]!.injectMessage({ type: 'switchTab', tab: 'workflows' });
  await tick();
  assert.equal(counts.workflows, 1, 'switching re-invokes the workflows renderer exactly once');
  assert.match(created[0]!.html, /workflows body/, 'the workflows body is now shown');
  assert.match(created[0]!.html, /class="tab active"[^>]*data-tab="workflows"/, 'the workflows tab is active');
});

test('S005: a {refresh} message re-invokes the ACTIVE tab renderer exactly once (ac3)', async () => {
  const { detailRenderers, counts } = countingRenderers();
  const { host, created } = makeHost({ detailRenderers });
  host.openDetailedStatus();
  await tick();
  assert.equal(counts.daemon, 1);

  created[0]!.injectMessage({ type: 'refresh' });
  await tick();
  assert.equal(counts.daemon, 2, 'refresh re-reads the active (daemon) tab exactly once more');
  assert.equal(counts.workflows, 0, 'refresh does not touch the inactive tab');
});

test('S005: NO timer/interval is armed — with no message the renderer call-count stays flat (no background poll, ac3)', async () => {
  const { detailRenderers, counts } = countingRenderers();
  const { host } = makeHost({ detailRenderers });
  host.openDetailedStatus();
  await tick();
  const afterOpen = counts.daemon;
  // Wait well beyond any plausible poll interval; with no message nothing re-reads.
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(counts.daemon, afterOpen, 'the daemon renderer is not re-invoked without a message');
  assert.equal(counts.workflows, 0);
});

test('S005: an unknown message type, or switchTab with an invalid tab, is a silent no-op', async () => {
  const { detailRenderers, counts } = countingRenderers();
  const { host, created, warns } = makeHost({ detailRenderers });
  host.openDetailedStatus();
  await tick();
  const baseline = counts.daemon;

  created[0]!.injectMessage({ type: 'nonsense' });
  created[0]!.injectMessage({ type: 'switchTab', tab: 'not-a-tab' });
  created[0]!.injectMessage('a bare string');
  created[0]!.injectMessage({ type: 'switchTab' }); // missing tab
  await tick();
  assert.equal(counts.daemon, baseline, 'no re-render on a malformed/unknown message');
  assert.equal(counts.workflows, 0);
  assert.doesNotThrow(() => created[0]!.injectMessage(null), 'a null message never throws');
  assert.equal(warns.length, 0, 'a malformed message is a silent no-op (not an error)');
});

test('S005: a late switchTab/refresh after the panel was disposed is skipped', async () => {
  const { detailRenderers, counts } = countingRenderers();
  const { host, created } = makeHost({ detailRenderers });
  host.openDetailedStatus();
  await tick();
  const first = created[0]!;
  const baseline = counts.daemon;

  first.userClose(); // the host clears its cached ref
  first.injectMessage({ type: 'refresh' }); // a stray late message on the dead panel
  await tick();
  assert.equal(counts.daemon, baseline, 'a message after dispose does not re-render');
});

test('S005: the rendered Detailed Status shell carries a strict CSP + a per-render nonce on the only inline script', async () => {
  const { detailRenderers } = countingRenderers();
  const { host, created } = makeHost({ detailRenderers });
  host.openDetailedStatus();
  await tick();
  const html = created[0]!.html;
  const cspMatch = /Content-Security-Policy" content="([^"]*)"/.exec(html);
  assert.ok(cspMatch, 'a CSP meta is present');
  assert.match(cspMatch![1]!, /script-src 'nonce-[^']+'/, "script-src is limited to a nonce");
  assert.match(cspMatch![1]!, /default-src 'none'/, 'default-src is none');
  const scriptMatch = /<script nonce="([^"]+)">/.exec(html);
  assert.ok(scriptMatch, 'the only inline script carries a nonce');
  assert.ok(cspMatch![1]!.includes(`nonce-${scriptMatch![1]!}`), 'the CSP nonce matches the script nonce');
  // A second render mints a FRESH nonce (per-render).
  created[0]!.injectMessage({ type: 'refresh' });
  await tick();
  const nonce2 = /<script nonce="([^"]+)">/.exec(created[0]!.html)![1]!;
  assert.notEqual(nonce2, scriptMatch![1]!, 'each render uses a fresh nonce');
});

// ---- S006: tab-controller lifecycle + action route + appendLog bootstrap ----

/** A fake TabController recording activate/dispose counts and the ctxs handed in. */
function fakeController(): {
  controller: TabController;
  state: { activations: number; disposes: number };
} {
  const state = { activations: 0, disposes: 0 };
  return {
    state,
    controller: {
      onActivate() {
        state.activations += 1;
        return () => {
          state.disposes += 1;
        };
      },
    },
  };
}

/** Open the debug tab and complete the webview ready-handshake so the controller arms. */
async function openDebugReady(created: FakePanel[], host: ReturnType<typeof createWebviewPanelHost>): Promise<void> {
  host.openDetailedStatus('debug');
  await tick();
  created[created.length - 1]!.injectMessage({ type: 'ready' }); // the webview finished loading.
  await tick();
}

test('S006: the controller is armed ONLY after the webview {ready} handshake — never before (MED-1 fix: the initial batch is not posted into a not-yet-loaded document)', async () => {
  const { controller, state } = fakeController();
  const { host, created } = makeHost({ tabControllers: { debug: controller } });
  host.openDetailedStatus('debug');
  await tick();
  assert.equal(state.activations, 0, 'the controller is NOT armed on render alone (the webview listener is not live yet)');

  created[0]!.injectMessage({ type: 'ready' });
  await tick();
  assert.equal(state.activations, 1, 'the controller arms once the webview reports ready');
});

test('S006: activating the debug tab calls onActivate; switch-away / re-activate / panel-close dispose it EXACTLY once (one live)', async () => {
  const { controller, state } = fakeController();
  const { host, created } = makeHost({ tabControllers: { debug: controller } });

  await openDebugReady(created, host);
  assert.equal(state.activations, 1, 'the debug controller is armed after the ready handshake');
  assert.equal(state.disposes, 0, 'nothing disposed yet');

  // Switch AWAY to daemon (no controller) → the debug controller is disposed once (at switch).
  created[0]!.injectMessage({ type: 'switchTab', tab: 'daemon' });
  await tick();
  assert.equal(state.disposes, 1, 'switching away disposes the debug controller exactly once');
  created[0]!.injectMessage({ type: 'ready' }); // the daemon doc loads — no controller to arm.
  await tick();
  assert.equal(state.activations, 1, 'daemon has no controller to arm');

  // Switch BACK to debug → re-armed after its ready (still exactly one live).
  created[0]!.injectMessage({ type: 'switchTab', tab: 'debug' });
  await tick();
  created[0]!.injectMessage({ type: 'ready' });
  await tick();
  assert.equal(state.activations, 2, 're-activated on return');
  assert.equal(state.disposes, 1, 'the earlier dispose was the only one');

  // Close the panel → the live controller is disposed.
  created[0]!.userClose();
  assert.equal(state.disposes, 2, 'panel close disposes the live controller (no ticker survives)');
});

test('S006: refresh stops then re-arms the ticker on the fresh document (re-seeds the log; LOW-1 fix)', async () => {
  const { controller, state } = fakeController();
  const { host, created } = makeHost({ tabControllers: { debug: controller } });
  await openDebugReady(created, host);
  assert.equal(state.activations, 1);

  created[0]!.injectMessage({ type: 'refresh' }); // fresh document — old listener gone
  await tick();
  assert.equal(state.disposes, 1, 'refresh stops the outgoing ticker (its document is replaced)');
  created[0]!.injectMessage({ type: 'ready' }); // the re-rendered doc loads
  await tick();
  assert.equal(state.activations, 2, 'the controller re-arms on the fresh document (re-seeds the log)');
});

test('S006: a controller ctx.postMessage lands on the panel, and the shell wires the appendLog listener via textContent', async () => {
  const controller: TabController = {
    onActivate(ctx) {
      ctx.postMessage({ type: 'appendLog', lines: ['line-x', 'line-y'] });
      return () => {};
    },
  };
  const { host, created } = makeHost({ tabControllers: { debug: controller } });
  await openDebugReady(created, host);
  assert.deepEqual(
    created[0]!.posted.at(-1),
    { type: 'appendLog', lines: ['line-x', 'line-y'] },
    'the controller ctx.postMessage reached the live panel',
  );
  // The rendered shell's bootstrap appends appendLog lines via a text node (XSS-safe)
  // and posts the ready handshake after registering its listener.
  const html = created[0]!.html;
  assert.match(html, /'appendLog'/, 'the bootstrap listens for appendLog frames');
  assert.match(html, /createTextNode/, 'appended lines go in via a text node (no innerHTML)');
  assert.match(html, /getElementById\('insrc-log'\)/, 'the appender targets #insrc-log');
  assert.match(html, /postMessage\(\{ type: 'ready' \}\)/, 'the bootstrap posts the ready handshake');
});

test("S006: a {type:'action',action} message is forwarded to onDetailAction; a malformed action is a silent no-op", async () => {
  const actions: string[] = [];
  const { host, created, warns } = makeHost({ onDetailAction: (a) => actions.push(a) });
  host.openDetailedStatus();
  await tick();

  created[0]!.injectMessage({ type: 'action', action: 'cleanupOrphans' });
  assert.deepEqual(actions, ['cleanupOrphans'], 'a string action is forwarded to onDetailAction');

  created[0]!.injectMessage({ type: 'action' }); // missing action
  created[0]!.injectMessage({ type: 'action', action: 123 }); // non-string
  assert.deepEqual(actions, ['cleanupOrphans'], 'a malformed action message is a no-op');
  assert.equal(warns.length, 0, 'a malformed action is silent, not an error');
});

test('S006: a host built with no tabControllers/onDetailAction behaves exactly as the S005 shell (no throw, no ticker)', async () => {
  const { host, created } = makeHost(); // no S006 deps
  host.openDetailedStatus('debug');
  await tick();
  assert.doesNotThrow(() => created[0]!.injectMessage({ type: 'ready' }), 'a ready with no controller is a no-op');
  assert.doesNotThrow(() => created[0]!.injectMessage({ type: 'action', action: 'cleanupOrphans' }), 'action with no sink is a no-op');
  assert.match(created[0]!.html, /coming soon/, 'debug is still the placeholder with no renderer');
});

test('S006: never-throw — an onActivate throw, a dispose throw, and an onDetailAction throw are all caught + logged', async () => {
  // onActivate throws.
  const badActivate: TabController = {
    onActivate() {
      throw new Error('activate boom');
    },
  };
  const a = makeHost({ tabControllers: { debug: badActivate }, onDetailAction: () => { throw new Error('sink boom'); } });
  assert.doesNotThrow(() => a.host.openDetailedStatus('debug'));
  await tick();
  assert.doesNotThrow(() => a.created[0]!.injectMessage({ type: 'ready' }), 'an onActivate throw never surfaces from ready');
  await tick();
  assert.ok(a.warns.some((w) => /activate the debug tab controller/.test(w)), 'the onActivate throw was caught + logged');
  a.created[0]!.injectMessage({ type: 'action', action: 'x' });
  assert.ok(a.warns.some((w) => /detail action handler failed/.test(w)), 'the onDetailAction throw was caught + logged');

  // dispose throws.
  const badDispose: TabController = {
    onActivate() {
      return () => {
        throw new Error('dispose boom');
      };
    },
  };
  const b = makeHost({ tabControllers: { debug: badDispose } });
  await openDebugReady(b.created, b.host);
  assert.doesNotThrow(() => b.created[0]!.injectMessage({ type: 'switchTab', tab: 'daemon' }), 'a throwing dispose never surfaces');
  await tick();
  assert.ok(b.warns.some((w) => /dispose the active tab controller/.test(w)), 'the dispose throw was caught + logged');
});

test('source-scan: webview-host.ts imports no vscode module (extension.ts stays the sole vscode importer)', () => {
  const src = readFileSync(join(HERE, '..', 'webview-host.ts'), 'utf8');
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'the host core must not import vscode');
});
