/**
 * Story E20260921ad0d45c9:S001 / t6 — activation shell tests.
 * Uses fakes for the ipc client + status surface; no VS Code host.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { activateExtension, runReachabilityProbe } from '../activation.js';
import type { StatusSnapshot, StatusSurface } from '../surfaces/status-surface.js';
import type { IpcClient, DaemonReachability, DaemonStatus } from '../../../src/shared/ipc-client.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// VS Code owns the real event loop; this standalone fixture owns a ref while
// exercising production's intentionally unrefed probe deadlines.
let keepAlive:ReturnType<typeof setInterval>;
before(()=>{keepAlive=setInterval(()=>{},1000);});
after(()=>clearInterval(keepAlive));
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
  // Marketplace listing metadata is delivered by Story S006 (publish scaffolding).
  assert.equal(typeof pkg.publisher, 'string', 'S006 added the Marketplace publisher');

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
/** A client whose reachability answers one value per call, the last one repeating. */
const sequenced = (...answers: DaemonReachability[]): IpcClient => {
  let n = 0;
  return clientReturning(async () => answers[Math.min(n++, answers.length - 1)]!);
};
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

test('runReachabilityProbe answers the state it pushed into the status surface', async () => {
  for (const state of ['running', 'stopped', 'errored'] as const) {
    const status = new FakeStatus();
    assert.equal(await runReachabilityProbe({ client: clientReturning(state), status }), state);
    assert.equal(status.current().state, state);
  }
  // A hung or throwing probe answers errored, as it shows.
  const hung = new FakeStatus();
  assert.equal(await runReachabilityProbe({ client: clientReturning(() => new Promise<DaemonReachability>(() => {})), status: hung, probeTimeoutMs: 10 }), 'errored');
  assert.equal(hung.current().state, 'errored');
});

test('activation settles once after reachable, stopped, rejected and timed out probes', async () => {
 for (const answer of ['running','stopped','errored'] as const) {
  let calls=0;const status=new FakeStatus();activateExtension({client:clientReturning(answer),status,onSettled:()=>{calls++;}});
  await settle();assert.equal(calls,1);assert.equal(status.current().state,answer);
 }
 let calls=0;activateExtension({client:clientReturning(async()=>{throw new Error('probe');}),status:new FakeStatus(),onSettled:()=>{calls++;}});await settle();assert.equal(calls,1);
 let timedOut=0;activateExtension({client:clientReturning(()=>new Promise(()=>{})),status:new FakeStatus(),probeTimeoutMs:10,onSettled:()=>{timedOut++;}});await new Promise(r=>setTimeout(r,40));assert.equal(timedOut,1);
 const status=new FakeStatus();activateExtension({client:clientReturning('running'),status,onSettled:()=>{throw new Error('callback');}});await settle();assert.equal(status.current().state,'running');
});
test('settings pull and onboarding wait for activation to settle', () => {
 const src=readFileSync(join(PKG,'extension.ts'),'utf8');
 assert.match(src,/activateExtension\(\{ client, status, onSettled:/);
 assert.match(src,/void activationSettled\.then\(async \(\) =>/);
 assert.match(src,/await activationSettled;[\s\S]*await runOnboarding/);
});
