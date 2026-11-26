import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { completeNode22Fixture } from './_runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

// A real lockfile install/build and durable 55k-file payload took 566s on the
// qualification host. Allow finite headroom for the concurrent scoped sweep.
test('dev-complete-payload-native-probe-and-fresh-installed-manager-inspect', { timeout: 1_800_000 }, async t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'ids-')), runtime = await completeNode22Fixture(), children: ChildProcess[] = [];
  let complete = false;
  let cancel: (() => void) | undefined;
  try {
    const child = spawnFixture(runtime.executable, [realpathSync('src/installer/__tests__/dev-complete-payload-fixture.mjs'), realpathSync('.'), root, runtime.directory],
      { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
    children.push(child); let diagnostic = '';
    child.stdin!.on('error', () => {});
    cancel = () => { child.stdin!.end(); };
    t.signal.addEventListener('abort', cancel, { once: true });
    child.stdout!.resume(); child.stderr!.on('data', data => { diagnostic = (diagnostic + String(data)).slice(-32_768); });
    assert.equal((await once(child, 'close'))[0], 0, diagnostic || `Inspect retained smoke evidence at ${root}`);
    t.signal.throwIfAborted();
    const result = JSON.parse(readFileSync(join(root, 'result.json'), 'utf8'));
    assert.equal(result.kind, 'local-dev-native-smoke'); assert.equal(result.nativeProbe, 'passed'); assert.equal(result.freshManagerInspect, 'passed');
    assert.equal(result.confirmedClosed, true); assert.equal(result.mode, 'dev'); assert.equal(result.nodeVersion, 'v22.22.1');
    assert.ok(result.files > 1000); assert.ok(result.payloadBytes > 10 * 1024 * 1024); assert.equal(result.sourceCommit, result.acceptedCommit);
    t.diagnostic(JSON.stringify(result)); complete = true;
  } finally {
    if (cancel) t.signal.removeEventListener('abort', cancel);
    await stopOwnedChildren(children);
    if (complete) { runtime.cleanup(); rmSync(root, { recursive: true, force: true }); }
    else t.diagnostic(`Failed/uncertain smoke data retained at ${root}; private tooling at ${runtime.directory}`);
  }
});
