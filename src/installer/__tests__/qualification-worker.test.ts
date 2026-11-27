import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { node22Fixture } from './_runtime-fixture.js';
import { devRuntimeFixture } from './_dev-runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

let root: string, executable: Awaited<ReturnType<typeof node22Fixture>>;
before(async () => {
  root = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-worker-budget-'));
  executable = await node22Fixture();
  await devRuntimeFixture(join(root, 'home'), { os: process.platform as 'darwin' | 'linux' | 'win32', arch: process.arch as 'arm64' | 'x64', baseline: 'fixture' }, 'worker-budget');
});
after(() => { executable?.cleanup(); if (root) rmSync(root, { recursive: true, force: true }); });
async function scenario(mode: string): Promise<void> {
  for (const profile of ['normal', 'slow-vm']) {
    const directory = mkdtempSync(join(root, mode));
    const child = spawnFixture(executable.executable,
      [realpathSync('src/installer/__tests__/qualification-worker-fixture.mjs'), directory, join(root, 'home'), mode],
      { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', INSRC_QUALIFICATION_PROFILE: profile }, stdio: ['ignore', 'pipe', 'pipe'] });
    const children = [child], closed = once(child, 'close');
    let output = '';
    child.stdout!.on('data', data => { output += String(data); }); child.stderr!.on('data', data => { output += String(data); });
    try { assert.equal((await closed)[0], 0, output); }
    finally { await stopOwnedChildren(children); }
  }
}
test('child-budget-is-parent-remaining-minus-reserve-after-runtime-setup', async () => { await scenario('remaining'); });
test('parent-cooperative-reserve-covers-worker-drain-and-final-evidence', async () => { await scenario('reserve'); });
test('closed-worker-without-final-proof-cannot-produce-prepared-result', async () => { await scenario('missing-proof'); });
