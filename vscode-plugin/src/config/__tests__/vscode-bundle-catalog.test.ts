/**
 * Epic ce99b72065d03b1b, Story s3 · t9 / s6 · t3 — the VS Code extension type-checks
 * and bundles with esbuild (CJS, node20), and its key map — built from the extension's
 * own manifest since s6, bundled the same way and loaded by a plain node process in a
 * directory with no node_modules — maps every settings-catalog row without carrying the
 * settings catalog or the model definitions file.
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

import { CONFIG_CATALOG } from '../../../../src/config/config-catalog.js';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROOT = join(PLUGIN, '..');

test('vscode-bundle-catalog.test.ts: the extension type-checks and bundles; its key map, loaded without backend node_modules, maps every settings-catalog row without bundling the catalog or the definitions file', { timeout: 600_000 }, async () => {
  // Type-check, as the extension's build and prepublish do.
  const tsc = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(PLUGIN, 'tsconfig.json')], { cwd: PLUGIN, encoding: 'utf8', timeout: 300_000 });
  assert.equal(tsc.status, 0, `${tsc.stdout}${tsc.stderr}`);

  const out = mkdtempSync(join(tmpdir(), 'vscode-bundle-'));
  try {
    // The extension's own bundle step.
    const { bundle } = await import(pathToFileURL(join(PLUGIN, 'esbuild.mjs')).href) as { bundle: (dir: string) => Promise<void> };
    await bundle(join(out, 'ext'));
    assert.ok(existsSync(join(out, 'ext', 'extension.js')));
    // The whole bundle names no Claude or Codex model of the definitions file: tier choices come from the daemon (s6).
    const extension = readFileSync(join(out, 'ext', 'extension.js'), 'utf8');
    const shipped = JSON.parse(readFileSync(join(ROOT, 'src', 'assets', 'models', 'cloud-model-catalog.json'), 'utf8')) as { families: Array<{ cliKind?: string; models: Array<{ id: string; aliases?: string[] }> }> };
    for (const family of shipped.families.filter((f) => f.cliKind !== undefined)) {
      for (const m of family.models) {
        for (const name of [m.id, ...(m.aliases ?? [])]) assert.ok(!extension.includes(`"${name}"`) && !extension.includes(`'${name}'`), `the bundle names '${name}'`);
      }
    }

    // The key map, bundled the same way and loaded by node from a dir without node_modules, maps
    // the manifest's catalog-backed settings without the settings catalog or the definitions file.
    const esbuild = createRequire(join(PLUGIN, 'package.json'))('esbuild') as typeof import('esbuild');
    await esbuild.build({
      stdin: { contents: `export * as keyMap from ${JSON.stringify(join(PLUGIN, 'src', 'config', 'key-map.ts'))};`, resolveDir: PLUGIN, loader: 'ts' },
      bundle: true, platform: 'node', format: 'cjs', target: 'node20', outfile: join(out, 'key-map.cjs'), logLevel: 'silent',
    });
    const bundled = readFileSync(join(out, 'key-map.cjs'), 'utf8');
    assert.doesNotMatch(bundled, /tierDefaults|summariserModel|toolLoopModel/, 'the definitions file is not bundled');
    assert.doesNotMatch(bundled, /buildConfigCatalog|CONFIG_CATALOG/, 'the settings catalog is not bundled');
    const run = spawnSync(process.execPath, ['-e', "const m = require('./key-map.cjs').keyMap; process.stdout.write(JSON.stringify(m.CONFIG_KEY_MAP.entries.map((e) => e.path)))"], {
      cwd: out, encoding: 'utf8', timeout: 60_000, env: { PATH: process.env['PATH'] ?? '', NODE_PATH: '' },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(new Set(JSON.parse(run.stdout) as string[]), new Set(CONFIG_CATALOG.map((o) => o.path)), 'one entry per settings-catalog row');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
