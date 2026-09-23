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

test('source-scan: webview-host.ts imports no vscode module (extension.ts stays the sole vscode importer)', () => {
  const src = readFileSync(join(HERE, '..', 'webview-host.ts'), 'utf8');
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'the host core must not import vscode');
});
