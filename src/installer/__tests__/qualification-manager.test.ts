import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { completeNode22Fixture } from './_runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

test('slow-profile-reaches-real-manager-worker-and-private-npm', async () => {
  const runtime = await completeNode22Fixture();
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-profile-manager-'));
  const child = spawnFixture(runtime.executable,
    ['--import', realpathSync('src/installer/qualification-time-budgets.mjs'), realpathSync('src/installer/__tests__/dev-manager-fixture.mjs'), root, runtime.directory, 'profile'],
    { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', INSRC_QUALIFICATION_PROFILE: 'slow-vm' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const children = [child], closed = once(child, 'close');
  let output = '';
  child.stdout!.on('data', data => { output = (output + String(data)).slice(-32768); });
  child.stderr!.on('data', data => { output = (output + String(data)).slice(-32768); });
  try { assert.equal((await closed)[0], 0, output); }
  finally { await stopOwnedChildren(children); runtime.cleanup(); rmSync(root, { recursive: true, force: true }); }
});
