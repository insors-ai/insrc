/**
 * Story E20260921ad0d45c9:S002 / t1 — DaemonLifecycleController tests.
 * Fake SubprocessRunner + fake IpcClient + fixture DaemonPaths — no real shell/daemon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { createDaemonLifecycleController, type LifecycleAction } from '../controller.js';
import type { SubprocessRunner } from '../subprocess.js';
import type { DaemonPaths } from '../paths.js';
import type { IpcClient, DaemonReachability, DaemonStatus } from '../../../../src/shared/ipc-client.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DAEMON_SRC = join(HERE, '..');

class FakeRunner implements SubprocessRunner {
  public calls: string[][] = [];
  constructor(private readonly code: number) {}
  async run(command: readonly string[]): Promise<{ code: number }> {
    this.calls.push([...command]);
    return { code: this.code };
  }
}

function fakeClient(reachability: DaemonReachability): IpcClient {
  return {
    rpc: async () => undefined as never,
    status: async () => ({ uptime: 0, repos: [], queueDepth: 0, embeddingsPending: 0 } as DaemonStatus),
    reachability: async () => reachability,
  };
}

/** Build a fixture DaemonPaths under a fresh tmp dir; opts control which files exist. */
function fixturePaths(opts: { ctl?: boolean; entry?: boolean; installer?: boolean }): DaemonPaths {
  const root = mkdtempSync(join(tmpdir(), 'insrc-s2-'));
  const ctlScript = join(root, 'scripts', 'daemon-ctl.sh');
  const daemonEntry = join(root, 'out', 'daemon', 'index.js');
  const bundledInstaller = join(root, 'assets', 'insrc-daemon-install.sh');
  if (opts.ctl) { mkdirSync(dirname(ctlScript), { recursive: true }); writeFileSync(ctlScript, '#!/usr/bin/env bash\n'); }
  if (opts.entry) { mkdirSync(dirname(daemonEntry), { recursive: true }); writeFileSync(daemonEntry, '// built\n'); }
  if (opts.installer) { mkdirSync(dirname(bundledInstaller), { recursive: true }); writeFileSync(bundledInstaller, '#!/usr/bin/env bash\n'); }
  return { daemonRoot: root, ctlScript, daemonEntry, bundledInstaller };
}

test('run(action) spawns bash <ctlScript> <action> for each lifecycle action and derives state from reachability on exit 0', async () => {
  for (const action of ['start', 'stop', 'restart', 'update'] as LifecycleAction[]) {
    const runner = new FakeRunner(0);
    // update⇒stopped: reachability is the source of truth even when the exit code is 0.
    const reach: DaemonReachability = action === 'update' ? 'stopped' : 'running';
    const ctl = createDaemonLifecycleController({ runner, paths: fixturePaths({ ctl: true }), client: fakeClient(reach) });
    const result = await ctl.run(action);
    assert.equal(runner.calls.length, 1);
    assert.equal(runner.calls[0]![0], 'bash');
    assert.equal(runner.calls[0]![2], action);
    assert.equal(result.ok, true);
    assert.equal(result.state, reach, `${action} reflects the real reachability`);
  }
});

test('run(action) maps EACH ctl exit code 1/2/3/4 to its documented reason and never throws', async () => {
  const expect: Record<number, RegExp> = {
    1: /usage/,
    2: /not a git checkout/,
    3: /uncommitted or diverged/,
    4: /git \/ npm \/ build \/ start/,
  };
  for (const code of [1, 2, 3, 4]) {
    const ctl = createDaemonLifecycleController({ runner: new FakeRunner(code), paths: fixturePaths({ ctl: true }), client: fakeClient('errored') });
    const result = await ctl.run('start');
    assert.equal(result.ok, false);
    assert.equal(result.state, 'errored');
    assert.match(result.message ?? '', expect[code]!);
  }
});

test('run(action) with a missing ctl script returns errored/not-installed WITHOUT spawning', async () => {
  const runner = new FakeRunner(0);
  const ctl = createDaemonLifecycleController({ runner, paths: fixturePaths({ ctl: false }), client: fakeClient('running') });
  const result = await ctl.run('start');
  assert.equal(result.ok, false);
  assert.equal(result.state, 'errored');
  assert.match(result.message ?? '', /not installed/);
  assert.equal(runner.calls.length, 0, 'nothing is spawned when the ctl script is absent');
});

test('install() spawns bash <bundledInstaller> -y; exit 0 → reachability; codes 1/2 → mapped reason', async () => {
  const ok = new FakeRunner(0);
  const ctlOk = createDaemonLifecycleController({ runner: ok, paths: fixturePaths({ installer: true }), client: fakeClient('running') });
  const okRes = await ctlOk.install();
  assert.deepEqual(ok.calls[0]!.slice(0, 1), ['bash']);
  assert.equal(ok.calls[0]!.at(-1), '-y');
  assert.equal(okRes.ok, true);
  assert.equal(okRes.state, 'running');

  const bad = createDaemonLifecycleController({ runner: new FakeRunner(2), paths: fixturePaths({ installer: true }), client: fakeClient('errored') });
  const badRes = await bad.install();
  assert.equal(badRes.ok, false);
  assert.equal(badRes.state, 'errored');
  assert.match(badRes.message ?? '', /prerequisites missing/);
});

test('install() with a missing bundled installer returns errored/reinstall WITHOUT spawning', async () => {
  const runner = new FakeRunner(0);
  const ctl = createDaemonLifecycleController({ runner, paths: fixturePaths({ installer: false }), client: fakeClient('running') });
  const result = await ctl.install();
  assert.equal(result.ok, false);
  assert.equal(result.state, 'errored');
  assert.match(result.message ?? '', /reinstall the extension/);
  assert.equal(runner.calls.length, 0, 'nothing is spawned when the bundled installer is absent');
});

test('isInstalled() is true iff the compiled daemon entry exists, false for a clone-without-build, never throws', async () => {
  const installed = createDaemonLifecycleController({ runner: new FakeRunner(0), paths: fixturePaths({ entry: true }), client: fakeClient('running') });
  assert.equal(await installed.isInstalled(), true);

  const cloneOnly = createDaemonLifecycleController({ runner: new FakeRunner(0), paths: fixturePaths({ ctl: true, entry: false }), client: fakeClient('stopped') });
  assert.equal(await cloneOnly.isInstalled(), false);
});

test('source-scan: vscode-plugin/src/daemon/ imports only node builtins + the shared ipc-client + the s1 surfaces (k5)', () => {
  const files = ['subprocess.ts', 'paths.ts', 'controller.ts', 'commands.ts'];
  const allowedNode = new Set(['node:child_process', 'node:fs', 'node:os', 'node:path']);
  for (const f of files) {
    const src = readFileSync(join(DAEMON_SRC, f), 'utf8');
    assert.doesNotMatch(src, /https?:\/\//, `${f} opens no cloud/HTTP path`);
    assert.doesNotMatch(src, /\bfetch\(|undici|axios\b/, `${f} makes no HTTP call`);
    for (const line of src.split('\n')) {
      const m = line.match(/from '([^']+)'/);
      if (!m) continue;
      const spec = m[1]!;
      const ok =
        allowedNode.has(spec) ||
        spec.startsWith('./') ||
        spec.startsWith('../surfaces/') ||
        spec === '../../../src/shared/ipc-client.js';
      assert.ok(ok, `${f}: unexpected import ${spec} (k5 thin boundary — no daemon internals/indexer/storage)`);
    }
  }
});
