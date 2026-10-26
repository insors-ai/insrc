/**
 * Epic ce99b72065d03b1b, Story s3 · t9 — the VS Code extension carries the
 * definitions-backed settings catalog: it type-checks with the JSON-backed
 * catalog (resolveJsonModule), bundles with esbuild (CJS, node20), and the
 * catalog the extension's key map reads — bundled the same way and loaded by a
 * plain node process in a directory with no node_modules — has the defaults
 * buildConfigCatalog gives over the shipped definitions file.
 *
 * Run: npx tsx --test vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildConfigCatalog } from '../../../../src/config/config-catalog.js';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROOT = join(PLUGIN, '..');

test('vscode-bundle-catalog.test.ts: the extension type-checks and bundles; loaded without backend node_modules its catalog defaults equal buildConfigCatalog(shipped)', { timeout: 600_000 }, async () => {
  // Type-check, as the extension's build and prepublish do.
  const tsc = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(PLUGIN, 'tsconfig.json')], { cwd: PLUGIN, encoding: 'utf8', timeout: 300_000 });
  assert.equal(tsc.status, 0, `${tsc.stdout}${tsc.stderr}`);

  const out = mkdtempSync(join(tmpdir(), 'vscode-bundle-'));
  try {
    // The extension's own bundle step.
    const { bundle } = await import(pathToFileURL(join(PLUGIN, 'esbuild.mjs')).href) as { bundle: (dir: string) => Promise<void> };
    await bundle(join(out, 'ext'));
    assert.ok(existsSync(join(out, 'ext', 'extension.js')));

    // The key map's catalog, bundled with the same options, loaded by node from a dir without node_modules.
    const esbuild = createRequire(join(PLUGIN, 'package.json'))('esbuild') as typeof import('esbuild');
    await esbuild.build({
      stdin: {
        contents: `export * as keyMap from ${JSON.stringify(join(PLUGIN, 'src', 'config', 'key-map.ts'))};\nexport { CONFIG_CATALOG } from ${JSON.stringify(join(ROOT, 'src', 'config', 'config-catalog.ts'))};`,
        resolveDir: PLUGIN, loader: 'ts',
      },
      bundle: true, platform: 'node', format: 'cjs', target: 'node20', outfile: join(out, 'catalog.cjs'), logLevel: 'silent',
    });
    const run = spawnSync(process.execPath, ['-e', "process.stdout.write(JSON.stringify(require('./catalog.cjs').CONFIG_CATALOG))"], {
      cwd: out, encoding: 'utf8', timeout: 60_000, env: { PATH: process.env['PATH'] ?? '', NODE_PATH: '' },
    });
    assert.equal(run.status, 0, run.stderr);
    const shipped = JSON.parse(readFileSync(join(ROOT, 'src', 'assets', 'models', 'cloud-model-catalog.json'), 'utf8'));
    assert.deepEqual(JSON.parse(run.stdout), JSON.parse(JSON.stringify(buildConfigCatalog(shipped))));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
