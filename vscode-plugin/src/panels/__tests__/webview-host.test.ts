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
  type WebviewPanelHostDeps,
} from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A fake webview panel that records the calls the host makes on it. */
class FakePanel implements PanelHandle {
  html = '';
  reveals = 0;
  disposed = false;
  private disposeListener: (() => void) | undefined;
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
  dispose(): void {
    this.disposed = true;
  }
  /** Simulate the user closing the panel (fires the host's dispose handler). */
  userClose(): void {
    this.disposeListener?.();
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

test('source-scan: webview-host.ts imports no vscode module (extension.ts stays the sole vscode importer)', () => {
  const src = readFileSync(join(HERE, '..', 'webview-host.ts'), 'utf8');
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'the host core must not import vscode');
});
