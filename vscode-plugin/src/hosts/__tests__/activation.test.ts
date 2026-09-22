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

test('the activation-time host-wire step runs through the guarded runOnboarding sequence (S005 coalescing) and only fires when present hosts exist', () => {
  const entry = readFileSync(join(PKG, 'src', 'extension.ts'), 'utf8');
  // S005: the host-wire offer now runs inside the coalesced runOnboarding sequence
  // (the registry is passed in), not a standalone activation IIFE. offerHostWiring
  // still internally no-ops (no prompt) when no host is present.
  assert.match(entry, /runOnboarding\(\{[^}]*registry[^}]*\}\)/, 'the wire step flows through runOnboarding');
  assert.match(entry, /void \(async \(\) =>[\s\S]*runOnboarding[\s\S]*catch \{/, 'onboarding (incl. the wire step) is fire-and-forget + guarded');
});

test('contributes.commands includes insrc.hosts.wire alongside the S002 daemon entries (palette reachability, k6)', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  const ids = new Set((pkg.contributes?.commands ?? []).map((c: { command: string }) => c.command));
  // Subset check: later stories (S004 workspace register, …) append their own
  // commands to the same array — assert the S002 daemon + S003 wire entries are
  // present, not the exact set.
  for (const id of ['insrc.daemon.install', 'insrc.daemon.start', 'insrc.daemon.stop', 'insrc.daemon.restart', 'insrc.daemon.update', 'insrc.hosts.wire']) {
    assert.ok(ids.has(id), `${id} must stay palette-reachable (k6)`);
  }
});

test('sync-assets bundles the canonical steering block so the steering body ships with the extension', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  assert.match(pkg.scripts?.['sync-assets'] ?? '', /steering-block\.md/, 'sync-assets copies the canonical steering block');
  const source = readFileSync(join(PKG, '..', 'src', 'prompts', 'steering-block.md'));
  const bundled = readFileSync(join(PKG, 'assets', 'steering-block.md'));
  assert.ok(source.equals(bundled), 'assets/steering-block.md byte-matches src/prompts/steering-block.md (run `npm run sync-assets`)');
});
