import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { completeNode22Fixture } from './_runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

test('copied-policy-asset-has-source-bytes-and-loads-from-installed-control', async () => {
  const runtime = await completeNode22Fixture();
  try {
    for (const profile of ['normal', 'slow-vm']) {
      const root = mkdtempSync(join(realpathSync(tmpdir()), 'qi-'));
      const child = spawnFixture(runtime.executable, [realpathSync('src/installer/__tests__/installed-dev-fixture.mjs'), root, runtime.directory, 'profile'],
        { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', INSRC_QUALIFICATION_PROFILE: profile }, stdio: ['ignore', 'pipe', 'pipe'] });
      const children = [child], closed = once(child, 'close'); let output = '';
      child.stdout!.on('data', data => { output = (output + String(data)).slice(-32768); });
      child.stderr!.on('data', data => { output = (output + String(data)).slice(-32768); });
      try { assert.equal((await closed)[0], 0, output); }
      finally { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); }
    }
  } finally { runtime.cleanup(); }
});
