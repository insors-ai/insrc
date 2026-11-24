import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { archiveFixture } from './_runtime-fixture.js';
import { runtimeArchive } from '../runtime-policy.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
const root = mkdtempSync(join(realpathSync(tmpdir()), 'idr-')), children: ChildProcess[] = [];
let runtimeDirectory: string;
before(async () => {
  const archive = await archiveFixture(), identity = runtimeArchive({ os: process.platform as 'darwin' | 'linux' | 'win32', arch: process.arch as 'arm64' | 'x64' });
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const child = process.platform === 'win32' ? spawnFixture('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(root)}`], { stdio: 'ignore' })
    : spawnFixture('tar', ['-xzf', archive, '-C', root, `${identity.root}/bin/node`, `${identity.root}/lib/node_modules/npm`, `${identity.root}/include/node`, `${identity.root}/LICENSE`], { stdio: 'ignore' });
  children.push(child); assert.equal((await once(child, 'close'))[0], 0); runtimeDirectory = join(root, identity.root);
});
after(async () => { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); });
async function scenario(name: string): Promise<void> {
  const child = spawnFixture(join(runtimeDirectory, process.platform === 'win32' ? 'node.exe' : 'bin/node'), [realpathSync('src/installer/__tests__/dev-recovery-fixture.mjs'), root, runtimeDirectory, name],
    { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child); let diagnostic = '';
  child.stdout!.resume(); child.stderr!.on('data', data => { diagnostic = (diagnostic + String(data)).slice(-32_768); });
  assert.equal((await once(child, 'close'))[0], 0, diagnostic);
}
test('manager-self-exit-before-candidate-recovers-same-source-with-no-duplicate-worker', async () => { await scenario('prepared'); await scenario('failed'); });
test('held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup', async () => { await scenario('unknown'); });
test('published-release-before-candidate-record-reconciles-without-rebuild', async () => { await scenario('published'); });
test('cancel-or-terminal-eof-drains-owned-preparation-actors-before-return', async () => { await scenario('cancel'); });
