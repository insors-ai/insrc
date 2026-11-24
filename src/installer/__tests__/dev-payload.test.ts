import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { archiveFixture } from './_runtime-fixture.js';
import { runtimeArchive } from '../runtime-policy.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'idp-')), children: ChildProcess[] = [];
let runtime: string;
before(async () => {
  const archive = await archiveFixture(), identity = runtimeArchive({ os: process.platform as 'darwin' | 'linux' | 'win32', arch: process.arch as 'arm64' | 'x64' });
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const child = process.platform === 'win32'
    ? spawnFixture('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(root)}`], { stdio: 'ignore' })
    : spawnFixture('tar', ['-xzf', archive, '-C', root, `${identity.root}/bin/node`, `${identity.root}/lib/node_modules/npm`, `${identity.root}/include/node`, `${identity.root}/LICENSE`], { stdio: 'ignore' });
  children.push(child); assert.equal((await once(child, 'close'))[0], 0); runtime = join(root, identity.root);
});
after(async () => { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); });
async function scenario(name: string): Promise<void> {
  const node = join(runtime, process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const child = spawnFixture(node, [realpathSync('src/installer/__tests__/dev-payload-fixture.mjs'), root, runtime, name],
    { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child); let output = '';
  child.stdout!.on('data', data => { output = (output + String(data)).slice(-32_768); });
  child.stderr!.on('data', data => { output = (output + String(data)).slice(-32_768); });
  assert.equal((await once(child, 'close'))[0], 0, output);
}
test('staged-dev-payload-requires-all-control-runtime-assets-and-clean-worker-result', async () => { await scenario('complete'); });
test('npm-build-fetch-and-native-probe-failure-preserve-incumbent', async () => { await scenario('failures'); });
test('immutable-dev-payload-tamper-or-existing-id-conflict-refuses-before-shutdown', async () => { await scenario('immutable'); });
test('dev payload flushes its directory tree before prepared and fails closed on fsync error', async () => { await scenario('durability'); });
