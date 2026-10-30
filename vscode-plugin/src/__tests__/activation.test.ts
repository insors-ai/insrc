/**
 * Story E20260921ad0d45c9:S001 / t6 — activation shell tests.
 * Uses fakes for the ipc client + status surface; no VS Code host.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { activateExtension, runReachabilityProbe, startDaemonIfStopped } from '../activation.js';
import type { DaemonLifecycleController, LifecycleResult, LifecycleRunOptions } from '../daemon/controller.js';
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
    update: async () => ({ launched: false }),
    updateOutcome: async () => null,
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

// ---- Story E202610160e1265ed:S001: start an installed daemon the probe finds stopped ----

/** A controller that records its calls; `run` answers the next queued result. */
function fakeController(o: { installed?: boolean; results?: Array<LifecycleResult | Error> } = {}) {
  const calls: Array<{ action: string; options: LifecycleRunOptions | undefined }> = [];
  let installedAsked = 0;
  const results = [...(o.results ?? [{ ok: true, state: 'running' } as LifecycleResult])];
  const controller: Pick<DaemonLifecycleController, 'isInstalled' | 'run'> = {
    isInstalled: async () => {
      installedAsked += 1;
      return o.installed ?? true;
    },
    run: async (action, options) => {
      calls.push({ action, options });
      const next = results.shift() ?? { ok: true, state: 'running' };
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { controller, calls, installedAsked: () => installedAsked };
}
/** A client whose reachability answers one value per call, the last one repeating. */
const sequenced = (...answers: DaemonReachability[]): IpcClient => {
  let n = 0;
  return clientReturning(async () => answers[Math.min(n++, answers.length - 1)]!);
};
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

test('a stopped, installed daemon is started once after the probe, as a plain start, and the status shows running', async () => {
  const status = new FakeStatus();
  const { controller, calls } = fakeController();
  // The probe and the re-check both find it stopped; the start brings it up.
  activateExtension({ client: sequenced('stopped', 'stopped'), status, controller });
  await settle();
  assert.deepEqual(calls, [{ action: 'start', options: { plain: true } }], 'one start, as a plain start');
  assert.deepEqual(status.current(), { state: 'running', detail: undefined });
});

test('no start is attempted for a running or errored daemon, for a daemon that is not installed, or when no controller is given', async () => {
  for (const probed of ['running', 'errored'] as const) {
    const status = new FakeStatus();
    const { controller, calls } = fakeController();
    activateExtension({ client: sequenced(probed), status, controller });
    await settle();
    assert.deepEqual(calls, [], `${probed}: nothing started`);
    assert.equal(status.current().state, probed);
  }
  const status = new FakeStatus();
  const missing = fakeController({ installed: false });
  activateExtension({ client: sequenced('stopped'), status, controller: missing.controller });
  await settle();
  assert.deepEqual(missing.calls, [], 'not installed: nothing started');
  assert.equal(status.current().state, 'stopped', 'and the status stays stopped');
  // No controller: the probe-only behaviour, with nothing to call.
  const bare = new FakeStatus();
  activateExtension({ client: sequenced('stopped'), status: bare });
  await settle();
  assert.equal(bare.current().state, 'stopped');
  // Directly: unknown is not a trigger either.
  const direct = fakeController();
  await startDaemonIfStopped({ client: sequenced('stopped'), status: new FakeStatus(), controller: direct.controller }, 'unknown');
  assert.deepEqual(direct.calls, []);
  assert.equal(direct.installedAsked(), 0, 'it does not even ask');
});

test('a start is skipped when the fresh reachability check just before it finds the daemon running', async () => {
  const status = new FakeStatus();
  const { controller, calls } = fakeController();
  // The probe finds it stopped; another window brings it up before the re-check.
  activateExtension({ client: sequenced('stopped', 'running'), status, controller });
  await settle();
  assert.deepEqual(calls, [], 'no start');
  assert.equal(status.current().state, 'running');
});

test('a failed or throwing start leaves an errored status with the reason, is not retried, and never rejects into activation', async () => {
  const failed = new FakeStatus();
  const a = fakeController({ results: [{ ok: false, state: 'errored', message: 'the daemon git / npm / build / start step failed' }] });
  activateExtension({ client: sequenced('stopped', 'stopped'), status: failed, controller: a.controller });
  await settle();
  assert.deepEqual(failed.current(), { state: 'errored', detail: 'the daemon git / npm / build / start step failed' });
  assert.equal(a.calls.length, 1, 'not retried');

  const thrown = new FakeStatus();
  const b = fakeController({ results: [new Error('spawn exploded')] });
  await assert.doesNotReject(startDaemonIfStopped({ client: sequenced('stopped', 'stopped'), status: thrown, controller: b.controller }, 'stopped'));
  assert.equal(thrown.current().state, 'errored');
  assert.equal(b.calls.length, 1);

  // A controller whose isInstalled throws is contained the same way.
  const c = new FakeStatus();
  const broken: Pick<DaemonLifecycleController, 'isInstalled' | 'run'> = { isInstalled: async () => { throw new Error('fs'); }, run: async () => ({ ok: true, state: 'running' }) };
  await assert.doesNotReject(startDaemonIfStopped({ client: sequenced('stopped'), status: c, controller: broken }, 'stopped'));
  assert.equal(c.current().state, 'errored');
});

test("a start that reports success while the daemon is still unreachable is shown as errored with the reason 'the daemon did not answer after start'", async () => {
  for (const state of ['stopped', 'errored'] as const) {
    const status = new FakeStatus();
    const { controller, calls } = fakeController({ results: [{ ok: true, state }] });
    activateExtension({ client: sequenced('stopped', 'stopped'), status, controller });
    await settle();
    assert.deepEqual(status.current(), { state: 'errored', detail: 'the daemon did not answer after start' }, state);
    assert.equal(calls.length, 1, 'and it is not started again');
  }
});

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

test('the extension entry passes the daemon lifecycle controller into the activation', () => {
  const src = readFileSync(join(PKG, 'extension.ts'), 'utf8');
  assert.match(src, /activateExtension\(\{ client, status, controller, onSettled: /);
  // It is the very controller the daemon commands use.
  assert.match(src, /const controller = createDaemonLifecycleController\(/);
  assert.match(src, /registerDaemonCommands\(\{ commands, consent, status, controller \}\)/);
});

test('activation calls onSettled once after the probe and any start have finished, also when the probe or the start fails or throws', async () => {
  // After a successful automatic start: once, and only after the start has run.
  const order: string[] = [];
  const status = new FakeStatus();
  const started = fakeController();
  const spyRun = started.controller.run;
  started.controller.run = async (a, o) => {
    order.push('start');
    return spyRun(a, o);
  };
  activateExtension({ client: sequenced('stopped', 'stopped'), status, controller: started.controller, onSettled: () => order.push('settled') });
  assert.deepEqual(order, [], 'not called synchronously');
  await settle();
  assert.deepEqual(order, ['start', 'settled']);

  // A running daemon, an errored probe and a daemon that is not installed: still settled, once, with no start.
  for (const [client, ctl] of [
    [sequenced('running'), fakeController()],
    [sequenced('errored'), fakeController()],
    [sequenced('stopped'), fakeController({ installed: false })],
  ] as const) {
    let n = 0;
    activateExtension({ client, status: new FakeStatus(), controller: ctl.controller, onSettled: () => void (n += 1) });
    await settle();
    assert.equal(n, 1);
    assert.deepEqual(ctl.calls, []);
  }

  // A start that throws, a probe that rejects and a hung probe: settled once each.
  let thrown = 0;
  activateExtension({ client: sequenced('stopped', 'stopped'), status: new FakeStatus(), controller: fakeController({ results: [new Error('boom')] }).controller, onSettled: () => void (thrown += 1) });
  let rejected = 0;
  activateExtension({ client: clientReturning(async () => { throw new Error('probe'); }), status: new FakeStatus(), onSettled: () => void (rejected += 1) });
  let hung = 0;
  activateExtension({ client: clientReturning(() => new Promise<DaemonReachability>(() => {})), status: new FakeStatus(), probeTimeoutMs: 10, onSettled: () => void (hung += 1) });
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual([thrown, rejected, hung], [1, 1, 1]);

  // A throwing onSettled is contained: nothing is thrown into activation and the status is kept.
  const kept = new FakeStatus();
  assert.doesNotThrow(() => activateExtension({ client: sequenced('running'), status: kept, onSettled: () => { throw new Error('callback'); } }));
  await settle();
  assert.equal(kept.current().state, 'running');
});

test('the extension entry runs the settings pull, the update check and onboarding only after activation has settled', () => {
  const src = readFileSync(join(PKG, 'extension.ts'), 'utf8');
  // The signal is made before activation is started, and activation resolves it.
  const made = src.indexOf('const activationSettled = new Promise<void>');
  const started = src.indexOf('activateExtension({ client, status, controller, onSettled: () => resolveActivationSettled() })');
  assert.ok(made > 0 && started > made, 'the settled signal exists before activation starts');
  // Each of the three waits for it, and none runs bare.
  assert.match(src, /void activationSettled\.then\(\(\) => runDaemonFreshnessCheck\(\{/);
  assert.doesNotMatch(src, /void runDaemonFreshnessCheck\(/);
  assert.match(src, /void activationSettled\.then\(\(\) => configSync\.pullFromDaemon\(\)\);/);
  assert.doesNotMatch(src, /void configSync\.pullFromDaemon\(\)/);
  assert.match(src, /void \(async \(\) => \{\s*await activationSettled;\s*try \{\s*await runOnboarding\(/);
});
