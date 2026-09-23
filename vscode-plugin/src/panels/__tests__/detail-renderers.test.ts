/**
 * Story E20260923401ae5fb:S005 / t2+t5 — the Daemon + Workflows tab renderers.
 * Pure fns over a fake DaemonDataGateway — no editor host, no daemon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { renderDaemonTab, renderWorkflowsTab } from '../detail-renderers.js';
import { GatewayReadError, type DaemonDataGateway } from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A fake gateway; only the two methods the renderers read matter. */
function fakeGateway(overrides: Partial<DaemonDataGateway> = {}): DaemonDataGateway {
  return {
    status: async () => ({ state: 'running', detail: 'uptime 12s · 1 repos · queue 0' }),
    workflowChain: async () => ({ rows: [] }),
    mcpClients: async () => [],
    registeredRepos: async () => [],
    scanOrphans: async () => [],
    ...overrides,
  };
}

test('renderDaemonTab renders state + detail (ac1); a missing detail renders just the state', async () => {
  const withDetail = await renderDaemonTab(fakeGateway());
  assert.match(withDetail, /class="state">running/, 'the state is shown');
  assert.match(withDetail, /uptime 12s/, 'the detail line is shown');

  const noDetail = await renderDaemonTab(fakeGateway({ status: async () => ({ state: 'running' }) }));
  assert.match(noDetail, /class="state">running/);
  assert.doesNotMatch(noDetail, /class="detail"/, 'no empty detail line when detail is undefined');
});

test('renderWorkflowsTab groups rows by slug with stage+status lines (ac2)', async () => {
  const gateway = fakeGateway({
    workflowChain: async () => ({
      rows: [
        { slug: 'epic-a', stage: 'lld', status: 'approved' },
        { slug: 'epic-a', stage: 'plan', status: 'pending' },
        { slug: 'epic-b', stage: 'def', status: 'approved' },
      ],
    }),
  });
  const html = await renderWorkflowsTab(gateway);
  // Two slug sections, in first-seen order.
  const aIdx = html.indexOf('epic-a');
  const bIdx = html.indexOf('epic-b');
  assert.ok(aIdx >= 0 && bIdx > aIdx, 'both slugs render, epic-a before epic-b');
  assert.match(html, /lld<\/span> — <span class="status">approved/, 'a stage+status line renders');
  assert.match(html, /plan<\/span> — <span class="status">pending/);
});

test('renderWorkflowsTab shows an explicit empty-state when rows=[] (not blank, not error)', async () => {
  const html = await renderWorkflowsTab(fakeGateway({ workflowChain: async () => ({ rows: [] }) }));
  assert.match(html, /No workflow artifacts yet/, 'an explicit empty-state');
  assert.doesNotMatch(html, /class="error"/);
});

test('both renderers HTML-escape every daemon-derived value (no <script> break-out)', async () => {
  const daemon = await renderDaemonTab(
    fakeGateway({ status: async () => ({ state: '<script>x</script>', detail: 'a & b' }) }),
  );
  assert.doesNotMatch(daemon, /<script>x<\/script>/, 'the state is escaped');
  assert.match(daemon, /&lt;script&gt;/, 'the injected tag is entity-escaped');
  assert.match(daemon, /a &amp; b/, 'the ampersand is escaped');

  const wf = await renderWorkflowsTab(
    fakeGateway({ workflowChain: async () => ({ rows: [{ slug: '<b>s</b>', stage: '"x"', status: "'y'" }] }) }),
  );
  assert.doesNotMatch(wf, /<b>s<\/b>/, 'the slug is escaped');
  assert.match(wf, /&lt;b&gt;s&lt;\/b&gt;/);
  assert.match(wf, /&quot;x&quot;/);
  assert.match(wf, /&#39;y&#39;/);
});

test('both renderers include a Refresh control that posts {type:\'refresh\'}', async () => {
  const daemon = await renderDaemonTab(fakeGateway());
  const wf = await renderWorkflowsTab(fakeGateway({ workflowChain: async () => ({ rows: [] }) }));
  for (const html of [daemon, wf]) {
    assert.match(html, /id="insrc-refresh"/, 'the Refresh control is present (the host bootstrap wires it to post refresh)');
  }
});

test('a renderer lets a gateway rejection propagate (does not swallow it) so the host can degrade', async () => {
  const boom = new GatewayReadError('daemon.status failed');
  await assert.rejects(
    () => renderDaemonTab(fakeGateway({ status: async () => { throw boom; } })),
    GatewayReadError,
  );
  await assert.rejects(
    () => renderWorkflowsTab(fakeGateway({ workflowChain: async () => { throw boom; } })),
    GatewayReadError,
  );
});

test('source-scan: detail-renderers.ts imports no vscode and uses no cloud/HTTP (only the injected gateway) — ac4/k2', () => {
  const src = readFileSync(join(HERE, '..', 'detail-renderers.ts'), 'utf8');
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'the renderers must not import vscode');
  assert.doesNotMatch(src, /\b(undici|fetch\(|node:http\b|node:https\b|axios)\b/, 'no cloud/HTTP client in the renderers');
});

test('source-scan: the webview bootstrap script only posts the sanctioned message shapes (switchTab/refresh/action)', () => {
  const src = readFileSync(join(HERE, '..', 'webview-host.ts'), 'utf8');
  const bootstrap = /const BOOTSTRAP = `([\s\S]*?)`;/.exec(src);
  assert.ok(bootstrap, 'the BOOTSTRAP script constant is present');
  const posts = [...bootstrap![1]!.matchAll(/postMessage\(\{\s*type:\s*'([^']+)'/g)].map((m) => m[1]);
  // S006 added {type:'action'} (the Debug Clean-up button) + {type:'ready'} (the
  // load handshake that gates the log ticker); still a fixed, closed set.
  assert.deepEqual(posts.sort(), ['action', 'ready', 'refresh', 'switchTab'], 'the bootstrap posts only switchTab + refresh + action + ready');
});
