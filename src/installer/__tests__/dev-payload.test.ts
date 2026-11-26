import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { devRuntimeFixture } from './_dev-runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'idp-')), children: ChildProcess[] = [];
after(async () => { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); });
async function scenario(name: string): Promise<void> {
  const target = { os: process.platform as 'darwin' | 'linux' | 'win32', arch: process.arch as 'arm64' | 'x64', baseline: 'controlled-payload' };
  const { runtime: selected } = await devRuntimeFixture(join(root, name[0]!, 'h'), target);
  const node = selected.node, runtime = selected.directory;
  const child = spawnFixture(node, [realpathSync('src/installer/__tests__/dev-payload-fixture.mjs'), root, runtime, name],
    { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child); let output = '';
  child.stdout!.on('data', data => { output = (output + String(data)).slice(-32_768); });
  child.stderr!.on('data', data => { output = (output + String(data)).slice(-32_768); });
  assert.equal((await once(child, 'close'))[0], 0, output);
}
test('staged-dev-payload-requires-all-control-application-assets-and-external-runtime-and-clean-worker-result', async () => { await scenario('complete'); });
test('npm-build-fetch-and-native-probe-failure-preserve-incumbent', async () => { await scenario('failures'); });
test('immutable-dev-payload-tamper-or-existing-id-conflict-refuses-before-shutdown', async () => { await scenario('immutable'); });
test('dev payload flushes its directory tree before prepared and fails closed on fsync error', async () => { await scenario('durability'); });
