import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('client resource sync removes stale installer assets and retains steering and unrelated resources', () => {
  const root = mkdtempSync(join(tmpdir(), 'insrc-client-assets-'));
  try {
    mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'src/prompts'), { recursive: true });
    copyFileSync(new URL('../sync-client-runtime-assets.mjs', import.meta.url), join(root, 'scripts/sync-client-runtime-assets.mjs'));
    writeFileSync(join(root, 'src/prompts/steering-block.md'), 'canonical steering');
    for (const [client, relative] of [['vscode', 'vscode-plugin/assets'], ['jetbrains', 'jetbrains-plugin/build/generated-resources/insrc']]) {
      const assets = join(root, relative!); mkdirSync(assets, { recursive: true });
      for (const name of ['insrc-daemon-install.sh', 'node-runtime-policy.json', 'unrelated.txt']) writeFileSync(join(assets, name), 'old');
      const result = spawnSync(process.execPath, [join(root, 'scripts/sync-client-runtime-assets.mjs'), client!], { encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(join(assets, 'insrc-daemon-install.sh')), false);
      assert.equal(existsSync(join(assets, 'node-runtime-policy.json')), false);
      assert.equal(readFileSync(join(assets, 'steering-block.md'), 'utf8'), 'canonical steering');
      assert.equal(readFileSync(join(assets, 'unrelated.txt'), 'utf8'), 'old');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
