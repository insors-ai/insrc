/**
 * Story E20260922401ae5fb:S001 / t6 — sc8 seam-discipline source-scans (k1/k2/k3).
 *
 * Structural guards, not behavioural: the ConfigSync core + its boundary modules
 * stay VS-Code-free (only extension.ts imports 'vscode'), and the ConfigGateway
 * reaches the daemon ONLY via the existing config.catalog/config.write IPC — no
 * new daemon method, no cloud/HTTP path.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(HERE, '..');
const SRC_DIR = join(HERE, '..', '..');

const read = (rel: string) => readFileSync(join(CONFIG_DIR, rel), 'utf8');

const CORE_MODULES = ['types.ts', 'key-map.ts', 'sync-engine.ts', 'gateway.ts'];

test("no sc8 config core module imports 'vscode' (only extension.ts may)", () => {
  for (const mod of CORE_MODULES) {
    const src = read(mod);
    assert.doesNotMatch(src, /from ['"]vscode['"]/, `${mod} must not import 'vscode'`);
    assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, `${mod} must not require 'vscode'`);
  }
});

test('the ConfigGateway references only config.catalog + config.write (no new IPC, no cloud/HTTP)', () => {
  const src = read('gateway.ts');
  // The two — and only the two — daemon IPC methods this story is allowed to call.
  const methods = [...src.matchAll(/rpc<[^>]*>\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
  assert.deepEqual(methods, ['config.catalog', 'config.write']);
  // No cloud/HTTP escape hatch in the config seam (k2).
  for (const mod of CORE_MODULES) {
    assert.doesNotMatch(read(mod), /https?:\/\/|fetch\(|undici|node:http/, `${mod} must open no network path`);
  }
});

test("extension.ts wires the activation pull + the onDidChangeConfiguration('insrc') listener to applyChanges", () => {
  const ext = readFileSync(join(SRC_DIR, 'extension.ts'), 'utf8');
  assert.match(ext, /createConfigSyncEngine\(/, 'extension.ts must construct the ConfigSync engine');
  assert.match(ext, /\.pullFromDaemon\(\)/, 'extension.ts must pull on activation');
  assert.match(ext, /onDidChangeConfiguration\(/, 'extension.ts must register the change listener');
  assert.match(ext, /affectsConfiguration\(['"]insrc['"]\)/, "the listener must filter to the 'insrc' section");
  assert.match(ext, /\.applyChanges\(/, 'the listener must drive applyChanges');
  // The machine-scope guarantee is the manifest scope + a user-level (Global) write target;
  // VS Code has no ConfigurationTarget.Machine, so the write must target Global.
  assert.match(ext, /ConfigurationTarget\.Global/, 'the SettingsStore write must target the Global (user) scope');
});
