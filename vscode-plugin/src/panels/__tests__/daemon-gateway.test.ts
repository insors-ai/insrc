/**
 * Story E20260922401ae5fb:S004 / t3 — sc9 DaemonDataGateway tests.
 * Each method is driven over a fake sc1 rpc + fake artifacts-root + fake scan —
 * no daemon, no editor. Asserts the View mappings + local-only reach (ac4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createDaemonDataGateway } from '../daemon-gateway.js';
import { GatewayReadError, type DaemonDataGatewayDeps, type OrphanProcess } from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Build a gateway over a scripted rpc; records the method names it was called with. */
function makeGateway(opts: {
  rpc?: (method: string, params?: unknown) => Promise<unknown>;
  artifactsRoot?: () => string | undefined;
  processScan?: () => Promise<readonly OrphanProcess[]>;
}): { gateway: ReturnType<typeof createDaemonDataGateway>; calls: string[] } {
  const calls: string[] = [];
  const deps: DaemonDataGatewayDeps = {
    rpc: async <T>(method: string, params?: unknown) => {
      calls.push(method);
      return (opts.rpc ? await opts.rpc(method, params) : undefined) as T;
    },
    artifactsRoot: opts.artifactsRoot ?? (() => undefined),
    processScan: opts.processScan ?? (async () => []),
    logger: { warn: () => {} },
  };
  return { gateway: createDaemonDataGateway(deps), calls };
}

test('status() maps a DaemonStatus (incl. missing optionals) to a DaemonStatusView { state, detail }, over daemon.status only (ac4)', async () => {
  const { gateway, calls } = makeGateway({
    rpc: async () => ({ uptime: 12, repos: [{ name: 'r' }], queueDepth: 0, embeddingsPending: 0 }),
  });
  const view = await gateway.status();
  assert.equal(view.state, 'running');
  assert.match(view.detail ?? '', /uptime 12s/);
  assert.match(view.detail ?? '', /1 repos/);
  assert.doesNotMatch(view.detail ?? '', /model/, 'absent modelPullStatus does not appear');
  assert.deepEqual(calls, ['daemon.status'], 'reaches only daemon.status');
});

test('status() rejects GatewayReadError when daemon.status fails', async () => {
  const { gateway } = makeGateway({
    rpc: async () => {
      throw new Error('daemon is not running');
    },
  });
  await assert.rejects(() => gateway.status(), GatewayReadError);
});

test('registeredRepos() maps repo.list -> RepoRef[]; mcpClients() maps daemon.debug-status clients (attached ⇒ wired)', async () => {
  const byMethod: Record<string, unknown> = {
    'repo.list': [{ path: '/a', name: 'a', addedAt: '', status: 'ready' }],
    'daemon.debug-status': { clients: [{ id: 1, label: 'claude', connectedAt: 0 }] },
  };
  const { gateway, calls } = makeGateway({ rpc: async (m) => byMethod[m] });

  assert.deepEqual(await gateway.registeredRepos(), [{ path: '/a', name: 'a' }]);
  assert.deepEqual(await gateway.mcpClients(), [{ host: 'claude', wired: true }]);
  assert.deepEqual(calls, ['repo.list', 'daemon.debug-status'], 'reaches only the two read IPCs (ac4)');
});

test('mcpClients() tolerates a debug-status payload with no clients (empty view, not an error)', async () => {
  const { gateway } = makeGateway({ rpc: async () => ({}) });
  assert.deepEqual(await gateway.mcpClients(), []);
});

test('workflowChain() returns empty rows when artifactsRoot is undefined (valid empty state)', async () => {
  const { gateway, calls } = makeGateway({ artifactsRoot: () => undefined });
  assert.deepEqual(await gateway.workflowChain(), { rows: [] });
  assert.deepEqual(calls, [], 'no IPC — a pure local read');
});

test('workflowChain() reads the .insrc/artifacts tree into rows, and a malformed artifact rejects GatewayReadError', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-artifacts-'));
  try {
    writeFileSync(join(dir, 'LLD-abc-s1.json'), JSON.stringify({ meta: { epicSlug: 'my-epic', approvedAt: '2026-01-01' } }));
    writeFileSync(join(dir, 'PLAN-abc-s1.json'), JSON.stringify({ meta: { epicSlug: 'my-epic' } }));
    writeFileSync(join(dir, 'notes.txt'), 'ignored'); // non-json is skipped
    const ok = makeGateway({ artifactsRoot: () => dir });
    const view = await ok.gateway.workflowChain();
    const bySlugStage = view.rows.map((r) => `${r.stage}:${r.status}`).sort();
    assert.deepEqual(bySlugStage, ['lld:approved', 'plan:pending']);

    // A malformed json in the tree is a read failure, not a silent skip.
    writeFileSync(join(dir, 'DEF-abc.json'), '{ not json');
    const bad = makeGateway({ artifactsRoot: () => dir });
    await assert.rejects(() => bad.gateway.workflowChain(), GatewayReadError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanOrphans() maps the injected scan and rejects GatewayReadError on failure (and never kills)', async () => {
  const ok = makeGateway({ processScan: async () => [{ pid: 42, command: 'node out/daemon/index.js' }] });
  assert.deepEqual(await ok.gateway.scanOrphans(), [{ pid: 42, command: 'node out/daemon/index.js' }]);

  const bad = makeGateway({
    processScan: async () => {
      throw new Error('ps failed');
    },
  });
  await assert.rejects(() => bad.gateway.scanOrphans(), GatewayReadError);
});

test('source-scan: daemon-gateway.ts imports no vscode and uses no cloud/HTTP client (only sc1 + fs/process — ac4/k2)', () => {
  const src = readFileSync(join(HERE, '..', 'daemon-gateway.ts'), 'utf8');
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'the gateway core must not import vscode');
  assert.doesNotMatch(src, /\b(undici|fetch\(|node:http\b|node:https\b|axios)\b/, 'no cloud/HTTP client in the gateway');
});
