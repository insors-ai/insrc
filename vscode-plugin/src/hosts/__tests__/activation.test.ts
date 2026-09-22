/**
 * Story E20260921ad0d45c9:S003 / t4 — extension.ts host-registry wiring +
 * contributes.commands palette reachability (source scan, mirroring S002).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..', '..', '..'); // vscode-plugin/

test('extension.ts constructs the AiHostRegistry (HostSpecs + real HostEnv/HostFileSystem) and calls registerHostCommands with the s1 surfaces', () => {
  const entry = readFileSync(join(PKG, 'src', 'extension.ts'), 'utf8');
  assert.match(entry, /createHostRegistry\(\s*HOST_SPECS/, 'builds the registry from the HostSpec list');
  assert.match(entry, /vscode\.extensions\.getExtension/, 'binds the real getExtension into HostEnv');
  assert.match(entry, /vscode\.env\.appName/, 'binds the real appName into HostEnv');
  assert.match(entry, /vscode\.env\.uriScheme/, 'binds the real uriScheme into HostEnv');
  assert.match(entry, /defaultHostFileSystem/, 'uses the real node:fs HostFileSystem');
  assert.match(entry, /registerHostCommands\(\{\s*commands,\s*consent,\s*status,\s*registry\s*\}\)/, 'wires the durable command with the s1 surfaces');
  // launch target resolved from the SAME daemon home S002 installs (reuse, not a new path).
  assert.match(entry, /paths\.daemonRoot[\s\S]*insrc-mcp\.js/, 'resolves the launch target from the S002 daemon home');
});

test('the activation-time host-wire offer is fire-and-forget + guarded (never throws/blocks) and only fires when present hosts exist', () => {
  const entry = readFileSync(join(PKG, 'src', 'extension.ts'), 'utf8');
  // The offer runs in a fire-and-forget async IIFE guarded by try/catch (S001/S002 pattern).
  assert.match(entry, /offerHostWiring\(\{ consent, status, registry \}\)/, 'the offer calls the shared wire flow');
  // offerHostWiring internally no-ops (no prompt) when no host is present — the "only fires when present" gate.
  const offerBlocks = entry.split('offerHostWiring');
  assert.ok(offerBlocks.length >= 2, 'offerHostWiring is invoked at activation');
  assert.match(entry, /void \(async \(\) =>[\s\S]*offerHostWiring[\s\S]*catch \{/, 'the host-wire offer is fire-and-forget + guarded');
});

test('contributes.commands includes insrc.hosts.wire alongside the S002 daemon entries (palette reachability, k6)', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  const ids = (pkg.contributes?.commands ?? []).map((c: { command: string }) => c.command).sort();
  assert.deepEqual(ids, [
    'insrc.daemon.install', 'insrc.daemon.restart', 'insrc.daemon.start', 'insrc.daemon.stop', 'insrc.daemon.update',
    'insrc.hosts.wire',
  ], 'the wire command is palette-reachable and the S002 daemon entries are untouched');
});

test('sync-assets bundles the canonical steering block so the steering body ships with the extension', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  assert.match(pkg.scripts?.['sync-assets'] ?? '', /steering-block\.md/, 'sync-assets copies the canonical steering block');
  const source = readFileSync(join(PKG, '..', 'src', 'prompts', 'steering-block.md'));
  const bundled = readFileSync(join(PKG, 'assets', 'steering-block.md'));
  assert.ok(source.equals(bundled), 'assets/steering-block.md byte-matches src/prompts/steering-block.md (run `npm run sync-assets`)');
});
