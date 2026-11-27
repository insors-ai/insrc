import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { node22Fixture } from './_runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

async function scenario(mode: string): Promise<void> {
  const runtime = await node22Fixture();
  try {
    for (const profile of ['normal', 'slow-vm']) {
      const root = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-runtime-budget-'));
      const child = spawnFixture(runtime.executable,
        [realpathSync('src/installer/__tests__/qualification-runtime-fixture.mjs'), root, mode],
        { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', INSRC_QUALIFICATION_PROFILE: profile }, stdio: ['ignore', 'pipe', 'pipe'] });
      const children = [child], closed = once(child, 'close');
      let output = '';
      child.stdout!.on('data', data => { output += String(data); }); child.stderr!.on('data', data => { output += String(data); });
      try { assert.equal((await closed)[0], 0, output); }
      finally { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); }
    }
  } finally { runtime.cleanup(); }
}
test('slow-vm-runtime-download-verification-and-decoder-drain-have-no-hidden-normal-cap', async () => { await scenario('timers'); });
test('profile-never-waives-positive-resource-or-process-closure', async () => { await scenario('closure'); });
test('normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged', async () => { await scenario('compatibility'); });
