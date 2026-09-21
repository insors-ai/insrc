/**
 * Story E20260921ad0d45c9:S001 / t6 — activation shell tests.
 * Uses fakes for the ipc client + status surface; no VS Code host.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { activateExtension, runReachabilityProbe } from '../activation.js';
import type { StatusSnapshot, StatusSurface } from '../surfaces/status-surface.js';
import type { IpcClient, DaemonReachability, DaemonStatus } from '../../../src/shared/ipc-client.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');

class FakeStatus implements StatusSurface {
  snapshot: StatusSnapshot = { state: 'unknown' };
  set(next: StatusSnapshot): void {
    this.snapshot = next;
  }
  current(): StatusSnapshot {
    return this.snapshot;
  }
}

function clientReturning(reachability: DaemonReachability | (() => Promise<DaemonReachability>)): IpcClient {
  return {
    rpc: async () => undefined as never,
    status: async () => ({ uptime: 0, repos: [], queueDepth: 0, embeddingsPending: 0 } as DaemonStatus),
    reachability: typeof reachability === 'function' ? reachability : async () => reachability,
  };
}

test('runReachabilityProbe pushes the derived running/stopped/errored state into the status surface', async () => {
  for (const state of ['running', 'stopped', 'errored'] as const) {
    const status = new FakeStatus();
    await runReachabilityProbe({ client: clientReturning(state), status });
    assert.equal(status.current().state, state);
  }
});

test('runReachabilityProbe degrades a hung probe to errored within the bounded deadline', async () => {
  const status = new FakeStatus();
  // A reachability() that never settles — the bounded timeout must win.
  const hung = clientReturning(() => new Promise<DaemonReachability>(() => {}));
  await runReachabilityProbe({ client: hung, status, probeTimeoutMs: 20 });
  assert.equal(status.current().state, 'errored');
});

test('runReachabilityProbe never throws even if reachability() rejects', async () => {
  const status = new FakeStatus();
  const throwing = clientReturning(async () => {
    throw new Error('unexpected');
  });
  await runReachabilityProbe({ client: throwing, status, probeTimeoutMs: 50 });
  assert.equal(status.current().state, 'errored');
});

test('activateExtension returns synchronously without throwing and leaves status at unknown until the probe resolves', () => {
  const status = new FakeStatus();
  let resolveProbe: (r: DaemonReachability) => void = () => {};
  const client = clientReturning(() => new Promise<DaemonReachability>((r) => { resolveProbe = r; }));

  // Must not throw and must not block on the probe.
  assert.doesNotThrow(() => activateExtension({ client, status }));
  assert.equal(status.current().state, 'unknown', 'activation does not await the probe');

  // Once the probe resolves, the status updates (fire-and-forget completion).
  resolveProbe('running');
});

// ---- t2: scaffold + thin-boundary source scan ------------------------------

test('the extension package is scaffolded (package.json + tsconfig + activate/deactivate entry)', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.main, './out/extension.js');
  assert.ok(pkg.engines?.vscode, 'declares an engines.vscode range');
  assert.deepEqual(pkg.activationEvents, ['onStartupFinished']);
  // No Marketplace listing metadata yet — that is Story S006.
  assert.equal(pkg.publisher, undefined, 'no publisher/listing metadata in s1 (deferred to s6)');

  const entry = readFileSync(join(PKG, 'extension.ts'), 'utf8');
  assert.match(entry, /export function activate\(/);
  assert.match(entry, /export function deactivate\(/);
});

test('only extension.ts imports vscode, and it reaches the daemon only via the shared ipc-client (k2/k5)', () => {
  const entry = readFileSync(join(PKG, 'extension.ts'), 'utf8');
  assert.match(entry, /from '\.\.\/\.\.\/src\/shared\/ipc-client\.js'/, 'imports the shared ipc-client (one client path, k5)');

  // No reasoning/cloud path anywhere in the extension sources (k2/lc2).
  const files = [
    'extension.ts',
    'activation.ts',
    'surfaces/status-surface.ts',
    'surfaces/command-registry.ts',
    'surfaces/consent-gate.ts',
    'surfaces/types.ts',
  ];
  for (const f of files) {
    const src = readFileSync(join(PKG, f), 'utf8');
    assert.doesNotMatch(src, /https?:\/\//, `${f} opens no cloud/HTTP path`);
    assert.doesNotMatch(src, /\bfetch\(|undici|axios\b/, `${f} makes no HTTP call`);
    // The activation core + surfaces must NOT import vscode (only extension.ts may).
    if (f !== 'extension.ts') {
      assert.doesNotMatch(src, /from 'vscode'/, `${f} must not import vscode (injectable boundary)`);
    }
  }
});
