/**
 * Epic ce99b72065d03b1b, Story s3 · t9 — scripts/sync-manifest-catalog.mjs
 * regenerates the manifest's catalog-backed settings from CONFIG_CATALOG and is
 * idempotent: run on a stale copy it reproduces the committed manifest, and a
 * second run (and --check) changes nothing.
 *
 * Run: npx tsx --test vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = join(PLUGIN, 'scripts', 'sync-manifest-catalog.mjs');
const TSX = fileURLToPath(import.meta.resolve('tsx/esm'));

function sync(pkgPath: string, ...args: string[]): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, ['--import', TSX, SCRIPT, ...args], { env: { ...process.env, SYNC_MANIFEST_PKG: pkgPath }, encoding: 'utf8', timeout: 120_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('sync-manifest-catalog.test.ts: the committed manifest is in sync, and the script is idempotent on a stale copy', () => {
  const committed = readFileSync(join(PLUGIN, 'package.json'), 'utf8');
  const check = sync(join(PLUGIN, 'package.json'), '--check');
  assert.equal(check.status, 0, check.out);

  const dir = mkdtempSync(join(tmpdir(), 'sync-manifest-'));
  try {
    const copy = join(dir, 'package.json');
    // Stale: a changed default, a missing key and a retired one.
    const stale = JSON.parse(committed) as { contributes: { configuration: Array<{ title: string; properties: Record<string, Record<string, unknown>> }> } };
    const tiers = stale.contributes.configuration.find((s) => s.title === 'Models — tiers')!;
    tiers.properties['insrc.models.tiers.core.model']!['default'] = '';
    delete tiers.properties['insrc.models.tiers.cheap.effort'];
    stale.contributes.configuration.find((s) => s.title === 'Models — shaper')!.properties['insrc.models.shaper.ollamaNumCtx'] = { type: 'number', default: 32768, scope: 'machine' };
    writeFileSync(copy, JSON.stringify(stale, null, 2) + '\n');

    assert.equal(sync(copy, '--check').status, 1, 'a stale manifest fails --check');
    assert.equal(sync(copy).status, 0);
    const once = JSON.parse(readFileSync(copy, 'utf8')) as unknown;
    assert.deepEqual(once, JSON.parse(committed), 'the stale copy is brought back to the committed manifest');
    const text = readFileSync(copy, 'utf8');
    assert.match(sync(copy).out, /up to date/);
    assert.equal(readFileSync(copy, 'utf8'), text, 'a second run changes nothing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
