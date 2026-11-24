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
const root = mkdtempSync(join(realpathSync(tmpdir()), 'idi-')), children: ChildProcess[] = [];
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
  const child = spawnFixture(join(runtimeDirectory, process.platform === 'win32' ? 'node.exe' : 'bin/node'), [realpathSync('src/installer/__tests__/installed-dev-fixture.mjs'), root, runtimeDirectory, name],
    { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child); let output = '';
  child.stdout!.on('data', data => { output = (output + String(data)).slice(-32_768); }); child.stderr!.on('data', data => { output = (output + String(data)).slice(-32_768); });
  assert.equal((await once(child, 'close'))[0], 0, output);
}
test('dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build', async () => { await scenario('inspect'); });
test('dev-common-handoff-selects-candidate-bootstrap-runtime-and-retains-mode', async () => { await scenario('handoff'); });
test('bundle-offer-receipt-and-required-sibling-admission-regressions-preserved', async () => { await scenario('modes'); });
