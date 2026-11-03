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
  const paramsSeen: { method: string; params: unknown }[] = [];
  const deps: DaemonDataGatewayDeps = {
    rpc: async <T>(method: string, params?: unknown) => {
      calls.push(method);
      paramsSeen.push({ method, params });
      return (opts.rpc ? await opts.rpc(method, params) : undefined) as T;
    },
    artifactsRoot: opts.artifactsRoot ?? (() => undefined),
    processScan: opts.processScan ?? (async () => []),
    logger: { warn: () => {} },
  };
  return { gateway: createDaemonDataGateway(deps), calls, paramsSeen };
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

test('status() shows the store failure cause when the payload carries storeFailure, and accepts a status without it', async () => {
  const cause = "Another process opened and closed the graph store after the daemon had lost its file lock. Restart the daemon.";
  const base = { uptime: 12, repos: [], queueDepth: 0, embeddingsPending: 0, installedCommit: '' };
  const failed = makeGateway({
    rpc: async () => ({ ...base, storeFailure: { kind: 'locks-lost', at: '2026-10-11T10:00:00.000Z', operation: 'request search', cause } }),
  });
  const view = await failed.gateway.status();
  assert.equal(view.state, 'store failed', 'not reported as plainly running');
  assert.ok((view.detail ?? '').includes(cause), 'the cause line is shown');
  assert.match(view.detail ?? '', /2026-10-11T10:00:00\.000Z/);
  assert.match(view.detail ?? '', /uptime 12s/, 'the usual fields are still there');

  const healthy = await makeGateway({ rpc: async () => base }).gateway.status();
  assert.equal(healthy.state, 'running');
  assert.doesNotMatch(healthy.detail ?? '', /store|FAILED|Another process/i);
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

  assert.deepEqual(await gateway.registeredRepos(), [{ path: '/a', name: 'a', status: 'ready' }]);
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

test("the VS Code plugin's workflow chain lists no row for a TESTS record and the same rows as without it (mutation: list every json)", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-artifacts-'));
  try {
    writeFileSync(join(dir, 'LLD-abc-s1.json'), JSON.stringify({ meta: { epicSlug: 'my-epic', approvedAt: '2026-01-01' } }));
    writeFileSync(join(dir, 'BUILD-abc-s1.json'), JSON.stringify({ meta: { epicSlug: 'my-epic' } }));
    const { gateway } = makeGateway({ artifactsRoot: () => dir });
    const before = await gateway.workflowChain();
    assert.deepEqual(before.rows.map((r) => `${r.stage}:${r.status}`).sort(), ['build:pending', 'lld:approved']);

    // A Story's test record: no epicSlug, never approved. Without the skip it is
    // a row named by its file name that reads 'pending' for ever.
    writeFileSync(join(dir, 'TESTS-abc-s1.json'), JSON.stringify({ meta: { workflow: 'tests', epicHash: 'abc', storyId: 's1' }, body: { tasks: [] } }));
    const after = await gateway.workflowChain();
    assert.deepEqual(after, before);
    assert.ok(!after.rows.some((r) => r.stage === 'tests' || r.slug.startsWith('TESTS-')));

    // It is skipped by name, before it is read: an unreadable one does not fail the chain.
    writeFileSync(join(dir, 'TESTS-abc-s2.json'), '{ not json');
    assert.deepEqual(await gateway.workflowChain(), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test('registeredRepos() carries each repository\'s status and completeness from repo.list: complete, incomplete with its reasons, and none for a reply without the field (Epic c2ba6fa6 s1)', async () => {
  const counts = { pending: { 'awaiting-target': 2, ambiguous: 0, 'no-candidate': 0, 'external-endpoint': 0 }, unwritable: 0, unembedded: 0, uncommittedFiles: 0 };
  const complete = { complete: true, reasons: [], counts: { ...counts, pending: { ...counts.pending, 'awaiting-target': 0 } }, uncommittedFiles: [], generation: 3 };
  const incomplete = { complete: false, reasons: ['2 relationships point at files an ignore rule excludes'], counts, uncommittedFiles: [], generation: 5 };
  const { gateway } = makeGateway({ rpc: async () => [
    { path: '/a', name: 'a', addedAt: '', status: 'ready', completeness: complete },
    { path: '/b', name: 'b', addedAt: '', status: 'indexing', completeness: incomplete },
    { path: '/c', name: 'c', addedAt: '', status: 'ready' },
  ] });
  assert.deepEqual(await gateway.registeredRepos(), [
    { path: '/a', name: 'a', status: 'ready', completeness: complete },
    { path: '/b', name: 'b', status: 'indexing', completeness: incomplete },
    { path: '/c', name: 'c', status: 'ready' },
  ]);
});

test('mcpRegistration(repoPath) forwards the repo path to mcp.status so the daemon also probes the project-layer .vibe/config.toml; without a path it sends {}', async () => {
  const { gateway, paramsSeen } = makeGateway({
    rpc: async (method) => (method === 'mcp.status' ? { clients: [{ client: 'vibe', available: true, registered: true }] } : undefined),
  });
  const withPath = await gateway.mcpRegistration('/repo/a');
  assert.deepEqual(withPath, [{ client: 'vibe', available: true, registered: true }]);
  assert.deepEqual(paramsSeen.at(-1), { method: 'mcp.status', params: { path: '/repo/a' } }, 'the repo path rides along as mcp.status params.path');
  await gateway.mcpRegistration();
  assert.deepEqual(paramsSeen.at(-1), { method: 'mcp.status', params: {} }, 'no path → empty params (user-global probe only)');
  await gateway.mcpRegistration('');
  assert.deepEqual(paramsSeen.at(-1), { method: 'mcp.status', params: {} }, 'empty path is treated as absent');
});
